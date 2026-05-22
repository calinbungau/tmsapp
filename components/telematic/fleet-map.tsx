"use client";

import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Throttle helper - executes immediately then throttles subsequent calls
function useThrottle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRunRef.current;
    
    if (timeSinceLastRun >= delay) {
      // Execute immediately if enough time has passed
      lastRunRef.current = now;
      fnRef.current(...args);
    } else {
      // Schedule for later (trailing call)
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lastRunRef.current = Date.now();
        fnRef.current(...args);
      }, delay - timeSinceLastRun);
    }
  }, [delay]) as T;
}

export interface TraccarGroup {
  id: number;
  name: string;
  attributes: { iconColor?: string; [key: string]: unknown };
  groupId: number;
}

export interface FleetVehicle {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_model: string | null;
  driver_name: string;
  driver_id: string | null;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  ignition: boolean;
  motion: boolean;
  device_status: string;
  last_update: string;
  address: string | null;
  totalDistance: number | null;
  engineHours: number | null;
  fuel: number | null;
  battery: number | null;
  power: number | null;
  satellites: number | null;
  groupId?: number;
  traccar_device_id?: string | number | null;
  lastParked?: string | null;
  geofenceIds?: number[];
  asset_type?: "vehicle" | "trailer";
}

export interface FleetTrailer {
  id: string;
  trailer_id: string;
  trailer_plate: string;
  trailer_type: string | null;
  asset_type: "trailer";
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  ignition: boolean;
  motion: boolean;
  device_status: string;
  last_update: string;
  address: string | null;
  totalDistance: number | null;
  battery: number | null;
  power: number | null;
  satellites: number | null;
  groupId?: number;
  traccar_device_id?: string | number | null;
  geofenceIds?: number[];
}

// Traccar-compatible tile layers (same free tiles Traccar uses)
const TILE_LAYERS: Record<string, { name: string; url: string; maxZoom: number }> = {
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    maxZoom: 19,
  },
  osm: {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
  },
  googleRoad: {
    name: "Google Roads",
    url: "https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
  googleSatellite: {
    name: "Google Satellite",
    url: "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
  googleHybrid: {
    name: "Google Hybrid",
    url: "https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
  googleTerrain: {
    name: "Google Terrain",
    url: "https://mt0.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}",
    maxZoom: 20,
  },
};

// Map Traccar user.map values to our tile keys
export const TRACCAR_MAP_TO_TILE: Record<string, string> = {
  googleRoad: "googleRoad",
  googleSatellite: "googleSatellite",
  googleHybrid: "googleHybrid",
  googleTerrain: "googleTerrain",
  osm: "osm",
  "locationIqStreets": "osm",
  carto: "dark",
};

// Reverse: our tile key -> Traccar map value
export const TILE_TO_TRACCAR_MAP: Record<string, string> = {
  dark: "carto",
  osm: "osm",
  googleRoad: "googleRoad",
  googleSatellite: "googleSatellite",
  googleHybrid: "googleHybrid",
  googleTerrain: "googleTerrain",
};

export interface MapGeofence {
  id: number;
  name: string;
  area: string;
  attributes: { color?: string; [key: string]: unknown };
}

export function parseGeofenceArea(area: string): { type: "circle"; center: [number, number]; radius: number } | { type: "polygon"; points: [number, number][] } | null {
  if (!area) return null;
  const circleMatch = area.match(/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
  if (circleMatch) {
    return { type: "circle", center: [parseFloat(circleMatch[1]), parseFloat(circleMatch[2])], radius: parseFloat(circleMatch[3]) };
  }
  const polyMatch = area.match(/POLYGON\s*\(\(([^)]+)\)\)/i);
  if (polyMatch) {
    const points = polyMatch[1].split(",").map((pair) => {
      const [lat, lon] = pair.trim().split(/\s+/).map(Number);
      return [lat, lon] as [number, number];
    });
    return { type: "polygon", points };
  }
  return null;
}

function getVehicleColor(v: FleetVehicle, groups: TraccarGroup[]): string {
  // If vehicle has a group with a custom iconColor, use it
  if (v.groupId && v.groupId > 0) {
    const group = groups.find((g) => g.id === v.groupId);
    if (group?.attributes?.iconColor) return group.attributes.iconColor;
  }
  // Default status-based colors
  if (v.speed > 2 && v.motion) return "#22c55e";
  if (v.ignition && !v.motion) return "#f59e0b";
  return "#3b82f6";
}

export interface TraccarEvent {
  id: number;
  deviceId: number;
  vehicleId: string | null;
  vehiclePlate: string | null;
  type: string;
  eventTime: string;
  positionId: number;
  geofenceId: number;
  maintenanceId: number;
  attributes: Record<string, any>;
}

export interface RouteData {
  latlngs: [number, number][];
  distance_km: number;
  duration_minutes: number;
  startAddress?: string;
  endAddress?: string;
}

interface FleetMapProps {
  vehicles: FleetVehicle[];
  groups: TraccarGroup[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string | null) => void;
  initialTile?: string;
  onTileChange?: (tile: string) => void;
  mapRef?: React.MutableRefObject<L.Map | null>;
  /** Disable auto-follow when route history is open */
  followDisabled?: boolean;
  /** Geofences to render on the map */
  geofences?: MapGeofence[];
  /** Whether to show geofence overlays */
  showGeofences?: boolean;
  /** Callback to toggle geofence panel */
  onGeofencePanelToggle?: () => void;
  /** Whether the geofence panel is open */
  geofencePanelOpen?: boolean;
  /** Route polyline data to render on the map */
  routeData?: RouteData | null;
  /** Manually-set start point for point-to-point routing */
  routeStart?: { lat: number; lng: number } | null;
  /** Whether route is currently being calculated */
  routeLoading?: boolean;
  /** Called when user right-clicks and selects "Route to here" */
  onRouteToHere?: (latlng: { lat: number; lng: number }) => void;
  /** Called when user right-clicks and selects "Set as start" */
  onSetRouteStart?: (latlng: { lat: number; lng: number }) => void;
  /** Called when user clears the route */
  onRouteClear?: () => void;
  /** Called when a draggable waypoint is moved -- recalculates route via intermediate point */
  onRouteViaPoint?: (latlng: { lat: number; lng: number }) => void;
  /** Called when user selects a search result to navigate the map */
  onSearchNavigate?: (latlng: { lat: number; lng: number }, label: string) => void;
  /** Live notification events to display */
  notifications?: TraccarEvent[];
  /** Unread notification count */
  unreadCount?: number;
  /** Called when notifications panel is opened (marks as read) */
  onNotificationsRead?: () => void;
  /** Called when a notification event is clicked -- navigates to the Notifications page */
  onNotificationClick?: (eventId: number) => void;
}

// ── Traccar event type metadata ──
const EVENT_META: Record<string, { label: string; icon: string; bgColor: string; description?: string }> = {
  deviceOnline:       { label: "Device Online",       icon: "\u2705", bgColor: "#dcfce7", description: "Device connected to server" },
  deviceOffline:      { label: "Device Offline",      icon: "\u26aa", bgColor: "#f1f5f9", description: "Device disconnected" },
  deviceUnknown:      { label: "Device Unknown",      icon: "\u2753", bgColor: "#fef9c3", description: "No data received for a while" },
  deviceMoving:       { label: "Moving",              icon: "\ud83d\ude97", bgColor: "#dbeafe", description: "Vehicle started moving" },
  deviceStopped:      { label: "Stopped",             icon: "\ud83d\udfe5", bgColor: "#fee2e2", description: "Vehicle stopped" },
  deviceOverspeed:    { label: "Overspeed",           icon: "\u26a0\ufe0f", bgColor: "#fef3c7", description: "Speed limit exceeded" },
  deviceFuelDrop:     { label: "Fuel Drop",           icon: "\u26fd", bgColor: "#fee2e2", description: "Sudden fuel level decrease" },
  deviceFuelIncrease: { label: "Fuel Increase",       icon: "\u26fd", bgColor: "#dcfce7", description: "Fuel level increased" },
  commandResult:      { label: "Command Result",      icon: "\ud83d\udce1", bgColor: "#e0e7ff", description: "Command response received" },
  alarm:              { label: "Alarm",               icon: "\ud83d\udea8", bgColor: "#fee2e2", description: "Device alarm triggered" },
  textMessage:        { label: "Text Message",        icon: "\ud83d\udcac", bgColor: "#e0e7ff" },
  driverChanged:      { label: "Driver Changed",      icon: "\ud83d\udc64", bgColor: "#f3e8ff" },
  geofenceEnter:      { label: "Geofence Enter",      icon: "\ud83d\udfe2", bgColor: "#dcfce7", description: "Entered a geofence zone" },
  geofenceExit:       { label: "Geofence Exit",       icon: "\ud83d\udd34", bgColor: "#fee2e2", description: "Left a geofence zone" },
  ignitionOn:         { label: "Ignition On",         icon: "\ud83d\udd11", bgColor: "#dcfce7", description: "Engine started" },
  ignitionOff:        { label: "Ignition Off",        icon: "\ud83d\udd11", bgColor: "#f1f5f9", description: "Engine turned off" },
  maintenance:        { label: "Maintenance",         icon: "\ud83d\udd27", bgColor: "#fef3c7", description: "Maintenance threshold reached" },
  deviceInactive:     { label: "Device Inactive",     icon: "\ud83d\udcf4", bgColor: "#f1f5f9", description: "Device marked inactive" },
  media:              { label: "Media",               icon: "\ud83d\udcf7", bgColor: "#e0e7ff", description: "Media file received" },
};

export function getEventInfo(type: string): { label: string; icon: string; bgColor: string; description?: string } {
  return EVENT_META[type] || { label: type.replace(/([A-Z])/g, " $1").trim(), icon: "\ud83d\udccc", bgColor: "#f1f5f9" };
}

export function getEventLabel(type: string): string {
  return getEventInfo(type).label;
}

export default function FleetMap({
  vehicles,
  groups,
  selectedVehicleId,
  onSelectVehicle,
  initialTile,
  onTileChange,
  mapRef: externalMapRef,
  followDisabled = false,
  geofences = [],
  showGeofences = false,
  onGeofencePanelToggle,
  geofencePanelOpen = false,
  routeData = null,
  routeStart = null,
  routeLoading = false,
  onRouteToHere,
  onSetRouteStart,
  onRouteClear,
  onRouteViaPoint,
  onSearchNavigate,
  notifications = [],
  unreadCount = 0,
  onNotificationsRead,
  onNotificationClick,
  }: FleetMapProps) {
  const internalMapRef = useRef<L.Map | null>(null);
  const mapRef = externalMapRef || internalMapRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const hasInitialFit = useRef(false);
  const [activeTile, setActiveTile] = useState(initialTile || "dark");
  const [layersOpen, setLayersOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const layersRef = useRef<HTMLDivElement>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const geofenceLayerRef = useRef<L.LayerGroup | null>(null);

  // Route rendering refs
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; latlng: { lat: number; lng: number } } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  // Address search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Notification panel state
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  // Route animation ref
  const animationLayerRef = useRef<L.Polyline | null>(null);
  const animFrameRef = useRef<number>(0);

  // ── Geofence overlay rendering ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove old layer
    if (geofenceLayerRef.current) {
      map.removeLayer(geofenceLayerRef.current);
      geofenceLayerRef.current = null;
    }

    if (!showGeofences || !geofences.length) return;

    const layerGroup = L.layerGroup().addTo(map);
    geofenceLayerRef.current = layerGroup;

    for (const gf of geofences) {
      const parsed = parseGeofenceArea(gf.area);
      if (!parsed) continue;
      const color = gf.attributes?.color || "#3b82f6";

      if (parsed.type === "circle") {
        const circle = L.circle([parsed.center[0], parsed.center[1]], {
          radius: parsed.radius,
          color: color,
          fillColor: color,
          fillOpacity: 0.08,
          weight: 2,
          dashArray: "6 4",
        });
        circle.bindTooltip(gf.name, { permanent: false, direction: "center", className: "geofence-tooltip" });
        layerGroup.addLayer(circle);
      } else if (parsed.type === "polygon") {
        const polygon = L.polygon(
          parsed.points.map(([lat, lon]) => [lat, lon] as L.LatLngExpression),
          {
            color: color,
            fillColor: color,
            fillOpacity: 0.08,
            weight: 2,
            dashArray: "6 4",
          }
        );
        polygon.bindTooltip(gf.name, { permanent: false, direction: "center", className: "geofence-tooltip" });
        layerGroup.addLayer(polygon);
      }
    }
  }, [geofences, showGeofences, mapReady]);

  // ── Route polyline rendering with animation + draggable midpoint ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clean up old route layer + animation
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (animationLayerRef.current) {
      map.removeLayer(animationLayerRef.current);
      animationLayerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    if (!routeData || !routeData.latlngs.length) return;

    const layerGroup = L.layerGroup().addTo(map);
    routeLayerRef.current = layerGroup;

    const coords = routeData.latlngs.map(([lat, lng]) => [lat, lng] as L.LatLngExpression);

    // Base route line (semi-transparent)
    const baseLine = L.polyline(coords, {
      color: "#3b82f6", weight: 5, opacity: 0.3, lineJoin: "round", lineCap: "round",
    });
    layerGroup.addLayer(baseLine);

    // Animated overlay line (marching ants)
    const animLine = L.polyline(coords, {
      color: "#3b82f6", weight: 4, opacity: 0.9, lineJoin: "round", lineCap: "round",
      dashArray: "12 8", dashOffset: "0",
    });
    layerGroup.addLayer(animLine);
    animationLayerRef.current = animLine;

    // Animate the dashes
    let offset = 0;
    const animate = () => {
      offset -= 0.5;
      const el = animLine.getElement();
      if (el) {
        el.style.strokeDashoffset = String(offset);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    // Start marker -- custom HTML marker
    const startPt = routeData.latlngs[0];
    const startIcon = L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
      </div>`,
    });
    const startMarker = L.marker([startPt[0], startPt[1]], { icon: startIcon, zIndexOffset: 2000 });
    startMarker.bindTooltip(routeData.startAddress || "Start", {
      direction: "top", offset: [0, -16], className: "route-tooltip",
    });
    layerGroup.addLayer(startMarker);

    // End marker -- flag style
    const endPt = routeData.latlngs[routeData.latlngs.length - 1];
    const endIcon = L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/></svg>
      </div>`,
    });
    const endMarker = L.marker([endPt[0], endPt[1]], { icon: endIcon, zIndexOffset: 2000 });
    endMarker.bindTooltip(routeData.endAddress || "Destination", {
      direction: "top", offset: [0, -16], className: "route-tooltip",
    });
    layerGroup.addLayer(endMarker);

    // Draggable midpoint waypoint
    if (onRouteViaPoint && routeData.latlngs.length > 2) {
      const midIdx = Math.floor(routeData.latlngs.length / 2);
      const midPt = routeData.latlngs[midIdx];
      const midIcon = L.divIcon({
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: `<div style="width:20px;height:20px;border-radius:50%;background:white;border:3px solid #3b82f6;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:grab"></div>`,
      });
      const midMarker = L.marker([midPt[0], midPt[1]], {
        icon: midIcon,
        draggable: true,
        zIndexOffset: 2100,
      });
      midMarker.bindTooltip("Drag to change route", { direction: "top", offset: [0, -12] });
      midMarker.on("dragend", () => {
        const pos = midMarker.getLatLng();
        onRouteViaPoint({ lat: pos.lat, lng: pos.lng });
      });
      layerGroup.addLayer(midMarker);
    }

    // Fit map to the route bounds
    map.fitBounds(baseLine.getBounds(), { padding: [60, 60], maxZoom: 15 });

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [routeData, mapReady, onRouteViaPoint]);

  // ── Render start pin for point-to-point mode ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clean up old start marker
    if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    if (!routeStart) return;

    const marker = L.circleMarker([routeStart.lat, routeStart.lng], {
      radius: 8, fillColor: "#22c55e", color: "#fff", weight: 2, fillOpacity: 1,
    });
    marker.bindTooltip("Start point", { permanent: true, direction: "top", offset: [0, -10], className: "route-start-tooltip" });
    marker.addTo(map);
    startMarkerRef.current = marker;
  }, [routeStart, mapReady]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  // ── Address search (debounced Nominatim) ──
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/tms/geocode?action=search&q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data.slice(0, 5) : []);
        }
      } catch { /* silent */ }
      finally { setSearchLoading(false); }
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    function handleClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Close layers popup on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (layersRef.current && !layersRef.current.contains(e.target as Node)) {
        setLayersOpen(false);
      }
    }
    if (layersOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [layersOpen]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    function handleClick(e: MouseEvent) {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ctxMenu]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const startTile = initialTile && TILE_LAYERS[initialTile] ? initialTile : "dark";

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([47.5, 19.0], 7);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Click on map background to deselect vehicle and close context menu
    map.on("click", () => {
      onSelectVehicle(null);
      setCtxMenu(null);
    });

    // Right-click context menu
    map.on("contextmenu", (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      const containerPoint = e.containerPoint;
      setCtxMenu({
        x: containerPoint.x,
        y: containerPoint.y,
        latlng: { lat: e.latlng.lat, lng: e.latlng.lng },
      });
    });

    const layer = L.tileLayer(TILE_LAYERS[startTile].url, {
      maxZoom: TILE_LAYERS[startTile].maxZoom,
    }).addTo(map);
    tileLayerRef.current = layer;
    mapRef.current = map;
    setActiveTile(startTile);
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch tile when initialTile prop changes (user pref loaded)
  useEffect(() => {
    if (initialTile && TILE_LAYERS[initialTile] && initialTile !== activeTile) {
      switchTile(initialTile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTile]);

  const switchTile = useCallback((tileKey: string) => {
    if (!mapRef.current) return;
    const config = TILE_LAYERS[tileKey];
    if (!config) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
    }).addTo(mapRef.current);
    setActiveTile(tileKey);
    onTileChange?.(tileKey);
  }, [mapRef, onTileChange]);

  // Ultra-minimal icon HTML for best performance with 500+ markers
  // Key optimizations: inline styles only where needed, minimal DOM nodes, no reflows
  // Uses SVG arrow for moving (same as dispatch board) and P/T circle for parked
  const buildIconHtml = useCallback((v: FleetVehicle): string => {
  const isMoving = v.speed > 2 && v.motion;
  const isTrailer = v.asset_type === "trailer";
  const color = isTrailer ? "#f59e0b" : getVehicleColor(v, groups); // Amber for trailers
  const plate = v.vehicle_plate;
  
  // Single-line minimal HTML - every byte counts with 500+ markers
  // Moving: SVG direction arrow (matches dispatch board style)
  if (isMoving) {
  const rot = v.course || 0;
  return `<div class=fm-m><div class=fm-l style=background:${color}>${plate}</div><svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${rot}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))"><path d="M12 1 L20 21 L12 16 L4 21 Z" fill="${color}"/></svg></div>`;
  }
  // Parked: Circle with P for vehicles, or trailer SVG icon for trailers
  if (isTrailer) {
    return `<div class=fm-m><div class=fm-l style=background:${color}>${plate}</div><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))"><rect x="1" y="8" width="16" height="10" rx="1" fill="${color}"/><circle cx="5" cy="18" r="2.5" fill="#1a1a1a" stroke="${color}"/><circle cx="13" cy="18" r="2.5" fill="#1a1a1a" stroke="${color}"/></svg></div>`;
  }
  return `<div class=fm-m><div class=fm-l style=background:${color}>${plate}</div><div class=fm-p style=background:${color}>P</div></div>`;
  }, [groups]);

  // Track vehicle state to only update icons when needed (performance for 500+ devices)
  const vehicleStateRef = useRef<Map<string, string>>(new Map());
  const rafRef = useRef<number | null>(null);

  const getVehicleStateKey = useCallback((v: FleetVehicle): string => {
    // Only rebuild icon when these properties change
    const isMoving = v.speed > 2 && v.motion;
    return `${v.vehicle_plate}|${isMoving}|${Math.round(v.course / 10)}|${v.groupId || 0}|${v.asset_type || "vehicle"}`;
  }, []);

  // Memoize vehicle lookup map for O(1) access
  const vehicleMap = useMemo(() => {
    const map = new Map<string, FleetVehicle>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const updateMarkersCore = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const currentIds = new Set(vehicles.map((v) => v.id));

    // Remove markers for vehicles no longer in the list (batch removal)
    const toRemove: string[] = [];
    for (const [id] of markersRef.current.entries()) {
      if (!currentIds.has(id)) toRemove.push(id);
    }
    for (const id of toRemove) {
      const marker = markersRef.current.get(id);
      if (marker) map.removeLayer(marker);
      markersRef.current.delete(id);
      vehicleStateRef.current.delete(id);
    }

    // Reusable constants (avoid creating new objects in loop)
    const iconSize: L.PointExpression = [56, 40];
    const iconAnchor: L.PointExpression = [28, 40];

    // Track new markers to add in batch
    const newMarkersArr: Array<{ marker: L.Marker; id: string }> = [];

    for (const v of vehicles) {
      if (!v.latitude || !v.longitude) continue;
      const latLng: L.LatLngExpression = [v.latitude, v.longitude];
      const stateKey = getVehicleStateKey(v);
      const prevState = vehicleStateRef.current.get(v.id);

      const existing = markersRef.current.get(v.id);
      if (existing) {
        // Position update is cheap - always do it
        existing.setLatLng(latLng);
        // Icon rebuild is expensive - only when state changed
        if (prevState !== stateKey) {
          const html = buildIconHtml(v);
          const icon = L.divIcon({ className: "", iconSize, iconAnchor, html });
          existing.setIcon(icon);
          vehicleStateRef.current.set(v.id, stateKey);
        }
      } else {
        // Queue new marker for batch add
        const html = buildIconHtml(v);
        const icon = L.divIcon({ className: "", iconSize, iconAnchor, html });
        const marker = L.marker(latLng, { icon, zIndexOffset: 1100 });
        marker.on("click", () => onSelectVehicle(v.id));
        newMarkersArr.push({ marker, id: v.id });
        vehicleStateRef.current.set(v.id, stateKey);
      }
    }

    // Batch add new markers (reduces reflows)
    for (const { marker, id } of newMarkersArr) {
      marker.addTo(map);
      markersRef.current.set(id, marker);
    }

    // Initial fit to show all vehicles
    if (vehicles.length > 0 && !hasInitialFit.current) {
      const validVehicles = vehicles.filter((v) => v.latitude && v.longitude);
      if (validVehicles.length > 0) {
        const bounds = L.latLngBounds(
          validVehicles.map((v) => [v.latitude, v.longitude] as L.LatLngExpression)
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
        hasInitialFit.current = true;
      }
    }
  }, [vehicles, onSelectVehicle, buildIconHtml, getVehicleStateKey]);

  // Throttled marker update - 300ms throttle for smooth rendering with 70+ vehicles
  // Lower values = more responsive but more CPU, higher = smoother but less responsive
  const throttledUpdateMarkers = useThrottle(updateMarkersCore, 300);

  // Handle selection changes with smooth zoom (separate from position updates for responsiveness)
  useEffect(() => {
    if (!mapRef.current || followDisabled) return;
    
    const isNewSelection = prevSelectedRef.current !== selectedVehicleId;
    prevSelectedRef.current = selectedVehicleId;
    
    if (selectedVehicleId && isNewSelection) {
      const selected = vehicleMap.get(selectedVehicleId);
      if (selected?.latitude && selected?.longitude) {
        const map = mapRef.current;
        const targetLatLng: L.LatLngExpression = [selected.latitude, selected.longitude];
        const currentZoom = map.getZoom();
        
        // Disable map interactions during animation for smoother transition
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        
        const enableInteractions = () => {
          map.dragging.enable();
          map.touchZoom.enable();
          map.doubleClickZoom.enable();
          map.scrollWheelZoom.enable();
        };
        
        // Use setView for instant response when already zoomed in
        if (currentZoom >= 14) {
          // Already zoomed in - smooth pan without zoom
          map.setView(targetLatLng, currentZoom, { animate: true, duration: 0.3 });
          setTimeout(enableInteractions, 300);
        } else {
          // Need to zoom in - smooth setView (faster than flyTo)
          map.setView(targetLatLng, 16, { animate: true, duration: 0.4 });
          setTimeout(enableInteractions, 400);
        }
      }
    }
  }, [selectedVehicleId, vehicleMap, followDisabled]);

  // Update markers - directly call updateMarkersCore when vehicles change
  // IMPORTANT: Must depend on `vehicles` to trigger updates when vehicle positions change
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      // Call directly instead of through throttle to ensure updates happen
      updateMarkersCore();
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateMarkersCore]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: "400px" }} />

      {/* Context menu on right-click */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="absolute z-[1200] bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl py-1 min-w-[200px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {/* If a vehicle is selected, show "Route from {plate} to here" */}
          {selectedVehicleId && onRouteToHere && (() => {
            const selectedV = vehicles.find((v) => v.id === selectedVehicleId);
            return (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                onClick={() => {
                  onRouteToHere(ctxMenu.latlng);
                  setCtxMenu(null);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                </svg>
                <span>Route from <strong>{selectedV?.vehicle_plate || "vehicle"}</strong> to here</span>
              </button>
            );
          })()}

          {/* If a start point is set (no vehicle or in addition), show "Route to here" */}
          {routeStart && !selectedVehicleId && onRouteToHere && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                onRouteToHere(ctxMenu.latlng);
                setCtxMenu(null);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              <span>Route to here</span>
            </button>
          )}

          {/* Set as start point */}
          {onSetRouteStart && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                onSetRouteStart(ctxMenu.latlng);
                setCtxMenu(null);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Set as start point</span>
            </button>
          )}

          {/* Clear route */}
          {routeData && onRouteClear && (
            <>
              <div className="border-t border-border/30 my-1" />
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
                onClick={() => {
                  onRouteClear();
                  setCtxMenu(null);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Clear route</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Notification bell icon -- above search */}
      <div ref={notifContainerRef} className="absolute bottom-[202px] right-[10px] z-[1100]">
        <button
          type="button"
          onClick={() => {
            setNotifOpen(!notifOpen);
            if (!notifOpen) onNotificationsRead?.();
          }}
          className={`relative w-[30px] h-[30px] border rounded-sm shadow-md flex items-center justify-center transition-colors ${
            notifOpen
              ? "bg-primary/20 border-primary/50 text-primary"
              : "bg-card border-border/60 text-foreground hover:bg-muted"
          }`}
          title="Notifications"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* Notifications panel */}
        {notifOpen && (
          <div className="absolute bottom-0 right-[38px] w-[340px] bg-card/95 backdrop-blur-md border border-border/40 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-2 fade-in duration-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <span className="text-xs font-semibold text-foreground">Events</span>
                {notifications.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">({notifications.length})</span>
                )}
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-muted-foreground/40 mb-2">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <p className="text-xs text-muted-foreground">No events yet</p>
                </div>
              ) : (
                notifications.slice(0, 20).map((ev) => {
                  const evInfo = getEventInfo(ev.type);
                  return (
                    <button
                      type="button"
                      key={ev.id}
                      className="w-full text-left flex items-start gap-2.5 px-3 py-2 border-b border-border/10 last:border-0 hover:bg-muted/40 transition-colors cursor-pointer group"
                      onClick={() => {
                        onNotificationClick?.(ev.id);
                        setNotifOpen(false);
                      }}
                    >
                      <div
                        className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: evInfo.bgColor }}
                      >
                        <span className="text-[11px]">{evInfo.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-foreground group-hover:text-primary transition-colors">{evInfo.label}</span>
                          {ev.vehiclePlate && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">{ev.vehiclePlate}</span>
                          )}
                        </div>
                        {evInfo.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{evInfo.description}</p>
                        )}
                        <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                          {new Date(ev.eventTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          {" \u00b7 "}
                          {new Date(ev.eventTime).toLocaleDateString([], { day: "2-digit", month: "2-digit" })}
                        </p>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  );
                })
              )}
            </div>
            {/* View all footer */}
            {notifications.length > 0 && onNotificationClick && (
              <div className="border-t border-border/30 px-3 py-2">
                <button
                  type="button"
                  className="w-full text-center text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                  onClick={() => {
                    onNotificationClick(-1);
                    setNotifOpen(false);
                  }}
                >
                  View all notifications ({notifications.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Address search icon button -- above geofence */}
      <div ref={searchContainerRef} className="absolute bottom-[164px] right-[10px] z-[1100]">
        <button
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
          className={`w-[30px] h-[30px] border rounded-sm shadow-md flex items-center justify-center transition-colors ${
            searchOpen
              ? "bg-primary/20 border-primary/50 text-primary"
              : "bg-card border-border/60 text-foreground hover:bg-muted"
          }`}
          title="Search address"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Search panel -- opens to the left */}
        {searchOpen && (
          <div className="absolute bottom-0 right-[38px] w-[300px] bg-card/95 backdrop-blur-md border border-border/40 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-2 fade-in duration-200">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); } }}
                placeholder="Search address or place..."
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
              {searchLoading && (
                <svg className="animate-spin h-3.5 w-3.5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {searchQuery && !searchLoading && (
                <button type="button" onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex items-start gap-2 border-b border-border/10 last:border-0"
                    onClick={() => {
                      const lat = parseFloat(r.lat);
                      const lng = parseFloat(r.lon);
                      if (mapRef.current) {
                        mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 1 });
                      }
                      onSearchNavigate?.({ lat, lng }, r.display_name);
                      setSearchOpen(false);
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-muted-foreground">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-foreground leading-snug">{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.length >= 3 && !searchLoading && searchResults.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">No results found</div>
            )}
          </div>
        )}
      </div>

      {/* Route info card */}
      {routeData && (
        <div className="absolute top-3 right-3 z-[1100] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl shadow-2xl w-[260px] overflow-hidden">
          {/* Route endpoints */}
          <div className="px-3 pt-2.5 pb-2 space-y-1.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{routeData.startAddress || "Start"}</p>
            </div>
            <div className="ml-1.5 border-l border-dashed border-border/50 h-2" />
            <div className="flex items-start gap-2">
              <div className="mt-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{routeData.endAddress || "Destination"}</p>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-0 border-t border-border/30 bg-muted/30">
            <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" /><path d="M8 6h10v10" />
              </svg>
              <span className="font-semibold text-foreground">{routeData.distance_km} km</span>
            </div>
            <div className="w-px h-5 bg-border/40" />
            <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="font-semibold text-foreground">
                {routeData.duration_minutes >= 60
                  ? `${Math.floor(routeData.duration_minutes / 60)}h ${routeData.duration_minutes % 60}m`
                  : `${routeData.duration_minutes} min`}
              </span>
            </div>
            {onRouteClear && (
              <>
                <div className="w-px h-5 bg-border/40" />
                <button
                  type="button"
                  onClick={onRouteClear}
                  className="px-2.5 py-2 text-muted-foreground hover:text-destructive transition-colors"
                  title="Clear route"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Route loading indicator */}
      {routeLoading && (
        <div className="absolute top-3 right-3 z-[1100] bg-card/95 backdrop-blur-md border border-border/40 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-2.5 text-xs text-muted-foreground">
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <span>Calculating route...</span>
        </div>
      )}

      {/* Geofence toggle button -- above layers button */}
      {onGeofencePanelToggle && (
        <div className="absolute bottom-[126px] right-[10px] z-[1100]">
          <button
            type="button"
            onClick={onGeofencePanelToggle}
            className={`w-[30px] h-[30px] border rounded-sm shadow-md flex items-center justify-center transition-colors ${
              geofencePanelOpen || showGeofences
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-card border-border/60 text-foreground hover:bg-muted"
            }`}
            title="Geofences"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </button>
        </div>
      )}

      {/* Layers icon button -- above zoom controls (bottom-right) */}
      <div ref={layersRef} className="absolute bottom-[88px] right-[10px] z-[1100]">
        <button
          type="button"
          onClick={() => setLayersOpen(!layersOpen)}
          className="w-[30px] h-[30px] bg-card border border-border/60 rounded-sm shadow-md flex items-center justify-center hover:bg-muted transition-colors"
          title="Map layers"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
            <path d="M12 2 L2 7 L12 12 L22 7 Z" />
            <path d="M2 17 L12 22 L22 17" />
            <path d="M2 12 L12 17 L22 12" />
          </svg>
        </button>

        {/* Layers popup -- opens to the left */}
        {layersOpen && (
          <div className="absolute bottom-0 right-[38px] bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl p-2 min-w-[160px]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1.5 mb-1 border-b border-border/30">
              Map Style
            </p>
            {Object.entries(TILE_LAYERS).map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => { switchTile(key); setLayersOpen(false); }}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
                  activeTile === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {activeTile === key && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span className={activeTile === key ? "" : "pl-5"}>{config.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
