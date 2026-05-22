import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const adminId = searchParams.get("adminId");
  const vehicleId = searchParams.get("vehicleId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!adminId || !vehicleId || !from || !to) {
    return NextResponse.json(
      { error: "Missing required params: adminId, vehicleId, from, to" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get admin Traccar credentials
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  // Get vehicle's traccar_device_id
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("traccar_device_id, plate_number")
    .eq("id", vehicleId)
    .eq("admin_id", adminId)
    .single();

  if (!vehicle?.traccar_device_id) {
    return NextResponse.json({ error: "Vehicle has no GPS device" }, { status: 400 });
  }

  const authHeader = `Basic ${Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64")}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s for history (can be large)

  try {
    // Fetch historical positions from Traccar
    // The API endpoint is /api/positions with from/to query params
    const url = new URL(`${admin.traccar_server_url}/api/positions`);
    url.searchParams.set("deviceId", String(vehicle.traccar_device_id));
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Traccar returned ${res.status}: ${res.statusText}`);
    }

    const positions: Array<{
      id: number;
      deviceId: number;
      deviceTime: string;
      fixTime: string;
      latitude: number;
      longitude: number;
      altitude: number;
      speed: number; // knots
      course: number;
      address: string | null;
      attributes: {
        totalDistance?: number;
        ignition?: boolean;
        motion?: boolean;
        [key: string]: unknown;
      };
    }> = await res.json();

    // Convert speed from knots to km/h and structure
    const cleaned = positions
      .filter((p) => p.latitude !== 0 && p.longitude !== 0)
      .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime())
      .map((p) => ({
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
        speed: Math.round(p.speed * 1.852), // knots -> km/h
        course: p.course || 0,
        address: p.address || null,
        time: p.deviceTime,
        ignition: p.attributes?.ignition ?? null,
        motion: p.attributes?.motion ?? null,
        totalDistance: p.attributes?.totalDistance
          ? Math.round((p.attributes.totalDistance as number) / 1000) // meters -> km
          : null,
      }));

    return NextResponse.json({
      positions: cleaned,
      plate_number: vehicle.plate_number,
      device_id: vehicle.traccar_device_id,
    });
  } catch (err) {
    console.error("Route history error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch route history",
        traccar_unavailable: true,
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
