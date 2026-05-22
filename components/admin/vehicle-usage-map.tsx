"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface VehicleLocation {
  id: string;
  vehicle_id?: string;
  vehicle_plate: string;
  vehicle_model?: string | null;
  driver_name: string;
  driver_id?: string | null;
  check_in_time?: string | null;
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  latitude: number;
  longitude: number;
  speed?: number;
  ignition?: boolean;
  last_update: string;
  device_status?: string;
}

interface VehicleUsageMapProps {
  vehicles: VehicleLocation[];
  onVehicleClick?: (vehicle: VehicleLocation) => void;
}

export function VehicleUsageMap({ vehicles, onVehicleClick }: VehicleUsageMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map centered on a default location (will adjust to markers)
    const map = L.map(mapRef.current).setView([44.4268, 26.1025], 12); // Default to Bucharest

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (vehicles.length === 0) return;

    // Create custom icon
    const vehicleIcon = L.divIcon({
      className: "vehicle-marker",
      html: `
        <div style="
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          border: 3px solid white;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    // Add markers for each vehicle
    const bounds: L.LatLngBounds = L.latLngBounds([]);

    vehicles.forEach((vehicle) => {
      // Create custom icon with vehicle plate as label
      const isMoving = vehicle.speed && vehicle.speed > 5;
      const iconColor = vehicle.ignition ? (isMoving ? "#22c55e" : "#f59e0b") : "#6b7280";
      
      const customIcon = L.divIcon({
        className: "vehicle-marker-custom",
        html: `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="
              background: ${iconColor};
              color: white;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              white-space: nowrap;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              margin-bottom: 4px;
            ">${vehicle.vehicle_plate}</div>
            <div style="
              background: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              border: 3px solid ${iconColor};
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M9 17h6"/>
                <circle cx="17" cy="17" r="2"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [80, 56],
        iconAnchor: [40, 56],
      });

      const marker = L.marker([vehicle.latitude, vehicle.longitude], {
        icon: customIcon,
      }).addTo(map);

      const lastUpdate = new Date(vehicle.last_update);
      const timeAgo = getTimeAgo(lastUpdate);
      const checkInDate = vehicle.check_in_time ? new Date(vehicle.check_in_time) : null;
      const checkInFormatted = checkInDate ? checkInDate.toLocaleString() : "N/A";
      const speedDisplay = vehicle.speed !== undefined ? `${vehicle.speed} km/h` : "N/A";
      const statusText = vehicle.ignition 
        ? (isMoving ? "Moving" : "Idle") 
        : "Engine Off";
      const statusColor = vehicle.ignition 
        ? (isMoving ? "#22c55e" : "#f59e0b") 
        : "#6b7280";

      marker.bindPopup(`
        <div style="min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
          <div style="
            background: linear-gradient(135deg, #1e293b, #334155);
            color: white;
            padding: 12px;
            margin: -13px -13px 12px -13px;
            border-radius: 4px 4px 0 0;
          ">
            <div style="font-weight: 700; font-size: 16px;">${vehicle.vehicle_plate}</div>
            ${vehicle.vehicle_model ? `<div style="font-size: 12px; opacity: 0.8;">${vehicle.vehicle_model}</div>` : ""}
          </div>
          
          <div style="padding: 0 4px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <div style="
                width: 8px; 
                height: 8px; 
                border-radius: 50%; 
                background: ${statusColor};
                box-shadow: 0 0 6px ${statusColor};
              "></div>
              <span style="font-size: 13px; font-weight: 500; color: ${statusColor};">${statusText}</span>
              <span style="font-size: 12px; color: #64748b; margin-left: auto;">${speedDisplay}</span>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 10px;">
              <div style="display: flex; margin-bottom: 6px;">
                <span style="color: #64748b; font-size: 12px; width: 70px;">Driver:</span>
                <span style="font-size: 12px; font-weight: 500;">${vehicle.driver_name}</span>
              </div>
              <div style="display: flex; margin-bottom: 6px;">
                <span style="color: #64748b; font-size: 12px; width: 90px;">Check-in:</span>
                <span style="font-size: 12px;">${checkInFormatted}</span>
              </div>
              ${vehicle.check_in_latitude && vehicle.check_in_longitude ? `
              <div style="display: flex; margin-bottom: 6px;">
                <span style="color: #64748b; font-size: 12px; width: 90px;">Check-in Loc:</span>
                <a href="https://www.google.com/maps?q=${vehicle.check_in_latitude},${vehicle.check_in_longitude}" target="_blank" style="font-size: 12px; color: #3b82f6; text-decoration: underline;">View on map</a>
              </div>
              ` : ""}
              <div style="display: flex;">
                <span style="color: #64748b; font-size: 12px; width: 70px;">Updated:</span>
                <span style="font-size: 12px;">${timeAgo}</span>
              </div>
            </div>
          </div>
        </div>
      `, { maxWidth: 280 });

      if (onVehicleClick) {
        marker.on("click", () => onVehicleClick(vehicle));
      }

      markersRef.current.push(marker);
      bounds.extend([vehicle.latitude, vehicle.longitude]);
    });

    // Fit map to show all markers
    if (vehicles.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [vehicles]);

  return (
    <div 
      ref={mapRef} 
      className="w-full h-[400px] rounded-lg border overflow-hidden"
      style={{ zIndex: 0 }}
    />
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
