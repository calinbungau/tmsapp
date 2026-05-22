import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TraccarCredentials } from "@/lib/traccar";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const adminId = searchParams.get("adminId");

  if (!adminId) {
    return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
  }

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

  // Get date range -- default to last 24 hours
  const from = searchParams.get("from") || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = searchParams.get("to") || new Date().toISOString();
  const type = searchParams.get("type") || "allEvents";

  // Auth header for Traccar
  const authHeader = `Basic ${Buffer.from(`${credentials.email}:${credentials.password}`).toString("base64")}`;

  try {
    // Get all devices first to map deviceId -> name/plate
    const devicesRes = await fetch(`${credentials.serverUrl}/api/devices`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });
    if (!devicesRes.ok) throw new Error("Failed to fetch devices");
    const devices: Array<{ id: number; name: string; uniqueId: string }> = await devicesRes.json();

    // Fetch events for all devices
    const allEvents: Array<Record<string, any>> = [];
    const batchSize = 10;

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);
      const promises = batch.map(async (device) => {
        const url = `${credentials.serverUrl}/api/reports/events?deviceId=${device.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&type=${type}`;
        try {
          const res = await fetch(url, {
            headers: { Authorization: authHeader, Accept: "application/json" },
          });
          if (res.ok) {
            const events = await res.json();
            return events.map((ev: Record<string, any>) => ({
              ...ev,
              vehiclePlate: device.name,
              deviceName: device.name,
            }));
          }
        } catch { /* skip */ }
        return [];
      });

      const results = await Promise.all(promises);
      for (const events of results) {
        allEvents.push(...events);
      }
    }

    // Sort by eventTime descending (most recent first)
    allEvents.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());

    // Get positions for events -- use current positions as a fast lookup, then fill gaps
    const positionMap = new Map<number, { latitude: number; longitude: number }>();

    // First, get current positions for all devices (fast, single call)
    try {
      const posRes = await fetch(`${credentials.serverUrl}/api/positions`, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      });
      if (posRes.ok) {
        const positions: Array<{ id: number; latitude: number; longitude: number }> = await posRes.json();
        for (const pos of positions) {
          positionMap.set(pos.id, { latitude: pos.latitude, longitude: pos.longitude });
        }
      }
    } catch { /* silent */ }

    // For events with positionId not in current positions, fetch individually
    const missingPosIds = [...new Set(
      allEvents.filter(e => e.positionId > 0 && !positionMap.has(e.positionId)).map(e => e.positionId)
    )].slice(0, 50); // Limit to 50 position lookups

    if (missingPosIds.length > 0) {
      const idParams = missingPosIds.map(id => `id=${id}`).join("&");
      try {
        const posRes = await fetch(`${credentials.serverUrl}/api/positions?${idParams}`, {
          headers: { Authorization: authHeader, Accept: "application/json" },
        });
        if (posRes.ok) {
          const positions: Array<{ id: number; latitude: number; longitude: number }> = await posRes.json();
          for (const pos of positions) {
            positionMap.set(pos.id, { latitude: pos.latitude, longitude: pos.longitude });
          }
        }
      } catch { /* silent */ }
    }

    // Enrich events with positions
    const enriched = allEvents.map(ev => {
      const pos = positionMap.get(ev.positionId);
      return {
        id: ev.id,
        deviceId: ev.deviceId,
        vehiclePlate: ev.vehiclePlate || ev.deviceName,
        type: ev.type,
        eventTime: ev.eventTime,
        positionId: ev.positionId,
        geofenceId: ev.geofenceId || 0,
        maintenanceId: ev.maintenanceId || 0,
        attributes: ev.attributes || {},
        latitude: pos?.latitude || null,
        longitude: pos?.longitude || null,
      };
    });

    return NextResponse.json(enriched);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch events" }, { status: 500 });
  }
}
