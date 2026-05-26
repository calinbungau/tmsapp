"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Route as RouteIcon, Truck, Search, MapPin, ArrowRight, DollarSign,
  TrendingUp, TrendingDown, Calendar, Building2, User, Container,
  Package, Activity, Layers, Eye, Plus, Clock, Wallet, Percent,
  AlertTriangle, GitMerge, X, Loader2, CheckSquare, Square,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { assignmentBucket } from "@/lib/leg-utils";

// ─── Country Flag Helper ──────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  hungary: "HU", germany: "DE", romania: "RO", poland: "PL", czechia: "CZ",
  "czech republic": "CZ", slovakia: "SK", austria: "AT", france: "FR",
  italy: "IT", spain: "ES", netherlands: "NL", belgium: "BE", croatia: "HR",
  slovenia: "SI", serbia: "RS", bulgaria: "BG", greece: "GR", turkey: "TR",
  ukraine: "UA", moldova: "MD", "united kingdom": "GB", uk: "GB",
  ireland: "IE", portugal: "PT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", switzerland: "CH", luxembourg: "LU", lithuania: "LT",
  latvia: "LV", estonia: "EE", belarus: "BY",
};
function getCountryCode(country: string | null | undefined): string {
  if (!country) return "";
  const t = country.trim();
  const u = t.toUpperCase();
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) return u;
  return COUNTRY_CODES[t.toLowerCase()] || "";
}
function CountryFlag({ country, className = "w-3.5 h-2.5" }: { country: string | null | undefined; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={country || ""}
      className={`${className} rounded-[2px] object-cover shrink-0`}
      crossOrigin="anonymous"
    />
  );
}

// ─── Status config ─────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: "Draft", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400" },
  planned: { label: "Planned", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", dot: "bg-violet-400" },
  dispatched: { label: "Dispatched", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", dot: "bg-indigo-400" },
  in_transit: { label: "In Transit", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  closed: { label: "Closed", color: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-400" },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
};

// ─── Types ─────────────────────────────────────────────────
interface TripStop {
  id: string;
  sequence_order: number;
  stop_type: string | null;
  city: string | null;
  country: string | null;
  planned_date: string | null;
  planned_time_from: string | null;
  order_id: string | null;
  distance_to_km: number | null;
}

interface TripLeg {
  id: string;
  leg_number?: number | null;
  vehicle_id?: string | null;
  driver_id?: string | null;
  carrier_id?: string | null;
  carrier_cost: number | null;
  carrier_currency: string | null;
  assignment_type: string | null;
  forwarding_order_id: string | null;
  from_stop_index?: number | null;
  to_stop_index?: number | null;
}

interface TripOrderLink {
  order_id: string;
  order: {
    id: string;
    reference_number: string;
    customer_price: number | null;
    customer_currency: string | null;
    margin: number | null;
  } | null;
}

interface TripRow {
  id: string;
  reference_number: string | null;
  status: string;
  assignment_type: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  carrier_cost: number | null;
  carrier_currency: string | null;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate_number: string } | null;
  trailer: { id: string; plate_number: string } | null;
  carrier: { id: string; name: string } | null;
  trip_stops: TripStop[];
  trip_legs: TripLeg[];
  trip_orders: TripOrderLink[];
  expenses_total: number;
  // Pre-computed totals from trip_pnl view (already in EUR).
  _pnl_revenue_eur?: number;
  _pnl_carrier_cost_eur?: number;
  _pnl_expenses_eur?: number;
  }

// ─── Helpers ───────────────────────────────────────────────
function fmtCurrency(amount: number | null | undefined, currency: string = "EUR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function durationLabel(mins: number | null | undefined) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ─── Page ──────────────────────────────────────────────────
export default function TripsIndexPage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  // Round Trips represent EXECUTION of an own-fleet driver. Subcontracted
  // legs don't need a Round Trip row in this list — the carrier executes
  // their leg independently and the operator follows progress via the
  // forwarding order, not via dispatch. So we default the assignment
  // filter to "own_fleet" to hide forwarding rows by default while still
  // allowing the operator to flip the dropdown to see them if needed.
  const [assignmentFilter, setAssignmentFilter] = useState<string>("own_fleet"); // own_fleet / forwarding / all
  const [dateRange, setDateRange] = useState<string>("30d"); // 7d / 30d / 90d / all
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  // Pagination — applied client-side after the server-side filters (date /
  // status / assignment) so the user keeps the snappy filter UX. Page is
  // reset to 1 whenever filters change (effect below).
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const fetchTrips = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const s = createClient();

    // Compute date filter
    let fromDate: string | null = null;
    if (dateRange !== "all") {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      const dt = new Date();
      dt.setDate(dt.getDate() - days);
      fromDate = dt.toISOString();
    }

    let query = s
      .from("trips")
      .select(`
        id, reference_number, status, assignment_type,
        planned_start, planned_end, actual_start, actual_end,
        distance_km, duration_minutes, carrier_cost, carrier_currency,
        driver:driver_id(id, name),
        vehicle:vehicle_id(id, plate_number),
        trailer:trailer_id(id, plate_number),
        carrier:business_partners!trips_carrier_id_fkey(id, name),
        trip_stops(id, sequence_order, stop_type, city, country, planned_date, planned_time_from, order_id, distance_to_km),
        trip_legs(id, leg_number, vehicle_id, driver_id, carrier_id, carrier_cost, carrier_currency, assignment_type, forwarding_order_id, from_stop_index, to_stop_index),
        trip_orders(order_id, order:orders(id, reference_number, customer_price, customer_currency, margin))
      `)
      .eq("admin_id", adminSession.id)
      .order("planned_start", { ascending: false, nullsFirst: false })
      .limit(200);

    if (fromDate) query = query.or(`planned_start.gte.${fromDate},actual_start.gte.${fromDate}`);

    if (statusFilter === "active") {
      // "Active" covers everything that hasn't been completed/cancelled yet.
      // Includes both `in_transit` (legacy) and `in_progress` (current value
      // written by the trip editor / dispatch board) so the filter survives
      // the status-vocabulary migration.
      query = query.in("status", ["planned", "dispatched", "in_transit", "in_progress"]);
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (assignmentFilter !== "all") query = query.eq("assignment_type", assignmentFilter);

    const { data, error } = await query;
    if (error) {
      console.log("[v0] Trips fetch error:", error);
      toast({ title: "Failed to load trips", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Trip-scoped costs come from the `trip_pnl` view, which is the single
    // source of truth used by the Trip P&L tab and the Internal Fleet P&L
    // report. Post-consolidation it aggregates cost_entries (driver receipts,
    // admin entries, supplier imports like Shell/Cargobox/OMV, AI-extracted
    // rows) and normalises every amount to EUR using fx_rates @ occurred_at.
    // The previous implementation only looked at order_expenses, which excluded
    // supplier imports entirely — a trip whose only cost was an imported
    // Shell fuel slip showed cost = €0.
    const tripIds = (data || []).map((t: any) => t.id);
    let pnlByTrip = new Map<string, { revenue: number; carrier: number; expenses: number }>();
    if (tripIds.length > 0) {
      const { data: pnlRows } = await s
        .from("trip_pnl")
        .select("trip_id, revenue_amount, carrier_cost_amount, expenses_amount")
        .in("trip_id", tripIds);
      (pnlRows || []).forEach((p: any) => {
        pnlByTrip.set(p.trip_id, {
          revenue: Number(p.revenue_amount || 0),
          carrier: Number(p.carrier_cost_amount || 0),
          expenses: Number(p.expenses_amount || 0),
        });
      });
    }

    const rows: TripRow[] = (data || []).map((t: any) => {
      const pnl = pnlByTrip.get(t.id);
      // Sort stops
      const sortedStops = [...(t.trip_stops || [])].sort((a: any, b: any) => (a.sequence_order || 0) - (b.sequence_order || 0));
      return {
        ...t,
        trip_stops: sortedStops,
        expenses_total: pnl?.expenses ?? 0,
        // Stash the EUR-normalised totals so the row component doesn't have
        // to reconstruct them. Currency is forced to EUR because trip_pnl
        // already converted everything.
        _pnl_revenue_eur: pnl?.revenue ?? 0,
        _pnl_carrier_cost_eur: pnl?.carrier ?? 0,
        _pnl_expenses_eur: pnl?.expenses ?? 0,
      };
    });

    // Apply search filter on the client (covers trip ref, vehicle plate, driver name, carrier name, order refs)
    const filtered = search.trim()
      ? rows.filter((r) => {
          const q = search.toLowerCase();
          if (r.reference_number?.toLowerCase().includes(q)) return true;
          if (r.vehicle?.plate_number?.toLowerCase().includes(q)) return true;
          if (r.driver?.name?.toLowerCase().includes(q)) return true;
          if (r.carrier?.name?.toLowerCase().includes(q)) return true;
          if (r.trip_orders?.some((to) => to.order?.reference_number?.toLowerCase().includes(q))) return true;
          return false;
        })
      : rows;

    setTrips(filtered);
    setLoading(false);
  }, [adminSession?.id, statusFilter, assignmentFilter, dateRange, search, toast]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // ─── KPIs ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    let total = trips.length;
    let active = 0;
    let totalKm = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let ordersCount = 0;
    trips.forEach((t) => {
      if (["planned", "dispatched", "in_transit", "in_progress"].includes(t.status)) active++;
      totalKm += Number(t.distance_km || 0);
      // Use the same EUR-normalised totals as tripFinancials so the KPI
      // strip and the per-row Cost/Margin columns can never disagree.
      const fin = tripFinancials(t);
      totalRevenue += fin.revenue;
      totalCost += fin.cost;
      ordersCount += (t.trip_orders || []).length;
    });
    const margin = totalRevenue - totalCost;
    const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
    return { total, active, totalKm, totalRevenue, totalCost, margin, marginPct, ordersCount };
  }, [trips]);

  // ─── Pagination ────────────────────────────────────────────
  // Reset to page 1 whenever the underlying list changes (filter/refresh).
  useEffect(() => {
    setPage(1);
  }, [trips.length, search, statusFilter, assignmentFilter, dateRange]);
  const pageCount = Math.max(1, Math.ceil(trips.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, trips.length);
  const visibleTrips = useMemo(
    () => trips.slice(pageStart, pageEnd),
    [trips, pageStart, pageEnd],
  );

  // ─── Selection / merge eligibility ─────────────────────────
  const selectedTrips = useMemo(    () => trips.filter((t) => selectedIds.has(t.id)),
    [trips, selectedIds],
  );
  const mergeEligibility = useMemo(() => {
    if (selectedTrips.length < 2) {
      return { ok: false, reason: "Select 2 or more trips to merge" };
    }
    // Same execution bucket — buckets `internal` (Order workflow) and
    // `own_fleet` (Dispatch Board) together as "own", and `forwarding` /
    // `subcontracted` together as "external". Without bucketing, two trips
    // that both run on the same own vehicle but were created from different
    // entry points would falsely fail the eligibility check.
    const buckets = new Set(selectedTrips.map((t) => assignmentBucket(t.assignment_type)));
    if (buckets.size > 1) {
      return { ok: false, reason: "Mix of own-fleet and subcontracted trips can't be merged" };
    }
    // Same resource: same vehicle for "own", same carrier for "external"
    const bucket = [...buckets][0];
    if (bucket === "external") {
      const carriers = new Set(selectedTrips.map((t) => t.carrier?.id));
      if (carriers.size > 1) return { ok: false, reason: "Selected trips use different carriers" };
    } else {
      const vehicles = new Set(selectedTrips.map((t) => t.vehicle?.id));
      if (vehicles.size > 1) return { ok: false, reason: "Selected trips use different vehicles" };
      const drivers = new Set(selectedTrips.map((t) => t.driver?.id ?? "_none"));
      if (drivers.size > 1) {
        return { ok: true, reason: "Drivers differ — primary trip's driver will be used" };
      }
    }
    // Block merging completed/cancelled (no point)
    if (selectedTrips.some((t) => ["completed", "closed", "cancelled"].includes(t.status))) {
      return { ok: false, reason: "Completed or cancelled trips can't be merged" };
    }
    return { ok: true, reason: "" };
  }, [selectedTrips]);

  // ─── Merge action ─────────────────────────────────────────
  // Delegates to /api/admin/tms/trips/merge which performs an atomic, RLS-safe
  // re-parent of every dependent row (trip_orders, trip_stops, cost_entries,
  // trip_events, documents, orders.execution_trip_id) before deleting the
  // source trips. The previous client-side implementation hit cookie/anon
  // mismatches in nested PostgREST writes which left source trips orphaned.
  const mergeSelected = useCallback(async () => {
    if (!mergeEligibility.ok || selectedTrips.length < 2) return;
    const refs = selectedTrips.map((t) => t.reference_number || t.id.slice(0, 8)).join(", ");
    if (!confirm(`Merge ${selectedTrips.length} round trips (${refs}) into a single round trip?\n\nAll orders, stops, expenses and events will move to the earliest round trip. The others will be deleted.`)) return;

    setMerging(true);
    try {
      const sorted = [...selectedTrips].sort((a, b) => {
        const aT = a.planned_start ? new Date(a.planned_start).getTime() : Number.MAX_SAFE_INTEGER;
        const bT = b.planned_start ? new Date(b.planned_start).getTime() : Number.MAX_SAFE_INTEGER;
        return aT - bT;
      });
      const primary = sorted[0];
      const others = sorted.slice(1);
      console.log("[v0] mergeSelected: POST /api/admin/tms/trips/merge", {
        primaryId: primary.id,
        sourceIds: others.map((t) => t.id),
      });

      const res = await fetch("/api/admin/tms/trips/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId: primary.id,
          sourceIds: others.map((t) => t.id),
        }),
      });
      const json = await res.json().catch(() => ({}));
      console.log("[v0] mergeSelected: response", res.status, json);
      if (!res.ok) throw new Error(json.error || `Merge failed (${res.status})`);

      toast({
        title: `Merged ${sorted.length} round trips`,
        description: `Round trip preserved as ${primary.reference_number || primary.id.slice(0, 8)}.`,
      });
      clearSelection();
      await fetchTrips();
    } catch (err: any) {
      console.log("[v0] mergeSelected: failed", err);
      toast({ title: "Merge failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setMerging(false);
    }
  }, [selectedTrips, mergeEligibility, fetchTrips, clearSelection, toast]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border/50">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <RouteIcon className="h-5 w-5 text-primary" />
            Round Trips
          </h1>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
            Execution layer - every dispatched journey, own fleet and subcontracted
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/tms/planning">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs hidden md:inline-flex">
              <Layers className="h-3.5 w-3.5" />
              Dispatch Board
            </Button>
          </Link>
          <Link href="/admin/tms/carriers/consolidation">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Carrier Consolidation</span>
              <span className="sm:hidden">Carriers</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-2 md:py-3 border-b border-border/50 bg-muted/20 overflow-x-auto scrollbar-hide">
        <KpiPill icon={<RouteIcon className="h-4 w-4 text-primary" />} value={String(stats.total)} label="Round Trips" tint="primary" />
        <Divider />
        <KpiPill icon={<Activity className="h-4 w-4 text-blue-400" />} value={String(stats.active)} label="Active" tint="blue" />
        <Divider />
        <KpiPill icon={<Package className="h-4 w-4 text-zinc-400" />} value={String(stats.ordersCount)} label="Orders" tint="zinc" />
        <Divider hideBelow="sm" />
        <KpiPill
          icon={<MapPin className="h-4 w-4 text-cyan-400" />}
          value={`${Math.round(stats.totalKm).toLocaleString()} km`}
          label="Distance"
          tint="cyan"
          hideBelow="sm"
        />
        <Divider hideBelow="md" />
        <KpiPill
          icon={<DollarSign className="h-4 w-4 text-emerald-400" />}
          value={fmtCurrency(stats.totalRevenue, "EUR")}
          label="Revenue"
          tint="emerald"
          hideBelow="md"
        />
        <Divider hideBelow="lg" />
        <KpiPill
          icon={<Wallet className="h-4 w-4 text-orange-400" />}
          value={fmtCurrency(stats.totalCost, "EUR")}
          label="Cost"
          tint="orange"
          hideBelow="lg"
        />
        <Divider hideBelow="lg" />
        <KpiPill
          icon={
            stats.margin >= 0
              ? <TrendingUp className="h-4 w-4 text-emerald-400" />
              : <TrendingDown className="h-4 w-4 text-red-400" />
          }
          value={`${fmtCurrency(stats.margin, "EUR")} · ${stats.marginPct.toFixed(1)}%`}
          label="Margin"
          tint={stats.margin >= 0 ? "emerald" : "red"}
          hideBelow="lg"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-4 md:px-6 py-2.5 border-b border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by trip ref, plate, driver, carrier or order…"
            className="pl-9 h-10 md:h-8 text-sm md:text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-[130px] h-10 md:h-8 text-sm md:text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
            <SelectTrigger className="flex-1 sm:w-[140px] h-10 md:h-8 text-sm md:text-xs">
              <SelectValue placeholder="Assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Own + Subcontract</SelectItem>
              <SelectItem value="own_fleet">Own fleet</SelectItem>
              <SelectItem value="forwarding">Subcontracted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="flex-1 sm:w-[120px] h-10 md:h-8 text-sm md:text-xs">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selection toolbar (sticky just above table, only when something is selected) */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-2 border-b border-border/50 bg-primary/5">
          <div className="flex items-center gap-2 text-xs">
            <CheckSquare className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{selectedIds.size} selected</span>
          </div>
          {!mergeEligibility.ok && selectedTrips.length >= 2 && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {mergeEligibility.reason}
            </span>
          )}
          {mergeEligibility.ok && mergeEligibility.reason && (
            <span className="text-[11px] text-muted-foreground">{mergeEligibility.reason}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1.5"
              disabled={!mergeEligibility.ok || merging}
              onClick={mergeSelected}
            >
              {merging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
              Merge into round trip
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={clearSelection}>
              <X className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Trips Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading trips…</p>
          </div>
        ) : trips.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/30">
              {visibleTrips.map((t) => (
                <TripCard
                  key={t.id}
                  trip={t}
                  selected={selectedIds.has(t.id)}
                  onToggle={() => toggleSelect(t.id)}
                />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-medium w-8">
                      <button
                        type="button"
                        onClick={() => {
                          // Select-all operates on the current page only so
                          // bulk actions stay predictable when the list is
                          // paginated.
                          const visibleIds = visibleTrips.map((t) => t.id);
                          const allVisibleSelected = visibleIds.every((id) => selectedIds.has(id));
                          if (allVisibleSelected) {
                            const next = new Set(selectedIds);
                            visibleIds.forEach((id) => next.delete(id));
                            setSelectedIds(next);
                          } else {
                            const next = new Set(selectedIds);
                            visibleIds.forEach((id) => next.add(id));
                            setSelectedIds(next);
                          }
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title={
                          visibleTrips.every((t) => selectedIds.has(t.id))
                            ? "Clear page selection"
                            : "Select all on page"
                        }
                      >
                        {visibleTrips.length > 0 && visibleTrips.every((t) => selectedIds.has(t.id)) ? (
                          <CheckSquare className="h-3.5 w-3.5" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-2 font-medium">Round Trip</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Resource</th>
                    <th className="px-2 py-2 font-medium">Route</th>
                    <th className="px-2 py-2 font-medium">Period</th>
                    <th className="px-2 py-2 font-medium text-right">Distance</th>
                    <th className="px-2 py-2 font-medium text-right">Orders</th>
                    <th className="px-2 py-2 font-medium text-right">Revenue</th>
                    <th className="px-2 py-2 font-medium text-right">Cost</th>
                    <th className="px-2 py-2 font-medium text-right">Margin</th>
                    <th className="px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {visibleTrips.map((t) => (
                    <TripDesktopRow
                      key={t.id}
                      trip={t}
                      selected={selectedIds.has(t.id)}
                      onToggle={() => toggleSelect(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer (shared across mobile + desktop). Hidden
                when everything fits on one page so it stays out of the way
                for tiny lists. */}
            {trips.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 md:px-6 py-3 border-t border-border/30 bg-background/40 text-xs">
                <div className="text-muted-foreground">
                  Showing <span className="text-foreground font-medium">{pageStart + 1}</span>
                  {"–"}
                  <span className="text-foreground font-medium">{pageEnd}</span> of{" "}
                  <span className="text-foreground font-medium">{trips.length}</span> round trips
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-muted-foreground">
                    Rows per page
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="bg-background border border-border/50 rounded px-1.5 py-1 text-xs text-foreground"
                    >
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={safePage <= 1}
                      onClick={() => setPage(1)}
                    >
                      ‹‹
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ‹
                    </Button>
                    <span className="px-2 text-muted-foreground">
                      Page <span className="text-foreground font-medium">{safePage}</span> /{" "}
                      {pageCount}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      ›
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage(pageCount)}
                    >
                      ››
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── KPI helpers ───────────────────────────────────────────
function KpiPill({
  icon, value, label, tint = "primary", hideBelow,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tint?: "primary" | "blue" | "emerald" | "amber" | "cyan" | "zinc" | "red" | "orange";
  hideBelow?: "sm" | "md" | "lg";
}) {
  const tintBg: Record<string, string> = {
    primary: "bg-primary/10",
    blue: "bg-blue-500/10",
    emerald: "bg-emerald-500/10",
    amber: "bg-amber-500/10",
    cyan: "bg-cyan-500/10",
    zinc: "bg-zinc-500/10",
    red: "bg-red-500/10",
    orange: "bg-orange-500/10",
  };
  const hideClass = hideBelow === "lg" ? "hidden lg:flex" : hideBelow === "md" ? "hidden md:flex" : hideBelow === "sm" ? "hidden sm:flex" : "flex";
  return (
    <div className={`items-center gap-2 shrink-0 ${hideClass}`}>
      <div className={`h-8 w-8 rounded-md ${tintBg[tint]} flex items-center justify-center`}>{icon}</div>
      <div>
        <p className="text-base md:text-lg font-semibold leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Divider({ hideBelow }: { hideBelow?: "sm" | "md" | "lg" }) {
  const cls = hideBelow === "lg" ? "hidden lg:block" : hideBelow === "md" ? "hidden md:block" : hideBelow === "sm" ? "hidden sm:block" : "block";
  return <div className={`h-8 w-px bg-border/50 shrink-0 ${cls}`} />;
}

// ─── Empty state ────────────────────────���──────────────────
function EmptyState() {
  return (
    <div className="text-center py-16 px-6">
      <RouteIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-foreground font-medium">No round trips match your filters</p>
      <p className="text-xs text-muted-foreground mt-1">
        Round trips are created automatically when an order is dispatched.
        Open the Dispatch Board to assign vehicles and drivers.
      </p>
      <Link href="/admin/tms/planning">
        <Button size="sm" variant="outline" className="mt-4 gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Open Dispatch Board
        </Button>
      </Link>
    </div>
  );
}

// ─── Trip row utilities ────────────────────────────────────
// Get the slice of stops that this Round Trip's primary resource (vehicle or carrier)
// actually executes. A "Round Trip" represents the consecutive legs done by the same
// resource. If the trip has no legs, fall back to all stops.
function getRouteStopsForTrip(trip: TripRow): TripStop[] {
  const allStops = (trip.trip_stops || []).slice().sort(
    (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0),
  );
  const legs = trip.trip_legs || [];
  if (legs.length === 0 || allStops.length === 0) return allStops;

  // Identify this trip's primary resource:
  //   - Own fleet => trip.vehicle.id
  //   - Subcontract => trip.carrier.id
  const primaryVehicleId = trip.vehicle?.id || null;
  const primaryCarrierId = trip.carrier?.id || null;

  // Pick legs that belong to the primary resource
  const ownedLegs = legs.filter((l) => {
    if (primaryVehicleId && l.vehicle_id === primaryVehicleId) return true;
    if (primaryCarrierId && l.carrier_id === primaryCarrierId) return true;
    return false;
  });
  if (ownedLegs.length === 0) return allStops;

  // Use the min from_stop_index and max to_stop_index of the owned legs
  let fromIdx = Number.POSITIVE_INFINITY;
  let toIdx = Number.NEGATIVE_INFINITY;
  ownedLegs.forEach((l) => {
    if (typeof l.from_stop_index === "number") fromIdx = Math.min(fromIdx, l.from_stop_index);
    if (typeof l.to_stop_index === "number") toIdx = Math.max(toIdx, l.to_stop_index);
  });
  if (!isFinite(fromIdx) || !isFinite(toIdx)) return allStops;
  fromIdx = Math.max(0, fromIdx);
  toIdx = Math.min(allStops.length - 1, toIdx);
  if (toIdx < fromIdx) return allStops;
  return allStops.slice(fromIdx, toIdx + 1);
}
function pickFirstStop(stops: TripStop[]) {
  return stops?.[0] || null;
}
function pickLastStop(stops: TripStop[]) {
  return stops?.length ? stops[stops.length - 1] : null;
}

function tripFinancials(trip: TripRow) {
  // Always prefer the EUR-normalised totals from trip_pnl. They include
  // supplier-imported cost_entries (fuel, tolls) and apply FX at occurred_at,
  // matching what the Trip P&L tab and Internal Fleet P&L report show.
  // Fall back to the raw trip/leg values only when trip_pnl returned nothing
  // (e.g. legacy trips with no orders attached).
  const revenue = trip._pnl_revenue_eur != null
    ? trip._pnl_revenue_eur
    : (trip.trip_orders || []).reduce(
        (sum, to) => sum + Number(to.order?.customer_price || 0),
        0,
      );
  const legCosts = (trip.trip_legs || []).reduce((sum, l) => sum + Number(l.carrier_cost || 0), 0);
  const carrierCost = trip._pnl_carrier_cost_eur != null
    ? trip._pnl_carrier_cost_eur
    : (legCosts || Number(trip.carrier_cost || 0));
  const expenses = trip._pnl_expenses_eur != null
    ? trip._pnl_expenses_eur
    : Number(trip.expenses_total || 0);
  const cost = carrierCost + expenses;
  const margin = revenue - cost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  // trip_pnl normalises everything to EUR, so when we sourced totals from it
  // we display in EUR. Otherwise fall back to the trip's customer/carrier ccy.
  const currency = trip._pnl_revenue_eur != null
    ? "EUR"
    : (trip.trip_orders?.[0]?.order?.customer_currency || trip.carrier_currency || "EUR");
  return { revenue, carrierCost, expenses, cost, margin, marginPct, currency };
}

// ─── Mobile card ───────────────────────────────────────────
function TripCard({
  trip,
  selected,
  onToggle,
}: {
  trip: TripRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const fin = tripFinancials(trip);
  const routeStops = getRouteStopsForTrip(trip);
  const first = pickFirstStop(routeStops);
  const last = pickLastStop(routeStops);
  const statusCfg = STATUS_CONFIG[trip.status] || STATUS_CONFIG.draft;
  const isSubcontract = trip.assignment_type === "forwarding" || !!trip.carrier_id;

  return (
    <div className={`relative px-4 py-3 transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/30"}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
      >
        {selected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
      </button>
    <Link href={`/admin/tms/trips/${trip.id}/edit`} className="block">
      <div className="flex items-center justify-between gap-2 mb-2 pr-6">
        <div className="flex items-center gap-2 min-w-0">
          <RouteIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-sm font-semibold truncate">{trip.reference_number || trip.id.slice(0, 8)}</p>
        </div>
        <Badge variant="outline" className={`${statusCfg.color} border text-[10px] h-5 px-1.5 shrink-0`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot} mr-1`} />
          {statusCfg.label}
        </Badge>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 min-w-0">
        <CountryFlag country={first?.country} />
        <span className="truncate">{first?.city || "—"}</span>
        <ArrowRight className="h-3 w-3 shrink-0" />
        <CountryFlag country={last?.country} />
        <span className="truncate">{last?.city || "—"}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
        {isSubcontract ? (
          <>
            <Building2 className="h-3 w-3" />
            <span className="truncate">{trip.carrier?.name || "Subcontract"}</span>
          </>
        ) : (
          <>
            <Truck className="h-3 w-3" />
            <span className="truncate">{trip.vehicle?.plate_number || "Unassigned"}</span>
            {trip.driver?.name && (
              <>
                <User className="h-3 w-3 ml-1" />
                <span className="truncate">{trip.driver.name}</span>
              </>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {trip.distance_km ? `${Math.round(trip.distance_km)} km` : "—"}
          </span>
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {trip.trip_orders?.length || 0}
          </span>
        </div>
        <span className={`font-semibold tabular-nums ${fin.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmtCurrency(fin.margin, fin.currency)}
        </span>
      </div>
    </Link>
    </div>
  );
}

// ─── Desktop row ───────────────────────────────────────────
function TripDesktopRow({
  trip,
  selected,
  onToggle,
}: {
  trip: TripRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const fin = tripFinancials(trip);
  const routeStops = getRouteStopsForTrip(trip);
  const first = pickFirstStop(routeStops);
  const last = pickLastStop(routeStops);
  const statusCfg = STATUS_CONFIG[trip.status] || STATUS_CONFIG.draft;
  const isSubcontract = trip.assignment_type === "forwarding" || !!trip.carrier_id;
  const ordersCount = trip.trip_orders?.length || 0;
  const legsCount = trip.trip_legs?.length || 0;
  const stopsCount = routeStops.length;
  const ordersList = (trip.trip_orders || []).map((to) => to.order?.reference_number).filter(Boolean).slice(0, 3);

  return (
    <tr className={`hover:bg-muted/30 transition-colors group ${selected ? "bg-primary/10 hover:bg-primary/15" : ""}`}>
      <td className="px-2 py-3 align-top w-8">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="text-muted-foreground hover:text-foreground"
          title={selected ? "Unselect" : "Select for merge"}
        >
          {selected ? (
            <CheckSquare className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
      </td>
      <td className="px-4 py-3 align-top">
        <Link href={`/admin/tms/trips/${trip.id}/edit`} className="block">
          <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
            {trip.reference_number || trip.id.slice(0, 8)}
          </p>
          {ordersList.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[160px]">
              {ordersList.join(", ")}{ordersCount > 3 ? ` +${ordersCount - 3}` : ""}
            </p>
          )}
        </Link>
      </td>
      <td className="px-2 py-3 align-top">
        <Badge variant="outline" className={`${statusCfg.color} border text-[10px] h-5 px-1.5`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot} mr-1`} />
          {statusCfg.label}
        </Badge>
        {isSubcontract && (
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Building2 className="h-2.5 w-2.5" /> Subcontract
          </p>
        )}
      </td>
      <td className="px-2 py-3 align-top">
        {isSubcontract ? (
          <div className="flex items-center gap-1.5 text-xs text-foreground">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="truncate max-w-[140px]">{trip.carrier?.name || "Carrier?"}</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <Truck className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[120px]">{trip.vehicle?.plate_number || "Unassigned"}</span>
              {trip.trailer?.plate_number && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Container className="h-2.5 w-2.5" />{trip.trailer.plate_number}
                </span>
              )}
            </div>
            {trip.driver?.name && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <User className="h-2.5 w-2.5" />
                <span className="truncate max-w-[140px]">{trip.driver.name}</span>
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-3 align-top">
        <div className="flex items-center gap-1.5 text-xs">
          <CountryFlag country={first?.country} />
          <span className="truncate max-w-[80px]">{first?.city || "—"}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <CountryFlag country={last?.country} />
          <span className="truncate max-w-[80px]">{last?.city || "—"}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {stopsCount} stops · {legsCount} leg{legsCount === 1 ? "" : "s"}
        </p>
      </td>
      <td className="px-2 py-3 align-top">
        <p className="text-xs text-foreground">{fmtDate(trip.planned_start)}</p>
        <p className="text-[10px] text-muted-foreground">→ {fmtDate(trip.planned_end)}</p>
        {trip.actual_start && (
          <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />Started {fmtDateTime(trip.actual_start)}
          </p>
        )}
      </td>
      <td className="px-2 py-3 align-top text-right">
        <p className="text-xs font-medium tabular-nums">
          {trip.distance_km ? `${Math.round(trip.distance_km)} km` : "—"}
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">{durationLabel(trip.duration_minutes)}</p>
      </td>
      <td className="px-2 py-3 align-top text-right">
        <p className="text-xs font-medium tabular-nums">{ordersCount}</p>
      </td>
      <td className="px-2 py-3 align-top text-right">
        <p className="text-xs font-medium text-emerald-400 tabular-nums">{fmtCurrency(fin.revenue, fin.currency)}</p>
      </td>
      <td className="px-2 py-3 align-top text-right">
        <p className="text-xs font-medium text-orange-400 tabular-nums">{fmtCurrency(fin.cost, fin.currency)}</p>
        {fin.expenses > 0 && (
          <p className="text-[10px] text-muted-foreground tabular-nums">+ {fmtCurrency(fin.expenses, fin.currency)} exp.</p>
        )}
      </td>
      <td className="px-2 py-3 align-top text-right">
        <p className={`text-xs font-semibold tabular-nums ${fin.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmtCurrency(fin.margin, fin.currency)}
        </p>
        <p className={`text-[10px] tabular-nums ${fin.margin >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
          {fin.marginPct.toFixed(1)}%
        </p>
      </td>
      <td className="px-2 py-3 align-top text-right">
        <Link href={`/admin/tms/trips/${trip.id}/edit`}>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </td>
    </tr>
  );
}
