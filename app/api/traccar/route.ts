import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getTraccarDevices,
  getTraccarPositions,
  metersToKm,
  msToHours,
  type TraccarCredentials,
} from "@/lib/traccar";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");
  const adminId = searchParams.get("adminId");

  if (!adminId) {
    return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
  }

  // Get admin's Traccar credentials
  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (adminError || !admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  if (!admin.traccar_server_url || !admin.traccar_email || !admin.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const credentials: TraccarCredentials = {
    serverUrl: admin.traccar_server_url,
    email: admin.traccar_email,
    password: admin.traccar_password,
  };

  try {
    if (action === "devices") {
      // Get all devices
      const devices = await getTraccarDevices(credentials);
      return NextResponse.json({ devices });
    }

    if (action === "positions") {
      // Get positions for all devices or specific device
      const deviceId = searchParams.get("deviceId");
      const positions = await getTraccarPositions(
        credentials,
        deviceId ? parseInt(deviceId) : undefined
      );

      // Convert to more useful format
      const formattedPositions = positions.map((p) => ({
        deviceId: p.deviceId,
        latitude: p.latitude,
        longitude: p.longitude,
        speed: p.speed,
        totalDistance: p.attributes.totalDistance
          ? metersToKm(p.attributes.totalDistance)
          : null, // in km
        engineHours: p.attributes.hours
          ? msToHours(p.attributes.hours)
          : null, // in hours
        fuel: p.attributes.fuel,
        ignition: p.attributes.ignition === true,
        lastUpdate: p.deviceTime,
      }));

      return NextResponse.json({ positions: formattedPositions });
    }

    if (action === "vehicle-data") {
      // Get data for a specific vehicle by device ID
      const deviceId = searchParams.get("deviceId");
      if (!deviceId) {
        return NextResponse.json({ error: "Device ID required" }, { status: 400 });
      }

      const positions = await getTraccarPositions(credentials, parseInt(deviceId));
      const position = positions.find((p) => p.deviceId === parseInt(deviceId));

      if (!position) {
        return NextResponse.json({ error: "Position not found" }, { status: 404 });
      }

      return NextResponse.json({
        deviceId: position.deviceId,
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        totalDistance: position.attributes.totalDistance
          ? metersToKm(position.attributes.totalDistance)
          : null,
        engineHours: position.attributes.hours
          ? msToHours(position.attributes.hours)
          : null,
        fuel: position.attributes.fuel,
        ignition: position.attributes.ignition === true,
        lastUpdate: position.deviceTime,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Traccar API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Traccar API error" },
      { status: 500 }
    );
  }
}
