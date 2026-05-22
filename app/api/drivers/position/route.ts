import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Position update error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
