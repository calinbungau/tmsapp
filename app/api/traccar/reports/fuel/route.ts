import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fuel Volume Report
 * Fetches positions with fuel data from Traccar and analyzes:
 * - Fuel level over time
 * - Fuel consumption
 * - Refueling events (sharp increases)
 * - Fuel drops (potential theft or leaks)
 * 
 * Query: ?adminId=X&vehicleIds=1,2,3&from=ISO&to=ISO
 * Returns: { devices: [{ vehicleId, plate, fuelData: [...], summary: {...} }] }
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
    .select("id, plate_number, traccar_device_id, make, model, fuel_tank_capacity")
    .eq("admin_id", adminId)
    .in("id", vehicleIds);

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ error: "No vehicles found" }, { status: 404 });
  }

  const results = [];

  for (const vehicle of vehicles) {
    if (!vehicle.traccar_device_id) continue;

    try {
      // Fetch positions from Traccar
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
          fuelData: [],
          summary: null,
        });
        continue;
      }

      const positions: Array<{
        id: number;
        deviceTime: string;
        latitude: number;
        longitude: number;
        speed: number;
        address: string | null;
        attributes: {
          fuel?: number;
          fuelLevel?: number; // Some devices report fuelLevel instead of fuel
          totalDistance?: number;
          [key: string]: unknown;
        };
      }> = await res.json();

      // Sort by time
      const sorted = positions
        .filter(p => p.latitude !== 0 && p.longitude !== 0)
        .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());

      // Extract fuel data and detect events
      const fuelData = extractFuelData(sorted, vehicle.fuel_tank_capacity);

      // Calculate summary
      const summary = calculateFuelSummary(fuelData, sorted);

      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        tankCapacity: vehicle.fuel_tank_capacity,
        fuelData,
        summary,
        positionCount: sorted.length,
        hasFuelSensor: fuelData.length > 0,
      });
    } catch (err) {
      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        error: err instanceof Error ? err.message : "Unknown error",
        fuelData: [],
        summary: null,
      });
    }
  }

  return NextResponse.json({ devices: results, from, to });
}

interface FuelDataPoint {
  time: string;
  fuelLevel: number;
  change: number;
  eventType: "normal" | "refuel" | "drop" | "consumption";
  distance: number;
  cumulativeDistance: number;
  address: string;
  latitude: number;
  longitude: number;
}

function extractFuelData(
  positions: Array<{
    deviceTime: string;
    latitude: number;
    longitude: number;
    address: string | null;
    attributes: { fuel?: number; fuelLevel?: number; totalDistance?: number; [key: string]: unknown };
  }>,
  tankCapacity?: number | null
): FuelDataPoint[] {
  const fuelData: FuelDataPoint[] = [];
  let prevFuel: number | null = null;
  let prevDistance: number | null = null;
  let cumulativeDistance = 0;

  // Thresholds for event detection
  const REFUEL_THRESHOLD = 5; // Liters - increase above this is a refuel
  const DROP_THRESHOLD = -10; // Liters - decrease below this (without distance) is suspicious

  for (const pos of positions) {
    // Get fuel level (devices report as 'fuel' or 'fuelLevel', in liters or percentage)
    let fuelLevel = pos.attributes.fuel ?? pos.attributes.fuelLevel ?? null;
    
    if (fuelLevel === null || fuelLevel === undefined) continue;
    
    // If fuel is reported as percentage and we have tank capacity, convert to liters
    if (tankCapacity && fuelLevel <= 100 && fuelLevel >= 0) {
      // Assume it's percentage if <= 100
      if (fuelLevel <= 1) {
        // It's a ratio (0-1)
        fuelLevel = fuelLevel * tankCapacity;
      } else if (fuelLevel <= 100) {
        // It's percentage (0-100)
        fuelLevel = (fuelLevel / 100) * tankCapacity;
      }
    }

    const currentDistance = pos.attributes.totalDistance || 0;
    const distanceDelta = prevDistance !== null ? (currentDistance - prevDistance) / 1000 : 0; // km
    cumulativeDistance += distanceDelta > 0 ? distanceDelta : 0;

    let change = 0;
    let eventType: FuelDataPoint["eventType"] = "normal";

    if (prevFuel !== null) {
      change = fuelLevel - prevFuel;
      
      if (change >= REFUEL_THRESHOLD) {
        eventType = "refuel";
      } else if (change <= DROP_THRESHOLD && distanceDelta < 5) {
        // Significant drop without much driving - suspicious
        eventType = "drop";
      } else if (change < -0.5) {
        // Normal consumption
        eventType = "consumption";
      }
    }

    fuelData.push({
      time: pos.deviceTime,
      fuelLevel: Math.round(fuelLevel * 10) / 10,
      change: Math.round(change * 10) / 10,
      eventType,
      distance: Math.round(distanceDelta * 100) / 100,
      cumulativeDistance: Math.round(cumulativeDistance * 100) / 100,
      address: pos.address || `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`,
      latitude: pos.latitude,
      longitude: pos.longitude,
    });

    prevFuel = fuelLevel;
    prevDistance = currentDistance;
  }

  // Filter to only include significant points (reduce noise)
  // Keep: first, last, refuels, drops, and hourly samples
  const filtered: FuelDataPoint[] = [];
  let lastKeptTime = 0;
  const HOUR_MS = 60 * 60 * 1000;

  for (let i = 0; i < fuelData.length; i++) {
    const point = fuelData[i];
    const pointTime = new Date(point.time).getTime();
    const isFirst = i === 0;
    const isLast = i === fuelData.length - 1;
    const isEvent = point.eventType !== "normal" && point.eventType !== "consumption";
    const isHourlyInterval = pointTime - lastKeptTime >= HOUR_MS;

    if (isFirst || isLast || isEvent || isHourlyInterval) {
      filtered.push(point);
      lastKeptTime = pointTime;
    }
  }

  return filtered;
}

interface FuelSummary {
  startLevel: number | null;
  endLevel: number | null;
  totalConsumed: number;
  totalRefueled: number;
  refuelCount: number;
  dropCount: number;
  avgConsumption: number; // L/100km
  totalDistance: number;
  fuelEvents: Array<{
    type: "refuel" | "drop";
    time: string;
    amount: number;
    address: string;
  }>;
}

function calculateFuelSummary(
  fuelData: FuelDataPoint[],
  positions: Array<{ attributes: { totalDistance?: number } }>
): FuelSummary {
  if (fuelData.length === 0) {
    return {
      startLevel: null,
      endLevel: null,
      totalConsumed: 0,
      totalRefueled: 0,
      refuelCount: 0,
      dropCount: 0,
      avgConsumption: 0,
      totalDistance: 0,
      fuelEvents: [],
    };
  }

  const startLevel = fuelData[0].fuelLevel;
  const endLevel = fuelData[fuelData.length - 1].fuelLevel;

  let totalRefueled = 0;
  let totalDropped = 0;
  const fuelEvents: FuelSummary["fuelEvents"] = [];

  for (const point of fuelData) {
    if (point.eventType === "refuel") {
      totalRefueled += point.change;
      fuelEvents.push({
        type: "refuel",
        time: point.time,
        amount: point.change,
        address: point.address,
      });
    } else if (point.eventType === "drop") {
      totalDropped += Math.abs(point.change);
      fuelEvents.push({
        type: "drop",
        time: point.time,
        amount: Math.abs(point.change),
        address: point.address,
      });
    }
  }

  // Total consumed = start + refueled - end - drops
  const totalConsumed = Math.max(0, startLevel + totalRefueled - endLevel - totalDropped);

  // Calculate total distance from positions
  const firstDist = positions[0]?.attributes?.totalDistance || 0;
  const lastDist = positions[positions.length - 1]?.attributes?.totalDistance || 0;
  const totalDistance = (lastDist - firstDist) / 1000; // km

  // Average consumption (L/100km)
  const avgConsumption = totalDistance > 10 
    ? Math.round((totalConsumed / totalDistance) * 100 * 10) / 10 
    : 0;

  return {
    startLevel: Math.round(startLevel * 10) / 10,
    endLevel: Math.round(endLevel * 10) / 10,
    totalConsumed: Math.round(totalConsumed * 10) / 10,
    totalRefueled: Math.round(totalRefueled * 10) / 10,
    refuelCount: fuelEvents.filter(e => e.type === "refuel").length,
    dropCount: fuelEvents.filter(e => e.type === "drop").length,
    avgConsumption,
    totalDistance: Math.round(totalDistance * 100) / 100,
    fuelEvents,
  };
}
