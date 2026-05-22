import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Stops report -- detects all stops from positions data.
 * A stop is when a vehicle has ignition on or off and speed < 2 km/h for > 5 min.
 * Covers multi-day stops (e.g. vehicle parked for 5 days shows as one stop with full duration).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const adminId = sp.get("adminId");
  const vehicleIdsRaw = sp.get("vehicleIds");
  const from = sp.get("from");
  const to = sp.get("to");

  if (!adminId || !vehicleIdsRaw || !from || !to) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = `Basic ${Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64")}`;
  const vehicleIds = vehicleIdsRaw.split(",").map(v => v.trim()).filter(Boolean);

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
          vehicleId: vehicle.id, plate: vehicle.plate_number,
          brand: vehicle.make, model: vehicle.model,
          error: `Traccar error ${res.status}`, trips: [], summary: null,
        });
        continue;
      }

      const positions: Array<{
        deviceTime: string; latitude: number; longitude: number;
        speed: number; address: string | null;
        attributes: { ignition?: boolean; motion?: boolean; [key: string]: unknown };
      }> = await res.json();

      const sorted = positions
        .filter(p => p.latitude !== 0 && p.longitude !== 0)
        .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());

      const stops = extractStops(sorted);
      const summary = {
        totalStops: stops.length,
        totalStopDuration: stops.reduce((s, t) => s + t.duration, 0),
        longestStop: stops.length > 0 ? Math.max(...stops.map(t => t.duration)) : 0,
        engineOnStops: stops.filter(s => s.engineStatus === "ON").length,
        engineOffStops: stops.filter(s => s.engineStatus === "OFF").length,
      };

      results.push({
        vehicleId: vehicle.id, plate: vehicle.plate_number,
        brand: vehicle.make, model: vehicle.model,
        trips: stops, summary,
      });
    } catch (err) {
      results.push({
        vehicleId: vehicle.id, plate: vehicle.plate_number,
        brand: vehicle.make, model: vehicle.model,
        error: err instanceof Error ? err.message : "Unknown error",
        trips: [], summary: null,
      });
    }
  }

  return NextResponse.json({ devices: results, from, to });
}

interface Stop {
  startTime: string;
  endTime: string;
  duration: number; // ms
  address: string;
  latitude: number;
  longitude: number;
  engineStatus: string; // "ON" | "OFF" | "MIXED"
}

function extractStops(positions: Array<{
  deviceTime: string; latitude: number; longitude: number;
  speed: number; address: string | null;
  attributes: { ignition?: boolean; motion?: boolean; [key: string]: unknown };
}>): Stop[] {
  if (positions.length < 2) return [];

  const stops: Stop[] = [];
  let stopStart: typeof positions[0] | null = null;
  let stopPositions: typeof positions = [];
  const MIN_STOP_MS = 5 * 60 * 1000; // 5 min minimum stop

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const speedKmh = pos.speed * 1.852;
    const isMoving = speedKmh > 2 || pos.attributes?.motion === true;

    if (!isMoving) {
      if (!stopStart) {
        stopStart = pos;
        stopPositions = [pos];
      } else {
        stopPositions.push(pos);
      }
    } else if (stopStart) {
      // Vehicle started moving -- close the stop if long enough
      const durationMs = new Date(stopPositions[stopPositions.length - 1].deviceTime).getTime()
        - new Date(stopStart.deviceTime).getTime();
      if (durationMs >= MIN_STOP_MS) {
        stops.push(buildStop(stopStart, stopPositions));
      }
      stopStart = null;
      stopPositions = [];
    }
  }

  // Close any open stop (vehicle still stopped at end of period -- covers multi-day stops)
  if (stopStart && stopPositions.length > 0) {
    const durationMs = new Date(stopPositions[stopPositions.length - 1].deviceTime).getTime()
      - new Date(stopStart.deviceTime).getTime();
    if (durationMs >= MIN_STOP_MS) {
      stops.push(buildStop(stopStart, stopPositions));
    }
  }

  return stops;
}

function buildStop(
  start: { deviceTime: string; latitude: number; longitude: number; address: string | null; attributes: { ignition?: boolean; [key: string]: unknown } },
  positions: Array<{ deviceTime: string; attributes: { ignition?: boolean; [key: string]: unknown } }>
): Stop {
  const end = positions[positions.length - 1];
  const durationMs = new Date(end.deviceTime).getTime() - new Date(start.deviceTime).getTime();

  // Determine engine status across the stop
  const ignOn = positions.filter(p => p.attributes?.ignition === true).length;
  const ignOff = positions.filter(p => p.attributes?.ignition === false).length;
  let engineStatus = "OFF";
  if (ignOn > 0 && ignOff === 0) engineStatus = "ON";
  else if (ignOn > 0 && ignOff > 0) engineStatus = "MIXED";

  return {
    startTime: start.deviceTime,
    endTime: end.deviceTime,
    duration: durationMs,
    address: start.address || `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}`,
    latitude: start.latitude,
    longitude: start.longitude,
    engineStatus,
  };
}
