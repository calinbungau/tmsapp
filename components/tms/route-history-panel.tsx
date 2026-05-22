"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  X, Clock, Route, MapPin, Gauge, Calendar, ChevronLeft, ChevronRight,
  Navigation, Loader2, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import L from "leaflet";

// ─── Types ───────────────────────────────────
interface HistoryPosition {
  id: number;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  address: string | null;
  time: string;
  ignition: boolean | null;
  motion: boolean | null;
  totalDistance: number | null;
}

interface TripSegment {
  type: "trip" | "stop";
  startTime: string;
  endTime: string;
  startAddress: string | null;
  endAddress: string | null;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  positions: HistoryPosition[];
  distance: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
  color: string;
}

interface DaySummary {
  totalDistance: number;
  totalDriving: number;
  totalStopped: number;
  tripCount: number;
  stopCount: number;
}

// Rotating palette -- all high-visibility colors on dark maps
const TRIP_COLORS = [
  "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

// ─── Helper functions ────────────────────────
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Trip segmentation ────────────────────
function segmentTrips(positions: HistoryPosition[]): TripSegment[] {
  if (positions.length < 2) return [];

  const segments: TripSegment[] = [];
  let currentType: "trip" | "stop" = "stop";
  let segmentStart = 0;
  let idleStart: number | null = null;
  const IDLE_THRESHOLD = 5 * 60 * 1000;
  const SPEED_THRESHOLD = 2;
  let tripColorIdx = 0;

  const finishSegment = (end: number) => {
    if (end <= segmentStart) return;
    const pts = positions.slice(segmentStart, end + 1);
    const startT = new Date(pts[0].time).getTime();
    const endT = new Date(pts[pts.length - 1].time).getTime();
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversineDistance(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    }
    const speeds = pts.filter(p => p.speed > 0).map(p => p.speed);
    const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const color = currentType === "trip" ? TRIP_COLORS[tripColorIdx % TRIP_COLORS.length] : "#64748b";

    segments.push({
      type: currentType,
      startTime: pts[0].time,
      endTime: pts[pts.length - 1].time,
      startAddress: pts[0].address,
      endAddress: pts[pts.length - 1].address,
      startLat: pts[0].lat,
      startLng: pts[0].lng,
      endLat: pts[pts.length - 1].lat,
      endLng: pts[pts.length - 1].lng,
      positions: pts,
      distance: Math.round(dist * 10) / 10,
      duration: endT - startT,
      avgSpeed,
      maxSpeed,
      color,
    });

    if (currentType === "trip") tripColorIdx++;
  };

  currentType = positions[0].speed > SPEED_THRESHOLD ? "trip" : "stop";
  if (currentType === "stop") idleStart = new Date(positions[0].time).getTime();

  for (let i = 1; i < positions.length; i++) {
    const p = positions[i];
    const t = new Date(p.time).getTime();

    if (currentType === "stop") {
      if (p.speed > SPEED_THRESHOLD && p.ignition !== false) {
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
      } else if (p.speed <= SPEED_THRESHOLD) {
        if (idleStart === null) {
          idleStart = t;
        } else if (t - idleStart > IDLE_THRESHOLD) {
          let splitIdx = i;
          for (let j = segmentStart; j <= i; j++) {
            if (new Date(positions[j].time).getTime() >= idleStart) {
              splitIdx = j;
              break;
            }
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

// ─── Route History Panel ─────────────────────
export default function RouteHistoryPanel({
  vehicleId,
  vehiclePlate,
  adminId,
  mapRef,
  onClose,
}: {
  vehicleId: string;
  vehiclePlate: string;
  adminId: string;
  mapRef: React.RefObject<L.Map | null>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<HistoryPosition[]>([]);
  const [segments, setSegments] = useState<TripSegment[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [hiddenSegments, setHiddenSegments] = useState<Set<number>>(new Set());
  const [rangeMode, setRangeMode] = useState(false);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const historyLayerRef = useRef<L.LayerGroup | null>(null);
  const hasFittedRef = useRef(false);
  const [mapZoom, setMapZoom] = useState(10);

  // Listen to map zoom changes for dynamic arrow density
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onZoom = () => setMapZoom(map.getZoom());
    map.on("zoomend", onZoom);
    setMapZoom(map.getZoom());
    return () => { map.off("zoomend", onZoom); };
  }, [mapRef]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPositions([]);
    setSegments([]);
    setSummary(null);
    setSelectedSegment(null);
    setHiddenSegments(new Set());
    hasFittedRef.current = false;

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    const from = new Date(date);
    from.setHours(sh || 0, sm || 0, 0, 0);
    const to = rangeMode ? new Date(endDate) : new Date(date);
    to.setHours(eh || 23, em || 59, 59, 999);

    try {
      const res = await fetch(
        `/api/traccar/route-history?adminId=${adminId}&vehicleId=${vehicleId}&from=${from.toISOString()}&to=${to.toISOString()}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      const pts: HistoryPosition[] = data.positions || [];
      setPositions(pts);

      const segs = segmentTrips(pts);
      setSegments(segs);

      const trips = segs.filter(s => s.type === "trip");
      const stops = segs.filter(s => s.type === "stop");
      setSummary({
        totalDistance: Math.round(trips.reduce((a, s) => a + s.distance, 0) * 10) / 10,
        totalDriving: trips.reduce((a, s) => a + s.duration, 0),
        totalStopped: stops.reduce((a, s) => a + s.duration, 0),
        tripCount: trips.length,
        stopCount: stops.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [adminId, vehicleId, date, rangeMode, endDate, startTime, endTime]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ─── Draw route history on map ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (historyLayerRef.current) {
      historyLayerRef.current.clearLayers();
    } else {
      historyLayerRef.current = L.layerGroup().addTo(map);
    }

    if (segments.length === 0) return;

    const group = historyLayerRef.current;
    const allPoints: L.LatLng[] = [];

    // Calculate arrow interval based on zoom -- more arrows when zoomed in
    const getArrowInterval = (posCount: number) => {
      if (mapZoom >= 16) return Math.max(Math.floor(posCount / 40), 1);
      if (mapZoom >= 14) return Math.max(Math.floor(posCount / 25), 2);
      if (mapZoom >= 12) return Math.max(Math.floor(posCount / 15), 3);
      if (mapZoom >= 10) return Math.max(Math.floor(posCount / 8), 5);
      return Math.max(Math.floor(posCount / 4), 8);
    };

    segments.forEach((seg, idx) => {
      const isHidden = hiddenSegments.has(idx);
      if (isHidden) return; // Skip hidden segments entirely

      if (seg.type === "trip" && seg.positions.length > 1) {
        const latlngs = seg.positions.map(p => L.latLng(p.lat, p.lng));
        allPoints.push(...latlngs);

        const isHighlighted = selectedSegment === idx || hoveredSegment === idx;

        // Glow effect for highlighted
        if (isHighlighted) {
          L.polyline(latlngs, {
            color: seg.color,
            weight: 8,
            opacity: 0.15,
            smoothFactor: 1,
            interactive: false,
          }).addTo(group);
        }

        // Main polyline -- uniform weight=3 for all, 4 for highlighted
        L.polyline(latlngs, {
          color: seg.color,
          weight: isHighlighted ? 4 : 3,
          opacity: 0.9,
          smoothFactor: 1,
        }).addTo(group);

        // Direction arrows -- density based on zoom level
        const arrowInterval = getArrowInterval(seg.positions.length);
        for (let i = arrowInterval; i < seg.positions.length - 1; i += arrowInterval) {
          const p = seg.positions[i];
          const arrowMarker = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              className: "",
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: `<div style="cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${p.course}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))"><path d="M12 2 L18 18 L12 14 L6 18 Z" fill="${seg.color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/></svg></div>`,
            }),
            zIndexOffset: 1300,
          });

          const popupContent = `
            <div style="font-family:system-ui;min-width:180px;font-size:11px;line-height:1.5">
              <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:${seg.color}">${fmtTime(p.time)}</div>
              <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
                <span style="color:#94a3b8">Speed:</span><span style="font-weight:600">${Math.round(p.speed)} km/h</span>
                <span style="color:#94a3b8">Heading:</span><span>${Math.round(p.course)}\u00B0</span>
                ${p.totalDistance != null ? `<span style="color:#94a3b8">Odo:</span><span>${Math.round(p.totalDistance).toLocaleString()} km</span>` : ""}
                ${p.ignition != null ? `<span style="color:#94a3b8">Ignition:</span><span style="color:${p.ignition ? "#22c55e" : "#ef4444"}">${p.ignition ? "ON" : "OFF"}</span>` : ""}
              </div>
              ${p.address ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);color:#94a3b8;font-size:10px">${p.address}</div>` : ""}
            </div>
          `;
          arrowMarker.bindPopup(popupContent, {
            className: "route-history-popup",
            closeButton: true,
            maxWidth: 250,
          });
          arrowMarker.addTo(group);
        }

        // Start dot
        if (idx === 0 || (idx > 0 && segments[idx - 1].type === "stop")) {
          const startP = seg.positions[0];
          L.marker([startP.lat, startP.lng], {
            icon: L.divIcon({
              className: "",
              iconSize: [10, 10],
              iconAnchor: [5, 5],
              html: `<div style="width:10px;height:10px;border-radius:50%;background:${seg.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
            }),
            zIndexOffset: 1250,
          }).addTo(group);
        }
      }

      // Stop markers
      if (seg.type === "stop") {
        allPoints.push(L.latLng(seg.startLat, seg.startLng));
        const dur = fmtDuration(seg.duration);
        L.marker([seg.startLat, seg.startLng], {
          icon: L.divIcon({
            className: "",
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            html: `<div style="width:26px;height:26px;border-radius:50%;background:#0f172a;border:2px solid #64748b;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer">
              <span style="color:white;font-weight:800;font-size:10px">P</span>
            </div>`,
          }),
          zIndexOffset: 1200,
        }).bindPopup(
          `<div style="font-family:system-ui;min-width:160px;font-size:11px;line-height:1.5">
            <div style="font-weight:700;font-size:12px;margin-bottom:4px">Stop</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
              <span style="color:#94a3b8">Time:</span><span style="font-weight:600">${fmtTime(seg.startTime)} - ${fmtTime(seg.endTime)}</span>
              <span style="color:#94a3b8">Duration:</span><span>${dur}</span>
            </div>
            ${seg.startAddress ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);color:#94a3b8;font-size:10px">${seg.startAddress}</div>` : ""}
          </div>`,
          { className: "route-history-popup", closeButton: true, maxWidth: 250 }
        ).addTo(group);
      }
    });

    // Fit bounds ONLY once per data load
    if (allPoints.length > 1 && !hasFittedRef.current) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50], maxZoom: 15 });
      hasFittedRef.current = true;
    }
  }, [segments, selectedSegment, hoveredSegment, hiddenSegments, mapRef, mapZoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (historyLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(historyLayerRef.current);
        historyLayerRef.current = null;
      }
    };
  }, [mapRef]);

  const changeDate = (delta: number) => {
    setDate(prev => {
      const d = new Date(prev); d.setDate(d.getDate() + delta); return d;
    });
    if (rangeMode) {
      setEndDate(prev => {
        const d = new Date(prev); d.setDate(d.getDate() + delta);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return d > today ? today : d;
      });
    }
  };

  const todayStr = fmtIso(new Date());
  const isToday = rangeMode ? fmtIso(endDate) === todayStr : fmtIso(date) === todayStr;

  const handleSegmentClick = (idx: number) => {
    const deselecting = selectedSegment === idx;
    setSelectedSegment(deselecting ? null : idx);
    const seg = segments[idx];
    const map = mapRef.current;
    if (!seg || !map) return;

    if (deselecting) {
      // Zoom back to all visible segments
      const allPts: L.LatLng[] = [];
      segments.forEach((s, i) => {
        if (hiddenSegments.has(i)) return;
        if (s.type === "trip") s.positions.forEach(p => allPts.push(L.latLng(p.lat, p.lng)));
        else allPts.push(L.latLng(s.startLat, s.startLng));
      });
      if (allPts.length > 1) map.fitBounds(L.latLngBounds(allPts), { padding: [50, 50], maxZoom: 15 });
    } else if (seg.type === "trip" && seg.positions.length > 1) {
      map.fitBounds(L.latLngBounds(seg.positions.map(p => L.latLng(p.lat, p.lng))), { padding: [60, 60], maxZoom: 16 });
    } else {
      map.setView([seg.startLat, seg.startLng], 15);
    }
  };

  const toggleSegmentVisibility = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenSegments(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    // If hiding the selected segment, deselect it
    if (selectedSegment === idx) setSelectedSegment(null);
  };

  const allTripsHidden = segments.every((_, i) => hiddenSegments.has(i));
  const toggleAllVisibility = () => {
    if (allTripsHidden) {
      setHiddenSegments(new Set());
    } else {
      setHiddenSegments(new Set(segments.map((_, i) => i)));
    }
  };

  return (
    <div className="absolute top-3 left-3 z-[1001] w-[340px] bg-card/95 backdrop-blur-md rounded-xl border border-border/50 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left-4 fade-in duration-200" style={{ maxHeight: "calc(100% - 24px)" }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-amber-500/5 via-transparent to-blue-500/5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Route className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Route History</h3>
              <p className="text-[10px] text-muted-foreground">{vehiclePlate}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted/20 transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Date picker with optional range + time */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => changeDate(-1)} className="p-1 rounded hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex-1 flex items-center gap-1 justify-center min-w-0 flex-wrap">
            <input
              type="date"
              value={fmtIso(date)}
              max={fmtIso(new Date())}
              onChange={e => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) { setDate(d); if (!rangeMode) setEndDate(d); } }}
              className="bg-transparent border-none text-[11px] font-medium text-center cursor-pointer focus:outline-none w-[105px]"
            />
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="bg-transparent border-none text-[10px] text-muted-foreground text-center cursor-pointer focus:outline-none w-[52px]"
            />
            {rangeMode && (
              <>
                <span className="text-[10px] text-muted-foreground">to</span>
                <input
                  type="date"
                  value={fmtIso(endDate)}
                  min={fmtIso(date)}
                  max={fmtIso(new Date())}
                  onChange={e => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) setEndDate(d); }}
                  className="bg-transparent border-none text-[11px] font-medium text-center cursor-pointer focus:outline-none w-[105px]"
                />
              </>
            )}
            {!rangeMode && <span className="text-[10px] text-muted-foreground">to</span>}
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="bg-transparent border-none text-[10px] text-muted-foreground text-center cursor-pointer focus:outline-none w-[52px]"
            />
          </div>
          <button onClick={() => changeDate(1)} disabled={isToday} className="p-1 rounded hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 shrink-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Range toggle */}
        <button
          className={`mt-1.5 w-full text-[9px] py-1 rounded-md font-medium transition-colors ${
            rangeMode
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : "text-muted-foreground hover:bg-muted/20 border border-transparent"
          }`}
          onClick={() => { setRangeMode(v => !v); if (!rangeMode) setEndDate(date); }}>
          <Calendar className="h-3 w-3 inline mr-1" />
          {rangeMode ? "Single day" : "Select range"}
        </button>
      </div>

      {/* Summary bar */}
      {summary && !loading && (
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
          {/* Show/Hide all toggle */}
          {segments.length > 0 && (
            <button
              className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={toggleAllVisibility}>
              {allTripsHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {allTripsHidden ? "Show all trips" : "Hide all trips"}
            </button>
          )}
        </div>
      )}

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading route history...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-12 gap-2 text-red-400 px-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
      {!loading && !error && segments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
          <Route className="h-8 w-8 opacity-30" />
          <span className="text-xs">No route data for this period</span>
        </div>
      )}

      {/* Timeline */}
      {!loading && segments.length > 0 && (
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
                  {/* Visibility toggle */}
                  <button
                    className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all"
                    onClick={(e) => toggleSegmentVisibility(idx, e)}
                    title={isHidden ? "Show on map" : "Hide from map"}>
                    {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  {/* Clickable content */}
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

            // Trip segment
            return (
              <div
                key={idx}
                className={`relative group flex items-start gap-3 px-4 py-2.5 transition-all ${isHidden ? "opacity-30" : ""} ${isSelected ? "bg-muted/15" : "hover:bg-muted/10"}`}>
                {/* Visibility toggle */}
                <button
                  className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all"
                  onClick={(e) => toggleSegmentVisibility(idx, e)}
                  title={isHidden ? "Show on map" : "Hide from map"}>
                  {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                {/* Clickable content */}
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
                    {/* Color bar */}
                    <div className="mt-1.5 h-0.5 rounded-full w-full" style={{ backgroundColor: seg.color + "40" }}>
                      <div className="h-full rounded-full" style={{ backgroundColor: seg.color, width: isSelected || isHovered ? "100%" : "0%", transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
