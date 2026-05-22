// Historical Traccar position fetcher for a single GPS-equipped asset
// (vehicle OR trailer). This powers the Advanced Reports → Door/Temp by
// Virtual Sensor workflow, where the user selects an asset and a date
// range, and we attach the asset's location to each row of the report.
//
// The existing /api/traccar/route-history endpoint only accepts a
// vehicleId. Rather than overload it (and risk regressions in the route
// preview / live tracking flows that depend on its current shape), this
// endpoint is purpose-built for the reports flow and accepts either
// `vehicleId` or `trailerId` (mutually exclusive).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface TraccarPosition {
  id: number;
  deviceId: number;
  deviceTime: string;
  fixTime: string;
  latitude: number;
  longitude: number;
  speed: number; // knots
  course: number;
  address: string | null;
  attributes?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const adminId = searchParams.get("adminId");
  const vehicleId = searchParams.get("vehicleId");
  const trailerId = searchParams.get("trailerId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!adminId || !from || !to || (!vehicleId && !trailerId)) {
    return NextResponse.json(
      { error: "Missing required params: adminId, from, to, and one of vehicleId/trailerId" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Admin's Traccar credentials are needed to talk to the upstream API.
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  // Resolve the chosen asset to a traccar_device_id + plate label.
  let plate: string | null = null;
  let traccarDeviceId: string | null = null;
  let assetType: "vehicle" | "trailer" = "vehicle";

  if (vehicleId) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("traccar_device_id, plate_number")
      .eq("id", vehicleId)
      .eq("admin_id", adminId)
      .single();
    if (!v?.traccar_device_id) {
      return NextResponse.json({ error: "Vehicle has no GPS device" }, { status: 400 });
    }
    plate = v.plate_number;
    traccarDeviceId = String(v.traccar_device_id);
  } else if (trailerId) {
    assetType = "trailer";
    const { data: t } = await supabase
      .from("trailers")
      .select("traccar_device_id, plate_number")
      .eq("id", trailerId)
      .eq("admin_id", adminId)
      .single();
    if (!t?.traccar_device_id) {
      return NextResponse.json({ error: "Trailer has no GPS device" }, { status: 400 });
    }
    plate = t.plate_number;
    traccarDeviceId = String(t.traccar_device_id);
  }

  const authHeader = `Basic ${Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64")}`;
  const controller = new AbortController();
  // 20s — historical queries over long ranges (e.g. a full week) can be slow.
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const url = new URL(`${admin.traccar_server_url}/api/positions`);
    url.searchParams.set("deviceId", traccarDeviceId!);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);

    const res = await fetch(url.toString(), {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Traccar returned ${res.status}: ${res.statusText}`);
    }

    const positions: TraccarPosition[] = await res.json();

    // Filter junk fixes (0,0) and sort chronologically. The caller will
    // bucket these into the report's step intervals.
    const cleaned = positions
      .filter((p) => p.latitude !== 0 && p.longitude !== 0)
      .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime())
      .map((p) => ({
        time: p.deviceTime,
        lat: p.latitude,
        lng: p.longitude,
        speed: Math.round(p.speed * 1.852), // knots → km/h
        address: p.address || null,
      }));

    return NextResponse.json({
      asset_type: assetType,
      plate_number: plate,
      positions: cleaned,
    });
  } catch (err) {
    console.error("[v0] asset-history error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch asset history",
        traccar_unavailable: true,
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
