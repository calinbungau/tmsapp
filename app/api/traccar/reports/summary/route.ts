import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Summary Report
 * Fetches summary data from Traccar for specified vehicles and date range
 * Shows daily breakdown with distance, speed, engine hours, fuel usage
 * 
 * Query: ?adminId=X&vehicleIds=1,2,3&from=ISO&to=ISO&groupBy=day|week|month
 * Returns: { devices: [{ vehicleId, plate, summaryRows: [...], totals: {...} }] }
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const sp = request.nextUrl.searchParams;
  const adminId = sp.get("adminId");
  const vehicleIdsRaw = sp.get("vehicleIds");
  const from = sp.get("from");
  const to = sp.get("to");
  const groupBy = sp.get("groupBy") || "day"; // day, week, month

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

  // Get vehicle info from Supabase (including fuel price for cost calculation)
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate_number, traccar_device_id, make, model, fuel_type, fuel_tank_capacity")
    .eq("admin_id", adminId)
    .in("id", vehicleIds);

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ error: "No vehicles found" }, { status: 404 });
  }

  // Get fuel prices from company settings or use defaults
  const FUEL_PRICES: Record<string, number> = {
    diesel: 1.45,
    petrol: 1.55,
    gasoline: 1.55,
    lpg: 0.75,
    electric: 0.25, // per kWh
    cng: 1.10,
  };

  const results = [];

  for (const vehicle of vehicles) {
    if (!vehicle.traccar_device_id) continue;

    try {
      // Use Traccar's summary report endpoint
      const url = new URL(`${admin.traccar_server_url}/api/reports/summary`);
      url.searchParams.set("deviceId", String(vehicle.traccar_device_id));
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("daily", "true"); // Get daily breakdown

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
          summaryRows: [],
          totals: null,
        });
        continue;
      }

      const rawSummary: Array<{
        deviceId: number;
        deviceName: string;
        distance: number; // meters
        averageSpeed: number; // knots
        maxSpeed: number; // knots
        engineHours: number; // milliseconds
        spentFuel: number; // liters (if available)
        startTime?: string;
        endTime?: string;
      }> = await res.json();

      // Process summary data and group by day/week/month
      const summaryRows = processSummaryData(rawSummary, groupBy, vehicle.fuel_type, FUEL_PRICES);

      // Calculate totals
      const totals = calculateTotals(summaryRows, vehicle.fuel_type, FUEL_PRICES);

      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        fuelType: vehicle.fuel_type,
        summaryRows,
        totals,
        rowCount: summaryRows.length,
      });
    } catch (err) {
      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        error: err instanceof Error ? err.message : "Unknown error",
        summaryRows: [],
        totals: null,
      });
    }
  }

  return NextResponse.json({ devices: results, from, to, groupBy });
}

interface SummaryRow {
  date: string;
  dateLabel: string;
  distance: number; // km
  averageSpeed: number; // km/h
  maxSpeed: number; // km/h
  engineHours: number; // ms
  engineHoursFormatted: string;
  fuelUsed: number; // liters (estimated if not reported)
  fuelCost: number; // EUR
  startTime: string | null;
  endTime: string | null;
}

function processSummaryData(
  rawSummary: Array<{
    distance: number;
    averageSpeed: number;
    maxSpeed: number;
    engineHours: number;
    spentFuel: number;
    startTime?: string;
    endTime?: string;
  }>,
  groupBy: string,
  fuelType: string | null,
  fuelPrices: Record<string, number>
): SummaryRow[] {
  const rows: SummaryRow[] = [];
  
  // Group by date/week/month
  const grouped = new Map<string, typeof rawSummary>();
  
  for (const item of rawSummary) {
    if (!item.startTime) continue;
    
    const startDate = new Date(item.startTime);
    let groupKey: string;
    
    switch (groupBy) {
      case "week":
        // Get ISO week
        const weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() - startDate.getDay() + 1);
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case "month":
        groupKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;
        break;
      default: // day
        groupKey = startDate.toISOString().slice(0, 10);
    }
    
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push(item);
  }
  
  // Aggregate each group
  for (const [dateKey, items] of Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const totalDistance = items.reduce((s, i) => s + (i.distance || 0), 0);
    const totalEngineHours = items.reduce((s, i) => s + (i.engineHours || 0), 0);
    const totalFuelSpent = items.reduce((s, i) => s + (i.spentFuel || 0), 0);
    
    // Calculate averages
    const avgSpeed = items.length > 0 
      ? items.reduce((s, i) => s + (i.averageSpeed || 0), 0) / items.length 
      : 0;
    const maxSpd = Math.max(...items.map(i => i.maxSpeed || 0));
    
    // Get first/last times
    const sortedByTime = items
      .filter(i => i.startTime)
      .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
    
    const firstStart = sortedByTime[0]?.startTime || null;
    const lastEnd = sortedByTime[sortedByTime.length - 1]?.endTime || null;
    
    // Convert units
    const distanceKm = totalDistance / 1000;
    const avgSpeedKmh = Math.round(avgSpeed * 1.852); // knots to km/h
    const maxSpeedKmh = Math.round(maxSpd * 1.852);
    
    // Estimate fuel if not reported (assume 25L/100km for trucks, 8L/100km for cars)
    let fuelUsed = totalFuelSpent;
    if (fuelUsed <= 0 && distanceKm > 0) {
      const consumptionRate = fuelType === "diesel" ? 25 : 10; // L/100km estimate
      fuelUsed = (distanceKm / 100) * consumptionRate;
    }
    
    // Calculate cost
    const fuelPrice = fuelPrices[fuelType || "diesel"] || 1.45;
    const fuelCost = fuelUsed * fuelPrice;
    
    // Format date label
    let dateLabel: string;
    const d = new Date(dateKey);
    switch (groupBy) {
      case "week":
        const weekEnd = new Date(d);
        weekEnd.setDate(d.getDate() + 6);
        dateLabel = `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} - ${weekEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
        break;
      case "month":
        dateLabel = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        break;
      default:
        dateLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    }
    
    rows.push({
      date: dateKey,
      dateLabel,
      distance: Math.round(distanceKm * 100) / 100,
      averageSpeed: avgSpeedKmh,
      maxSpeed: maxSpeedKmh,
      engineHours: totalEngineHours,
      engineHoursFormatted: formatDuration(totalEngineHours),
      fuelUsed: Math.round(fuelUsed * 10) / 10,
      fuelCost: Math.round(fuelCost * 100) / 100,
      startTime: firstStart,
      endTime: lastEnd,
    });
  }
  
  return rows;
}

interface SummaryTotals {
  totalDistance: number;
  averageSpeed: number;
  maxSpeed: number;
  totalEngineHours: number;
  totalEngineHoursFormatted: string;
  totalFuelUsed: number;
  totalFuelCost: number;
  avgFuelConsumption: number; // L/100km
  daysWithActivity: number;
}

function calculateTotals(
  rows: SummaryRow[],
  fuelType: string | null,
  fuelPrices: Record<string, number>
): SummaryTotals {
  if (rows.length === 0) {
    return {
      totalDistance: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      totalEngineHours: 0,
      totalEngineHoursFormatted: "00:00",
      totalFuelUsed: 0,
      totalFuelCost: 0,
      avgFuelConsumption: 0,
      daysWithActivity: 0,
    };
  }

  const totalDistance = rows.reduce((s, r) => s + r.distance, 0);
  const totalEngineHours = rows.reduce((s, r) => s + r.engineHours, 0);
  const totalFuelUsed = rows.reduce((s, r) => s + r.fuelUsed, 0);
  
  const avgSpeed = rows.length > 0 
    ? Math.round(rows.reduce((s, r) => s + r.averageSpeed, 0) / rows.length) 
    : 0;
  const maxSpd = Math.max(...rows.map(r => r.maxSpeed));
  
  const fuelPrice = fuelPrices[fuelType || "diesel"] || 1.45;
  const totalFuelCost = totalFuelUsed * fuelPrice;
  
  const avgConsumption = totalDistance > 0 
    ? Math.round((totalFuelUsed / totalDistance) * 100 * 10) / 10 
    : 0;

  return {
    totalDistance: Math.round(totalDistance * 100) / 100,
    averageSpeed: avgSpeed,
    maxSpeed: maxSpd,
    totalEngineHours,
    totalEngineHoursFormatted: formatDuration(totalEngineHours),
    totalFuelUsed: Math.round(totalFuelUsed * 10) / 10,
    totalFuelCost: Math.round(totalFuelCost * 100) / 100,
    avgFuelConsumption: avgConsumption,
    daysWithActivity: rows.filter(r => r.distance > 0).length,
  };
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
