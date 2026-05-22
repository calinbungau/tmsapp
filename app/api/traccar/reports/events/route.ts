import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Events Report
 * Fetches events from Traccar for specified vehicles and date range
 * Groups events by vehicle and optionally by event type
 * 
 * Query: ?adminId=X&vehicleIds=1,2,3&from=ISO&to=ISO&eventTypes=ignitionOn,ignitionOff
 * Returns: { devices: [{ vehicleId, plate, events: [...], summary: {...} }] }
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const adminId = sp.get("adminId");
  const vehicleIdsRaw = sp.get("vehicleIds");
  const from = sp.get("from");
  const to = sp.get("to");
  const eventTypesRaw = sp.get("eventTypes"); // optional filter

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
  const eventTypeFilter = eventTypesRaw ? eventTypesRaw.split(",").map(t => t.trim()) : null;

  // Get vehicle info from Supabase
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate_number, traccar_device_id, make, model")
    .eq("admin_id", adminId)
    .in("id", vehicleIds);

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ error: "No vehicles found" }, { status: 404 });
  }

  // Get geofences for name lookup
  // Note: Geofences are managed separately in the app, so we fetch from Traccar directly
  const geofenceMap = new Map<number, string>();
  try {
    const gfRes = await fetch(`${admin.traccar_server_url}/api/geofences`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (gfRes.ok) {
      const traccarGeofences: Array<{ id: number; name: string }> = await gfRes.json();
      for (const gf of traccarGeofences) {
        geofenceMap.set(gf.id, gf.name);
      }
    }
  } catch (err) {
    console.error("Failed to fetch Traccar geofences:", err);
    // Continue without geofence names - not critical
  }

  const results = [];

  for (const vehicle of vehicles) {
    if (!vehicle.traccar_device_id) continue;

    try {
      // Fetch events from Traccar
      const url = new URL(`${admin.traccar_server_url}/api/reports/events`);
      url.searchParams.set("deviceId", String(vehicle.traccar_device_id));
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("type", "allEvents");

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
          events: [],
          summary: null,
        });
        continue;
      }

      const rawEvents: Array<{
        id: number;
        deviceId: number;
        type: string;
        eventTime: string;
        positionId: number;
        geofenceId?: number;
        maintenanceId?: number;
        attributes?: Record<string, unknown>;
      }> = await res.json();

      // Filter by event type if specified
      let events = rawEvents;
      if (eventTypeFilter && eventTypeFilter.length > 0) {
        events = events.filter(e => eventTypeFilter.includes(e.type));
      }

      // Sort by time (newest first for display, but we'll keep it chronological for processing)
      events.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

      // Enrich events with readable names
      const enrichedEvents = events.map(ev => ({
        id: ev.id,
        type: ev.type,
        eventTime: ev.eventTime,
        geofenceId: ev.geofenceId || null,
        geofenceName: ev.geofenceId ? geofenceMap.get(ev.geofenceId) || `Geofence #${ev.geofenceId}` : null,
        maintenanceId: ev.maintenanceId || null,
        attributes: ev.attributes || {},
        label: getEventLabel(ev.type),
        category: getEventCategory(ev.type),
      }));

      // Calculate summary
      const summary = calculateEventSummary(enrichedEvents);

      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        events: enrichedEvents,
        summary,
        eventCount: enrichedEvents.length,
      });
    } catch (err) {
      results.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate_number,
        brand: vehicle.make,
        model: vehicle.model,
        error: err instanceof Error ? err.message : "Unknown error",
        events: [],
        summary: null,
      });
    }
  }

  return NextResponse.json({ devices: results, from, to });
}

function getEventLabel(type: string): string {
  const labels: Record<string, string> = {
    deviceOnline: "Device Online",
    deviceOffline: "Device Offline",
    deviceUnknown: "Device Unknown",
    deviceInactive: "Device Inactive",
    deviceMoving: "Started Moving",
    deviceStopped: "Stopped",
    deviceOverspeed: "Overspeeding",
    ignitionOn: "Ignition ON",
    ignitionOff: "Ignition OFF",
    geofenceEnter: "Entered Geofence",
    geofenceExit: "Exited Geofence",
    alarm: "Alarm",
    maintenance: "Maintenance Due",
    textMessage: "Text Message",
    driverChanged: "Driver Changed",
    deviceFuelDrop: "Fuel Drop",
    deviceFuelIncrease: "Fuel Increase",
    commandResult: "Command Result",
  };
  return labels[type] || type;
}

function getEventCategory(type: string): string {
  if (["ignitionOn", "ignitionOff"].includes(type)) return "engine";
  if (["deviceMoving", "deviceStopped", "deviceOverspeed"].includes(type)) return "movement";
  if (["geofenceEnter", "geofenceExit"].includes(type)) return "geofence";
  if (["deviceFuelDrop", "deviceFuelIncrease"].includes(type)) return "fuel";
  if (["deviceOnline", "deviceOffline", "deviceUnknown", "deviceInactive"].includes(type)) return "connectivity";
  if (["alarm"].includes(type)) return "alarm";
  if (["maintenance"].includes(type)) return "maintenance";
  return "other";
}

interface EventSummary {
  totalEvents: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  firstEvent: string | null;
  lastEvent: string | null;
  ignitionOnCount: number;
  ignitionOffCount: number;
  geofenceEnterCount: number;
  geofenceExitCount: number;
  overspeedCount: number;
  alarmCount: number;
}

function calculateEventSummary(events: Array<{ type: string; category: string; eventTime: string }>): EventSummary {
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const ev of events) {
    byType[ev.type] = (byType[ev.type] || 0) + 1;
    byCategory[ev.category] = (byCategory[ev.category] || 0) + 1;
  }

  return {
    totalEvents: events.length,
    byType,
    byCategory,
    firstEvent: events.length > 0 ? events[0].eventTime : null,
    lastEvent: events.length > 0 ? events[events.length - 1].eventTime : null,
    ignitionOnCount: byType["ignitionOn"] || 0,
    ignitionOffCount: byType["ignitionOff"] || 0,
    geofenceEnterCount: byType["geofenceEnter"] || 0,
    geofenceExitCount: byType["geofenceExit"] || 0,
    overspeedCount: byType["deviceOverspeed"] || 0,
    alarmCount: byType["alarm"] || 0,
  };
}
