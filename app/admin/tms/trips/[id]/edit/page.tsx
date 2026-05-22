"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { RouteMap } from "@/components/tms/route-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Truck, MapPin, Clock, User, Package, Save, Search, Check,
  X, ChevronLeft, ChevronRight, GripVertical, Plus, Trash2, Phone, FileText, Loader2,
  Route as RouteIcon, Fuel, ArrowRight, Building2, UserPlus, Split,
  TrendingUp, TrendingDown, AlertTriangle, Layers, CheckCircle2,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { TILE_LAYER_ENTRIES, TILE_LAYERS, type TileKey } from "@/lib/tms/map-tiles";
import { useUserPreference } from "@/hooks/use-user-preference";
import { QuickCreatePartnerDialog } from "@/components/tms/quick-create-partner-dialog";
import { AddOrderToTripDialog } from "@/components/tms/add-order-to-trip-dialog";
import { TripStatusStepper } from "@/components/tms/trip-editor/trip-status-stepper";
import { TripPnLPill } from "@/components/tms/trip-editor/trip-pnl-pill";
import { TripOpsDrawer } from "@/components/tms/trip-editor/trip-ops-drawer";

// ── Helpers ──
const COUNTRY_MAP: Record<string, string> = {
  Germany: "de", Netherlands: "nl", Belgium: "be", France: "fr", Luxembourg: "lu",
  Austria: "at", Switzerland: "ch", Poland: "pl", "Czech Republic": "cz", Czechia: "cz",
  Denmark: "dk", Spain: "es", Italy: "it", Portugal: "pt", Romania: "ro",
  Hungary: "hu", "United Kingdom": "gb", Ireland: "ie", Sweden: "se", Norway: "no",
  Finland: "fi", Bulgaria: "bg", Croatia: "hr", Slovakia: "sk", Slovenia: "si",
  Lithuania: "lt", Latvia: "lv", Estonia: "ee", Greece: "gr",
};
function getCountryCode(c: string): string {
  if (!c) return "";
  if (c.length === 2) return c.toLowerCase();
  return COUNTRY_MAP[c] || "";
}
function getCountryFlagUrl(country: string): string {
  const code = getCountryCode(country);
  return code ? `https://flagcdn.com/w20/${code}.png` : "";
}

interface TripStop {
  id: string;
  sequence_order: number;
  stop_type: string;
  company_name: string;
  address: string;
  city: string;
  country: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  planned_date: string;
  planned_time_from: string;
  planned_time_to: string;
  status: string;
  notes: string;
  contact_name?: string;
  contact_phone?: string;
  reference_number?: string;
  form_id?: string;
  order_id: string | null;
  order_stop_id?: string | null;
  distance_to_km: number | null;
  duration_to_minutes: number | null;
  route_to_geometry: any;
  action_type?: { id: string; code: string; name: string; icon: string; color: string } | null;
  order_ref?: string;
}

interface Driver { id: string; name: string; }
interface Vehicle { id: string; plate_number: string; make: string | null; model: string | null; max_weight_kg: number | null; max_pallets: number | null; }
interface Trailer { id: string; plate_number: string; trailer_type: string; max_weight_kg: number | null; max_pallets: number | null; }
interface Carrier { id: string; name: string; }

export default function TripEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { session: adminSession } = useAdminSession();
  const supabase = createClient();
  const tripId = params.id as string;
  const filterVehicleId = searchParams.get("vehicle") || null;
  // ?scope=full disables the auto-scope to the trip's primary resource and
  // shows every stop in the trip (including subcontracted legs).
  const showFullTrip = searchParams.get("scope") === "full";

  // Trip data
  const [trip, setTrip] = useState<any>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [allStops, setAllStops] = useState<TripStop[]>([]);
  const [legBoundaries, setLegBoundaries] = useState<{ from: number; to: number } | null>(null);
  const [isScopedToResource, setIsScopedToResource] = useState(false);
  const [linkedOrders, setLinkedOrders] = useState<any[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ geometry: [number, number][] | null; distance_km: number; duration_hours: number; legs: any[] }>({ geometry: null, distance_km: 0, duration_hours: 0, legs: [] });

  // Reference data
  const [drivers, setDrivers] = useState<Driver[]>([]);
const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [showQuickCreateCarrier, setShowQuickCreateCarrier] = useState(false);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [removingOrderId, setRemovingOrderId] = useState<string | null>(null);

  // Route waypoints (intermediate drag-points for draggable route)
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);

  // UI state
  // Both default closed -- the stop-details panel only opens when the user clicks a stop in the list.
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [showStopDetails, setShowStopDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingStop, setSearchingStop] = useState<number | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // GPS overlay supplied by the Planned-vs-Actual tab. The `segments`
  // payload mirrors the Dispatcher's Route History (trip + stop nodes,
  // rotating per-trip color, hovered/selected indices) and also carries
  // the `loaded` flag so the map can dash empty trip legs ("km pe gol").
  const [gpsTrackOverlay, setGpsTrackOverlay] = useState<{
    source: string;
    positions: { lat: number; lng: number; timestamp: string }[];
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
        timestamp: string;
        speed?: number | null;
        heading?: number | null;
      }[];
    }>;
  } | null>(null);
  const [pnlRefreshKey, setPnlRefreshKey] = useState(0);
  const [routeStrategy, setRouteStrategy] = useState<"fastest" | "avoid_tolls" | "shortest">("fastest");
  // Expenses with GPS coords plotted as pins on the map
  const [expenseMarkers, setExpenseMarkers] = useState<Array<{
    id: string;
    category: string;
    amount: number;
    currency: string;
    vendor: string | null;
    occurred_at: string;
    latitude: number;
    longitude: number;
    location_label?: string | null;
  }>>([]);

  // ── Map base-tile + live overlay ──────────────────────────
  // Tile preference is per-user (server-backed via /api/admin/user-preferences)
  // so dispatchers see the same map style on every device they sign into.
  const [activeTile, setActiveTile] = useUserPreference<TileKey>("map.tile.tripEdit", "dark");
  const [tileMenuOpen, setTileMenuOpen] = useState(false);

  // ── Layout preferences ────────────────────────────────────
  // Both floating panels can be collapsed to give the map more breathing
  // room when a dispatcher just wants to glance at the live track. State
  // persists per user via the user_preferences table (instant-paint via
  // localStorage cache).
  const [executionCollapsed, setExecutionCollapsed] = useUserPreference<boolean>(
    "tripEdit.executionCollapsed",
    false
  );
  const [drawerOpen, setDrawerOpen] = useUserPreference<boolean>(
    "tripEdit.drawerOpen",
    false
  );

  // Live positions of THIS trip's vehicle / trailer / driver
  const [liveResources, setLiveResources] = useState<{
    vehicle?: { plate: string; lat: number; lng: number; speed?: number; course?: number; updatedAt?: string | null } | null;
    trailer?: { plate: string; lat: number; lng: number; speed?: number; course?: number; updatedAt?: string | null } | null;
    driver?: { name: string; lat: number; lng: number; updatedAt?: string | null } | null;
  } | null>(null);

  const fetchExpenseMarkers = useCallback(async () => {
    if (!tripId) return;
    try {
      const res = await fetch(`/api/admin/tms/trips/${tripId}/expenses`);
      const j = await res.json();
      const pins = (j.expenses ?? [])
        .filter((e: any) => e.status !== "rejected" && e.latitude != null && e.longitude != null)
        .map((e: any) => ({
          id: e.id,
          category: e.category,
          amount: Number(e.amount) || 0,
          currency: e.currency || "EUR",
          vendor: e.vendor,
          occurred_at: e.occurred_at,
          latitude: Number(e.latitude),
          longitude: Number(e.longitude),
          location_label: e.location_label,
        }));
      setExpenseMarkers(pins);
    } catch (err) {
      console.log("[v0] fetchExpenseMarkers failed", err);
    }
  }, [tripId]);

  useEffect(() => { fetchExpenseMarkers(); }, [fetchExpenseMarkers, pnlRefreshKey]);

  // ── Poll live positions for THIS trip's vehicle / trailer / driver ──
  // Reuses the dispatch board's /api/traccar/positions endpoint and filters
  // down to the resources actually assigned on this trip. Polls every 15s
  // (matches the dashboard cadence) and is a no-op when nothing is assigned
  // or while we're still loading the trip.
  useEffect(() => {
    if (!adminSession?.id || !trip || trip.assignment_type === "forwarding") {
      setLiveResources(null);
      return;
    }
    const vehicleId = trip.vehicle_id as string | null;
    const trailerId = trip.trailer_id as string | null;
    const driverId = trip.driver_id as string | null;
    if (!vehicleId && !trailerId && !driverId) {
      setLiveResources(null);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const next: NonNullable<typeof liveResources> = {};

        // Vehicle + trailer come from Traccar (same endpoint dispatch uses)
        if (vehicleId || trailerId) {
          const res = await fetch(`/api/traccar/positions?adminId=${adminSession.id}`);
          if (res.ok) {
            const j = await res.json();
            const vehicles: any[] = j.vehicles ?? [];
            const trailerList: any[] = j.trailers ?? [];

            if (vehicleId) {
              const match = vehicles.find((v: any) => v.vehicle_id === vehicleId || v.id === vehicleId);
              if (match && match.latitude != null && match.longitude != null) {
                next.vehicle = {
                  plate: match.vehicle_plate || match.plate_number || "",
                  lat: Number(match.latitude),
                  lng: Number(match.longitude),
                  speed: Number(match.speed) || 0,
                  course: Number(match.course) || 0,
                  updatedAt: match.lastUpdate || null,
                };
              }
            }
            if (trailerId) {
              const match = trailerList.find((t: any) => t.trailer_id === trailerId || t.id === trailerId);
              if (match && match.latitude != null && match.longitude != null) {
                next.trailer = {
                  plate: match.trailer_plate || match.plate_number || "",
                  lat: Number(match.latitude),
                  lng: Number(match.longitude),
                  speed: Number(match.speed) || 0,
                  course: Number(match.course) || 0,
                  updatedAt: match.lastUpdate || null,
                };
              }
            }
          }
        }

        // Driver position lives on the drivers table (driver app updates it)
        if (driverId) {
          const { data: d } = await supabase
            .from("drivers")
            .select("name, last_lat, last_lng, last_seen_at, is_online")
            .eq("id", driverId)
            .maybeSingle();
          if (d && d.last_lat != null && d.last_lng != null) {
            next.driver = {
              name: d.name || "Driver",
              lat: Number(d.last_lat),
              lng: Number(d.last_lng),
              updatedAt: d.last_seen_at || null,
            };
          }
        }

        if (!cancelled) {
          setLiveResources(Object.keys(next).length ? next : null);
        }
      } catch (err) {
        console.log("[v0] trip live positions fetch failed", err);
      }
    };

    tick();
    const iv = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [adminSession?.id, trip, supabase]);

  // ── Load trip data ──
  const fetchTrip = useCallback(async () => {
    const { data: tripData } = await supabase
      .from("trips").select(`
        id, status, driver_id, vehicle_id, trailer_id, distance_km, duration_minutes, route_geometry, assignment_type,
        reference_number, planned_start, planned_end, actual_start, actual_end,
        carrier_id, carrier_cost, carrier_currency,
        driver:driver_id(id, name), vehicle:vehicle_id(id, plate_number), trailer:trailer_id(id, plate_number, trailer_type),
        carrier:carrier_id(id, name),
        trip_stops(id, sequence_order, stop_type, company_name, address, city, country, postal_code,
                   order_id, lat, lng, planned_date, planned_time_from, planned_time_to, status, notes,
                   contact_name, contact_phone, reference_number, form_id,
                   route_to_geometry, distance_to_km, duration_to_minutes,
                   action_type:action_type_id(id, code, name, icon, color)),
          trip_legs(id, leg_number, assignment_type, from_stop_index, to_stop_index, vehicle_id, driver_id, carrier_id, route_strategy)
      `).eq("id", tripId).single();

    if (!tripData) { toast({ title: "Trip not found", variant: "destructive" }); return; }

    setTrip(tripData);
    const sortedAll = (tripData.trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);

    // Determine which legs belong to THIS trip's primary resource. A "Round Trip"
    // represents only the legs executed by the trip's main vehicle (own_fleet) or
    // main carrier (full subcontract). Other legs (e.g. forwarding) belong to
    // OTHER round trips and must be hidden in this editor.
    //
    //  - Explicit ?vehicle=<id> override (from Dispatch Board "Edit Trip"):
    //      filter to legs where vehicle_id === filterVehicleId
    //  - Otherwise:
    //      if trip.vehicle_id present  -> own-fleet legs of that vehicle
    //      else if trip.carrier_id     -> subcontract legs of that carrier
    //      else                         -> show everything (no filtering)
    //
    // We cover the case where a trip has no trip_legs row by falling back to all stops.
    let sorted = sortedAll;
    let boundaries: { from: number; to: number } | null = null;
    let scopedToResource = false;
    const legs: any[] = tripData.trip_legs || [];
    if (!showFullTrip && legs.length > 0 && sortedAll.length > 0) {
      let matchingLegs: any[] = [];
      if (filterVehicleId) {
        matchingLegs = legs.filter((l: any) => l.vehicle_id === filterVehicleId);
      } else if (tripData.vehicle_id) {
        matchingLegs = legs.filter((l: any) => l.vehicle_id === tripData.vehicle_id);
      } else if (tripData.carrier_id) {
        matchingLegs = legs.filter((l: any) => l.carrier_id === tripData.carrier_id);
      }
      if (matchingLegs.length > 0) {
        // Use the union (min from_idx … max to_idx) so consecutive legs by the
        // same resource appear as a single contiguous round trip.
        let fromIdx = Number.POSITIVE_INFINITY;
        let toIdx = Number.NEGATIVE_INFINITY;
        matchingLegs.forEach((l: any) => {
          if (typeof l.from_stop_index === "number") fromIdx = Math.min(fromIdx, l.from_stop_index);
          if (typeof l.to_stop_index === "number") toIdx = Math.max(toIdx, l.to_stop_index);
        });
        if (Number.isFinite(fromIdx) && Number.isFinite(toIdx) && toIdx >= fromIdx) {
          fromIdx = Math.max(0, fromIdx);
          toIdx = Math.min(sortedAll.length - 1, toIdx);
          sorted = sortedAll.filter((_: any, idx: number) => idx >= fromIdx && idx <= toIdx);
          boundaries = { from: fromIdx, to: toIdx };
          scopedToResource = true;
        }
      }
    }
    setLegBoundaries(boundaries);
    setIsScopedToResource(scopedToResource);

    // Fetch orders from trip_orders table (proper linking) AND from stops
    const stopOrderIds = [...new Set(sorted.filter((s: any) => s.order_id).map((s: any) => s.order_id))];
    const { data: tripOrderLinks } = await supabase.from("trip_orders").select("order_id").eq("trip_id", tripId);
    const tripOrderIds = tripOrderLinks?.map(to => to.order_id) || [];
    
    // Combine all order IDs (from stops and from trip_orders)
    const allOrderIds = [...new Set([...stopOrderIds, ...tripOrderIds])];
    let orderMap: Record<string, string> = {};
    if (allOrderIds.length > 0) {
      const { data: orders } = await supabase.from("orders").select("id, reference_number, customer_id, status, order_type, pallet_count, weight_kg, loading_meters, commercial_role, parent_order_id, customer_price, customer_currency, parent_order:parent_order_id(id, reference_number), partners:customer_id(id, name)").in("id", allOrderIds);
      if (orders) {
        orders.forEach((o: any) => { orderMap[o.id] = o.reference_number; });
        setLinkedOrders(orders);
      }
    }

    const enrichedStops = sorted.map((s: any) => ({ ...s, order_ref: s.order_id ? orderMap[s.order_id] || s.order_id.substring(0, 8) : null }));
    const enrichedAllStops = sortedAll.map((s: any) => ({ ...s, order_ref: s.order_id ? orderMap[s.order_id] || s.order_id.substring(0, 8) : null }));
    setStops(enrichedStops);
    setAllStops(enrichedAllStops);
    setRouteInfo({
      geometry: tripData.route_geometry || null,
      distance_km: tripData.distance_km || 0,
      duration_hours: (tripData.duration_minutes || 0) / 60,
      legs: [],
    });
    // Hydrate route strategy from the first leg (single-leg trips share one strategy)
    const firstLeg = (tripData.trip_legs || [])[0];
    if (firstLeg?.route_strategy && ["fastest", "avoid_tolls", "shortest"].includes(firstLeg.route_strategy)) {
      setRouteStrategy(firstLeg.route_strategy);
    }
    setLoading(false);
  }, [tripId, supabase, toast, filterVehicleId, showFullTrip]);

  // ── Remove an order from this trip (without deleting the order) ──
  const removeOrderFromTrip = async (orderId: string, ref: string) => {
    if (linkedOrders.length <= 1) {
      toast({ title: "Can't remove the last order", description: "A trip must carry at least one order.", variant: "destructive" });
      return;
    }
    if (!confirm(`Remove ${ref} from this trip? The order itself stays intact.`)) return;
    setRemovingOrderId(orderId);
    try {
      // 1) Drop the trip_orders link
      const { error: linkErr } = await supabase
        .from("trip_orders")
        .delete()
        .eq("trip_id", tripId)
        .eq("order_id", orderId);
      if (linkErr) throw linkErr;

      // 2) Drop every trip_stops row that came from that order
      const { error: stopsErr } = await supabase
        .from("trip_stops")
        .delete()
        .eq("trip_id", tripId)
        .eq("order_id", orderId);
      if (stopsErr) throw stopsErr;

      toast({ title: `Removed ${ref}` });
      await fetchTrip();
    } catch (err: any) {
      console.log("[v0] removeOrderFromTrip failed", err);
      toast({ title: "Could not remove order", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setRemovingOrderId(null);
    }
  };

  // ── Load reference data ──
  useEffect(() => {
    if (!adminSession?.id) return;
    (async () => {
      const [{ data: d }, { data: v }, { data: t }, { data: c }] = await Promise.all([
        supabase.from("drivers").select("id, name").eq("admin_id", adminSession.id).order("name"),
        supabase.from("vehicles").select("id, plate_number, make, model, max_weight_kg, max_pallets").eq("admin_id", adminSession.id).order("plate_number"),
        supabase.from("trailers").select("id, plate_number, trailer_type, max_weight_kg, max_pallets").eq("admin_id", adminSession.id).order("plate_number"),
        supabase.from("partners").select("id, name").eq("admin_id", adminSession.id).eq("partner_type", "carrier").order("name"),
      ]);
      setDrivers(d || []);
      setVehicles(v || []);
      setTrailers(t || []);
      setCarriers(c || []);
    })();
  }, [adminSession?.id, supabase]);

  useEffect(() => { fetchTrip(); }, [fetchTrip]);

  // ── Address search ──
  const searchAddress = (query: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 3) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        const data = await res.json();
        setSearchResults(data || []);
      } catch { setSearchResults([]); }
    }, 400);
  };

  // ── Update stop ──
  const updateStop = (idx: number, updates: Partial<TripStop>) => {
    setStops(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  // ── Drag and drop ──
  const handleStopDrop = (toIndex: number) => {
    if (dragIdx === null || dragIdx === toIndex) return;
    const newStops = [...stops];
    const [removed] = newStops.splice(dragIdx, 1);
    newStops.splice(toIndex, 0, removed);
    setStops(newStops.map((s, i) => ({ ...s, sequence_order: i + 1 })));
    setSelectedStopIndex(toIndex);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ── Add stop ──
  const addStop = () => {
    const newStop: TripStop = {
      id: `new-${Date.now()}`,
      sequence_order: stops.length + 1,
      stop_type: "transit",
      company_name: "",
      address: "",
      city: "",
      country: "",
      postal_code: "",
      lat: null,
      lng: null,
      planned_date: "",
      planned_time_from: "",
      planned_time_to: "",
      status: "pending",
      notes: "",
      order_id: null,
      order_stop_id: null,
      contact_name: null,
      contact_phone: null,
      reference_number: null,
      distance_to_km: null,
      duration_to_minutes: null,
      route_to_geometry: null,
    };
    setStops(prev => [...prev, newStop]);
    setSelectedStopIndex(stops.length);
    setShowStopDetails(true);
  };

  // ── Remove stop ──
  const removeStop = (idx: number) => {
    if (stops.length <= 1) return;
    setStops(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequence_order: i + 1 })));
    if (selectedStopIndex === idx) setSelectedStopIndex(Math.max(0, idx - 1));
    else if (selectedStopIndex !== null && selectedStopIndex > idx) setSelectedStopIndex(selectedStopIndex - 1);
  };

// ── Save ──
  const saveTrip = async () => {
    setSaving(true);
    try {
      // Update trip with assignment type and carrier info
      await supabase.from("trips").update({
        driver_id: trip.assignment_type === "forwarding" ? null : trip.driver_id,
        vehicle_id: trip.assignment_type === "forwarding" ? null : trip.vehicle_id,
        trailer_id: trip.assignment_type === "forwarding" ? null : trip.trailer_id,
        assignment_type: trip.assignment_type || "internal",
        carrier_id: trip.assignment_type === "forwarding" ? trip.carrier_id : null,
        carrier_cost: trip.assignment_type === "forwarding" ? trip.carrier_cost : null,
        carrier_currency: trip.assignment_type === "forwarding" ? (trip.carrier_currency || "EUR") : null,
        route_geometry: routeInfo.geometry,
        distance_km: routeInfo.distance_km,
        duration_minutes: Math.round((routeInfo.duration_hours || 0) * 60 + (routeInfo.duration_minutes || 0)),
      }).eq("id", tripId);

      // Update/insert stops
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const payload = {
          trip_id: tripId,
          sequence_order: i + 1,
          stop_type: stop.stop_type,
          company_name: stop.company_name,
          address: stop.address,
          city: stop.city,
          country: stop.country,
          postal_code: stop.postal_code,
          lat: stop.lat,
          lng: stop.lng,
          planned_date: stop.planned_date || null,
          planned_time_from: stop.planned_time_from || null,
          planned_time_to: stop.planned_time_to || null,
          notes: stop.notes || null,
          contact_name: stop.contact_name || null,
          contact_phone: stop.contact_phone || null,
          reference_number: stop.reference_number || null,
          distance_to_km: stop.distance_to_km,
          duration_to_minutes: stop.duration_to_minutes,
          route_to_geometry: stop.route_to_geometry,
        };

        if (stop.id.startsWith("new-")) {
          const { error: insertErr } = await supabase.from("trip_stops").insert({
            ...payload,
            order_id: stop.order_id || null,
            order_stop_id: stop.order_stop_id || null,
            status: "pending",
          });
          if (insertErr) console.error("[v0] Failed to insert trip_stop:", insertErr.message, payload);
        } else {
          const { error: updateErr } = await supabase.from("trip_stops").update(payload).eq("id", stop.id);
          if (updateErr) console.error("[v0] Failed to update trip_stop:", updateErr.message);
        }
      }

      // Delete removed stops (stops that existed in DB but aren't in our list)
      const existingIds = stops.filter(s => !s.id.startsWith("new-")).map(s => s.id);
      if (trip.trip_stops?.length) {
        const toDelete = trip.trip_stops.filter((ts: any) => !existingIds.includes(ts.id)).map((ts: any) => ts.id);
        if (toDelete.length) {
          await supabase.from("trip_stops").delete().in("id", toDelete);
        }
      }

      // Sync carrier assignment to linked orders so downstream queries work
      const linkedOrderIds = linkedOrders.map((o: any) => o.id);
      if (linkedOrderIds.length > 0) {
        if (trip.assignment_type === "forwarding" && trip.carrier_id) {
          // Mark orders as subcontracted
          await supabase.from("orders").update({
            carrier_id: trip.carrier_id,
            vehicle_id: null,
            driver_id: null,
          }).in("id", linkedOrderIds);
        } else {
          // Clear carrier, set vehicle/driver from trip
          await supabase.from("orders").update({
            carrier_id: null,
            vehicle_id: trip.vehicle_id || null,
            driver_id: trip.driver_id || null,
          }).in("id", linkedOrderIds);
        }
      }

      // Sync trip_legs with current assignment (upsert the single leg for this trip)
      const legPayload = {
        trip_id: tripId,
        assignment_type: trip.assignment_type === "forwarding" ? "forwarding" : "own_fleet",
        carrier_id: trip.assignment_type === "forwarding" ? trip.carrier_id : null,
        vehicle_id: trip.assignment_type === "forwarding" ? null : trip.vehicle_id,
        driver_id: trip.assignment_type === "forwarding" ? null : trip.driver_id,
        route_strategy: routeStrategy,
      };
      const { data: existingLeg } = await supabase
        .from("trip_legs")
        .select("id")
        .eq("trip_id", tripId)
        .limit(1)
        .single();
      if (existingLeg) {
        await supabase.from("trip_legs").update(legPayload).eq("id", existingLeg.id);
      } else {
        await supabase.from("trip_legs").insert({ ...legPayload, sequence_order: 1, status: "planned" });
      }

      toast({ title: "Trip saved successfully" });
      fetchTrip(); // Refresh data
    } catch (err: any) {
      toast({ title: "Error saving trip", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedStop = selectedStopIndex !== null ? stops[selectedStopIndex] : null;
  const driverObj = trip?.driver || drivers.find(d => d.id === trip?.driver_id);
  const vehicleObj = trip?.vehicle || vehicles.find(v => v.id === trip?.vehicle_id);
  const trailerObj = trip?.trailer || trailers.find(t => t.id === trip?.trailer_id);

  // Capacity bar
  const maxPallets = (vehicleObj?.max_pallets || 0) + (trailerObj?.max_pallets || 0);
  const maxWeight = (vehicleObj?.max_weight_kg || 0) + (trailerObj?.max_weight_kg || 0);
  const totalPallets = linkedOrders.reduce((sum: number, o: any) => sum + (o.pallet_count || 0), 0);
  const totalWeight = linkedOrders.reduce((sum: number, o: any) => sum + (o.weight_kg || 0), 0);

  // Cumulative load on board after each stop:
  // - pickup of order X adds X.pallet_count and X.weight_kg
  // - delivery of order X subtracts them
  // Returns an array indexed by stop position, plus the peak so we can flag overload.
  const orderById: Record<string, any> = Object.fromEntries(linkedOrders.map((o: any) => [o.id, o]));
  let runningPal = 0;
  let runningKg = 0;
  let peakPal = 0;
  let peakKg = 0;
  const loadByStop: { pallets: number; weight: number; deltaPal: number; deltaKg: number }[] = stops.map((s) => {
    const ord = s.order_id ? orderById[s.order_id] : null;
    const palQty = ord?.pallet_count ?? 0;
    const kgQty = ord?.weight_kg ?? 0;
    let dPal = 0;
    let dKg = 0;
    if (s.stop_type === "pickup") { dPal = palQty; dKg = kgQty; }
    else if (s.stop_type === "delivery") { dPal = -palQty; dKg = -kgQty; }
    runningPal = Math.max(0, runningPal + dPal);
    runningKg = Math.max(0, runningKg + dKg);
    peakPal = Math.max(peakPal, runningPal);
    peakKg = Math.max(peakKg, runningKg);
    return { pallets: runningPal, weight: runningKg, deltaPal: dPal, deltaKg: dKg };
  });
  const overloadedPal = maxPallets > 0 && peakPal > maxPallets;
  const overloadedKg = maxWeight > 0 && peakKg > maxWeight;

  // Trip totals: revenue from linked orders, fuel cost forecast
  const totalRevenue = linkedOrders.reduce((sum: number, o: any) => sum + (Number(o.customer_price) || 0), 0);
  const revenueCurrency = linkedOrders.find((o: any) => o.customer_currency)?.customer_currency || "EUR";

  // Fuel
  const fuelConsumption = 25; // L/100km
  const fuelPrice = 1.45; // EUR/L
  const fuelLiters = routeInfo.distance_km > 0 ? (routeInfo.distance_km / 100) * fuelConsumption : 0;
  const fuelCost = fuelLiters * fuelPrice;

  return (
    // h-full (not 100vh) so the editor fits inside <main> below the global admin header.
    <div className="relative h-full w-full overflow-hidden">
      {/* ── Top Bar (back / trip pill / save) ── */}
      <div className="absolute top-0 left-0 right-0 z-[600] flex items-center gap-3 px-3 py-2">
          <Button
            variant="outline" size="icon"
            className="h-8 w-8 shrink-0 bg-background/90 backdrop-blur-md shadow-lg border-border/50"
            onClick={() => {
            // If opened in new tab (no history), close the tab; otherwise go back
            if (window.history.length <= 1) {
              window.close();
              // Fallback if window.close() is blocked
              router.push("/admin/tms/planning");
            } else {
              router.back();
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* ── Minimalist Trip Pill: code · period · status ── */}
        {(() => {
          const fmt = (d?: string | null) => {
            if (!d) return null;
            const date = new Date(d);
            if (isNaN(date.getTime())) return null;
            return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
          };
          const startDate = fmt(trip?.actual_start || trip?.planned_start);
          const endDate = fmt(trip?.actual_end || trip?.planned_end);
          const year =
            trip?.planned_end || trip?.planned_start
              ? new Date(trip?.planned_end || trip?.planned_start).getFullYear()
              : null;
          const periodLabel =
            startDate && endDate
              ? `${startDate} \u2192 ${endDate}${year ? `, ${year}` : ""}`
              : startDate
              ? `${startDate}${year ? `, ${year}` : ""}`
              : null;

          return (
            <div className="flex items-center gap-2.5 bg-background/90 backdrop-blur-md rounded-lg border border-border/50 shadow-lg pl-3 pr-2 py-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                <span className="text-muted-foreground/70">Trip</span>{" "}
                <span className="font-mono font-semibold text-foreground">
                  {trip?.reference_number || "—"}
                </span>
              </span>
              {periodLabel && (
                <>
                  <span className="h-3 w-px bg-border/60" aria-hidden />
                  <span className="text-[10px] text-muted-foreground/80 whitespace-nowrap tabular-nums">
                    {periodLabel}
                  </span>
                </>
              )}
              <span className="h-3 w-px bg-border/60" aria-hidden />
              {tripId && (
                <TripStatusStepper
                  tripId={tripId}
                  currentStatus={trip?.status || "draft"}
                  onStatusChange={(newStatus) => setTrip((p: any) => ({ ...p, status: newStatus }))}
                />
              )}
              {isScopedToResource && legBoundaries && (
                <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20 ml-0.5">
                  RT ·{" "}
                  {filterVehicleId
                    ? vehicles.find((v) => v.id === filterVehicleId)?.plate_number ||
                      trip?.vehicle?.plate_number
                    : trip?.vehicle?.plate_number || trip?.carrier?.name || "Resource"}
                </Badge>
              )}
            </div>
          );
        })()}

        <div className="ml-auto flex items-center gap-2">
          {tripId && <TripPnLPill tripId={tripId} refreshKey={pnlRefreshKey} />}
          <Button size="sm" className="h-8 text-xs gap-1.5 shadow-lg" onClick={saveTrip} disabled={saving}>
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save Trip"}
          </Button>
        </div>
      </div>

      {/* ── Full-Screen Map ──
          IMPORTANT: We gate on `trip` being loaded before rendering RouteMap.
          Otherwise the component mounts with `initialRouteGeometry=null`,
          triggers an OSRM fetch, and when `trip` finally arrives the saved
          geometry is ignored because `usedInitialRouteRef` is already true. */}
      {trip && (
        <RouteMap
          fullHeight
          hideBottomPanels
          stops={stops.map(s => ({
          id: s.id,
          stop_type: s.stop_type,
          company_name: s.company_name || "",
          address: s.address || "",
          city: s.city || "",
          country: s.country || "",
          lat: s.lat || 0,
          lng: s.lng || 0,
          planned_date: s.planned_date || "",
          planned_time_from: s.planned_time_from || "",
        }))}
        waypoints={waypoints}
        onWaypointsChange={(wp) => setWaypoints(wp)}
        initialRouteGeometry={isScopedToResource ? null : (trip?.route_geometry || null)}
        initialLegGeometries={stops.map(s => s.route_to_geometry || null)}
        initialRouteDistance={isScopedToResource ? 0 : (trip?.distance_km || 0)}
        initialRouteDuration={isScopedToResource ? 0 : (trip?.duration_minutes || 0)}
        onRouteCalculated={(info) => {
          setRouteInfo({
            geometry: info.geometry || null,
            distance_km: info.distance_km,
            duration_hours: info.duration_hours + info.duration_minutes / 60,
            legs: info.legs || [],
          });
          // Update per-leg data on stops
          if (info.legs?.length) {
            setStops(prev => prev.map((s, i) => {
              if (i === 0) return { ...s, distance_to_km: null, duration_to_minutes: null, route_to_geometry: null };
              const leg = info.legs?.[i - 1];
              return leg ? {
                ...s,
                distance_to_km: Math.round(leg.distance_km * 10) / 10,
                duration_to_minutes: Math.round(leg.duration_min),
                route_to_geometry: leg.geometry || null,
              } : s;
            }));
          }
        }}
        onStopsGeocoded={(geocodedStops) => {
          setStops(prev => prev.map((s, i) => {
            const geo = geocodedStops[i];
            return geo ? { ...s, lat: geo.lat, lng: geo.lng, city: geo.city || s.city, country: geo.country || s.country } : s;
          }));
        }}
        onStopsReordered={(reorderedStops) => {
          const newStops = reorderedStops.map((rs: any, idx: number) => {
            const original = stops.find(s => s.id === rs.id);
            return original ? { ...original, sequence_order: idx + 1 } : stops[idx];
          });
          setStops(newStops);
          setWaypoints([]); // Clear drag-waypoints when stop order changes
        }}
        gpsTrackOverlay={gpsTrackOverlay}
        routeStrategy={routeStrategy}
        expenseMarkers={expenseMarkers}
        activeTile={activeTile}
        liveResources={liveResources}
      />
      )}

      {/* ── Map base-layer switcher overlay ──
          Anchored top-right (left of Leaflet's built-in zoom control which
          sits at bottom-right) so it stays clear of the route-strategy panel
          (Fastest / Avoid Tolls / Shortest) at bottom-left. */}
      <div className="absolute top-14 right-3 z-[600]">
        <Button
          variant="ghost"
          size="icon"
          title={`Base map: ${TILE_LAYERS[activeTile]?.name ?? activeTile}`}
          className="h-9 w-9 bg-background/95 backdrop-blur-md border border-border/60 shadow-xl"
          onClick={() => setTileMenuOpen(o => !o)}
        >
          <Layers className="h-4 w-4" />
        </Button>
        {tileMenuOpen && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-[599]" onClick={() => setTileMenuOpen(false)} />
            <div className="absolute top-full right-0 mt-2 w-48 bg-background/95 backdrop-blur-md border border-border/60 rounded-lg shadow-2xl overflow-hidden z-[600]">
              <div className="px-3 py-2 border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Base Map
              </div>
              <div className="py-1">
                {TILE_LAYER_ENTRIES.map(([key, cfg]) => (
                  <button
                    key={key}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors ${
                      activeTile === key ? "text-foreground bg-muted/30 font-semibold" : "text-muted-foreground"
                    }`}
                    onClick={() => { setActiveTile(key); setTileMenuOpen(false); }}
                  >
                    <span className="truncate">{cfg.name}</span>
                    {activeTile === key && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Mobile: Floating Action Button to open execution sheet ── */}
      <button
        type="button"
        onClick={() => setExecutionCollapsed(false)}
        className="md:hidden fixed bottom-20 left-4 z-[600] h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform"
      >
        <Truck className="h-5 w-5" />
      </button>

      {/* ── Mobile: Execution Sheet Overlay ── */}
      {!executionCollapsed && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-[700] backdrop-blur-sm"
          onClick={() => setExecutionCollapsed(true)}
        />
      )}

      {/* ── Desktop: Floating Left Sidebar — collapsed pill ── */}
      {executionCollapsed && (
        <button
          type="button"
          onClick={() => setExecutionCollapsed(false)}
          title="Expand execution panel"
          className="hidden md:inline-flex absolute top-14 left-3 z-[500] items-center gap-2 h-9 px-3 rounded-full bg-background/95 backdrop-blur-md border border-border/60 shadow-xl hover:border-primary/40 hover:bg-background transition-all group"
        >
          <PanelLeftOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
            Execution
          </span>
        </button>
      )}

      {/* ── Floating Left Sidebar — full panel (desktop) / slide-up sheet (mobile) ── */}
      <div
        className={`
          ${executionCollapsed ? "hidden md:hidden" : "flex"}
          /* Mobile: fixed sheet from bottom */
          fixed md:absolute
          inset-x-0 md:inset-x-auto bottom-0 md:bottom-3
          md:top-14 md:left-3
          max-h-[85vh] md:max-h-none
          w-full md:w-[320px]
          z-[800] md:z-[500]
          flex-col bg-background/98 md:bg-background/95 backdrop-blur-md
          rounded-t-2xl md:rounded-xl shadow-2xl border border-border/50
        `}
      >
        {/* Execution mode — minimalist toggle badge */}
        <div className="px-2.5 pt-2.5 pb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExecutionCollapsed(true)}
              title="Collapse panel"
              className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-medium">Execution</span>
          </div>
          <button
            type="button"
            onClick={() =>
              setTrip((p: any) =>
                trip?.assignment_type === "forwarding"
                  ? { ...p, assignment_type: "internal", carrier_id: null, carrier_cost: null }
                  : { ...p, assignment_type: "forwarding", driver_id: null, vehicle_id: null, trailer_id: null }
              )
            }
            title="Click to switch between Own Fleet and Forwarding"
            className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[10px] font-medium ring-1 transition-all hover:scale-[1.02] active:scale-95 ${
              trip?.assignment_type === "forwarding"
                ? "bg-orange-500/10 text-orange-400 ring-orange-500/25 hover:bg-orange-500/15"
                : "bg-primary/10 text-primary ring-primary/25 hover:bg-primary/15"
            }`}
          >
            {trip?.assignment_type === "forwarding" ? <Building2 className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
            <span className="tracking-tight">{trip?.assignment_type === "forwarding" ? "Forwarding" : "Own Fleet"}</span>
          </button>
        </div>

        {/* Forwarding-only fields */}
        {trip?.assignment_type === "forwarding" && (
          <div className="px-2.5 pb-2.5 border-b border-border/50 space-y-2">
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1 text-[10px] text-orange-400">
                <Building2 className="h-3 w-3" />
                This trip will be handled by an external carrier
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/70">External Carrier</Label>
                <div className="flex gap-1">
                  <Select value={trip?.carrier_id || ""} onValueChange={v => setTrip((p: any) => ({ ...p, carrier_id: v }))}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select carrier..." /></SelectTrigger>
                    <SelectContent>
                      {carriers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setShowQuickCreateCarrier(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Carrier Cost</Label>
                  <Input
                    type="number"
                    value={trip?.carrier_cost || ""}
                    onChange={e => setTrip((p: any) => ({ ...p, carrier_cost: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="0.00"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Currency</Label>
                  <Select value={trip?.carrier_currency || "EUR"} onValueChange={v => setTrip((p: any) => ({ ...p, carrier_currency: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="RON">RON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Driver / Vehicle / Trailer - Only show for Own Fleet */}
        {trip?.assignment_type !== "forwarding" && (
        <div className="px-2.5 py-2 border-b border-border/50 space-y-1">
          {/* Compact icon-led rows. Selects are inline so the row height stays tight. */}
          {[
            { icon: User, key: "driver", value: trip?.driver_id || "", placeholder: "Driver",
              options: drivers.map(d => ({ value: d.id, label: d.name })),
              onChange: (v: string) => setTrip((p: any) => ({ ...p, driver_id: v })) },
            { icon: Truck, key: "vehicle", value: trip?.vehicle_id || "", placeholder: "Vehicle",
              options: vehicles.map(v => ({ value: v.id, label: v.plate_number })),
              onChange: (v: string) => setTrip((p: any) => ({ ...p, vehicle_id: v })) },
            { icon: Package, key: "trailer", value: trip?.trailer_id || "_none", placeholder: "No trailer",
              options: [{ value: "_none", label: "No trailer" }, ...trailers.map(t => ({ value: t.id, label: `${t.plate_number} • ${t.trailer_type}` }))],
              onChange: (v: string) => setTrip((p: any) => ({ ...p, trailer_id: v === "_none" ? null : v })) },
          ].map(row => {
            const Icon = row.icon;
            return (
              <div key={row.key} className="group flex items-center gap-2 h-7 rounded-md hover:bg-muted/40 transition-colors px-1">
                <Icon className="h-3 w-3 text-muted-foreground/60 group-hover:text-muted-foreground shrink-0" />
                <Select value={row.value} onValueChange={row.onChange}>
                  <SelectTrigger className="h-6 px-1.5 border-0 bg-transparent shadow-none hover:bg-transparent focus:ring-0 text-[11px] font-medium [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-50">
                    <SelectValue placeholder={row.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {row.options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            );
          })}

          {/* Compact capacity strip (only renders when there is capacity data) */}
          {(maxPallets > 0 || maxWeight > 0) && (
            <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-border/30">
              {maxPallets > 0 && (
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Pal</span>
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (totalPallets / maxPallets) * 100)}%`, backgroundColor: totalPallets > maxPallets ? "#ef4444" : totalPallets > maxPallets * 0.85 ? "#f59e0b" : "#22c55e" }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{totalPallets}/{maxPallets}</span>
                </div>
              )}
              {maxWeight > 0 && (
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Kg</span>
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (totalWeight / maxWeight) * 100)}%`, backgroundColor: totalWeight > maxWeight ? "#ef4444" : totalWeight > maxWeight * 0.85 ? "#f59e0b" : "#22c55e" }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(totalWeight / 1000)}t</span>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Linked Orders Panel */}
        <div className="p-2.5 border-b border-border/50 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Linked Orders ({linkedOrders.length})
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10"
              onClick={() => setShowAddOrder(true)}
            >
              <Plus className="h-3 w-3" />
              Add order
            </Button>
          </div>

          {/* Trip revenue / cargo summary */}
          {linkedOrders.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/15">
                <div className="text-[8.5px] text-muted-foreground/70 uppercase tracking-wide">Revenue</div>
                <div className="text-[11px] font-semibold tabular-nums text-emerald-400">
                  {revenueCurrency} {totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/40 border border-border/30">
                <div className="text-[8.5px] text-muted-foreground/70 uppercase tracking-wide">Pallets</div>
                <div className={`text-[11px] font-semibold tabular-nums ${overloadedPal ? "text-red-400" : ""}`}>
                  {peakPal}{maxPallets > 0 ? `/${maxPallets}` : ""}
                </div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/40 border border-border/30">
                <div className="text-[8.5px] text-muted-foreground/70 uppercase tracking-wide">Weight</div>
                <div className={`text-[11px] font-semibold tabular-nums ${overloadedKg ? "text-red-400" : ""}`}>
                  {(peakKg / 1000).toFixed(1)}t
                </div>
              </div>
            </div>
          )}

          {(overloadedPal || overloadedKg) && (
            <div className="flex items-start gap-1.5 p-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-[10px] text-red-300">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Overloaded: peak load exceeds vehicle capacity. Re-sequence stops or split orders to stay legal.
              </span>
            </div>
          )}

          {linkedOrders.length > 0 ? (
            <div className="space-y-1.5">
              {linkedOrders.map((order: any) => (
                <div
                  key={order.id}
                  className="group relative flex flex-col gap-1 p-2 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                        {order.reference_number}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate flex-1">
                        {order.partners?.name ?? ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[8px] shrink-0 ${
                          order.commercial_role === "subcontract_order"
                            ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            : order.order_type === "forwarding"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-primary/10 text-primary border-primary/20"
                        }`}
                      >
                        {order.commercial_role === "subcontract_order" ? "SUB" : order.order_type === "forwarding" ? "FWD" : "INT"}
                      </Badge>
                      <button
                        type="button"
                        title={linkedOrders.length <= 1 ? "A trip needs at least one order" : "Remove from trip"}
                        disabled={linkedOrders.length <= 1 || removingOrderId === order.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOrderFromTrip(order.id, order.reference_number);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {removingOrderId === order.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div
                    onClick={() => window.open(`/admin/tms/orders/${order.id}`, "_blank")}
                    className="flex items-center justify-between text-[10px] cursor-pointer"
                  >
                    <span className="text-muted-foreground">
                      {order.pallet_count ? `${order.pallet_count} pal` : ""}
                      {order.weight_kg ? ` · ${order.weight_kg.toLocaleString()} kg` : ""}
                    </span>
                    <span className="font-medium tabular-nums">
                      {order.customer_price != null
                        ? `${order.customer_currency ?? "EUR"} ${Number(order.customer_price).toLocaleString()}`
                        : "—"}
                    </span>
                  </div>

                  {/* Parent link for subcontract orders */}
                  {order.commercial_role === "subcontract_order" && order.parent_order && (
                    <div
                      className="flex items-center gap-1 text-[9px] text-muted-foreground pl-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/admin/tms/orders/${order.parent_order.id}`, "_blank");
                      }}
                    >
                      <ArrowRight className="h-2.5 w-2.5" />
                      <span>Parent:</span>
                      <span className="text-primary hover:underline cursor-pointer">{order.parent_order.reference_number}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/40 p-3 text-center text-[10px] text-muted-foreground">
              No orders linked yet. Click <span className="text-primary font-medium">Add order</span> to attach one.
            </div>
          )}
        </div>

        {/* Stops list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {stops.map((stop, si) => {
            const stopColor = stop.stop_type === "pickup" ? "#22c55e" :
              stop.stop_type === "delivery" ? "#3b82f6" :
              stop.stop_type === "transit" ? "#f59e0b" :
              stop.stop_type === "customs" ? "#8b5cf6" : "#6b7280";
            const isLast = si === stops.length - 1;
            const flagUrl = getCountryFlagUrl(stop.country);
            const load = loadByStop[si];
            const palCapacityHit = maxPallets > 0 && load && load.pallets > maxPallets;

            return (
              <div key={stop.id} className="relative">
                {/* Connecting line */}
                {!isLast && (
                  <div className="absolute left-[31px] top-[32px] bottom-0 w-px" style={{ backgroundColor: `${stopColor}30` }} />
                )}
                <div
                  draggable
                  onDragStart={() => setDragIdx(si)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(si); }}
                  onDrop={() => handleStopDrop(si)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onClick={() => { setSelectedStopIndex(si); setShowStopDetails(true); }}
                  className={`relative flex items-center gap-2 px-2 py-2 cursor-pointer transition-all ${
                    selectedStopIndex === si ? "bg-primary/5" : "hover:bg-muted/30"
                  } ${dragOverIdx === si ? "bg-primary/10" : ""} ${dragIdx === si ? "opacity-30" : ""}`}
                >
                  <GripVertical className="h-2.5 w-2.5 text-muted-foreground/20 cursor-grab shrink-0" />
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 relative z-10 ring-2 ring-background"
                    style={{ backgroundColor: stopColor }}
                  >
                    {si + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {flagUrl && <img src={flagUrl} alt="" className="w-4 h-3 rounded-[2px] object-cover shrink-0" crossOrigin="anonymous" />}
                      <p className="text-[11px] font-medium truncate leading-tight">
                        {stop.city || stop.company_name || `Stop ${si + 1}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-muted-foreground truncate leading-tight">
                        {stop.address ? stop.address.substring(0, 30) : "No address"}
                      </p>
                      {stop.order_ref && (
                        <Badge variant="outline" className="text-[7px] h-3.5 px-1 font-mono shrink-0 border-blue-500/30 text-blue-400">{stop.order_ref}</Badge>
                      )}
                    </div>
                    {/* Cargo delta + load on board */}
                    {load && (load.deltaPal !== 0 || load.pallets > 0 || load.weight > 0) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {load.deltaPal > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400 font-medium tabular-nums">
                            <TrendingUp className="h-2 w-2" />+{load.deltaPal} pal
                          </span>
                        )}
                        {load.deltaPal < 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-400 font-medium tabular-nums">
                            <TrendingDown className="h-2 w-2" />{load.deltaPal} pal
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-0.5 text-[9px] tabular-nums ${
                            palCapacityHit ? "text-red-400 font-semibold" : "text-muted-foreground"
                          }`}
                          title={palCapacityHit ? "Truck overloaded at this stop" : "Load on board after this stop"}
                        >
                          <Package className="h-2 w-2" />
                          {load.pallets}{maxPallets > 0 ? `/${maxPallets}` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {stop.lat !== null && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    {stop.planned_date && <Clock className="h-2.5 w-2.5 text-blue-400" />}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add stop button */}
          <button
            onClick={addStop}
            className="w-full flex items-center gap-2 px-2 py-2.5 text-[10px] text-primary/60 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <div className="w-5 h-5 rounded-full border border-dashed border-primary/30 flex items-center justify-center ml-[14px]">
              <Plus className="h-2.5 w-2.5" />
            </div>
            Add new stop
          </button>
        </div>

        {/* ── Route Strategy (sits inside the Execution panel, below the stops) ── */}
        <div className="px-2.5 py-2 border-t border-border/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Route
            </span>
            <span className="text-[9px] text-muted-foreground/50 tabular-nums">
              {Math.round(routeInfo.distance_km)} km · {Math.floor(routeInfo.duration_hours)}h{Math.round((routeInfo.duration_hours % 1) * 60)}m
            </span>
          </div>
          <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5">
            {[
              { value: "fastest" as const, label: "Fastest", icon: RouteIcon, color: "text-blue-400" },
              { value: "avoid_tolls" as const, label: "Avoid Tolls", icon: AlertTriangle, color: "text-amber-400" },
              { value: "shortest" as const, label: "Shortest", icon: Split, color: "text-emerald-400" },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = routeStrategy === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setRouteStrategy(opt.value);
                    // Force route recompute by clearing the cached geometry/waypoints.
                    setRouteInfo((prev) => ({ ...prev, geometry: null }));
                    setWaypoints([]);
                  }}
                  title={opt.label}
                  className={`flex-1 inline-flex items-center justify-center gap-1 h-6 rounded text-[10px] font-medium transition-all ${
                    active
                      ? "bg-background shadow-sm text-foreground ring-1 ring-border/50"
                      : "text-muted-foreground/80 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-3 w-3 ${active ? opt.color : ""}`} />
                  <span className="tracking-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Floating Center Panel: Stop Details ── */}
      {showStopDetails && selectedStop && (() => {
        return (
          <div className="absolute top-14 left-[336px] bottom-3 w-[340px] z-[500] flex flex-col bg-background/95 backdrop-blur-md rounded-xl shadow-2xl border border-border/50">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{
                    backgroundColor: selectedStop.stop_type === "pickup" ? "#22c55e" :
                      selectedStop.stop_type === "delivery" ? "#3b82f6" :
                      selectedStop.stop_type === "transit" ? "#f59e0b" :
                      selectedStop.stop_type === "customs" ? "#8b5cf6" : "#6b7280"
                  }}
                >
                  {selectedStopIndex! + 1}
                </div>
                {selectedStop.country && getCountryFlagUrl(selectedStop.country) && (
                  <img src={getCountryFlagUrl(selectedStop.country)} alt={selectedStop.country} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" crossOrigin="anonymous" />
                )}
                <span className="text-xs font-semibold">
                  {selectedStop.city || selectedStop.company_name || `Stop ${selectedStopIndex! + 1}`}
                </span>
                {selectedStop.order_ref && (
                  <Badge variant="outline" className="text-[8px] font-mono border-blue-500/30 text-blue-400">
                    {selectedStop.order_ref}
                  </Badge>
                )}
                <Select value={selectedStop.stop_type} onValueChange={(v: any) => updateStop(selectedStopIndex!, { stop_type: v })}>
                  <SelectTrigger className="h-5 text-[10px] w-auto min-w-[70px] bg-transparent border-dashed"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="customs">Customs</SelectItem>
                    <SelectItem value="transit">Transit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button onClick={() => setShowStopDetails(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
              {/* Company */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/70">Company / Stop Name</Label>
                <Input
                  value={selectedStop.company_name}
                  onChange={e => updateStop(selectedStopIndex!, { company_name: e.target.value })}
                  placeholder={`Stop ${selectedStopIndex! + 1}`}
                  className="h-8 text-xs font-medium bg-background/60"
                />
              </div>

              {/* Address with search */}
              <div className="space-y-1 relative">
                <Label className="text-[10px] text-muted-foreground/70">Address</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    className="h-8 text-xs pl-7 bg-background/60"
                    value={selectedStop.address}
                    onChange={e => { updateStop(selectedStopIndex!, { address: e.target.value }); setSearchingStop(selectedStopIndex); searchAddress(e.target.value); }}
                    placeholder="Search address..."
                  />
                  {searchingStop === selectedStopIndex && searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-[600] bg-popover border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {searchResults.map((r: any, ri: number) => (
                        <button key={ri} type="button" className="w-full text-left px-3 py-2 text-[10px] hover:bg-muted transition-colors"
                          onClick={() => {
                            const parts = r.display_name.split(",").map((s: string) => s.trim());
                            updateStop(selectedStopIndex!, {
                              address: r.display_name,
                              lat: parseFloat(r.lat),
                              lng: parseFloat(r.lon),
                              city: parts.length > 2 ? parts[parts.length - 3] : "",
                              country: parts[parts.length - 1] || "",
                              postal_code: r.address?.postcode || "",
                            });
                            setSearchResults([]);
                            setSearchingStop(null);
                          }}
                        >
                          <MapPin className="h-3 w-3 inline mr-1 text-muted-foreground" />{r.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedStop.lat !== null && (
                  <div className="text-[10px] text-green-600/80 flex items-center gap-1">
                    <Check className="h-2.5 w-2.5" />
                    {selectedStop.lat?.toFixed(5)}, {selectedStop.lng?.toFixed(5)}
                  </div>
                )}
              </div>

              {/* City / Country / Postal */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">City</Label>
                  <Input className="h-7 text-[11px] bg-background/60" value={selectedStop.city} onChange={e => updateStop(selectedStopIndex!, { city: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Country</Label>
                  <Input className="h-7 text-[11px] bg-background/60" value={selectedStop.country} onChange={e => updateStop(selectedStopIndex!, { country: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70">Postal</Label>
                  <Input className="h-7 text-[11px] bg-background/60" value={selectedStop.postal_code || ""} onChange={e => updateStop(selectedStopIndex!, { postal_code: e.target.value })} />
                </div>
              </div>

              {/* Time Window */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Clock className="h-3 w-3" />Time Window</Label>
                <div className="grid grid-cols-3 gap-1">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground/50 uppercase">Date</span>
                    <Input type="date" value={selectedStop.planned_date || ""} onChange={e => updateStop(selectedStopIndex!, { planned_date: e.target.value })} className="h-7 text-[11px] bg-background/60" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground/50 uppercase">From</span>
                    <Input type="time" value={selectedStop.planned_time_from || ""} onChange={e => updateStop(selectedStopIndex!, { planned_time_from: e.target.value })} className="h-7 text-[11px] bg-background/60" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground/50 uppercase">To</span>
                    <Input type="time" value={selectedStop.planned_time_to || ""} onChange={e => updateStop(selectedStopIndex!, { planned_time_to: e.target.value })} className="h-7 text-[11px] bg-background/60" />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><User className="h-2.5 w-2.5" />Contact</Label>
                  <Input value={selectedStop.contact_name || ""} onChange={e => updateStop(selectedStopIndex!, { contact_name: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder="Name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Phone className="h-2.5 w-2.5" />Phone</Label>
                  <Input value={selectedStop.contact_phone || ""} onChange={e => updateStop(selectedStopIndex!, { contact_phone: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder="+1..." />
                </div>
              </div>

              {/* Reference */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/70">Reference Number</Label>
                <Input value={selectedStop.reference_number || ""} onChange={e => updateStop(selectedStopIndex!, { reference_number: e.target.value })} className="h-7 text-[11px] bg-background/60" placeholder="Stop reference..." />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground/70">Notes</Label>
                <Textarea
                  value={selectedStop.notes || ""}
                  onChange={e => updateStop(selectedStopIndex!, { notes: e.target.value })}
                  placeholder="Stop instructions..."
                  rows={2}
                  className="text-[11px] resize-none bg-background/60"
                />
              </div>

              {/* Delete */}
              {stops.length > 1 && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-[11px] h-7"
                  onClick={() => removeStop(selectedStopIndex!)}
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />
                  Remove Stop
                </Button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Stop details now opens only on stop click in the left list (no reopen button). */}

      {/* The route-strategy chips and summary stats now live inside the Execution panel
          (below the stops list) — there is no floating overlay over the map. */}

      {/* Quick Create Carrier Dialog */}
      {adminSession && (
        <QuickCreatePartnerDialog
          open={showQuickCreateCarrier}
          onOpenChange={setShowQuickCreateCarrier}
          adminId={adminSession.id}
          defaultType="carrier"
          onCreated={(partner) => {
            setCarriers(prev => [...prev, { id: partner.id, name: partner.name }]);
            setTrip((p: any) => ({ ...p, carrier_id: partner.id }));
          }}
        />
      )}

      {/* Add Order to Trip Dialog */}
      <AddOrderToTripDialog
        open={showAddOrder}
        onOpenChange={setShowAddOrder}
        tripId={tripId}
        existingOrderIds={linkedOrders.map((o: any) => o.id)}
        onLinked={() => fetchTrip()}
      />

      {/* ── Trip Operations Drawer ── */}
      {tripId && trip && (
        <TripOpsDrawer
          tripId={tripId}
          trip={trip}
          stops={stops}
          linkedOrders={linkedOrders}
          routeInfo={routeInfo}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          /*
           * Drawer left edge:
           *   - stop-details panel open  → 720px (clears sidebar + details)
           *   - execution sidebar shown  → 340px (clears sidebar only)
           *   - execution collapsed      →  12px (full width, matches right gap)
           */
          leftOffset={
            showStopDetails && selectedStop
              ? 720
              : executionCollapsed
                ? 12
                : 340
          }
          onPnLChange={() => setPnlRefreshKey(k => k + 1)}
          onGpsTrackChange={setGpsTrackOverlay}
          onOptimizeStops={(newOrder) => {
            // Re-index sequence_order based on new order
            setStops(newOrder.map((s: any, idx: number) => ({ ...s, sequence_order: idx + 1 })));
            setWaypoints([]); // Clear waypoints when order changes
          }}
        />
      )}
    </div>
  );
}
