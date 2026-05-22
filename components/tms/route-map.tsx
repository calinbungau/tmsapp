"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { applyTileLayer, type TileKey } from "@/lib/tms/map-tiles";

import { MapPin, Navigation, Clock, Route as RouteIcon, Loader2, Package, Fuel, AlertTriangle, Ban, ChevronDown, ChevronUp, Target, Crosshair, Truck, Building2, ArrowLeftRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type {
  TripSegment, FleetMapData, CapacityInfo, RouteOptions, LegRouteInfo,
  ExistingStop, GeofenceData,
} from "@/components/tms/fleet-assignment";
import { TRIP_COLORS, defaultRouteOptions } from "@/components/tms/fleet-assignment";

interface Stop {
  id: string;
  stop_type: string;
  company_name: string;
  address: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  planned_date: string;
  planned_time_from: string;
}

// Leg data for visualizing execution with different styles
export interface TripLegData {
  id: string;
  leg_number: number;
  assignment_type: "own_fleet" | "forwarding";
  from_stop_index: number;
  to_stop_index: number;
  driver_name?: string;
  vehicle_plate?: string;
  trailer_plate?: string;
  carrier_name?: string;
}

// ─── Country Flag Helper ──────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  // English
  belgium: "be", germany: "de", france: "fr", netherlands: "nl", austria: "at",
  hungary: "hu", romania: "ro", poland: "pl", "czech republic": "cz", czechia: "cz",
  slovakia: "sk", slovenia: "si", croatia: "hr", serbia: "rs", bulgaria: "bg",
  italy: "it", spain: "es", portugal: "pt", greece: "gr", turkey: "tr",
  "united kingdom": "gb", uk: "gb", ireland: "ie", denmark: "dk", sweden: "se",
  norway: "no", finland: "fi", switzerland: "ch", luxembourg: "lu", ukraine: "ua",
  moldova: "md", belarus: "by", russia: "ru", lithuania: "lt", latvia: "lv",
  estonia: "ee", albania: "al", "north macedonia": "mk", montenegro: "me",
  "bosnia and herzegovina": "ba", kosovo: "xk", cyprus: "cy", malta: "mt",
  // German
  belgien: "be", deutschland: "de", frankreich: "fr", niederlande: "nl", österreich: "at",
  ungarn: "hu", rumänien: "ro", tschechien: "cz", slowakei: "sk", slowenien: "si",
  kroatien: "hr", serbien: "rs", bulgarien: "bg", italien: "it", spanien: "es",
  griechenland: "gr", türkei: "tr", großbritannien: "gb", irland: "ie", dänemark: "dk",
  schweden: "se", norwegen: "no", finnland: "fi", schweiz: "ch", luxemburg: "lu",
  weißrussland: "by", russland: "ru", litauen: "lt", lettland: "lv", estland: "ee",
  albanien: "al", nordmazedonien: "mk", zypern: "cy",
  // French
  belgique: "be", allemagne: "de", "pays-bas": "nl", autriche: "at", hongrie: "hu",
  roumanie: "ro", pologne: "pl", tchéquie: "cz", slovaquie: "sk", slovénie: "si",
  croatie: "hr", serbie: "rs", bulgarie: "bg", italie: "it", espagne: "es",
  "royaume-uni": "gb", irlande: "ie", danemark: "dk", suède: "se", norvège: "no",
  finlande: "fi", suisse: "ch", biélorussie: "by", russie: "ru", lituanie: "lt",
  lettonie: "lv", estonie: "ee", albanie: "al", macédoine: "mk", chypre: "cy", malte: "mt",
  // Romanian
  belgia: "be", germania: "de", franța: "fr", franta: "fr", olanda: "nl", austria: "at",
  ungaria: "hu", polonia: "pl", cehia: "cz", slovacia: "sk", serbia: "rs",
  italia: "it", spania: "es", portugalia: "pt", grecia: "gr", turcia: "tr",
  "marea britanie": "gb", regatul: "gb", danemarca: "dk", suedia: "se",
  norvegia: "no", finlanda: "fi", elveția: "ch", elvetia: "ch", ucraina: "ua",
  "republica moldova": "md", bielorusia: "by", lituania: "lt", letonia: "lv",
  cipru: "cy",
};

function getCountryCode(country: string): string {
  if (!country) return "";
  const trimmed = country.trim();
  if (trimmed.length === 2 && /^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toLowerCase();
  return COUNTRY_CODES[trimmed.toLowerCase()] || "";
}

function getCountryFlagUrl(country: string): string {
  const code = getCountryCode(country);
  if (!code) return "";
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}

interface RouteInfo {
  distance_km: number;
  duration_hours: number;
  duration_minutes: number;
  geometry: [number, number][];
  legs: { distance_km: number; duration_min: number; geometry?: [number, number][] }[];
}

interface RouteMapProps {
  stops: Stop[];
  trips?: TripSegment[];
  waypoints?: [number, number][];
  onWaypointsChange?: (waypoints: [number, number][]) => void;
  onRouteCalculated?: (info: RouteInfo) => void;
  onStopsGeocoded?: (geocodedStops: Stop[]) => void;
  onStopsReordered?: (stops: Stop[]) => void;
  fullHeight?: boolean;
  hideBottomPanels?: boolean;
  fleetMapData?: FleetMapData | null;
  palletCount?: number;
  weightKg?: number;
  onRouteOptionsChange?: (opts: Partial<RouteOptions>) => void;
  onGeofenceChange?: (gf: GeofenceData[]) => void;
  /** Pre-existing route geometry to display instead of fetching from OSRM.
   *  When provided + no waypoints, the saved route is drawn directly.
   *  Once the user drags/adds waypoints, OSRM recalculates as normal. */
  initialRouteGeometry?: [number, number][] | null;
  /** Per-leg geometries matching stop pairs (stop[0]->stop[1], stop[1]->stop[2], etc.) */
  initialLegGeometries?: ([number, number][] | null)[];
  /** Pre-existing route distance/duration so we don't need to recalculate */
  initialRouteDistance?: number;
  initialRouteDuration?: number;
  /** Trip legs for execution view - shows different line styles for own fleet vs subcontract */
  tripLegs?: TripLegData[];
  /** Show country flags on stop markers */
  showFlags?: boolean;
  /** When set, only show the specific leg (0-indexed). When undefined/null, show all legs. */
  selectedLegIndex?: number | null;
  /**
   * GPS track overlay to show actual route vs planned (from vehicle/trailer/driver tracking).
   *
   * Mirrors the Dispatcher's Route History visual language:
   *  - each `trip` segment is rendered with its rotating-palette `color`
   *  - empty trip legs (no cargo on board, "km pe gol") use a dashed pattern
   *  - `stop` segments drop a "P" pin at their location
   *  - direction arrows are placed along the polyline based on heading
   *  - a hovered/selected segment receives a stronger glow + thicker line
   *
   * `positions` (legacy single-line payload) is still supported for callers
   * that don't yet provide `segments`.
   */
  gpsTrackOverlay?: {
    positions: { lat: number; lng: number; timestamp?: string }[];
    source?: string;
    hoveredSegmentIdx?: number | null;
    selectedSegmentIdx?: number | null;
    segments?: Array<{
      type: "trip" | "stop";
      color: string;
      loaded: boolean;
      from: string;
      to: string;
      distance_km: number;
      avg_speed_kmh: number;
      max_speed_kmh: number;
      start_lat: number;
      start_lng: number;
      end_lat: number;
      end_lng: number;
      positions: {
        lat: number;
        lng: number;
        timestamp?: string;
        speed?: number | null;
        heading?: number | null;
      }[];
    }>;
  } | null;
  /** Routing strategy: fastest (default), avoid_tolls, or shortest. Sent to Valhalla via costing_options. */
  routeStrategy?: "fastest" | "avoid_tolls" | "shortest";
  /** Trip expenses with GPS coords (fuel/toll/parking/etc.) rendered as small category-colored pins on the map. */
  expenseMarkers?: Array<{
    id: string;
    category: string;
    amount: number;
    currency: string;
    vendor: string | null;
    occurred_at: string;
    latitude: number;
    longitude: number;
    location_label?: string | null;
  }>;
  /** Active base-tile key. When changed, the map swaps tile layers in place. */
  activeTile?: TileKey;
  /**
   * Skip automatic route fetching from OSRM. When true and `initialRouteGeometry`
   * is provided, the map displays the saved route without ever calling Valhalla.
   * Useful for read-only displays (driver app, trip preview) where we don't want
   * to recalculate or modify the route.
   */
  skipInitialRouteFetch?: boolean;
  /**
   * Live overlay: real-time positions of the trip's vehicle, trailer and driver.
   * Each entry is optional — omit to hide the corresponding pin.
   */
  liveResources?: {
    vehicle?: { plate: string; lat: number; lng: number; speed?: number; course?: number; updatedAt?: string | null } | null;
    trailer?: { plate: string; lat: number; lng: number; speed?: number; course?: number; updatedAt?: string | null } | null;
    driver?: { name: string; lat: number; lng: number; updatedAt?: string | null } | null;
  };
}

const STOP_COLORS: Record<string, { bg: string; border: string }> = {
  pickup: { bg: "#f59e0b", border: "#d97706" },
  delivery: { bg: "#22c55e", border: "#16a34a" },
  customs: { bg: "#8b5cf6", border: "#7c3aed" },
  transit: { bg: "#6366f1", border: "#4f46e5" },
  swap: { bg: "#f97316", border: "#ea580c" },
};

const FORWARDING_COLOR = "#f59e0b";

function createStopIcon(type: string, index: number, isSwapPoint = false) {
  const colors = STOP_COLORS[type] || { bg: "#6366f1", border: "#4f46e5" };
  const sz = isSwapPoint ? 36 : 32;
  const borderColor = isSwapPoint ? "#f59e0b" : "white";
  return L.divIcon({
    className: "",
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
    popupAnchor: [0, -sz / 2 - 4],
    html: `<div style="
      background:${isSwapPoint ? "#1e293b" : colors.bg};
      color:#fff;width:${sz}px;height:${sz}px;
      border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:${isSwapPoint ? "11" : "13"}px;font-family:system-ui;
      border:3px solid ${borderColor};
      box-shadow:0 2px 12px rgba(0,0,0,0.25);
    ">${isSwapPoint ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>' : (index + 1)}</div>`,
  });
}

function createExistingStopIcon() {
  return L.divIcon({
    className: "", iconSize: [20, 20], iconAnchor: [10, 10],
    html: `<div style="width:20px;height:20px;border-radius:50%;background:rgba(245,158,11,0.3);border:2px solid #f59e0b;display:flex;align-items:center;justify-content:center">
      <div style="width:8px;height:8px;border-radius:50%;background:#f59e0b"></div>
    </div>`,
  });
}

function createWaypointIcon() {
  return L.divIcon({
    className: "", iconSize: [16, 16], iconAnchor: [8, 8],
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:grab"></div>`,
  });
}

function createGripIcon() {
  return L.divIcon({
    className: "", iconSize: [12, 12], iconAnchor: [6, 6],
    html: `<div style="width:12px;height:12px;border-radius:50%;background:rgba(59,130,246,0.35);border:2px solid rgba(59,130,246,0.6);cursor:grab;transition:all 0.15s" onmouseenter="this.style.background='rgba(59,130,246,0.7)';this.style.transform='scale(1.3)'" onmouseleave="this.style.background='rgba(59,130,246,0.35)';this.style.transform='scale(1)'"></div>`,
  });
}

// Sample N evenly-spaced points along a polyline
function samplePointsAlongRoute(coords: [number, number][], count: number): { point: [number, number]; index: number }[] {
  if (coords.length < 2 || count <= 0) return [];
  let totalDist = 0;
  const segDists: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const d = Math.sqrt(Math.pow(coords[i][0] - coords[i - 1][0], 2) + Math.pow(coords[i][1] - coords[i - 1][1], 2));
    segDists.push(d);
    totalDist += d;
  }
  if (totalDist === 0) return [];
  const spacing = totalDist / (count + 1);
  const result: { point: [number, number]; index: number }[] = [];
  for (let n = 1; n <= count; n++) {
    const targetDist = spacing * n;
    let accum = 0;
    for (let i = 0; i < segDists.length; i++) {
      if (accum + segDists[i] >= targetDist) {
        const frac = (targetDist - accum) / segDists[i];
        const lat = coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]);
        const lng = coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]);
        result.push({ point: [lat, lng], index: i });
        break;
      }
      accum += segDists[i];
    }
  }
  return result;
}

async function geocodeAddress(address: string, city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  const query = [address, city, country].filter(Boolean).join(", ");
  if (!query.trim()) return null;
  try {
    const res = await fetch(
      `https://rvs.bngtracking.ro/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data?.[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    if (city) {
      const res2 = await fetch(
        `https://rvs.bngtracking.ro/search?format=json&q=${encodeURIComponent([city, country].filter(Boolean).join(", "))}&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data2 = await res2.json();
      if (data2?.[0]) {
        return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function RouteMap({
  stops, trips: tripsProp, waypoints: waypointsProp = [], onWaypointsChange,
  onRouteCalculated, onStopsGeocoded, onStopsReordered,
  fullHeight = false, hideBottomPanels = false, fleetMapData, palletCount = 0, weightKg = 0,
  onRouteOptionsChange, onGeofenceChange,
  initialRouteGeometry, initialLegGeometries, initialRouteDistance, initialRouteDuration,
  tripLegs, showFlags = false, selectedLegIndex, gpsTrackOverlay, routeStrategy = "fastest",
  expenseMarkers,
  activeTile = "dark",
  liveResources,
  skipInitialRouteFetch = false,
}: RouteMapProps) {

  /** Build Valhalla truck costing_options based on the active route strategy. */
  function strategyToTruckOpts() {
    const base: Record<string, unknown> = { height: 4.0, width: 2.55, length: 16.5, weight: 40.0, axle_load: 8.0 };
    if (routeStrategy === "avoid_tolls") {
      base.use_tolls = 0.0;
      base.use_highways = 0.3;
    } else if (routeStrategy === "shortest") {
      base.shortest = true;
      base.use_tolls = 0.5;
    } else {
      base.use_tolls = 0.5;
      base.use_highways = 1.0;
    }
    return base;
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const prevKeyRef = useRef<string>("");
  const prevRouteKeyRef = useRef<string>("");
  const quotaExceededRef = useRef(false);
  const usedInitialRouteRef = useRef(false);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const waypointMarkersRef = useRef<L.Marker[]>([]);
  const gripMarkersRef = useRef<L.CircleMarker[]>([]);
  const gpsTrackLayerRef = useRef<L.Layer | null>(null);
  const expenseLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const liveLayerRef = useRef<L.LayerGroup | null>(null);
  const [showRouteOptions, setShowRouteOptions] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [showStops, setShowStops] = useState(false);

  const trips = fleetMapData?.trips || [];
  const hasMultipleTrips = trips.length > 1;
  const existingStops = fleetMapData?.existingStops || [];
  const capacityInfo = fleetMapData?.capacityInfo || null;
  const geofences = fleetMapData?.geofences || [];
  const routeOptions = fleetMapData?.routeOptions || defaultRouteOptions;

  // Determine swap point stop indices (stops that border two trips)
  const swapPointIndices = new Set<number>();
  if (hasMultipleTrips) {
    for (let i = 1; i < trips.length; i++) {
      swapPointIndices.add(trips[i].from_stop_index);
    }
  }

  // Auto-geocode stops
  useEffect(() => {
    const stopsNeedingGeocode = stops.filter(
      s => (!s.lat || !s.lng || s.lat === 0 || s.lng === 0) && (s.address || s.city || s.country)
    );
    if (stopsNeedingGeocode.length === 0) return;

    let cancelled = false;
    setGeocoding(true);

    (async () => {
      const updated = [...stops];
      for (let i = 0; i < updated.length; i++) {
        if (cancelled) break;
        const s = updated[i];
        if ((!s.lat || !s.lng || s.lat === 0 || s.lng === 0) && (s.address || s.city || s.country)) {
          const coords = await geocodeAddress(s.address, s.city, s.country);
          if (coords) {
            updated[i] = { ...updated[i], lat: coords.lat, lng: coords.lng };
          }
          await new Promise(r => setTimeout(r, 1100));
        }
      }
      if (!cancelled) {
        setGeocoding(false);
        const anyUpdated = updated.some((s, i) => s.lat !== stops[i].lat || s.lng !== stops[i].lng);
        if (anyUpdated) {
          onStopsGeocoded?.(updated);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [stops.map(s => `${s.address}|${s.city}|${s.country}`).join(";;")]);

  const validStops = stops
    .map((s, i) => ({ ...s, originalIndex: i }))
    .filter(s => s.lat && s.lng && s.lat !== 0 && s.lng !== 0);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapInstance.current) return;

    const map = L.map(containerRef.current, {
      center: [48.8566, 2.3522],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    tileLayerRef.current = applyTileLayer(map, activeTile);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstance.current = map;
    // Layer group dedicated to the live vehicle/trailer/driver overlay so
    // we can clear it cleanly between renders without disturbing routes.
    liveLayerRef.current = L.layerGroup().addTo(map);

    // Track the timer so cleanup can cancel it BEFORE map.remove() fires.
    // Otherwise invalidateSize() runs on a torn-down map and reads
    // _leaflet_pos on an undefined DOM element, throwing on route changes.
    let removed = false;
    const invalidateHandle = setTimeout(() => {
      if (removed) return;
      try { map.invalidateSize(); } catch {}
    }, 200);

    return () => {
      removed = true;
      clearTimeout(invalidateHandle);
      try { map.remove(); } catch {}
      mapInstance.current = null;
      tileLayerRef.current = null;
      liveLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap base tiles when `activeTile` changes (without rebuilding the map)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    tileLayerRef.current = applyTileLayer(map, activeTile, tileLayerRef.current);
  }, [activeTile]);

  // Live vehicle / trailer / driver overlay
  useEffect(() => {
    const map = mapInstance.current;
    const group = liveLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (!liveResources) return;

    const { vehicle, trailer, driver } = liveResources;

    // Vehicle pin (green if moving, blue if parked) — same visual language
    // as the dispatch board so dispatchers feel at home.
    if (vehicle && Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng)) {
      const moving = (vehicle.speed ?? 0) > 2;
      const color = moving ? "#22c55e" : "#3b82f6";
      const html = moving
        ? `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${vehicle.plate}</div>
            <svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${vehicle.course || 0}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))">
              <path d="M12 1 L20 21 L12 16 L4 21 Z" fill="${color}"/>
            </svg>
          </div>`
        : `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${vehicle.plate}</div>
            <div style="width:20px;height:20px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.5)">
              <span style="color:white;font-weight:800;font-size:11px;line-height:1">P</span>
            </div>
          </div>`;
      L.marker([vehicle.lat, vehicle.lng], {
        icon: L.divIcon({ className: "", iconSize: [60, 44], iconAnchor: [30, 44], html }),
        zIndexOffset: 1100,
      }).bindTooltip(
        `<strong>${vehicle.plate}</strong><br/>${moving ? `${Math.round(vehicle.speed || 0)} km/h` : "Parked"}`,
        { direction: "top" },
      ).addTo(group);
    }

    if (trailer && Number.isFinite(trailer.lat) && Number.isFinite(trailer.lng)) {
      const color = "#f59e0b";
      const moving = (trailer.speed ?? 0) > 2;
      const html = `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">T ${trailer.plate}</div>
        ${moving
          ? `<svg width="22" height="22" viewBox="0 0 24 24" style="transform:rotate(${trailer.course || 0}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))"><path d="M12 1 L20 21 L12 16 L4 21 Z" fill="${color}"/></svg>`
          : `<div style="width:18px;height:18px;border-radius:4px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.5)"><span style="color:white;font-weight:800;font-size:10px;line-height:1">T</span></div>`}
      </div>`;
      L.marker([trailer.lat, trailer.lng], {
        icon: L.divIcon({ className: "", iconSize: [60, 42], iconAnchor: [30, 42], html }),
        zIndexOffset: 1080,
      }).bindTooltip(`<strong>Trailer ${trailer.plate}</strong>`, { direction: "top" }).addTo(group);
    }

    if (driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng)) {
      const html = `<div style="width:28px;height:28px;border-radius:50%;background:#8b5cf6;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>`;
      L.marker([driver.lat, driver.lng], {
        icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], html }),
        zIndexOffset: 1060,
      }).bindTooltip(`<strong>${driver.name}</strong><br/>Driver app`, { direction: "top" }).addTo(group);
    }
  }, [liveResources]);

  // ResizeObserver
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const observer = new ResizeObserver(() => {
      // Map may be in the process of being removed when the observer fires
      try { map.invalidateSize(); } catch {}
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Build keys for reactivity
  const stopsKey = validStops.map(s => `${s.lat.toFixed(4)},${s.lng.toFixed(4)},${s.stop_type}`).join("|");
  const tripsKey = trips.map(t => `${t.trip_number}-${t.from_stop_index}-${t.to_stop_index}-${t.assignment_type}-${t.vehicle_id}-${t.driver_id}-${t.trailer_id}`).join("|");
  const existingKey = existingStops.map(s => `${s.lat},${s.lng}`).join("|");
  const geofenceKey = geofences.map(g => `${g.stop_index}:${g.radius_m}`).join("|");
  const waypointKey = (waypointsProp || []).map(w => `${w[0].toFixed(4)},${w[1].toFixed(4)}`).join("|");
  const selectedLegKey = selectedLegIndex != null ? `leg:${selectedLegIndex}` : "leg:all";
  // Route key: only recalculate route when stop positions change, or multi-trip structure changes, or selected leg changes
  const routeKey = hasMultipleTrips
    ? `${stopsKey}|${trips.map(t => `${t.trip_number}-${t.from_stop_index}-${t.to_stop_index}`).join("|")}|multi|${stops.length}|wp:${waypointKey}|${selectedLegKey}|s:${routeStrategy}`
    : `${stopsKey}|single|${stops.length}|wp:${waypointKey}|${selectedLegKey}|s:${routeStrategy}`;
  // Overlay key: update markers/geofences/existing stops/waypoints when any visual data changes
  const combinedKey = `${stopsKey}|${tripsKey}|${existingKey}|${geofenceKey}|${hasMultipleTrips}|${stops.length}|wp:${waypointKey}|${selectedLegKey}`;

  // Update markers & route
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (combinedKey === prevKeyRef.current) return;
    prevKeyRef.current = combinedKey;
    let cancelled = false;

    const needsRouteRefetch = routeKey !== prevRouteKeyRef.current;
    // Clear non-route layers (markers, labels, geofences)
    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch { /* */ } });
    layersRef.current = [];

    // Only clear route layers if route key changed
    if (needsRouteRefetch) {
      routeLayersRef.current.forEach(l => { try { map.removeLayer(l); } catch { /* */ } });
      routeLayersRef.current = [];
      gripMarkersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* */ } });
      gripMarkersRef.current = [];
      waypointMarkersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* */ } });
      waypointMarkersRef.current = [];
      prevRouteKeyRef.current = routeKey;
      // Reset initial route flag so we recalculate if stops changed (e.g. after merge)
      usedInitialRouteRef.current = false;
    }

    if (validStops.length === 0 && existingStops.length === 0) {
      setRouteInfo(null);
      return;
    }

    // Draw existing stops from other orders
    for (const es of existingStops) {
      if (es.lat && es.lng) {
        const marker = L.marker([es.lat, es.lng], { icon: createExistingStopIcon(), zIndexOffset: 500 }).addTo(map);
        marker.bindPopup(`<div style="font-size:11px;font-family:system-ui;line-height:1.5">
          <div style="font-weight:700;margin-bottom:2px">${es.city}</div>
          <span style="color:#666">${es.address || ""}</span><br/>
          <span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:9999px;background:#f59e0b22;color:#d97706;font-size:10px;font-weight:600">${es.order_ref} - ${es.stop_type}</span>
          ${es.planned_date ? `<br/><span style="font-size:10px;color:#999;margin-top:2px;display:inline-block">${es.planned_date}</span>` : ""}
        </div>`);
        layersRef.current.push(marker);
      }
    }

    // Draw geofence circles
    for (const gf of geofences) {
      const stop = validStops[gf.stop_index];
      if (stop?.lat && stop?.lng) {
        const circle = L.circle([stop.lat, stop.lng], {
          radius: gf.radius_m,
          color: "#8b5cf6",
          fillColor: "#8b5cf6",
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: "5 5",
        }).addTo(map);
        layersRef.current.push(circle);

        const labelLat = stop.lat + (gf.radius_m / 111320) * 0.7;
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="
            background:white;color:#8b5cf6;font-size:10px;font-weight:700;
            padding:2px 6px;border-radius:10px;border:1.5px solid #8b5cf6;
            white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.15);
          ">${gf.radius_m}m</div>`,
          iconSize: [0, 0],
        });
        const labelMarker = L.marker([labelLat, stop.lng], { icon: labelIcon, interactive: false }).addTo(map);
        layersRef.current.push(labelMarker);
      }
    }

    // Add stop markers (filter by selectedLegIndex if tripLegs provided)
    const stopsToRender = (selectedLegIndex != null && tripLegs && tripLegs[selectedLegIndex])
      ? validStops.filter(s => {
          const leg = tripLegs[selectedLegIndex];
          return s.originalIndex >= leg.from_stop_index && s.originalIndex <= leg.to_stop_index;
        })
      : validStops;
    
    stopsToRender.forEach((stop) => {
      const stopNum = stop.originalIndex;
      const isSwap = swapPointIndices.has(stopNum);
      const icon = createStopIcon(stop.stop_type, stopNum, isSwap);
      const colors = STOP_COLORS[stop.stop_type] || { bg: "#6366f1", border: "#4f46e5" };
      
      // Find flag for popup
      const popupFlagUrl = stop.country ? getCountryFlagUrl(stop.country) : "";
      const flagImg = popupFlagUrl ? `<img src="${popupFlagUrl}" crossorigin="anonymous" style="width:16px;height:12px;border-radius:2px;object-fit:cover;vertical-align:middle;margin-right:4px;" />` : "";

      const marker = L.marker([stop.lat, stop.lng], { icon, zIndexOffset: isSwap ? 1100 : 1000 })
        .addTo(map)
        .bindPopup(`
          <div style="font-size:12px;min-width:180px;line-height:1.5;font-family:system-ui;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="display:inline-flex;width:20px;height:20px;border-radius:50%;background:${isSwap ? "#1e293b" : colors.bg};color:#fff;font-size:10px;font-weight:800;align-items:center;justify-content:center;">${stopNum + 1}</span>
              <strong>${stop.company_name || `Stop ${stopNum + 1}`}</strong>
              ${isSwap ? '<span style="display:inline-block;padding:1px 6px;border-radius:9999px;background:#fef3c7;color:#d97706;font-size:9px;font-weight:700">SWAP</span>' : ""}
            </div>
            <span style="color:#666;">${flagImg}${stop.address ? `${stop.address}, ` : ""}${stop.city || ""}${stop.country ? `, ${stop.country}` : ""}</span><br/>
            <span style="display:inline-block;margin-top:6px;padding:2px 10px;border-radius:9999px;color:white;font-size:10px;font-weight:600;background:${colors.bg}">${stop.stop_type}</span>
            ${stop.planned_date ? `<br/><span style="font-size:10px;color:#999;margin-top:4px;display:inline-block;">${stop.planned_date}${stop.planned_time_from ? ` ${stop.planned_time_from}` : ""}</span>` : ""}
          </div>
        `);
      layersRef.current.push(marker);

      // Label below marker with flag
      if (stop.city || stop.company_name) {
        const labelFlagImg = showFlags && popupFlagUrl ? `<img src="${popupFlagUrl}" crossorigin="anonymous" style="width:14px;height:10px;border-radius:2px;object-fit:cover;vertical-align:middle;margin-right:3px;" />` : "";
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="
            background:white;color:#374151;font-size:10px;font-weight:600;
            padding:2px 8px;border-radius:10px;border:1px solid ${isSwap ? "#f59e0b" : "#e5e7eb"};
            white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.08);
            text-align:center;font-family:system-ui;display:flex;align-items:center;gap:2px;
          ">${isSwap ? "&#x21C4; " : ""}${labelFlagImg}${stop.city || stop.company_name}</div>`,
          iconSize: [0, 0],
        });
        const labelLat = stop.lat - 0.15;
        const label = L.marker([labelLat, stop.lng], { icon: labelIcon, interactive: false, zIndexOffset: 500 }).addTo(map);
        layersRef.current.push(label);
      }
    });

    // Trip legs rendering (for execution view with own fleet vs subcontract differentiation)
    if (tripLegs && tripLegs.length > 0 && validStops.length >= 2 && needsRouteRefetch && !quotaExceededRef.current) {
      // Filter legs if selectedLegIndex is specified
      const legsToRender = selectedLegIndex != null && selectedLegIndex >= 0 && selectedLegIndex < tripLegs.length
        ? [tripLegs[selectedLegIndex]]
        : tripLegs;
      
      // When filtering by leg, only include stops within that leg's range
      const selectedLeg = selectedLegIndex != null ? tripLegs[selectedLegIndex] : null;
      const filteredValidStops = selectedLeg
        ? validStops.filter(s => s.originalIndex >= selectedLeg.from_stop_index && s.originalIndex <= selectedLeg.to_stop_index)
        : validStops;
      
      const allPts: [number, number][] = filteredValidStops.map(s => [s.lat, s.lng]);
      if (allPts.length > 1) map.fitBounds(L.latLngBounds(allPts).pad(0.1));
      else if (allPts.length === 1) map.setView(allPts[0], 10);

      setLoading(true);

      const fetchLegRoutes = async () => {
        let totalDistance = 0;
        let totalDuration = 0;
        const allRoutePoints: [number, number][] = [];

        for (let legIdx = 0; legIdx < legsToRender.length; legIdx++) {
          if (cancelled) return;
          const leg = legsToRender[legIdx];
          const fromIdx = leg.from_stop_index;
          const toIdx = leg.to_stop_index;

          const legStops: { lat: number; lng: number }[] = [];
          const start = Math.min(fromIdx, toIdx);
          const end = Math.max(fromIdx, toIdx);
          for (let si = start; si <= end; si++) {
            const s = stops[si];
            if (s?.lat && s?.lng && s.lat !== 0 && s.lng !== 0) {
              legStops.push({ lat: s.lat, lng: s.lng });
            }
          }

          if (legStops.length < 2) continue;

          const isSubcontract = leg.assignment_type === "forwarding";
          // Own fleet = blue, Subcontract = amber/orange
          const color = isSubcontract ? "#f59e0b" : "#3b82f6";

          try {
            const routeRes = await fetch("/api/tms/route", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                locations: legStops.map(s => ({ lat: s.lat, lon: s.lng, type: "break" })),
                costing: "truck",
                costing_options: { truck: strategyToTruckOpts() },
                units: "kilometers",
              }),
            });
            const data = await routeRes.json();
            
            let latlngs: [number, number][];
            let distKm = 0;
            let durMin = 0;

            if (!routeRes.ok || !data.latlngs) {
              if (data.quota_exceeded) quotaExceededRef.current = true;
              latlngs = legStops.map(s => [s.lat, s.lng]);
            } else {
              latlngs = data.latlngs;
              distKm = data.distance_km || 0;
              durMin = data.duration_minutes || 0;
            }

            totalDistance += distKm;
            totalDuration += durMin;
            allRoutePoints.push(...latlngs);

            // Shadow layer
            const shadow = L.polyline(latlngs, {
              color, weight: 10, opacity: 0.12,
              smoothFactor: 1, lineCap: "round", lineJoin: "round",
            }).addTo(map);
            routeLayersRef.current.push(shadow);

            // Main line - dashed for subcontract
            const main = L.polyline(latlngs, {
              color, weight: 4, opacity: 0.9,
              smoothFactor: 1, lineCap: "round", lineJoin: "round",
              dashArray: isSubcontract ? "12 6" : undefined,
            }).addTo(map);
            routeLayersRef.current.push(main);

            // Hover tooltip on route
            const tooltipContent = isSubcontract
              ? `<div style="font-size:11px;font-family:system-ui;line-height:1.4;">
                  <div style="font-weight:700;color:#f59e0b;margin-bottom:2px;">Leg ${leg.leg_number} - Subcontract</div>
                  ${leg.carrier_name ? `<div style="color:#666;">🏢 ${leg.carrier_name}</div>` : ""}
                  ${distKm > 0 ? `<div style="color:#999;font-size:10px;margin-top:2px;">${Math.round(distKm)} km</div>` : ""}
                </div>`
              : `<div style="font-size:11px;font-family:system-ui;line-height:1.4;">
                  <div style="font-weight:700;color:#3b82f6;margin-bottom:2px;">Leg ${leg.leg_number} - Own Fleet</div>
                  ${leg.driver_name ? `<div style="color:#666;">👤 ${leg.driver_name}</div>` : ""}
                  ${leg.vehicle_plate ? `<div style="color:#666;">🚛 ${leg.vehicle_plate}${leg.trailer_plate ? ` + ${leg.trailer_plate}` : ""}</div>` : ""}
                  ${distKm > 0 ? `<div style="color:#999;font-size:10px;margin-top:2px;">${Math.round(distKm)} km</div>` : ""}
                </div>`;
            
            main.bindTooltip(tooltipContent, { sticky: true, direction: "top", offset: [0, -10] });

            // Leg label at midpoint
            const mid = latlngs[Math.floor(latlngs.length / 2)];
            if (mid) {
              const labelIcon = L.divIcon({
                className: "",
                html: `<div style="
                  background:white;color:#374151;font-size:10px;font-weight:600;
                  padding:3px 10px;border-radius:12px;
                  border:2px solid ${color};
                  white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.12);
                  text-align:center;font-family:system-ui;line-height:1.4;
                ">
                  <span style="color:${color};font-weight:800">Leg ${leg.leg_number}</span>
                  ${isSubcontract ? '<span style="color:#9ca3af;margin-left:4px;">⬡</span>' : '<span style="color:#9ca3af;margin-left:4px;">●</span>'}
                  ${distKm > 0 ? `<span style="color:#9ca3af;margin-left:4px;">${Math.round(distKm)}km</span>` : ""}
                </div>`,
                iconSize: [0, 0],
              });
              const labelMarker = L.marker([mid[0] + 0.12, mid[1]], { icon: labelIcon, interactive: false, zIndexOffset: 600 }).addTo(map);
              routeLayersRef.current.push(labelMarker);
            }
          } catch {
            // Fallback to straight line. Skip if the map was destroyed in the
            // meantime or if we don't have enough points to draw a polyline.
            if (cancelled || !map) continue;
            const straightLine: [number, number][] = legStops
              .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
              .map(s => [s.lat, s.lng]);
            if (straightLine.length < 2) continue;
            try {
              const fallback = L.polyline(straightLine, {
                color, weight: 3, opacity: 0.5, dashArray: isSubcontract ? "12 6" : "8 8",
                smoothFactor: 1, lineCap: "round", lineJoin: "round",
              }).addTo(map);
              routeLayersRef.current.push(fallback);
              allRoutePoints.push(...straightLine);
            } catch {
              /* ignore - map may have been disposed */
            }
          }
        }

        if (allRoutePoints.length > 0) {
          const pts = [...allRoutePoints, ...validStops.map(s => [s.lat, s.lng] as [number, number])];
          map.fitBounds(L.latLngBounds(pts).pad(0.1));
        }

        const info: RouteInfo = {
          distance_km: Math.round(totalDistance * 10) / 10,
          duration_hours: Math.floor(totalDuration / 60),
          duration_minutes: totalDuration % 60,
          geometry: allRoutePoints,
          legs: tripLegs.map(() => ({ distance_km: 0, duration_min: 0 })),
        };
        setRouteInfo(info);
        onRouteCalculated?.(info);
        setLoading(false);
      };

      fetchLegRoutes();
      return () => { cancelled = true; };
    }

    // Multi-trip route calculation & drawing -- skip if quota exceeded
    if (hasMultipleTrips && trips.length > 0 && needsRouteRefetch && !quotaExceededRef.current) {
      const allPts: [number, number][] = validStops.map(s => [s.lat, s.lng]);
      existingStops.filter(s => s.lat && s.lng).forEach(s => allPts.push([s.lat!, s.lng!]));
      if (allPts.length > 1) map.fitBounds(L.latLngBounds(allPts).pad(0.1));
      else if (allPts.length === 1) map.setView(allPts[0], 10);

      setLoading(true);

      const fetchTripRoutes = async () => {
        let totalDistance = 0;
        let totalDuration = 0;
        const allRoutePoints: [number, number][] = [];

        for (let tripIdx = 0; tripIdx < trips.length; tripIdx++) {
          if (cancelled) return;
          const trip = trips[tripIdx];
          const fromIdx = trip.from_stop_index;
          const toIdx = trip.to_stop_index;

          const tripStops: { lat: number; lng: number }[] = [];
          const start = Math.min(fromIdx, toIdx);
          const end = Math.max(fromIdx, toIdx);
          for (let si = start; si <= end; si++) {
            const s = stops[si];
            if (s?.lat && s?.lng && s.lat !== 0 && s.lng !== 0) {
              tripStops.push({ lat: s.lat, lng: s.lng });
            }
          }

          if (tripStops.length < 2) continue;

          try {
            const routeRes = await fetch("/api/tms/route", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                locations: tripStops.map(s => ({ lat: s.lat, lon: s.lng, type: "break" })),
                costing: "truck",
                costing_options: { truck: strategyToTruckOpts() },
                units: "kilometers",
              }),
            });
            const data = await routeRes.json();
            if (!routeRes.ok || !data.latlngs) {
              if (data.quota_exceeded) quotaExceededRef.current = true;
              // Fallback: straight line for this trip segment
              const straightLine: [number, number][] = tripStops.map(s => [s.lat, s.lng]);
              const isForwarding = trip.assignment_type === "forwarding";
              const color = isForwarding ? FORWARDING_COLOR : TRIP_COLORS[tripIdx % TRIP_COLORS.length];
              const fallback = L.polyline(straightLine, {
                color, weight: 3, opacity: 0.5, dashArray: "8,8",
                smoothFactor: 1, lineCap: "round", lineJoin: "round",
              }).addTo(map);
              routeLayersRef.current.push(fallback);
              allRoutePoints.push(...straightLine);
              continue;
            }

            const latlngs: [number, number][] = data.latlngs;
            const distKm = data.distance_km;
            const durMin = data.duration_minutes;
            totalDistance += distKm;
            totalDuration += durMin;
            allRoutePoints.push(...latlngs);

            trip.route_info = {
              distance_km: distKm,
              duration_hours: Math.floor(durMin / 60),
              duration_minutes: durMin % 60,
              fuel_liters: 0, fuel_cost: 0, toll_countries: [],
              geometry: latlngs,
            };

            const isForwarding = trip.assignment_type === "forwarding";
            const color = isForwarding ? FORWARDING_COLOR : TRIP_COLORS[tripIdx % TRIP_COLORS.length];

            // Shadow
            const shadow = L.polyline(latlngs, {
              color, weight: 10, opacity: 0.12,
              smoothFactor: 1, lineCap: "round", lineJoin: "round",
            }).addTo(map);
            routeLayersRef.current.push(shadow);

            // Main line -- dashed for forwarding segments
            const main = L.polyline(latlngs, {
              color, weight: 4, opacity: 0.9,
              smoothFactor: 1, lineCap: "round", lineJoin: "round",
              dashArray: isForwarding ? "12 6" : undefined,
            }).addTo(map);
            routeLayersRef.current.push(main);

            // Trip label at midpoint
            const mid = latlngs[Math.floor(latlngs.length / 2)];
            if (mid) {
              const vehicle = trip.vehicle_id ? fleetMapData?.vehicles?.find(v => v.id === trip.vehicle_id) : null;
              const trailer = trip.trailer_id ? fleetMapData?.trailers?.find(t => t.id === trip.trailer_id) : null;
              const driver = trip.driver_id ? fleetMapData?.drivers?.find(d => d.id === trip.driver_id) : null;

              let combo = "";
              if (isForwarding) {
                combo = `<span style="color:${FORWARDING_COLOR};font-weight:700">Forwarding</span>`;
                if (trailer) combo += ` / ${trailer.plate_number}`;
              } else {
                const parts: string[] = [];
                if (vehicle) parts.push(vehicle.plate_number);
                if (trailer) parts.push(trailer.plate_number);
                if (driver) parts.push(driver.name.split(" ")[0]);
                combo = parts.join(" + ");
              }

              const labelIcon = L.divIcon({
                className: "",
                html: `<div style="
                  background:white;color:#374151;font-size:10px;font-weight:600;
                  padding:3px 10px;border-radius:12px;
                  border:2px solid ${color};
                  white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.12);
                  text-align:center;font-family:system-ui;line-height:1.4;
                ">
                  <span style="color:${color};font-weight:800">Trip ${trip.trip_number}</span>
                  <span style="color:#9ca3af">|</span> ${distKm}km
                  ${combo ? `<br/><span style="font-size:9px;color:#6b7280">${combo}</span>` : ""}
                </div>`,
                iconSize: [0, 0],
              });
              const labelMarker = L.marker([mid[0] + 0.15, mid[1]], { icon: labelIcon, interactive: false, zIndexOffset: 600 }).addTo(map);
              routeLayersRef.current.push(labelMarker);
            }
          } catch {
            /* OSRM error */
          }
        }

        if (allRoutePoints.length > 0) {
          const pts = [...allRoutePoints, ...validStops.map(s => [s.lat, s.lng] as [number, number])];
          existingStops.filter(s => s.lat && s.lng).forEach(s => pts.push([s.lat!, s.lng!]));
          map.fitBounds(L.latLngBounds(pts).pad(0.1));
        }

        const info: RouteInfo = {
          distance_km: Math.round(totalDistance * 10) / 10,
          duration_hours: Math.floor(totalDuration / 60),
          duration_minutes: totalDuration % 60,
          geometry: allRoutePoints,
          legs: trips.map(t => ({
            distance_km: t.route_info?.distance_km || 0,
            duration_min: (t.route_info?.duration_hours || 0) * 60 + (t.route_info?.duration_minutes || 0),
          })),
        };
        setRouteInfo(info);
        onRouteCalculated?.(info);
        setLoading(false);
      };

      fetchTripRoutes();
    }

    // Helper: clear grip/waypoint markers
    const clearWaypointLayers = () => {
      gripMarkersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* */ } });
      gripMarkersRef.current = [];
      waypointMarkersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* */ } });
      waypointMarkersRef.current = [];
    };

    // Helper: place grip markers along polyline + existing waypoint markers
    const placeWaypointMarkers = (latlngs: [number, number][], currentWaypoints: [number, number][]) => {
      clearWaypointLayers();
      if (!onWaypointsChange) return; // Only show grips if dragging is enabled

      // Place grip markers along the route (invisible grab handles)
      const gripCount = Math.min(Math.max(Math.floor(latlngs.length / 80), 4), 12);
      const grips = samplePointsAlongRoute(latlngs, gripCount);
      for (const grip of grips) {
        const gm = L.marker(grip.point, {
          icon: createGripIcon(),
          draggable: true,
          zIndexOffset: 800,
        }).addTo(map);
        gm.on("dragend", () => {
          const pos = gm.getLatLng();
          const newWp: [number, number] = [pos.lat, pos.lng];
          onWaypointsChange([...currentWaypoints, newWp]);
        });
        gripMarkersRef.current.push(gm as any);
      }

      // Place draggable markers for existing waypoints
      currentWaypoints.forEach((wp, wpIdx) => {
        const wm = L.marker(wp, {
          icon: createWaypointIcon(),
          draggable: true,
          zIndexOffset: 900,
        }).addTo(map);
        wm.bindTooltip("Drag to adjust, right-click to remove", { direction: "top", offset: [0, -10] });
        wm.on("dragend", () => {
          const pos = wm.getLatLng();
          const updated = [...currentWaypoints];
          updated[wpIdx] = [pos.lat, pos.lng];
          onWaypointsChange(updated);
        });
        wm.on("contextmenu", (e: L.LeafletEvent) => {
          L.DomEvent.preventDefault(e as any);
          const updated = currentWaypoints.filter((_, i) => i !== wpIdx);
          onWaypointsChange(updated);
        });
        waypointMarkersRef.current.push(wm);
      });
    };

    // Single-route fetching (single trip) -- skip if quota exceeded or tripLegs is provided
    if (!hasMultipleTrips && validStops.length >= 2 && needsRouteRefetch && !quotaExceededRef.current && !(tripLegs && tripLegs.length > 0)) {
      const bounds = L.latLngBounds(validStops.map(s => [s.lat, s.lng] as [number, number]));
      existingStops.filter(s => s.lat && s.lng).forEach(s => bounds.extend([s.lat!, s.lng!]));
      map.fitBounds(bounds, { padding: [60, 60] });

      const currentWaypoints = waypointsProp || [];

      // If we have saved route geometry and no waypoints yet, display it directly
      // Also verify geometry starts/ends near first/last stop (catches stale geometry after merge)
      const firstStop = validStops[0];
      const lastStop = validStops[validStops.length - 1];
      const geoStart = initialRouteGeometry?.[0];
      const geoEnd = initialRouteGeometry?.[initialRouteGeometry.length - 1];
      const distThreshold = 0.1; // ~10km tolerance
      const geoMatchesStops = geoStart && geoEnd && 
        Math.abs(geoStart[0] - firstStop.lat) < distThreshold && Math.abs(geoStart[1] - firstStop.lng) < distThreshold &&
        Math.abs(geoEnd[0] - lastStop.lat) < distThreshold && Math.abs(geoEnd[1] - lastStop.lng) < distThreshold;
      
      // When skipInitialRouteFetch is true, we display the provided geometry without
      // ever calling OSRM. This is useful for read-only displays (driver app).
      // When skipInitialRouteFetch is false, we still prefer initialRouteGeometry
      // if it matches the current stops, but will fall through to OSRM otherwise.
      const shouldUseInitialGeo = initialRouteGeometry && initialRouteGeometry.length > 2 && 
        currentWaypoints.length === 0 && !usedInitialRouteRef.current &&
        (skipInitialRouteFetch || geoMatchesStops);

      if (shouldUseInitialGeo) {
        usedInitialRouteRef.current = true;

        const latlngs = initialRouteGeometry;
        const shadow = L.polyline(latlngs, {
          color: "#1d4ed8", weight: 8, opacity: 0.12,
          smoothFactor: 1, lineCap: "round", lineJoin: "round",
        }).addTo(map);
        routeLayersRef.current.push(shadow);

        const main = L.polyline(latlngs, {
          color: "#3b82f6", weight: 4, opacity: 0.9,
          smoothFactor: 1, lineCap: "round", lineJoin: "round",
        }).addTo(map);
        routeLayersRef.current.push(main);

        // Build legs from initialLegGeometries or estimate from overall route
        const legs: { distance_km: number; duration_min: number; geometry?: [number, number][] }[] = [];
        if (initialLegGeometries && initialLegGeometries.length > 0) {
          for (let i = 0; i < initialLegGeometries.length; i++) {
            legs.push({ distance_km: 0, duration_min: 0, geometry: initialLegGeometries[i] || undefined });
          }
        }

        const totalKm = initialRouteDistance || 0;
        const totalMin = initialRouteDuration || 0;
        const info: RouteInfo = {
          distance_km: totalKm,
          duration_hours: Math.floor(totalMin / 60),
          duration_minutes: Math.round(totalMin % 60),
          geometry: latlngs,
          legs,
        };
        setRouteInfo(info);
        onRouteCalculated?.(info);

        placeWaypointMarkers(latlngs, currentWaypoints);
        map.fitBounds(main.getBounds(), { padding: [60, 60] });
        setLoading(false);

        return () => { cancelled = true; };
      }

      // When skipInitialRouteFetch is true, don't call OSRM at all.
      // The map will show stops connected by dashed lines (the default Leaflet behavior).
      if (skipInitialRouteFetch) {
        setLoading(false);
        return () => { cancelled = true; };
      }

      // Build locations: stops as "break" + waypoints as "via" (interleaved in order)
      const stopLocations = validStops.map(s => ({ lat: s.lat, lon: s.lng, type: "break" as const }));
      let locations: { lat: number; lon: number; type: "break" | "via" }[];

      if (currentWaypoints.length > 0 && stopLocations.length >= 2) {
        // Insert waypoints between the appropriate stop pair
        // For simplicity, all waypoints go between stop pairs based on nearest segment
        locations = [];
        for (let si = 0; si < stopLocations.length; si++) {
          locations.push(stopLocations[si]);
          if (si < stopLocations.length - 1) {
            // Find waypoints that belong between stop[si] and stop[si+1]
            // by checking if the waypoint is closer to this segment than others
            const segWps = currentWaypoints.filter((wp) => {
              let bestSeg = 0;
              let bestDist = Infinity;
              for (let j = 0; j < stopLocations.length - 1; j++) {
                const midLat = (stopLocations[j].lat + stopLocations[j + 1].lat) / 2;
                const midLon = (stopLocations[j].lon + stopLocations[j + 1].lon) / 2;
                const d = Math.sqrt(Math.pow(wp[0] - midLat, 2) + Math.pow(wp[1] - midLon, 2));
                if (d < bestDist) { bestDist = d; bestSeg = j; }
              }
              return bestSeg === si;
            });
            for (const wp of segWps) {
              locations.push({ lat: wp[0], lon: wp[1], type: "via" });
            }
          }
        }
      } else {
        locations = stopLocations;
      }

      setLoading(true);
      fetch("/api/tms/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations,
          costing: "truck",
          costing_options: { truck: strategyToTruckOpts() },
          units: "kilometers",
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (cancelled) return;
          if (!data.latlngs) {
            if (data.quota_exceeded) quotaExceededRef.current = true;
            const straightLine: [number, number][] = validStops.map(s => [s.lat, s.lng]);
            const fallbackLine = L.polyline(straightLine, {
              color: "#3b82f6", weight: 3, opacity: 0.5, dashArray: "8,8",
              smoothFactor: 1, lineCap: "round", lineJoin: "round",
            }).addTo(map);
            routeLayersRef.current.push(fallbackLine);
            let estDist = 0;
            for (let i = 0; i < straightLine.length - 1; i++) {
              const [lat1, lng1] = straightLine[i];
              const [lat2, lng2] = straightLine[i + 1];
              const R = 6371;
              const dLat = (lat2 - lat1) * Math.PI / 180;
              const dLon = (lng2 - lng1) * Math.PI / 180;
              const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
              estDist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            }
            const estInfo: RouteInfo = {
              distance_km: Math.round(estDist * 1.3 * 10) / 10,
              duration_hours: Math.floor((estDist * 1.3 / 70)),
              duration_minutes: Math.round(((estDist * 1.3 / 70) % 1) * 60),
              geometry: straightLine,
              legs: [],
            };
            setRouteInfo(estInfo);
            onRouteCalculated?.(estInfo);
            map.fitBounds(fallbackLine.getBounds(), { padding: [60, 60] });
            setLoading(false);
            return;
          }
          const latlngs: [number, number][] = data.latlngs;

          const shadow = L.polyline(latlngs, {
            color: "#1d4ed8", weight: 8, opacity: 0.12,
            smoothFactor: 1, lineCap: "round", lineJoin: "round",
          }).addTo(map);
          routeLayersRef.current.push(shadow);

          const main = L.polyline(latlngs, {
            color: "#3b82f6", weight: 4, opacity: 0.9,
            smoothFactor: 1, lineCap: "round", lineJoin: "round",
          }).addTo(map);
          routeLayersRef.current.push(main);

          // Place grip markers along the route for drag-to-add waypoints
          placeWaypointMarkers(latlngs, currentWaypoints);

          const totalKm = data.distance_km;
          const totalMin = data.duration_minutes;
          const routeLegs = data.legs?.map((leg: any) => ({
            distance_km: leg.distance_km,
            duration_min: leg.duration_min,
            geometry: leg.geometry || undefined,
          })) || [];

          const info: RouteInfo = {
            distance_km: totalKm,
            duration_hours: Math.floor(totalMin / 60),
            duration_minutes: totalMin % 60,
            geometry: latlngs,
            legs: routeLegs,
          };
          setRouteInfo(info);
          onRouteCalculated?.(info);
          map.fitBounds(main.getBounds(), { padding: [60, 60] });
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    } else if (!hasMultipleTrips && needsRouteRefetch) {
      if (validStops.length === 1) {
        map.setView([validStops[0].lat, validStops[0].lng], 10);
      }
      if (validStops.length < 2) {
        setRouteInfo(null);
      }
    }
    return () => { cancelled = true; };
  }, [combinedKey]);

  // Capacity bar rendering
  const renderCapacityOverlay = () => {
    if (!capacityInfo) return null;
    const newPallets = palletCount || 0;
    const totalPallets = capacityInfo.current_pallets + newPallets;
    const palletPct = capacityInfo.max_pallets > 0 ? Math.round((totalPallets / capacityInfo.max_pallets) * 100) : 0;
    const overPallets = totalPallets > capacityInfo.max_pallets;
    const freeSpace = Math.max(0, capacityInfo.max_pallets - totalPallets);

    return (
      <div className="px-4 py-2 border-t bg-card/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium">Trailer Load</span>
          <span className={`text-[11px] ml-auto font-semibold ${overPallets ? "text-destructive" : palletPct > 80 ? "text-amber-500" : "text-foreground"}`}>
            {totalPallets}/{capacityInfo.max_pallets} pallets ({palletPct}%)
          </span>
        </div>
        <div className="flex gap-[2px] flex-wrap mb-1">
          {Array.from({ length: capacityInfo.max_pallets }).map((_, i) => {
            let bg = "bg-muted";
            let title = "Empty";
            if (i < capacityInfo.current_pallets) {
              bg = "bg-amber-400";
              const order = capacityInfo.orders.find((_, oi) => {
                let count = 0;
                for (let j = 0; j <= oi; j++) count += capacityInfo.orders[j].pallets;
                return i < count;
              });
              title = order ? `${order.ref}: ${order.pallets}p` : "Other order";
            } else if (i < totalPallets) {
              bg = overPallets && i >= capacityInfo.max_pallets ? "bg-destructive" : "bg-primary";
              title = `This order`;
            }
            return (
              <div key={i} title={title} className={`w-3 h-3 rounded-sm ${bg} transition-colors`} />
            );
          })}
          {overPallets && Array.from({ length: totalPallets - capacityInfo.max_pallets }).map((_, i) => (
            <div key={`over-${i}`} title="Over capacity!" className="w-3 h-3 rounded-sm bg-destructive animate-pulse" />
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {capacityInfo.orders.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> Other: {capacityInfo.current_pallets}p
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-primary inline-block" /> This: {newPallets}p
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-muted inline-block" /> Free: {freeSpace}p
          </span>
        </div>
      </div>
    );
  };

  // Route options panel
  const renderRouteOptions = () => {
    if (!onRouteOptionsChange) return null;
    const totalDistanceKm = routeInfo?.distance_km || 0;
    const consumption = parseFloat(routeOptions.fuel_consumption_per_100km) || 25;
    const price = parseFloat(routeOptions.fuel_price_per_liter) || 1.45;
    const fuelLiters = (totalDistanceKm / 100) * consumption;
    const fuelCost = fuelLiters * price;

    return (
      <div className="border-t bg-card/90 backdrop-blur-sm shrink-0">
        <button type="button" onClick={() => setShowRouteOptions(!showRouteOptions)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 text-[11px]">
            <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Route Options</span>
            {totalDistanceKm > 0 && (
              <span className="text-muted-foreground">
                {fuelLiters.toFixed(0)}L / {"\u20AC"}{fuelCost.toFixed(2)}
              </span>
            )}
          </div>
          {showRouteOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showRouteOptions && (
          <div className="px-4 pb-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Ban className="h-3 w-3 text-muted-foreground" /><Label className="text-[11px]">Avoid tolls</Label></div>
              <Switch checked={routeOptions.avoid_tolls} onCheckedChange={(v) => onRouteOptionsChange({ avoid_tolls: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Ban className="h-3 w-3 text-muted-foreground" /><Label className="text-[11px]">Avoid ferries</Label></div>
              <Switch checked={routeOptions.avoid_ferries} onCheckedChange={(v) => onRouteOptionsChange({ avoid_ferries: v })} />
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Fuel type</Label>
                <Select value={routeOptions.fuel_type} onValueChange={(v: any) => onRouteOptionsChange({ fuel_type: v })}>
                  <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["diesel", "petrol", "lng", "cng", "electric"] as const).map(f => (
                      <SelectItem key={f} value={f} className="capitalize text-xs">{f.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">L/100km</Label>
                <Input className="h-7 text-[11px]" type="number" step="0.1" value={routeOptions.fuel_consumption_per_100km} onChange={e => onRouteOptionsChange({ fuel_consumption_per_100km: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Price/L</Label>
                <Input className="h-7 text-[11px]" type="number" step="0.01" value={routeOptions.fuel_price_per_liter} onChange={e => onRouteOptionsChange({ fuel_price_per_liter: e.target.value })} />
              </div>
            </div>

            {existingStops.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <Separator />
                <div className="flex items-center gap-2 text-[11px] font-medium text-amber-500">
                  <AlertTriangle className="h-3 w-3" /> Other stops on vehicle ({existingStops.length})
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {existingStops.map((es, esi) => (
                    <div key={esi} className="flex items-center gap-2 p-1.5 bg-amber-500/5 rounded-md border border-amber-500/10 text-[10px]">
                      <MapPin className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="truncate font-medium">{es.city}</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 ml-auto shrink-0">{es.order_ref}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Geofence controls
  const renderGeofences = () => {
    if (!onGeofenceChange) return null;
    const stopsWithCoords = validStops.map((s) => ({ ...s, index: s.originalIndex }));

    const toggleGeofence = (stopIndex: number) => {
      const existing = geofences.find(g => g.stop_index === stopIndex);
      if (existing) {
        onGeofenceChange(geofences.filter(g => g.stop_index !== stopIndex));
      } else {
        onGeofenceChange([...geofences, { stop_index: stopIndex, radius_m: 500, auto_checkin: true, auto_checkout: true }]);
      }
    };

    return (
      <div className="border-t bg-card/90 backdrop-blur-sm shrink-0">
        <button type="button" onClick={() => setShowGeofences(!showGeofences)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 text-[11px]">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Geofences</span>
            <span className="text-muted-foreground">{geofences.length} active</span>
          </div>
          {showGeofences ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showGeofences && (
          <div className="px-4 pb-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {stopsWithCoords.map(s => {
                const gf = geofences.find(g => g.stop_index === s.index);
                return (
                  <button key={s.index} type="button" onClick={() => toggleGeofence(s.index)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-all ${
                      gf ? "border-violet-400/40 bg-violet-500/5 text-violet-600" : "border-border hover:border-violet-300 text-muted-foreground"
                    }`}>
                    <Crosshair className="h-2.5 w-2.5" />
                    {s.city || `Stop ${s.index + 1}`}
                    {gf && <span className="text-[9px] opacity-70">{gf.radius_m}m</span>}
                  </button>
                );
              })}
            </div>
            {geofences.map(gf => {
              const stop = stopsWithCoords.find(s => s.index === gf.stop_index);
              if (!stop) return null;
              return (
                <div key={gf.stop_index} className="flex items-center gap-2 p-2 rounded-md bg-violet-500/5 border border-violet-500/10">
                  <span className="text-[11px] font-medium text-violet-600 shrink-0">{stop.city || `Stop ${gf.stop_index + 1}`}</span>
                  <input type="range" min={100} max={5000} step={100} value={gf.radius_m}
                    onChange={e => onGeofenceChange(geofences.map(g => g.stop_index === gf.stop_index ? { ...g, radius_m: Number(e.target.value) } : g))}
                    className="flex-1 h-1.5 accent-violet-500" />
                  <span className="text-[10px] w-10 text-right text-violet-600">{gf.radius_m}m</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Trip legend
  const renderTripLegend = () => {
    if (!hasMultipleTrips || trips.length === 0) return null;
    return (
      <div className="px-4 py-2 border-t bg-card/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium">Trips</span>
        </div>
        <div className="space-y-1">
          {trips.map((trip, idx) => {
            const isForwarding = trip.assignment_type === "forwarding";
            const color = isForwarding ? FORWARDING_COLOR : TRIP_COLORS[idx % TRIP_COLORS.length];
            const vehicle = trip.vehicle_id ? fleetMapData?.vehicles?.find(v => v.id === trip.vehicle_id) : null;
            const driver = trip.driver_id ? fleetMapData?.drivers?.find(d => d.id === trip.driver_id) : null;

            return (
              <div key={trip.id} className="flex items-center gap-2 text-[11px]">
                <div className="w-5 h-0.5 rounded-full shrink-0" style={{ background: color, borderBottom: isForwarding ? "2px dashed " + color : undefined }} />
                <span className="font-medium" style={{ color }}>Trip {trip.trip_number}</span>
                <span className="text-muted-foreground truncate">
                  {stops[trip.from_stop_index]?.city || "?"} {"->"}  {stops[trip.to_stop_index]?.city || "?"}
                </span>
                {routeInfo?.legs?.[idx] && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{routeInfo.legs[idx].distance_km}km</span>}
                <div className="flex items-center gap-1 ml-1 shrink-0">
                  {isForwarding ? (
                    <Building2 className="h-3 w-3 text-amber-500" />
                  ) : (
                    <Truck className="h-3 w-3 text-muted-foreground" />
                  )}
                  {vehicle && <span className="text-[9px] text-muted-foreground">{vehicle.plate_number}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Stop reorder list
  const renderStopsList = () => {
    if (!onStopsReordered || !fullHeight) return null;
    const canMove = (idx: number, dir: "up" | "down") => {
      if (dir === "up") return idx > 0;
      return idx < stops.length - 1;
    };
    const moveStop = (idx: number, dir: "up" | "down") => {
      const newStops = [...stops];
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      [newStops[idx], newStops[swapIdx]] = [newStops[swapIdx], newStops[idx]];
      onStopsReordered(newStops);
    };

    return (
      <div className="border-t bg-card/90 backdrop-blur-sm shrink-0">
        <button type="button" onClick={() => setShowStops(!showStops)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 text-[11px]">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Stops</span>
            <span className="text-muted-foreground">{stops.length} stops</span>
          </div>
          {showStops ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showStops && (
          <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
            {stops.map((stop, idx) => {
              const colors = STOP_COLORS[stop.stop_type] || { bg: "#6366f1", border: "#4f46e5" };
              const isSwap = swapPointIndices.has(idx);
              return (
                <div key={stop.id || idx} className={`flex items-center gap-2 p-1.5 rounded-md border bg-background hover:bg-muted/30 transition-colors group ${isSwap ? "border-amber-500/30" : ""}`}>
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold shrink-0"
                    style={{ background: isSwap ? "#1e293b" : colors.bg }}
                  >
                    {isSwap ? <ArrowLeftRight className="h-3 w-3 text-amber-500" /> : idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium truncate block">{stop.city || stop.address || `Stop ${idx + 1}`}</span>
                    <span className="text-[9px] text-muted-foreground capitalize">{isSwap ? "swap point" : stop.stop_type}</span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" disabled={!canMove(idx, "up")} onClick={() => moveStop(idx, "up")}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button type="button" disabled={!canMove(idx, "down")} onClick={() => moveStop(idx, "down")}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // GPS Track Overlay Effect
  // ──────────────────────────────────────────────────────────────────
  // Mirrors the Dispatcher's Route History visual language:
  //  - each `trip` segment is drawn in its rotating-palette `color`
  //  - empty trip legs (no cargo on board) use a dashed pattern so the
  //    dispatcher can spot "km pe gol" at a glance
  //  - direction arrows are sprinkled along each trip line based on
  //    GPS heading
  //  - small colored dots mark the start of each trip leg
  //  - "P" pins drop at every stop segment
  //  - a hovered or selected segment gets a stronger glow + thicker line
  //
  // The whole overlay lives in a single LayerGroup so cleanup is one line.
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Remove previous overlay
    if (gpsTrackLayerRef.current) {
      try { map.removeLayer(gpsTrackLayerRef.current); } catch { /* */ }
      gpsTrackLayerRef.current = null;
    }

    if (!gpsTrackOverlay?.positions?.length) return;

    const group = L.layerGroup();
    const segments = gpsTrackOverlay.segments;
    const hoveredIdx = gpsTrackOverlay.hoveredSegmentIdx ?? null;
    const selectedIdx = gpsTrackOverlay.selectedSegmentIdx ?? null;

    const arrowIntervalFor = (n: number) => Math.max(Math.floor(n / 4), 8);

    if (segments && segments.length > 0) {
      segments.forEach((seg, idx) => {
        if (seg.type === "trip" && seg.positions.length > 1) {
          const latlngs: L.LatLngExpression[] = seg.positions.map(
            (p) => [p.lat, p.lng]
          );
          const isHighlighted = hoveredIdx === idx || selectedIdx === idx;
          const dim = (hoveredIdx != null || selectedIdx != null) && !isHighlighted;

          // Soft glow underneath
          L.polyline(latlngs, {
            color: seg.color,
            weight: isHighlighted ? 10 : 8,
            opacity: isHighlighted ? 0.28 : dim ? 0.08 : 0.18,
            smoothFactor: 1,
            interactive: false,
          }).addTo(group);

          // Main line — solid for loaded, dashed for empty
          L.polyline(latlngs, {
            color: seg.color,
            weight: isHighlighted ? 5 : 3.5,
            opacity: dim ? 0.45 : 0.95,
            dashArray: seg.loaded ? undefined : "8, 5",
            lineCap: "round",
            lineJoin: "round",
          })
            .bindTooltip(
              `<div style="font-family:system-ui;font-size:11px;line-height:1.5;min-width:160px">
                <div style="font-weight:700;color:${seg.color};text-transform:uppercase;letter-spacing:0.04em;font-size:10px;margin-bottom:3px">
                  ${seg.loaded ? "Loaded" : "Empty · km pe gol"}
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
                  <span style="color:#94a3b8">Distance:</span><span style="font-weight:600">${seg.distance_km.toFixed(1)} km</span>
                  <span style="color:#94a3b8">Avg:</span><span>${seg.avg_speed_kmh} km/h</span>
                  <span style="color:#94a3b8">Max:</span><span>${seg.max_speed_kmh} km/h</span>
                </div>
              </div>`,
              { sticky: true, direction: "top", className: "gps-segment-tooltip" }
            )
            .addTo(group);

          // Direction arrows along the trip line
          const interval = arrowIntervalFor(seg.positions.length);
          for (let i = interval; i < seg.positions.length - 1; i += interval) {
            const p = seg.positions[i];
            const heading = p.heading ?? 0;
            L.marker([p.lat, p.lng], {
              icon: L.divIcon({
                className: "",
                iconSize: [14, 14],
                iconAnchor: [7, 7],
                html: `<div style="cursor:pointer;opacity:${dim ? 0.4 : 1}"><svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${heading}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))"><path d="M12 2 L18 18 L12 14 L6 18 Z" fill="${seg.color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/></svg></div>`,
              }),
              zIndexOffset: 1300,
              interactive: false,
            }).addTo(group);
          }

          // Start dot for the very first trip and after every stop
          const prev = segments[idx - 1];
          if (idx === 0 || (prev && prev.type === "stop")) {
            L.marker([seg.start_lat, seg.start_lng], {
              icon: L.divIcon({
                className: "",
                iconSize: [12, 12],
                iconAnchor: [6, 6],
                html: `<div style="width:12px;height:12px;border-radius:50%;background:${seg.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
              }),
              zIndexOffset: 1250,
              interactive: false,
            }).addTo(group);
          }

          // End dot for the very last trip leg or before a stop
          const next = segments[idx + 1];
          if (idx === segments.length - 1 || (next && next.type === "stop")) {
            L.marker([seg.end_lat, seg.end_lng], {
              icon: L.divIcon({
                className: "",
                iconSize: [10, 10],
                iconAnchor: [5, 5],
                html: `<div style="width:10px;height:10px;border-radius:50%;background:${seg.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5);opacity:0.85"></div>`,
              }),
              zIndexOffset: 1240,
              interactive: false,
            }).addTo(group);
          }
        }

        // Stop "P" pin
        if (seg.type === "stop") {
          const isHighlighted = hoveredIdx === idx || selectedIdx === idx;
          const fmtTimePopup = (iso: string) =>
            new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const durMin = Math.max(0, Math.round((new Date(seg.to).getTime() - new Date(seg.from).getTime()) / 60000));
          const durStr = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin / 60)}h ${durMin % 60}m`;

          L.marker([seg.start_lat, seg.start_lng], {
            icon: L.divIcon({
              className: "",
              iconSize: [26, 26],
              iconAnchor: [13, 13],
              html: `<div style="width:${isHighlighted ? 30 : 26}px;height:${isHighlighted ? 30 : 26}px;border-radius:50%;background:#0f172a;border:2px solid ${isHighlighted ? "#fff" : "#64748b"};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;transition:all 120ms ease">
                <span style="color:white;font-weight:800;font-size:10px">P</span>
              </div>`,
            }),
            zIndexOffset: 1200,
          })
            .bindTooltip(
              `<div style="font-family:system-ui;font-size:11px;line-height:1.5;min-width:140px">
                <div style="font-weight:700;font-size:11px;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8">Stop</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px">
                  <span style="color:#94a3b8">Time:</span><span style="font-weight:600">${fmtTimePopup(seg.from)} – ${fmtTimePopup(seg.to)}</span>
                  <span style="color:#94a3b8">Idle:</span><span>${durStr}</span>
                </div>
              </div>`,
              { sticky: true, direction: "top", className: "gps-segment-tooltip" }
            )
            .addTo(group);
        }
      });
    } else {
      // Legacy single-line fallback (when segments aren't provided)
      const latlngs: L.LatLngExpression[] = gpsTrackOverlay.positions.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, {
        color: "#22c55e",
        weight: 4,
        opacity: 0.85,
        dashArray: "8, 4",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(group);
    }

    group.addTo(map);
    gpsTrackLayerRef.current = group as unknown as L.Polyline;

    return () => {
      if (gpsTrackLayerRef.current && map) {
        try { map.removeLayer(gpsTrackLayerRef.current); } catch { /* */ }
      }
    };
  }, [gpsTrackOverlay]);

  /* ────────────────────────────────────────────────────────────────────────
   * Expense markers (fuel / tolls / parking etc.) rendered as small
   * category-colored pins along the route. Hover shows amount + vendor.
   * ────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !L) return;

    // Remove previous layer group
    if (expenseLayerRef.current) {
      try { map.removeLayer(expenseLayerRef.current); } catch { /* */ }
      expenseLayerRef.current = null;
    }

    if (!expenseMarkers?.length) return;

    // Category styling — keep in sync with tab-expenses.tsx
    const STYLES: Record<string, { bg: string; ring: string; emoji: string }> = {
      fuel: { bg: "#f59e0b", ring: "#d97706", emoji: "\u26FD" },        // ⛽
      toll: { bg: "#3b82f6", ring: "#2563eb", emoji: "\u20AC" },        // €
      parking: { bg: "#06b6d4", ring: "#0891b2", emoji: "P" },
      ferry: { bg: "#0ea5e9", ring: "#0284c7", emoji: "\u2693" },        // ⚓
      ad_blue: { bg: "#6366f1", ring: "#4f46e5", emoji: "AB" },
      wash: { bg: "#14b8a6", ring: "#0d9488", emoji: "\u2728" },
      repair: { bg: "#fb923c", ring: "#ea580c", emoji: "\uD83D\uDD27" }, // 🔧
      driver_per_diem: { bg: "#10b981", ring: "#059669", emoji: "\u20AC" },
      customs: { bg: "#8b5cf6", ring: "#7c3aed", emoji: "C" },
      insurance: { bg: "#d946ef", ring: "#c026d3", emoji: "I" },
      penalty: { bg: "#ef4444", ring: "#dc2626", emoji: "!" },
      other: { bg: "#64748b", ring: "#475569", emoji: "\u20AC" },
    };

    const group = L.layerGroup().addTo(map);
    for (const ex of expenseMarkers) {
      if (!Number.isFinite(ex.latitude) || !Number.isFinite(ex.longitude)) continue;
      const s = STYLES[ex.category] ?? STYLES.other;
      const html = `
        <div style="
          width:22px;height:22px;border-radius:50%;
          background:${s.bg};border:2px solid ${s.ring};
          box-shadow:0 4px 10px rgba(0,0,0,.45),0 0 0 3px rgba(0,0,0,.18);
          display:flex;align-items:center;justify-content:center;
          color:#0b0b0b;font-weight:700;font-size:11px;line-height:1;
          font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        ">${s.emoji}</div>`;
      const icon = L.divIcon({
        className: "expense-marker",
        html,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const m = L.marker([ex.latitude, ex.longitude], {
        icon,
        zIndexOffset: 800,
        title: `${ex.category.toUpperCase()} ${ex.amount} ${ex.currency}${ex.vendor ? " - " + ex.vendor : ""}`,
      }).addTo(group);

      const dt = (() => {
        try { return new Date(ex.occurred_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
        catch { return ""; }
      })();
      m.bindPopup(`
        <div style="font-family:system-ui;font-size:11px;min-width:160px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.bg};"></span>
            <span style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#111;">${ex.category.replace("_", " ")}</span>
          </div>
          <div style="font-weight:700;font-size:14px;color:#111;">${Number(ex.amount).toFixed(2)} ${ex.currency}</div>
          ${ex.vendor ? `<div style="color:#444;margin-top:2px;">${ex.vendor}</div>` : ""}
          ${ex.location_label ? `<div style="color:#666;margin-top:2px;font-size:10px;">${ex.location_label}</div>` : ""}
          ${dt ? `<div style="color:#888;margin-top:4px;font-size:10px;">${dt}</div>` : ""}
        </div>`);
    }

    expenseLayerRef.current = group;

    return () => {
      if (expenseLayerRef.current && map) {
        try { map.removeLayer(expenseLayerRef.current); } catch { /* */ }
        expenseLayerRef.current = null;
      }
    };
  }, [expenseMarkers]);

  return (
    <div className={`overflow-hidden bg-card ${fullHeight ? "h-full flex flex-col" : "rounded-xl border"}`}>
      <div
        ref={containerRef}
        className={fullHeight ? "flex-1" : ""}
        style={{ height: fullHeight ? undefined : "280px", width: "100%", position: "relative", zIndex: 0, minHeight: fullHeight ? 0 : undefined }}
      />

      {/* Summary bar - hidden when external panels handle this */}
      {!hideBottomPanels && <div className={`px-4 py-2.5 ${fullHeight ? "border-t bg-white/80 dark:bg-card/90 backdrop-blur-sm shrink-0" : "border-t"}`}>
        {geocoding ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            Geocoding addresses...
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            Calculating route...
          </div>
        ) : hasMultipleTrips && routeInfo ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                <RouteIcon className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">
                  {routeInfo.distance_km.toLocaleString()} km
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">
                  {routeInfo.duration_hours}h {routeInfo.duration_minutes}min
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4 text-amber-500" />
                <span className="text-sm">{trips.length} trips</span>
              </div>
            </div>
          </div>
        ) : routeInfo ? (
          <div className="space-y-2">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5">
                <RouteIcon className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">{routeInfo.distance_km.toLocaleString()} km</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">
                  {routeInfo.duration_hours > 0 ? `${routeInfo.duration_hours}h ` : ""}{routeInfo.duration_minutes}min
                </span>
                <span className="text-xs text-muted-foreground">(driving)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-blue-500" />
                <span className="text-sm">{validStops.length} stops</span>
              </div>
            </div>
            {routeInfo.legs.length > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground overflow-x-auto pb-1">
                {validStops.map((stop, idx) => {
                  const colors = STOP_COLORS[stop.stop_type] || { bg: "#6366f1", border: "#4f46e5" };
                  return (
                    <div key={stop.id} className="flex items-center gap-1 shrink-0">
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-white font-medium"
                        style={{ backgroundColor: colors.bg, fontSize: "10px" }}
                      >
                        {stop.city || stop.stop_type}
                      </span>
                      {idx < validStops.length - 1 && routeInfo.legs[idx] && (
                        <>
                          <Navigation className="h-2.5 w-2.5 rotate-90" />
                          <span className="font-medium text-foreground">
                            {routeInfo.legs[idx].distance_km}km
                          </span>
                          <span>
                            ({routeInfo.legs[idx].duration_min < 60
                              ? `${routeInfo.legs[idx].duration_min}min`
                              : `${Math.floor(routeInfo.legs[idx].duration_min / 60)}h${routeInfo.legs[idx].duration_min % 60 > 0 ? ` ${routeInfo.legs[idx].duration_min % 60}m` : ""}`})
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Navigation className="h-3.5 w-3.5" />
            {validStops.length < 2
              ? "Add at least 2 stops with addresses to see the route"
              : "No route data available"}
          </div>
        )}
      </div>}

      {!hideBottomPanels && (
        <>
          {renderStopsList()}
          {renderTripLegend()}
          {renderCapacityOverlay()}
          {renderRouteOptions()}
          {renderGeofences()}
        </>
      )}
    </div>
  );
}
