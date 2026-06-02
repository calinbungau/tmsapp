"use client";

/**
 * DetermineCostMap
 * ──────────────────────────────────────────────────────────────────────────
 * Leaflet map embedded inside DetermineCostDialog.
 *
 *   • Pickup/delivery markers from the order's planned stops (always shown).
 *   • A GPS route rendered with the SAME visual language as the dispatcher's
 *     "Route History" panel once the user clicks "Get GPS distance":
 *       – the raw positions are segmented into trip / stop (break) periods
 *       – each driving leg gets its own rotating-palette color
 *       – direction arrows are dropped along each leg, rotated by heading
 *       – every break drops a "P" pin
 *       – an A → B → break → … legend is shown in the corner
 *
 * This component is loaded with `next/dynamic({ ssr: false })` from the
 * dialog because Leaflet pokes at `window` on import.
 */

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Route, Clock, MapPin, Navigation, Gauge, Eye, EyeOff } from "lucide-react";

interface Stop {
  id: string;
  stop_type?: string;
  label: string;
  lat: number;
  lng: number;
}

interface Position {
  lat: number;
  lng: number;
  time?: string;
  speed?: number;
  course?: number;
  ignition?: boolean | null;
  address?: string | null;
  totalDistance?: number | null;
}

interface Props {
  stops: Stop[];
  track: Position[];
  /** Plate / unit label shown in the Route-History-style panel header. */
  unitLabel?: string;
}

// Rotating palette — identical to the dispatcher Route History panel so the
// two views feel like one product.
const TRIP_COLORS = [
  "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];
const STOP_COLOR = "#64748b";

// ─── Trip / stop segmentation (ported from route-history-panel) ────────────
interface Segment {
  type: "trip" | "stop";
  color: string;
  positions: Position[];
  startTime?: string;
  endTime?: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress?: string | null;
  endAddress?: string | null;
  distance: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function segmentTrips(positions: Position[]): Segment[] {
  if (positions.length < 2) return [];

  const segments: Segment[] = [];
  let currentType: "trip" | "stop" = "stop";
  let segmentStart = 0;
  let idleStart: number | null = null;
  const IDLE_THRESHOLD = 5 * 60 * 1000;
  const SPEED_THRESHOLD = 2;
  let tripColorIdx = 0;

  const time = (p: Position) => new Date(p.time || 0).getTime();

  const finishSegment = (end: number) => {
    if (end <= segmentStart) return;
    const pts = positions.slice(segmentStart, end + 1);
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    }
    const speeds = pts.filter(p => (p.speed ?? 0) > 0).map(p => p.speed as number);
    const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
    const maxSpeed = speeds.length ? Math.round(Math.max(...speeds)) : 0;
    const color = currentType === "trip" ? TRIP_COLORS[tripColorIdx % TRIP_COLORS.length] : STOP_COLOR;

    segments.push({
      type: currentType,
      color,
      positions: pts,
      startTime: pts[0].time,
      endTime: pts[pts.length - 1].time,
      startLat: pts[0].lat,
      startLng: pts[0].lng,
      endLat: pts[pts.length - 1].lat,
      endLng: pts[pts.length - 1].lng,
      startAddress: pts[0].address ?? null,
      endAddress: pts[pts.length - 1].address ?? null,
      distance: Math.round(dist * 10) / 10,
      duration: time(pts[pts.length - 1]) - time(pts[0]),
      avgSpeed,
      maxSpeed,
    });

    if (currentType === "trip") tripColorIdx++;
  };

  currentType = (positions[0].speed ?? 0) > SPEED_THRESHOLD ? "trip" : "stop";
  if (currentType === "stop") idleStart = time(positions[0]);

  for (let i = 1; i < positions.length; i++) {
    const p = positions[i];
    const t = time(p);

    if (currentType === "stop") {
      if ((p.speed ?? 0) > SPEED_THRESHOLD && p.ignition !== false) {
        finishSegment(i - 1);
        segmentStart = i;
        currentType = "trip";
        idleStart = null;
      }
    } else {
      if (p.ignition === false) {
        finishSegment(i - 1);
        segmentStart = i;
        currentType = "stop";
        idleStart = t;
      } else if ((p.speed ?? 0) <= SPEED_THRESHOLD) {
        if (idleStart === null) {
          idleStart = t;
        } else if (t - idleStart > IDLE_THRESHOLD) {
          let splitIdx = i;
          for (let j = segmentStart; j <= i; j++) {
            if (time(positions[j]) >= idleStart) { splitIdx = j; break; }
          }
          if (splitIdx > segmentStart) {
            finishSegment(splitIdx - 1);
            segmentStart = splitIdx;
          }
          currentType = "stop";
        }
      } else {
        idleStart = null;
      }
    }
  }

  finishSegment(positions.length - 1);
  return segments;
}

// Color the planned-stop marker by role so pickup/delivery are distinct.
function markerColor(stopType?: string): string {
  switch (stopType) {
    case "pickup":       return "#10b981";
    case "delivery":     return "#ef4444";
    case "swap":
    case "transshipment":
    case "intermediate": return "#f59e0b";
    default:             return "#6366f1";
  }
}

function buildIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 0C4.92 0 0 4.92 0 11c0 8.25 11 19 11 19s11-10.75 11-19C22 4.92 17.08 0 11 0z" fill="${color}"/>
        <circle cx="11" cy="11" r="4" fill="white"/>
      </svg>
    `,
    iconSize: [22, 30],
    iconAnchor: [11, 30],
    popupAnchor: [0, -28],
  });
}

export default function DetermineCostMap({ stops, track, unitLabel }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef       = React.useRef<L.Map | null>(null);
  const layerRef     = React.useRef<L.LayerGroup | null>(null);
  const hasFittedRef = React.useRef(false);
  const [mapZoom, setMapZoom] = React.useState(5);

  // Timeline interactivity — mirrors the dispatcher Route History panel.
  const [hiddenSegments, setHiddenSegments]   = React.useState<Set<number>>(new Set());
  const [selectedSegment, setSelectedSegment] = React.useState<number | null>(null);
  const [hoveredSegment, setHoveredSegment]   = React.useState<number | null>(null);

  // Segment the GPS track into driving legs + breaks (memoized).
  const segments = React.useMemo(() => segmentTrips(track), [track]);

  // Aggregate stats shown in the summary bar.
  const summary = React.useMemo(() => {
    if (segments.length === 0) return null;
    let totalDistance = 0, totalDriving = 0, totalStopped = 0, tripCount = 0;
    for (const s of segments) {
      if (s.type === "trip") { totalDistance += s.distance; totalDriving += s.duration; tripCount++; }
      else { totalStopped += s.duration; }
    }
    return { totalDistance: Math.round(totalDistance * 10) / 10, totalDriving, totalStopped, tripCount };
  }, [segments]);

  const allTripsHidden = segments.length > 0 && segments.every((_, i) => hiddenSegments.has(i));

  const toggleSegmentVisibility = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenSegments(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAllVisibility = () => {
    setHiddenSegments(prev =>
      prev.size >= segments.length ? new Set() : new Set(segments.map((_, i) => i)),
    );
  };

  const handleSegmentClick = (idx: number) =>
    setSelectedSegment(prev => (prev === idx ? null : idx));

  // Re-fit the viewport whenever a *new* track is loaded (e.g. "Get GPS distance").
  React.useEffect(() => {
    hasFittedRef.current = false;
    setHiddenSegments(new Set());
    setSelectedSegment(null);
  }, [track]);

  // Fly to a segment when it is selected from the timeline.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedSegment == null) return;
    const seg = segments[selectedSegment];
    if (!seg) return;
    const pts: L.LatLngExpression[] =
      seg.type === "trip"
        ? seg.positions.map(p => [p.lat, p.lng] as [number, number])
        : [[seg.startLat, seg.startLng]];
    if (pts.length === 1) map.setView(pts[0], 14);
    else map.fitBounds(L.latLngBounds(pts as L.LatLngExpression[]), { padding: [60, 60], maxZoom: 15 });
  }, [selectedSegment, segments]);

  // Initialise the map exactly once.
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([50, 10], 4);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: "&copy; OpenStreetMap &copy; CARTO",
      },
    ).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const onZoom = () => setMapZoom(map.getZoom());
    map.on("zoomend", onZoom);
    setMapZoom(map.getZoom());

    return () => {
      map.off("zoomend", onZoom);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-render markers + GPS route whenever stops, segments or zoom change.
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // `stopPts` = planned pickup/delivery markers (may be far apart);
    // `gpsPts`  = points from the real driven track. We fit to the GPS track
    // when it exists so the view hugs the route exactly like Route History,
    // and only fall back to the planned stops before any GPS is pulled.
    const stopPts: L.LatLngExpression[] = [];
    const gpsPts: L.LatLngExpression[] = [];

    // 1) Planned stops (always shown, even before GPS is pulled).
    stops.forEach((s) => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
      L.marker([s.lat, s.lng], { icon: buildIcon(markerColor(s.stop_type)) })
        .bindPopup(
          `<div style="font-size:11px"><strong>${s.label}</strong>${s.stop_type ? `<br/><span style="opacity:.7">${s.stop_type}</span>` : ""}</div>`,
        )
        .addTo(layer);
      stopPts.push([s.lat, s.lng]);
    });

    // Faint dashed connector between stops to suggest the planned route
    // before the real GPS route lands.
    if (stops.length >= 2 && segments.length === 0) {
      L.polyline(stops.map(s => [s.lat, s.lng] as [number, number]), {
        color: "#6366f1",
        opacity: 0.4,
        weight: 2,
        dashArray: "6,6",
      }).addTo(layer);
    }

    // 2) GPS route — per-leg colored polylines + arrows + break pins.
    const getArrowInterval = (count: number) => {
      if (mapZoom >= 16) return Math.max(Math.floor(count / 40), 1);
      if (mapZoom >= 14) return Math.max(Math.floor(count / 25), 2);
      if (mapZoom >= 12) return Math.max(Math.floor(count / 15), 3);
      if (mapZoom >= 10) return Math.max(Math.floor(count / 8), 5);
      return Math.max(Math.floor(count / 4), 8);
    };

    segments.forEach((seg, idx) => {
      const hidden = hiddenSegments.has(idx);
      const highlight = selectedSegment === idx || hoveredSegment === idx;

      if (seg.type === "trip" && seg.positions.length > 1) {
        const latlngs = seg.positions.map(p => [p.lat, p.lng] as [number, number]);
        latlngs.forEach(ll => gpsPts.push(ll));
        if (hidden) return;

        L.polyline(latlngs, {
          color: seg.color,
          weight: highlight ? 6 : 3,
          opacity: highlight ? 1 : 0.9,
          lineCap: "round",
          lineJoin: "round",
          smoothFactor: 1,
        }).addTo(layer);

        // Direction arrows — density based on zoom level, rotated by heading.
        const arrowInterval = getArrowInterval(seg.positions.length);
        for (let i = arrowInterval; i < seg.positions.length - 1; i += arrowInterval) {
          const p = seg.positions[i];
          const heading = p.course ?? 0;
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              className: "",
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: `<div><svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${heading}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))"><path d="M12 2 L18 18 L12 14 L6 18 Z" fill="${seg.color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/></svg></div>`,
            }),
            zIndexOffset: 1300,
          })
            .bindPopup(
              `<div style="font-family:system-ui;min-width:160px;font-size:11px;line-height:1.5">
                <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:${seg.color}">${fmtTime(p.time)}</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
                  <span style="color:#94a3b8">Speed:</span><span style="font-weight:600">${Math.round(p.speed ?? 0)} km/h</span>
                  <span style="color:#94a3b8">Heading:</span><span>${Math.round(heading)}\u00B0</span>
                </div>
                ${p.address ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);color:#94a3b8;font-size:10px">${p.address}</div>` : ""}
              </div>`,
              { closeButton: true, maxWidth: 250 },
            )
            .addTo(layer);
        }

        // Start dot when a new leg begins (first leg, or right after a break).
        if (idx === 0 || (idx > 0 && segments[idx - 1].type === "stop")) {
          const sp = seg.positions[0];
          L.marker([sp.lat, sp.lng], {
            icon: L.divIcon({
              className: "",
              iconSize: [10, 10],
              iconAnchor: [5, 5],
              html: `<div style="width:10px;height:10px;border-radius:50%;background:${seg.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
            }),
            zIndexOffset: 1250,
          }).addTo(layer);
        }
      }

      // Break / stop pin.
      if (seg.type === "stop") {
        gpsPts.push([seg.startLat, seg.startLng]);
        if (hidden) return;
        L.marker([seg.startLat, seg.startLng], {
          icon: L.divIcon({
            className: "",
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            html: `<div style="width:26px;height:26px;border-radius:50%;background:#0f172a;border:2px solid ${STOP_COLOR};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5)">
              <span style="color:white;font-weight:800;font-size:10px">P</span>
            </div>`,
          }),
          zIndexOffset: 1200,
        })
          .bindPopup(
            `<div style="font-family:system-ui;min-width:150px;font-size:11px;line-height:1.5">
              <div style="font-weight:700;font-size:12px;margin-bottom:4px">Break</div>
              <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
                <span style="color:#94a3b8">Time:</span><span style="font-weight:600">${fmtTime(seg.startTime)} - ${fmtTime(seg.endTime)}</span>
                <span style="color:#94a3b8">Duration:</span><span>${fmtDuration(seg.duration)}</span>
              </div>
              ${seg.positions[0]?.address ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);color:#94a3b8;font-size:10px">${seg.positions[0].address}</div>` : ""}
            </div>`,
            { closeButton: true, maxWidth: 250 },
          )
          .addTo(layer);
      }
    });

    // Fit ONCE per data load (re-armed whenever a new track arrives), hugging
    // the real GPS track when present — exactly like the Route History map.
    if (!hasFittedRef.current) {
      const fitPts = gpsPts.length >= 2 ? gpsPts : stopPts;
      if (fitPts.length === 1) {
        map.setView(fitPts[0] as L.LatLngExpression, 9);
        hasFittedRef.current = true;
      } else if (fitPts.length >= 2) {
        map.fitBounds(L.latLngBounds(fitPts as L.LatLngExpression[]), { padding: [50, 50], maxZoom: 15 });
        hasFittedRef.current = true;
      }
    }

    // Recalculate size in case the dialog only just opened.
    setTimeout(() => map.invalidateSize(), 0);
  }, [stops, segments, mapZoom, hiddenSegments, selectedSegment, hoveredSegment]);

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="absolute inset-0" />

      {stops.length === 0 && track.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none bg-background/40">
          No stops with coordinates yet.
        </div>
      )}

      {/* Route History panel — 1-1 with the dispatcher view (minus range select) */}
      {segments.length > 0 && (
        <div className="absolute top-3 left-3 z-[1000] flex w-[300px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-border/50 bg-card/95 backdrop-blur-md shadow-xl">
          {/* Header */}
          <div className="shrink-0 border-b border-border/20 px-4 pb-2 pt-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Route className="h-4 w-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Route History</h3>
                {unitLabel && <p className="text-[10px] text-muted-foreground truncate">{unitLabel}</p>}
              </div>
            </div>
          </div>

          {/* Summary bar */}
          {summary && (
            <div className="px-4 py-2 border-b border-border/20 bg-muted/5 shrink-0">
              <div className="flex items-center gap-3 text-[10px]">
                <div className="flex items-center gap-1">
                  <Route className="h-3 w-3 text-amber-400" />
                  <span className="font-semibold text-foreground">{summary.totalDistance} km</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-emerald-400" />
                  <span className="text-muted-foreground">{fmtDuration(summary.totalDriving)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-blue-400" />
                  <span className="text-muted-foreground">{fmtDuration(summary.totalStopped)}</span>
                </div>
                <div className="ml-auto text-muted-foreground">
                  {summary.tripCount} trip{summary.tripCount !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={toggleAllVisibility}>
                {allTripsHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {allTripsHidden ? "Show all trips" : "Hide all trips"}
              </button>
            </div>
          )}

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {segments.map((seg, idx) => {
              const isSelected = selectedSegment === idx;
              const isHovered = hoveredSegment === idx;
              const isHidden = hiddenSegments.has(idx);

              if (seg.type === "stop") {
                return (
                  <div
                    key={idx}
                    className={`relative group flex items-start gap-3 px-4 py-2.5 transition-all ${isHidden ? "opacity-30" : ""} ${isSelected ? "bg-muted/15" : "hover:bg-muted/10"}`}>
                    <button
                      className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all"
                      onClick={(e) => toggleSegmentVisibility(idx, e)}
                      title={isHidden ? "Show on map" : "Hide from map"}>
                      {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                    <button
                      className="flex items-start gap-3 w-full text-left"
                      onClick={() => handleSegmentClick(idx)}
                      onMouseEnter={() => setHoveredSegment(idx)}
                      onMouseLeave={() => setHoveredSegment(null)}>
                      <div className="flex flex-col items-center shrink-0 pt-0.5">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 border-2 border-zinc-600 flex items-center justify-center">
                          <span className="text-white font-extrabold text-[9px]">P</span>
                        </div>
                        {idx < segments.length - 1 && <div className="w-0.5 flex-1 min-h-[20px] bg-border/30 mt-1" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-bold font-mono text-foreground">{fmtTime(seg.startTime)}</span>
                          <span className="text-[10px] text-muted-foreground">-</span>
                          <span className="text-[12px] font-bold font-mono text-foreground">{fmtTime(seg.endTime)}</span>
                        </div>
                        {seg.startAddress && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{seg.startAddress}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[9px] text-zinc-500">
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {fmtDuration(seg.duration)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className={`relative group flex items-start gap-3 px-4 py-2.5 transition-all ${isHidden ? "opacity-30" : ""} ${isSelected ? "bg-muted/15" : "hover:bg-muted/10"}`}>
                  <button
                    className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all"
                    onClick={(e) => toggleSegmentVisibility(idx, e)}
                    title={isHidden ? "Show on map" : "Hide from map"}>
                    {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    className="flex items-start gap-3 w-full text-left"
                    onClick={() => handleSegmentClick(idx)}
                    onMouseEnter={() => setHoveredSegment(idx)}
                    onMouseLeave={() => setHoveredSegment(null)}>
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: seg.color + "20", border: `2px solid ${seg.color}` }}>
                        <Navigation className="h-3 w-3" style={{ color: seg.color }} />
                      </div>
                      {idx < segments.length - 1 && (
                        <div className="w-0.5 flex-1 min-h-[20px] mt-1" style={{ backgroundColor: seg.color + "40" }} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-bold font-mono text-foreground">{fmtTime(seg.startTime)}</span>
                        {seg.startAddress && <span className="text-[10px] text-muted-foreground truncate">{seg.startAddress}</span>}
                      </div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-[12px] font-bold font-mono text-foreground">{fmtTime(seg.endTime)}</span>
                        {seg.endAddress && <span className="text-[10px] text-muted-foreground truncate">{seg.endAddress}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[9px]">
                        <span className="flex items-center gap-0.5 text-zinc-400">
                          <Clock className="h-2.5 w-2.5" /> {fmtDuration(seg.duration)}
                        </span>
                        <span className="flex items-center gap-0.5 text-zinc-400">
                          <Route className="h-2.5 w-2.5" /> {seg.distance} km
                        </span>
                        <span className="flex items-center gap-0.5 text-zinc-400">
                          <Gauge className="h-2.5 w-2.5" /> {seg.avgSpeed} km/h
                        </span>
                        {seg.maxSpeed > 0 && (
                          <span className="flex items-center gap-0.5 text-zinc-500">max {seg.maxSpeed}</span>
                        )}
                      </div>
                      <div className="mt-1.5 h-0.5 rounded-full w-full" style={{ backgroundColor: seg.color + "40" }}>
                        <div className="h-full rounded-full" style={{ backgroundColor: seg.color, width: isSelected || isHovered ? "100%" : "0%", transition: "width 0.3s ease" }} />
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
