/**
 * TMS Auto Check-in / Check-out Service
 * ─────────────────────────────────────
 * Pure-function geofence engine called from the driver-position webhook
 * (`app/api/drivers/position/route.ts`). Given a fresh GPS fix from a
 * driver, it inspects every active trip-stop they own and:
 *   • marks `actual_arrival = now()` + status='arrived' the first time
 *     the driver enters a stop's geofence (only when `auto_checkin`
 *     is enabled on that stop).
 *   • marks `actual_departure = now()` + status='completed' the first
 *     time the driver exits the geofence after having entered (only
 *     when `auto_checkout` is enabled).
 *
 * Idempotency is achieved by:
 *   1. Recording every enter/exit transition in
 *      `trip_stop_geofence_events`. The most recent event for a stop
 *      tells us the current "inside/outside" state, so we don't
 *      double-trigger if the driver pings twice from inside.
 *   2. Refusing to overwrite already-set `actual_arrival` /
 *      `actual_departure` columns — manual check-ins from the driver
 *      app remain authoritative.
 *
 * Distance is haversine-on-a-sphere; good enough for sub-100km radii
 * which is all geofencing cares about. The service makes at most
 * three round-trips per ping (active-trips fetch, stops fetch, events
 * fetch) and writes one INSERT + at most one UPDATE per transition.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

interface ProcessArgs {
  supabase: SupabaseClient<any, any, any>;
  driverId: string;
  lat: number;
  lng: number;
  /** ISO timestamp of the position fix; defaults to now. */
  recordedAt?: string;
}

export async function processDriverPosition({
  supabase,
  driverId,
  lat,
  lng,
  recordedAt,
}: ProcessArgs): Promise<{ enters: number; exits: number }> {
  const ts = recordedAt ?? new Date().toISOString();

  // 1. Find every trip the driver currently owns that's still rolling.
  //    `dispatched`/`accepted` are pre-start states where geofencing
  //    would only generate noise; `in_progress` is the only state we
  //    care about for auto check-in.
  const { data: activeTrips } = await supabase
    .from("trips")
    .select("id, status")
    .eq("driver_id", driverId)
    .eq("status", "in_progress");

  if (!activeTrips || activeTrips.length === 0) {
    return { enters: 0, exits: 0 };
  }
  const tripIds = activeTrips.map((t) => t.id);

  // 2. Pull only stops that have geofencing actually enabled. A stop
  //    with both flags off is still GPS-trackable but won't auto-flip
  //    its status — dispatchers set the toggles per stop in the trip
  //    edit page.
  const { data: stops } = await supabase
    .from("trip_stops")
    .select(
      "id, trip_id, lat, lng, geofence_radius, status, actual_arrival, actual_departure, auto_checkin, auto_checkout, order_stop_id",
    )
    .in("trip_id", tripIds)
    .or("auto_checkin.eq.true,auto_checkout.eq.true");

  if (!stops || stops.length === 0) {
    return { enters: 0, exits: 0 };
  }

  // 3. Fetch the latest geofence event per stop in a single query so we
  //    can decide whether this fix represents a fresh transition.
  const stopIds = stops.map((s) => s.id);
  const { data: lastEvents } = await supabase
    .from("trip_stop_geofence_events")
    .select("trip_stop_id, event_type, recorded_at")
    .in("trip_stop_id", stopIds)
    .order("recorded_at", { ascending: false });

  const lastEventByStop = new Map<string, "enter" | "exit">();
  for (const ev of lastEvents || []) {
    if (!lastEventByStop.has(ev.trip_stop_id)) {
      lastEventByStop.set(ev.trip_stop_id, ev.event_type as "enter" | "exit");
    }
  }

  let enters = 0;
  let exits = 0;

  for (const stop of stops) {
    if (typeof stop.lat !== "number" || typeof stop.lng !== "number") continue;
    const radius =
      typeof stop.geofence_radius === "number" && stop.geofence_radius > 0
        ? stop.geofence_radius
        : 200;
    const distance = haversineMeters(lat, lng, stop.lat, stop.lng);
    const inside = distance <= radius;
    const previousState = lastEventByStop.get(stop.id) ?? "exit";

    if (inside && previousState !== "enter" && stop.auto_checkin) {
      // Fresh entry — record the event and (only if not already done
      // manually) flip the stop into 'arrived'. We never overwrite
      // an existing actual_arrival timestamp.
      await supabase.from("trip_stop_geofence_events").insert({
        trip_stop_id: stop.id,
        trip_id: stop.trip_id,
        driver_id: driverId,
        event_type: "enter",
        source: "auto",
        distance_meters: Math.round(distance),
        position_lat: lat,
        position_lng: lng,
        recorded_at: ts,
      });
      if (!stop.actual_arrival) {
        await supabase
          .from("trip_stops")
          .update({
            actual_arrival: ts,
            status: stop.status === "completed" ? stop.status : "arrived",
          })
          .eq("id", stop.id);
        // Mirror onto the linked order_stop so dispatcher views that
        // read from the order side stay in sync.
        if (stop.order_stop_id) {
          await supabase
            .from("order_stops")
            .update({ actual_arrival: ts })
            .eq("id", stop.order_stop_id);
        }
      }
      enters++;
    } else if (!inside && previousState === "enter" && stop.auto_checkout) {
      await supabase.from("trip_stop_geofence_events").insert({
        trip_stop_id: stop.id,
        trip_id: stop.trip_id,
        driver_id: driverId,
        event_type: "exit",
        source: "auto",
        distance_meters: Math.round(distance),
        position_lat: lat,
        position_lng: lng,
        recorded_at: ts,
      });
      if (!stop.actual_departure) {
        await supabase
          .from("trip_stops")
          .update({
            actual_departure: ts,
            status: "completed",
          })
          .eq("id", stop.id);
        if (stop.order_stop_id) {
          await supabase
            .from("order_stops")
            .update({ actual_departure: ts, status: "completed" })
            .eq("id", stop.order_stop_id);
        }
      }
      exits++;
    }
  }

  return { enters, exits };
}
