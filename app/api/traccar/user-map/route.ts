import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getAuthHeader(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

// GET: Fetch the current Traccar user's map preference
export async function GET(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = getAuthHeader(admin.traccar_email, admin.traccar_password);

  try {
    // Traccar /api/session requires POST to create/get session (GET returns 404 with Basic Auth)
    const res = await fetch(`${admin.traccar_server_url}/api/session`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ email: admin.traccar_email, password: admin.traccar_password }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar ${res.status}`);
    const user = await res.json();
    return NextResponse.json({
      map: user.map || "googleRoad",
      userId: user.id,
      latitude: user.latitude,
      longitude: user.longitude,
      zoom: user.zoom,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed", map: "googleRoad" }, { status: 502 });
  }
}

// PUT: Update the Traccar user's map preference
export async function PUT(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = getAuthHeader(admin.traccar_email, admin.traccar_password);
  const { map: mapPref, userId } = await request.json();

  try {
    // First get the full user object via POST session
    const sessionRes = await fetch(`${admin.traccar_server_url}/api/session`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ email: admin.traccar_email, password: admin.traccar_password }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!sessionRes.ok) throw new Error(`Traccar session ${sessionRes.status}`);
    const user = await sessionRes.json();

    // Update with the new map preference
    const res = await fetch(`${admin.traccar_server_url}/api/users/${userId || user.id}`, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...user, map: mapPref }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar update ${res.status}`);
    const updated = await res.json();
    return NextResponse.json({ map: updated.map });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
