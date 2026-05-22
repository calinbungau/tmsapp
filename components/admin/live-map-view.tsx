"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface OnlineDriver {
  id: string;
  name: string;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  active_task?: {
    id: string;
    title: string;
    reference_number: string;
    status: string;
    stops_total: number;
    stops_completed: number;
  } | null;
  vehicle?: {
    plate_number: string;
  } | null;
}

interface LiveMapViewProps {
  drivers: OnlineDriver[];
  selectedDriverId: string | null;
  onSelectDriver: (id: string | null) => void;
}

export default function LiveMapView({ drivers, selectedDriverId, onSelectDriver }: LiveMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const pulseRef = useRef<Map<string, L.CircleMarker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([48.15, 17.11], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers that are no longer in the list
    const currentIds = new Set(drivers.map((d) => d.id));
    for (const [id, marker] of markersRef.current.entries()) {
      if (!currentIds.has(id)) {
        mapRef.current.removeLayer(marker);
        markersRef.current.delete(id);
      }
    }
    for (const [id, pulse] of pulseRef.current.entries()) {
      if (!currentIds.has(id)) {
        mapRef.current.removeLayer(pulse);
        pulseRef.current.delete(id);
      }
    }

    const validDrivers = drivers.filter((d) => d.last_lat && d.last_lng);

    for (const driver of validDrivers) {
      const isSelected = selectedDriverId === driver.id;
      const hasTask = !!driver.active_task;
      const color = hasTask ? "#2563eb" : "#22c55e";
      const size = isSelected ? 20 : 14;
      const borderWidth = isSelected ? 4 : 3;

      const icon = L.divIcon({
        className: "live-driver-marker",
        html: `<div style="
          width: ${size}px; height: ${size}px; border-radius: 50%;
          background: ${color}; border: ${borderWidth}px solid white;
          box-shadow: 0 0 0 2px ${color}, 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: all 0.2s;
          ${isSelected ? 'transform: scale(1.2);' : ''}
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      // Build tooltip
      let tooltipHtml = `<strong>${driver.name}</strong>`;
      if (driver.vehicle) {
        tooltipHtml += `<br/><span style="color:#666">${driver.vehicle.plate_number}</span>`;
      }
      if (driver.active_task) {
        tooltipHtml += `<br/><span style="font-size:11px">${driver.active_task.title}</span>`;
        tooltipHtml += `<br/><span style="font-size:11px;color:#666">${driver.active_task.stops_completed}/${driver.active_task.stops_total} stops</span>`;
      }
      if (driver.last_seen_at) {
        const ago = formatTimeAgo(driver.last_seen_at);
        tooltipHtml += `<br/><span style="font-size:10px;color:#999">Updated ${ago}</span>`;
      }

      if (markersRef.current.has(driver.id)) {
        // Update existing marker
        const existingMarker = markersRef.current.get(driver.id)!;
        existingMarker.setLatLng([driver.last_lat!, driver.last_lng!]);
        existingMarker.setIcon(icon);
        existingMarker.setTooltipContent(tooltipHtml);
      } else {
        // Create new marker
        const marker = L.marker([driver.last_lat!, driver.last_lng!], { icon })
          .bindTooltip(tooltipHtml, { direction: "top", offset: [0, -12] })
          .on("click", () => onSelectDriver(driver.id));
        marker.addTo(mapRef.current!);
        markersRef.current.set(driver.id, marker);
      }

      // Add pulse ring for selected driver
      if (isSelected) {
        if (!pulseRef.current.has(driver.id)) {
          const pulse = L.circleMarker([driver.last_lat!, driver.last_lng!], {
            radius: 25,
            color,
            fillColor: color,
            fillOpacity: 0.1,
            weight: 1,
            opacity: 0.4,
          });
          pulse.addTo(mapRef.current!);
          pulseRef.current.set(driver.id, pulse);
        } else {
          pulseRef.current.get(driver.id)!.setLatLng([driver.last_lat!, driver.last_lng!]);
        }
      } else if (pulseRef.current.has(driver.id)) {
        mapRef.current!.removeLayer(pulseRef.current.get(driver.id)!);
        pulseRef.current.delete(driver.id);
      }
    }

    // Fit bounds on first load or when there are drivers
    if (validDrivers.length > 0 && !selectedDriverId) {
      const bounds = L.latLngBounds(
        validDrivers.map((d) => [d.last_lat!, d.last_lng!] as L.LatLngExpression)
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    // Center on selected driver
    if (selectedDriverId) {
      const selected = validDrivers.find((d) => d.id === selectedDriverId);
      if (selected && selected.last_lat && selected.last_lng) {
        mapRef.current.setView([selected.last_lat, selected.last_lng], 15, {
          animate: true,
        });
      }
    }
  }, [drivers, selectedDriverId, onSelectDriver]);

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: "400px" }} />;
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  return `${diffHrs}h ago`;
}
