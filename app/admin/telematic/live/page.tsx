"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  RefreshCw,
  Truck,
  Fuel,
  Navigation,
  Radio,
  Power,
  PowerOff,
  Satellite,
  Clock,
  MapPin,
  Signal,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  WifiOff,
  Route,
  ChevronDown,
  ChevronRight,
  Info,
  Gauge,
  Compass,
  Zap,
  Activity,
  Timer,
  Copy,
  Check,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { FleetVehicle, FleetTrailer, TraccarGroup, MapGeofence, RouteData, TraccarEvent } from "@/components/telematic/fleet-map";
import { TRACCAR_MAP_TO_TILE, TILE_TO_TRACCAR_MAP, parseGeofenceArea, getEventLabel, getEventInfo } from "@/components/telematic/fleet-map";
import { toast } from "sonner";
import L from "leaflet";

const FleetMap = dynamic(() => import("@/components/telematic/fleet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-muted/20 animate-pulse flex items-center justify-center">
      <div className="text-center space-y-2">
        <Satellite className="h-8 w-8 text-muted-foreground mx-auto animate-pulse" />
        <p className="text-muted-foreground text-sm">Loading fleet map...</p>
      </div>
    </div>
  ),
});

const RouteHistoryPanel = dynamic(() => import("@/components/tms/route-history-panel"), {
  ssr: false,
});

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function formatSince(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return "";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h`;
  } catch { return ""; }
}

function formatEngineMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

// Country name -> ISO code mapping (same as planning page)
const COUNTRY_CODES: Record<string, string> = {
  romania: "RO", germany: "DE", france: "FR", austria: "AT", hungary: "HU",
  poland: "PL", "czech republic": "CZ", czechia: "CZ", slovakia: "SK",
  italy: "IT", spain: "ES", netherlands: "NL", belgium: "BE", croatia: "HR",
  slovenia: "SI", serbia: "RS", bulgaria: "BG", greece: "GR", turkey: "TR",
  ukraine: "UA", moldova: "MD", "united kingdom": "GB", uk: "GB",
  ireland: "IE", portugal: "PT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", switzerland: "CH", luxembourg: "LU", lithuania: "LT",
  latvia: "LV", estonia: "EE", belarus: "BY", "bosnia and herzegovina": "BA",
  "north macedonia": "MK", montenegro: "ME", albania: "AL", kosovo: "XK",
  magyarorszag: "HU", "magyarorsz\u00E1g": "HU", ungarn: "HU",
  deutschland: "DE", allemagne: "DE", germania: "DE", "rom\u00E2nia": "RO",
  polska: "PL", "\u010Desko": "CZ", slovensko: "SK", "\u00F6sterreich": "AT",
  italia: "IT", "espa\u00F1a": "ES", nederland: "NL", "the netherlands": "NL",
  "belgi\u00EB": "BE", belgique: "BE", hrvatska: "HR", slovenija: "SI",
  srbija: "RS", schweiz: "CH", suisse: "CH", svizzera: "CH",
  sverige: "SE", norge: "NO", danmark: "DK", suomi: "FI",
  lietuva: "LT", latvija: "LV", eesti: "EE", "crna gora": "ME",
  england: "GB", scotland: "GB", wales: "GB",
  "ober\u00F6sterreich": "AT", "nieder\u00F6sterreich": "AT",
  "hauts-de-france": "FR", "ile-de-france": "FR",
};

function getCountryCode(country: string): string {
  if (!country) return "";
  const trimmed = country.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) return upper;
  if (upper.length === 3) {
    const twoLetter = upper.substring(0, 2);
    if (["DE","NL","FR","IT","ES","AT","PL","CZ","SK","HU","RO","BG","HR","SI","RS","GR","TR","UA","BE","LU","CH","SE","NO","DK","FI","LT","LV","EE","IE","PT","GB"].includes(twoLetter)) return twoLetter;
  }
  return COUNTRY_CODES[trimmed.toLowerCase()] || "";
}

function extractCountryFromAddress(address: string | undefined | null): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim());
  // Try last part first (e.g. "GB", "AT", "FR")
  const last = parts[parts.length - 1];
  if (last) {
    const code = getCountryCode(last);
    if (code) return code;
  }
  // Try second-to-last (sometimes region before code, e.g. "England, GB")
  if (parts.length >= 2) {
    const secondLast = parts[parts.length - 2];
    if (secondLast) {
      const code = getCountryCode(secondLast);
      if (code) return code;
    }
  }
  return "";
}

function CountryFlag({ country, className = "w-4 h-3" }: { country: string; className?: string }) {
  const code = typeof country === "string" && country.length === 2 ? country : getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={code}
      className={`${className} rounded-[2px] object-cover shrink-0`}
      crossOrigin="anonymous"
    />
  );
}

function getStatusInfo(v: FleetVehicle) {
  if (v.speed > 2 && v.motion) return { label: "Moving", color: "bg-green-500", textColor: "text-green-400" };
  if (v.ignition && !v.motion) return { label: "Idling", color: "bg-amber-500", textColor: "text-amber-400" };
  return { label: "Parked", color: "bg-muted-foreground", textColor: "text-muted-foreground" };
}

// ── Geometric point-in-geofence checks ──
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > lon) !== (yj > lon)) &&
      (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isVehicleInGeofence(vLat: number, vLon: number, gf: MapGeofence): boolean {
  const parsed = parseGeofenceArea(gf.area);
  if (!parsed) return false;
  if (parsed.type === "circle") {
    return haversineDistance(vLat, vLon, parsed.center[0], parsed.center[1]) <= parsed.radius;
  }
  if (parsed.type === "polygon") {
    return pointInPolygon(vLat, vLon, parsed.points);
  }
  return false;
}

function getVehiclesInGeofence(vehicles: FleetVehicle[], gf: MapGeofence): FleetVehicle[] {
  return vehicles.filter((v) => isVehicleInGeofence(v.latitude, v.longitude, gf));
}

export default function TelematicLivePage() {
  const router = useRouter();
  const [adminSession, setAdminSession] = useState<{ id: string } | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [trailers, setTrailers] = useState<FleetTrailer[]>([]);
  const [showTrailers, setShowTrailers] = useState(false); // Toggle for showing trailers
  const [groups, setGroups] = useState<TraccarGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "moving" | "idling" | "parked">("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMapTile, setUserMapTile] = useState<string>("dark");
  const [traccarUserId, setTraccarUserId] = useState<number | null>(null);
  const [routeHistoryVehicleId, setRouteHistoryVehicleId] = useState<string | null>(null);
  const [infoPanelVehicleId, setInfoPanelVehicleId] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState<{
    distance: number; averageSpeed: number; maxSpeed: number;
    spentFuel: number; engineHours: number; startTime: string; endTime: string;
  } | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const dailySummaryFetchedForRef = useRef<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [checkedVehicleIds, setCheckedVehicleIds] = useState<Set<string>>(new Set());
  const [geofences, setGeofences] = useState<MapGeofence[]>([]);
  const [showGeofences, setShowGeofences] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("telematic_show_geofences") === "true";
    }
    return false;
  });
  const [geofencePanelOpen, setGeofencePanelOpen] = useState(false);
  const [geofenceSearch, setGeofenceSearch] = useState("");
  const [geofenceDetailId, setGeofenceDetailId] = useState<number | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routeStart, setRouteStart] = useState<{ lat: number; lng: number } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [notifications, setNotifications] = useState<TraccarEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  // Fetch user map preference from Traccar
  useEffect(() => {
    if (!adminSession?.id) return;
    fetch(`/api/traccar/user-map?adminId=${adminSession.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.map) {
          const tileKey = TRACCAR_MAP_TO_TILE[data.map] || data.map;
          setUserMapTile(tileKey);
        }
        if (data.userId) setTraccarUserId(data.userId);
      })
      .catch(() => {});
  }, [adminSession?.id]);

  // Fetch groups from Traccar
  useEffect(() => {
    if (!adminSession?.id) return;
    fetch(`/api/traccar/groups?adminId=${adminSession.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.groups) {
          setGroups(data.groups);
          // Auto-expand all groups + ungrouped (0) on initial load
          setExpandedGroups(new Set([0, ...data.groups.map((g: TraccarGroup) => g.id)]));
        }
      })
      .catch(() => {});
  }, [adminSession?.id]);

  // Fetch geofences from Traccar
  useEffect(() => {
    if (!adminSession?.id) return;
    fetch(`/api/traccar/geofences?adminId=${adminSession.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.geofences) setGeofences(data.geofences);
      })
      .catch(() => {});
  }, [adminSession?.id]);

  // Persist geofence toggle
  useEffect(() => {
    localStorage.setItem("telematic_show_geofences", showGeofences ? "true" : "false");
  }, [showGeofences]);

  const fetchPositions = useCallback(async () => {
    if (!adminSession?.id) return;
    try {
      const res = await fetch(`/api/traccar/positions?adminId=${adminSession.id}`);
      const data = await res.json();
      if (data.vehicles) {
        // Sort alphabetically once on initial load to establish stable order
        const sorted = [...data.vehicles].sort((a: FleetVehicle, b: FleetVehicle) => 
          a.vehicle_plate.localeCompare(b.vehicle_plate)
        );
        setVehicles(sorted);
      }
      if (data.trailers) {
        // Sort trailers alphabetically
        const sortedTrailers = [...data.trailers].sort((a: FleetTrailer, b: FleetTrailer) => 
          a.trailer_plate.localeCompare(b.trailer_plate)
        );
        setTrailers(sortedTrailers);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  // WebSocket SSE -- matches TMS planning pattern with exponential backoff
  // Delays initial connect by 2s so initial fetchPositions settles first
  useEffect(() => {
    if (!adminSession?.id) return;

    let retryTimeout: ReturnType<typeof setTimeout>;
    let es: EventSource | null = null;
    let destroyed = false;
    let retryCount = 0;
    const MAX_RETRY_DELAY = 120_000; // 2 minutes max between retries
    const BASE_RETRY_DELAY = 10_000; // Start at 10s

    const getRetryDelay = () => {
      // Exponential backoff: 10s, 20s, 40s, 80s, 120s (capped)
      const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);
      retryCount++;
      return delay;
    };

    const connect = () => {
      if (destroyed) return;
      es = new EventSource(`/api/traccar/ws?adminId=${adminSession!.id}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        if (destroyed) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "ws_open" || msg.type === "connected") {
            setWsConnected(true);
            retryCount = 0;
          }

          if (msg.type === "heartbeat") {
            setWsConnected(true);
          }

        if (msg.type === "positions" && msg.positions) {
          setWsConnected(true);
          setVehicles((prev) => {
            const updated = [...prev];
            for (const pos of msg.positions) {
              const idx = updated.findIndex((v) => v.vehicle_id === pos.vehicleId || v.id === pos.vehicleId);
              if (idx !== -1) {
                updated[idx] = {
                  ...updated[idx],
                  latitude: pos.latitude, longitude: pos.longitude,
                  speed: pos.speed, course: pos.course,
                  ignition: pos.ignition, motion: pos.motion,
                  address: pos.address, totalDistance: pos.totalDistance,
                  engineHours: pos.engineHours, fuel: pos.fuel,
                  battery: pos.battery, power: pos.power,
                  satellites: pos.satellites, last_update: pos.lastUpdate,
                  lastParked: pos.lastParked,
                };
              }
            }
            return updated;
          });
        }

          if (msg.type === "devices" && msg.devices) {
            setVehicles((prev) => {
              const updated = [...prev];
              for (const dev of msg.devices) {
                const idx = updated.findIndex((v) => v.vehicle_id === dev.vehicleId || v.id === dev.vehicleId);
                if (idx !== -1) updated[idx] = { ...updated[idx], device_status: dev.status };
              }
              return updated;
            });
          }

          // ── Event notifications ──
          if (msg.type === "events" && msg.events) {
            const newEvents: TraccarEvent[] = msg.events;
            setNotifications((prev) => {
              const merged = [...newEvents, ...prev];
              // Keep max 100 events to avoid memory growth
              return merged.slice(0, 100);
            });
            setUnreadCount((prev) => prev + newEvents.length);

            // Show toast for important events (skip noisy status changes)
            const TOAST_BLACKLIST = new Set(["deviceOnline", "deviceOffline", "deviceUnknown"]);
            for (const ev of newEvents) {
              if (TOAST_BLACKLIST.has(ev.type)) continue;
              const plate = ev.vehiclePlate || `Device ${ev.deviceId}`;
              const evMeta = getEventInfo(ev.type);
              toast.custom(
                (id) => (
                  <div
                    className="flex items-start gap-3 w-full max-w-[356px] rounded-lg border border-border/60 bg-card px-3.5 py-3 shadow-lg"
                    onClick={() => toast.dismiss(id)}
                  >
                    <div
                      className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                      style={{ backgroundColor: evMeta.bgColor }}
                    >
                      <span className="text-sm">{evMeta.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{evMeta.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-mono leading-none">{plate}</span>
                      </div>
                      {evMeta.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{evMeta.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {new Date(ev.eventTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ),
                { duration: 6000, position: "bottom-right" },
              );
            }
          }

          if (msg.type === "ws_closed" || msg.type === "ws_error") {
            setWsConnected(false);
            es?.close();
            if (!destroyed) {
              retryTimeout = setTimeout(connect, getRetryDelay());
            }
          }

          if (msg.type === "rate_limited") {
            es?.close();
            if (!destroyed) {
              retryTimeout = setTimeout(connect, msg.retryAfter || 10000);
            }
          }
        } catch { /* parse error */ }
      };

      es.onerror = () => {
        if (destroyed) return;
        setWsConnected(false);
        es?.close();
        if (!destroyed) {
          retryTimeout = setTimeout(connect, getRetryDelay());
        }
      };
    };

    // Delay initial WS connection by 2s to let the initial fetchPositions settle first
    // This avoids hitting Traccar with simultaneous requests on page load
    retryTimeout = setTimeout(connect, 2000);

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      es?.close();
      eventSourceRef.current = null;
      setWsConnected(false);
    };
  }, [adminSession?.id]);

  // Fetch daily summary when info panel opens for a vehicle (once per vehicle)
  useEffect(() => {
    if (!infoPanelVehicleId || !adminSession?.id) {
      setDailySummary(null);
      dailySummaryFetchedForRef.current = null;
      return;
    }
  // Don't re-fetch if we already fetched for this vehicle/trailer
  if (dailySummaryFetchedForRef.current === infoPanelVehicleId) return;
  // Check vehicles first, then trailers
  const v = vehicles.find((vv) => vv.id === infoPanelVehicleId) || 
    trailers.find((t) => t.id === infoPanelVehicleId);
  if (!v?.traccar_device_id) return;

    dailySummaryFetchedForRef.current = infoPanelVehicleId;
    setDailySummaryLoading(true);
    setDailySummary(null);
    fetch(`/api/traccar/summary?adminId=${adminSession.id}&deviceId=${v.traccar_device_id}`)
      .then((r) => r.json())
      .then((data) => { if (data.summary) setDailySummary(data.summary); })
      .catch(() => {})
      .finally(() => setDailySummaryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoPanelVehicleId, adminSession?.id]);

  // Handle tile change -- save to Traccar user preference
  const handleTileChange = useCallback((tile: string) => {
    if (!adminSession?.id || !traccarUserId) return;
    const traccarMapName = TILE_TO_TRACCAR_MAP[tile] || tile;
    fetch(`/api/traccar/user-map?adminId=${adminSession.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map: traccarMapName, userId: traccarUserId }),
    }).catch(() => {});
  }, [adminSession?.id, traccarUserId]);

  // ── Reverse geocode helper ──
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(`/api/tms/geocode?action=reverse&lat=${lat}&lon=${lng}&zoom=16`);
      if (res.ok) {
        const data = await res.json();
        return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    } catch { /* silent */ }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }, []);

  // Store last route endpoints for via-point recalculation
  const lastRouteEndpointsRef = useRef<{ start: { lat: number; lng: number }; end: { lat: number; lng: number } } | null>(null);

  // ── Route calculation handlers ──
  const calculateRoute = useCallback(async (
    start: { lat: number; lng: number },
    end: { lat: number; lng: number },
    via?: { lat: number; lng: number },
  ) => {
    setRouteLoading(true);
    setRouteData(null);
    lastRouteEndpointsRef.current = { start, end };

    try {
      const locations: Array<{ lat: number; lon: number; type?: string }> = [
        { lat: start.lat, lon: start.lng },
      ];
      if (via) {
        locations.push({ lat: via.lat, lon: via.lng, type: "through" });
      }
      locations.push({ lat: end.lat, lon: end.lng });

      const [routeRes, startAddr, endAddr] = await Promise.all([
        fetch("/api/tms/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locations, costing: "truck" }),
        }),
        reverseGeocode(start.lat, start.lng),
        reverseGeocode(end.lat, end.lng),
      ]);

      if (!routeRes.ok) throw new Error("Route calculation failed");
      const data = await routeRes.json();
      setRouteData({
        latlngs: data.latlngs,
        distance_km: data.distance_km,
        duration_minutes: data.duration_minutes,
        startAddress: startAddr,
        endAddress: endAddr,
      });
      setRouteStart(null);
    } catch {
      // Route failed silently
    } finally {
      setRouteLoading(false);
    }
  }, [reverseGeocode]);

  const handleRouteToHere = useCallback(async (destination: { lat: number; lng: number }) => {
    let startLat: number;
    let startLng: number;

    if (selectedVehicleId) {
      const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
      if (!vehicle) return;
      startLat = vehicle.latitude;
      startLng = vehicle.longitude;
    } else if (routeStart) {
      startLat = routeStart.lat;
      startLng = routeStart.lng;
    } else {
      return;
    }

    await calculateRoute({ lat: startLat, lng: startLng }, destination);
  }, [selectedVehicleId, vehicles, routeStart, calculateRoute]);

  const handleRouteViaPoint = useCallback(async (via: { lat: number; lng: number }) => {
    if (!lastRouteEndpointsRef.current) return;
    const { start, end } = lastRouteEndpointsRef.current;
    await calculateRoute(start, end, via);
  }, [calculateRoute]);

  const handleSetRouteStart = useCallback((latlng: { lat: number; lng: number }) => {
    setRouteStart(latlng);
    setRouteData(null);
  }, []);

  const handleRouteClear = useCallback(() => {
    setRouteData(null);
    setRouteStart(null);
    lastRouteEndpointsRef.current = null;
  }, []);

  const handleSearchNavigate = useCallback((_latlng: { lat: number; lng: number }, _label: string) => {
    // Map already flies to the location via the FleetMap component
  }, []);

  const handleNotificationsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const handleNotificationClick = useCallback((eventId: number) => {
    if (eventId === -1) {
      // "View all" -- go to notifications page
      router.push("/admin/telematic/notifications");
    } else {
      // Navigate to notifications page with event highlighted
      router.push(`/admin/telematic/notifications?eventId=${eventId}`);
    }
  }, [router]);

  // Fetch recent events from Traccar on page load (today, fallback to yesterday)
  useEffect(() => {
    if (!adminSession?.id) return;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = todayStart.toISOString();
    const to = now.toISOString();
    fetch(`/api/traccar/events?adminId=${adminSession.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setNotifications(data.slice(0, 50));
        } else {
          // Fallback to yesterday
          const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
          fetch(`/api/traccar/events?adminId=${adminSession.id}&from=${encodeURIComponent(yesterdayStart.toISOString())}&to=${encodeURIComponent(from)}`)
            .then((r) => r.json())
            .then((d) => { if (Array.isArray(d) && d.length > 0) setNotifications(d.slice(0, 50)); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [adminSession?.id]);

  // Stats
  const movingCount = vehicles.filter((v) => v.speed > 2 && v.motion).length;
  const idlingCount = vehicles.filter((v) => v.ignition && !v.motion).length;
  const parkedCount = vehicles.length - movingCount - idlingCount;
  const disconnectedCount = vehicles.filter((v) => v.device_status === "offline").length;

  // Memoize filtered/sorted vehicles for stable list order and performance
  const filtered = useMemo(() => {
    let result = vehicles;
    
    // Status filter
    if (statusFilter === "moving") result = result.filter((v) => v.speed > 2 && v.motion);
    else if (statusFilter === "idling") result = result.filter((v) => v.ignition && !v.motion);
    else if (statusFilter === "parked") result = result.filter((v) => !v.ignition && !v.motion);
    
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) =>
        v.vehicle_plate.toLowerCase().includes(q) ||
        v.driver_name.toLowerCase().includes(q) ||
        (v.address || "").toLowerCase().includes(q)
      );
    }
    
    // Vehicles are already sorted alphabetically from initial load,
    // but re-sort to ensure stable order after any filtering
    return result.sort((a, b) => a.vehicle_plate.localeCompare(b.vehicle_plate));
  }, [vehicles, statusFilter, searchQuery]);

  // Memoize vehicle -> geofence mapping (expensive polygon checks, avoid on every render)
  const vehicleGeofenceMap = useMemo(() => {
    const map = new Map<string, MapGeofence[]>();
    for (const v of vehicles) {
      if (!v.latitude || !v.longitude) continue;
      const matches = geofences.filter((gf) => isVehicleInGeofence(v.latitude, v.longitude, gf));
      if (matches.length > 0) map.set(v.id, matches);
    }
    return map;
  }, [vehicles, geofences]);

  // Memoize grouped vehicles for sidebar rendering (performance for 500+ devices)
  const groupedVehicles = useMemo(() => {
    const groupMap = new Map<number, { group: TraccarGroup | null; vehicles: FleetVehicle[] }>();
    const ungrouped: FleetVehicle[] = [];
    
    for (const v of filtered) {
      const gId = v.groupId || 0;
      if (gId === 0) {
        ungrouped.push(v);
      } else {
        if (!groupMap.has(gId)) {
          const g = groups.find((gr) => gr.id === gId) || null;
          groupMap.set(gId, { group: g, vehicles: [] });
        }
        groupMap.get(gId)!.vehicles.push(v);
      }
    }
    
    // Sort groups alphabetically, and ensure vehicles within each group are alphabetical
    const sorted = Array.from(groupMap.entries())
      .map(([gId, data]) => [gId, { ...data, vehicles: data.vehicles.sort((a, b) => a.vehicle_plate.localeCompare(b.vehicle_plate)) }] as [number, typeof data])
      .sort(([, a], [, b]) => (a.group?.name || "").localeCompare(b.group?.name || ""));
    
    if (ungrouped.length > 0) {
      ungrouped.sort((a, b) => a.vehicle_plate.localeCompare(b.vehicle_plate));
      sorted.unshift([0, { group: null, vehicles: ungrouped }]);
    }
    
    return sorted;
  }, [filtered, groups]);

  // Convert trailers to FleetVehicle format for unified map display
  const trailersAsVehicles: FleetVehicle[] = useMemo(() => 
    trailers.map((t) => ({
      id: t.id,
      vehicle_id: t.trailer_id,
      vehicle_plate: t.trailer_plate,
      vehicle_model: t.trailer_type,
      driver_name: "Trailer",
      driver_id: null,
      latitude: t.latitude,
      longitude: t.longitude,
      speed: t.speed,
      course: t.course,
      ignition: t.ignition,
      motion: t.motion,
      device_status: t.device_status,
      last_update: t.last_update,
      address: t.address,
      totalDistance: t.totalDistance,
      engineHours: null,
      fuel: null,
      battery: t.battery,
      power: t.power,
      satellites: t.satellites,
      groupId: -1, // Special group ID for trailers
      traccar_device_id: t.traccar_device_id,
      lastParked: null,
      geofenceIds: t.geofenceIds,
      asset_type: "trailer" as const,
    }))
  , [trailers]);

  // Selected vehicle (check vehicles first, then trailers)
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || 
    (showTrailers ? trailersAsVehicles.find((v) => v.id === selectedVehicleId) : undefined);

  // Combined assets for map display (vehicles + trailers only when showTrailers is true)
  // Always spread to ensure new array reference on updates
  const allMapAssets = useMemo(() => 
    showTrailers ? [...vehicles, ...trailersAsVehicles] : [...vehicles]
  , [vehicles, trailersAsVehicles, showTrailers]);

  // Vehicles shown on map:
  // - If route history is open, hide ALL vehicle markers (route line takes focus)
  // - Else if no checkboxes checked, show all
  // - Else show only checked vehicles
  const mapVehicles = routeHistoryVehicleId
    ? [] // Hide all markers when viewing route history
    : checkedVehicleIds.size === 0
      ? allMapAssets
      : allMapAssets.filter((v) => checkedVehicleIds.has(v.id));

  // Toggle a single vehicle checkbox
  const toggleVehicleCheck = useCallback((vehicleId: string) => {
    setCheckedVehicleIds((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }, []);

  // Toggle entire group checkbox
  const toggleGroupCheck = useCallback((groupId: number) => {
    const groupVehicles = vehicles.filter((v) => (groupId === 0 ? (!v.groupId || v.groupId === 0) : v.groupId === groupId));
    setCheckedVehicleIds((prev) => {
      const next = new Set(prev);
      const allChecked = groupVehicles.every((v) => prev.has(v.id));
      if (allChecked) {
        // Uncheck all in group
        for (const v of groupVehicles) next.delete(v.id);
      } else {
        // Check all in group
        for (const v of groupVehicles) next.add(v.id);
      }
      return next;
    });
  }, [vehicles]);

  // Check if a group is fully/partially checked
  const getGroupCheckState = useCallback((groupId: number): "none" | "some" | "all" => {
    if (checkedVehicleIds.size === 0) return "none";
    const groupVehicles = vehicles.filter((v) => (groupId === 0 ? (!v.groupId || v.groupId === 0) : v.groupId === groupId));
    if (groupVehicles.length === 0) return "none";
    const checkedCount = groupVehicles.filter((v) => checkedVehicleIds.has(v.id)).length;
    if (checkedCount === 0) return "none";
    if (checkedCount === groupVehicles.length) return "all";
    return "some";
  }, [checkedVehicleIds, vehicles]);

  // Group color helper for sidebar
  const getGroupColor = (v: FleetVehicle): string | null => {
    if (!v.groupId || v.groupId === 0) return null;
    const group = groups.find((g) => g.id === v.groupId);
    return group?.attributes?.iconColor || null;
  };

  const getGroupName = (v: FleetVehicle): string | null => {
    if (!v.groupId || v.groupId === 0) return null;
    const group = groups.find((g) => g.id === v.groupId);
    return group?.name || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Satellite className="h-10 w-10 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground text-sm">Connecting to fleet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Map is full-screen behind everything */}
      <div className="absolute inset-0 z-0">
    <FleetMap
      vehicles={mapVehicles}
      groups={groups}
      selectedVehicleId={selectedVehicleId}
      onSelectVehicle={(id) => { setSelectedVehicleId(id); setInfoPanelVehicleId(id); }}
      initialTile={userMapTile}
      followDisabled={!!routeHistoryVehicleId}
          onTileChange={handleTileChange}
          mapRef={mapRef}
          geofences={geofences}
          showGeofences={showGeofences}
          onGeofencePanelToggle={() => { setGeofencePanelOpen((p) => !p); setGeofenceDetailId(null); }}
          geofencePanelOpen={geofencePanelOpen}
          routeData={routeData}
          routeStart={routeStart}
          routeLoading={routeLoading}
          onRouteToHere={handleRouteToHere}
          onSetRouteStart={handleSetRouteStart}
          onRouteClear={handleRouteClear}
          onRouteViaPoint={handleRouteViaPoint}
          onSearchNavigate={handleSearchNavigate}
          notifications={notifications}
          unreadCount={unreadCount}
          onNotificationsRead={handleNotificationsRead}
          onNotificationClick={handleNotificationClick}
        />
      </div>

      {/* Route History Panel (reuses the TMS component) - supports vehicles and trailers */}
      {routeHistoryVehicleId && adminSession?.id && (
        <RouteHistoryPanel
          vehicleId={routeHistoryVehicleId}
          vehiclePlate={vehicles.find((v) => v.id === routeHistoryVehicleId)?.vehicle_plate || 
            trailersAsVehicles.find((v) => v.id === routeHistoryVehicleId)?.vehicle_plate || ""}
          adminId={adminSession.id}
          mapRef={mapRef}
          onClose={() => setRouteHistoryVehicleId(null)}
        />
      )}

      {/* Floating sidebar toggle (when sidebar is closed) */}
      {!sidebarOpen && !routeHistoryVehicleId && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="absolute top-3 left-3 z-[1001] bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg p-2 shadow-lg hover:bg-muted transition-colors"
        >
          <PanelLeftOpen className="h-4.5 w-4.5 text-foreground" />
        </button>
      )}

      {/* Floating sidebar overlay on map */}
      {sidebarOpen && !routeHistoryVehicleId && (
        <div className="absolute top-3 left-3 bottom-3 z-[1001] w-80 flex flex-col bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-border/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Satellite className="h-4 w-4 text-primary" />
                <h1 className="font-semibold text-sm">Fleet Tracking</h1>
              </div>
              <div className="flex items-center gap-1">
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  wsConnected ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                  {wsConnected ? "Live" : "..."}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchPositions} title="Refresh positions">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Status filter pills */}
            <div className="flex items-center gap-1 text-[10px] font-semibold">
              <button type="button" onClick={() => setStatusFilter("all")}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                  statusFilter === "all"
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                }`}>
                <Satellite className="h-3 w-3" />
                <span>{vehicles.length}</span>
                <span className="text-[8px] font-normal opacity-60">Total</span>
              </button>
              <button type="button" onClick={() => setStatusFilter("moving")}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                  statusFilter === "moving"
                    ? "bg-green-500/15 text-green-400"
                    : "text-muted-foreground hover:bg-green-500/10 hover:text-green-400"
                }`}>
                <Navigation className="h-3 w-3" />
                <span>{movingCount}</span>
              </button>
              <button type="button" onClick={() => setStatusFilter("idling")}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                  statusFilter === "idling"
                    ? "bg-amber-500/15 text-amber-400"
                    : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-400"
                }`}>
                <Radio className="h-3 w-3" />
                <span>{idlingCount}</span>
              </button>
  <button type="button" onClick={() => setStatusFilter("parked")}
  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
  statusFilter === "parked"
  ? "bg-blue-500/15 text-blue-400"
  : "text-muted-foreground hover:bg-blue-500/10 hover:text-blue-400"
  }`}>
  <span className="text-[10px] leading-none font-extrabold">P</span>
  <span>{parkedCount}</span>
  </button>
  {/* Trailer toggle */}
  {trailers.length > 0 && (
  <button 
    type="button" 
    onClick={() => setShowTrailers(!showTrailers)}
    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
      showTrailers
        ? "bg-amber-500/15 text-amber-400"
        : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-400"
    }`}
    title={showTrailers ? "Hide trailers" : "Show trailers"}
  >
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="10" width="16" height="8" rx="1" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="13" cy="18" r="2" />
      <path d="M17 14h4l2 4h-6" />
      <circle cx="21" cy="18" r="2" />
    </svg>
    <span>{trailers.length}</span>
  </button>
  )}
  {disconnectedCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-400">
                  <WifiOff className="h-3 w-3" /> {disconnectedCount}
                </span>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm bg-background/50"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Selection controls */}
            <div className="flex items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                <Checkbox
                  checked={checkedVehicleIds.size > 0 && checkedVehicleIds.size === vehicles.length}
                  className="h-4 w-4 rounded-[3px] border-muted-foreground/50 data-[state=checked]:border-primary"
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setCheckedVehicleIds(new Set(vehicles.map((v) => v.id)));
                    } else {
                      setCheckedVehicleIds(new Set());
                    }
                  }}
                  {...(checkedVehicleIds.size > 0 && checkedVehicleIds.size < vehicles.length ? { "data-state": "indeterminate" } : {})}
                />
                <span>Select All</span>
              </label>
              {checkedVehicleIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setCheckedVehicleIds(new Set())}
                  className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                  <span>Clear ({checkedVehicleIds.size})</span>
                </button>
              )}
            </div>
          </div>

          {/* Vehicle list grouped by Traccar groups */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <Truck className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No vehicles found</p>
              </div>
            ) : (() => {
              // Use memoized groupedVehicles for performance

              const toggleGroup = (gId: number) => {
                setExpandedGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(gId)) next.delete(gId); else next.add(gId);
                  return next;
                });
              };

              const renderVehicle = (v: FleetVehicle) => {
                const isSelected = selectedVehicleId === v.id;
                const status = getStatusInfo(v);
                const isOnline = v.device_status !== "offline";
                const hasGps = v.latitude && v.longitude;
                const lastUpdateText = v.last_update ? formatTimeAgo(v.last_update) : "";
                const isStale = !isOnline || (v.last_update && (Date.now() - new Date(v.last_update).getTime()) > 86400000);
                return (
                  <div key={v.id} className={`group/item flex items-start border-b border-border/10 transition-all ${
                      isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/20"
                    }`}>
                    {/* Checkbox */}
                    <div className="flex items-center pl-2 pt-2.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checkedVehicleIds.has(v.id)}
                        onCheckedChange={() => toggleVehicleCheck(v.id)}
                        className="h-4 w-4 rounded-[3px] border-muted-foreground/50 data-[state=checked]:border-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newId = isSelected ? null : v.id;
                        setSelectedVehicleId(newId);
                        setInfoPanelVehicleId(newId);
                      }}
                      className="flex-1 text-left px-2 pr-2.5 py-1.5 min-w-0"
                    >
                    {/* Row 1: Plate + speed + actions */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Ignition indicator */}
                        <Zap className={`h-3 w-3 flex-shrink-0 ${v.ignition ? "text-green-500" : "text-muted-foreground/30"}`} />
                        <span className="text-[12px] font-bold truncate">{v.vehicle_plate}</span>
                        {/* Status badge */}
                        <span className={`text-[9px] font-semibold px-1 py-px rounded ${
                          status.label === "Moving" ? "bg-green-500/10 text-green-400" :
                          status.label === "Idling" ? "bg-amber-500/10 text-amber-400" :
                          "bg-muted text-muted-foreground"
                        }`}>{status.label}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {v.speed > 2 && (
                          <span className="text-[10px] font-semibold text-green-400 tabular-nums">{Math.round(v.speed)} km/h</span>
                        )}
                        {/* Action icons on hover */}
                        {hasGps && (
                          <div className="flex items-center gap-px opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button
                              type="button"
                              className={`p-0.5 rounded transition-colors ${
                                infoPanelVehicleId === v.id
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "text-muted-foreground hover:text-blue-400"
                              }`}
                              title="Vehicle info"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVehicleId(v.id);
                                setInfoPanelVehicleId(infoPanelVehicleId === v.id ? null : v.id);
                              }}
                            >
                              <Info className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              className={`p-0.5 rounded transition-colors ${
                                routeHistoryVehicleId === v.id
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "text-muted-foreground hover:text-amber-400"
                              }`}
                              title="Route history"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newId = routeHistoryVehicleId === v.id ? null : v.id;
                                setRouteHistoryVehicleId(newId);
                                // Close info panel when opening route history
                                if (newId) setInfoPanelVehicleId(null);
                              }}
                            >
                              <Route className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Row 2: Connection + duration + country */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                      {/* Connection status */}
                      {isOnline ? (
                        <span className="text-green-400/80">Connected</span>
                      ) : (
                        <span className="text-red-400/70">{isStale ? lastUpdateText : "Offline"}</span>
                      )}
                      {/* Duration since status change */}
                      {(() => {
                        const sinceText = formatSince(v.lastParked);
                        if (!sinceText) return null;
                        return (
                          <>
                            <span className="text-border/60">{"/"}</span>
                            <span className={
                              status.label === "Moving" ? "text-green-400/70" :
                              status.label === "Idling" ? "text-amber-400/70" :
                              "text-blue-400/70"
                            }>
                              {status.label} {sinceText}
                            </span>
                          </>
                        );
                      })()}
                      {/* Geofence indicator + Country flag */}
                      <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                        {(() => {
                          const matchingGfs = vehicleGeofenceMap.get(v.id);
                          if (!matchingGfs || matchingGfs.length === 0) return null;
                          const firstGf = matchingGfs[0];
                          return (
                            <span
                              className="text-[8px] font-semibold px-1 py-px rounded truncate max-w-[60px]"
                              style={{
                                backgroundColor: `${firstGf.attributes?.color || "#3b82f6"}20`,
                                color: firstGf.attributes?.color || "#3b82f6",
                              }}
                              title={matchingGfs.map((g) => g.name).join(", ")}
                            >
                              {firstGf.name}
                            </span>
                          );
                        })()}
                        {(() => {
                          const code = extractCountryFromAddress(v.address);
                          if (!code) return null;
                          return <CountryFlag country={code} className="w-4 h-3" />;
                        })()}
                      </span>
                    </div>
                    </button>
                  </div>
                );
              };

              // Render trailer item helper (matches vehicle style 1:1)
              const renderTrailer = (t: FleetTrailer) => {
                const isSelected = selectedVehicleId === t.id;
                const isMoving = t.speed > 2 && t.motion;
                const status = isMoving ? { label: "Moving" } : { label: "Parked" };
                const isOnline = t.device_status !== "offline";
                const hasGps = t.latitude && t.longitude;
                const lastUpdateText = t.last_update ? formatTimeAgo(t.last_update) : "";
                const isStale = !isOnline || (t.last_update && (Date.now() - new Date(t.last_update).getTime()) > 86400000);
                const countryCode = extractCountryFromAddress(t.address);
                
                // Calculate time since last status change
                const sinceText = formatSince(t.lastParked);
                
                return (
                  <div key={t.id} className={`group/item flex items-start border-b border-border/10 transition-all ${
                    isSelected ? "bg-primary/5 border-l-2 border-l-amber-500" : "hover:bg-muted/20"
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        const newId = isSelected ? null : t.id;
                        setSelectedVehicleId(newId);
                        setInfoPanelVehicleId(newId);
                      }}
                      className="flex-1 text-left px-3 py-1.5 min-w-0"
                    >
                      {/* Row 1: Plate + speed + actions */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Trailer icon instead of ignition */}
                          <svg className="w-3 h-3 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="1" y="10" width="16" height="8" rx="1" />
                            <circle cx="5" cy="18" r="2" />
                            <circle cx="13" cy="18" r="2" />
                          </svg>
                          <span className="text-[12px] font-bold truncate">{t.trailer_plate}</span>
                          {/* Status badge */}
                          <span className={`text-[9px] font-semibold px-1 py-px rounded ${
                            status.label === "Moving" ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                          }`}>{status.label}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {t.speed > 2 && (
                            <span className="text-[10px] font-semibold text-green-400 tabular-nums">{Math.round(t.speed)} km/h</span>
                          )}
                          {/* Action icons on hover */}
                          {hasGps && (
                            <div className="flex items-center gap-px opacity-0 group-hover/item:opacity-100 transition-opacity">
                              <button
                                type="button"
                                className={`p-0.5 rounded transition-colors ${
                                  infoPanelVehicleId === t.id
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "text-muted-foreground hover:text-amber-400"
                                }`}
                                title="Trailer info"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedVehicleId(t.id);
                                  setInfoPanelVehicleId(infoPanelVehicleId === t.id ? null : t.id);
                                }}
                              >
                                <Info className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                className={`p-0.5 rounded transition-colors ${
                                  routeHistoryVehicleId === t.id
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "text-muted-foreground hover:text-amber-400"
                                }`}
                                title="Route history"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newId = routeHistoryVehicleId === t.id ? null : t.id;
                                  setRouteHistoryVehicleId(newId);
                                  if (newId) setInfoPanelVehicleId(null);
                                }}
                              >
                                <Route className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Row 2: Connection + duration + country */}
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        {/* Connection status */}
                        {isOnline ? (
                          <span className="text-green-400/80">Connected</span>
                        ) : (
                          <span className="text-red-400/70">{isStale ? lastUpdateText : "Offline"}</span>
                        )}
                        {/* Duration since status change */}
                        {sinceText && (
                          <>
                            <span className="text-border/60">{"/"}</span>
                            <span className={status.label === "Moving" ? "text-green-400/70" : "text-blue-400/70"}>
                              {status.label} {sinceText}
                            </span>
                          </>
                        )}
                        {/* Trailer type + Country flag */}
                        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                          {t.trailer_type && (
                            <span className="text-[8px] font-semibold px-1 py-px rounded truncate max-w-[60px] bg-amber-500/10 text-amber-400">
                              {t.trailer_type}
                            </span>
                          )}
                          {countryCode && <CountryFlag country={countryCode} className="w-4 h-3" />}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              };

              // Trailers section component
              const trailersSection = showTrailers && trailers.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 px-2.5 py-2 hover:bg-muted/30 transition-colors border-b border-border/20 bg-amber-500/5">
                    <button type="button" onClick={() => toggleGroup(-1)} className="flex items-center gap-2 flex-1 min-w-0">
                      <svg className="w-4 h-4 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="1" y="10" width="16" height="8" rx="1" />
                        <circle cx="5" cy="18" r="2" />
                        <circle cx="13" cy="18" r="2" />
                        <path d="M17 14h4l2 4h-6" />
                        <circle cx="21" cy="18" r="2" />
                      </svg>
                      {expandedGroups.has(-1) ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                      <span className="text-xs font-semibold truncate text-amber-200">Trailers</span>
                      <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">({trailers.length})</span>
                    </button>
                  </div>
                  {expandedGroups.has(-1) && trailers.map(renderTrailer)}
                </div>
              ) : null;

              // If no groups exist or all in one group, render flat
              if (groupedVehicles.length <= 1 && groups.length === 0) {
                return <>{filtered.map(renderVehicle)}{trailersSection}</>;
              }

              // Return vehicles grouped by Traccar groups + trailers section when enabled
              return (
                <>
                  {groupedVehicles.map(([gId, { group, vehicles: gVehicles }]) => {
                    const isExpanded = expandedGroups.has(gId);
                    const gColor = group?.attributes?.iconColor || "#6b7280";
                    const gName = group?.name || "Ungrouped";
                    const groupCheckState = getGroupCheckState(gId);
                    return (
                      <div key={gId}>
                        <div className="flex items-center gap-1.5 px-2.5 py-2 hover:bg-muted/30 transition-colors border-b border-border/20">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={groupCheckState === "all"}
                              className="h-4 w-4 rounded-[3px] border-muted-foreground/50 data-[state=checked]:border-primary"
                              onCheckedChange={() => toggleGroupCheck(gId)}
                              {...(groupCheckState === "some" ? { "data-state": "indeterminate" } : {})}
                            />
                          </div>
                          <button type="button" onClick={() => toggleGroup(gId)} className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="w-3 h-3 rounded flex-shrink-0 border border-border/30" style={{ backgroundColor: gColor }} />
                            {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            <span className="text-xs font-semibold truncate">{gName}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">({gVehicles.length})</span>
                          </button>
                        </div>
                        {isExpanded && gVehicles.map(renderVehicle)}
                      </div>
                    );
                  })}
                  {/* Trailers Section - only when toggle is enabled */}
                  {trailersSection}
                </>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-border/40 bg-muted/10">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{vehicles.length} vehicles{showTrailers && trailers.length > 0 ? ` · ${trailers.length} trailers` : ""}</span>
              <span className="flex items-center gap-1">
                {wsConnected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span>Live</span>
                  </>
                ) : (
                  <>
                    <Signal className="h-3 w-3 animate-pulse" />
                    <span>Connecting...</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Geofence popup panel -- positioned above the map geofence button (bottom-right) */}
      {geofencePanelOpen && (
        <div className="absolute bottom-[164px] right-[48px] z-[1102] flex flex-col bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl overflow-hidden"
          style={{ width: "280px", maxHeight: "calc(100vh - 200px)" }}
        >
          {geofenceDetailId !== null ? (() => {
            // Detail view: show vehicles inside this geofence
            const gf = geofences.find((g) => g.id === geofenceDetailId);
            if (!gf) return null;
            const vehiclesInside = getVehiclesInGeofence(vehicles, gf);
            const gfColor = gf.attributes?.color || "#3b82f6";
            return (
              <>
                {/* Detail header */}
                <div className="px-3 py-2.5 border-b border-border/30 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGeofenceDetailId(null)}
                    className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                  </button>
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: gfColor }} />
                  <span className="text-sm font-bold truncate">{gf.name}</span>
                  <button
                    type="button"
                    onClick={() => setGeofencePanelOpen(false)}
                    className="ml-auto p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Vehicle count */}
                <div className="px-3 py-2 border-b border-border/20 bg-muted/10">
                  <p className="text-[10px] text-muted-foreground/60 font-medium">
                    Vehicles in geofence: <span className="text-foreground font-bold">{vehiclesInside.length}</span>
                  </p>
                </div>

                {/* Vehicle list */}
                <div className="overflow-y-auto flex-1 min-h-0">
                  {vehiclesInside.length === 0 ? (
                    <div className="px-3 py-8 text-center">
                      <Truck className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
                      <p className="text-xs text-muted-foreground/50">No vehicles currently inside</p>
                    </div>
                  ) : (
                    vehiclesInside.map((v) => {
                      const vStatus = getStatusInfo(v);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVehicleId(v.id);
                            setInfoPanelVehicleId(v.id);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-muted/30 transition-colors border-b border-border/10 ${
                            selectedVehicleId === v.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              vStatus.label === "Moving" ? "bg-green-500" :
                              vStatus.label === "Idling" ? "bg-amber-500" : "bg-blue-500"
                            }`} />
                            <span className="text-xs font-bold">{v.vehicle_plate}</span>
                            <span className={`text-[9px] font-semibold ${vStatus.textColor}`}>{vStatus.label}</span>
                            {v.speed > 0 && (
                              <span className="text-[9px] font-mono tabular-nums ml-auto">{Math.round(v.speed)} km/h</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            );
          })() : (
            <>
              {/* List header */}
              <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold">Geofences</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums">{geofences.length} total</span>
                  <button
                    type="button"
                    onClick={() => setGeofencePanelOpen(false)}
                    className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Show on map toggle */}
              <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Show on map</span>
                <button
                  type="button"
                  onClick={() => setShowGeofences((p) => !p)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${
                    showGeofences ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    showGeofences ? "translate-x-4" : "translate-x-0"
                  }`} />
                </button>
              </div>

              {/* Search */}
              {geofences.length > 5 && (
                <div className="px-3 py-2 border-b border-border/20">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                    <Input
                      placeholder="Search geofences..."
                      value={geofenceSearch}
                      onChange={(e) => setGeofenceSearch(e.target.value)}
                      className="h-7 text-xs pl-7 bg-muted/20 border-border/30"
                    />
                  </div>
                </div>
              )}

              {/* Geofence list */}
              <div className="overflow-y-auto flex-1 min-h-0">
                {geofences.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <MapPin className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-xs text-muted-foreground/50">No geofences configured</p>
                    <p className="text-[10px] text-muted-foreground/30 mt-1">Create them in Configuration &gt; Geofences</p>
                  </div>
                ) : (
                  geofences
                    .filter((g) => !geofenceSearch || g.name.toLowerCase().includes(geofenceSearch.toLowerCase()))
                    .map((gf) => {
                      const gfColor = gf.attributes?.color || "#3b82f6";
                      const vehiclesInside = getVehiclesInGeofence(vehicles, gf);
                      return (
                        <div
                          key={gf.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors border-b border-border/10 group"
                        >
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: gfColor }} />
                          <span className="text-xs font-medium truncate flex-1">{gf.name}</span>
                          {vehiclesInside.length > 0 && (
                            <span className="text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {vehiclesInside.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setGeofenceDetailId(gf.id)}
                            className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/40 hover:text-primary opacity-0 group-hover:opacity-100"
                            title={`View vehicles in ${gf.name}`}
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom info panel -- starts after sidebar, clears zoom controls */}
      {/* Hide info panel when route history is open */}
      {infoPanelVehicleId && !routeHistoryVehicleId && (() => {
        // Check vehicles first, then trailers (converted to FleetVehicle format)
        const v = vehicles.find((vv) => vv.id === infoPanelVehicleId) || 
          (showTrailers ? trailersAsVehicles.find((vv) => vv.id === infoPanelVehicleId) : undefined);
        if (!v) return null;
        const isTrailer = v.asset_type === "trailer";
        const status = getStatusInfo(v);
        const gName = getGroupName(v);
        const gColor = getGroupColor(v);
        const leftOffset = sidebarOpen ? "left-[344px]" : "left-3";
        const parkedSince = formatSince(v.lastParked);
        const country = extractCountryFromAddress(v.address);
        const statusAccent = status.label === "Moving" ? "border-green-500/40" :
          status.label === "Idling" ? "border-amber-500/40" : "border-blue-500/30";

        const copyToClipboard = (text: string) => {
          navigator.clipboard.writeText(text).catch(() => {});
        };

        // Geofence names the vehicle is currently in (geometric check)
        const vehicleGeofenceNames = vehicleGeofenceMap.get(v.id) || [];

        return (
          <div className={`absolute bottom-3 ${leftOffset} right-[52px] z-[1002] animate-in slide-in-from-bottom-2 duration-150`}>
            <div className={`bg-card/95 backdrop-blur-md border-2 ${statusAccent} rounded-xl shadow-2xl overflow-hidden`}>
              {/* Header */}
              <div className="flex items-center justify-between px-3.5 py-2 bg-gradient-to-r from-card/80 to-card/40">
                <div className="flex items-center gap-3">
                  {/* Status dot with ring */}
                  <div className="relative">
                    <span className={`block w-2.5 h-2.5 rounded-full ${
                      status.label === "Moving" ? "bg-green-500" :
                      status.label === "Idling" ? "bg-amber-500" : "bg-blue-500"
                    }`} />
                    {(status.label === "Moving" || status.label === "Idling") && (
                      <span className={`absolute inset-0 rounded-full animate-ping ${
                        status.label === "Moving" ? "bg-green-500/40" : "bg-amber-500/40"
                      }`} />
                    )}
                  </div>
                  <span className="text-sm font-bold tracking-tight">{v.vehicle_plate}</span>
                  {isTrailer && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">TRAILER</span>
                  )}
                  {v.vehicle_model && <span className="text-[10px] text-muted-foreground/50 font-medium">{v.vehicle_model}</span>}
                  {gName && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/30 bg-muted/20">
                      {gColor && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: gColor }} />}
                      <span className="text-[9px] font-semibold text-muted-foreground">{gName}</span>
                    </div>
                  )}
                  {/* Status label */}
                  <span className={`text-[11px] font-bold ${status.textColor}`}>
                    {status.label}
                  </span>
                  {v.speed > 0 && <span className="text-xs font-mono font-bold tabular-nums">{Math.round(v.speed)} km/h</span>}
                  {parkedSince && (
                    <span className="text-[10px] text-muted-foreground/60">since {parkedSince}</span>
                  )}
                  {vehicleGeofenceNames.length > 0 && (
                    <div className="flex items-center gap-1 ml-1">
                      {vehicleGeofenceNames.map((gf) => (
                        <span
                          key={gf.id}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md border"
                          style={{
                            borderColor: `${gf.attributes?.color || "#3b82f6"}50`,
                            backgroundColor: `${gf.attributes?.color || "#3b82f6"}15`,
                            color: gf.attributes?.color || "#3b82f6",
                          }}
                        >
                          <MapPin className="h-2 w-2 inline mr-0.5" />
                          {gf.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums">{formatTimeAgo(v.last_update)}</span>
                  <button
                    type="button"
                    onClick={() => { setInfoPanelVehicleId(null); setSelectedVehicleId(null); }}
                    className="p-1 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground/60 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Data cards */}
              <div className="overflow-x-auto">
                <div className="flex min-w-max">

                  {/* Status card */}
                  <div className="px-3.5 py-2.5 min-w-[130px] border-r border-border/10">
                    <p className="text-[8px] uppercase tracking-widest text-muted-foreground/40 font-bold mb-2">Status</p>
                    <div className="space-y-1.5 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <Zap className={`h-3 w-3 ${v.ignition ? "text-green-500" : "text-muted-foreground/20"}`} />
                        <span className={v.ignition ? "text-green-400 font-semibold" : "text-muted-foreground/60"}>
                          IGN {v.ignition ? "ON" : "OFF"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground/60">
                        <Satellite className="h-3 w-3" />
                        <span>{v.satellites ?? 0} SAT</span>
                      </div>
                      {v.power != null && (
                        <div className="flex items-center gap-1.5 text-muted-foreground/60">
                          <Power className="h-3 w-3" />
                          <span>{v.power.toFixed(1)}V</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Location card */}
                  <div className="px-3.5 py-2.5 min-w-[200px] max-w-[260px] border-r border-border/10">
                    <p className="text-[8px] uppercase tracking-widest text-muted-foreground/40 font-bold mb-2 flex items-center gap-1.5">
                      Location
                      {country && <CountryFlag country={country} className="w-4 h-3" />}
                    </p>
                    <div className="space-y-1.5">
                      {v.address ? (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(v.address!)}
                          className="group/addr flex items-start gap-1 text-[10px] text-left hover:text-primary transition-colors w-full"
                          title="Click to copy address"
                        >
                          <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary/50 group-hover/addr:text-primary" />
                          <span className="leading-snug line-clamp-2">{v.address}</span>
                          <Copy className="h-2.5 w-2.5 mt-0.5 flex-shrink-0 opacity-0 group-hover/addr:opacity-60 transition-opacity" />
                        </button>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/30">No address</p>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}`)}
                        className="group/coord flex items-center gap-1.5 text-[9px] text-muted-foreground/50 font-mono hover:text-primary transition-colors"
                        title="Click to copy coordinates"
                      >
                        <span>{v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}</span>
                        <Compass className="h-2.5 w-2.5" />
                        <span>{v.course.toFixed(0)}deg</span>
                        <Copy className="h-2 w-2 flex-shrink-0 opacity-0 group-hover/coord:opacity-60 transition-opacity" />
                      </button>
                    </div>
                  </div>

                  {/* Vehicle card */}
                  <div className="px-3.5 py-2.5 min-w-[140px] border-r border-border/10">
                    <p className="text-[8px] uppercase tracking-widest text-muted-foreground/40 font-bold mb-2">Vehicle</p>
                    <div className="space-y-1.5 text-[10px]">
                      {v.totalDistance != null && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground/60">ODO</span>
                          <span className="font-bold tabular-nums">{v.totalDistance.toLocaleString()} km</span>
                        </div>
                      )}
                      {v.engineHours != null && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground/60">Engine</span>
                          <span className="font-bold tabular-nums">{v.engineHours.toLocaleString()}h</span>
                        </div>
                      )}
                      {v.driver_name && v.driver_name !== "Not assigned" && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground/60">Driver</span>
                          <span className="font-medium truncate max-w-[70px]">{v.driver_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fuel card */}
                  {v.fuel != null && (
                    <div className="px-3.5 py-2.5 min-w-[100px] border-r border-border/10">
                      <p className="text-[8px] uppercase tracking-widest text-muted-foreground/40 font-bold mb-2">Fuel</p>
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8">
                          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                              strokeDasharray={`${Math.min(v.fuel, 100) * 0.942} 100`}
                              strokeLinecap="round"
                              className={v.fuel > 50 ? "text-green-500" : v.fuel > 20 ? "text-amber-500" : "text-red-500"}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums">
                            {v.fuel}
                          </span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/40">%</span>
                      </div>
                    </div>
                  )}

                  {/* Daily Activity card */}
                  <div className="px-3.5 py-2.5 min-w-[170px]">
                    <p className="text-[8px] uppercase tracking-widest text-muted-foreground/40 font-bold mb-2 flex items-center gap-1">
                      <Activity className="h-2.5 w-2.5" /> Today
                    </p>
                    {dailySummaryLoading ? (
                      <div className="space-y-2">
                        <div className="h-2 w-20 bg-muted/20 rounded animate-pulse" />
                        <div className="h-2 w-16 bg-muted/20 rounded animate-pulse" />
                        <div className="h-2 w-24 bg-muted/20 rounded animate-pulse" />
                      </div>
                    ) : dailySummary ? (
                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground/60">Distance</span>
                          <span className="font-bold tabular-nums">{dailySummary.distance.toLocaleString()} km</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground/60">Engine</span>
                          <span className="font-bold tabular-nums">{formatEngineMinutes(dailySummary.engineHours)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground/60">Avg / Max</span>
                          <span className="font-bold tabular-nums">{dailySummary.averageSpeed} / {dailySummary.maxSpeed} km/h</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/30">No data</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
