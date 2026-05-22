import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Lightweight vehicle listing -- just plate, id, traccar_device_id, group info */
export async function GET(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");

  if (!adminId) {
    return NextResponse.json({ error: "adminId required" }, { status: 400 });
  }

  // Get admin Traccar credentials for group info
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  // Get vehicles from Supabase
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, plate_number, make, model, traccar_device_id")
    .eq("admin_id", adminId)
    .not("traccar_device_id", "is", null)
    .order("plate_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If Traccar configured, get device -> group mapping
  let deviceGroupMap = new Map<number, number>();
  let groups: Array<{ id: number; name: string }> = [];

  if (admin?.traccar_server_url && admin?.traccar_email && admin?.traccar_password) {
    const authHeader = `Basic ${Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64")}`;
    try {
      const [devicesRes, groupsRes] = await Promise.all([
        fetch(`${admin.traccar_server_url}/api/devices`, {
          headers: { Authorization: authHeader, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        }),
        fetch(`${admin.traccar_server_url}/api/groups`, {
          headers: { Authorization: authHeader, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        }),
      ]);

      if (devicesRes.ok) {
        const devices: Array<{ id: number; groupId: number }> = await devicesRes.json();
        for (const d of devices) {
          if (d.groupId) deviceGroupMap.set(d.id, d.groupId);
        }
      }
      if (groupsRes.ok) {
        groups = await groupsRes.json();
      }
    } catch { /* silent */ }
  }

  const result = (vehicles || []).map((v) => ({
    id: v.id,
    plate: v.plate_number,
    brand: v.make,
    model: v.model,
    traccarDeviceId: v.traccar_device_id,
    groupId: v.traccar_device_id ? deviceGroupMap.get(Number(v.traccar_device_id)) || 0 : 0,
  }));

  return NextResponse.json({ vehicles: result, groups });
}
