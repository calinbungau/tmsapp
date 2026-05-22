"use client";

/**
 * DetermineCostMap
 * ──────────────────────────────────────────────────────────────────────────
 * Tiny Leaflet map embedded inside DetermineCostDialog.
 *
 *   • Pickup/delivery markers from the order's planned stops (always shown).
 *   • A blue polyline of the GPS positions returned by `/api/traccar/route-history`
 *     (only shown after the user clicks "Get GPS distance").
 *
 * This component is loaded with `next/dynamic({ ssr: false })` from the
 * dialog because Leaflet pokes at `window` on import.
 */

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
}

interface Props {
  stops: Stop[];
  track: Position[];
}

// Color the marker by the stop role so pickup/delivery are visually distinct.
function markerColor(stopType?: string): string {
  switch (stopType) {
    case "pickup":      return "#10b981"; // emerald-500
    case "delivery":    return "#ef4444"; // red-500
    case "swap":
    case "transshipment":
    case "intermediate": return "#f59e0b"; // amber-500
    default:            return "#6366f1"; // indigo-500
  }
}

// Build a small SVG pin so we don't depend on Leaflet's default-icon path
// hack (which breaks in Next bundlers).
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

export default function DetermineCostMap({ stops, track }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef       = React.useRef<L.Map | null>(null);
  const layerRef     = React.useRef<L.LayerGroup | null>(null);

  // Initialise the map exactly once.
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      // Dialog content can be small; keep zoom controls but small.
      zoomControl: true,
      attributionControl: false,
    }).setView([50, 10], 4);

    L.tileLayer(
      // CartoDB dark-matter-no-labels — matches the rest of the app's dark UI
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      },
    ).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-render markers + polyline whenever stops or track change.
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const pts: L.LatLngExpression[] = [];

    // 1) Stops (always shown, even before GPS is pulled).
    stops.forEach((s) => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
      const m = L.marker([s.lat, s.lng], { icon: buildIcon(markerColor(s.stop_type)) })
        .bindPopup(`<div style="font-size:11px"><strong>${s.label}</strong>${s.stop_type ? `<br/><span style="opacity:.7">${s.stop_type}</span>` : ""}</div>`);
      m.addTo(layer);
      pts.push([s.lat, s.lng]);
    });

    // Faint dashed connector between stops to suggest the planned route
    // before the real GPS polyline lands.
    if (stops.length >= 2) {
      L.polyline(stops.map(s => [s.lat, s.lng] as [number, number]), {
        color: "#6366f1",
        opacity: 0.4,
        weight: 2,
        dashArray: "6,6",
      }).addTo(layer);
    }

    // 2) GPS polyline (when present).
    if (track.length >= 2) {
      const latlngs = track.map(p => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      // Small start/end dots so the user can see the direction.
      const start = track[0];
      const end   = track[track.length - 1];
      L.circleMarker([start.lat, start.lng], { radius: 5, color: "#10b981", fillColor: "#10b981", fillOpacity: 1, weight: 2 })
        .bindPopup("GPS start").addTo(layer);
      L.circleMarker([end.lat, end.lng], { radius: 5, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 2 })
        .bindPopup("GPS end").addTo(layer);

      pts.push(...latlngs);
    }

    // Fit the map to whatever we have.
    if (pts.length === 1) {
      map.setView(pts[0] as L.LatLngExpression, 9);
    } else if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts as L.LatLngExpression[]);
      map.fitBounds(bounds, { padding: [24, 24] });
    }

    // Force a size recalculation in case the dialog only just opened (Leaflet
    // measures 0×0 if it was hidden when initialised).
    setTimeout(() => map.invalidateSize(), 0);
  }, [stops, track]);

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="absolute inset-0" />
      {stops.length === 0 && track.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none bg-background/40">
          No stops with coordinates yet.
        </div>
      )}
    </div>
  );
}
