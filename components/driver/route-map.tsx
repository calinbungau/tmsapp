"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Stop {
  id: string;
  sequence_order: number;
  name: string;
  lat: number | null;
  lng: number | null;
  status: string;
  geofence_radius?: number | null;
  auto_checkin?: boolean;
  auto_checkout?: boolean;
}

interface RouteHistoryPoint {
  lat: number;
  lng: number;
  speed?: number | null;
  recorded_at: string;
}

interface RouteMapProps {
  stops: Stop[];
  driverLat?: number | null;
  driverLng?: number | null;
  routeHistory?: RouteHistoryPoint[];
  className?: string;
  onStopClick?: (stopId: string) => void;
}

const STOP_COLORS: Record<string, string> = {
  pending: "#9ca3af",
  en_route: "#3b82f6",
  arrived: "#f59e0b",
  in_progress: "#8b5cf6",
  completed: "#22c55e",
  skipped: "#ef4444",
  failed: "#ef4444",
};

export function RouteMap({ stops, driverLat, driverLng, routeHistory, className = "", onStopClick }: RouteMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const historyLineRef = useRef<L.Polyline | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const hasFitBoundsRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      renderer: L.svg({ padding: 0.1 }),
    }).setView([48.15, 17.11], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(mapRef.current);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    markersRef.current = L.layerGroup().addTo(mapRef.current);

    // Invalidate size when container resizes (e.g. panel expand/collapse)
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();
    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
    }

    const validStops = stops.filter(s => s.lat && s.lng);
    if (validStops.length === 0) return;

    const routeCoords: L.LatLngExpression[] = [];

    validStops.forEach((stop) => {
      const color = STOP_COLORS[stop.status] || "#9ca3af";
      const isDone = stop.status === "completed" || stop.status === "skipped";

      const icon = L.divIcon({
        className: "custom-stop-marker",
        html: `<div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: ${color}; color: white;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          opacity: ${isDone ? 0.6 : 1};
        ">${isDone ? "&#10003;" : stop.sequence_order}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([stop.lat!, stop.lng!], { icon })
        .bindTooltip(
          `<strong>${stop.sequence_order}. ${stop.name}</strong><br/><span style="text-transform:capitalize">${stop.status.replace("_", " ")}</span>`,
          { direction: "top", offset: [0, -16] }
        );

      if (onStopClick) {
        marker.on("click", () => onStopClick(stop.id));
      }

      markersRef.current!.addLayer(marker);
      routeCoords.push([stop.lat!, stop.lng!]);

      // Show geofence radius for auto-checkin/checkout stops
      if ((stop.auto_checkin || stop.auto_checkout) && stop.geofence_radius && !isDone) {
        const circle = L.circle([stop.lat!, stop.lng!], {
          radius: stop.geofence_radius,
          color: color,
          fillColor: color,
          fillOpacity: 0.08,
          weight: 1,
          dashArray: "4 4",
        });
        markersRef.current!.addLayer(circle);
      }
    });

    // Draw route line between stops only
    if (routeCoords.length > 1) {
      routeLineRef.current = L.polyline(routeCoords, {
        color: "#3b82f6",
        weight: 3,
        opacity: 0.6,
        dashArray: "8 6",
      }).addTo(mapRef.current);
    }

    // Remove old driver-to-stop line if exists
    if ((mapRef.current as any)._driverLine) {
      mapRef.current.removeLayer((mapRef.current as any)._driverLine);
      (mapRef.current as any)._driverLine = null;
    }

    // Driver position (smooth update if marker already exists)
    if (driverLat && driverLng) {
      const driverIcon = L.divIcon({
        className: "driver-marker",
        html: `<div style="
          width: 18px; height: 18px; border-radius: 50%;
          background: #2563eb; border: 3px solid white;
          box-shadow: 0 0 0 2px #2563eb, 0 2px 8px rgba(37,99,235,0.5);
          transition: transform 0.3s ease;
        "></div>
        <div style="
          position: absolute; top: -3px; left: -3px;
          width: 24px; height: 24px; border-radius: 50%;
          border: 2px solid rgba(37,99,235,0.4);
          animation: driverPulse 2s infinite;
        "></div>
        <style>@keyframes driverPulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.6); opacity: 0; } }</style>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLat, driverLng]);
        driverMarkerRef.current.setIcon(driverIcon);
      } else {
        driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: driverIcon, zIndexOffset: 1000 })
          .bindTooltip("Driver location", { direction: "top", offset: [0, -12] })
          .addTo(mapRef.current);
      }

      // Draw dashed line from driver to next pending/en_route stop
      const nextStop = validStops.find(s =>
        s.status === "pending" || s.status === "en_route" || s.status === "arrived"
      );
      if (nextStop?.lat && nextStop?.lng) {
        (mapRef.current as any)._driverLine = L.polyline(
          [[driverLat, driverLng], [nextStop.lat, nextStop.lng]],
          { color: "#2563eb", weight: 2, opacity: 0.4, dashArray: "4 8" }
        ).addTo(mapRef.current);
      }
    }

    // Draw route history trail (actual GPS breadcrumbs)
    if (historyLineRef.current) {
      mapRef.current.removeLayer(historyLineRef.current);
      historyLineRef.current = null;
    }
    if (routeHistory && routeHistory.length > 1) {
      const historyCoords: L.LatLngExpression[] = routeHistory.map(p => [p.lat, p.lng]);
      historyLineRef.current = L.polyline(historyCoords, {
        color: "#8b5cf6",
        weight: 3,
        opacity: 0.7,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);
    }

    // Fit bounds only on first render (not on every driver position update)
    if (!hasFitBoundsRef.current) {
      const allPoints: L.LatLngExpression[] = [...routeCoords];
      if (driverLat && driverLng) allPoints.push([driverLat, driverLng]);
      if (routeHistory?.length) {
        for (const p of routeHistory) allPoints.push([p.lat, p.lng]);
      }

      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        hasFitBoundsRef.current = true;
      }
    }
  }, [stops, driverLat, driverLng, routeHistory, onStopClick]);

  return <div ref={containerRef} className={`w-full ${className}`} style={{ minHeight: "200px" }} />;
}
