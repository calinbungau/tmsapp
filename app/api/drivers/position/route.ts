import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processDriverPosition } from "@/lib/tms/auto-checkin";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const body = await request.json();
    const { driver_id, latitude, longitude, accuracy, speed, heading, altitude, battery, is_moving } = body;

    if (!driver_id || latitude == null || longitude == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update driver's current position
    await supabase
      .from("drivers")
      .update({
        last_lat: latitude,
        last_lng: longitude,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", driver_id);

    // Insert position history
    await supabase.from("driver_positions").insert({
      driver_id,
      lat: latitude,
      lng: longitude,
      accuracy,
      speed,
      heading,
      altitude,
      battery_level: battery,
      is_moving,
    });

    // Run the geofence engine for this fix. We deliberately await it so
    // the caller knows whether anything was triggered, but it's wrapped
    // in try/catch so a bug in the geofence logic never breaks the
    // primary purpose of the endpoint (recording the position).
    let geofence: { enters: number; exits: number } | null = null;
    try {
      geofence = await processDriverPosition({
        supabase,
        driverId: driver_id,
        lat: latitude,
        lng: longitude,
      });
    } catch (geoErr: any) {
      console.error("[v0] geofence error:", geoErr?.message || geoErr);
    }

    return NextResponse.json({ ok: true, geofence });
  } catch (err: any) {
    console.error("Position update error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
