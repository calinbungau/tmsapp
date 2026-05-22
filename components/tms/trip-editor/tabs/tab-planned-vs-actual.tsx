"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Loader2,
  Truck,
  Container,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  Activity,
  Gauge,
  Package,
  PackageX,
  CalendarRange,
  RotateCcw,
  CheckCircle2,
  Clock,
  Save,
  Navigation,
  Route as RouteIcon,
  MapPin,
} from "lucide-react"

type SourceType = "vehicle" | "trailer" | "driver"
type SegmentType = "trip" | "stop"

interface SegmentPosition {
  lat: number
  lng: number
  recorded_at: string
  speed?: number | null
  heading?: number | null
}

interface Position extends SegmentPosition {
  ignition?: boolean | null
}

interface Segment {
  type: SegmentType
  color: string
  loaded: boolean
  cargoCount: number
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
  positions: SegmentPosition[]
}

interface AvailableSource {
  value: SourceType
  label: string
  enabled: boolean
  detail?: string
  deviceId?: number | null
}

interface GpsResponse {
  source: SourceType
  availableSources: AvailableSource[]
  from: string
  to: string
  rangeSource: "query" | "saved" | "default"
  defaultFrom: string | null
  defaultTo: string | null
  savedFrom: string | null
  savedTo: string | null
  positions: Position[]
  segments: Segment[]
  warning: string | null
  stats: {
    points: number
    distance_km: number
    loaded_km: number
    empty_km: number
    empty_pct: number
    trip_count: number
    stop_count: number
    driving_ms: number
    stopped_ms: number
  }
}

interface Props {
  tripId: string
  trip: any
  stops: any[]
  onGpsTrackChange?: (
    track: {
      source: string
      positions: { lat: number; lng: number; timestamp: string }[]
      segments?: Array<{
        type: SegmentType
        color: string
        loaded: boolean
        from: string
        to: string
        distance_km: number
        avg_speed_kmh: number
        max_speed_kmh: number
        start_lat: number
        start_lng: number
        end_lat: number
        end_lng: number
        positions: { lat: number; lng: number; timestamp: string; speed?: number | null; heading?: number | null }[]
      }>
      hoveredSegmentIdx?: number | null
      selectedSegmentIdx?: number | null
    } | null
  ) => void
}

// ── Helpers ─────────────────────────────────────────────
function toLocalInputValue(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(v: string) {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.round(ms / 60000))
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function TabPlannedVsActual({
  tripId,
  trip,
  stops,
  onGpsTrackChange,
}: Props) {
  const [data, setData] = useState<GpsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<SourceType | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null)

  // Range editing — only sent to the API on Apply, so the user can edit
  // both ends without thrashing the server.
  const [rangeFrom, setRangeFrom] = useState<string | null>(null)
  const [rangeTo, setRangeTo] = useState<string | null>(null)
  const [rangeDirty, setRangeDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  )
  const [confirmedAt, setConfirmedAt] = useState<string | null>(
    trip?.route_confirmed_at ?? null
  )

  // Latest values keep the gpsTrack callback stable without breaking effect deps
  const onGpsTrackChangeRef = useRef(onGpsTrackChange)
  useEffect(() => {
    onGpsTrackChangeRef.current = onGpsTrackChange
  }, [onGpsTrackChange])

  // ── Fetch ─────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    const url = new URL(
      `/api/admin/tms/trips/${tripId}/gps-track`,
      window.location.origin
    )
    if (source) url.searchParams.set("source", source)

    fetch(url.toString())
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || "Failed to load GPS track")
        return j as GpsResponse
      })
      .then((d) => {
        if (!alive) return
        setData(d)
        setLoading(false)
        setSelectedSegment(null)

        if (!rangeDirty) {
          setRangeFrom(d.from)
          setRangeTo(d.to)
        }

        if (!source) {
          const firstEnabled = d.availableSources.find((s) => s.enabled)
          if (firstEnabled && firstEnabled.value !== d.source) {
            setSource(firstEnabled.value)
            return
          }
        }

        onGpsTrackChangeRef.current?.({
          source: d.source,
          positions: d.positions.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            timestamp: p.recorded_at,
          })),
          segments: d.segments.map((s) => ({
            type: s.type,
            color: s.color,
            loaded: s.loaded,
            from: s.from,
            to: s.to,
            distance_km: s.distance_km,
            avg_speed_kmh: s.avg_speed_kmh,
            max_speed_kmh: s.max_speed_kmh,
            start_lat: s.start_lat,
            start_lng: s.start_lng,
            end_lat: s.end_lat,
            end_lng: s.end_lng,
            positions: s.positions.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              timestamp: p.recorded_at,
              speed: p.speed,
              heading: p.heading,
            })),
          })),
          hoveredSegmentIdx: hoveredSegment,
          selectedSegmentIdx: selectedSegment,
        })
      })
      .catch((e) => {
        if (alive) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, source, refreshKey])

  // ── Push hover/select state to the map without re-fetching ──
  useEffect(() => {
    if (!data) return
    onGpsTrackChangeRef.current?.({
      source: data.source,
      positions: data.positions.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        timestamp: p.recorded_at,
      })),
      segments: data.segments.map((s) => ({
        type: s.type,
        color: s.color,
        loaded: s.loaded,
        from: s.from,
        to: s.to,
        distance_km: s.distance_km,
        avg_speed_kmh: s.avg_speed_kmh,
        max_speed_kmh: s.max_speed_kmh,
        start_lat: s.start_lat,
        start_lng: s.start_lng,
        end_lat: s.end_lat,
        end_lng: s.end_lng,
        positions: s.positions.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          timestamp: p.recorded_at,
          speed: p.speed,
          heading: p.heading,
        })),
      })),
      hoveredSegmentIdx: hoveredSegment,
      selectedSegmentIdx: selectedSegment,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredSegment, selectedSegment, data])

  // ── Apply / reset range ──────────────────────────────
  const applyRange = async () => {
    if (!rangeFrom || !rangeTo) return
    setSaving(true)
    setSaveStatus("idle")
    try {
      const res = await fetch(
        `/api/admin/tms/trips/${tripId}/analysis-window`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: rangeFrom,
            to: rangeTo,
            // Persist GPS-derived distance so the rest of the system
            // (P&L, fleet reports, KPIs) reads from a confirmed value.
            distance_km: data?.stats?.distance_km ?? null,
          }),
        }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || "Failed to save window")
      }
      const j = await res.json().catch(() => ({} as any))
      if (j?.route_confirmed_at) setConfirmedAt(j.route_confirmed_at)
      setSaveStatus("saved")
      setRangeDirty(false)
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSaveStatus("idle"), 2200)
    } catch (e: any) {
      setSaveStatus("error")
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const resetRange = async () => {
    setSaving(true)
    setSaveStatus("idle")
    try {
      const res = await fetch(
        `/api/admin/tms/trips/${tripId}/analysis-window`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: true }),
        }
      )
      if (!res.ok) throw new Error("Failed to reset window")
      setRangeFrom(null)
      setRangeTo(null)
      setRangeDirty(false)
      setConfirmedAt(null)
      setSaveStatus("saved")
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSaveStatus("idle"), 2200)
    } catch (e: any) {
      setSaveStatus("error")
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived ──────────────────────────────────────────
  const stopDeltas = useMemo(
    () =>
      stops.map((s) => {
        if (!s.actual_arrival || !s.planned_date) return null
        const planned = new Date(
          `${s.planned_date}T${s.planned_time_from || "00:00"}`
        )
        const actual = new Date(s.actual_arrival)
        return Math.round((actual.getTime() - planned.getTime()) / 60000)
      }),
    [stops]
  )

  const lastPos = data?.positions?.[data.positions.length - 1]
  const lastSpeed = lastPos?.speed ?? null
  const lastTs = lastPos?.recorded_at ? new Date(lastPos.recorded_at) : null
  const ageMinutes = lastTs
    ? Math.round((Date.now() - lastTs.getTime()) / 60000)
    : null

  const hasAnySource = (data?.availableSources ?? []).some((s) => s.enabled)

  const rangeBadge =
    data?.rangeSource === "saved"
      ? { label: "Saved range", tone: "primary" as const }
      : rangeDirty
      ? { label: "Editing", tone: "amber" as const }
      : { label: "Default range (first → last stop)", tone: "muted" as const }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* ── Range picker ──────────────────────────────── */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Analysis range
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              rangeBadge.tone === "primary"
                ? "bg-primary/15 text-primary border border-primary/30"
                : rangeBadge.tone === "amber"
                ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                : "bg-muted/40 text-muted-foreground border border-border/40"
            }`}
          >
            {rangeBadge.label}
          </span>
          {confirmedAt && (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              title={`Trip confirmed at ${new Date(confirmedAt).toLocaleString()}`}
            >
              <CheckCircle2 className="h-3 w-3" />
              Confirmed
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {saveStatus === "saved" && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            )}
            <button
              type="button"
              onClick={resetRange}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
              title="Restore the default first-stop → last-stop window"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="datetime-local"
            value={toLocalInputValue(rangeFrom)}
            onChange={(e) => {
              setRangeFrom(fromLocalInputValue(e.target.value))
              setRangeDirty(true)
            }}
            className="bg-background/50 border border-border/50 rounded-md px-2 py-1 text-[11px] tabular-nums focus:outline-none focus:border-primary/60 transition-colors"
          />
          <span className="text-[11px] text-muted-foreground">to</span>
          <input
            type="datetime-local"
            value={toLocalInputValue(rangeTo)}
            onChange={(e) => {
              setRangeTo(fromLocalInputValue(e.target.value))
              setRangeDirty(true)
            }}
            className="bg-background/50 border border-border/50 rounded-md px-2 py-1 text-[11px] tabular-nums focus:outline-none focus:border-primary/60 transition-colors"
          />
          <button
            type="button"
            onClick={applyRange}
            disabled={!rangeDirty || saving || !rangeFrom || !rangeTo}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Apply &amp; save
          </button>
        </div>
      </div>

      {/* ── Source selector ──────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          GPS Source
        </span>
        {data?.availableSources?.length ? (
          <div className="flex items-center gap-1 flex-wrap">
            {data.availableSources.map((s) => {
              const active = (source ?? data.source) === s.value
              const Icon =
                s.value === "vehicle"
                  ? Truck
                  : s.value === "trailer"
                  ? Container
                  : Smartphone
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={!s.enabled}
                  onClick={() => setSource(s.value)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                    active
                      ? "bg-primary/15 text-primary border-primary/40"
                      : s.enabled
                      ? "bg-background/60 text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted"
                      : "bg-muted/20 text-muted-foreground/50 border-border/20 cursor-not-allowed"
                  }`}
                  title={
                    s.enabled
                      ? `${s.label} · ${s.detail ?? ""}${
                          s.deviceId ? ` (device #${s.deviceId})` : ""
                        }`
                      : `${s.label} not configured`
                  }
                >
                  <Icon className="h-3 w-3" />
                  <span>{s.label}</span>
                  {s.detail && s.detail !== "—" && (
                    <span className="text-[10px] opacity-70">· {s.detail}</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground italic">
            Loading sources…
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-300 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {data?.warning && !error && (
        <div className="flex items-center gap-2 text-[11px] text-amber-300 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-3.5 w-3.5" />
          {data.warning}
        </div>
      )}

      {!loading && data && !hasAnySource && (
        <div className="text-[11px] text-muted-foreground px-3 py-2 rounded-md bg-muted/30 border border-border/40">
          No GPS source linked to this trip yet. Assign a vehicle, trailer, or
          driver with a tracking device in the master data.
        </div>
      )}

      {/* ── Stats grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat
          icon={RouteIcon}
          label="Total km"
          value={loading ? "…" : `${(data?.stats.distance_km ?? 0).toFixed(1)} km`}
          tone="amber"
        />
        <Stat
          icon={Clock}
          label="Driving"
          value={loading ? "…" : fmtDuration(data?.stats.driving_ms ?? 0)}
          tone="emerald"
        />
        <Stat
          icon={MapPin}
          label="Stopped"
          value={loading ? "…" : fmtDuration(data?.stats.stopped_ms ?? 0)}
        />
        <Stat
          icon={Package}
          label="Loaded km"
          value={loading ? "…" : `${(data?.stats.loaded_km ?? 0).toFixed(1)} km`}
          tone="emerald"
        />
        <Stat
          icon={PackageX}
          label="Empty km"
          value={
            loading
              ? "…"
              : `${(data?.stats.empty_km ?? 0).toFixed(1)} km${
                  data?.stats.empty_pct ? ` · ${data.stats.empty_pct}%` : ""
                }`
          }
          tone={
            (data?.stats.empty_pct ?? 0) > 25
              ? "red"
              : (data?.stats.empty_pct ?? 0) > 10
              ? "amber"
              : "muted"
          }
        />
        <Stat
          icon={Activity}
          label="Trips · Stops"
          value={
            loading
              ? "…"
              : `${data?.stats.trip_count ?? 0} · ${data?.stats.stop_count ?? 0}`
          }
        />
      </div>

      {/* ── Live indicator ────────────────────────── */}
      {data && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
          <Gauge className="h-3 w-3" />
          <span>
            {lastSpeed != null
              ? `Last speed ${Math.round(lastSpeed)} km/h`
              : "No speed reading"}
          </span>
          <span className="text-border">•</span>
          <span>
            {ageMinutes == null
              ? "No GPS data"
              : ageMinutes < 60
              ? `Last seen ${ageMinutes} min ago`
              : `Last seen ${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`}
          </span>
          <span className="text-border">•</span>
          <span>{data.stats.points} GPS points</span>
        </div>
      )}

      {/* ── Empty-km callout ──────────────────────── */}
      {data && data.stats.empty_pct >= 25 && data.stats.distance_km > 50 && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <PackageX className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-semibold text-amber-200">
              {data.stats.empty_pct}% of this trip ran empty
            </span>{" "}
            <span className="text-muted-foreground">
              ({data.stats.empty_km.toFixed(0)} km of{" "}
              {data.stats.distance_km.toFixed(0)} km · &ldquo;km pe gol&rdquo;).
              Empty trip legs appear dashed on the map.
            </span>
          </div>
        </div>
      )}

      {/* ── Trip timeline ───────────────────────── */}
      {data && data.segments.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
            <h3 className="text-xs font-semibold">Trip timeline</h3>
            <span className="text-[10px] text-muted-foreground">
              {data.stats.trip_count} trip{data.stats.trip_count === 1 ? "" : "s"}
              {data.stats.stop_count > 0 &&
                ` · ${data.stats.stop_count} stop${
                  data.stats.stop_count === 1 ? "" : "s"
                }`}
            </span>
          </div>
          <div className="divide-y divide-border/20 max-h-[420px] overflow-y-auto">
            {data.segments.map((seg, idx) => {
              const isSelected = selectedSegment === idx
              const isHovered = hoveredSegment === idx
              const isLast = idx === data.segments.length - 1

              if (seg.type === "stop") {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setSelectedSegment((prev) => (prev === idx ? null : idx))
                    }
                    onMouseEnter={() => setHoveredSegment(idx)}
                    onMouseLeave={() => setHoveredSegment(null)}
                    className={`relative w-full text-left flex items-start gap-3 px-3 py-2.5 transition-all ${
                      isSelected
                        ? "bg-muted/30"
                        : isHovered
                        ? "bg-muted/15"
                        : "hover:bg-muted/10"
                    }`}
                  >
                    {/* Timeline rail with P pin */}
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className="w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-600 flex items-center justify-center shadow-sm">
                        <span className="text-foreground font-extrabold text-[9px] tracking-wider">
                          P
                        </span>
                      </div>
                      {!isLast && (
                        <div className="w-0.5 flex-1 min-h-[20px] bg-border/40 mt-1" />
                      )}
                    </div>
                    {/* Body */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-bold font-mono text-foreground tabular-nums">
                          {fmtTime(seg.from)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          —
                        </span>
                        <span className="text-[11px] font-bold font-mono text-foreground tabular-nums">
                          {fmtTime(seg.to)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium ml-1">
                          Stop
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {fmtDuration(seg.duration_ms)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {seg.start_lat.toFixed(4)}, {seg.start_lng.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              }

              // Trip segment
              const tripCount = data.segments
                .slice(0, idx + 1)
                .filter((s) => s.type === "trip").length

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setSelectedSegment((prev) => (prev === idx ? null : idx))
                  }
                  onMouseEnter={() => setHoveredSegment(idx)}
                  onMouseLeave={() => setHoveredSegment(null)}
                  className={`relative w-full text-left flex items-start gap-3 px-3 py-2.5 transition-all ${
                    isSelected
                      ? "bg-muted/30"
                      : isHovered
                      ? "bg-muted/15"
                      : "hover:bg-muted/10"
                  }`}
                >
                  {/* Timeline rail with colored Navigation node */}
                  <div className="flex flex-col items-center shrink-0 pt-0.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                      style={{
                        backgroundColor: seg.color + "26",
                        border: `2px solid ${seg.color}`,
                      }}
                    >
                      <Navigation
                        className="h-3 w-3"
                        style={{ color: seg.color }}
                      />
                    </div>
                    {!isLast && (
                      <div
                        className="w-0.5 flex-1 min-h-[20px] mt-1"
                        style={{ backgroundColor: seg.color + "55" }}
                      />
                    )}
                  </div>
                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: seg.color }}
                      >
                        Trip {tripCount}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
                          seg.loaded
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {seg.loaded
                          ? `Loaded · ${seg.cargoCount}`
                          : "Empty (km pe gol)"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[11px] font-bold font-mono text-foreground tabular-nums">
                        {fmtTime(seg.from)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        →
                      </span>
                      <span className="text-[11px] font-bold font-mono text-foreground tabular-nums">
                        {fmtTime(seg.to)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {fmtDuration(seg.duration_ms)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <RouteIcon className="h-2.5 w-2.5" />
                        {seg.distance_km.toFixed(1)} km
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-2.5 w-2.5" />
                        {seg.avg_speed_kmh} km/h
                      </span>
                      {seg.max_speed_kmh > 0 && (
                        <span className="text-muted-foreground/70">
                          max {seg.max_speed_kmh}
                        </span>
                      )}
                    </div>
                    {/* Color bar — fills on hover/select */}
                    <div
                      className="mt-1.5 h-0.5 rounded-full w-full overflow-hidden"
                      style={{ backgroundColor: seg.color + "33" }}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{
                          backgroundColor: seg.color,
                          width: isSelected || isHovered ? "100%" : "0%",
                        }}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Stop ETA list (planned vs actual deltas) ───────── */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
        <h3 className="text-xs font-semibold mb-2">
          Stop ETA · Planned vs Actual
        </h3>
        <div className="space-y-1">
          {stops.map((s: any, i: number) => {
            const d = stopDeltas[i]
            const tone =
              d == null
                ? "text-muted-foreground"
                : d <= 0
                ? "text-emerald-400"
                : d <= 15
                ? "text-amber-400"
                : "text-red-400"
            return (
              <div
                key={s.id ?? i}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="truncate flex-1">
                  {s.company_name || s.address || s.city || "—"}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  Plan: {s.planned_date || "—"} {s.planned_time_from || ""}
                </span>
                <span
                  className={`tabular-nums font-semibold ${tone} min-w-[80px] text-right`}
                >
                  {s.actual_arrival
                    ? `Act: ${fmtDateTime(s.actual_arrival)}`
                    : "Not arrived"}
                </span>
                <span
                  className={`tabular-nums font-bold ${tone} min-w-[60px] text-right`}
                >
                  {d == null
                    ? "—"
                    : d === 0
                    ? "on time"
                    : d > 0
                    ? `+${d}m`
                    : `${d}m`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading GPS history…
        </div>
      )}

      {!loading &&
        data &&
        data.positions.length === 0 &&
        hasAnySource &&
        !data.warning && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-3 py-2 rounded-md bg-muted/30 border border-border/40">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            No GPS positions recorded for this trip&apos;s window. Try
            extending the analysis range or switching the GPS source.
          </div>
        )}
    </div>
  )
}

function Stat({
  icon: I,
  label,
  value,
  tone = "muted",
}: {
  icon: any
  label: string
  value: string
  tone?: "muted" | "emerald" | "amber" | "red"
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
      ? "text-amber-400"
      : tone === "red"
      ? "text-red-400"
      : "text-foreground"
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
      <I className={`h-4 w-4 ${tone === "muted" ? "text-muted-foreground" : toneCls}`} />
      <div className="min-w-0">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        <div className={`text-xs font-bold tabular-nums truncate ${toneCls}`}>
          {value}
        </div>
      </div>
    </div>
  )
}
