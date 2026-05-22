"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin, Trash2, X, Search, Route as RouteIcon,
  Calculator, ChevronDown, ChevronUp, Loader2,
  Truck, RotateCcw, Info, FileText, Upload
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  RoutingOptions,
  fetchValhallaRoute,
  DEFAULT_ROUTING_CONFIG,
  type RoutingConfig,
} from "@/components/tms/routing-options";

// ─── Types ─────────────────────────────────
interface CalcStop {
  id: string;
  label: string;
  address: string;
  city: string;
  country: string;
  country_code: string;
  lat: number;
  lng: number;
}

interface CountrySegment {
  country_code: string;
  country_name: string;
  distance_km: number;
  has_toll: boolean;
  toll_type: string; // "distance_based" | "vignette" | "section_based" | "none"
  rate_per_km: number;
  toll_cost: number;
  vignette_cost: number;
  special_charges: number;
  currency: string;
  breakdown: {
  infrastructure: number;
  air_pollution: number;
  noise: number;
  co2_surcharge: number;
  };
  calc_log?: string[];
  }

interface RouteResult {
  total_distance_km: number;
  total_duration_hours: number;
  total_duration_minutes: number;
  total_toll_cost: number;
  total_vignette_cost: number;
  total_special_charges: number;
  grand_total: number;
  country_segments: CountrySegment[];
  geometry: [number, number][];
}

interface VehicleProfile {
  emission_class: string;
  axle_category: string;
  weight_class: string;
  co2_class: string;
}

interface VehicleCategory {
  id: string;
  category_type: string;
  code: string;
  name: string;
  sort_order: number;
}

interface Props {
  onClose?: () => void;
}

// ─── Currency formatting & conversion ──────────────────
// Approximate exchange rates to EUR (updated periodically)
const EUR_RATES: Record<string, number> = {
  EUR: 1,
  HUF: 0.00253,   // 1 HUF = ~0.00253 EUR (1 EUR ~ 395 HUF)
  CZK: 0.0398,    // 1 CZK = ~0.0398 EUR (1 EUR ~ 25.1 CZK)
  PLN: 0.233,     // 1 PLN = ~0.233 EUR (1 EUR ~ 4.29 PLN)
  RON: 0.201,     // 1 RON = ~0.201 EUR (1 EUR ~ 4.97 RON)
  BGN: 0.511,     // 1 BGN = ~0.511 EUR (1 EUR ~ 1.96 BGN)
  CHF: 0.95,      // 1 CHF = ~0.95 EUR
  RSD: 0.00854,   // 1 RSD = ~0.00854 EUR
  HRK: 0.133,     // 1 HRK = ~0.133 EUR
};

function toEur(amount: number, currency: string): number {
  const rate = EUR_RATES[currency] || 1;
  return amount * rate;
}

function formatCost(amount: number, currency: string): string {
  const noDecimalCurrencies = ["HUF", "CZK", "PLN", "RON", "BGN", "HRK", "RSD"];
  if (noDecimalCurrencies.includes(currency)) {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
  return `${amount.toFixed(2)} ${currency}`;
}

function formatEur(amount: number): string {
  return `${amount.toFixed(2)} EUR`;
}

// ─── KML/KMZ Parser ───────────────────────────────────
function parseCoordinateText(text: string): [number, number][] {
  const coords: [number, number][] = [];
  const lines = text.trim().split(/\s+/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90) {
        coords.push([lat, lng]);
      }
    }
  }
  return coords;
}

function distBetween(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function parseKML(xmlString: string): { coords: [number, number][]; name: string; totalDistanceKm: number | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  // Extract route name
  const nameEl = doc.querySelector("Document > name") || doc.querySelector("Placemark > name");
  const name = nameEl?.textContent?.trim() || "Imported Route";

  // Only extract coordinates from LineString elements (skip Point placemarks)
  const lineStrings = doc.querySelectorAll("LineString");
  const segments: [number, number][][] = [];

  for (const ls of Array.from(lineStrings)) {
    const coordEl = ls.querySelector("coordinates");
    if (coordEl) {
      const seg = parseCoordinateText(coordEl.textContent || "");
      if (seg.length >= 2) segments.push(seg);
    }
  }

  // If no LineString found, fall back to all coordinates (legacy KML / tracks)
  if (segments.length === 0) {
    // Try gx:Track / gx:coord elements
    const gxCoords = doc.querySelectorAll("gx\\:coord, coord");
    if (gxCoords.length > 0) {
      const seg: [number, number][] = [];
      for (const el of Array.from(gxCoords)) {
        const parts = (el.textContent || "").trim().split(/\s+/);
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) seg.push([lat, lng]);
        }
      }
      if (seg.length >= 2) segments.push(seg);
    }

    // Last resort: grab coordinates from any element but filter to multi-point ones only
    if (segments.length === 0) {
      const allCoordEls = doc.querySelectorAll("coordinates");
      for (const el of Array.from(allCoordEls)) {
        const seg = parseCoordinateText(el.textContent || "");
        if (seg.length >= 2) segments.push(seg);
      }
    }
  }

  // Chain segments in geographic order (connect end of one to start of nearest next)
  let allCoords: [number, number][] = [];
  if (segments.length === 1) {
    allCoords = segments[0];
  } else if (segments.length > 1) {
    const used = new Set<number>();
    // Start with the first segment
    allCoords = [...segments[0]];
    used.add(0);

    while (used.size < segments.length) {
      const tail = allCoords[allCoords.length - 1];
      let bestIdx = -1;
      let bestDist = Infinity;
      let bestReverse = false;

      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];
        // Check connection: tail -> seg start
        const dStart = distBetween(tail, seg[0]);
        // Check connection: tail -> seg end (needs reverse)
        const dEnd = distBetween(tail, seg[seg.length - 1]);

        if (dStart < bestDist) { bestDist = dStart; bestIdx = i; bestReverse = false; }
        if (dEnd < bestDist) { bestDist = dEnd; bestIdx = i; bestReverse = true; }
      }

      if (bestIdx >= 0) {
        used.add(bestIdx);
        const seg = bestReverse ? [...segments[bestIdx]].reverse() : segments[bestIdx];
        allCoords.push(...seg);
      }
    }
  }

  // Try to extract distance from ExtendedData or description
  let totalDistanceKm: number | null = null;
  const extData = doc.querySelectorAll("SimpleData, Data");
  for (const el of Array.from(extData)) {
    const attrName = el.getAttribute("name") || el.getAttribute("schemaDataName") || "";
    if (/distance|length|km/i.test(attrName)) {
      const val = parseFloat(el.textContent || "");
      if (!isNaN(val)) {
        totalDistanceKm = val > 1000 ? val / 1000 : val;
      }
    }
  }

  return { coords: allCoords, name, totalDistanceKm };
}

function formatRate(rate: number, currency: string): string {
  const noDecimalCurrencies = ["HUF", "CZK", "PLN", "RON", "BGN", "HRK", "RSD"];
  if (noDecimalCurrencies.includes(currency)) {
    return `${rate.toFixed(2)} ${currency}/km`;
  }
  return `${rate.toFixed(4)} ${currency}/km`;
}

// ─── Country + road type detection via reverse geocode ─────
type PointInfo = { code: string; name: string; road_type: "motorway" | "trunk" | "primary" | "other" };
const countryCache = new Map<string, PointInfo>();

function classifyRoadType(data: any): "motorway" | "trunk" | "primary" | "other" {
  // Nominatim returns class/type for the nearest road feature
  const osmType = (data?.type || "").toLowerCase();
  const osmClass = (data?.class || "").toLowerCase();
  if (osmType === "motorway" || osmType === "motorway_link") return "motorway";
  if (osmType === "trunk" || osmType === "trunk_link") return "trunk";
  if (osmType === "primary" || osmType === "primary_link") return "primary";
  // Also check road name patterns for highways (M1, A1, etc.)
  const road = data?.address?.road || "";
  if (/^(M|A|E)\d/i.test(road) && osmClass === "highway") return "motorway";
  return "other";
}

async function getCountryAtPoint(lat: number, lng: number): Promise<PointInfo | null> {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (countryCache.has(cacheKey)) return countryCache.get(cacheKey)!;
  try {
    // Use zoom=10 to get road-level detail (zoom=3 only returns country)
    const res = await fetch(
      `/api/tms/geocode?action=reverse&lat=${lat}&lon=${lng}&zoom=10`
    );
    const data = await res.json();
    const code = data?.address?.country_code?.toUpperCase() || "";
    const name = data?.address?.country || "";
    if (code) {
      const road_type = classifyRoadType(data);
      const result: PointInfo = { code, name, road_type };
      countryCache.set(cacheKey, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeSearch(query: string): Promise<Array<{ display_name: string; lat: number; lng: number; country_code: string; country: string; city: string }>> {
  try {
    const res = await fetch(
      `/api/tms/geocode?action=search&q=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    return data.map((d: any) => ({
      display_name: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      country_code: (d.address?.country_code || "").toUpperCase(),
      country: d.address?.country || "",
      city: d.address?.city || d.address?.town || d.address?.village || d.address?.state || "",
    }));
  } catch {
    return [];
  }
}

function getFlagUrl(code: string): string {
  if (!code) return "";
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}

// ─── Stop Marker Icon ────────────────────────
function createCalcStopIcon(index: number) {
  const colors = ["#f59e0b", "#22c55e", "#8b5cf6", "#3b82f6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
  const bg = colors[index % colors.length];
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="
      background:${bg};color:#fff;width:30px;height:30px;
      border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:13px;font-family:system-ui;
      border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
    ">${index + 1}</div>`,
  });
}

// ─── Main Component ──────────────────────────
export function TollCalculator({ onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const countryLabelsRef = useRef<L.Layer[]>([]);

  const [stops, setStops] = useState<CalcStop[]>([]);
  const [routingConfig, setRoutingConfig] = useState<RoutingConfig>(DEFAULT_ROUTING_CONFIG);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState("");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [importedRouteName, setImportedRouteName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vehicle profile
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile>({
    emission_class: "", axle_category: "", weight_class: "", co2_class: "",
  });
  const [categories, setCategories] = useState<VehicleCategory[]>([]);

  // Fetch vehicle categories on mount and set sensible defaults
  useEffect(() => {
    fetch("/api/tms/toll-rates?action=overview")
      .then(r => r.json())
      .then(data => {
        if (data.categories) {
          setCategories(data.categories);
          // Set default vehicle profile if not already set
          setVehicleProfile(prev => ({
            emission_class: prev.emission_class || (data.categories.find((c: VehicleCategory) => c.code === "EURO_6")?.code || ""),
            axle_category: prev.axle_category || (data.categories.find((c: VehicleCategory) => c.code === "2_AXLE")?.code || ""),
            weight_class: prev.weight_class,
            co2_class: prev.co2_class,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const emissionClasses = categories.filter(c => c.category_type === "emission_class");
  const axleCategories = categories.filter(c => c.category_type === "axle_category");
  const weightClasses = categories.filter(c => c.category_type === "weight_class");
  const co2Classes = categories.filter(c => c.category_type === "co2_class");



  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [49, 10],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ position: "bottomleft" }).addTo(map);
    mapInstance.current = map;

    // Click to add stop
    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      try {
        const res = await fetch(
          `/api/tms/geocode?action=reverse&lat=${lat}&lon=${lng}&zoom=10`
        );
        const data = await res.json();
        const newStop: CalcStop = {
          id: crypto.randomUUID(),
          label: data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.state || "Stop",
          address: data?.display_name || "",
          city: data?.address?.city || data?.address?.town || data?.address?.village || "",
          country: data?.address?.country || "",
          country_code: (data?.address?.country_code || "").toUpperCase(),
          lat, lng,
        };
        setStops(prev => [...prev, newStop]);
      } catch {
        const newStop: CalcStop = {
          id: crypto.randomUUID(),
          label: `Point (${lat.toFixed(2)}, ${lng.toFixed(2)})`,
          address: "", city: "", country: "", country_code: "",
          lat, lng,
        };
        setStops(prev => [...prev, newStop]);
      }
    });

    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update markers when stops change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    // Add new markers
    stops.forEach((stop, i) => {
      const marker = L.marker([stop.lat, stop.lng], {
        icon: createCalcStopIcon(i),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindPopup(`<div style="font-size:12px;font-family:system-ui;line-height:1.5">
        <strong>${stop.label}</strong><br/>
        <span style="color:#999">${stop.city}${stop.country ? `, ${stop.country}` : ""}</span>
      </div>`);

      marker.on("dragend", async () => {
        const pos = marker.getLatLng();
        try {
          const res = await fetch(
            `/api/tms/geocode?action=reverse&lat=${pos.lat}&lon=${pos.lng}&zoom=10`
          );
          const data = await res.json();
          setStops(prev => prev.map((s, idx) => idx === i ? {
            ...s,
            lat: pos.lat, lng: pos.lng,
            label: data?.address?.city || data?.address?.town || s.label,
            city: data?.address?.city || data?.address?.town || "",
            country: data?.address?.country || "",
            country_code: (data?.address?.country_code || "").toUpperCase(),
            address: data?.display_name || "",
          } : s));
        } catch {
          setStops(prev => prev.map((s, idx) => idx === i ? { ...s, lat: pos.lat, lng: pos.lng } : s));
        }
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (stops.length > 0) {
      const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds.pad(0.15), { maxZoom: 12 });
    }
  }, [stops]);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const results = await geocodeSearch(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Add stop from search result
  const addFromSearch = useCallback((r: any) => {
    const newStop: CalcStop = {
      id: crypto.randomUUID(),
      label: r.city || r.display_name.split(",")[0],
      address: r.display_name,
      city: r.city,
      country: r.country,
      country_code: r.country_code,
      lat: r.lat, lng: r.lng,
    };
    setStops(prev => [...prev, newStop]);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);
  }, []);

  // Remove stop
  const removeStop = useCallback((idx: number) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
    setResult(null);
  }, []);

  // Reset all
  const resetAll = useCallback(() => {
    setStops([]);
    setResult(null);
    setImportedRouteName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const map = mapInstance.current;
    if (map) {
      if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
      countryLabelsRef.current.forEach(l => map.removeLayer(l));
      countryLabelsRef.current = [];
      map.setView([49, 10], 5);
    }
  }, []);

  // ─── Shared route processing (draw, detect countries, calculate tolls) ────
  // countryBreakdown comes from Valhalla route API (country_road_breakdown)
  // If null (e.g. KML import), falls back to Nominatim sampling
  const processRouteAndCalculate = useCallback(async (
    routePoints: [number, number][],
    totalDistanceKm: number,
    totalDurationMin: number,
    routeLabel?: string,
    countryBreakdown?: Record<string, { country_code: string; country_name: string; motorway_km: number; trunk_km: number; primary_km: number; other_km: number; total_km: number }> | null,
  ) => {
    const map = mapInstance.current;

    setCalcProgress("Drawing route...");
    if (map) {
      const polyline = L.polyline(routePoints, {
        color: "#FCBF01",
        weight: 4,
        opacity: 0.8,
      }).addTo(map);
      routeLayerRef.current = polyline;
      map.fitBounds(polyline.getBounds().pad(0.1));
    }

    // Build country distances from Valhalla breakdown or fallback to Nominatim
    let countryDistances: Map<string, { code: string; name: string; distance: number; motorway_km: number; main_road_km: number }>;

    // Check if Valhalla provided real country data (not just "XX" Unknown)
    const hasRealCountryData = countryBreakdown &&
      Object.keys(countryBreakdown).some(code => code !== "XX" && (countryBreakdown[code]?.total_km ?? 0) > 0.1);

    if (hasRealCountryData && countryBreakdown) {
      // Fast path: use Valhalla data directly (no Nominatim calls needed)
      // This works when self-hosting Valhalla (which returns admins data)
      setCalcProgress("Using Valhalla country/road data...");
      countryDistances = new Map();
      for (const [code, bd] of Object.entries(countryBreakdown)) {
        if (code === "XX" || bd.total_km < 0.1) continue;
        countryDistances.set(code, {
          code,
          name: bd.country_name,
          distance: bd.total_km,
          motorway_km: bd.motorway_km + bd.trunk_km,
          main_road_km: bd.primary_km + bd.other_km,
        });
      }
    } else {
      // Fallback: sample points and reverse geocode via Nominatim (also extracts road type)
      setCalcProgress("Detecting countries + road types via geocoding...");
      const maxSamples = 30;
      const sampleInterval = Math.max(1, Math.floor(routePoints.length / maxSamples));
      const sampleIndices: number[] = [0];
      for (let i = sampleInterval; i < routePoints.length; i += sampleInterval) {
        sampleIndices.push(i);
      }
      if (sampleIndices[sampleIndices.length - 1] !== routePoints.length - 1) {
        sampleIndices.push(routePoints.length - 1);
      }

      const countryAtSample: Array<{ index: number; code: string; name: string; road_type: string }> = [];
      for (let s = 0; s < sampleIndices.length; s++) {
        const idx = sampleIndices[s];
        const [lat, lng] = routePoints[idx];
        const info = await getCountryAtPoint(lat, lng);
        if (info) countryAtSample.push({ index: idx, code: info.code, name: info.name, road_type: info.road_type });
        setCalcProgress(`Detecting countries (${s + 1}/${sampleIndices.length})...`);
      }

      function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      countryDistances = new Map();
      let prevSample = countryAtSample[0];
      for (let s = 1; s < countryAtSample.length; s++) {
        const curr = countryAtSample[s];
        const prevIdx = countryAtSample[s - 1].index;
        const currIdx = curr.index;
        const countryCode = prevSample.code;
        const isMotorway = prevSample.road_type === "motorway" || prevSample.road_type === "trunk";
        let segDist = 0;
        for (let p = prevIdx; p < currIdx && p < routePoints.length - 1; p++) {
          segDist += haversine(routePoints[p][0], routePoints[p][1], routePoints[p + 1][0], routePoints[p + 1][1]);
        }
        const existing = countryDistances.get(countryCode);
        if (existing) {
          existing.distance += segDist;
          if (isMotorway) existing.motorway_km += segDist;
          else existing.main_road_km += segDist;
        } else {
          countryDistances.set(countryCode, {
            code: countryCode,
            name: prevSample.name,
            distance: segDist,
            motorway_km: isMotorway ? segDist : 0,
            main_road_km: isMotorway ? 0 : segDist,
          });
        }
        prevSample = curr;
      }
    }

    setCalcProgress("Fetching toll rates from database...");
    const countryCodes = Array.from(countryDistances.keys());
    const distances: Record<string, number> = {};
    const roadTypes: Record<string, { motorway_km: number; main_road_km: number }> = {};
    for (const [code, d] of countryDistances.entries()) {
      distances[code] = Math.round(d.distance * 10) / 10;
      roadTypes[code] = { motorway_km: Math.round(d.motorway_km * 10) / 10, main_road_km: Math.round(d.main_road_km * 10) / 10 };
    }
    const tollRes = await fetch("/api/tms/toll-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "calculate_tolls",
        data: {
          country_codes: countryCodes,
          distances,
          road_types: roadTypes,
          vehicle_profile: vehicleProfile,
        },
      }),
    });
    const tollData = await tollRes.json();

    const countrySegments: CountrySegment[] = Array.from(countryDistances.entries()).map(([code, d]) => {
      const toll = tollData.tolls?.[code] || {};
      return {
        country_code: code,
        country_name: d.name,
        distance_km: Math.round(d.distance * 10) / 10,
        has_toll: !!toll.rate_per_km || !!toll.vignette_cost,
        toll_type: toll.toll_type || "none",
        rate_per_km: toll.rate_per_km || 0,
        toll_cost: toll.distance_cost || 0,
        vignette_cost: toll.vignette_cost || 0,
        special_charges: toll.special_charges || 0,
        currency: toll.currency || "EUR",
        breakdown: {
          infrastructure: toll.infrastructure || 0,
          air_pollution: toll.air_pollution || 0,
          noise: toll.noise || 0,
          co2_surcharge: toll.co2_surcharge || 0,
        },
        calc_log: toll.calc_log || [],
      };
    }).sort((a, b) => b.distance_km - a.distance_km);

    const totalTollCost = countrySegments.reduce((sum, s) => sum + s.toll_cost, 0);
    const totalVignetteCost = countrySegments.reduce((sum, s) => sum + s.vignette_cost, 0);
    const totalSpecialCharges = countrySegments.reduce((sum, s) => sum + s.special_charges, 0);

    // Add country labels on map
    if (map) {
      const addedCountries = new Set<string>();
      for (const [code, d] of countryDistances.entries()) {
        if (addedCountries.has(code)) continue;
        addedCountries.add(code);
        // Find approximate midpoint of this country's segment on the route
        const midIdx = Math.floor(routePoints.length * (Array.from(countryDistances.keys()).indexOf(code) + 0.5) / countryDistances.size);
        const [lat, lng] = routePoints[Math.min(midIdx, routePoints.length - 1)];
        const seg = countrySegments.find(s => s.country_code === code);
        const labelIcon = L.divIcon({
          className: "",
          iconSize: [0, 0],
          html: `<div style="
            background:rgba(15,15,15,0.9);color:#fff;font-size:10px;
            padding:4px 8px;border-radius:6px;border:1px solid rgba(252,191,1,0.3);
            white-space:nowrap;font-family:system-ui;box-shadow:0 2px 8px rgba(0,0,0,0.4);
            display:flex;align-items:center;gap:4px;
          ">
            <img src="https://flagcdn.com/w20/${code.toLowerCase()}.png" width="14" height="10" style="border-radius:1px" />
            <span style="font-weight:700">${d.name}</span>
            <span style="color:#999;margin-left:2px">${Math.round(d.distance)}km</span>
            ${seg && seg.has_toll ? `<span style="color:#22c55e;font-weight:600;margin-left:2px">${seg.currency === "HUF" || seg.currency === "CZK" || seg.currency === "PLN" ? Math.round(seg.toll_cost + seg.vignette_cost).toLocaleString() : (seg.toll_cost + seg.vignette_cost).toFixed(2)} ${seg.currency || "EUR"}${seg.currency !== "EUR" ? ` <span style="color:#94a3b8;font-weight:400;font-size:10px">(${toEur(seg.toll_cost + seg.vignette_cost, seg.currency).toFixed(2)} EUR)</span>` : ""}</span>` : ""}
          </div>`,
        });
        const label = L.marker([lat + 0.15, lng], { icon: labelIcon, interactive: false, zIndexOffset: 2000 }).addTo(map);
        countryLabelsRef.current.push(label);
      }
    }

    if (routeLabel) setImportedRouteName(routeLabel);

    setResult({
      total_distance_km: totalDistanceKm,
      total_duration_hours: Math.floor(totalDurationMin / 60),
      total_duration_minutes: totalDurationMin % 60,
      total_toll_cost: Math.round(totalTollCost * 100) / 100,
      total_vignette_cost: Math.round(totalVignetteCost * 100) / 100,
      total_special_charges: Math.round(totalSpecialCharges * 100) / 100,
      grand_total: Math.round((totalTollCost + totalVignetteCost + totalSpecialCharges) * 100) / 100,
      country_segments: countrySegments,
      geometry: routePoints,
    });
  }, [vehicleProfile]);

  // ─── Calculate Route & Tolls (from stops via OSRM) ────────────────
  const calculateTolls = useCallback(async () => {
    if (stops.length < 2) return;
    setCalculating(true);
    setResult(null);
    setImportedRouteName(null);

    const map = mapInstance.current;
    if (map && routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (map) { countryLabelsRef.current.forEach(l => map.removeLayer(l)); countryLabelsRef.current = []; }

    try {
      const strategyLabel = routingConfig.strategy === "avoid_tolls" ? "Avoid Tolls" : routingConfig.strategy === "shortest" ? "Shortest" : "Fastest";
      setCalcProgress(`Fetching truck route (${strategyLabel})...`);

      const locations = stops.map(s => ({ lat: s.lat, lng: s.lng }));
      const routeData = await fetchValhallaRoute(locations, routingConfig);

      const routePoints: [number, number][] = routeData.latlngs;
      const totalDistanceKm = routeData.distance_km;
      const totalDurationMin = routeData.duration_minutes;

      // Pass Valhalla's country/road breakdown -- no Nominatim calls needed
      await processRouteAndCalculate(routePoints, totalDistanceKm, totalDurationMin, undefined, routeData.country_road_breakdown);
    } catch (err) {
      console.error("[v0] Toll calculation error:", err);
    } finally {
      setCalculating(false);
    }
  }, [stops, processRouteAndCalculate, routingConfig]);

  // ─── Import KML/KMZ Route File ────────────────
  const handleKMLImport = useCallback(async (file: File) => {
    setCalculating(true);
    setResult(null);
    setImportedRouteName(null);

    const map = mapInstance.current;
    if (map && routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (map) { countryLabelsRef.current.forEach(l => map.removeLayer(l)); countryLabelsRef.current = []; }

    try {
      let xmlText: string;

      if (file.name.toLowerCase().endsWith(".kmz")) {
        // KMZ is a zip containing doc.kml
        setCalcProgress("Extracting KMZ archive...");
        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(file);
        const kmlFile = zip.file(/\.kml$/i)[0];
        if (!kmlFile) throw new Error("No KML file found inside KMZ archive");
        xmlText = await kmlFile.async("string");
      } else {
        setCalcProgress("Reading KML file...");
        xmlText = await file.text();
      }

      setCalcProgress("Parsing route coordinates...");
      const parsed = parseKML(xmlText);

      if (parsed.coords.length < 2) {
        throw new Error("KML file contains fewer than 2 coordinate points");
      }

      // Calculate total distance from coordinates using haversine
      function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      let calcDistance = 0;
      for (let i = 0; i < parsed.coords.length - 1; i++) {
        calcDistance += haversine(parsed.coords[i][0], parsed.coords[i][1], parsed.coords[i + 1][0], parsed.coords[i + 1][1]);
      }
      const totalDistanceKm = parsed.totalDistanceKm || Math.round(calcDistance * 10) / 10;

      // Estimate duration at 70 km/h average for trucks
      const totalDurationMin = Math.round((totalDistanceKm / 70) * 60);

      setCalcProgress(`Imported "${parsed.name}" (${parsed.coords.length} points, ${totalDistanceKm} km). Processing...`);

      await processRouteAndCalculate(parsed.coords, totalDistanceKm, totalDurationMin, parsed.name);
    } catch (err: any) {
      console.error("[v0] KML import error:", err);
      alert(`Failed to import route: ${err.message}`);
    } finally {
      setCalculating(false);
      // Reset file input so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [processRouteAndCalculate]);

  const getEmissionLabel = () => {
    const ec = emissionClasses.find(c => c.id === vehicleProfile.emission_class);
    return ec?.code || "Select";
  };
  const getAxleLabel = () => {
    const ac = axleCategories.find(c => c.id === vehicleProfile.axle_category);
    return ac?.code || "Select";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calculator className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Toll Calculator</h2>
            <p className="text-[9px] text-muted-foreground">Add stops on the map or search locations to calculate toll costs</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".kml,.kmz"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleKMLImport(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] gap-1 bg-transparent"
            onClick={() => fileInputRef.current?.click()}
            disabled={calculating}
          >
            <Upload className="h-3 w-3" /> Import KML
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 bg-transparent" onClick={resetAll}>
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Content: Sidebar + Map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Stops + Vehicle + Results */}
        <div className="w-[320px] border-r border-border/50 flex flex-col shrink-0 bg-card/50">
          {/* Search */}
          <div className="p-2.5 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
                placeholder="Search city, address, or click on map..."
                className="h-8 text-[11px] pl-8 pr-8"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResults([]); setShowSearch(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            {/* Search Results Dropdown */}
            {showSearch && (searchResults.length > 0 || searching) && (
              <div className="mt-1 rounded-md border border-border bg-card shadow-lg max-h-48 overflow-auto" style={{ scrollbarWidth: "thin" }}>
                {searching ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </div>
                ) : searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => addFromSearch(r)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/20 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <img src={getFlagUrl(r.country_code) || "/placeholder.svg"} alt="" className="w-4 h-3 rounded-sm object-cover" crossOrigin="anonymous" />
                      <span className="text-[11px] text-foreground truncate">{r.display_name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stops List */}
          <div className="flex-1 overflow-auto" style={{ scrollbarWidth: "thin" }}>
            {/* Stop items */}
            <div className="p-2.5 space-y-1.5">
              {stops.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <MapPin className="h-6 w-6 mb-2 opacity-30" />
                  <p className="text-[11px]">No stops added yet</p>
                  <p className="text-[9px] mt-1 opacity-60">Click on the map or search above</p>
                </div>
              )}
              {stops.map((stop, i) => (
                <div key={stop.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/30 bg-card hover:border-border/60 transition-colors group">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: ["#f59e0b", "#22c55e", "#8b5cf6", "#3b82f6", "#ef4444", "#06b6d4"][i % 6] }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {stop.country_code && (
                        <img src={getFlagUrl(stop.country_code) || "/placeholder.svg"} alt="" className="w-3.5 h-2.5 rounded-sm object-cover" crossOrigin="anonymous" />
                      )}
                      <span className="text-[11px] font-medium text-foreground truncate">{stop.label}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground truncate">{stop.city}{stop.country ? `, ${stop.country}` : ""}</p>
                  </div>
                  <button onClick={() => removeStop(i)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Vehicle Profile */}
            <div className="px-2.5 pb-2.5">
              <div className="p-2.5 rounded-lg border border-border/30 bg-muted/20 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Truck className="h-3 w-3 text-primary" />
                  <span className="text-[10px] font-semibold text-foreground">Vehicle Profile</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-0.5">
                    <Label className="text-[8px] text-muted-foreground uppercase">Emission</Label>
                    <Select value={vehicleProfile.emission_class} onValueChange={v => setVehicleProfile(p => ({ ...p, emission_class: v }))}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {emissionClasses.map(ec => (
                          <SelectItem key={ec.id} value={ec.code}>{ec.name || ec.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[8px] text-muted-foreground uppercase">Axles</Label>
                    <Select value={vehicleProfile.axle_category} onValueChange={v => setVehicleProfile(p => ({ ...p, axle_category: v }))}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {axleCategories.map(ac => (
                          <SelectItem key={ac.id} value={ac.code}>{ac.name || ac.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[8px] text-muted-foreground uppercase">Weight</Label>
                    <Select value={vehicleProfile.weight_class || "any"} onValueChange={v => setVehicleProfile(p => ({ ...p, weight_class: v === "any" ? "" : v }))}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Any" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {weightClasses.map(wc => (
                          <SelectItem key={wc.id} value={wc.code}>{wc.name || wc.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[8px] text-muted-foreground uppercase">CO2 Class</Label>
                    <Select value={vehicleProfile.co2_class || "any"} onValueChange={v => setVehicleProfile(p => ({ ...p, co2_class: v === "any" ? "" : v }))}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Any" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {co2Classes.map(cc => (
                          <SelectItem key={cc.id} value={cc.code}>{cc.name || cc.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Routing Options */}
            <div className="px-2.5 pb-2.5">
              <div className="p-2.5 rounded-lg border border-border/30 bg-muted/20">
                <RoutingOptions
                  config={routingConfig}
                  onChange={setRoutingConfig}
                />
              </div>
            </div>

            {/* Calculate Button */}
            <div className="px-2.5 pb-2.5">
              <Button
                onClick={calculateTolls}
                disabled={stops.length < 2 || calculating}
                className="w-full h-9 text-[11px] font-semibold gap-1.5"
              >
                {calculating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating tolls...</>
                ) : (
                  <><RouteIcon className="h-3.5 w-3.5" /> Calculate Route Tolls</>
                )}
              </Button>
              {stops.length < 2 && stops.length > 0 && (
                <p className="text-[9px] text-muted-foreground text-center mt-1">Add at least 2 stops to calculate</p>
              )}
            </div>

            {/* Results */}
            {result && (
              <div className="px-2.5 pb-2.5 space-y-2.5">
                {/* Imported route badge */}
                {importedRouteName && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-primary/10 border border-primary/20">
                    <Upload className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-[9px] text-primary font-medium truncate">Imported: {importedRouteName}</span>
                  </div>
                )}
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                    <span className="text-[8px] text-muted-foreground uppercase">Distance</span>
                    <p className="text-sm font-bold text-foreground font-mono">{result.total_distance_km.toLocaleString()} km</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                    <span className="text-[8px] text-muted-foreground uppercase">Duration</span>
                    <p className="text-sm font-bold text-foreground font-mono">{result.total_duration_hours}h {result.total_duration_minutes}m</p>
                  </div>
                </div>

                {/* Grand Total - EUR total + per-currency breakdown */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span className="text-[10px] text-muted-foreground font-medium">Total Toll Cost</span>
                  {(() => {
                    // Group costs by currency
                    const byCurrency: Record<string, { toll: number; vignette: number; special: number }> = {};
                    for (const seg of result.country_segments) {
                      const cur = seg.currency || "EUR";
                      if (!byCurrency[cur]) byCurrency[cur] = { toll: 0, vignette: 0, special: 0 };
                      byCurrency[cur].toll += seg.toll_cost;
                      byCurrency[cur].vignette += seg.vignette_cost;
                      byCurrency[cur].special += seg.special_charges;
                    }
                    // Calculate grand total in EUR
                    let grandTotalEur = 0;
                    for (const [cur, costs] of Object.entries(byCurrency)) {
                      grandTotalEur += toEur(costs.toll + costs.vignette + costs.special, cur);
                    }
                    const hasMultipleCurrencies = Object.keys(byCurrency).length > 1 || !byCurrency["EUR"];
                    return (
                      <>
                        {/* EUR grand total always shown */}
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground">EUR</span>
                          <span className="text-lg font-bold text-primary font-mono">
                            {formatEur(grandTotalEur)}
                          </span>
                        </div>
                        {/* Per-currency breakdown if non-EUR currencies are involved */}
                        {hasMultipleCurrencies && Object.entries(byCurrency).map(([cur, costs]) => {
                          const total = costs.toll + costs.vignette + costs.special;
                          const totalEur = toEur(total, cur);
                          return (
                            <div key={cur} className="mt-1.5 pt-1.5 border-t border-border/20">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] text-muted-foreground">{cur}</span>
                                <div className="text-right">
                                  <span className="text-sm font-semibold text-foreground font-mono">
                                    {formatCost(total, cur)}
                                  </span>
                                  {cur !== "EUR" && (
                                    <span className="text-[8px] text-muted-foreground ml-1.5">
                                      ({formatEur(totalEur)})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-[8px] text-muted-foreground">
                                <span>Distance: {formatCost(costs.toll, cur)}</span>
                                {costs.vignette > 0 && <span>Vignette: {formatCost(costs.vignette, cur)}</span>}
                                {costs.special > 0 && <span>Special: {formatCost(costs.special, cur)}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>

                {/* Country Breakdown */}
                <div>
                  <button
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-foreground mb-1.5 w-full"
                  >
                    {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Country Breakdown ({result.country_segments.length})
                  </button>
                  {showBreakdown && (
                    <div className="space-y-1">
                      {result.country_segments.map(seg => (
                        <div key={seg.country_code} className="p-2 rounded-lg border border-border/30 bg-card">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <img src={getFlagUrl(seg.country_code) || "/placeholder.svg"} alt="" className="w-4 h-3 rounded-sm object-cover" crossOrigin="anonymous" />
                              <span className="text-[11px] font-medium text-foreground">{seg.country_name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] font-bold font-mono text-foreground">
                                {formatCost(seg.toll_cost + seg.vignette_cost + seg.special_charges, seg.currency)}
                              </span>
                              {seg.currency !== "EUR" && (
                                <span className="text-[9px] text-muted-foreground ml-1">
                                  ({formatEur(toEur(seg.toll_cost + seg.vignette_cost + seg.special_charges, seg.currency))})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                            <span>{seg.distance_km} km</span>
                            {seg.rate_per_km > 0 && (
                              <Badge variant="outline" className="text-[7px] h-3.5 px-1 border-emerald-500/30 text-emerald-400">
                                {formatRate(seg.rate_per_km, seg.currency)}
                              </Badge>
                            )}
                            {seg.vignette_cost > 0 && (
                              <Badge variant="outline" className="text-[7px] h-3.5 px-1 border-blue-500/30 text-blue-400">
                                Vignette {formatCost(seg.vignette_cost, seg.currency)}
                              </Badge>
                            )}
                            {!seg.has_toll && (
                              <Badge variant="outline" className="text-[7px] h-3.5 px-1 border-muted-foreground/30 text-muted-foreground">
                                No toll
                              </Badge>
                            )}
                          </div>
                          {seg.has_toll && seg.toll_cost > 0 && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[8px] text-muted-foreground/70">
                              {seg.breakdown.infrastructure > 0 && <span>Infra: {formatCost(seg.breakdown.infrastructure, seg.currency)}</span>}
                              {seg.breakdown.air_pollution > 0 && <span>Air/Noise: {formatCost(seg.breakdown.air_pollution, seg.currency)}</span>}
                              {seg.breakdown.noise > 0 && <span>Intermunicipal: {formatCost(seg.breakdown.noise, seg.currency)}</span>}
                              {seg.breakdown.co2_surcharge > 0 && <span>CO2: {formatCost(seg.breakdown.co2_surcharge, seg.currency)}</span>}
                            </div>
                          )}
                          {/* Calculation log toggle */}
                          {seg.calc_log && seg.calc_log.length > 0 && (
                            <div className="mt-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = new Set(expandedLogs);
                                  if (next.has(seg.country_code)) next.delete(seg.country_code);
                                  else next.add(seg.country_code);
                                  setExpandedLogs(next);
                                }}
                                className="flex items-center gap-1 text-[8px] text-muted-foreground/60 hover:text-primary transition-colors"
                              >
                                <FileText className="h-2.5 w-2.5" />
                                <span>{expandedLogs.has(seg.country_code) ? "Hide" : "Show"} calculation log</span>
                              </button>
                              {expandedLogs.has(seg.country_code) && (
                                <pre className="mt-1 p-2 rounded bg-muted/30 border border-border/20 text-[7px] leading-[1.6] text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
                                  {seg.calc_log.join("\n")}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                  <Info className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[8px] text-amber-500/80 leading-relaxed">
                    Toll costs are calculated using internal rate tables. Actual costs may vary based on payment method, time of day, and specific toll segments. Rates last updated from official sources.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="absolute inset-0" />
          {/* Map overlay hint */}
          {stops.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <div className="px-4 py-2 rounded-full bg-card/90 border border-border/50 shadow-lg">
                <p className="text-[11px] text-muted-foreground">Click anywhere on the map to add a stop</p>
              </div>
            </div>
          )}
          {calculating && (
            <div className="absolute inset-0 bg-background/40 backdrop-blur-sm z-[1000] flex items-center justify-center">
              <div className="px-6 py-4 rounded-xl bg-card border border-border/50 shadow-xl flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Calculating route tolls...</p>
                <p className="text-[10px] text-muted-foreground">{calcProgress || "Fetching route from OSRM..."}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
