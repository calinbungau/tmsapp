import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * Returns the actual GPS track for a trip from one of three sources:
 *  - vehicle:  vehicles.traccar_device_id  -> Traccar /api/positions
 *  - trailer:  trailers.traccar_device_id  -> Traccar /api/positions
 *  - driver:   driver_positions table
 *
 * The track is segmented into "trip" and "stop" segments using the same
 * idle/ignition heuristic as the Dispatcher's Route History panel, so the
 * Planned-vs-Actual map can render distinct colors per movement segment
 * with "P" pins between them.  Each trip segment also carries a
 * `loaded` boolean computed from the cargo-on-board timeline (pickup +1
 * / delivery −1), so dispatchers can spot dead-head ("km pe gol") at a
 * glance — empty trip segments are drawn dashed in the UI.
 *
 * Default analysis window resolution (most→least specific):
 *   1. ?from / ?to query params                 (ad-hoc preview)
 *   2. trips.analysis_window_from / _to         (saved preference)
 *   3. earliest stop planned datetime → latest  (sensible default)
 *   4. trips.actual_start / _end                (running trip fallback)
 *   5. trips.planned_start / _end               (last-resort)
 *
 * Query params:
 *   source = "vehicle" | "trailer" | "driver"   (default: "vehicle")
 *   from   = ISO timestamp (optional, ad-hoc override)
 *   to     = ISO timestamp (optional, ad-hoc override)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const url = new URL(req.url)
  const source = (url.searchParams.get("source") || "vehicle") as
    | "vehicle"
    | "trailer"
    | "driver"
  const fromParam = url.searchParams.get("from")
  const toParam = url.searchParams.get("to")

  const supabase = await createClient()

  // ── 1. Load trip ──────────────────────────────────────────────
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select(
      "id, admin_id, vehicle_id, trailer_id, driver_id, status, " +
        "planned_start, planned_end, actual_start, actual_end, " +
        "analysis_window_from, analysis_window_to"
    )
    .eq("id", tripId)
    .maybeSingle()

  if (tripErr) {
    console.error("[v0] gps-track trip load error:", tripErr)
    return NextResponse.json(
      { error: "Failed to load trip", detail: tripErr.message },
      { status: 500 }
    )
  }
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 })
  }

  // ── 2. Linked resources + stops in parallel ──────────────────
  const [vehicleRes, trailerRes, driverRes, stopsRes] = await Promise.all([
    trip.vehicle_id
      ? supabase
          .from("vehicles")
          .select("id, plate_number, traccar_device_id")
          .eq("id", trip.vehicle_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    trip.trailer_id
      ? supabase
          .from("trailers")
          .select("id, plate_number, traccar_device_id")
          .eq("id", trip.trailer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    trip.driver_id
      ? supabase
          .from("drivers")
          .select("id, first_name, last_name")
          .eq("id", trip.driver_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("trip_stops")
      .select(
        "id, sequence_order, stop_type, order_id, lat, lng, " +
          "planned_date, planned_time_from, planned_time_to, " +
          "actual_arrival, actual_departure, company_name, address, city"
      )
      .eq("trip_id", tripId)
      .order("sequence_order", { ascending: true }),
  ])

  const vehicle = vehicleRes.data as
    | { id: string; plate_number: string | null; traccar_device_id: number | null }
    | null
  const trailer = trailerRes.data as
    | { id: string; plate_number: string | null; traccar_device_id: number | null }
    | null
  const driver = driverRes.data as
    | { id: string; first_name: string | null; last_name: string | null }
    | null
  const stops = (stopsRes.data ?? []) as Array<{
    id: string
    sequence_order: number | null
    stop_type: string | null
    order_id: string | null
    lat: number | null
    lng: number | null
    planned_date: string | null
    planned_time_from: string | null
    planned_time_to: string | null
    actual_arrival: string | null
    actual_departure: string | null
    company_name: string | null
    address: string | null
    city: string | null
  }>

  // ── 3. Resolve the analysis window ────────────────────────────
  const stopTime = (s: (typeof stops)[number]) => {
    if (s.actual_arrival) return new Date(s.actual_arrival)
    if (s.planned_date) {
      return new Date(`${s.planned_date}T${s.planned_time_from || "00:00"}`)
    }
    return null
  }
  const stopTimes = stops.map(stopTime).filter((d): d is Date => !!d)
  const firstStopTs = stopTimes.length
    ? new Date(Math.min(...stopTimes.map((d) => d.getTime())))
    : null
  const lastStopTs = stopTimes.length
    ? new Date(Math.max(...stopTimes.map((d) => d.getTime())))
    : null

  // 30-min pad each side of stop range so we capture loading/leaving GPS.
  const STOP_PAD_MS = 30 * 60 * 1000
  const defaultFrom =
    firstStopTs ??
    (trip.actual_start ? new Date(trip.actual_start) : null) ??
    (trip.planned_start ? new Date(trip.planned_start) : null) ??
    new Date(Date.now() - 24 * 3600_000)
  const defaultTo =
    lastStopTs ??
    (trip.actual_end ? new Date(trip.actual_end) : null) ??
    (trip.planned_end ? new Date(trip.planned_end) : null) ??
    new Date()

  const fromTs = fromParam
    ? new Date(fromParam)
    : trip.analysis_window_from
    ? new Date(trip.analysis_window_from)
    : new Date(defaultFrom.getTime() - STOP_PAD_MS)
  const toTs = toParam
    ? new Date(toParam)
    : trip.analysis_window_to
    ? new Date(trip.analysis_window_to)
    : new Date(defaultTo.getTime() + STOP_PAD_MS)

  const rangeSource: "query" | "saved" | "default" =
    fromParam || toParam
      ? "query"
      : trip.analysis_window_from || trip.analysis_window_to
      ? "saved"
      : "default"

  const availableSources: Array<{
    value: "vehicle" | "trailer" | "driver"
    label: string
    enabled: boolean
    detail?: string
    deviceId?: number | null
  }> = [
    {
      value: "vehicle",
      label: "Vehicle GPS",
      enabled: !!vehicle?.traccar_device_id,
      detail: vehicle?.plate_number ?? "—",
      deviceId: vehicle?.traccar_device_id ?? null,
    },
    {
      value: "trailer",
      label: "Trailer GPS",
      enabled: !!trailer?.traccar_device_id,
      detail: trailer?.plate_number ?? "—",
      deviceId: trailer?.traccar_device_id ?? null,
    },
    {
      value: "driver",
      label: "Driver Phone",
      enabled: !!trip.driver_id,
      detail: driver
        ? `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || "—"
        : "—",
    },
  ]

  // ── 4. Fetch GPS positions for the chosen source ─────────────
  type RawPos = {
    lat: number
    lng: number
    recorded_at: string
    speed?: number | null   // km/h
    heading?: number | null // degrees, 0=N
    ignition?: boolean | null
  }
  let positions: RawPos[] = []
  let warning: string | null = null

  try {
    if (source === "driver") {
      if (!trip.driver_id) {
        warning = "Trip has no driver assigned"
      } else {
        const { data, error } = await supabase
          .from("driver_positions")
          .select("lat,lng,recorded_at,speed,heading")
          .eq("driver_id", trip.driver_id)
          .gte("recorded_at", fromTs.toISOString())
          .lte("recorded_at", toTs.toISOString())
          .order("recorded_at", { ascending: true })
          .limit(5000)
        if (error) throw error
        positions = (data ?? []).map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recorded_at: p.recorded_at,
          speed: p.speed,
          heading: p.heading,
          ignition: null,
        }))
      }
    } else {
      const deviceId =
        source === "vehicle"
          ? vehicle?.traccar_device_id
          : trailer?.traccar_device_id
      if (!deviceId) {
        warning = `No GPS device linked to ${source === "vehicle" ? "vehicle" : "trailer"}`
      } else {
        const { data: admin } = await supabase
          .from("admins")
          .select("traccar_server_url, traccar_email, traccar_password")
          .eq("id", trip.admin_id)
          .maybeSingle()

        if (
          !admin?.traccar_server_url ||
          !admin?.traccar_email ||
          !admin?.traccar_password
        ) {
          warning = "Traccar is not configured for this admin"
        } else {
          const authHeader = `Basic ${Buffer.from(
            `${admin.traccar_email}:${admin.traccar_password}`
          ).toString("base64")}`
          const tUrl = new URL(`${admin.traccar_server_url}/api/positions`)
          tUrl.searchParams.set("deviceId", String(deviceId))
          tUrl.searchParams.set("from", fromTs.toISOString())
          tUrl.searchParams.set("to", toTs.toISOString())

          const ctrl = new AbortController()
          const timeout = setTimeout(() => ctrl.abort(), 20000)
          try {
            const res = await fetch(tUrl.toString(), {
              headers: {
                Authorization: authHeader,
                Accept: "application/json",
              },
              signal: ctrl.signal,
              cache: "no-store",
            })
            if (!res.ok) {
              warning = `Traccar returned ${res.status} ${res.statusText}`
            } else {
              const json = (await res.json()) as Array<{
                deviceTime: string
                fixTime: string
                latitude: number
                longitude: number
                speed: number // knots
                course: number
                attributes?: { ignition?: boolean }
              }>
              positions = json
                .filter(
                  (p) =>
                    typeof p.latitude === "number" &&
                    typeof p.longitude === "number" &&
                    p.latitude !== 0 &&
                    p.longitude !== 0
                )
                .map((p) => ({
                  lat: p.latitude,
                  lng: p.longitude,
                  recorded_at: p.fixTime ?? p.deviceTime,
                  speed:
                    typeof p.speed === "number" ? p.speed * 1.852 : null,
                  heading: p.course,
                  ignition:
                    typeof p.attributes?.ignition === "boolean"
                      ? p.attributes.ignition
                      : null,
                }))
            }
          } catch (err: any) {
            if (err?.name === "AbortError") {
              warning = "Traccar request timed out (20s)"
            } else {
              warning = err?.message ?? "Traccar fetch failed"
            }
          } finally {
            clearTimeout(timeout)
          }
        }
      }
    }
  } catch (err: any) {
    warning = err?.message ?? "Failed to load GPS positions"
  }

  // ── 5. Trip / stop segmentation (mirrors Route History) ─────
  // Same idle / ignition / speed thresholds as
  // components/tms/route-history-panel.tsx so the visual language
  // is consistent across the app.
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000
  const SPEED_THRESHOLD = 2 // km/h

  // Rotating palette — sync'd with the panel's TRIP_COLORS array.
  const TRIP_COLORS = [
    "#f59e0b",
    "#3b82f6",
    "#22c55e",
    "#ef4444",
    "#a855f7",
    "#06b6d4",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
  ]
  const STOP_COLOR = "#64748b"

  // ── Cargo-on-board timeline ───────────────────────────────
  //
  // Building this purely from `planned_date + planned_time_from` is
  // unsafe: dispatchers regularly re-sequence stops and the planned
  // dates land out of chronological order (e.g. a delivery dated
  // earlier than its own pickup). Time-sorting those events would
  // poison the cumulative sum and tag every leg as "empty".
  //
  // Instead we infer each stop's *actual* visit time from the GPS
  // track itself: the nearest fix to the stop's lat/lng (within a
  // 750 m halo) is treated as the visit timestamp. That timestamp
  // is then used to build a {ts, delta} event list in sequence_order,
  // which by construction yields a non-negative cargo curve that
  // follows the truck's real journey.
  //
  // Fallback chain when GPS proximity is unavailable for a stop:
  //   1. actual_arrival          (mobile-app check-in)
  //   2. planned_date + time     (last-resort, only used if neither
  //                               GPS nor actual is present for ANY
  //                               stop on the trip — i.e. the trip
  //                               has not started yet)
  const STOP_RADIUS_KM = 0.75

  function haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ) {
    const R = 6371
    const toRad = (x: number) => (x * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const lat1 = toRad(a.lat)
    const lat2 = toRad(b.lat)
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
    return 2 * R * Math.asin(Math.sqrt(h))
  }

  // For each stop, find the GPS fix that came closest to it. We
  // require the fix to be within STOP_RADIUS_KM of the stop's
  // lat/lng — otherwise we say the truck never reached that stop.
  type StopVisit = {
    stop: (typeof stops)[number]
    ts: number | null
    source: "gps" | "actual" | "planned" | null
  }
  const stopVisits: StopVisit[] = stops.map((s) => {
    if (s.lat != null && s.lng != null && positions.length) {
      let bestTs: number | null = null
      let bestDist = Infinity
      for (const p of positions) {
        const d = haversineKm({ lat: s.lat, lng: s.lng }, p)
        if (d < bestDist) {
          bestDist = d
          bestTs = new Date(p.recorded_at).getTime()
        }
      }
      if (bestTs != null && bestDist <= STOP_RADIUS_KM) {
        return { stop: s, ts: bestTs, source: "gps" }
      }
    }
    if (s.actual_arrival) {
      return { stop: s, ts: new Date(s.actual_arrival).getTime(), source: "actual" }
    }
    return { stop: s, ts: null, source: null }
  })

  // If no stop got a GPS-derived ts (trip not yet executed), fall
  // back to planned timestamps just to keep the segments rendering.
  const anyGps = stopVisits.some((v) => v.source === "gps" || v.source === "actual")
  if (!anyGps) {
    for (const v of stopVisits) {
      const t = stopTime(v.stop)
      if (t) {
        v.ts = t.getTime()
        v.source = "planned"
      }
    }
  }

  // Build cargo events in sequence_order. We classify on the
  // already-cleaned `stop_type` enum (lowercase 'pickup' / 'delivery'
  // — confirmed in the database), with a regex fallback for legacy
  // string variants (load, unload, drop, ...).
  type LoadEvent = { ts: number; delta: number; seq: number }
  const events: LoadEvent[] = []
  for (const v of stopVisits) {
    const s = v.stop
    if (v.ts == null || !s.stop_type) continue
    const type = s.stop_type.toLowerCase().trim()
    const isPickup =
      type === "pickup" ||
      (/(pick|load)/.test(type) && !/unload/.test(type))
    const isDelivery =
      type === "delivery" || /(deliv|unload|drop)/.test(type)
    if (isPickup) {
      events.push({ ts: v.ts, delta: +1, seq: s.sequence_order ?? 0 })
    } else if (isDelivery) {
      events.push({ ts: v.ts, delta: -1, seq: s.sequence_order ?? 0 })
    }
  }
  // Sort by ts now that ts is GPS-derived (so chronologically sane);
  // tie-break by sequence_order to keep deterministic ordering.
  events.sort((a, b) => a.ts - b.ts || a.seq - b.seq)

  const loadAt = (ts: number) => {
    let n = 0
    for (const e of events) {
      if (e.ts <= ts) n += e.delta
      else break
    }
    return Math.max(0, n) // clamp so a stray rounding can't fake "empty"
  }

  type Segment = {
    type: "trip" | "stop"
    color: string
    loaded: boolean // trip segments only — false for stops
    cargoCount: number // # of orders on board during this segment
    from: string
    to: string
    duration_ms: number
    distance_km: number
    avg_speed_kmh: number
    max_speed_kmh: number
    point_count: number
    start_lat: number
    start_lng: number
    end_lat: number
    end_lng: number
    positions: Array<{
      lat: number
      lng: number
      recorded_at: string
      speed?: number | null
      heading?: number | null
    }>
  }

  function haversine(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ) {
    const R = 6371
    const toRad = (x: number) => (x * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const lat1 = toRad(a.lat)
    const lat2 = toRad(b.lat)
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
    return 2 * R * Math.asin(Math.sqrt(h))
  }

  const segments: Segment[] = []
  let tripColorIdx = 0

  if (positions.length >= 2) {
    let segStart = 0
    let currentType: "trip" | "stop" =
      (positions[0].speed ?? 0) > SPEED_THRESHOLD ? "trip" : "stop"
    let idleStart: number | null =
      currentType === "stop"
        ? new Date(positions[0].recorded_at).getTime()
        : null

    const finishSegment = (endIdx: number) => {
      if (endIdx <= segStart) return
      const slice = positions.slice(segStart, endIdx + 1)
      const startT = new Date(slice[0].recorded_at).getTime()
      const endT = new Date(slice[slice.length - 1].recorded_at).getTime()
      let dist = 0
      for (let j = 1; j < slice.length; j++) dist += haversine(slice[j - 1], slice[j])
      const speeds = slice
        .map((p) => p.speed ?? 0)
        .filter((s) => s > 0)
      const avg =
        speeds.length > 0
          ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
          : 0
      const max = speeds.length > 0 ? Math.round(Math.max(...speeds)) : 0

      const cargoCount = loadAt(startT)
      const segColor =
        currentType === "trip"
          ? TRIP_COLORS[tripColorIdx % TRIP_COLORS.length]
          : STOP_COLOR

      segments.push({
        type: currentType,
        color: segColor,
        loaded: currentType === "trip" ? cargoCount > 0 : false,
        cargoCount,
        from: slice[0].recorded_at,
        to: slice[slice.length - 1].recorded_at,
        duration_ms: endT - startT,
        distance_km: Math.round(dist * 100) / 100,
        avg_speed_kmh: avg,
        max_speed_kmh: max,
        point_count: slice.length,
        start_lat: slice[0].lat,
        start_lng: slice[0].lng,
        end_lat: slice[slice.length - 1].lat,
        end_lng: slice[slice.length - 1].lng,
        positions: slice.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recorded_at: p.recorded_at,
          speed: p.speed ?? null,
          heading: p.heading ?? null,
        })),
      })

      if (currentType === "trip") tripColorIdx++
    }

    for (let i = 1; i < positions.length; i++) {
      const p = positions[i]
      const t = new Date(p.recorded_at).getTime()
      const sp = p.speed ?? 0

      if (currentType === "stop") {
        if (sp > SPEED_THRESHOLD && p.ignition !== false) {
          finishSegment(i - 1)
          segStart = i
          currentType = "trip"
          idleStart = null
        }
      } else {
        // currentType === "trip"
        if (p.ignition === false) {
          finishSegment(i - 1)
          segStart = i
          currentType = "stop"
          idleStart = t
        } else if (sp <= SPEED_THRESHOLD) {
          if (idleStart === null) {
            idleStart = t
          } else if (t - idleStart > IDLE_THRESHOLD_MS) {
            // Cut the segment back to where the idle started
            let splitIdx = i
            for (let j = segStart; j <= i; j++) {
              if (
                new Date(positions[j].recorded_at).getTime() >= idleStart
              ) {
                splitIdx = j
                break
              }
            }
            if (splitIdx > segStart) {
              finishSegment(splitIdx - 1)
              segStart = splitIdx
            }
            currentType = "stop"
          }
        } else {
          idleStart = null
        }
      }
    }
    finishSegment(positions.length - 1)
  }

  // ── 6. Aggregate stats ───────────────────────────────────────
  let distanceKm = 0
  for (let i = 1; i < positions.length; i++) {
    distanceKm += haversine(positions[i - 1], positions[i])
  }
  const tripSegs = segments.filter((s) => s.type === "trip")
  const stopSegs = segments.filter((s) => s.type === "stop")
  const loadedKm = tripSegs
    .filter((s) => s.loaded)
    .reduce((a, s) => a + s.distance_km, 0)
  const emptyKm = tripSegs
    .filter((s) => !s.loaded)
    .reduce((a, s) => a + s.distance_km, 0)
  const totalDriving = tripSegs.reduce((a, s) => a + s.duration_ms, 0)
  const totalStopped = stopSegs.reduce((a, s) => a + s.duration_ms, 0)

  return NextResponse.json({
    source,
    availableSources,
    from: fromTs.toISOString(),
    to: toTs.toISOString(),
    rangeSource,
    defaultFrom: firstStopTs ? firstStopTs.toISOString() : null,
    defaultTo: lastStopTs ? lastStopTs.toISOString() : null,
    savedFrom: trip.analysis_window_from ?? null,
    savedTo: trip.analysis_window_to ?? null,
    positions,
    segments,
    warning,
    stats: {
      points: positions.length,
      distance_km: Math.round(distanceKm * 100) / 100,
      loaded_km: Math.round(loadedKm * 100) / 100,
      empty_km: Math.round(emptyKm * 100) / 100,
      empty_pct:
        distanceKm > 0 ? Math.round((emptyKm / distanceKm) * 100) : 0,
      trip_count: tripSegs.length,
      stop_count: stopSegs.length,
      driving_ms: totalDriving,
      stopped_ms: totalStopped,
    },
  })
}
