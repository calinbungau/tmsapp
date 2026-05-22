"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowRight, User, Truck, Container, Check, ChevronDown, X,
  Search, MapPin, AlertTriangle, Package, Info, Building2, Route,
  ArrowLeftRight, Plus, Weight, UserPlus, ChevronsUpDown, Layers, HelpCircle,
  Link2, FileText, Phone,
} from "lucide-react";
import { QuickCreatePartnerDialog } from "@/components/tms/quick-create-partner-dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StopInfo {
  index: number;
  stop_type: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  origin?: "order" | "execution" | "existing_trip";
  }

export interface RouteOptions {
  avoid_tolls: boolean;
  avoid_ferries: boolean;
  fuel_price_per_liter: string;
  fuel_consumption_per_100km: string;
  fuel_type: string;
}

export interface LegRouteInfo {
  distance_km: number;
  duration_hours: number;
  duration_minutes: number;
  fuel_liters: number;
  fuel_cost: number;
  toll_countries: string[];
  geometry: [number, number][];
}

export interface GeofenceData {
  stop_index: number;
  radius_m: number;
  auto_checkin: boolean;
  auto_checkout: boolean;
}

// A "trip segment" = the portion of the route between two swap points
export interface TripSegment {
  id: string;
  trip_number: number;
  assignment_type: "own_fleet" | "forwarding" | "undecided";
  driver_id: string;
  vehicle_id: string;
  trailer_id: string;
  carrier_id: string;
  carrier_cost: string;
  carrier_currency: string;
  carrier_vat_type: "excluding" | "including" | "exempt" | "reverse_charge" | "non_taxable";
  carrier_vat_rate: string;
  from_stop_index: number; // index in stops array
  to_stop_index: number;   // index in stops array
  swap_type: "truck_swap" | "trailer_swap" | "full_swap" | null;
  notes: string;
  route_info: LegRouteInfo | null;
  // Subcontractor fields (optional, for forwarding legs)
  subcontractor_vehicle_plate?: string;
  subcontractor_trailer_plate?: string;
  subcontractor_driver_name?: string;
  subcontractor_driver_phone?: string;
  // Forwarding order mode
  fwd_order_mode?: "none" | "existing" | "new";
  fwd_order_id?: string;
  }

interface Driver { id: string; name: string; phone?: string; license_categories?: string[]; }
interface Vehicle { id: string; plate_number: string; make: string | null; model: string | null; vehicle_type?: string; max_weight_kg: number | null; max_pallets: number | null; loading_meters: number | null; default_trailer_id?: string; }
interface Trailer { id: string; plate_number: string; make?: string; model?: string; trailer_type: string; max_weight_kg: number | null; max_pallets: number | null; loading_meters: number | null; volume_m3?: number; adr_certified?: boolean; }
interface Conflict { type: string; order_ref: string; order_id: string; date_from: string; date_to: string; destination: string; }
export interface CapacityInfo { trailer_id: string; current_pallets: number; current_weight_kg: number; max_pallets: number; max_weight_kg: number; orders: { ref: string; pallets: number; weight: number }[]; }
export interface ExistingStop { order_ref: string; city: string; address: string; stop_type: string; planned_date: string; lat: number | null; lng: number | null; }

export interface ExistingTripStop {
  id: string;
  city: string;
  country: string;
  address: string;
  company_name: string;
  stop_type: string;
  planned_date: string | null;
  planned_time_from: string | null;
  planned_time_to: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  sequence_order: number;
  order_id: string | null;
  order_stop_id: string | null;
  order_ref: string | null;
}

export interface ExistingTripData {
  tripId: string;
  tripRef: string;
  vehicleId: string;
  driverId: string | null;
  trailerId: string | null;
  status: string;
  tripStops: ExistingTripStop[];
  orderIds: string[];
}

export interface FleetMapData {
  trips: TripSegment[];
  conflicts: Conflict[];
  capacityInfo: CapacityInfo | null;
  existingStops: ExistingStop[];
  existingTripData: ExistingTripData | null;
  routeOptions: RouteOptions;
  routeInfo: LegRouteInfo | null;
  geofences: GeofenceData[];
  vehicles: Vehicle[];
  trailers: Trailer[];
  drivers: Driver[];
}

interface FleetAssignmentProps {
  adminId: string;
  orderType: "internal" | "forwarding";
  stops: StopInfo[];
  palletCount: number;
  weightKg: number;
  plannedDateFrom: string;
  plannedDateTo: string;
  trips: TripSegment[];
  onTripsChange: (trips: TripSegment[]) => void;
  driverId: string;
  vehicleId: string;
  trailerId: string;
  onSimpleChange: (field: string, value: string) => void;
  partners: { id: string; name: string; types: string[] }[];
  onMapDataChange?: (data: FleetMapData) => void;
  onPartnerCreated?: (partner: { id: string; name: string; types: string[] }) => void;
  onRequestSwapStop?: () => void; // Called when user wants to add a swap point but needs to create execution stop first
}

export const defaultRouteOptions: RouteOptions = {
  avoid_tolls: false, avoid_ferries: false,
  fuel_price_per_liter: "1.45", fuel_consumption_per_100km: "32", fuel_type: "diesel",
};

// Color palette for trips on the map
export const TRIP_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function geocodeCity(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const trimmed = q.trim();
    if (!trimmed) return null; // Don't search with empty query
    const res = await fetch(`https://rvs.bngtracking.ro/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  } catch { return null; }
}

// ─── Searchable Combobox ────────────────────────────────────────────────────

function SearchCombobox<T extends { id: string }>({
  items, value, onChange, renderItem, renderSelected, searchFn, placeholder, icon: Icon, emptyMessage,
}: {
  items: T[]; value: string; onChange: (id: string) => void;
  renderItem: (item: T) => React.ReactNode; renderSelected: (item: T) => React.ReactNode;
  searchFn: (item: T, q: string) => boolean; placeholder: string;
  icon: React.ElementType; emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return items;
    return items.filter(i => searchFn(i, query.toLowerCase()));
  }, [items, query, searchFn]);

  const selected = items.find(i => i.id === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(!open); setQuery(""); }}
        className="w-full flex items-center gap-2 px-2.5 rounded-lg border border-border bg-background hover:border-primary/40 transition-colors text-left h-8">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {selected ? <span className="flex-1 text-xs truncate">{renderSelected(selected)}</span>
          : <span className="flex-1 text-xs text-muted-foreground">{placeholder}</span>}
        {value && <X className="h-3 w-3 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onChange(""); }} />}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-[700] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Type to search..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">{emptyMessage}</div>
            ) : filtered.map(item => (
              <button key={item.id} type="button"
                onClick={() => { onChange(item.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${item.id === value ? "bg-primary/5" : ""}`}>
                {item.id === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                <div className="flex-1 min-w-0">{renderItem(item)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FleetAssignment({
  adminId, orderType, stops = [], palletCount, weightKg,
  plannedDateFrom, plannedDateTo,
  trips, onTripsChange,
  driverId, vehicleId, trailerId,
  onSimpleChange, partners = [],
  onMapDataChange, onPartnerCreated, onRequestSwapStop,
  }: FleetAssignmentProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [capacityInfo, setCapacityInfo] = useState<CapacityInfo | null>(null);
  const [existingStops, setExistingStops] = useState<ExistingStop[]>([]);
  const [existingTripData, setExistingTripData] = useState<ExistingTripData | null>(null);
  const [simpleRouteOptions, setSimpleRouteOptions] = useState<RouteOptions>(defaultRouteOptions);
  const [simpleRouteInfo, setSimpleRouteInfo] = useState<LegRouteInfo | null>(null);
  const [simpleGeofences, setSimpleGeofences] = useState<GeofenceData[]>([]);
  const [showQuickCreateCarrier, setShowQuickCreateCarrier] = useState(false);
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  
  // Subcontractor resource selection states
  const [subVehicleOpen, setSubVehicleOpen] = useState(false);
  const [subVehicleSearch, setSubVehicleSearch] = useState("");
  const [subTrailerOpen, setSubTrailerOpen] = useState(false);
  const [subTrailerSearch, setSubTrailerSearch] = useState("");
  const [subDriverOpen, setSubDriverOpen] = useState(false);
  const [subDriverSearch, setSubDriverSearch] = useState("");
  
  // Carrier's resources (fetched when carrier is selected)
  const [carrierVehicles, setCarrierVehicles] = useState<{ id: string; plate_number: string }[]>([]);
  const [carrierTrailers, setCarrierTrailers] = useState<{ id: string; plate_number: string }[]>([]);
  const [carrierDrivers, setCarrierDrivers] = useState<{ id: string; name: string; phone?: string }[]>([]);

  const hasMultipleTrips = trips.length > 1;
  const supabase = useMemo(() => createClient(), []);

  // Expose map data to parent
  useEffect(() => {
    onMapDataChange?.({
      trips, conflicts, capacityInfo, existingStops, existingTripData,
      routeOptions: simpleRouteOptions, routeInfo: simpleRouteInfo,
      geofences: simpleGeofences, vehicles, trailers, drivers,
    });
  }, [trips, conflicts, capacityInfo, existingStops, existingTripData, simpleRouteOptions, simpleRouteInfo, simpleGeofences, vehicles, trailers, drivers]);

  // Fetch fleet data
  useEffect(() => {
    if (!adminId) return;
    const fetchFleet = async () => {
      const [dRes, vRes, tRes] = await Promise.all([
        supabase.from("drivers").select("id, name, phone, status, license_categories, is_active").eq("admin_id", adminId).eq("is_active", true).order("name"),
        supabase.from("vehicles").select("id, plate_number, make, model, vehicle_type, max_pallets, max_weight_kg, loading_meters, default_trailer_id, is_active").eq("admin_id", adminId).eq("is_active", true).order("plate_number"),
        supabase.from("trailers").select("id, plate_number, make, model, trailer_type, max_pallets, max_weight_kg, loading_meters, volume_m3, adr_certified, is_active").eq("admin_id", adminId).eq("is_active", true).order("plate_number"),
      ]);
      setDrivers(dRes.data || []);
      setVehicles(vRes.data || []);
      setTrailers(tRes.data || []);
    };
    fetchFleet();
  }, [adminId, supabase]);

  // Check conflicts
  const checkConflicts = useCallback(async (vId: string, dId: string, tId: string) => {
    if (!plannedDateFrom || (!vId && !dId && !tId)) { setConflicts([]); return; }
    const dateFrom = plannedDateFrom; const dateTo = plannedDateTo || plannedDateFrom;
    const conflictsFound: Conflict[] = [];
    const { data: overlappingOrders } = await supabase
      .from("orders").select("id, reference_number, vehicle_id, driver_id, trailer_id, status, order_stops(city, planned_date, stop_type)")
      .eq("admin_id", adminId).in("status", ["confirmed", "dispatched", "in_transit"])
      .or([vId ? `vehicle_id.eq.${vId}` : null, dId ? `driver_id.eq.${dId}` : null, tId ? `trailer_id.eq.${tId}` : null].filter(Boolean).join(","));

    if (overlappingOrders) {
      for (const order of overlappingOrders) {
        const orderStops = (order.order_stops as any[]) || [];
        const orderDates = orderStops.map((s: any) => s.planned_date).filter(Boolean).sort();
        const orderFrom = orderDates[0]; const orderTo = orderDates[orderDates.length - 1] || orderFrom;
        if (orderFrom && orderTo && orderFrom <= dateTo && orderTo >= dateFrom) {
          const dest = orderStops.find((s: any) => s.stop_type === "delivery")?.city || "Unknown";
          if (vId && order.vehicle_id === vId) conflictsFound.push({ type: "vehicle", order_ref: order.reference_number, order_id: order.id, date_from: orderFrom, date_to: orderTo, destination: dest });
          if (dId && order.driver_id === dId) conflictsFound.push({ type: "driver", order_ref: order.reference_number, order_id: order.id, date_from: orderFrom, date_to: orderTo, destination: dest });
          if (tId && order.trailer_id === tId) conflictsFound.push({ type: "trailer", order_ref: order.reference_number, order_id: order.id, date_from: orderFrom, date_to: orderTo, destination: dest });
        }
      }
    }
    setConflicts(conflictsFound);
  }, [adminId, plannedDateFrom, plannedDateTo, supabase]);

  // Check capacity
  const checkCapacity = useCallback(async (tId: string) => {
    if (!tId || !plannedDateFrom) { setCapacityInfo(null); return; }
    const trailer = trailers.find(t => t.id === tId);
    if (!trailer) { setCapacityInfo(null); return; }
    const dateTo = plannedDateTo || plannedDateFrom;
    const { data: sharedOrders } = await supabase
      .from("orders").select("id, reference_number, pallet_count, weight_kg, trailer_id")
      .eq("admin_id", adminId).eq("trailer_id", tId).in("status", ["confirmed", "dispatched", "in_transit"]);

    let ordersOnTrailer: { ref: string; pallets: number; weight: number }[] = [];
    let totalPallets = 0; let totalWeight = 0;
    if (sharedOrders?.length) {
      const { data: stopsData } = await supabase.from("order_stops").select("order_id, planned_date").in("order_id", sharedOrders.map(o => o.id));
      const ranges: Record<string, { from: string; to: string }> = {};
      for (const s of (stopsData || [])) {
        if (!s.planned_date) continue;
        if (!ranges[s.order_id]) ranges[s.order_id] = { from: s.planned_date, to: s.planned_date };
        if (s.planned_date < ranges[s.order_id].from) ranges[s.order_id].from = s.planned_date;
        if (s.planned_date > ranges[s.order_id].to) ranges[s.order_id].to = s.planned_date;
      }
      for (const order of sharedOrders) {
        const range = ranges[order.id];
        if (range && range.from <= dateTo && range.to >= plannedDateFrom) {
          const p = order.pallet_count || 0; const w = Number(order.weight_kg) || 0;
          ordersOnTrailer.push({ ref: order.reference_number, pallets: p, weight: w });
          totalPallets += p; totalWeight += w;
        }
      }
    }
    setCapacityInfo({ trailer_id: tId, current_pallets: totalPallets, current_weight_kg: totalWeight, max_pallets: trailer.max_pallets || 33, max_weight_kg: Number(trailer.max_weight_kg) || 24000, orders: ordersOnTrailer });
  }, [adminId, plannedDateFrom, plannedDateTo, trailers, supabase]);

  // Fetch existing stops for the vehicle + existing trip data
  const fetchExistingStops = useCallback(async (vId: string) => {
    if (!vId || !plannedDateFrom) { setExistingStops([]); setExistingTripData(null); return; }
    const dateTo = plannedDateTo || plannedDateFrom;
    const { data: overlappingOrders } = await supabase
      .from("orders")
      .select("id, reference_number, vehicle_id, order_stops(city, address, stop_type, planned_date, lat, lng)")
      .eq("admin_id", adminId).eq("vehicle_id", vId)
      .in("status", ["confirmed", "dispatched", "in_transit"]);

    const found: ExistingStop[] = [];
    const overlappingOrderIds: string[] = [];
    for (const order of (overlappingOrders || [])) {
      const orderStops = (order.order_stops as any[]) || [];
      const dates = orderStops.map((s: any) => s.planned_date).filter(Boolean).sort();
      const from = dates[0]; const to = dates[dates.length - 1] || from;
      if (from && from <= dateTo && to >= plannedDateFrom) {
        overlappingOrderIds.push(order.id);
        for (const s of orderStops) {
          found.push({ order_ref: order.reference_number, city: s.city, address: s.address, stop_type: s.stop_type, planned_date: s.planned_date || "", lat: s.lat, lng: s.lng });
        }
      }
    }
    setExistingStops(found);

    // Fetch existing trip for the vehicle in this date range
    if (overlappingOrderIds.length > 0) {
      // Find trips linked to overlapping orders on this vehicle
      const { data: tripLinks } = await supabase
        .from("trip_orders").select("trip_id, order_id")
        .in("order_id", overlappingOrderIds);
      if (tripLinks?.length) {
        const tripIds = [...new Set(tripLinks.map(tl => tl.trip_id))];
        const { data: existingTrips } = await supabase
          .from("trips")
          .select(`id, reference_number, vehicle_id, driver_id, trailer_id, status,
            trip_stops(id, city, country, address, company_name, stop_type, planned_date, planned_time_from, planned_time_to, lat, lng, notes, sequence_order, order_id, order_stop_id)`)
          .in("id", tripIds)
          .eq("vehicle_id", vId);
        if (existingTrips?.length) {
          // Pick the first matching trip on this vehicle
          const trip = existingTrips[0];
          const sortedStops = ((trip as any).trip_stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order);
          // Look up order refs for each stop
          const orderRefMap = new Map<string, string>();
          for (const o of (overlappingOrders || [])) {
            orderRefMap.set(o.id, o.reference_number);
          }
          const tripStops: ExistingTripStop[] = sortedStops.map((ts: any) => ({
            id: ts.id,
            city: ts.city || "",
            country: ts.country || "",
            address: ts.address || "",
            company_name: ts.company_name || "",
            stop_type: ts.stop_type || "",
            planned_date: ts.planned_date,
            planned_time_from: ts.planned_time_from,
            planned_time_to: ts.planned_time_to,
            lat: ts.lat,
            lng: ts.lng,
            notes: ts.notes,
            sequence_order: ts.sequence_order,
            order_id: ts.order_id,
            order_stop_id: ts.order_stop_id,
            order_ref: ts.order_id ? (orderRefMap.get(ts.order_id) || null) : null,
          }));
          setExistingTripData({
            tripId: trip.id,
            tripRef: trip.reference_number,
            vehicleId: trip.vehicle_id,
            driverId: trip.driver_id,
            trailerId: trip.trailer_id,
            status: trip.status,
            tripStops,
            orderIds: tripLinks.filter(tl => tripIds.includes(tl.trip_id)).map(tl => tl.order_id),
          });
        } else {
          setExistingTripData(null);
        }
      } else {
        setExistingTripData(null);
      }
    } else {
      setExistingTripData(null);
    }
  }, [adminId, plannedDateFrom, plannedDateTo, supabase]);

  // Calculate route
  const calcRoute = useCallback(async (fromStop: StopInfo | undefined, toStop: StopInfo | undefined, opts: RouteOptions, intermediateStops?: StopInfo[]): Promise<LegRouteInfo | null> => {
    if (!fromStop?.city || !toStop?.city) return null;
    try {
      const resolveCoords = async (s: StopInfo) => {
        if (s.lat && s.lng) return { lat: s.lat, lng: s.lng };
        return geocodeCity(s.city + " " + (s.address || ""));
      };
      const allStops = [fromStop, ...(intermediateStops || []), toStop];
      const coords = await Promise.all(allStops.map(resolveCoords));
      const validCoords = coords.filter(Boolean) as { lat: number; lng: number }[];
      if (validCoords.length < 2) return null;

      const useTolls = opts.avoid_tolls ? 0.0 : 0.5;
      const routeRes = await fetch("/api/tms/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: validCoords.map(c => ({ lat: c.lat, lon: c.lng, type: "break" })),
          costing: "truck",
          costing_options: { truck: { height: 4.0, width: 2.55, length: 16.5, weight: 40.0, axle_load: 8.0, use_tolls: useTolls } },
          units: "kilometers",
        }),
      });
      const data = await routeRes.json();
      if (!routeRes.ok || !data.latlngs) return null;

      const dist = Math.round(data.distance_km);
      const dur = data.duration_minutes;
      const consumption = parseFloat(opts.fuel_consumption_per_100km) || 32;
      const fuelPrice = parseFloat(opts.fuel_price_per_liter) || 1.45;
      const fuelLiters = (dist / 100) * consumption;
      const geometry: [number, number][] = data.latlngs;

      return {
        distance_km: dist, duration_hours: Math.floor(dur / 60), duration_minutes: dur % 60,
        fuel_liters: fuelLiters, fuel_cost: fuelLiters * fuelPrice, toll_countries: [], geometry,
      };
    } catch { return null; }
  }, []);

  // Auto-check effects
  useEffect(() => { if (!hasMultipleTrips) checkConflicts(vehicleId, driverId, trailerId); }, [vehicleId, driverId, trailerId, hasMultipleTrips, checkConflicts]);
  useEffect(() => { if (!hasMultipleTrips) checkCapacity(trailerId); }, [trailerId, hasMultipleTrips, checkCapacity]);
  useEffect(() => { if (!hasMultipleTrips && vehicleId) fetchExistingStops(vehicleId); }, [vehicleId, hasMultipleTrips, fetchExistingStops]);
  useEffect(() => {
    if (!hasMultipleTrips && vehicleId && !trailerId) {
      const v = vehicles.find(v2 => v2.id === vehicleId);
      if (v?.default_trailer_id) onSimpleChange("trailer_id", v.default_trailer_id);
    }
  }, [vehicleId, trailerId, vehicles, hasMultipleTrips, onSimpleChange]);

  // Calculate route for simple (single trip) mode
  useEffect(() => {
    if (!hasMultipleTrips && stops.length >= 2 && orderType === "internal") {
      calcRoute(stops[0], stops[stops.length - 1], simpleRouteOptions, stops.slice(1, -1)).then(info => {
        if (info) setSimpleRouteInfo(info);
      });
    }
  }, [stops, hasMultipleTrips, orderType, simpleRouteOptions, calcRoute]);

  // Auto-create default trip when stops exist but no trips defined
  // Use a ref to prevent race conditions when adding swap stops
  const lastStopsLengthRef = useRef(stops.length);
  useEffect(() => {
    // Don't auto-create if stops just increased (likely a swap stop was added with trips)
    const stopsJustIncreased = stops.length > lastStopsLengthRef.current;
    lastStopsLengthRef.current = stops.length;
    
    // Only create default trip if we have exactly 2 stops and no trips
    // Skip if stops increased (swap stop added) - the caller should handle trips
    if (stops.length >= 2 && trips.length === 0 && !stopsJustIncreased) {
      const defaultTrip: TripSegment = {
        id: crypto.randomUUID(),
        trip_number: 1,
        assignment_type: orderType === "forwarding" ? "forwarding" : "undecided",
        driver_id: driverId || "",
        vehicle_id: vehicleId || "",
        trailer_id: trailerId || "",
        carrier_id: "",
        carrier_cost: "",
        carrier_currency: "EUR",
        carrier_vat_type: "excluding",
        carrier_vat_rate: "21",
        from_stop_index: 0,
        to_stop_index: stops.length - 1,
        swap_type: null,
        notes: "",
        route_info: null,
      };
      onTripsChange([defaultTrip]);
    }
  }, [stops.length, trips.length, orderType, driverId, vehicleId, trailerId, onTripsChange]);

  // ─── Trip helpers ─────────────────────────────────────────────────────────

  const updateTrip = (index: number, updates: Partial<TripSegment>) => {
    onTripsChange(trips.map((t, i) => i === index ? { ...t, ...updates } : t));
  };

  // Add a swap between stop[afterStopIdx] and stop[afterStopIdx+1]
  // This splits the trip that spans that range into two trips
  const addSwapBetweenStops = (afterStopIdx: number) => {
    // Find the trip that contains this stop boundary
    const tripIdx = trips.findIndex(t => t.from_stop_index <= afterStopIdx && t.to_stop_index > afterStopIdx);
    if (tripIdx === -1) return;

    const trip = trips[tripIdx];
    const swapStopIdx = afterStopIdx; // This stop is where the previous trip ends
    const nextStopIdx = afterStopIdx + 1; // Next trip starts here

    // Shorten current trip to end at swapStopIdx
    const shortened = { ...trip, to_stop_index: swapStopIdx };

    // New trip starts at nextStopIdx and goes to the original end
    const newTrip: TripSegment = {
      id: crypto.randomUUID(),
      trip_number: trips.length + 1,
      assignment_type: "own_fleet",
      driver_id: "",
      vehicle_id: "",
      trailer_id: trip.trailer_id, // trailer continues by default
      carrier_id: "",
      carrier_cost: "",
      carrier_currency: "EUR",
      carrier_vat_type: "excluding",
      carrier_vat_rate: "21",
      from_stop_index: nextStopIdx,
      to_stop_index: trip.to_stop_index,
      swap_type: "truck_swap",
      notes: "",
      route_info: null,
    };

    // Build the new trips array
    const newTrips = [...trips];
    newTrips[tripIdx] = shortened;
    newTrips.splice(tripIdx + 1, 0, newTrip);

    // Renumber
    const renumbered = newTrips.map((t, i) => ({ ...t, trip_number: i + 1 }));
    onTripsChange(renumbered);
  };

  // Remove a swap (merge trip[idx] and trip[idx+1])
  const removeSwap = (tripIdx: number) => {
    if (trips.length <= 1 || tripIdx >= trips.length - 1) return;
    const merged = {
      ...trips[tripIdx],
      to_stop_index: trips[tripIdx + 1].to_stop_index,
    };
    const newTrips = trips.filter((_, i) => i !== tripIdx + 1);
    newTrips[tripIdx] = merged;
    const renumbered = newTrips.map((t, i) => ({ ...t, trip_number: i + 1 }));
    onTripsChange(renumbered);
  };

  const calcTripRoute = useCallback(async (tripIdx: number) => {
    const trip = trips[tripIdx];
    if (!trip) return;
    const from = stops[trip.from_stop_index];
    const to = stops[trip.to_stop_index];
    const between = stops.filter((_, i) => i > trip.from_stop_index && i < trip.to_stop_index);
    const info = await calcRoute(from, to, simpleRouteOptions, between);
    if (info) updateTrip(tripIdx, { route_info: info });
  }, [trips, stops, calcRoute, simpleRouteOptions]);

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderConflicts = () => {
    if (conflicts.length === 0) return null;
    return (
      <div className="space-y-2">
        {conflicts.map((c, i) => (
          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <span className="font-medium text-amber-500 capitalize">{c.type}</span>
              {" already assigned to "}<span className="font-medium">{c.order_ref}</span>{" "}
              <span className="text-muted-foreground">({c.date_from} - {c.date_to}, dest: {c.destination})</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCapacity = () => {
    if (!capacityInfo) return null;
    const newPallets = palletCount || 0; const newWeight = weightKg || 0;
    const totalPallets = capacityInfo.current_pallets + newPallets;
    const totalWeight = capacityInfo.current_weight_kg + newWeight;
    const palletPct = capacityInfo.max_pallets > 0 ? Math.round((totalPallets / capacityInfo.max_pallets) * 100) : 0;
    const weightPct = capacityInfo.max_weight_kg > 0 ? Math.round((totalWeight / capacityInfo.max_weight_kg) * 100) : 0;
    const overPallets = totalPallets > capacityInfo.max_pallets;
    const overWeight = totalWeight > capacityInfo.max_weight_kg;
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <h5 className="text-[10px] font-medium flex items-center gap-1"><Package className="h-3 w-3" /> Capacity</h5>
          {capacityInfo.orders.length > 0 && <span className="text-[9px] text-muted-foreground">{capacityInfo.orders.length} other</span>}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Pallets</span>
            <span className={overPallets ? "text-destructive font-medium" : ""}>{totalPallets}/{capacityInfo.max_pallets}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${overPallets ? "bg-destructive" : palletPct > 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(palletPct, 100)}%` }} />
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Weight</span>
            <span className={overWeight ? "text-destructive font-medium" : ""}>{totalWeight.toLocaleString()}/{capacityInfo.max_weight_kg.toLocaleString()} kg</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${overWeight ? "bg-destructive" : weightPct > 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(weightPct, 100)}%` }} />
          </div>
        </div>
        {(overPallets || overWeight) && <div className="flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-2.5 w-2.5" /> Over capacity!</div>}
      </div>
    );
  };

  const renderFleetSelectors = (
    d: string, v: string, t: string,
    onChange: (field: string, val: string) => void,
  ) => (
    <div className="space-y-1.5">
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground/70">Driver</Label>
        <SearchCombobox items={drivers} value={d} onChange={(id) => onChange("driver_id", id)}
          placeholder="Select driver..." icon={User} emptyMessage="No drivers found"
          searchFn={(dr, q) => dr.name.toLowerCase().includes(q) || (dr.phone || "").includes(q)}
          renderItem={(dr) => (<div><div className="text-xs font-medium">{dr.name}</div><div className="text-[10px] text-muted-foreground">{dr.phone}{dr.license_categories ? ` | ${dr.license_categories.join(", ")}` : ""}</div></div>)}
          renderSelected={(dr) => dr.name} />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground/70">Vehicle</Label>
        <SearchCombobox items={vehicles} value={v} onChange={(id) => onChange("vehicle_id", id)}
          placeholder="Select vehicle..." icon={Truck} emptyMessage="No vehicles found"
          searchFn={(vh, q) => vh.plate_number.toLowerCase().includes(q) || (vh.make || "").toLowerCase().includes(q)}
          renderItem={(vh) => (<div><div className="text-xs font-medium">{vh.plate_number}</div><div className="text-[10px] text-muted-foreground">{vh.make} {vh.model}{vh.max_pallets ? ` | ${vh.max_pallets}p` : ""}</div></div>)}
          renderSelected={(vh) => vh.plate_number} />
      </div>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground/70">Trailer</Label>
        <SearchCombobox items={trailers} value={t} onChange={(id) => onChange("trailer_id", id)}
          placeholder="Select trailer..." icon={Container} emptyMessage="No trailers found"
          searchFn={(tr, q) => tr.plate_number.toLowerCase().includes(q) || (tr.trailer_type || "").toLowerCase().includes(q)}
          renderItem={(tr) => (<div><div className="text-xs font-medium">{tr.plate_number}</div><div className="text-[10px] text-muted-foreground">{tr.make} {tr.model}{tr.trailer_type ? ` | ${tr.trailer_type}` : ""}{tr.max_pallets ? ` | ${tr.max_pallets}p` : ""}</div></div>)}
          renderSelected={(tr) => `${tr.plate_number} - ${tr.trailer_type || tr.make}`} />
      </div>
    </div>
  );

  // ─── Forwarding ───────────────────────────────────────────────────────────

  // Filter carriers for forwarding mode
  const carrierPartners = useMemo(() => 
    partners.filter(p => p.types?.includes("carrier") || p.types?.includes("forwarder"))
  , [partners]);
  
  const selectedCarrier = carrierPartners.find(p => p.id === selectedCarrierId);

  // State for carrier VAT
  const [carrierVatType, setCarrierVatType] = useState<"excluding" | "including" | "exempt" | "reverse_charge" | "non_taxable">("excluding");
  const [carrierVatRate, setCarrierVatRate] = useState("21");
  const [carrierCost, setCarrierCost] = useState("");
  const [carrierCurrency, setCarrierCurrency] = useState("EUR");

  // Calculate VAT amounts for display
  const calculateVat = (price: string, vatType: string, vatRate: string) => {
    const priceNum = parseFloat(price) || 0;
    const rate = parseFloat(vatRate) || 21;
    if (!priceNum || ["exempt", "reverse_charge", "non_taxable"].includes(vatType)) {
      return { vatAmount: 0, withVat: priceNum, withoutVat: priceNum };
    }
    if (vatType === "including") {
      const withoutVat = priceNum / (1 + rate / 100);
      return { vatAmount: priceNum - withoutVat, withVat: priceNum, withoutVat };
    }
    const vatAmount = priceNum * (rate / 100);
    return { vatAmount, withVat: priceNum + vatAmount, withoutVat: priceNum };
  };

  const carrierVatCalc = calculateVat(carrierCost, carrierVatType, carrierVatRate);

  if (orderType === "forwarding") {
    return (
      <div className="space-y-3">
        {/* Carrier Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Carrier</Label>
          <div className="flex items-center gap-1.5">
            <Popover open={carrierOpen} onOpenChange={setCarrierOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={carrierOpen}
                  className="flex-1 justify-between h-10 md:h-9 font-normal text-sm"
                >
                  {selectedCarrier ? selectedCarrier.name : "Select carrier..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search carriers..." />
                  <CommandList>
                    <CommandEmpty>
                      <div className="py-3 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No carrier found.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => {
                            setCarrierOpen(false);
                            setShowQuickCreateCarrier(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create new carrier
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {carrierPartners.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={() => {
                            setSelectedCarrierId(p.id);
                            onSimpleChange("carrier_id", p.id);
                            setCarrierOpen(false);
                          }}
                          className="min-h-[44px] md:min-h-0"
                        >
                          <Check className={`mr-2 h-4 w-4 ${selectedCarrierId === p.id ? "opacity-100" : "opacity-0"}`} />
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 md:h-9 md:w-9 shrink-0 hover:bg-primary/10 hover:border-primary/50"
              title="Create new carrier"
              onClick={() => setShowQuickCreateCarrier(true)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Pricing Row 1: Cost, Currency */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Carrier Cost</Label>
            <Input 
              type="number" 
              placeholder="0.00" 
              className="h-10 md:h-9"
              value={carrierCost}
              onChange={e => {
                setCarrierCost(e.target.value);
                onSimpleChange("carrier_cost", e.target.value);
              }} 
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <Select 
              value={carrierCurrency}
              onValueChange={(v) => {
                setCarrierCurrency(v);
                onSimpleChange("carrier_currency", v);
              }}
            >
              <SelectTrigger className="h-10 md:h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{["EUR", "RON", "USD", "GBP", "HUF", "CZK", "PLN"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Pricing Row 2: VAT Type, VAT Rate */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">VAT Type</Label>
            <Select 
              value={carrierVatType} 
              onValueChange={(v) => {
                setCarrierVatType(v as typeof carrierVatType);
                onSimpleChange("carrier_vat_type", v);
              }}
            >
              <SelectTrigger className="h-10 md:h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="excluding">Without VAT</SelectItem>
                <SelectItem value="including">VAT Included</SelectItem>
                <SelectItem value="exempt">VAT Exempt</SelectItem>
                <SelectItem value="reverse_charge">Reverse Charge</SelectItem>
                <SelectItem value="non_taxable">Non-taxable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">VAT Rate</Label>
            <Select 
              value={carrierVatRate} 
              onValueChange={(v) => {
                setCarrierVatRate(v);
                onSimpleChange("carrier_vat_rate", v);
              }}
              disabled={["exempt", "reverse_charge", "non_taxable"].includes(carrierVatType)}
            >
              <SelectTrigger className="h-10 md:h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="21">21%</SelectItem>
                <SelectItem value="9">9%</SelectItem>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="0">0%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Payment Terms */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Payment Terms (days)</Label>
          <Input 
            type="number" 
            placeholder="30" 
            defaultValue="30"
            className="h-10 md:h-9 w-24"
            onChange={e => onSimpleChange("payment_terms_carrier_days", e.target.value)} 
          />
        </div>

        {/* VAT Calculation Summary */}
        {carrierCost && parseFloat(carrierCost) > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border/50 p-2.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {carrierVatType === "including" ? "Price (VAT incl.)" : "Net Price"}
              </span>
              <span className="font-medium">{parseFloat(carrierCost).toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {carrierCurrency}</span>
            </div>
            {!["exempt", "reverse_charge", "non_taxable"].includes(carrierVatType) && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">VAT ({carrierVatRate}%)</span>
                  <span className="font-medium">{carrierVatCalc.vatAmount.toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {carrierCurrency}</span>
                </div>
                <div className="h-px bg-border/50 my-1" />
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{carrierVatType === "including" ? "Net Price" : "Total (with VAT)"}</span>
                  <span className="text-primary">
                    {(carrierVatType === "including" ? carrierVatCalc.withoutVat : carrierVatCalc.withVat).toLocaleString("ro-RO", { minimumFractionDigits: 2 })} {carrierCurrency}
                  </span>
                </div>
              </>
            )}
            {carrierVatType === "exempt" && (
              <p className="text-[10px] text-amber-500 mt-1">VAT exempt - intra-EU with valid VAT numbers</p>
            )}
            {carrierVatType === "reverse_charge" && (
              <p className="text-[10px] text-amber-500 mt-1">Reverse charge - VAT paid by recipient</p>
            )}
            {carrierVatType === "non_taxable" && (
              <p className="text-[10px] text-blue-400 mt-1">Non-taxable - export outside EU</p>
            )}
          </div>
        )}
        
        {/* Quick Create Carrier Dialog */}
        <QuickCreatePartnerDialog
          open={showQuickCreateCarrier}
          onOpenChange={setShowQuickCreateCarrier}
          adminId={adminId}
          defaultType="carrier"
          onCreated={(partner) => {
            onPartnerCreated?.({ id: partner.id, name: partner.name, types: partner.types || ["carrier"] });
            setSelectedCarrierId(partner.id);
            onSimpleChange("carrier_id", partner.id);
          }}
        />
      </div>
    );
  }

  // ─── Trip Leg State for Dialog ───────────────────────────────
  const [editingLegIndex, setEditingLegIndex] = useState<number | null>(null);
  
  // Fetch carrier's resources when carrier is selected for a leg
  const selectedCarrierIdForLeg = editingLegIndex !== null ? trips[editingLegIndex]?.carrier_id : null;
  useEffect(() => {
    if (!selectedCarrierIdForLeg) {
      setCarrierVehicles([]);
      setCarrierTrailers([]);
      setCarrierDrivers([]);
      return;
    }
    const fetchCarrierResources = async () => {
      // Carrier resources live in the same vehicles/trailers/drivers tables,
      // filtered by business_partner_id. This matches TripLegAssignmentDialog.
      const [vRes, tRes, dRes] = await Promise.all([
        supabase.from("vehicles").select("id, plate_number").eq("business_partner_id", selectedCarrierIdForLeg).order("plate_number"),
        supabase.from("trailers").select("id, plate_number").eq("business_partner_id", selectedCarrierIdForLeg).order("plate_number"),
        supabase.from("drivers").select("id, name, phone").eq("business_partner_id", selectedCarrierIdForLeg).order("name"),
      ]);
      setCarrierVehicles(vRes.data || []);
      setCarrierTrailers(tRes.data || []);
      setCarrierDrivers(dRes.data || []);
    };
    fetchCarrierResources();
  }, [selectedCarrierIdForLeg, supabase]);
  
  // Create default leg if none exist
  useEffect(() => {
    if (trips.length === 0 && stops.length >= 2) {
      const defaultTrip: TripSegment = {
        id: crypto.randomUUID(),
        trip_number: 1,
        assignment_type: "own_fleet",
        driver_id: driverId || "",
        vehicle_id: vehicleId || "",
        trailer_id: trailerId || "",
        carrier_id: "",
        carrier_cost: "",
        carrier_currency: "EUR",
        carrier_vat_type: "excluding",
        carrier_vat_rate: "21",
        from_stop_index: 0,
        to_stop_index: stops.length - 1,
        swap_type: null,
        notes: "",
        route_info: null,
      };
      onTripsChange([defaultTrip]);
    }
  }, [stops.length, trips.length, driverId, vehicleId, trailerId]);

  // Sync simple selectors to first trip
  useEffect(() => {
    if (trips.length === 1) {
      const trip = trips[0];
      if (trip.driver_id !== driverId || trip.vehicle_id !== vehicleId || trip.trailer_id !== trailerId) {
        updateTrip(0, { driver_id: driverId, vehicle_id: vehicleId, trailer_id: trailerId });
      }
    }
  }, [driverId, vehicleId, trailerId]);

  // Helper to get driver/vehicle/trailer names
  const getDriverName = (id: string) => drivers.find(d => d.id === id)?.name || "";
  const getVehiclePlate = (id: string) => vehicles.find(v => v.id === id)?.plate_number || "";
  const getTrailerPlate = (id: string) => trailers.find(t => t.id === id)?.plate_number || "";
  const getCarrierName = (id: string) => partners.find(p => p.id === id)?.name || "";

  // Add a new leg (swap point)
  const addLeg = () => {
    if (trips.length === 0 || stops.length < 2) return;
    const lastTrip = trips[trips.length - 1];
    
    // For 2 stops, we need at least 3 stops to create a swap point in the middle
    // The parent should handle adding the execution stop first
    if (stops.length === 2) {
      // Signal to parent that we need an execution stop added
      // The button shouldn't be clickable in this state - handled by UI condition
      return;
    }
    
    // Find a valid split point - need at least one stop between from and to
    const fromIdx = lastTrip.from_stop_index;
    const toIdx = lastTrip.to_stop_index;
    
    if (toIdx - fromIdx < 2) {
      // Can't split if there's no stop between start and end
      return;
    }
    
    // Split at the first execution-type stop if one exists, otherwise at midpoint
    let splitIdx = Math.floor((fromIdx + toIdx) / 2);
    for (let i = fromIdx + 1; i < toIdx; i++) {
      if (stops[i] && (stops[i] as any).origin === "execution") {
        splitIdx = i;
        break;
      }
    }
    
    // Split the last trip at the split point
    const updatedLastTrip = { ...lastTrip, to_stop_index: splitIdx };
    const newTrip: TripSegment = {
      id: crypto.randomUUID(),
      trip_number: trips.length + 1,
      assignment_type: "own_fleet",
      driver_id: "",
      vehicle_id: "",
      trailer_id: "",
      carrier_id: "",
      carrier_cost: "",
      carrier_currency: "EUR",
      carrier_vat_type: "excluding",
      carrier_vat_rate: "21",
      from_stop_index: splitIdx,
      to_stop_index: toIdx,
      swap_type: "truck_swap",
      notes: "",
      route_info: null,
    };
    onTripsChange([...trips.slice(0, -1), updatedLastTrip, newTrip]);
  };

  // ─── Unified Trip Legs UI ───────────────────────────────
  const renderTripLegs = () => {
    return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">Trip Legs ({trips.length})</span>
        </div>
        <span className="text-[10px] text-muted-foreground">Click a leg to edit</span>
      </div>

      {/* Legs List */}
      <div className="space-y-2">
        {trips.map((trip, idx) => {
          const fromStop = stops[trip.from_stop_index];
          const toStop = stops[trip.to_stop_index];
          const color = TRIP_COLORS[idx % TRIP_COLORS.length];
          const assignmentColor = trip.assignment_type === "own_fleet" 
            ? "border-blue-500/30 bg-blue-500/5" 
            : trip.assignment_type === "forwarding" 
              ? "border-indigo-500/30 bg-indigo-500/5" 
              : "border-amber-500/30 bg-amber-500/5";

          return (
            <div key={trip.id}>
              {/* Swap indicator between legs */}
              {idx > 0 && trip.swap_type && (
                <div className="flex items-center gap-2 py-1 mb-1">
                  <div className="flex-1 h-px bg-border" />
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-dashed border-amber-500/40 bg-amber-500/5">
                    <ArrowLeftRight className="h-2.5 w-2.5 text-amber-500" />
                    <span className="text-[9px] text-amber-500">
                      {trip.swap_type === "truck_swap" ? "Truck" : trip.swap_type === "trailer_swap" ? "Trailer" : trip.swap_type === "full_swap" ? "Full" : "Swap"}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              <button
                type="button"
                onClick={() => setEditingLegIndex(idx)}
                className={`w-full rounded-lg border p-3 text-left transition-all hover:ring-1 hover:ring-primary/50 ${assignmentColor}`}
                style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Leg {trip.trip_number}</span>
                    <Badge 
  variant="outline"
  className={`text-[9px] px-1.5 ${
  trip.assignment_type === "own_fleet"
  ? "text-blue-400 border-blue-500/30"
  : trip.assignment_type === "forwarding"
  ? "text-indigo-400 border-indigo-500/30"
  : "text-amber-400 border-amber-500/30"
  }`}
  >
  {trip.assignment_type === "own_fleet" ? "Own Fleet" : trip.assignment_type === "forwarding" ? "Subcontract" : "Undecided"}
  </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg]" />
                </div>
              
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <MapPin className="h-3 w-3" />
                  <span>{fromStop?.city || "Start"}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{toStop?.city || "End"}</span>
                </div>
                
                {trip.assignment_type === "own_fleet" && (
                  <div className="flex items-center gap-3 text-[10px] flex-wrap">
                    {trip.driver_id && getDriverName(trip.driver_id) && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <User className="h-3 w-3" /> {getDriverName(trip.driver_id)}
                      </span>
                    )}
                    {trip.vehicle_id && getVehiclePlate(trip.vehicle_id) && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Truck className="h-3 w-3" /> {getVehiclePlate(trip.vehicle_id)}
                      </span>
                    )}
                    {trip.trailer_id && getTrailerPlate(trip.trailer_id) && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Container className="h-3 w-3" /> {getTrailerPlate(trip.trailer_id)}
                      </span>
                    )}
                    {!trip.driver_id && !trip.vehicle_id && (
                      <span className="text-muted-foreground">No resources assigned</span>
                    )}
                  </div>
                )}
                
                {trip.assignment_type === "forwarding" && (
                  <div className="flex items-center gap-3 text-[10px] flex-wrap">
                    {trip.carrier_id && getCarrierName(trip.carrier_id) && (
                      <span className="flex items-center gap-1 text-indigo-400">
                        <Building2 className="h-3 w-3" /> {getCarrierName(trip.carrier_id)}
                      </span>
                    )}
                    {trip.subcontractor_vehicle_plate && (
                      <span className="flex items-center gap-1 text-indigo-300">
                        <Truck className="h-3 w-3" /> {trip.subcontractor_vehicle_plate}
                      </span>
                    )}
                    {trip.subcontractor_driver_name && (
                      <span className="flex items-center gap-1 text-indigo-300">
                        <User className="h-3 w-3" /> {trip.subcontractor_driver_name}
                      </span>
                    )}
                    {trip.carrier_cost && (
                      <span className="text-indigo-300">
                        {parseFloat(trip.carrier_cost).toLocaleString()} {trip.carrier_currency}
                      </span>
                    )}
                    {!trip.carrier_id && (
                      <span className="text-muted-foreground">No carrier assigned</span>
                    )}
                  </div>
                )}
                
                {(trip.assignment_type === "undecided" || !trip.assignment_type) && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-amber-400/70">Execution pending decision</span>
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {trips.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-4 text-center">
          <Route className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No Trip Legs Defined</p>
          <p className="text-xs text-muted-foreground">Create legs to assign different execution methods per segment</p>
        </div>
      )}

      {/* Add Leg button - show with 2+ stops */}
      {stops.length >= 2 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 h-8 text-xs"
          onClick={() => {
            // "Add Leg (Swap Point)" ALWAYS adds a new swap stop to the execution stops list
            // The user can then drag it to position it between existing stops
            if (onRequestSwapStop) {
              onRequestSwapStop();
            } else {
              // Fallback: split existing trip if possible (legacy behavior without execution layer)
              addLeg();
            }
          }}
        >
          <Plus className="h-3 w-3" /> Add Leg (Swap Point)
        </Button>
      )}

      {/* Leg Edit Panel - inline for simplicity */}
      {editingLegIndex !== null && trips[editingLegIndex] && (
        <div className="rounded-lg border border-primary/50 bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Edit Leg {trips[editingLegIndex].trip_number}</span>
            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingLegIndex(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Assignment type toggle - 3 options like TripLegAssignmentDialog */}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => updateTrip(editingLegIndex, { assignment_type: "own_fleet" })}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border text-xs transition-all ${trips[editingLegIndex].assignment_type === "own_fleet" ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-border hover:border-blue-500/40"}`}>
              <Truck className="h-3 w-3" /> Own Fleet
            </button>
            <button type="button" onClick={() => updateTrip(editingLegIndex, { assignment_type: "forwarding" })}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border text-xs transition-all ${trips[editingLegIndex].assignment_type === "forwarding" ? "border-indigo-500 bg-indigo-500/10 text-indigo-400" : "border-border hover:border-indigo-500/40"}`}>
              <Building2 className="h-3 w-3" /> Subcontract
            </button>
            <button type="button" onClick={() => updateTrip(editingLegIndex, { assignment_type: "undecided" })}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border text-xs transition-all ${trips[editingLegIndex].assignment_type === "undecided" || !trips[editingLegIndex].assignment_type ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-border hover:border-amber-500/40"}`}>
              <HelpCircle className="h-3 w-3" /> Undecided
            </button>
          </div>

          {(trips[editingLegIndex].assignment_type === "undecided" || !trips[editingLegIndex].assignment_type) && (
            <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center">
              <HelpCircle className="h-6 w-6 text-amber-400 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-amber-400">Execution Undecided</p>
              <p className="text-[10px] text-muted-foreground mt-1">This leg will be marked as pending decision. You can assign execution later.</p>
            </div>
          )}

          {trips[editingLegIndex].assignment_type === "own_fleet" && (
            <div className="space-y-2">
              {renderFleetSelectors(
                trips[editingLegIndex].driver_id, 
                trips[editingLegIndex].vehicle_id, 
                trips[editingLegIndex].trailer_id,
                (field, val) => {
                  updateTrip(editingLegIndex, { [field]: val });
                  // Sync to simple selectors for single leg
                  if (trips.length === 1) {
                    onSimpleChange(field, val);
                  }
                },
              )}
            </div>
          )}

          {trips[editingLegIndex].assignment_type === "forwarding" && (
            <div className="space-y-3">
              <p className="text-[10px] text-muted-foreground">Subcontract this leg to a carrier partner.</p>
              
              {/* Forwarding Order Radio */}
              <div className="rounded-lg border border-border/50 p-3 space-y-2">
                <Label className="text-[10px] font-medium">Forwarding Order</Label>
                <RadioGroup 
                  value={trips[editingLegIndex].fwd_order_mode || "none"} 
                  onValueChange={(v) => updateTrip(editingLegIndex, { fwd_order_mode: v as "none" | "existing" | "new" })} 
                  className="flex flex-wrap gap-3"
                >
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="none" id={`fwd-none-${editingLegIndex}`} className="h-3 w-3" />
                    <Label htmlFor={`fwd-none-${editingLegIndex}`} className="text-[10px] font-normal cursor-pointer">No FWD Order</Label>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="existing" id={`fwd-existing-${editingLegIndex}`} className="h-3 w-3" />
                    <Label htmlFor={`fwd-existing-${editingLegIndex}`} className="text-[10px] font-normal cursor-pointer flex items-center gap-1">
                      <Link2 className="h-2.5 w-2.5" /> Link Existing
                    </Label>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="new" id={`fwd-new-${editingLegIndex}`} className="h-3 w-3" />
                    <Label htmlFor={`fwd-new-${editingLegIndex}`} className="text-[10px] font-normal cursor-pointer flex items-center gap-1">
                      <Plus className="h-2.5 w-2.5" /> Create New
                    </Label>
                  </div>
                </RadioGroup>
                
                {trips[editingLegIndex].fwd_order_mode === "new" && (
                  <p className="text-[9px] text-muted-foreground">A new FWD order will be created with the carrier you select below.</p>
                )}
              </div>
              
              {/* Carrier with searchable Popover */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Carrier</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-between text-xs font-normal">
                      {trips[editingLegIndex].carrier_id && carrierPartners.find(c => c.id === trips[editingLegIndex].carrier_id)?.name || (
                        <span className="text-muted-foreground">Select carrier...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Search carrier..." className="h-8 text-xs" />
                      <CommandList>
                        <CommandEmpty>No carrier found</CommandEmpty>
                        <CommandGroup>
                          {carrierPartners.map(c => (
                            <CommandItem
                              key={c.id}
                              onSelect={() => updateTrip(editingLegIndex, { carrier_id: c.id })}
                              className="text-xs"
                            >
                              <Building2 className="h-3 w-3 mr-2 text-muted-foreground" />
                              {c.name}
                              {trips[editingLegIndex].carrier_id === c.id && <Check className="h-3 w-3 ml-auto" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Subcontractor Vehicle/Trailer/Driver (optional) */}
              <div className="border-t border-border/50 pt-3">
                <p className="text-[10px] text-muted-foreground mb-2">Subcontractor Vehicle/Trailer/Driver (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Vehicle Plate - Searchable */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Vehicle Plate</Label>
                    <Popover open={subVehicleOpen} onOpenChange={setSubVehicleOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-8 justify-between text-xs font-normal">
                          {trips[editingLegIndex].subcontractor_vehicle_plate || <span className="text-muted-foreground">Select or type...</span>}
                          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Search or type..." className="h-8 text-xs" value={subVehicleSearch} onValueChange={setSubVehicleSearch} />
                          <CommandList>
                            {subVehicleSearch && (
                              <CommandGroup heading="Manual Entry">
                                <CommandItem onSelect={() => { updateTrip(editingLegIndex, { subcontractor_vehicle_plate: subVehicleSearch }); setSubVehicleOpen(false); setSubVehicleSearch(""); }} className="text-xs">
                                  <span className="text-muted-foreground">Use:</span> <span className="font-medium ml-1">{subVehicleSearch}</span>
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {carrierVehicles.length > 0 && (
                              <CommandGroup heading="Carrier Vehicles">
                                {carrierVehicles.filter(v => v.plate_number.toLowerCase().includes(subVehicleSearch.toLowerCase())).map(v => (
                                  <CommandItem key={v.id} onSelect={() => { updateTrip(editingLegIndex, { subcontractor_vehicle_plate: v.plate_number }); setSubVehicleOpen(false); setSubVehicleSearch(""); }} className="text-xs">
                                    <Truck className="h-3 w-3 mr-2 text-indigo-400" />
                                    {v.plate_number}
                                    {trips[editingLegIndex].subcontractor_vehicle_plate === v.plate_number && <Check className="h-3 w-3 ml-auto" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            <CommandGroup heading="Internal Fleet">
                              {vehicles.filter(v => v.plate_number.toLowerCase().includes(subVehicleSearch.toLowerCase())).slice(0, 5).map(v => (
                                <CommandItem key={v.id} onSelect={() => { updateTrip(editingLegIndex, { subcontractor_vehicle_plate: v.plate_number }); setSubVehicleOpen(false); setSubVehicleSearch(""); }} className="text-xs">
                                  <Truck className="h-3 w-3 mr-2 text-muted-foreground" />
                                  {v.plate_number}
                                  {trips[editingLegIndex].subcontractor_vehicle_plate === v.plate_number && <Check className="h-3 w-3 ml-auto" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {/* Trailer Plate - Searchable */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Trailer Plate</Label>
                    <Popover open={subTrailerOpen} onOpenChange={setSubTrailerOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-8 justify-between text-xs font-normal">
                          {trips[editingLegIndex].subcontractor_trailer_plate || <span className="text-muted-foreground">Select...</span>}
                          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Search or type..." className="h-8 text-xs" value={subTrailerSearch} onValueChange={setSubTrailerSearch} />
                          <CommandList>
                            {subTrailerSearch && (
                              <CommandGroup heading="Manual Entry">
                                <CommandItem onSelect={() => { updateTrip(editingLegIndex, { subcontractor_trailer_plate: subTrailerSearch }); setSubTrailerOpen(false); setSubTrailerSearch(""); }} className="text-xs">
                                  <span className="text-muted-foreground">Use:</span> <span className="font-medium ml-1">{subTrailerSearch}</span>
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {carrierTrailers.length > 0 && (
                              <CommandGroup heading="Carrier Trailers">
                                {carrierTrailers.filter(t => t.plate_number.toLowerCase().includes(subTrailerSearch.toLowerCase())).map(t => (
                                  <CommandItem key={t.id} onSelect={() => { updateTrip(editingLegIndex, { subcontractor_trailer_plate: t.plate_number }); setSubTrailerOpen(false); setSubTrailerSearch(""); }} className="text-xs">
                                    <Container className="h-3 w-3 mr-2 text-indigo-400" />
                                    {t.plate_number}
                                    {trips[editingLegIndex].subcontractor_trailer_plate === t.plate_number && <Check className="h-3 w-3 ml-auto" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            <CommandGroup heading="Internal Fleet">
                              {trailers.filter(t => t.plate_number.toLowerCase().includes(subTrailerSearch.toLowerCase())).slice(0, 5).map(t => (
                                <CommandItem key={t.id} onSelect={() => { updateTrip(editingLegIndex, { subcontractor_trailer_plate: t.plate_number }); setSubTrailerOpen(false); setSubTrailerSearch(""); }} className="text-xs">
                                  <Container className="h-3 w-3 mr-2 text-muted-foreground" />
                                  {t.plate_number}
                                  {trips[editingLegIndex].subcontractor_trailer_plate === t.plate_number && <Check className="h-3 w-3 ml-auto" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {/* Driver Name - Searchable */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Driver Name</Label>
                    <Popover open={subDriverOpen} onOpenChange={setSubDriverOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-8 justify-between text-xs font-normal">
                          {trips[editingLegIndex].subcontractor_driver_name || <span className="text-muted-foreground">Select or type...</span>}
                          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Search or type..." className="h-8 text-xs" value={subDriverSearch} onValueChange={setSubDriverSearch} />
                          <CommandList>
                            {subDriverSearch && (
                              <CommandGroup heading="Manual Entry">
                                <CommandItem onSelect={() => { updateTrip(editingLegIndex, { subcontractor_driver_name: subDriverSearch }); setSubDriverOpen(false); setSubDriverSearch(""); }} className="text-xs">
                                  <span className="text-muted-foreground">Use:</span> <span className="font-medium ml-1">{subDriverSearch}</span>
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {carrierDrivers.length > 0 && (
                              <CommandGroup heading="Carrier Drivers">
                                {carrierDrivers.filter(d => d.name.toLowerCase().includes(subDriverSearch.toLowerCase())).map(d => (
                                  <CommandItem key={d.id} onSelect={() => { 
                                    updateTrip(editingLegIndex, { 
                                      subcontractor_driver_name: d.name,
                                      subcontractor_driver_phone: d.phone || trips[editingLegIndex].subcontractor_driver_phone 
                                    }); 
                                    setSubDriverOpen(false); 
                                    setSubDriverSearch(""); 
                                  }} className="text-xs">
                                    <User className="h-3 w-3 mr-2 text-indigo-400" />
                                    <span>{d.name}</span>
                                    {d.phone && <span className="text-muted-foreground text-[9px] ml-auto mr-1">{d.phone}</span>}
                                    {trips[editingLegIndex].subcontractor_driver_name === d.name && <Check className="h-3 w-3" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            <CommandGroup heading="Internal Fleet">
                              {drivers.filter(d => d.name.toLowerCase().includes(subDriverSearch.toLowerCase())).slice(0, 5).map(d => (
                                <CommandItem key={d.id} onSelect={() => { 
                                  updateTrip(editingLegIndex, { 
                                    subcontractor_driver_name: d.name,
                                    subcontractor_driver_phone: d.phone || trips[editingLegIndex].subcontractor_driver_phone 
                                  }); 
                                  setSubDriverOpen(false); 
                                  setSubDriverSearch(""); 
                                }} className="text-xs">
                                  <User className="h-3 w-3 mr-2 text-muted-foreground" />
                                  <span>{d.name}</span>
                                  {d.phone && <span className="text-muted-foreground text-[9px] ml-auto mr-1">{d.phone}</span>}
                                  {trips[editingLegIndex].subcontractor_driver_name === d.name && <Check className="h-3 w-3" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {/* Driver Phone - remains text input */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Driver Phone</Label>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <Input className="h-8 text-xs flex-1" placeholder="+40 7XX XXX XXX" value={trips[editingLegIndex].subcontractor_driver_phone || ""} onChange={e => updateTrip(editingLegIndex, { subcontractor_driver_phone: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Cost */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Cost</Label>
                  <Input type="number" className="h-8 text-xs" placeholder="0.00" value={trips[editingLegIndex].carrier_cost} onChange={e => updateTrip(editingLegIndex, { carrier_cost: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Currency</Label>
                  <Select value={trips[editingLegIndex].carrier_currency} onValueChange={(v) => updateTrip(editingLegIndex, { carrier_currency: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["EUR", "RON", "USD", "GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Swap type (for legs after first) */}
          {editingLegIndex > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Swap Type</Label>
              <div className="flex flex-wrap gap-1">
                {(["truck_swap", "trailer_swap", "full_swap"] as const).map(sw => (
                  <button key={sw} type="button" onClick={() => updateTrip(editingLegIndex, { swap_type: sw })}
                    className={`px-2 py-1 rounded border text-[10px] ${trips[editingLegIndex].swap_type === sw ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-border text-muted-foreground"}`}>
                    {sw === "truck_swap" ? "Truck" : sw === "trailer_swap" ? "Trailer" : "Full"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delete leg (if more than 1) */}
          {trips.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                removeSwap(editingLegIndex - 1);
                setEditingLegIndex(null);
              }}
            >
              Remove Leg
            </Button>
          )}
        </div>
      )}

      {/* Conflicts & Capacity */}
      {renderConflicts()}
      {renderCapacity()}
      
      {/* Quick Create Carrier Dialog */}
      <QuickCreatePartnerDialog
        open={showQuickCreateCarrier}
        onOpenChange={setShowQuickCreateCarrier}
        adminId={adminId}
        defaultType="carrier"
        onCreated={(partner) => {
          onPartnerCreated?.({ id: partner.id, name: partner.name, types: partner.types || ["carrier"] });
        }}
      />
    </div>
  );
  };

  // ─── Both single and multi-trip modes use unified Trip Legs UI ───────────────────────────────
  
  return renderTripLegs();
}
