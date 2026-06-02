"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, Truck, MapPin, Clock, Search,
  Maximize2, Minimize2, RefreshCw, Navigation, Signal, AlertTriangle,
  Package, Route, Calendar, Eye, EyeOff, Zap, ChevronDown, ChevronUp,
  Radio, CircleDot, SatelliteDish, XCircle, ArrowRight, Timer, TrendingUp,
  Crosshair, Sparkles, X, Copy, CheckCircle2, Circle, Edit2, Layers,
  PanelRightClose, PanelRightOpen,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import RouteHistoryPanel from "@/components/tms/route-history-panel";
import {
  TILE_LAYER_ENTRIES,
  TILE_LAYERS,
  applyTileLayer,
  type TileKey,
} from "@/lib/tms/map-tiles";
import { useUserPreference } from "@/hooks/use-user-preference";

// ----- Types -----
interface OrderRow {
  id: string; reference_number: string; status: string; order_type: string;
  customer_name: string; carrier_name: string; carrier_id: string | null;
  estimated_distance_km: number | null; estimated_duration_hours: number | null;
  weight_kg: number | null; pallet_count: number | null;
  customer_price: number | null; customer_currency: string;
  driver_id: string | null; vehicle_id: string | null; trailer_id: string | null;
  route_geometry: [number, number][] | null;
  stops: { id: string; city: string; country: string; stop_type: string; planned_date: string; planned_time_from: string; lat: number | null; lng: number | null; sequence_order: number }[];
}

interface VehicleRow {
  id: string; plate_number: string; make: string; model: string; vehicle_type: string;
  max_pallets: number; max_weight_kg: number; loading_meters: number;
  traccar_device_id: number | null;
}

interface DriverRow {
  id: string; name: string; phone: string; is_online: boolean;
  last_lat: number | null; last_lng: number | null; last_seen_at: string | null;
}

interface TrailerRow { id: string; plate_number: string; trailer_type: string; }

interface FleetGroup { id: string; name: string; color: string; }

interface GanttTrip {
  trip_id: string;
  order_id: string; // primary order (first linked)
  order: OrderRow | null; // primary order data
  order_ids: string[]; // all linked order IDs
  orders: OrderRow[]; // all linked order data
  vehicle_id: string;
  driver_name: string | null;
  swap_type: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  status: string;
  stops: { city: string; country: string; stop_type: string; planned_date: string | null; planned_time_from: string | null; order_ref?: string }[];
}

  interface TraccarPosition {
  deviceId: number; latitude: number; longitude: number; speed: number; course: number;
  totalDistance: number | null; engineHours: number | null; fuel: number | null;
  ignition: boolean | null; lastUpdate: string;
  address: string | null;
  motion: boolean | null;
  battery: number | null;
  power: number | null;
  satellites: number | null;
  driverUniqueId: string | null;
  driverWorkingState: string | null;
  driver2WorkingState: string | null;
  lastParked: string | null;
  }

// ─── Country Flag Helper ──────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  hungary: "HU", germany: "DE", romania: "RO", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", austria: "AT", france: "FR",
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
  "nederland": "NL", "netherland": "NL",
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
function getCountryFlagUrl(country: string): string {
  const code = getCountryCode(country);
  if (!code) return "";
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}
function CountryFlag({ country, className = "w-4 h-3" }: { country: string; className?: string }) {
  const url = getCountryFlagUrl(country);
  if (!url) return null;
  return <img src={url} alt={country} className={`${className} rounded-[2px] object-cover shrink-0`} crossOrigin="anonymous" />;
}

const STATUS_COLORS: Record<string, string> = {
  // v3 unified parent/order statuses
  confirmed_to_customer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  in_execution: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  documents_received: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  // Trip / leg legacy values still used by trips & trip_legs tables
  confirmed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  dispatched: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  accepted: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  in_transit: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  delivered: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  completed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  draft: "bg-zinc-700/30 text-zinc-500 border-zinc-700/40",
};

const ROUTE_COLORS: Record<string, string> = {
  confirmed_to_customer: "#22c55e", in_execution: "#3b82f6", documents_received: "#14b8a6",
  confirmed: "#22c55e", dispatched: "#3b82f6", accepted: "#06b6d4", in_transit: "#f59e0b", delivered: "#14b8a6",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDateRange(startDate: Date, days: number): Date[] {
  const r: Date[] = [];
  for (let i = 0; i < days; i++) { const d = new Date(startDate); d.setDate(d.getDate() + i); r.push(d); }
  return r;
}

function fmt(d: Date): string { return d.toISOString().split("T")[0]; }

function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

// ----- Dispatch Board -----
export default function DispatchBoardPage() {
  const supabase = createClient();
  const [adminSession, setAdminSession] = useState<any>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [fleetGroups, setFleetGroups] = useState<FleetGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // GPS positions from Traccar -- keyed by vehicle DB id (string), not device id
  const [gpsPositions, setGpsPositions] = useState<Map<string, TraccarPosition & { vehicle_plate?: string; driver_name?: string }>>(new Map());
  // Trailer GPS positions from Traccar -- keyed by trailer DB id
  const [trailerGpsPositions, setTrailerGpsPositions] = useState<Map<string, TraccarPosition & { trailer_plate?: string; trailer_type?: string }>>(new Map());

  // ── Persisted user preferences ──────────────────────────────
  // Anything a dispatcher might tweak once and expect to stick on every
  // subsequent visit lives in user_preferences (keyed off the admin's
  // user id) instead of plain useState. localStorage is used as an
  // instant-paint cache so the workspace doesn't flicker on hard refresh.
  // ───────────────────────────────────────────────────────────
  const [viewDays, setViewDays] = useUserPreference<number>("dispatch.viewDays", 7);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d;
  });
  const dateRange = useMemo(() => getDateRange(startDate, viewDays), [startDate, viewDays]);

  // Filters
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useUserPreference<string>("dispatch.statusFilter", "active");
  const [mapExpanded, setMapExpanded] = useUserPreference<boolean>("dispatch.mapExpanded", false);
  const [showMap, setShowMap] = useUserPreference<boolean>("dispatch.showMap", true);
  const [showVehicleGps, setShowVehicleGps] = useUserPreference<boolean>("dispatch.showVehicleGps", true);
  const [showDriverPos, setShowDriverPos] = useUserPreference<boolean>("dispatch.showDriverPos", true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderTrips, setSelectedOrderTrips] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Trip-based Gantt: maps vehicle_id -> trips with stops/orders
  const [vehicleTrips, setVehicleTrips] = useState<Map<string, GanttTrip[]>>(new Map());
  // Set of order_ids that are linked to ANY trip (incl. fully-subcontracted
  // trips with no own-fleet vehicle). Used to keep dispatched orders out of
  // the "Unassigned Orders" bucket — `vehicleTrips` alone misses them
  // because it only contains own-fleet legs.
  const [orderIdsWithTrip, setOrderIdsWithTrip] = useState<Set<string>>(new Set());
  const [fleetStatusFilter, setFleetStatusFilter] = useUserPreference<"all" | "moving" | "idling" | "parked" | "offline">(
    "dispatch.fleetStatusFilter",
    "all"
  );
  const [fleetGroupFilter, setFleetGroupFilter] = useUserPreference<string>("dispatch.fleetGroupFilter", "all");
  // Whole-panel collapse — when true the Fleet Status panel collapses to
  // a small pill on the right edge, freeing the entire map area.
  const [fleetStatusCollapsed, setFleetStatusCollapsed] = useUserPreference<boolean>(
    "dispatch.fleetStatusCollapsed",
    false
  );
  const [alertsPopupOpen, setAlertsPopupOpen] = useState(false);
  const [infoPopupVehicleId, setInfoPopupVehicleId] = useState<string | null>(null);
  const [routeHistoryVehicleId, setRouteHistoryVehicleId] = useState<string | null>(null);
  // Look up the full GanttTrip when a trip bar is clicked
  const selectedGanttTrip = useMemo(() => {
    if (!selectedTripId) return null;
    for (const trips of vehicleTrips.values()) {
      const found = trips.find(t => t.trip_id === selectedTripId);
      if (found) return found;
    }
    return null;
  }, [selectedTripId, vehicleTrips]);

  // Track whether the user has manually interacted with the map after selecting an order
  const lastFitOrderIdRef = useRef<string | null>(null);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const trailerMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Active base-tile layer (Dark / OSM / Google Roads / Sat / Hybrid / Terrain).
  // Stored per-user in user_preferences so dispatchers see the same map style
  // on every device. localStorage acts as an instant-paint cache.
  const [activeTile, setActiveTile] = useUserPreference<TileKey>("map.tile.dispatch", "dark");
  const [tileMenuOpen, setTileMenuOpen] = useState(false);
  // Section toggles for the Fleet Status panel
  const [showTrailersList, setShowTrailersList] = useState(true);
  const [showDriversList, setShowDriversList] = useState(true);

  // Auth
  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (stored) setAdminSession(JSON.parse(stored));
  }, []);

  // Fetch main data
  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const s = createClient();
    // Map filter buckets to v3 unified order statuses (orders_status_check).
    // Legacy "confirmed"/"dispatched"/"accepted"/"in_transit"/"delivered" no
    // longer exist on the parent — they're now confirmed_to_customer /
    // in_execution / documents_received / completed. Trip & leg rows still
    // use their own legacy values, that's fine.
    const statusIn = statusFilter === "active"
      ? ["confirmed_to_customer", "in_execution", "documents_received"]
      : statusFilter === "all"
        ? ["draft", "customer_confirmation_required", "confirmed_to_customer", "in_execution", "documents_received", "ready_for_invoicing", "documents_and_invoice_sent", "completed", "cancelled", "on_hold"]
        : [statusFilter];

    const [ordersRes, vehiclesRes, driversRes, trailersRes, fleetGroupsRes] = await Promise.all([
      s.from("orders").select(`
        id, reference_number, status, order_type, carrier_id,
        customer_price, customer_currency, estimated_distance_km, estimated_duration_hours,
        weight_kg, pallet_count, driver_id, vehicle_id, trailer_id, route_geometry,
        customer:customer_id(name), carrier:carrier_id(name),
        order_stops(id, city, country, stop_type, planned_date, planned_time_from, lat, lng, sequence_order)
      `).eq("admin_id", adminSession.id).eq("is_draft", false).in("status", statusIn)
        .order("created_at", { ascending: false }).limit(200),
      s.from("vehicles").select("id, plate_number, make, model, vehicle_type, max_pallets, max_weight_kg, loading_meters, traccar_device_id, fleet_group_id")
        .eq("admin_id", adminSession.id).eq("is_active", true).order("plate_number"),
      s.from("drivers").select("id, name, phone, is_online, last_lat, last_lng, last_seen_at, fleet_group_id")
        .eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
      s.from("trailers").select("id, plate_number, trailer_type, fleet_group_id")
        .eq("admin_id", adminSession.id).eq("is_active", true).order("plate_number"),
      s.from("fleet_groups").select("id, name, color")
        .eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
    ]);

    const mapped = (ordersRes.data || []).map((o: any) => ({
      ...o,
      customer_name: o.customer?.name || "-",
      carrier_name: o.carrier?.name || "-",
      stops: (o.order_stops || []).sort((a: any, b: any) => (a.sequence_order || 0) - (b.sequence_order || 0)),
    }));
    setOrders(mapped);
    setVehicles(vehiclesRes.data || []);
    setDrivers(driversRes.data || []);
    setTrailers(trailersRes.data || []);
    setFleetGroups(fleetGroupsRes.data || []);
    setLoading(false);

    // Load ALL trips with stops for Gantt (trip-based view).
    // We fetch trip links for EVERY visible order — not just ones with
    // vehicle_id — so that subcontracted orders (where the assignment lives
    // on a trip-leg with assignment_type=subcontract) are recognised as
    // "on a trip" and excluded from the Unassigned bucket below.
    const allOrderIds = mapped.map((o: any) => o.id);
    if (allOrderIds.length > 0) {
      const { data: allTripLinks } = await s.from("trip_orders").select("trip_id, order_id").in("order_id", allOrderIds);
      if (allTripLinks?.length) {
        const tripIds = [...new Set(allTripLinks.map((tl: any) => tl.trip_id))];
        const { data: allTrips } = await s.from("trips").select(`
          id, vehicle_id, driver_id, swap_type, distance_km, duration_minutes, status, assignment_type,
          trip_stops(city, country, sequence_order, stop_type, planned_date, planned_time_from, order_id, lat, lng),
          trip_legs(id, leg_number, assignment_type, from_stop_index, to_stop_index, vehicle_id, driver_id, carrier_id, status)
        `).in("id", tripIds);
        if (allTrips?.length) {
          // Build trip -> order_ids[] map (one trip can have multiple orders)
          const tripToOrders = new Map<string, string[]>();
          allTripLinks.forEach((tl: any) => {
            const arr = tripToOrders.get(tl.trip_id) || [];
            if (!arr.includes(tl.order_id)) arr.push(tl.order_id);
            tripToOrders.set(tl.trip_id, arr);
          });
          // Build order_id -> ref map for display
          const orderRefMap = new Map<string, string>();
          mapped.forEach((o: any) => orderRefMap.set(o.id, o.reference_number));

          const vtMap = new Map<string, GanttTrip[]>();
          // Track orders whose trip carries a REAL resource (own-fleet
          // vehicle/driver on the trip or any leg, or a subcontract carrier).
          // A hollow auto-created trip with no resources anywhere must NOT
          // exclude its order from the "Unassigned" bucket — otherwise the
          // order disappears from the board entirely (no vehicle row + not
          // unassigned).
          const orderIdsWithResolvedTrip = new Set<string>();
          allTrips.forEach((trip: any) => {
            const orderIds = tripToOrders.get(trip.id) || [];
            const legsRaw = trip.trip_legs || [];
            const tripHasResource =
              !!trip.vehicle_id ||
              !!trip.driver_id ||
              legsRaw.some((l: any) => l.vehicle_id || l.driver_id || l.carrier_id);
            if (tripHasResource) {
              orderIds.forEach((oid: string) => orderIdsWithResolvedTrip.add(oid));
            }
            const orders = orderIds.map(oid => mapped.find((o: any) => o.id === oid)).filter(Boolean) as OrderRow[];
            const primaryOrder = orders[0] || null;
            const allStops = (trip.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);
            const legs = (trip.trip_legs || []).sort((a: any, b: any) => a.leg_number - b.leg_number);
            
            // If trip has legs with vehicle assignments, create separate GanttTrip per leg
            if (legs.length > 0) {
              legs.forEach((leg: any) => {
                // Skip forwarding/subcontract legs - they go to carriers, not our fleet vehicles
                if (leg.assignment_type === "forwarding" || leg.assignment_type === "subcontract" || leg.carrier_id) {
                  return;
                }
                // Only use the leg's own vehicle_id for own_fleet legs
                const legVehicleId = leg.vehicle_id;
                if (!legVehicleId) return; // Skip legs without vehicle assignment
                
                // Filter stops to only include those within this leg's boundaries
                const legStops = allStops.filter((s: any, idx: number) => 
                  idx >= leg.from_stop_index && idx <= leg.to_stop_index
                );
                
                const driver = driversRes.data?.find((d: any) => d.id === (leg.driver_id || trip.driver_id));
                const entry: GanttTrip = {
                  trip_id: trip.id,
                  order_id: orderIds[0] || "",
                  order: primaryOrder,
                  order_ids: orderIds,
                  orders,
                  vehicle_id: legVehicleId,
                  driver_name: driver?.name || null,
                  swap_type: trip.swap_type,
                  distance_km: trip.distance_km, // TODO: could calculate per-leg distance
                  duration_minutes: trip.duration_minutes,
                  status: leg.status || trip.status || "planned",
                  stops: legStops.map((s: any) => ({
                    city: s.city || "?",
                    country: s.country || "",
                    stop_type: s.stop_type || "",
                    planned_date: s.planned_date || null,
                    planned_time_from: s.planned_time_from || null,
                    order_ref: s.order_id ? (orderRefMap.get(s.order_id) || undefined) : undefined,
                  })),
                };
                const arr = vtMap.get(legVehicleId) || [];
                arr.push(entry);
                vtMap.set(legVehicleId, arr);
              });
            } else {
              // Fallback: no legs defined, use trip-level vehicle_id
              if (!trip.vehicle_id) return;
              const driver = driversRes.data?.find((d: any) => d.id === trip.driver_id);
              const entry: GanttTrip = {
                trip_id: trip.id,
                order_id: orderIds[0] || "",
                order: primaryOrder,
                order_ids: orderIds,
                orders,
                vehicle_id: trip.vehicle_id,
                driver_name: driver?.name || null,
                swap_type: trip.swap_type,
                distance_km: trip.distance_km,
                duration_minutes: trip.duration_minutes,
                status: trip.status || "planned",
                stops: allStops.map((s: any) => ({
                  city: s.city || "?",
                  country: s.country || "",
                  stop_type: s.stop_type || "",
                  planned_date: s.planned_date || null,
                  planned_time_from: s.planned_time_from || null,
                  order_ref: s.order_id ? (orderRefMap.get(s.order_id) || undefined) : undefined,
                })),
              };
              const arr = vtMap.get(trip.vehicle_id) || [];
              arr.push(entry);
              vtMap.set(trip.vehicle_id, arr);
            }
          });
          setVehicleTrips(vtMap);
          setOrderIdsWithTrip(orderIdsWithResolvedTrip);
        } else {
          // No trips at all — clear stale entries so reloads don't keep
          // marking orders as "has trip" after their trips were deleted.
          setVehicleTrips(new Map());
          setOrderIdsWithTrip(new Set());
        }
      } else {
        setVehicleTrips(new Map());
        setOrderIdsWithTrip(new Set());
      }
    } else {
      setVehicleTrips(new Map());
      setOrderIdsWithTrip(new Set());
    }
  }, [adminSession?.id, statusFilter]);

  useEffect(() => {
    fetchData().then(() => fetchGpsRef.current?.());
  }, [fetchData]);

  // ── ETA calculation using polyline (no API calls) ──
  const calcEtaFromPolyline = useCallback((
    vehiclePos: { lat: number; lng: number; speed: number } | null,
    driverPos: { lat: number; lng: number } | null,
    tripStops: any[]
  ) => {
    // Find the next pending/en_route stop
    const nextIdx = tripStops.findIndex((ts: any) => ts.status === "pending" || ts.status === "en_route");
    if (nextIdx < 0) return null;
    const nextStop = tripStops[nextIdx];

    // Get current position: prefer vehicle GPS, fall back to driver
    const pos = vehiclePos ? { lat: vehiclePos.lat, lng: vehiclePos.lng } : driverPos;
    if (!pos || !nextStop.lat || !nextStop.lng) return null;

    // Haversine distance (km)
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // If we have route_to_geometry for the next stop, use polyline for more accurate distance
    let remainingKm = 0;
    const geom = nextStop.route_to_geometry;
    if (geom && Array.isArray(geom) && geom.length > 1) {
      // Find closest point on polyline to current position
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < geom.length; i++) {
        const d = haversine(pos.lat, pos.lng, geom[i][0], geom[i][1]);
        if (d < minDist) { minDist = d; closestIdx = i; }
      }
      // Sum remaining polyline distance from closest point to end
      for (let i = closestIdx; i < geom.length - 1; i++) {
        remainingKm += haversine(geom[i][0], geom[i][1], geom[i + 1][0], geom[i + 1][1]);
      }
    } else {
      // Fallback: straight-line distance
      remainingKm = haversine(pos.lat, pos.lng, nextStop.lat, nextStop.lng);
    }

    // Speed: use vehicle speed if moving, else assume 65 km/h
    const speedKmh = vehiclePos && vehiclePos.speed > 5 ? vehiclePos.speed : 65;
    const etaMinutes = Math.round((remainingKm / speedKmh) * 60);
    return { stopId: nextStop.id, stopCity: nextStop.city || nextStop.company_name, remainingKm: Math.round(remainingKm), etaMinutes, source: vehiclePos ? "gps" : "driver" };
  }, []);

  // Fetch trips + trip_stops for the selected order (execution layer)
  const fetchSelectedOrderTrips = useCallback(async () => {
    if (!selectedOrderId || !supabase) { setSelectedOrderTrips([]); return; }
    const { data: tripLinks } = await supabase
      .from("trip_orders").select("trip_id").eq("order_id", selectedOrderId);
    if (!tripLinks?.length) { setSelectedOrderTrips([]); return; }
    const tripIds = tripLinks.map((tl: any) => tl.trip_id);
    const { data: trips } = await supabase
.from("trips").select(`
        id, status, assignment_type, distance_km, duration_minutes, route_geometry,
        driver:driver_id(name), vehicle:vehicle_id(plate_number),
        trip_stops(id, sequence_order, stop_type, company_name, city, country, address, lat, lng,
                   planned_date, planned_time_from, planned_time_to, status, order_id,
                   actual_arrival, actual_departure, distance_to_km, duration_to_minutes, notes,
                   route_to_geometry,
                   action_type:action_type_id(code, name, icon, color),
                   order:order_id(reference_number)),
        trip_legs(id, leg_number, assignment_type, from_stop_index, to_stop_index,
                  driver_id, vehicle_id, trailer_id, carrier_id, status,
                  driver:driver_id(name), vehicle:vehicle_id(plate_number))
      `).in("id", tripIds).order("created_at", { ascending: true });
    // Fetch forwarding orders linked to these trips via trip_orders
    const { data: allTripOrders } = await supabase
      .from("trip_orders")
      .select("trip_id, order:order_id(id, reference_number, order_type)")
      .in("trip_id", tripIds);
    
    // Build map of trip_id -> forwarding orders
    const tripFwdOrdersMap = new Map<string, { id: string; reference_number: string }[]>();
    (allTripOrders || []).forEach((to: any) => {
      if (to.order?.order_type === "forwarding") {
        const arr = tripFwdOrdersMap.get(to.trip_id) || [];
        arr.push({ id: to.order.id, reference_number: to.order.reference_number });
        tripFwdOrdersMap.set(to.trip_id, arr);
      }
    });
    
    const mapped = (trips || []).map((t: any) => ({
      ...t,
      driver_name: t.driver?.name || null,
      vehicle_plate: t.vehicle?.plate_number || null,
      trip_stops: (t.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
      trip_legs: (t.trip_legs || []).sort((a: any, b: any) => a.leg_number - b.leg_number).map((leg: any) => ({
        ...leg,
        driver_name: leg.driver?.name || null,
        vehicle_plate: leg.vehicle?.plate_number || null,
      })),
      forwarding_orders: tripFwdOrdersMap.get(t.id) || [],
    }));
    setSelectedOrderTrips(mapped);
  }, [selectedOrderId, supabase]);

  useEffect(() => { fetchSelectedOrderTrips(); }, [fetchSelectedOrderTrips]);

  // Fetch Traccar GPS positions using the working /api/traccar/positions endpoint
  const fetchGps = useCallback(async () => {
    if (!adminSession?.id) return;
    try {
      const res = await fetch(`/api/traccar/positions?adminId=${adminSession.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.vehicles && Array.isArray(data.vehicles)) {
        const map = new Map<string, TraccarPosition & { vehicle_plate?: string; driver_name?: string }>();
        data.vehicles.forEach((v: any) => {
          // Key by vehicle DB id (vehicle_id field from the API)
          map.set(v.vehicle_id || v.id, {
            deviceId: v.deviceId || 0,
            latitude: v.latitude,
            longitude: v.longitude,
            speed: v.speed || 0,
            course: v.course || 0,
            totalDistance: v.totalDistance || null,
            engineHours: v.engineHours || null,
            fuel: v.fuel ?? null,
            ignition: v.ignition ?? null,
            lastUpdate: v.last_update || v.lastUpdate || "",
            address: v.address || null,
            motion: v.motion ?? null,
            battery: v.battery ?? null,
            power: v.power ?? null,
            satellites: v.satellites ?? null,
            driverUniqueId: v.driverUniqueId || null,
            driverWorkingState: v.driverWorkingState || null,
            driver2WorkingState: v.driver2WorkingState || null,
            lastParked: v.lastParked || null,
            vehicle_plate: v.vehicle_plate,
            driver_name: v.driver_name,
          });
        });
        setGpsPositions(map);
      }
      // Handle trailers GPS positions
      if (data.trailers && Array.isArray(data.trailers)) {
        const trailerMap = new Map<string, TraccarPosition & { trailer_plate?: string; trailer_type?: string }>();
        data.trailers.forEach((t: any) => {
          trailerMap.set(t.trailer_id || t.id, {
            deviceId: t.deviceId || 0,
            latitude: t.latitude,
            longitude: t.longitude,
            speed: t.speed || 0,
            course: t.course || 0,
            totalDistance: t.totalDistance || null,
            engineHours: null,
            fuel: null,
            ignition: t.ignition ?? null,
            lastUpdate: t.last_update || t.lastUpdate || "",
            address: t.address || null,
            motion: t.motion ?? null,
            battery: t.battery ?? null,
            power: t.power ?? null,
            satellites: t.satellites ?? null,
            driverUniqueId: null,
            driverWorkingState: null,
            driver2WorkingState: null,
            lastParked: null,
            trailer_plate: t.trailer_plate,
            trailer_type: t.trailer_type,
          });
        });
        setTrailerGpsPositions(trailerMap);
      }
    } catch { /* traccar not configured */ }
  }, [adminSession?.id]);

  const fetchGpsRef = useRef(fetchGps);
  fetchGpsRef.current = fetchGps;
  useEffect(() => { fetchGps(); }, [fetchGps]);

  // WebSocket live tracking via SSE proxy -- falls back to polling
  // IMPORTANT: Uses exponential backoff to avoid hammering Traccar when it's down
  const wsRef = useRef<EventSource | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (!adminSession?.id) return;

    let retryTimeout: ReturnType<typeof setTimeout>;
    let eventSource: EventSource | null = null;
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
      eventSource = new EventSource(`/api/traccar/ws?adminId=${adminSession.id}`);
      wsRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "ws_open") {
            setWsConnected(true);
            retryCount = 0; // Reset backoff on successful connection
          }
          if (msg.type === "ws_closed" || msg.type === "ws_error") {
            setWsConnected(false);
            eventSource?.close(); // Prevent browser auto-reconnect
            if (!destroyed) {
              const delay = getRetryDelay();
              retryTimeout = setTimeout(connect, delay);
            }
          }
          if (msg.type === "positions" && msg.positions) {
            setGpsPositions(prev => {
              const next = new Map(prev);
              msg.positions.forEach((p: any) => {
                if (!p.vehicleId) return;
                const existing = prev.get(p.vehicleId);
                next.set(p.vehicleId, {
                  deviceId: p.deviceId,
                  latitude: p.latitude,
                  longitude: p.longitude,
                  speed: p.speed || 0,
                  course: p.course || 0,
                  totalDistance: p.totalDistance ?? null,
                  engineHours: p.engineHours ?? null,
                  fuel: p.fuel ?? null,
                  ignition: p.ignition ?? null,
                  lastUpdate: p.lastUpdate || "",
                  address: p.address || null,
                  motion: p.motion ?? null,
                  battery: p.battery ?? null,
                  power: p.power ?? null,
                  satellites: p.satellites ?? null,
                  driverUniqueId: p.driverUniqueId || null,
                  driverWorkingState: p.driverWorkingState || null,
                  driver2WorkingState: p.driver2WorkingState || null,
                  lastParked: p.lastParked || null,
                  vehicle_plate: p.vehiclePlate || existing?.vehicle_plate,
                  driver_name: existing?.driver_name,
                });
              });
              return next;
            });
          }
        } catch { /* parse error */ }
      };

      eventSource.onerror = () => {
        setWsConnected(false);
        eventSource?.close(); // MUST close to prevent browser auto-reconnect doubling
        if (!destroyed) {
          const delay = getRetryDelay();
          retryTimeout = setTimeout(connect, delay);
        }
      };
    };

    // Delay initial WS connection by 2s to let the initial fetchGps settle first
    // This avoids hitting Traccar with 3 simultaneous requests on page load
    retryTimeout = setTimeout(connect, 2000);

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      eventSource?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [adminSession?.id]);

  // No polling -- all live data comes via WebSocket SSE only

  // Realtime
  useEffect(() => {
    if (!adminSession?.id) return;
    const s = createClient();
    const ch = s.channel("dispatch-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchData())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers" }, (payload) => {
        setDrivers(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        fetchData();
        fetchSelectedOrderTrips();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_stops" }, () => {
        fetchSelectedOrderTrips();
      })
      .subscribe();
    return () => { s.removeChannel(ch); };
  }, [adminSession?.id, fetchData, fetchSelectedOrderTrips]);

  // Driver "last seen" refresh
  useEffect(() => {
    const iv = setInterval(() => setDrivers(prev => [...prev]), 30000);
    return () => clearInterval(iv);
  }, []);

  // Map initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([48.5, 11.5], 5);
    tileLayerRef.current = applyTileLayer(map, activeTile);
    L.control.zoom({ position: "topright" }).addTo(map);
    routeLayersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Click on empty map area to stop following and close info popup
    map.on("click", () => { setSelectedVehicleId(null); setInfoPopupVehicleId(null); setTileMenuOpen(false); });
    return () => { map.remove(); mapRef.current = null; tileLayerRef.current = null; };
    // Init runs once — activeTile changes are handled by the swap effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap base tiles when the user picks a different layer.
  // Persistence is handled by useUserPreference (writes both localStorage
  // cache and user_preferences row), so this effect only needs to apply.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileLayerRef.current = applyTileLayer(map, activeTile, tileLayerRef.current);
  }, [activeTile]);

  useEffect(() => { setTimeout(() => mapRef.current?.invalidateSize(), 300); }, [mapExpanded, showMap]);

  // Update map layers
  useEffect(() => {
    const map = mapRef.current;
    const routeGroup = routeLayersRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    // Draw routes: ONLY when an order is selected (clicking on Gantt block or fleet status)
    // This keeps the map clean for the dispatcher instead of drawing all routes at once
    const visibleOrders = selectedOrderId
      ? orders.filter(o => o.id === selectedOrderId)
      : [];

    visibleOrders.forEach(order => {
      // Prefer trip data (execution layer) over order data (commercial layer)
      const trips = selectedOrderTrips.length > 0 ? selectedOrderTrips : [];
      const hasTripRoutes = trips.some((t: any) => t.route_geometry && Array.isArray(t.route_geometry) && t.route_geometry.length > 1);

      // Find if selected vehicle has a specific leg assignment
      const selectedVehicleLeg = selectedVehicleId
        ? trips.flatMap((t: any) => (t.trip_legs || []).map((leg: any) => ({ ...leg, tripStops: t.trip_stops })))
            .find((leg: any) => leg.vehicle_id === selectedVehicleId)
        : null;

      // Helper to filter stops by leg boundaries
      const filterStopsByLeg = (stops: any[], leg: any) => {
        if (!leg || leg.from_stop_index == null || leg.to_stop_index == null) return stops;
        return stops.filter((s: any, idx: number) => idx >= leg.from_stop_index && idx <= leg.to_stop_index);
      };

      if (hasTripRoutes) {
        // Draw each trip's route - filter by leg if vehicle selected
        const TRIP_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];
        trips.forEach((trip: any, ti: number) => {
          if (!trip.route_geometry || !Array.isArray(trip.route_geometry) || trip.route_geometry.length < 2) return;
          const tripColor = TRIP_COLORS[ti % TRIP_COLORS.length];
          
          // If vehicle selected with leg, only draw that leg's portion
          if (selectedVehicleLeg && trip.trip_legs?.some((l: any) => l.vehicle_id === selectedVehicleId)) {
            const leg = trip.trip_legs.find((l: any) => l.vehicle_id === selectedVehicleId);
            if (leg) {
              // Get stops for this leg to find geometry slice points
              const legStops = filterStopsByLeg(trip.trip_stops || [], leg).filter((s: any) => s.lat && s.lng);
              if (legStops.length >= 2) {
                // Draw dashed line for the leg portion (since we don't have leg-specific geometry stored)
                const legCoords = legStops.map((s: any) => [s.lat, s.lng] as [number, number]);
                L.polyline(legCoords, { color: tripColor, weight: 4, opacity: 0.9, smoothFactor: 1 }).addTo(routeGroup);
              }
            }
          } else {
            L.polyline(trip.route_geometry, { color: tripColor, weight: 3, opacity: 0.8, smoothFactor: 1 }).addTo(routeGroup);
          }
        });
        // Draw trip_stop markers from the execution layer - filtered by leg if vehicle selected
        trips.forEach((trip: any) => {
          const stopsToShow = selectedVehicleLeg && trip.trip_legs?.some((l: any) => l.vehicle_id === selectedVehicleId)
            ? filterStopsByLeg(trip.trip_stops || [], trip.trip_legs.find((l: any) => l.vehicle_id === selectedVehicleId))
            : (trip.trip_stops || []);
          
          stopsToShow.forEach((ts: any, i: number) => {
            if (!ts.lat || !ts.lng) return;
            const isFirst = i === 0, isLast = i === stopsToShow.length - 1;
            L.circleMarker([ts.lat, ts.lng], {
              radius: isFirst || isLast ? 6 : 4,
              fillColor: isFirst ? "#22c55e" : isLast ? "#ef4444" : "#64748b",
              color: "rgba(255,255,255,0.5)", weight: 1, fillOpacity: 0.9,
            }).bindTooltip(`<div style="display:flex;align-items:center;gap:4px">${getCountryFlagUrl(ts.country) ? `<img src="${getCountryFlagUrl(ts.country)}" style="width:16px;height:12px;border-radius:2px;object-fit:cover" crossorigin="anonymous"/>` : ""}<strong>${ts.city || ts.company_name}</strong></div><div style="font-size:10px;opacity:0.7">${ts.stop_type} · ${ts.status}</div>`, { direction: "top" }).addTo(routeGroup);
          });
        });
      } else if (trips.length > 0) {
        // Trips exist but route_geometry is NULL: draw dashed lines between trip_stop coords as fallback
        trips.forEach((trip: any) => {
          const stopsToShow = selectedVehicleLeg && trip.trip_legs?.some((l: any) => l.vehicle_id === selectedVehicleId)
            ? filterStopsByLeg(trip.trip_stops || [], trip.trip_legs.find((l: any) => l.vehicle_id === selectedVehicleId))
            : (trip.trip_stops || []);
          
          const coords = stopsToShow.filter((ts: any) => ts.lat && ts.lng).map((ts: any) => [ts.lat, ts.lng] as [number, number]);
          if (coords.length >= 2) {
            L.polyline(coords, { color: "#22c55e", weight: 2, opacity: 0.6, dashArray: "8 4" }).addTo(routeGroup);
          }
          stopsToShow.forEach((ts: any, i: number) => {
            if (!ts.lat || !ts.lng) return;
            const isFirst = i === 0, isLast = i === stopsToShow.length - 1;
            L.circleMarker([ts.lat, ts.lng], {
              radius: isFirst || isLast ? 6 : 4,
              fillColor: isFirst ? "#22c55e" : isLast ? "#ef4444" : "#64748b",
              color: "rgba(255,255,255,0.5)", weight: 1, fillOpacity: 0.9,
            }).bindTooltip(`<div style="display:flex;align-items:center;gap:4px">${getCountryFlagUrl(ts.country) ? `<img src="${getCountryFlagUrl(ts.country)}" style="width:16px;height:12px;border-radius:2px;object-fit:cover" crossorigin="anonymous"/>` : ""}<strong>${ts.city || ts.company_name}</strong></div><div style="font-size:10px;opacity:0.7">${ts.stop_type} · ${ts.status}</div>`, { direction: "top" }).addTo(routeGroup);
          });
        });
      } else {
        // Fallback: use order route_geometry (for orders without trips yet)
        if (!order.route_geometry || order.route_geometry.length < 2) return;
        const color = ROUTE_COLORS[order.status] || "#64748b";
        L.polyline(order.route_geometry, { color, weight: 3, opacity: 0.7, smoothFactor: 1 }).addTo(routeGroup);
        order.stops.forEach((s: any, i: number) => {
          if (!s.lat || !s.lng) return;
          const isFirst = i === 0, isLast = i === order.stops.length - 1;
          L.circleMarker([s.lat, s.lng], {
            radius: isFirst || isLast ? 6 : 4,
            fillColor: isFirst ? "#22c55e" : isLast ? "#ef4444" : "#64748b",
            color: "rgba(255,255,255,0.5)", weight: 1, fillOpacity: 0.9,
          }).bindTooltip(`<div style="display:flex;align-items:center;gap:4px">${getCountryFlagUrl(s.country) ? `<img src="${getCountryFlagUrl(s.country)}" style="width:16px;height:12px;border-radius:2px;object-fit:cover" crossorigin="anonymous"/>` : ""}<strong>${s.city}</strong></div><div style="font-size:10px;opacity:0.7">${order.reference_number}</div>`, { direction: "top" }).addTo(routeGroup);
        });
      }
    });

    // Vehicle GPS markers (from Traccar)
    const currentVehicleIds = new Set<string>();

    if (showVehicleGps) {
  vehicles.forEach(v => {
  const pos = gpsPositions.get(v.id);
  if (!pos || !pos.latitude || !pos.longitude) return;
        currentVehicleIds.add(v.id);
        const assignedOrder = orders.find(o => o.vehicle_id === v.id && ["dispatched", "in_transit"].includes(o.status));
        const isMoving = pos.speed > 2;
        const isIdling = !isMoving && pos.ignition === true;
        const existing = vehicleMarkersRef.current.get(v.id);
        const latLng: L.LatLngExpression = [pos.latitude, pos.longitude];

        // Colors: Moving=Green, Idling=Amber, Parked=Blue
        const color = isMoving ? "#22c55e" : isIdling ? "#f59e0b" : "#3b82f6";

        const iconHtml = isMoving
          ? `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${v.plate_number}</div>
              <svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${pos.course || 0}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))">
                <path d="M12 1 L20 21 L12 16 L4 21 Z" fill="${color}"/>
              </svg>
            </div>`
          : `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${v.plate_number}</div>
              <div style="width:20px;height:20px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.5)">
                <span style="color:white;font-weight:800;font-size:11px;line-height:1">P</span>
              </div>
            </div>`;
        const iconSize: L.PointExpression = [60, 44];
        const iconAnchor: L.PointExpression = [30, 44];

        if (existing) {
          existing.setLatLng(latLng);
          existing.setIcon(L.divIcon({ className: "", iconSize, iconAnchor, html: iconHtml }));
        } else {
          const marker = L.marker(latLng, {
            icon: L.divIcon({ className: "", iconSize, iconAnchor, html: iconHtml }),
            zIndexOffset: 1100,
          });
          // On click: follow vehicle + auto-expand info in Fleet Status (no map popup)
          marker.on("click", () => {
            setSelectedVehicleId(v.id);
            setInfoPopupVehicleId(v.id);
            setSelectedOrderId(null);
          });
          marker.addTo(map);
          vehicleMarkersRef.current.set(v.id, marker);
        }
      });
    }
    vehicleMarkersRef.current.forEach((marker, id) => {
      if (!currentVehicleIds.has(id)) { map.removeLayer(marker); vehicleMarkersRef.current.delete(id); }
    });

    // Driver markers (from app GPS)
    const currentDriverIds = new Set<string>();
    if (showDriverPos) {
      drivers.filter(d => d.last_lat && d.last_lng && d.is_online).forEach(d => {
        currentDriverIds.add(d.id);
        const existing = driverMarkersRef.current.get(d.id);
        const pos: L.LatLngExpression = [d.last_lat!, d.last_lng!];
        const iconHtml = `<div style="width:28px;height:28px;border-radius:50%;background:#8b5cf6;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>`;
        if (existing) {
          existing.setLatLng(pos);
        } else {
          const marker = L.marker(pos, {
            icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], html: iconHtml }),
            zIndexOffset: 1000,
          }).bindTooltip(`<strong>${d.name}</strong><br/>Last seen: ${timeAgo(d.last_seen_at)}`, { direction: "top" });
          marker.addTo(map);
          driverMarkersRef.current.set(d.id, marker);
        }
      });
    }
    driverMarkersRef.current.forEach((marker, id) => {
      if (!currentDriverIds.has(id)) { map.removeLayer(marker); driverMarkersRef.current.delete(id); }
    });

    // Trailer markers (from Traccar GPS) - shown in amber color with "T" indicator
    const currentTrailerIds = new Set<string>();
    if (showVehicleGps) {
      trailerGpsPositions.forEach((pos, trailerId) => {
        if (!pos.latitude || !pos.longitude) return;
        currentTrailerIds.add(trailerId);
        const isMoving = pos.speed > 2;
        const existing = trailerMarkersRef.current.get(trailerId);
        const latLng: L.LatLngExpression = [pos.latitude, pos.longitude];
        
        // Amber color for trailers
        const color = "#f59e0b";
        
        const iconHtml = isMoving
          ? `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">T ${pos.trailer_plate || ""}</div>
              <svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${pos.course || 0}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))">
                <path d="M12 1 L20 21 L12 16 L4 21 Z" fill="${color}"/>
              </svg>
            </div>`
          : `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
              <div style="white-space:nowrap;font-size:10px;font-weight:700;color:white;background:${color};padding:2px 6px;border-radius:3px;margin-bottom:2px;letter-spacing:0.4px;box-shadow:0 1px 4px rgba(0,0,0,0.5)">T ${pos.trailer_plate || ""}</div>
              <div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.5);color:white;font-weight:bold;font-size:11px">T</div>
            </div>`;
        
        const iconSize: L.PointExpression = [60, 50];
        const iconAnchor: L.PointExpression = [30, 45];
        
        if (existing) {
          existing.setLatLng(latLng);
          existing.setIcon(L.divIcon({ className: "", iconSize, iconAnchor, html: iconHtml }));
        } else {
          const marker = L.marker(latLng, {
            icon: L.divIcon({ className: "", iconSize, iconAnchor, html: iconHtml }),
            zIndexOffset: 1000,
          });
          marker.addTo(map);
          trailerMarkersRef.current.set(trailerId, marker);
        }
      });
    }
    trailerMarkersRef.current.forEach((marker, id) => {
      if (!currentTrailerIds.has(id)) { map.removeLayer(marker); trailerMarkersRef.current.delete(id); }
    });

    // Fit bounds ONLY on first selection of an order (not on every GPS update)
    if (selectedOrderId && selectedOrderId !== lastFitOrderIdRef.current) {
      // Prefer trip route geometry, then trip_stop coords, then order route for bounds
      const tripWithRoute = selectedOrderTrips.find((t: any) => t.route_geometry && Array.isArray(t.route_geometry) && t.route_geometry.length > 1);
      let boundsGeometry = tripWithRoute?.route_geometry;
      if (!boundsGeometry || boundsGeometry.length < 2) {
        // Try trip_stop coordinates as fallback
        const allTripStopCoords = selectedOrderTrips.flatMap((t: any) =>
          (t.trip_stops || []).filter((ts: any) => ts.lat && ts.lng).map((ts: any) => [ts.lat, ts.lng] as [number, number])
        );
        if (allTripStopCoords.length >= 2) boundsGeometry = allTripStopCoords;
      }
      if (!boundsGeometry || boundsGeometry.length < 2) {
        const sel = orders.find(o => o.id === selectedOrderId);
        boundsGeometry = sel?.route_geometry;
      }
      if (boundsGeometry && boundsGeometry.length > 1) {
        map.fitBounds(L.latLngBounds(boundsGeometry), { padding: [40, 40] });
        lastFitOrderIdRef.current = selectedOrderId;
      }
    } else if (!selectedOrderId) {
      lastFitOrderIdRef.current = null;
    }

    // Follow selected vehicle in real-time
    if (selectedVehicleId) {
      const pos = gpsPositions.get(selectedVehicleId);
      if (pos?.latitude && pos?.longitude) {
        const currentZoom = map.getZoom();
        map.setView([pos.latitude, pos.longitude], Math.max(currentZoom, 12), { animate: true, duration: 0.5 });
      }
    }
  }, [orders, drivers, vehicles, gpsPositions, trailerGpsPositions, selectedOrderId, selectedVehicleId, showVehicleGps, showDriverPos, selectedOrderTrips]);

  // ---------- Computed data ----------

  // Search filter
  const filteredOrders = useMemo(() => {
  // Hide forwarding orders that already have a carrier assigned (they belong on the Forwarder Board)
  const dispatchOrders = orders.filter(o =>
    !(o.order_type === "forwarding" && o.carrier_id)
  );
  if (!search) return dispatchOrders;
  const q = search.toLowerCase();
  return dispatchOrders.filter(o =>
  o.reference_number.toLowerCase().includes(q) ||
  o.customer_name.toLowerCase().includes(q) ||
  o.stops.some(s => s.city?.toLowerCase().includes(q))
  );
  }, [orders, search]);

  // Group by vehicle: trip-based for assigned, order-based fallback for no-trip orders.
  //
  // An order is "Unassigned" ONLY if it has no execution at all:
  //   - no own-fleet vehicle assigned directly on the order (`vehicle_id`)
  //   - no carrier assigned directly on the order (`carrier_id`)
  //   - AND no trip linked to it (covers subcontracted trip-legs, mixed
  //     trips, and own-fleet trips where the assignment lives on the trip
  //     rather than on the order row).
  const vehicleOrders = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    const unassigned = filteredOrders.filter(
      o => !o.vehicle_id && !o.carrier_id && !orderIdsWithTrip.has(o.id),
    );
    // Only include orders that do NOT have trips on the per-vehicle order
    // rows (trips are rendered as their own bars in the Gantt).
    filteredOrders.filter(o => o.vehicle_id && !orderIdsWithTrip.has(o.id)).forEach(o => {
      const arr = map.get(o.vehicle_id!) || [];
      arr.push(o);
      map.set(o.vehicle_id!, arr);
    });
    return { unassigned, assigned: map };
  }, [filteredOrders, orderIdsWithTrip]);

  const activeVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    orders.filter(o => o.vehicle_id).forEach(o => ids.add(o.vehicle_id!));
    // Also mark swap/trip vehicles as active
    vehicleTrips.forEach((_trips, vehicleId) => ids.add(vehicleId));
    return ids;
  }, [orders, vehicleTrips]);

  // Vehicles with no orders
  const idleVehicles = useMemo(() => vehicles.filter(v => !activeVehicleIds.has(v.id)), [vehicles, activeVehicleIds]);

  // Vehicles with GPS
  const gpsVehicleCount = useMemo(() => vehicles.filter(v => v.traccar_device_id).length, [vehicles]);
  const gpsOnlineCount = useMemo(() => {
  return vehicles.filter(v => gpsPositions.has(v.id)).length;
  }, [vehicles, gpsPositions]);

  // ------ SMART ALERTS / PREDICTIONS ------
  const alerts = useMemo(() => {
    const result: { type: "urgent" | "warning" | "info"; icon: React.ReactNode; title: string; detail: string; orderId?: string; vehicleId?: string }[] = [];
    const todayStr = fmt(new Date());

    // 1. Unassigned orders starting soon (no vehicle AND no carrier)
    orders.filter(o => !o.vehicle_id && !o.carrier_id && ["confirmed"].includes(o.status)).forEach(o => {
      const firstDate = o.stops.map(s => s.planned_date).filter(Boolean).sort()[0];
      if (!firstDate) return;
      const days = daysUntil(firstDate);
      if (days <= 0) {
        result.push({ type: "urgent", icon: <AlertTriangle className="h-3.5 w-3.5" />, title: `${o.reference_number} starts TODAY`, detail: `${o.stops[0]?.city || "?"} (${getCountryCode(o.stops[0]?.country || "")}) → ${o.stops[o.stops.length - 1]?.city || "?"} (${getCountryCode(o.stops[o.stops.length - 1]?.country || "")}) · No vehicle assigned!`, orderId: o.id });
      } else if (days === 1) {
        result.push({ type: "urgent", icon: <Timer className="h-3.5 w-3.5" />, title: `${o.reference_number} starts TOMORROW`, detail: `${o.stops[0]?.city || "?"} (${getCountryCode(o.stops[0]?.country || "")}) → ${o.stops[o.stops.length - 1]?.city || "?"} (${getCountryCode(o.stops[o.stops.length - 1]?.country || "")}) · Needs assignment`, orderId: o.id });
      } else if (days <= 3) {
        result.push({ type: "warning", icon: <Clock className="h-3.5 w-3.5" />, title: `${o.reference_number} starts in ${days} days`, detail: `${o.stops[0]?.city || "?"} (${getCountryCode(o.stops[0]?.country || "")}) → ${o.stops[o.stops.length - 1]?.city || "?"} (${getCountryCode(o.stops[o.stops.length - 1]?.country || "")}) · Unassigned`, orderId: o.id });
      }
    });

      // 2. Orders assigned but not in execution and starting soon
      orders.filter(o => o.vehicle_id && o.status === "confirmed_to_customer").forEach(o => {
      const firstDate = o.stops.map(s => s.planned_date).filter(Boolean).sort()[0];
      if (!firstDate) return;
      const days = daysUntil(firstDate);
      if (days <= 1) {
        result.push({ type: "warning", icon: <Zap className="h-3.5 w-3.5" />, title: `${o.reference_number} not dispatched yet`, detail: `Starts ${days === 0 ? "today" : "tomorrow"} · Vehicle assigned but order not dispatched`, orderId: o.id });
      }
    });

    // 3. Vehicles becoming idle soon (last order ends soon)
    vehicles.forEach(v => {
      const vOrders = orders.filter(o => o.vehicle_id === v.id && ["dispatched", "in_transit"].includes(o.status));
      if (vOrders.length === 0) return;
      const lastDates = vOrders.flatMap(o => o.stops.map(s => s.planned_date)).filter(Boolean).sort();
      const lastDate = lastDates[lastDates.length - 1];
      if (!lastDate) return;
      const days = daysUntil(lastDate);
      if (days >= 0 && days <= 2) {
          const hasUpcoming = orders.some(o => o.vehicle_id === v.id && o.status === "confirmed_to_customer" && o.stops.some(s => s.planned_date && daysUntil(s.planned_date) > days));
        if (!hasUpcoming) {
          result.push({ type: "info", icon: <Truck className="h-3.5 w-3.5" />, title: `${v.plate_number} becomes idle ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`, detail: `No upcoming orders after current delivery`, vehicleId: v.id });
        }
      }
    });

    // Sort: urgent first, then warning, then info
    const priority = { urgent: 0, warning: 1, info: 2 };
    result.sort((a, b) => priority[a.type] - priority[b.type]);
    return result;
  }, [orders, vehicles]);

  // Order time span for Gantt
  function getOrderTimeSpan(order: OrderRow): { startDay: number; endDay: number } | null {
    const dates = order.stops.map(s => s.planned_date).filter(Boolean).sort();
    if (dates.length === 0) return null;
    const firstDate = new Date(dates[0] + "T00:00:00");
    const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
    const rangeStart = startDate.getTime();
    const dayMs = 86400000;
    const sDay = Math.floor((firstDate.getTime() - rangeStart) / dayMs);
    const eDay = Math.floor((lastDate.getTime() - rangeStart) / dayMs);
    if (eDay < 0 || sDay >= viewDays) return null;
    return { startDay: Math.max(0, sDay), endDay: Math.min(viewDays - 1, eDay) };
  }

  // Trip time span for Gantt (uses trip stop dates)
  function getTripTimeSpan(trip: GanttTrip): { startDay: number; endDay: number } | null {
    const dates = trip.stops.map(s => s.planned_date).filter(Boolean).sort() as string[];
    // Fallback to order dates if trip stops have no dates
    if (dates.length === 0 && trip.order) {
      return getOrderTimeSpan(trip.order);
    }
    if (dates.length === 0) return null;
    const firstDate = new Date(dates[0] + "T00:00:00");
    const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
    const rangeStart = startDate.getTime();
    const dayMs = 86400000;
    const sDay = Math.floor((firstDate.getTime() - rangeStart) / dayMs);
    const eDay = Math.floor((lastDate.getTime() - rangeStart) / dayMs);
    if (eDay < 0 || sDay >= viewDays) return null;
    return { startDay: Math.max(0, sDay), endDay: Math.min(viewDays - 1, eDay) };
  }

  // Nav
  const goToday = () => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); setStartDate(d); };
  const goPrev = () => { const d = new Date(startDate); d.setDate(d.getDate() - viewDays); setStartDate(d); };
  const goNext = () => { const d = new Date(startDate); d.setDate(d.getDate() + viewDays); setStartDate(d); };

  const onlineDriverCount = drivers.filter(d => d.is_online).length;
  const activeOrderCount = orders.filter(o => ["dispatched", "in_transit"].includes(o.status)).length;
  const todayStr = fmt(new Date());

  // Render order block for Gantt (fallback for orders without trips)
  const renderOrderBlock = (order: OrderRow, isUnassigned = false) => {
    const span = getOrderTimeSpan(order);
    if (!span) return null;
    const leftPct = (span.startDay / viewDays) * 100;
    const widthPct = ((span.endDay - span.startDay + 1) / viewDays) * 100;
    const isSelected = selectedOrderId === order.id;
    const firstStop = order.stops[0];
    const lastStop = order.stops[order.stops.length - 1];
    const firstCity = firstStop?.city || "?";
    const lastCity = lastStop?.city || "?";
    const firstCountry = firstStop?.country || "";
    const lastCountry = lastStop?.country || "";
    const colorClass = isUnassigned
      ? "bg-red-500/15 border-red-500/30 hover:bg-red-500/25"
      : order.status === "in_transit" ? "bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30"
                  : order.status === "in_execution" ? "bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30"
          : "bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30";
    return (
      <TooltipProvider key={order.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`absolute top-1.5 h-[calc(100%-12px)] rounded-md text-left px-2 flex items-center gap-1 transition-all cursor-pointer overflow-hidden border ${colorClass} ${isSelected ? "ring-1 ring-amber-400 z-20" : "z-10"}`}
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 100 / viewDays)}%` }}
              onClick={() => { setSelectedOrderId(isSelected ? null : order.id); setSelectedTripId(null); if (!isSelected) setSelectedVehicleId(null); }}>
              <CountryFlag country={firstCountry} className="w-3.5 h-2.5" />
              <span className="text-[10px] font-medium truncate">{firstCity}</span>
              <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-40" />
              <CountryFlag country={lastCountry} className="w-3.5 h-2.5" />
              <span className="text-[10px] font-medium truncate">{lastCity}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs z-[9999]">
            <div className="text-xs space-y-1">
              <div className="font-semibold">{order.reference_number}</div>
              <div className="text-muted-foreground">{order.customer_name}</div>
              <div className="flex items-center gap-1"><CountryFlag country={firstCountry} /> {firstCity} <ArrowRight className="h-2.5 w-2.5 opacity-40" /> <CountryFlag country={lastCountry} /> {lastCity}</div>
              {order.estimated_distance_km && <div>{Math.round(order.estimated_distance_km)} km</div>}
              {order.pallet_count && <div>{order.pallet_count} pallets · {order.weight_kg ? `${(order.weight_kg / 1000).toFixed(1)}t` : ""}</div>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Render TRIP block for Gantt (trip-based view with segment cities)
  const renderTripBlock = (trip: GanttTrip) => {
    const span = getTripTimeSpan(trip);
    if (!span) return null;
    const leftPct = (span.startDay / viewDays) * 100;
    const widthPct = ((span.endDay - span.startDay + 1) / viewDays) * 100;
    const isSelected = selectedTripId === trip.trip_id || selectedOrderId === trip.order_id || trip.order_ids.some(oid => oid === selectedOrderId);

    const firstStop = trip.stops[0];
    const lastStop = trip.stops[trip.stops.length - 1];
    const firstCity = firstStop?.city || "?";
    const lastCity = lastStop?.city || "?";
    const firstCountry = firstStop?.country || "";
    const lastCountry = lastStop?.country || "";

    const colorClass = trip.status === "in_transit" ? "bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30"
      : trip.status === "dispatched" ? "bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30"
        : trip.status === "completed" ? "bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30"
          : "bg-teal-500/20 border-teal-500/40 hover:bg-teal-500/30";

    const durationStr = trip.duration_minutes ? `${Math.floor(trip.duration_minutes / 60)}h${String(trip.duration_minutes % 60).padStart(2, "0")}m` : "";

    return (
      <TooltipProvider key={trip.trip_id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`absolute top-1.5 h-[calc(100%-12px)] rounded-md text-left px-2 flex items-center gap-1 transition-all cursor-pointer overflow-hidden border ${colorClass} ${isSelected ? "ring-1 ring-amber-400 z-20" : "z-10"}`}
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 100 / viewDays)}%` }}
              onClick={() => {
                const nowSelected = !isSelected;
                setSelectedOrderId(nowSelected ? trip.order_id : null);
                setSelectedTripId(nowSelected ? trip.trip_id : null);
                if (nowSelected) setSelectedVehicleId(null);
              }}>
              <CountryFlag country={firstCountry} className="w-3.5 h-2.5" />
              <span className="text-[10px] font-medium truncate">{firstCity}</span>
              <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-40" />
              <CountryFlag country={lastCountry} className="w-3.5 h-2.5" />
              <span className="text-[10px] font-medium truncate">{lastCity}</span>
              {trip.orders.length > 1 && (
                <span className="text-[8px] font-semibold px-1 py-0 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">{trip.orders.length}</span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs z-[9999]">
            <div className="text-xs space-y-1.5">
              {trip.orders.length > 1 ? (
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-400">{trip.orders.length} orders in this trip</div>
                  {trip.orders.map(o => (
                    <div key={o.id} className="text-[10px] text-muted-foreground">{o.reference_number}{o.customer_name ? ` - ${o.customer_name}` : ""}</div>
                  ))}
                </div>
              ) : trip.order ? (
                <div className="font-semibold">{trip.order.reference_number}{trip.order.customer_name ? ` - ${trip.order.customer_name}` : ""}</div>
              ) : null}
              <div className="flex items-center gap-1">
                <CountryFlag country={firstCountry} /> {firstCity}
                <ArrowRight className="h-2.5 w-2.5 opacity-40" />
                <CountryFlag country={lastCountry} /> {lastCity}
              </div>
              {trip.distance_km && <div>{Math.round(trip.distance_km)} km{durationStr ? ` - ${durationStr}` : ""}</div>}
              {trip.swap_type && <div className="text-amber-400 font-medium capitalize">{trip.swap_type.replace("_", " ")}</div>}
              {/* Show all stops with dates */}
              <div className="border-t border-border/30 pt-1 space-y-0.5">
                {trip.stops.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 text-muted-foreground">
                    <CountryFlag country={s.country} className="w-3 h-2" />
                    <span>{s.city}</span>
                    <span className="text-[9px] capitalize opacity-60">({s.stop_type})</span>
                    {s.order_ref && trip.orders.length > 1 && (
                      <span className="text-[8px] font-mono text-blue-400/70">{s.order_ref.split("-").pop()}</span>
                    )}
                    {s.planned_date && <span className="ml-auto text-[9px]">{s.planned_date}{s.planned_time_from ? ` ${s.planned_time_from.slice(0, 5)}` : ""}</span>}
                  </div>
                ))}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    // h-full (not h-screen) so the page fits inside <main>, which is
    // already sized to the remaining viewport below the global admin header.
    <div className="flex flex-col h-full overflow-hidden">
      {/* ===== Toolbar (filters / actions / pills) ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between px-3 lg:px-5 py-2 lg:py-2.5 border-b border-border/50 bg-card/30 gap-2 lg:gap-0">
        <div className="flex items-center justify-between lg:justify-start gap-2 lg:gap-4">
          <div>
            <h1 className="text-base lg:text-lg font-semibold tracking-tight">Dispatch Board</h1>
            <p className="text-[10px] lg:text-[11px] text-muted-foreground hidden sm:block">Fleet planning, live tracking &amp; smart alerts</p>
          </div>
          {/* Mobile/Tablet controls (shown <lg) */}
          <div className="flex items-center gap-2 lg:hidden">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setShowMap(v => !v)}>
              {showMap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { fetchData(); fetchGps(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {/* Live stats pills (≥lg only) */}
          <div className="hidden lg:flex items-center gap-2 ml-4 overflow-x-auto scrollbar-none max-w-[calc(100vw-700px)] shrink">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
              <Signal className="h-3 w-3 text-emerald-400" />
              <span className="text-[11px] font-medium text-emerald-400 whitespace-nowrap">{onlineDriverCount} drivers</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 shrink-0">
              <SatelliteDish className="h-3 w-3 text-blue-400" />
              <span className="text-[11px] font-medium text-blue-400 whitespace-nowrap">{gpsOnlineCount}/{gpsVehicleCount} GPS</span>
            {wsConnected && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[10px] font-medium text-emerald-400">LIVE</span></span>}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 shrink-0">
              <Route className="h-3 w-3 text-amber-400" />
              <span className="text-[11px] font-medium text-amber-400 whitespace-nowrap">{activeOrderCount} active</span>
            </div>
            {idleVehicles.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-500/10 border border-zinc-500/20 shrink-0">
                <Truck className="h-3 w-3 text-zinc-400" />
                <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">{idleVehicles.length} idle</span>
              </div>
            )}
            {selectedVehicleId && (
              <button
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors shrink-0"
                onClick={() => setSelectedVehicleId(null)}>
                <Crosshair className="h-3 w-3 text-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-emerald-400">
                  Following {vehicles.find(v => v.id === selectedVehicleId)?.plate_number}
                </span>
                <XCircle className="h-3 w-3 text-emerald-400/60" />
              </button>
            )}
            {alerts.length > 0 && (
              <button
                className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all shrink-0 ${
                  alerts.some(a => a.type === "urgent")
                    ? "bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
                    : alerts.some(a => a.type === "warning")
                    ? "bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20"
                    : "bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
                } ${alertsPopupOpen ? "ring-1 ring-amber-400/50" : ""}`}
                onClick={() => setAlertsPopupOpen(v => !v)}>
                <Sparkles className={`h-3 w-3 ${alerts.some(a => a.type === "urgent") ? "text-red-400 animate-pulse" : "text-amber-400"}`} />
                <span className={`text-[11px] font-medium ${alerts.some(a => a.type === "urgent") ? "text-red-400" : "text-amber-400"}`}>
                  {alerts.length} Alert{alerts.length !== 1 ? "s" : ""}
                </span>
              </button>
            )}
          </div>
        </div>
        {/* Mobile + Tablet stats/actions row (shown <lg) */}
        <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            <Signal className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">{onlineDriverCount}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 shrink-0">
            <SatelliteDish className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] font-medium text-blue-400">{gpsOnlineCount}/{gpsVehicleCount}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 shrink-0">
            <Route className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-medium text-amber-400">{activeOrderCount}</span>
          </div>
          {wsConnected && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-400">LIVE</span>
            </span>
          )}
          {alerts.length > 0 && (
            <button
              className={`flex items-center gap-1 px-2 py-1 rounded-full shrink-0 ${
                alerts.some(a => a.type === "urgent") ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"
              }`}
              onClick={() => setAlertsPopupOpen(v => !v)}>
              <Sparkles className={`h-3 w-3 ${alerts.some(a => a.type === "urgent") ? "text-red-400" : "text-amber-400"}`} />
              <span className={`text-[10px] font-medium ${alerts.some(a => a.type === "urgent") ? "text-red-400" : "text-amber-400"}`}>{alerts.length}</span>
            </button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-[100px] text-[10px] bg-card/50 border-border/50 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {/* Mobile/tablet action buttons — mirrors the full desktop toolbar.
              Each pill is `shrink-0` so the row scrolls horizontally on
              narrow phones rather than wrapping awkwardly. */}
          <button
            onClick={() => setShowVehicleGps(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full shrink-0 ${showVehicleGps ? "bg-blue-500/20 border border-blue-500/40" : "bg-muted/50 border border-border/50"}`}>
            <Truck className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] font-medium text-blue-400">GPS</span>
          </button>
          <button
            onClick={() => setShowDriverPos(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full shrink-0 ${showDriverPos ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-muted/50 border border-border/50"}`}>
            <CircleDot className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">Drivers</span>
          </button>
          <Link href="/admin/tms/trips" className="shrink-0">
            <button className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 shrink-0">
              <Route className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-medium text-primary whitespace-nowrap">Round Trips</span>
            </button>
          </Link>
          <Link href="/admin/tms/carriers/consolidation" className="shrink-0">
            <button className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 shrink-0">
              <Layers className="h-3 w-3 text-violet-400" />
              <span className="text-[10px] font-medium text-violet-400">Consolidate</span>
            </button>
          </Link>
          <button
            onClick={() => setShowMap(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full shrink-0 ${showMap ? "bg-cyan-500/20 border border-cyan-500/40" : "bg-muted/50 border border-border/50"}`}>
            {showMap ? <EyeOff className="h-3 w-3 text-cyan-400" /> : <Eye className="h-3 w-3 text-cyan-400" />}
            <span className="text-[10px] font-medium text-cyan-400">Map</span>
          </button>
        </div>
        <div className="hidden lg:flex items-center gap-2">
          <div className="relative flex items-center">
            <button
              className={`h-8 w-8 flex items-center justify-center rounded-md transition-all ${searchOpen ? "hidden" : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              aria-label="Search">
              <Search className="h-4 w-4" />
            </button>
            <div className={`flex items-center transition-all duration-200 ease-out overflow-hidden ${searchOpen ? "w-64 opacity-100" : "w-0 opacity-0"}`}>
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search driver, vehicle, order..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onBlur={() => { if (!search) setSearchOpen(false); }}
                  onKeyDown={e => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
                  className="h-8 w-full pl-8 pr-8 text-xs bg-background/50"
                />
                {search && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border/50 rounded-md overflow-hidden">
            <Button variant={showVehicleGps ? "secondary" : "ghost"} size="sm" className="h-8 rounded-none text-xs gap-1.5 px-2.5" onClick={() => setShowVehicleGps(v => !v)}>
              <Truck className="h-3.5 w-3.5" /> GPS
            </Button>
            <div className="w-px h-5 bg-border/50" />
            <Button variant={showDriverPos ? "secondary" : "ghost"} size="sm" className="h-8 rounded-none text-xs gap-1.5 px-2.5" onClick={() => setShowDriverPos(v => !v)}>
              <CircleDot className="h-3.5 w-3.5" /> Drivers
            </Button>
          </div>
          <Link href="/admin/tms/trips" className="hidden xl:block">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Route className="h-3.5 w-3.5" /> Round Trips
            </Button>
          </Link>
          <Link href="/admin/tms/carriers/consolidation" className="hidden xl:block">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" /> Consolidate
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowMap(v => !v)}>
            {showMap ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} Map
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { fetchData(); fetchGps(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ===== Smart Alerts Popup ===== */}
      {alertsPopupOpen && alerts.length > 0 && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-[2px]" onClick={() => setAlertsPopupOpen(false)} />
          {/* Popup panel */}
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[9999] w-[520px] max-h-[70vh] bg-card border border-border/60 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-gradient-to-r from-amber-500/5 via-transparent to-red-500/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Smart Alerts</h3>
                  <p className="text-[10px] text-muted-foreground">{alerts.length} active alert{alerts.length !== 1 ? "s" : ""} for your fleet</p>
                </div>
              </div>
              <button onClick={() => setAlertsPopupOpen(false)} className="p-1.5 rounded-md hover:bg-muted/20 transition-colors text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Alert categories summary */}
            <div className="flex gap-2 px-5 py-2.5 border-b border-border/20 bg-muted/5">
              {[
                { type: "urgent" as const, label: "Urgent", color: "red", count: alerts.filter(a => a.type === "urgent").length },
                { type: "warning" as const, label: "Warning", color: "amber", count: alerts.filter(a => a.type === "warning").length },
                { type: "info" as const, label: "Info", color: "blue", count: alerts.filter(a => a.type === "info").length },
              ].filter(c => c.count > 0).map(cat => (
                <div key={cat.type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold
                  ${cat.color === "red" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                    cat.color === "amber" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cat.color === "red" ? "bg-red-400" : cat.color === "amber" ? "bg-amber-400" : "bg-blue-400"}`} />
                  {cat.count} {cat.label}
                </div>
              ))}
            </div>

            {/* Alert list */}
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border/10">
              {alerts.map((alert, i) => (
                <button key={i}
                  className={`w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-muted/10 transition-colors group`}
                  onClick={() => {
                    if (alert.orderId) { setSelectedOrderId(alert.orderId); setAlertsPopupOpen(false); }
                    if (alert.vehicleId) {
                      const pos = gpsPositions.get(alert.vehicleId);
                      if (pos) mapRef.current?.setView([pos.latitude, pos.longitude], 12);
                      setAlertsPopupOpen(false);
                    }
                  }}>
                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5
                    ${alert.type === "urgent" ? "bg-red-500/10 text-red-400" :
                      alert.type === "warning" ? "bg-amber-500/10 text-amber-400" :
                      "bg-blue-500/10 text-blue-400"}`}>
                    {alert.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold leading-tight group-hover:text-foreground transition-colors">{alert.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{alert.detail}</div>
                  </div>
                  <div className={`shrink-0 mt-1 text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider
                    ${alert.type === "urgent" ? "bg-red-500/10 text-red-400" :
                      alert.type === "warning" ? "bg-amber-500/10 text-amber-400" :
                      "bg-blue-500/10 text-blue-400"}`}>
                    {alert.type}
                  </div>
                </button>
              ))}
            </div>

            {/* Footer -- AI Assistant teaser */}
            <div className="px-5 py-3 border-t border-border/30 bg-gradient-to-r from-violet-500/5 via-transparent to-blue-500/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-violet-300">AI Dispatcher Assistant</div>
                  <div className="text-[10px] text-muted-foreground">Predictions, route optimization & driver suggestions -- coming soon</div>
                </div>
                <Badge variant="outline" className="text-[9px] border-violet-500/30 text-violet-400 bg-violet-500/5 shrink-0">Soon</Badge>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== Main content: Map + Timeline ===== */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Map section */}
        {showMap && (
          <div className={`border-b border-border/50 transition-all duration-300 relative ${mapExpanded ? "h-[50vh] md:h-[55vh]" : "h-[160px] md:h-[220px]"}`}>
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Route History Panel */}
            {routeHistoryVehicleId && adminSession?.id && (
              <RouteHistoryPanel
                vehicleId={routeHistoryVehicleId}
                vehiclePlate={vehicles.find(v => v.id === routeHistoryVehicleId)?.plate_number || ""}
                adminId={adminSession.id}
                mapRef={mapRef}
                onClose={() => setRouteHistoryVehicleId(null)}
              />
            )}

            {/* Map legend overlay -- route lines only, vehicle status filters moved to Fleet Status panel */}
            {!routeHistoryVehicleId && <div className="absolute top-2 md:top-3 left-2 md:left-3 z-[1000] bg-card/90 backdrop-blur-sm rounded-lg border border-border/50 p-1.5 md:p-2 shadow-lg">
              <div className="flex items-center gap-2 md:gap-3 text-[9px] md:text-[10px]">
                {showDriverPos && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-violet-500" />
                    <span className="text-muted-foreground hidden sm:inline">Driver App</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <div className="w-4 md:w-5 h-0.5 bg-emerald-400 rounded" />
                  <span className="text-muted-foreground hidden sm:inline">Confirmed</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 md:w-5 h-0.5 bg-blue-400 rounded" />
                  <span className="text-muted-foreground hidden sm:inline">Dispatched</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 md:w-5 h-0.5 bg-amber-400 rounded" />
                  <span className="text-muted-foreground hidden sm:inline">In Transit</span>
                </div>
              </div>
            </div>}
            <Button variant="ghost" size="icon" className="absolute bottom-3 left-3 z-[1000] h-7 w-7 bg-card/80 backdrop-blur-sm border border-border/50 shadow-md"
              onClick={() => setMapExpanded(!mapExpanded)}>
              {mapExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>

            {/* Layers / base-map switcher */}
            <div className="absolute bottom-3 left-12 z-[1000]">
              <Button
                variant="ghost"
                size="icon"
                title={`Base map: ${TILE_LAYERS[activeTile]?.name ?? activeTile}`}
                className="h-7 w-7 bg-card/80 backdrop-blur-sm border border-border/50 shadow-md"
                onClick={() => setTileMenuOpen(o => !o)}
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
              {tileMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-44 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-2xl overflow-hidden">
                  <div className="px-2.5 py-1.5 border-b border-border/30 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Base Map
                  </div>
                  <div className="py-1">
                    {TILE_LAYER_ENTRIES.map(([key, cfg]) => (
                      <button
                        key={key}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] hover:bg-muted/30 transition-colors ${
                          activeTile === key ? "text-foreground bg-muted/20 font-semibold" : "text-muted-foreground"
                        }`}
                        onClick={() => { setActiveTile(key); setTileMenuOpen(false); }}
                      >
                        <span className="truncate">{cfg.name}</span>
                        {activeTile === key && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Right panel: Fleet Status — collapsed pill */}
            {fleetStatusCollapsed && (
              <button
                type="button"
                onClick={() => setFleetStatusCollapsed(false)}
                title="Expand fleet status"
                className="absolute top-2 md:top-3 right-10 md:right-12 z-[1000] inline-flex items-center gap-2 h-9 px-3 rounded-full bg-card/95 backdrop-blur-md border border-border/50 shadow-xl hover:border-primary/40 hover:bg-card transition-all group"
              >
                <PanelRightOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                  Fleet
                </span>
                <Badge variant="outline" className="text-[9px] h-4 group-hover:border-primary/40 transition-colors">
                  {vehicles.length}
                </Badge>
                {wsConnected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live WebSocket" />}
              </button>
            )}

            {/* Right panel: Fleet Status with status filters, follow vehicle, info popup */}
            <div
              className={`absolute top-2 md:top-3 right-10 md:right-12 z-[1000] bg-card/95 backdrop-blur-md rounded-lg border border-border/50 shadow-xl w-[200px] md:w-[272px] flex-col ${
                fleetStatusCollapsed ? "hidden" : "flex"
              }`}
              style={{ maxHeight: "calc(100% - 16px)" }}
            >
              {/* Header */}
              <div className="p-2 border-b border-border/30 shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFleetStatusCollapsed(true)}
                      title="Collapse panel"
                      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <PanelRightClose className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fleet Status</span>
                    {wsConnected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live WebSocket" />}
                  </div>
                  <Badge variant="outline" className="text-[9px] h-4">{vehicles.length}</Badge>
                </div>
                {/* Status filter tabs */}
                <div className="flex gap-1">
                  {([
                    { key: "all", label: "All", count: vehicles.length },
                    { key: "moving", label: "Moving", count: vehicles.filter(v => { const p = gpsPositions.get(v.id); return p && p.speed > 2; }).length, color: "emerald" },
                    { key: "idling", label: "Idle", count: vehicles.filter(v => { const p = gpsPositions.get(v.id); return p && p.speed <= 2 && p.ignition === true; }).length, color: "amber" },
                    { key: "parked", label: "Parked", count: vehicles.filter(v => { const p = gpsPositions.get(v.id); return p && p.speed <= 2 && p.ignition !== true; }).length, color: "blue" },
                    { key: "offline", label: "Off", count: vehicles.filter(v => !gpsPositions.has(v.id)).length, color: "zinc" },
                  ] as const).map(f => (
                    <button key={f.key}
                      className={`flex-1 text-[8px] font-semibold py-1 rounded transition-colors ${
                        fleetStatusFilter === f.key
                          ? f.key === "moving" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : f.key === "idling" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : f.key === "parked" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : f.key === "offline" ? "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                          : "bg-muted/30 text-foreground border border-border/50"
                          : "text-muted-foreground hover:bg-muted/20 border border-transparent"
                      }`}
onClick={() => setFleetStatusFilter(f.key)}>
  {f.label} <span className="opacity-60">{f.count}</span>
  </button>
  ))}
  </div>
  {/* Fleet Group Filter */}
  {fleetGroups.length > 0 && (
    <Select value={fleetGroupFilter} onValueChange={setFleetGroupFilter}>
      <SelectTrigger className="h-7 text-[10px] bg-muted/30 border-border/30 w-[140px]">
        <SelectValue placeholder="All Groups" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Groups</SelectItem>
        {fleetGroups.map(g => (
          <SelectItem key={g.id} value={g.id}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: `var(--${g.color}-500, #888)` }} />
              {g.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}
  </div>
  {/* Vehicle list */}
              <div className="divide-y divide-border/10 overflow-y-auto flex-1 min-h-0">
{vehicles
  .filter(v => {
  // Fleet group filter
  const vWithGroup = v as VehicleRow & { fleet_group_id?: string };
  if (fleetGroupFilter !== "all" && vWithGroup.fleet_group_id !== fleetGroupFilter) return false;
  // Status filter
  if (fleetStatusFilter === "all") return true;
  const pos = gpsPositions.get(v.id);
  if (fleetStatusFilter === "moving") return pos && pos.speed > 2;
  if (fleetStatusFilter === "idling") return pos && pos.speed <= 2 && pos.ignition === true;
  if (fleetStatusFilter === "parked") return pos && pos.speed <= 2 && pos.ignition !== true;
  if (fleetStatusFilter === "offline") return !pos;
  return true;
  })
                  .map(v => {
                  const pos = gpsPositions.get(v.id);
                  const hasGps = v.traccar_device_id != null;
                  const isOnline = !!pos;
                  const isMoving = pos && pos.speed > 2;
                  const isIdling = isOnline && !isMoving && pos?.ignition === true;
                  const isParked = isOnline && !isMoving && !isIdling;
                  const hasOrder = activeVehicleIds.has(v.id);
                  const assignedDriver = drivers.find(d => orders.some(o => o.vehicle_id === v.id && o.driver_id === d.id && ["dispatched", "in_transit"].includes(o.status)));
                  const statusText = isMoving ? `${Math.round(pos!.speed)} km/h` : isIdling ? "Idling" : isParked ? "Parked" : !hasGps ? "" : "Offline";
                  const statusColor = isMoving ? "text-emerald-400" : isIdling ? "text-amber-400" : isParked ? "text-blue-400" : "text-zinc-500";
                  const isFollowing = selectedVehicleId === v.id;

                  return (
                    <div key={v.id} ref={el => { if (infoPopupVehicleId === v.id && el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); }} className={`relative group ${isFollowing ? "bg-emerald-500/5 border-l-2 border-l-emerald-500" : ""}`}>
                      <div className="flex items-center gap-2 w-full px-2.5 py-2">
                        {/* Status icon */}
                        <div className="relative shrink-0 w-6 h-6 rounded-md bg-muted/20 flex items-center justify-center">
                          {isMoving ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" className="text-emerald-500"><path d="M12 1 L20 21 L12 16 L4 21 Z" fill="currentColor"/></svg>
                          ) : isOnline ? (
                            <span className={`font-extrabold text-[10px] ${isIdling ? "text-amber-400" : "text-blue-400"}`}>P</span>
                          ) : (
                            <Truck className="h-3 w-3 text-zinc-600" />
                          )}
                        </div>
                        {/* Name + driver */}
                        <button className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            if (pos) {
                              mapRef.current?.setView([pos.latitude, pos.longitude], 14);
                              setSelectedVehicleId(v.id);
                              setInfoPopupVehicleId(infoPopupVehicleId === v.id ? null : v.id);
                            }
                          }}>
                          <div className="text-[11px] font-medium truncate flex items-center gap-1">
                            {v.plate_number}
                            {hasGps && <SatelliteDish className="h-2.5 w-2.5 text-blue-400/30" />}
                          </div>
                          <div className="text-[9px] text-muted-foreground truncate">
                            {assignedDriver ? assignedDriver.name : "No driver"}
                            {statusText && <span className={`ml-1 ${statusColor}`}>{statusText}</span>}
                          </div>
                        </button>
                        {/* Action icons: follow + info */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          {isOnline && (
                            <button
                              className={`p-1 rounded transition-colors ${isFollowing ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-600 hover:text-zinc-300 hover:bg-muted/30 opacity-0 group-hover:opacity-100"}`}
                              title={isFollowing ? "Stop following" : "Follow vehicle"}
                              onClick={() => { setSelectedVehicleId(isFollowing ? null : v.id); if (!isFollowing) setSelectedOrderId(null); }}>
                              <Crosshair className="h-3 w-3" />
                            </button>
                          )}
                          
                          {hasGps && (
                            <button
                              className={`p-1 rounded transition-colors ${routeHistoryVehicleId === v.id ? "bg-amber-500/20 text-amber-400" : "text-zinc-600 hover:text-zinc-300 hover:bg-muted/30 opacity-0 group-hover:opacity-100"}`}
                              title="Route history"
                              onClick={(e) => { e.stopPropagation(); setRouteHistoryVehicleId(routeHistoryVehicleId === v.id ? null : v.id); setSelectedOrderId(null); }}>
                              <Route className="h-3 w-3" />
                            </button>
                          )}
                          <div className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${hasOrder ? "bg-amber-500/10 text-amber-400" : "bg-zinc-500/10 text-zinc-500"}`}>
                            {hasOrder ? "Active" : "Idle"}
                          </div>
                        </div>
                      </div>
                      {/* Info popup -- rich position details */}
                      {infoPopupVehicleId === v.id && pos && (() => {
                        const fmtWorkState = (s: string | null) => {
                          if (!s) return null;
                          const m: Record<string, string> = { workingStateDrive: "Driving", workingStateWork: "Working", workingStateRest: "Resting", workingStateBreak: "Break", workingStateDriverAvailable: "Available" };
                          return m[s] || s.replace(/workingState/i, "");
                        };
                        const fmtSince = (d: string | null) => {
                          if (!d) return null;
                          try { const t = new Date(d); const diff = Date.now() - t.getTime(); if (diff < 0 || isNaN(diff)) return null; const m = Math.floor(diff / 60000); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ${m % 60}m`; return `${Math.floor(h/24)}d ${h%24}h`; } catch { return null; }
                        };
                        const dState = fmtWorkState(pos.driverWorkingState);
                        const d2State = fmtWorkState(pos.driver2WorkingState);
                        const since = fmtSince(pos.lastParked);
                        const stateColor = (s: string | null) => s === "Driving" ? "text-emerald-400" : s === "Resting" ? "text-blue-400" : s === "Break" ? "text-amber-400" : "text-zinc-400";
                        const stateDot = (s: string | null) => s === "Driving" ? "bg-emerald-400" : s === "Resting" ? "bg-blue-400" : s === "Break" ? "bg-amber-400" : "bg-zinc-400";
                        const coordsStr = `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
                        // Extract country from last part of address for flag
                        const addrParts = (pos.address || "").split(",").map(s => s.trim());
                        const addrCountry = addrParts[addrParts.length - 1] || "";
                        const flagUrl = getCountryFlagUrl(addrCountry);

                        return (
                        <div className="px-3 pb-2.5 pt-1.5 bg-muted/5 border-t border-border/10 text-[9px] text-muted-foreground max-h-[200px] overflow-y-auto">
                          {/* Address -- clickable to copy */}
                          {pos.address && (
                            <button
                              className="w-full text-left text-[10px] text-foreground/80 mb-2 pb-2 border-b border-border/10 leading-relaxed hover:bg-muted/10 rounded px-1 -mx-1 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(pos.address || "");
                                const hint = e.currentTarget.querySelector("[data-hint]");
                                if (hint) { hint.textContent = "Copied!"; setTimeout(() => { hint.textContent = "Click to copy address"; }, 1500); }
                              }}>
                              <span className="flex items-start gap-1.5 break-words">
                                {flagUrl && <img src={flagUrl} alt={addrCountry} className="w-4 h-3 rounded-[2px] object-cover shrink-0 mt-0.5" crossOrigin="anonymous" />}
                                <span>{pos.address}</span>
                              </span>
                              <span data-hint className="text-[8px] text-zinc-600 mt-0.5 block">{"Click to copy address"}</span>
                            </button>
                          )}
                          {/* Coords -- clickable to copy */}
                          <button
                            className="w-full flex items-center gap-1.5 text-[8px] font-mono text-zinc-400 mb-1.5 hover:text-zinc-200 transition-colors rounded px-0.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(coordsStr);
                              const span = e.currentTarget.querySelector("[data-coord]");
                              if (span) { span.textContent = "Copied!"; setTimeout(() => { span.textContent = coordsStr; }, 1500); }
                            }}>
                            <span data-coord>{coordsStr}</span>
                            <Copy className="h-2.5 w-2.5 shrink-0 text-zinc-600" />
                          </button>
                          {/* Position grid */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span className="text-zinc-500">Speed</span><span className="font-semibold">{Math.round(pos.speed)} km/h</span>
                            <span className="text-zinc-500">Heading</span><span>{Math.round(pos.course || 0)}{"\u00B0"}</span>
                            {pos.totalDistance != null && <><span className="text-zinc-500">Odometer</span><span>{Math.round(pos.totalDistance).toLocaleString()} km</span></>}
                            {pos.ignition != null && <><span className="text-zinc-500">Ignition</span><span className={pos.ignition ? "text-emerald-400 font-semibold" : "text-zinc-500"}>{ pos.ignition ? "ON" : "OFF"}</span></>}
                            {pos.fuel != null && (
                              <>
                                <span className="text-zinc-500">Fuel</span>
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                    <div className={`h-full rounded-full ${pos.fuel > 50 ? "bg-emerald-500" : pos.fuel > 20 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pos.fuel}%` }} />
                                  </div>
                                  <span className={`font-semibold ${pos.fuel > 50 ? "text-emerald-400" : pos.fuel > 20 ? "text-amber-400" : "text-red-400"}`}>{pos.fuel}%</span>
                                </div>
                              </>
                            )}
                            {since && <><span className="text-zinc-500">{isMoving ? "Moving since" : isIdling ? "Idle since" : "Parked since"}</span><span className="font-semibold">{since}</span></>}
                            {pos.satellites != null && <><span className="text-zinc-500">Satellites</span><span>{pos.satellites}</span></>}
                            {pos.lastUpdate && <><span className="text-zinc-500">Updated</span><span>{timeAgo(pos.lastUpdate)}</span></>}
                          </div>
                          {/* Tachograph section -- only if driverWorkingState exists */}
                          {(pos.driverWorkingState || pos.driver2WorkingState) && (
                            <div className="mt-2 pt-2 border-t border-border/10">
                              <div className="text-[8px] uppercase tracking-wider text-zinc-600 font-semibold mb-1">Tachograph</div>
                              {pos.driverUniqueId && <div className="font-mono text-[8px] text-zinc-400 mb-0.5">{pos.driverUniqueId}</div>}
                              {dState && (
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${stateDot(dState)}`} />
                                  <span className={`font-semibold ${stateColor(dState)}`}>D1: {dState}</span>
                                </div>
                              )}
                              {d2State && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${stateDot(d2State)}`} />
                                  <span className={`font-semibold ${stateColor(d2State)}`}>D2: {d2State}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-[10px] font-semibold"
                            onClick={(e) => { e.stopPropagation(); setRouteHistoryVehicleId(v.id); setInfoPopupVehicleId(null); setSelectedOrderId(null); }}>
                            <Route className="h-3 w-3" />
                            View Route History
                          </button>
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* ── Trailers section ─────────────────────────────────── */}
                {trailers.length > 0 && (
                  <div className="bg-muted/5">
                    <button
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
                      onClick={() => setShowTrailersList(s => !s)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Package className="h-3 w-3" />
                        Trailers
                        <Badge variant="outline" className="text-[9px] h-4 ml-1">{trailers.length}</Badge>
                      </span>
                      {showTrailersList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showTrailersList && trailers.map(tr => {
                      const tpos = trailerGpsPositions.get(tr.id);
                      const isMoving = tpos && tpos.speed > 2;
                      const isOnline = !!tpos;
                      const speedTxt = isMoving ? `${Math.round(tpos!.speed)} km/h` : isOnline ? "Idle" : "Offline";
                      const speedColor = isMoving ? "text-emerald-400" : isOnline ? "text-amber-400" : "text-zinc-500";
                      return (
                        <button
                          key={tr.id}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/15 transition-colors text-left"
                          onClick={() => {
                            if (tpos) mapRef.current?.setView([tpos.latitude, tpos.longitude], 14);
                          }}
                        >
                          <div className="shrink-0 w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                            <Package className="h-3 w-3 text-amber-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium truncate">{tr.plate_number}</div>
                            <div className="text-[9px] text-muted-foreground truncate">
                              {tr.trailer_type || "Trailer"}
                              <span className={`ml-1 ${speedColor}`}>{speedTxt}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── Drivers section ──────────────────────────────────── */}
                {drivers.length > 0 && (
                  <div className="bg-muted/5">
                    <button
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
                      onClick={() => setShowDriversList(s => !s)}
                    >
                      <span className="flex items-center gap-1.5">
                        <CircleDot className="h-3 w-3" />
                        Drivers
                        <Badge variant="outline" className="text-[9px] h-4 ml-1">{drivers.filter(d => d.is_online).length}/{drivers.length}</Badge>
                      </span>
                      {showDriversList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showDriversList && drivers
                      .slice()
                      .sort((a, b) => Number(b.is_online) - Number(a.is_online))
                      .map(d => {
                        const hasGps = d.last_lat != null && d.last_lng != null;
                        const stateColor = d.is_online ? "text-emerald-400" : "text-zinc-500";
                        const stateDot = d.is_online ? "bg-emerald-400" : "bg-zinc-600";
                        return (
                          <button
                            key={d.id}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/15 transition-colors text-left disabled:opacity-60"
                            disabled={!hasGps}
                            onClick={() => {
                              if (hasGps) mapRef.current?.setView([d.last_lat!, d.last_lng!], 14);
                            }}
                          >
                            <div className="shrink-0 w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center relative">
                              <CircleDot className="h-3 w-3 text-violet-400" />
                              <span className={`absolute -bottom-0 -right-0 w-1.5 h-1.5 rounded-full ${stateDot} ring-1 ring-card`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-medium truncate">{d.name}</div>
                              <div className="text-[9px] text-muted-foreground truncate">
                                <span className={stateColor}>{d.is_online ? "Online" : "Offline"}</span>
                                {d.last_seen_at && <span className="ml-1">· {timeAgo(d.last_seen_at)}</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timeline header */}
        <div className="flex items-center justify-between px-2 md:px-4 py-1.5 md:py-2 border-b border-border/50 bg-card/20">
          <div className="flex items-center gap-1 md:gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="h-8 md:h-7 text-xs px-2 md:px-3" onClick={goToday}>Today</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-[10px] md:text-xs text-muted-foreground ml-1 md:ml-2 hidden sm:inline">
              {dateRange[0]?.toLocaleDateString("en", { month: "short", day: "numeric" })} - {dateRange[dateRange.length - 1]?.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <div className="flex items-center gap-1 md:gap-1.5">
            {[3, 5, 7, 14].map(n => (
              <Button key={n} variant={viewDays === n ? "secondary" : "ghost"} size="sm"
                className="h-8 md:h-7 text-xs px-2 md:px-2.5" onClick={() => setViewDays(n)}>{n}d</Button>
            ))}
          </div>
        </div>

        {/* Gantt chart area */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[600px] md:min-w-[800px]">
            {/* Day headers */}
            <div className="flex border-b border-border/40 sticky top-0 z-[30] bg-background">
              <div className="w-36 md:w-56 shrink-0 px-2 md:px-3 py-1.5 text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-r border-border/40">
                Vehicle / Driver
              </div>
              <div className="flex-1 flex">
                {dateRange.map((d, i) => {
                  const isToday = fmt(d) === todayStr;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={i} className={`flex-1 px-1.5 py-1.5 text-center border-r border-border/20 last:border-r-0 ${isToday ? "bg-amber-500/8" : isWeekend ? "bg-muted/20" : ""}`}>
                      <div className={`text-[10px] font-medium ${isToday ? "text-amber-400" : "text-muted-foreground"}`}>
                        {DAY_NAMES[d.getDay()]}
                      </div>
                      <div className={`text-xs font-semibold ${isToday ? "text-amber-400" : ""}`}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

{/* Active vehicle rows */}
  {vehicles.filter(v => {
    // Fleet group filter
    const vWithGroup = v as VehicleRow & { fleet_group_id?: string };
    if (fleetGroupFilter !== "all" && vWithGroup.fleet_group_id !== fleetGroupFilter) return false;
    // Original filter: active or search match
    return activeVehicleIds.has(v.id) || (search && v.plate_number.toLowerCase().includes(search.toLowerCase()));
  }).map(vehicle => {
              const vOrders = vehicleOrders.assigned.get(vehicle.id) || [];
              const vTrips = vehicleTrips.get(vehicle.id) || [];
              const driver = drivers.find(d => vTrips.some(t => t.driver_name === d.name) || vOrders.some(o => o.driver_id === d.id));
              const pos = gpsPositions.get(vehicle.id);
              const hasGps = vehicle.traccar_device_id != null;
              const isMoving = pos && pos.speed > 2;
              const isIdling = !!pos && !isMoving && pos.ignition === true;
              const isParked = !!pos && !isMoving && !isIdling;
              const dotColor = isMoving ? "bg-emerald-500 animate-pulse" : isIdling ? "bg-amber-400" : isParked ? "bg-blue-400" : "bg-zinc-600";
              const statusText = isMoving ? `${Math.round(pos!.speed)} km/h` : isIdling ? "Idling" : isParked ? "Parked" : hasGps ? "GPS offline" : "No GPS";
              const statusColor = isMoving ? "text-emerald-400" : isIdling ? "text-amber-400" : isParked ? "text-blue-400" : "text-zinc-600";
              return (
                <div key={vehicle.id} className="flex border-b border-border/20 hover:bg-muted/10 group">
                  <div className="w-36 md:w-56 shrink-0 px-2 md:px-3 py-1.5 border-r border-border/20 flex items-center gap-1.5 md:gap-2">
                    <div className="relative w-6 md:w-7 h-6 md:h-7 rounded-md bg-muted/20 flex items-center justify-center shrink-0">
                      {isMoving ? (
                        <svg width="10" height="10" className="md:w-3 md:h-3" viewBox="0 0 24 24"><path d="M12 1 L20 21 L12 16 L4 21 Z" fill="#22c55e"/></svg>
                      ) : pos ? (
                        <span className={`font-extrabold text-[9px] md:text-[10px] ${isIdling ? "text-amber-400" : "text-blue-400"}`}>P</span>
                      ) : (
                        <Truck className="h-3 md:h-3.5 w-3 md:w-3.5 text-zinc-700" />
                      )}
                      {hasGps && <div className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background ${dotColor}`} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] md:text-[11px] font-medium truncate flex items-center gap-1">
                        {vehicle.plate_number}
                        {hasGps && <SatelliteDish className="h-2.5 w-2.5 text-blue-400/40" />}
                      </div>
                      {driver && <div className="text-[9px] text-zinc-500 truncate flex items-center gap-0.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${driver.is_online ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        {driver.name}
                      </div>}
                      <div className={`text-[9px] truncate ${statusColor}`}>{statusText}</div>
                    </div>
                  </div>
                      {/* Gantt timeline cells + order blocks */}
                      <div className="flex-1 flex relative" style={{ minHeight: 36 }}>
                        {dateRange.map((d, i) => {
                          const isToday = fmt(d) === todayStr;
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return <div key={i} className={`flex-1 border-r border-border/5 ${isToday ? "bg-amber-500/3" : isWeekend ? "bg-muted/5" : ""}`} />;
                        })}
                        {vTrips.map(trip => renderTripBlock(trip))}
                        {vOrders.map(order => renderOrderBlock(order, false))}
                      </div>
                    </div>
                  );
                })}

            {/* Idle vehicles section */}
            {idleVehicles.length > 0 && (
              <div className="border-b border-border/20 bg-zinc-500/3">
                <div className="flex items-center gap-2 px-2 md:px-3 py-1.5 border-b border-border/10">
                  <Truck className="h-3 w-3 text-zinc-600" />
                  <span className="text-[9px] md:text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Idle Vehicles ({idleVehicles.length})</span>
                </div>
                {idleVehicles.map(vehicle => {
                  const pos = gpsPositions.get(vehicle.id);
                  const hasGps = vehicle.traccar_device_id != null;
                  return (
                    <div key={vehicle.id} className="flex border-b border-border/10 opacity-60 hover:opacity-100 transition-opacity">
                      <div className="w-36 md:w-56 shrink-0 px-2 md:px-3 py-1.5 border-r border-border/20 flex items-center gap-1.5 md:gap-2">
                        <div className="relative w-6 md:w-7 h-6 md:h-7 rounded-md bg-muted/20 flex items-center justify-center shrink-0">
                          <Truck className="h-3 md:h-3.5 w-3 md:w-3.5 text-zinc-700" />
                          {hasGps && (
                            <div className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background ${pos ? "bg-emerald-400" : "bg-zinc-600"}`} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] md:text-[11px] font-medium truncate text-zinc-500 flex items-center gap-1">
                            {vehicle.plate_number}
                            {hasGps && <SatelliteDish className="h-2.5 w-2.5 text-blue-400/40" />}
                          </div>
                          <div className="text-[8px] md:text-[9px] text-zinc-600 truncate">
                            {pos ? `${pos.speed > 2 ? `${Math.round(pos.speed)} km/h` : "Parked"}` : hasGps ? "GPS offline" : "No GPS"}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 flex relative" style={{ minHeight: 36 }}>
                        {dateRange.map((d, i) => {
                          const isToday = fmt(d) === todayStr;
                          return <div key={i} className={`flex-1 border-r border-border/5 ${isToday ? "bg-amber-500/3" : ""}`} />;
                        })}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[8px] md:text-[9px] text-zinc-700">No orders assigned</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unassigned orders row */}
            {vehicleOrders.unassigned.length > 0 && (
              <div className="border-b border-border/20 bg-red-500/5">
                <div className="flex items-center gap-2 px-2 md:px-3 py-1.5">
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                  <span className="text-[9px] md:text-[10px] font-medium text-red-400 uppercase tracking-wider">Unassigned Orders ({vehicleOrders.unassigned.length})</span>
                </div>
                {vehicleOrders.unassigned.map(order => {
                  const span = getOrderTimeSpan(order);
                  const firstStop = order.stops[0];
                  const lastStop = order.stops[order.stops.length - 1];
                  const firstCity = firstStop?.city || "?";
                  const lastCity = lastStop?.city || "?";
                  const firstCountry = firstStop?.country || "";
                  const lastCountry = lastStop?.country || "";
                  const isSelected = selectedOrderId === order.id;
                  const firstDate = firstStop?.planned_arrival?.slice(0, 10) || firstStop?.planned_date || "";
                  const lastDate = lastStop?.planned_arrival?.slice(0, 10) || lastStop?.planned_date || "";

                  if (span) {
                    // Dates in view: show positioned bar as before
                    return (
                      <div key={order.id} className="flex border-t border-red-500/10">
                        <div className="w-36 md:w-56 shrink-0 border-r border-border/30" />
                        <div className="flex-1 flex relative" style={{ minHeight: 44 }}>
                          {dateRange.map((d, i) => {
                            const isToday = fmt(d) === todayStr;
                            return <div key={i} className={`flex-1 border-r border-border/10 ${isToday ? "bg-amber-500/5" : ""}`} />;
                          })}
                          {renderOrderBlock(order, true)}
                        </div>
                      </div>
                    );
                  }

                  // Dates out of view: show full-width card so the user can always find it
                  return (
                    <div key={order.id} className="flex border-t border-red-500/10">
                      <div className="w-56 shrink-0 border-r border-border/30 px-3 py-2">
                        <div className="text-[10px] text-muted-foreground">
                          {firstDate && lastDate ? `${firstDate} - ${lastDate}` : "No dates"}
                        </div>
                      </div>
                      <div className="flex-1 px-2 py-1.5">
                        <button
                          className={`w-full h-8 rounded-md text-left px-3 flex items-center gap-1.5 transition-all cursor-pointer border bg-red-500/15 border-red-500/30 hover:bg-red-500/25 ${isSelected ? "ring-1 ring-amber-400" : ""}`}
                          onClick={() => { setSelectedOrderId(isSelected ? null : order.id); setSelectedTripId(null); setSelectedVehicleId(null); }}>
                          <CountryFlag country={firstCountry} className="w-3.5 h-2.5" />
                          <span className="text-[10px] font-medium truncate">{firstCity}</span>
                          <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-40" />
                          <CountryFlag country={lastCountry} className="w-3.5 h-2.5" />
                          <span className="text-[10px] font-medium truncate">{lastCity}</span>
                          <span className="text-[9px] text-muted-foreground ml-auto shrink-0">{order.reference_number}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading dispatch data...
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/20 flex items-center justify-center mb-3">
                  <Calendar className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No orders found</p>
                <p className="text-xs text-muted-foreground mt-1">Create orders and assign vehicles to see them here</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ===== Selected order detail bar ===== */}
      {selectedOrderId && (() => {
        const order = orders.find(o => o.id === selectedOrderId);
        if (!order) return null;
        const vehicle = vehicles.find(v => v.id === order.vehicle_id);
        const driver = drivers.find(d => d.id === order.driver_id);
        const gpsPos = vehicle ? gpsPositions.get(vehicle.id) || null : null;
        const hasTrips = selectedOrderTrips.length > 0;

        // Gather all orders for the selected trip (multi-order support)
        const tripOrders = selectedGanttTrip
          ? selectedGanttTrip.order_ids.map(oid => orders.find(o => o.id === oid)).filter(Boolean) as OrderRow[]
          : [order];

        const TRIP_STATUS_COLORS: Record<string, string> = {
          planned: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
          dispatched: "bg-blue-500/10 text-blue-400 border-blue-500/30",
          accepted: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
          in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/30",
          completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
          cancelled: "bg-red-500/10 text-red-400 border-red-500/30",
        };
        const STOP_STATUS_ICON: Record<string, React.ReactNode> = {
          pending: <Circle className="h-3 w-3 text-muted-foreground/40" />,
          en_route: <Navigation className="h-3 w-3 text-blue-400 animate-pulse" />,
          arrived: <MapPin className="h-3 w-3 text-amber-400" />,
          in_action: <Truck className="h-3 w-3 text-violet-400 animate-pulse" />,
          completed: <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
          skipped: <XCircle className="h-3 w-3 text-orange-400" />,
        };

        // Aggregate cargo/revenue across all trip orders
        const totalPallets = tripOrders.reduce((s, o) => s + (o.pallet_count || 0), 0);
        const totalWeight = tripOrders.reduce((s, o) => s + (o.weight_kg || 0), 0);
        const totalRevenue = tripOrders.reduce((s, o) => s + (o.customer_price || 0), 0);

        return (
          <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm animate-in slide-in-from-bottom-2">
            {/* Row 1: Trip / Vehicle summary - Responsive */}
            <div className="px-3 md:px-5 py-2 md:py-2.5 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 md:gap-2 mb-0.5 flex-wrap">
                  {selectedGanttTrip && <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground/60">{selectedGanttTrip.trip_id.slice(0, 8)}</span>}
                  <span className="text-xs md:text-sm font-semibold">{tripOrders.length} order{tripOrders.length !== 1 ? "s" : ""}</span>
                  {tripOrders.map(o => (
                    <Badge key={o.id} variant="outline" className={`text-[9px] md:text-[10px] cursor-pointer hover:opacity-80 ${STATUS_COLORS[o.status]}`}
                      onClick={() => window.open(`/admin/tms/orders/${o.id}`, "_blank")}>
                      {o.reference_number}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-muted-foreground flex-wrap">
                  {selectedGanttTrip && selectedGanttTrip.stops.length > 0 && (
                    <span className="flex items-center gap-1">
                      <CountryFlag country={selectedGanttTrip.stops[0].country} className="w-3.5 h-2.5" />
                      <span className="hidden sm:inline">{selectedGanttTrip.stops[0].city}</span>
                      <ArrowRight className="h-2.5 w-2.5 opacity-40" />
                      <CountryFlag country={selectedGanttTrip.stops[selectedGanttTrip.stops.length - 1].country} className="w-3.5 h-2.5" />
                      <span className="hidden sm:inline">{selectedGanttTrip.stops[selectedGanttTrip.stops.length - 1].city}</span>
                    </span>
                  )}
                  {selectedGanttTrip?.distance_km && <span className="flex items-center gap-1"><Route className="h-3 w-3" /> {Math.round(selectedGanttTrip.distance_km)} km</span>}
                  {selectedGanttTrip?.duration_minutes && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {Math.floor(selectedGanttTrip.duration_minutes / 60)}h{Math.round(selectedGanttTrip.duration_minutes % 60)}m</span>}
                </div>
              </div>
              
              {/* Mobile: Compact info row */}
              <div className="flex md:hidden items-center gap-3 text-[10px] border-t border-border/20 pt-1.5 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">Vehicle:</span>
                  <span className="font-medium">{vehicle?.plate_number || <span className="text-red-400">N/A</span>}</span>
                  {gpsPos && <SatelliteDish className="h-2.5 w-2.5 text-blue-400" />}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">Driver:</span>
                  <span className="font-medium">{driver?.name || <span className="text-red-400">N/A</span>}</span>
                  {driver?.is_online && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">Cargo:</span>
                  <span className="font-medium">{totalPallets}p · {totalWeight ? `${(totalWeight / 1000).toFixed(1)}t` : "-"}</span>
                </span>
                {totalRevenue > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground">Rev:</span>
                    <span className="font-medium text-emerald-400">EUR {totalRevenue.toLocaleString()}</span>
                  </span>
                )}
              </div>
              
              {/* Desktop: Info columns */}
              <div className="hidden md:flex items-center gap-5 text-xs shrink-0">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Vehicle</div>
                  <div className="font-medium flex items-center gap-1">
                    {vehicle?.plate_number ? <>{vehicle.plate_number}{gpsPos && <SatelliteDish className="h-2.5 w-2.5 text-blue-400" />}</> : <span className="text-red-400">Unassigned</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Driver</div>
                  <div className="font-medium flex items-center gap-1">
                    {driver ? (<>{driver.is_online && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}{driver.name}</>) : <span className="text-red-400">Unassigned</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Cargo</div>
                  <div className="font-medium">{totalPallets}p · {totalWeight ? `${(totalWeight / 1000).toFixed(1)}t` : "-"}</div>
                </div>
                {totalRevenue > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Revenue</div>
                    <div className="font-medium text-emerald-400">EUR {totalRevenue.toLocaleString()}</div>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1.5 md:gap-2 shrink-0 ml-auto md:ml-0">
                {selectedGanttTrip && (
                  <Button variant="outline" size="sm" className="h-8 md:h-7 text-xs px-2 md:px-3"
                    onClick={() => {
                      // Pass the vehicle_id so the editor can filter to that leg's stops
                      const url = `/admin/tms/trips/${selectedGanttTrip.trip_id}/edit?vehicle=${selectedGanttTrip.vehicle_id || ""}`;
                      window.open(url, "_blank");
                    }}>
                    <Edit2 className="h-3 w-3 md:mr-1" /><span className="hidden md:inline">Edit Trip</span>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={() => { setSelectedOrderId(null); setSelectedTripId(null); }}>
                  <XCircle className="h-4 w-4 md:h-3.5 md:w-3.5" />
                </Button>
              </div>
            </div>

            {/* Row 2: Trip stops timeline */}
            {hasTrips && (
              <div className="border-t border-border/30 px-3 md:px-5 py-2 overflow-x-auto">
                <div className="flex gap-2 md:gap-4 min-w-max">
                  {selectedOrderTrips.map((trip, ti) => {
                    // If trip has legs, render each leg separately with its own filtered stops
                    const legs = trip.trip_legs?.length > 0 ? trip.trip_legs : [null];
                    return (
                      <React.Fragment key={trip.id}>
                        {legs.map((leg: any, legIdx: number) => {
                      // Filter stops for this leg
                      const legStops = leg
                        ? trip.trip_stops.filter((_: any, idx: number) => idx >= leg.from_stop_index && idx <= leg.to_stop_index)
                        : trip.trip_stops;
                      
                      const completedCount = legStops.filter((ts: any) => ts.status === "completed").length;
                      const totalStops = legStops.length;
                      
                      // Get leg-specific vehicle/driver info
                      const legVehicleId = leg?.vehicle_id || trip.vehicle_id;
                      const legVehicle = legVehicleId ? vehicles.find(v => v.id === legVehicleId) : vehicles.find(v => v.plate_number === trip.vehicle_plate);
                      const legDriverId = leg?.driver_id || trip.driver_id;
                      const legDriver = legDriverId ? drivers.find(d => d.id === legDriverId) : drivers.find(d => d.name === trip.driver_name);
                      
                      const vehicleGps2 = legVehicle ? gpsPositions.get(legVehicle.id) : null;
                      const driverPos = legDriver?.last_lat && legDriver?.last_lng ? { lat: legDriver.last_lat, lng: legDriver.last_lng } : null;
                      const eta = calcEtaFromPolyline(
                        vehicleGps2 ? { lat: vehicleGps2.latitude, lng: vehicleGps2.longitude, speed: vehicleGps2.speed } : null,
                        driverPos,
                        legStops
                      );
                      
                      const isForwarding = leg?.assignment_type === "forwarding" || leg?.assignment_type === "subcontract" || leg?.carrier_id;
                      const legLabel = leg ? `Leg ${leg.leg_number}` : `RT ${ti + 1}`;
                      
                      return (
                        <div key={`${trip.id}-${legIdx}`} className="shrink-0 flex-1 min-w-[220px] md:min-w-[280px]">
                          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-1.5 flex-wrap">
                            <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground/60">{legLabel}</span>
                            <Badge variant="outline" className={`text-[8px] md:text-[9px] h-4 ${isForwarding ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                              {isForwarding ? "Subcontract" : "Own Fleet"}
                            </Badge>
                            {!isForwarding && legVehicle?.plate_number && <span className="text-[9px] md:text-[10px] font-medium">{legVehicle.plate_number}</span>}
                            {!isForwarding && legDriver?.name && <span className="hidden sm:inline text-[9px] md:text-[10px] text-muted-foreground">{legDriver.name}</span>}
                            {eta && !isForwarding && (
                              <span className="text-[8px] md:text-[9px] font-medium px-1 md:px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                                ETA {eta.remainingKm}km ~{eta.etaMinutes < 60 ? `${eta.etaMinutes}m` : `${Math.floor(eta.etaMinutes / 60)}h${eta.etaMinutes % 60}m`}
                              </span>
                          )}
                          <span className="text-[9px] md:text-[10px] text-muted-foreground ml-auto">{completedCount}/{totalStops}</span>
                        </div>
                        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none pb-1">
                          {legStops.map((ts: any, si: number) => {
                            const actionName = ts.action_type?.name || ts.stop_type;
                            const isActive = ts.status === "en_route" || ts.status === "arrived" || ts.status === "in_action";
                            const isEtaTarget = eta?.stopId === ts.id;
                            // Color-code stops by order
                            const stopOrderRef = ts.order?.reference_number || ts.order_ref || "";
                            const orderIdx = tripOrders.findIndex(o => o.reference_number === stopOrderRef || o.id === ts.order_id);
                            const orderColors = ["text-blue-400", "text-amber-400", "text-emerald-400", "text-pink-400", "text-violet-400"];
                            const orderColor = orderIdx >= 0 ? orderColors[orderIdx % orderColors.length] : "";
                            return (
                              <React.Fragment key={ts.id}>
                                <div className={`group relative flex items-center gap-1 px-1.5 py-1 rounded ${isActive ? "bg-primary/10 ring-1 ring-primary/20" : ""} ${isEtaTarget ? "ring-1 ring-blue-400/30" : ""}`}>
                                  {STOP_STATUS_ICON[ts.status] || STOP_STATUS_ICON.pending}
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-medium leading-tight whitespace-nowrap">{ts.city || ts.company_name || `Stop ${ts.sequence_order}`}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] text-muted-foreground/60 leading-tight whitespace-nowrap">{actionName}</span>
                                      {stopOrderRef && tripOrders.length > 1 && (
                                        <span className={`text-[7px] font-mono leading-tight whitespace-nowrap ${orderColor}`}>{stopOrderRef.split("-").pop()}</span>
                                      )}
                                    </div>
                                    {ts.planned_date && (
                                      <span className="text-[8px] text-muted-foreground/50 leading-tight whitespace-nowrap">
                                        {ts.planned_date.slice(5)}{ts.planned_time_from ? ` ${ts.planned_time_from.slice(0, 5)}` : ""}
                                      </span>
                                    )}
                                  </div>
                                  <div className="hidden group-hover:block absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[100] bg-popover border border-border rounded-md shadow-lg px-2.5 py-1.5 min-w-[180px] pointer-events-none">
                                    <p className="text-[10px] font-semibold">{ts.company_name || ts.city}</p>
                                    {ts.address && <p className="text-[9px] text-muted-foreground">{ts.address}</p>}
                                    {stopOrderRef && <p className={`text-[9px] font-mono ${orderColor}`}>{stopOrderRef}</p>}
                                    {ts.planned_date && <p className="text-[9px] text-muted-foreground">{ts.planned_date}{ts.planned_time_from ? ` ${ts.planned_time_from}` : ""}{ts.planned_time_to ? `-${ts.planned_time_to}` : ""}</p>}
                                    {ts.distance_to_km != null && <p className="text-[9px] text-muted-foreground">{Math.round(ts.distance_to_km)} km from prev</p>}
                                    {ts.duration_to_minutes != null && <p className="text-[9px] text-muted-foreground">{Math.round(ts.duration_to_minutes)} min from prev</p>}
                                    {isEtaTarget && eta && <p className="text-[9px] font-medium text-blue-400 mt-0.5">ETA: ~{eta.etaMinutes}min ({eta.remainingKm}km via {eta.source})</p>}
                                    {ts.actual_arrival && <p className="text-[9px] text-emerald-400">Arrived: {new Date(ts.actual_arrival).toLocaleTimeString()}</p>}
                                    {ts.actual_departure && <p className="text-[9px] text-emerald-400">Departed: {new Date(ts.actual_departure).toLocaleTimeString()}</p>}
                                    {ts.notes && <p className="text-[9px] text-muted-foreground/80 mt-0.5 italic">{ts.notes}</p>}
                                    <p className="text-[9px] font-medium mt-0.5 capitalize">{ts.status.replace("_", " ")}</p>
                                  </div>
                                </div>
                                {si < legStops.length - 1 && (() => {
                                  const nextStop = legStops[si + 1];
                                  const legKm = nextStop?.distance_to_km;
                                  const legMin = nextStop?.duration_to_minutes;
                                  return (
                                    <div className="flex flex-col items-center gap-0 shrink-0 mx-0.5">
                                      <ArrowRight className={`h-2.5 w-2.5 ${ts.status === "completed" ? "text-emerald-500/50" : "text-muted-foreground/20"}`} />
                                      {legKm != null && (
                                        <span className="text-[7px] text-muted-foreground/40 leading-none whitespace-nowrap">
                                          {Math.round(legKm)}km{legMin != null ? ` ${legMin < 60 ? `${Math.round(legMin)}m` : `${Math.floor(legMin / 60)}h${Math.round(legMin % 60) > 0 ? Math.round(legMin % 60) + "m" : ""}`}` : ""}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        </div>
                        );
                      })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Row 3: Order cards for multi-order trips */}
            {tripOrders.length > 1 && (
              <div className="border-t border-border/30 px-5 py-2">
                <div className="flex gap-3 overflow-x-auto scrollbar-none">
                  {tripOrders.map((o, oi) => {
                    const orderColors = ["border-blue-500/30 bg-blue-500/5", "border-amber-500/30 bg-amber-500/5", "border-emerald-500/30 bg-emerald-500/5", "border-pink-500/30 bg-pink-500/5"];
                    return (
                      <div key={o.id} className={`shrink-0 rounded-md border px-3 py-2 min-w-[200px] cursor-pointer hover:opacity-80 ${orderColors[oi % orderColors.length]}`}
                        onClick={() => window.open(`/admin/tms/orders/${o.id}`, "_blank")}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold">{o.reference_number}</span>
                          <Badge variant="outline" className={`text-[8px] h-3.5 ${STATUS_COLORS[o.status]}`}>{o.status.replace("_", " ")}</Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                          {o.stops?.filter((s: any) => s.city).slice(0, 2).map((s: any, i: number, arr: any[]) => (
                            <React.Fragment key={i}>
                              <CountryFlag country={s.country} className="w-3 h-2" />
                              <span>{s.city}</span>
                              {i < arr.length - 1 && <ArrowRight className="h-2 w-2 opacity-40" />}
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
                          <span>{o.customer_name}</span>
                          {o.pallet_count && <span>{o.pallet_count}p</span>}
                          {o.customer_price && <span className="text-emerald-400">{o.customer_currency} {o.customer_price.toLocaleString()}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No trips message (single order, no trips) */}
                {!hasTrips && tripOrders.length <= 1 && (order.status === "confirmed_to_customer" || order.status === "in_execution") && (
              <div className="border-t border-border/30 px-5 py-1.5">
                <span className="text-[10px] text-muted-foreground/50">No execution trips created yet</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
