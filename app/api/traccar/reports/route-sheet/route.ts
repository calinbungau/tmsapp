import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

export const runtime = "nodejs";
export const maxDuration = 60; // Can be heavy for multi-device

/**
 * Route Sheet (Foaie de Parcurs) report
 * Uses Traccar /api/positions to get raw position data (same as History page),
 * then processes it into trips by detecting ignition on/off & motion stops.
 *
 * Query: ?adminId=X&vehicleIds=1,2,3&from=ISO&to=ISO
 * Returns: { devices: [{ vehicleId, plate, trips: [...], summary: {...} }] }
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const sp = request.nextUrl.searchParams;
  const adminId = sp.get("adminId");
  const vehicleIdsRaw = sp.get("vehicleIds"); // comma-separated supabase vehicle UUIDs
  const from = sp.get("from");
  const to = sp.get("to");

  if (!adminId || !vehicleIdsRaw || !from || !to) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  // Get admin Traccar credentials
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = `Basic ${Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64")}`;
  const vehicleIds = vehicleIdsRaw.split(",").map(v => v.trim()).filter(Boolean);

  // Get vehicle info from Supabase
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate_number, traccar_device_id, make, model")
    .eq("admin_id", adminId)
    .in("id", vehicleIds);

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ error: "No vehicles found" }, { status: 404 });
  }

  const results = [];

  for (const vehicle of vehicles) {
    if (!vehicle.traccar_device_id) continue;

    try {
      // Fetch positions from Traccar (same endpoint as History page)
      const url = new URL(`${admin.traccar_server_url}/api/positions`);
      url.searchParams.set("deviceId", String(vehicle.traccar_device_id));
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);

      const res = await fetch(url.toString(), {
        headers: { Authorization: authHeader, Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        results.push({
          vehicleId: vehicle.id,
          plate: vehicle.plate_number,
          brand: vehicle.make,
          model: vehicle.model,
          error: `Traccar error ${res.status}`,
          trips: [],
          summary: null,
        });
        continue;
      }

      const positions: Array<{
        id: number;
        deviceId: number;
        deviceTime: string;
        latitude: number;
        longitude: number;
        speed: number; // knots
        course: number;
        address: string | null;
        attributes: {
          totalDistance?: number;
          ignition?: boolean;
          motion?: boolean;
          hours?: number;
          [key: string]: unknown;
        };
      }> = await res.json();

      // Sort by time
      const sorted = positions
        .filter(p => p.latitude !== 0 && p.longitude !== 0)
        .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());

      // Process positions into trips
      // A trip starts when ignition turns on (or motion starts) and ends when ignition turns off (or motion stops for > 5 min)
      const trips = extractTrips(sorted);

      // Calculate summary
      const summary = calculateSummary(trips);

      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        trips,
        summary,
        positionCount: sorted.length,
      });
    } catch (err) {
      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        error: err instanceof Error ? err.message : "Unknown error",
        trips: [],
        summary: null,
      });
    }
  }

  return NextResponse.json({ devices: results, from, to });
}

interface Trip {
  startTime: string;
  endTime: string;
  startAddress: string;
  endAddress: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distance: number; // meters
  duration: number; // ms
  maxSpeed: number; // km/h
  averageSpeed: number; // km/h
  idleDuration: number; // ms (time with ignition on but no motion)
  ignitionOn: number; // ms (total ignition-on time)
}

interface TripSummary {
  totalTrips: number;
  totalDistance: number; // meters
  totalDuration: number; // ms
  totalIdleDuration: number; // ms
  totalIgnitionOn: number; // ms
  averageSpeed: number; // km/h
  maxSpeed: number; // km/h
}

function extractTrips(positions: Array<{
  deviceTime: string;
  latitude: number;
  longitude: number;
  speed: number;
  address: string | null;
  attributes: { ignition?: boolean; motion?: boolean; totalDistance?: number; [key: string]: unknown };
}>): Trip[] {
  if (positions.length < 2) return [];

  const trips: Trip[] = [];
  let tripStart: typeof positions[0] | null = null;
  let tripPositions: typeof positions = [];
  let lastMotionTime: number | null = null;
  const STOP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes of no motion = end of trip

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const speedKmh = pos.speed * 1.852;
    const isMoving = pos.attributes?.motion === true || speedKmh > 2;
    const ignitionOn = pos.attributes?.ignition !== false; // default true if not reported

    if (isMoving) {
      lastMotionTime = new Date(pos.deviceTime).getTime();
      if (!tripStart) {
        tripStart = pos;
        tripPositions = [pos];
      } else {
        tripPositions.push(pos);
      }
    } else if (tripStart) {
      tripPositions.push(pos);
      const now = new Date(pos.deviceTime).getTime();
      if (lastMotionTime && (now - lastMotionTime) > STOP_THRESHOLD_MS) {
        // End trip
        const trip = buildTrip(tripStart, tripPositions, lastMotionTime);
        if (trip.distance > 100) { // only include trips > 100m
          trips.push(trip);
        }
        tripStart = null;
        tripPositions = [];
        lastMotionTime = null;
      }
    }
  }

  // Close any open trip
  if (tripStart && tripPositions.length > 1) {
    const lastTime = lastMotionTime || new Date(tripPositions[tripPositions.length - 1].deviceTime).getTime();
    const trip = buildTrip(tripStart, tripPositions, lastTime);
    if (trip.distance > 100) {
      trips.push(trip);
    }
  }

  return trips;
}

function buildTrip(
  start: { deviceTime: string; latitude: number; longitude: number; address: string | null },
  positions: Array<{
    deviceTime: string; latitude: number; longitude: number; speed: number;
    address: string | null;
    attributes: { ignition?: boolean; motion?: boolean; totalDistance?: number; [key: string]: unknown };
  }>,
  lastMotionTime: number
): Trip {
  const end = positions[positions.length - 1];
  const startMs = new Date(start.deviceTime).getTime();
  const endMs = new Date(end.deviceTime).getTime();

  // Calculate distance from totalDistance attribute or approximate from positions
  let distance = 0;
  const firstDist = positions[0]?.attributes?.totalDistance || 0;
  const lastDist = positions[positions.length - 1]?.attributes?.totalDistance || 0;
  if (lastDist > firstDist) {
    distance = lastDist - firstDist;
  } else {
    // Approximate from positions using Haversine
    for (let i = 1; i < positions.length; i++) {
      distance += haversineMeters(
        positions[i - 1].latitude, positions[i - 1].longitude,
        positions[i].latitude, positions[i].longitude
      );
    }
  }

  // Speed calculations
  const speeds = positions.map(p => p.speed * 1.852).filter(s => s > 0);
  const maxSpeed = speeds.length > 0 ? Math.round(Math.max(...speeds)) : 0;
  const durationMs = endMs - startMs;
  const durationH = durationMs / (1000 * 60 * 60);
  const avgSpeed = durationH > 0 ? Math.round((distance / 1000) / durationH) : 0;

  // Idle time (ignition on, not moving)
  let idleMs = 0;
  let ignitionOnMs = 0;
  for (let i = 1; i < positions.length; i++) {
    const dt = new Date(positions[i].deviceTime).getTime() - new Date(positions[i - 1].deviceTime).getTime();
    const isMoving = positions[i].attributes?.motion === true || (positions[i].speed * 1.852) > 2;
    const ignOn = positions[i].attributes?.ignition !== false;
    if (ignOn) {
      ignitionOnMs += dt;
      if (!isMoving) {
        idleMs += dt;
      }
    }
  }

  return {
    startTime: start.deviceTime,
    endTime: end.deviceTime,
    startAddress: start.address || `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}`,
    endAddress: end.address || `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}`,
    startLat: start.latitude,
    startLng: start.longitude,
    endLat: end.latitude,
    endLng: end.longitude,
    distance: Math.round(distance),
    duration: durationMs,
    maxSpeed,
    averageSpeed: avgSpeed,
    idleDuration: idleMs,
    ignitionOn: ignitionOnMs,
  };
}

function calculateSummary(trips: Trip[]): TripSummary {
  return {
    totalTrips: trips.length,
    totalDistance: trips.reduce((s, t) => s + t.distance, 0),
    totalDuration: trips.reduce((s, t) => s + t.duration, 0),
    totalIdleDuration: trips.reduce((s, t) => s + t.idleDuration, 0),
    totalIgnitionOn: trips.reduce((s, t) => s + t.ignitionOn, 0),
    averageSpeed: trips.length > 0
      ? Math.round(trips.reduce((s, t) => s + t.averageSpeed, 0) / trips.length)
      : 0,
    maxSpeed: trips.length > 0 ? Math.max(...trips.map(t => t.maxSpeed)) : 0,
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
