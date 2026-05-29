import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Engine Hours report -- daily breakdown of ignition on/off, moving vs idle time.
 * Each row = one day. If a vehicle stays parked for 5 days, all 5 days appear
 * with their respective ignition on/off durations (even if 0 movement).
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
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

  // Generate all dates in range
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const allDates: string[] = [];
  const d = new Date(fromDate);
  d.setUTCHours(0, 0, 0, 0);
  const endD = new Date(toDate);
  endD.setUTCHours(23, 59, 59, 999);
  while (d <= endD) {
    allDates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
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
        attributes: { ignition?: boolean; motion?: boolean; totalDistance?: number; [key: string]: unknown };
      }> = await res.json();

      const sorted = positions
        .filter(p => p.latitude !== 0 && p.longitude !== 0)
        .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());

      // Group positions by date
      const byDate: Record<string, typeof sorted> = {};
      for (const date of allDates) {
        byDate[date] = [];
      }
      for (const pos of sorted) {
        const dateKey = pos.deviceTime.slice(0, 10);
        if (byDate[dateKey]) {
          byDate[dateKey].push(pos);
        }
      }

      // Calculate daily engine hours
      const dailyRows = allDates.map(date => {
        const dayPositions = byDate[date] || [];
        if (dayPositions.length < 2) {
          return {
            date,
            ignitionOn: 0,
            movingTime: 0,
            idleTime: 0,
            ignitionOff: 24 * 60 * 60 * 1000, // Full day off
            distance: 0,
          };
        }

        let ignitionOnMs = 0;
        let movingMs = 0;
        let idleMs = 0;

        for (let i = 1; i < dayPositions.length; i++) {
          const dt = new Date(dayPositions[i].deviceTime).getTime()
            - new Date(dayPositions[i - 1].deviceTime).getTime();
          const ignOn = dayPositions[i].attributes?.ignition !== false;
          const isMoving = dayPositions[i].attributes?.motion === true || (dayPositions[i].speed * 1.852) > 2;

          if (ignOn) {
            ignitionOnMs += dt;
            if (isMoving) {
              movingMs += dt;
            } else {
              idleMs += dt;
            }
          }
        }

        // Distance from totalDistance attribute
        let distance = 0;
        const firstDist = dayPositions[0]?.attributes?.totalDistance || 0;
        const lastDist = dayPositions[dayPositions.length - 1]?.attributes?.totalDistance || 0;
        if (lastDist > firstDist) {
          distance = lastDist - firstDist;
        }

        // Calculate total tracked time for this day
        const firstTime = new Date(dayPositions[0].deviceTime).getTime();
        const lastTime = new Date(dayPositions[dayPositions.length - 1].deviceTime).getTime();
        const trackedMs = lastTime - firstTime;
        const ignitionOffMs = Math.max(0, trackedMs - ignitionOnMs);

        return {
          date,
          ignitionOn: ignitionOnMs,
          movingTime: movingMs,
          idleTime: idleMs,
          ignitionOff: ignitionOffMs,
          distance: Math.round(distance),
        };
      });

      const summary = {
        totalDays: dailyRows.length,
        totalIgnitionOn: dailyRows.reduce((s, r) => s + r.ignitionOn, 0),
        totalMovingTime: dailyRows.reduce((s, r) => s + r.movingTime, 0),
        totalIdleTime: dailyRows.reduce((s, r) => s + r.idleTime, 0),
        totalIgnitionOff: dailyRows.reduce((s, r) => s + r.ignitionOff, 0),
        totalDistance: dailyRows.reduce((s, r) => s + r.distance, 0),
      };

      results.push({
        vehicleId: vehicle.id, plate: vehicle.plate_number,
        brand: vehicle.make, model: vehicle.model,
        trips: dailyRows, summary,
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
