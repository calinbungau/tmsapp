import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getTraccarDevices,
  getTraccarPositions,
  type TraccarCredentials,
  type TraccarDevice,
} from "@/lib/traccar";

// Cache devices list -- it rarely changes (new vehicles are added infrequently)
// This avoids hitting Traccar with /api/devices on every poll (every 60s)
const deviceCache = new Map<string, { devices: TraccarDevice[]; fetchedAt: number }>();
const DEVICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
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
    return NextResponse.json({ error: "Traccar not configured", configured: false }, { status: 200 });
  }

  const credentials: TraccarCredentials = {
    serverUrl: admin.traccar_server_url,
    email: admin.traccar_email,
    password: admin.traccar_password,
  };

  try {
    // Get devices (cached) and positions from Traccar
    // Devices are cached for 5 min to reduce load -- they rarely change
    let devices: TraccarDevice[] = [];
    let positions: Awaited<ReturnType<typeof getTraccarPositions>> = [];
    const cacheKey = `${credentials.serverUrl}:${credentials.email}`;
    try {
      const cached = deviceCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < DEVICE_CACHE_TTL) {
        // Use cached devices, only fetch positions (1 request instead of 2)
        devices = cached.devices;
        positions = await getTraccarPositions(credentials);
      } else {
        // Fetch both, but sequentially to avoid overwhelming the server
        devices = await getTraccarDevices(credentials);
        deviceCache.set(cacheKey, { devices, fetchedAt: Date.now() });
        positions = await getTraccarPositions(credentials);
      }
    } catch (traccarError) {
      // Traccar server is temporarily unavailable (503, timeout, etc.)
      // Return empty vehicles list so the UI doesn't break
      console.warn("Traccar server unavailable:", traccarError instanceof Error ? traccarError.message : traccarError);
      return NextResponse.json({ vehicles: [], configured: true, traccar_unavailable: true });
    }

    // Get all vehicles with traccar_device_id for this admin
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, plate_number, model, traccar_device_id")
      .eq("admin_id", adminId)
      .not("traccar_device_id", "is", null);

    // Get all trailers with traccar_device_id for this admin
    const { data: trailers } = await supabase
      .from("trailers")
      .select("id, plate_number, trailer_type, traccar_device_id")
      .eq("admin_id", adminId)
      .not("traccar_device_id", "is", null);

    if ((!vehicles || vehicles.length === 0) && (!trailers || trailers.length === 0)) {
      return NextResponse.json({ vehicles: [], trailers: [], configured: true });
    }

    // Get active sessions for these vehicles to show driver info
    const { data: activeSessions } = await supabase
      .from("vehicle_usage_sessions")
      .select(`
        id,
        driver_id,
        vehicle_id,
        check_in_time,
        check_in_latitude,
        check_in_longitude,
        driver:drivers(name)
      `)
      .eq("admin_id", adminId)
      .eq("status", "active");

    // Create a map of vehicle_id to active session
    const sessionMap = new Map<string, { 
      id: string; 
      driver_id: string; 
      check_in_time: string; 
      check_in_latitude: number | null;
      check_in_longitude: number | null;
      driver: { name: string } | null;
    }>();
    activeSessions?.forEach((session) => {
      sessionMap.set(session.vehicle_id, {
        id: session.id,
        driver_id: session.driver_id,
        check_in_time: session.check_in_time,
        check_in_latitude: session.check_in_latitude,
        check_in_longitude: session.check_in_longitude,
        driver: session.driver as { name: string } | null,
      });
    });

    // Map positions to vehicles - show all vehicles with GPS, regardless of check-in status
    const vehiclePositions = vehicles
      .map((vehicle) => {
        const deviceId = Number(vehicle.traccar_device_id);
        const position = positions.find((p) => p.deviceId === deviceId);
        const device = devices.find((d) => d.id === deviceId);
        const session = sessionMap.get(vehicle.id);

        if (!position) return null;

        const attrs = position.attributes || {};
        return {
          id: vehicle.id,
          vehicle_id: vehicle.id,
          vehicle_plate: vehicle.plate_number,
          vehicle_model: vehicle.model,
          driver_name: session?.driver?.name || "Not assigned",
          driver_id: session?.driver_id || null,
          check_in_time: session?.check_in_time || null,
          check_in_latitude: session?.check_in_latitude || null,
          check_in_longitude: session?.check_in_longitude || null,
          latitude: position.latitude,
          longitude: position.longitude,
          speed: Math.round(position.speed * 1.852), // Convert knots to km/h
          course: position.course || 0, // Bearing in degrees (0-360)
          ignition: attrs.ignition === true,
          motion: attrs.motion === true,
          last_update: position.deviceTime,
          device_status: device?.status || "unknown",
          // Rich attributes from Traccar
          address: position.address || null,
          totalDistance: attrs.totalDistance ? Math.round(Number(attrs.totalDistance) / 1000) : null, // meters -> km
          engineHours: attrs.hours ? Math.round(Number(attrs.hours) / (1000 * 60 * 60)) : null, // ms -> hours
          fuel: attrs.fuel != null ? Number(attrs.fuel) : null,
          battery: attrs.battery != null ? Number(attrs.battery) : null,
          power: attrs.power != null ? Number(attrs.power) : null,
          satellites: attrs.sat != null ? Number(attrs.sat) : null,
          driverUniqueId: attrs.driverUniqueId ? String(attrs.driverUniqueId) : null,
          driverWorkingState: attrs.driverWorkingState ? String(attrs.driverWorkingState) : null,
          driver2WorkingState: attrs.driver2WorkingState ? String(attrs.driver2WorkingState) : null,
          lastParked: attrs.lastParked ? String(attrs.lastParked) : null,
          traccar_device_id: vehicle.traccar_device_id,
          groupId: device?.groupId ?? 0,
          geofenceIds: device?.geofenceIds ?? [],
        };
      })
      .filter(Boolean);

    // Map positions to trailers
    const trailerPositions = (trailers || [])
      .map((trailer) => {
        const deviceId = Number(trailer.traccar_device_id);
        const position = positions.find((p) => p.deviceId === deviceId);
        const device = devices.find((d) => d.id === deviceId);

        if (!position) return null;

        const attrs = position.attributes || {};
        return {
          id: trailer.id,
          trailer_id: trailer.id,
          trailer_plate: trailer.plate_number,
          trailer_type: trailer.trailer_type,
          asset_type: "trailer" as const,
          latitude: position.latitude,
          longitude: position.longitude,
          speed: Math.round(position.speed * 1.852), // Convert knots to km/h
          course: position.course || 0,
          ignition: attrs.ignition === true,
          motion: attrs.motion === true,
          last_update: position.deviceTime,
          device_status: device?.status || "unknown",
          address: position.address || null,
          totalDistance: attrs.totalDistance ? Math.round(Number(attrs.totalDistance) / 1000) : null,
          battery: attrs.battery != null ? Number(attrs.battery) : null,
          power: attrs.power != null ? Number(attrs.power) : null,
          satellites: attrs.sat != null ? Number(attrs.sat) : null,
          traccar_device_id: trailer.traccar_device_id,
          groupId: device?.groupId ?? 0,
          geofenceIds: device?.geofenceIds ?? [],
        };
      })
      .filter(Boolean);

    return NextResponse.json({ vehicles: vehiclePositions, trailers: trailerPositions, configured: true });
  } catch (error) {
    console.error("GPS positions API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GPS API error", configured: true },
      { status: 500 }
    );
  }
}
