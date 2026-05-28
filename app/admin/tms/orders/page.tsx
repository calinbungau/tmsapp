"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminSession } from "@/hooks/use-admin-session";
import OrderDetailPanel from "@/components/tms/order-detail-panel";
import {
  Plus, Search, Package, Truck, ChevronLeft, ChevronRight,
  User, Sparkles, TrendingUp, Activity, DollarSign, BarChart3,
  Trash2, MoreHorizontal, Container, Building2, Route, Layers,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAdminUsers } from "@/hooks/use-admin-users";
import {
  OrdersAdvancedFilters,
  OrdersFilterChips,
  EMPTY_FILTERS,
  SourceBadge,
  type OrdersFilterValue,
} from "@/components/tms/orders-advanced-filters";
import { OrderStatusBadge } from "@/components/tms/order-status-badge";
import { StatusGuide } from "@/components/tms/status-guide";
import {
  PARENT_STATUSES,
  FORWARDER_STATUSES,
  isActiveStatus,
} from "@/lib/tms/status/registry";

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
  magyarorszag: "HU", "magyarorsz\u00E1g": "HU", ungarn: "HU",
  deutschland: "DE", allemagne: "DE", germania: "DE", "rom\u00E2nia": "RO",
  polska: "PL", "\u010Desko": "CZ", slovensko: "SK", "\u00F6sterreich": "AT",
  italia: "IT", "espa\u00F1a": "ES", nederland: "NL", "the netherlands": "NL",
  "belgi\u00EB": "BE", belgique: "BE", hrvatska: "HR", slovenija: "SI",
  srbija: "RS", schweiz: "CH", suisse: "CH", svizzera: "CH",
  sverige: "SE", norge: "NO", danmark: "DK", suomi: "FI",
  lietuva: "LT", latvija: "LV", eesti: "EE",
};
function getCountryCode(country: string | null | undefined): string {
  if (!country) return "";
  const t = country.trim();
  const u = t.toUpperCase();
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) return u;
  if (u.length === 3) {
    const two = u.substring(0, 2);
    if (["DE","NL","FR","IT","ES","AT","PL","CZ","SK","HU","RO","BG","HR","SI","RS","GR","TR","UA","BE","LU","CH","SE","NO","DK","FI","LT","LV","EE","IE","PT","GB"].includes(two)) return two;
  }
  return COUNTRY_CODES[t.toLowerCase()] || "";
}
function CountryFlag({ country, className = "w-4 h-3" }: { country: string | null | undefined; className?: string }) {
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

interface TripLegInfo {
  id: string;
  leg_number: number;
  assignment_type: "own_fleet" | "forwarding" | "undecided" | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  trailer_id: string | null;
  trailer_plate: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  // Per-leg execution status — used to derive the parent's "Execution"
  // sub-pill (lowest active status across legs + forwarder children).
  status: string | null;
}

interface OrderTrip {
  id: string;
  reference_number: string;
  assignment_type: string;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate_number: string } | null;
  carrier: { id: string; name: string } | null;
  legs: TripLegInfo[];
}

interface Order {
  id: string;
  reference_number: string;
  customer_reference: string | null;
  order_type: string;
  status: string;
  customer_price: number | null;
  customer_currency: string;
  customer_vat_type: string | null;
  customer_vat_rate: number | null;
  customer_vat_amount: number | null;
  customer_price_with_vat: number | null;
  customer_price_without_vat: number | null;
  carrier_cost: number | null;
  carrier_currency: string;
  carrier_vat_type: string | null;
  carrier_vat_rate: number | null;
  carrier_vat_amount: number | null;
  carrier_cost_with_vat: number | null;
  carrier_cost_without_vat: number | null;
  margin: number | null;
  cargo_description: string | null;
  weight_kg: number | null;
  pallet_count: number | null;
  loading_meters: number | null;
  created_from: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer: { id: string; name: string } | null;
  carrier: { id: string; name: string } | null;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate_number: string } | null;
  trailer: { id: string; plate_number: string } | null;
  stops: { id: string; stop_type: string; city: string | null; country: string | null; planned_date: string | null; sequence_order: number }[];
  trips?: OrderTrip[];
  // Aggregated lowest-active execution sub-status, derived client-side
  // from this order's trip_legs + forwarder children. Used to render the
  // "Execution" sub-line under the main parent status pill.
  executionStatus?: { scope: "internal" | "forwarder"; status: string } | null;
  /**
   * For Mixed orders we surface BOTH the lowest internal-leg status and
   * the lowest forwarder-child status side by side, instead of picking
   * one. This matches the operator's mental model: when they're running
   * one leg with their own fleet AND subcontracting another, the parent
   * "In Execution" pill alone hides which side is blocking. When the
   * order is Mixed, the table renders parent + internal + forwarder.
   */
  executionInternal?: { status: string } | null;
  executionForwarder?: { status: string } | null;
  isMixedExecution?: boolean;
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  // Parent lifecycle (rows 1-16, plus sideways)
  ...Object.values(PARENT_STATUSES).map((s) => ({ value: s.value, label: s.label })),
  // Forwarder lifecycle (subcontract child rows visible on consolidated views)
  ...Object.values(FORWARDER_STATUSES).map((s) => ({ value: s.value, label: `Subcontract: ${s.label}` })),
];

const DEFAULT_PAGE_SIZE = 25;

export default function TMSOrdersPage() {
  const { session: adminSession } = useAdminSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, active: 0, revenue: 0, margin: 0 });
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  // Advanced filter state. Lives in one object so we can pass it straight
  // into <OrdersAdvancedFilters /> and the active-filters chip strip.
  const [filters, setFilters] = useState<OrdersFilterValue>(EMPTY_FILTERS);
  // Picker option lists for customer/carrier. We only show partners the
  // current admin actually has so the dropdowns never overwhelm the user
  // with thousands of irrelevant rows.
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([]);
  const { users: adminUsers, byId: adminUsersById } = useAdminUsers(adminSession?.id);

  const handleDeleteOrder = async () => {
    if (!deleteOrderId || !adminSession?.id) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      
      // Get trips linked to this order
      const { data: tripOrders } = await supabase.from("trip_orders").select("trip_id").eq("order_id", deleteOrderId);
      const tripIds = tripOrders?.map(to => to.trip_id) || [];
      
      // Delete trip-related data
      if (tripIds.length > 0) {
        for (const tripId of tripIds) {
          await supabase.from("trip_stops").delete().eq("trip_id", tripId);
          await supabase.from("trip_legs").delete().eq("trip_id", tripId);
        }
        await supabase.from("trip_orders").delete().eq("order_id", deleteOrderId);
        // Only delete trips if no other orders are linked to them
        for (const tripId of tripIds) {
          const { count } = await supabase.from("trip_orders").select("*", { count: "exact", head: true }).eq("trip_id", tripId);
          if (!count || count === 0) {
            await supabase.from("trips").delete().eq("id", tripId);
          }
        }
      }
      
      // Delete related records first (order_stops, order_documents, etc.)
      await supabase.from("order_stops").delete().eq("order_id", deleteOrderId);
      await supabase.from("order_documents").delete().eq("order_id", deleteOrderId);
      await supabase.from("order_expenses").delete().eq("order_id", deleteOrderId);
      await supabase.from("order_status_history").delete().eq("order_id", deleteOrderId);
      await supabase.from("order_activity_log").delete().eq("order_id", deleteOrderId);
      // Finally delete the order
      const { error } = await supabase.from("orders").delete().eq("id", deleteOrderId).eq("admin_id", adminSession.id);
      if (error) throw error;
      toast({ title: "Order deleted", description: "The order has been permanently deleted." });
      if (selectedOrderId === deleteOrderId) setSelectedOrderId(null);
      fetchOrders();
      fetchStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete order", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteOrderId(null);
    }
  };

  // Sync selected order to URL for deep-linking (?order=<id>)
  const selectOrder = useCallback((id: string | null) => {
    setSelectedOrderId(id);
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("order", id);
    } else {
      url.searchParams.delete("order");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("orders")
      .select(`
        id, reference_number, customer_reference, order_type, status,
        customer_price, customer_currency, customer_vat_type, customer_vat_rate, customer_vat_amount, customer_price_with_vat, customer_price_without_vat,
        carrier_cost, carrier_currency, carrier_vat_type, carrier_vat_rate, carrier_vat_amount, carrier_cost_with_vat, carrier_cost_without_vat, margin,
        cargo_description, weight_kg, pallet_count, loading_meters,
        created_from, created_by, created_at, updated_at,
        customer:business_partners!orders_customer_id_fkey(id, name),
        carrier:business_partners!orders_carrier_id_fkey(id, name),
        driver:drivers!orders_driver_id_fkey(id, name),
        vehicle:vehicles!orders_vehicle_id_fkey(id, plate_number),
        trailer:trailers!orders_trailer_id_fkey(id, plate_number),
        stops:order_stops(id, stop_type, city, country, planned_date, sequence_order)
      `, { count: "exact" })
      .eq("admin_id", adminSession.id)
      .eq("is_draft", false)
      .eq("commercial_role", "customer_order")
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    // ── Advanced filters → server-side WHERE clauses ─────────
    // These are all simple equality / range filters so they push down
    // to Postgres directly and benefit from the existing indexes on
    // customer_id / carrier_id / created_by / created_at / created_from.
    if (filters.customerId !== "all") query = query.eq("customer_id", filters.customerId);
    if (filters.carrierId !== "all") query = query.eq("carrier_id", filters.carrierId);
    if (filters.createdById !== "all") query = query.eq("created_by", filters.createdById);
    if (filters.createdFrom !== "all") query = query.eq("created_from", filters.createdFrom);
    if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
    if (filters.dateTo)   query = query.lte("created_at", `${filters.dateTo}T23:59:59`);

    // ── Text search ──────────────────────────────────────────
    // Searches the obvious text columns AND extends to customer/carrier
    // NAMES. PostgREST cannot embed a foreign-table column directly in an
    // .or() clause, so we resolve matching BP ids in a quick auxiliary
    // query and then OR-in `customer_id.in.(...)` / `carrier_id.in.(...)`.
    // Volume per admin is small (hundreds–low thousands of partners), so
    // this aux query is effectively free.
    if (search) {
      const safe = search.replace(/[%,()]/g, ""); // strip PostgREST OR-clause delimiters
      const ilikeArg = `%${safe}%`;
      let bpIds: string[] = [];
      try {
        const { data: bpHits } = await supabase
          .from("business_partners")
          .select("id")
          .eq("admin_id", adminSession.id)
          .ilike("name", ilikeArg)
          .limit(50); // 50 is plenty — autocomplete intent, not bulk export
        bpIds = (bpHits || []).map(r => r.id);
      } catch { /* search just falls back to text-column matches */ }

      const orParts = [
        `reference_number.ilike.${ilikeArg}`,
        `cargo_description.ilike.${ilikeArg}`,
        `customer_reference.ilike.${ilikeArg}`,
      ];
      if (bpIds.length > 0) {
        const idList = bpIds.join(",");
        orParts.push(`customer_id.in.(${idList})`);
        orParts.push(`carrier_id.in.(${idList})`);
      }
      query = query.or(orParts.join(","));
    }

    const from = (currentPage - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);
    const { data, error, count } = await query;
    if (!error && data) {
      // Fetch trips for each order
      const orderIds = data.map((o: any) => o.id);
      const { data: tripOrdersData } = await supabase
        .from("trip_orders")
        .select(`
          order_id,
          trip:trips(
            id, reference_number, assignment_type,
            driver:drivers(id, name),
            vehicle:vehicles(id, plate_number),
            carrier:business_partners!trips_carrier_id_fkey(id, name),
            trip_legs(
              id, leg_number, assignment_type, driver_id, vehicle_id, carrier_id, status
            )
          )
        `)
        .in("order_id", orderIds);
      
      // Get unique trip IDs to fetch leg details
      const allTripIds = (tripOrdersData || []).map((to: any) => {
        const trip = Array.isArray(to.trip) ? to.trip[0] : to.trip;
        return trip?.id;
      }).filter(Boolean);

      // Fetch driver/vehicle/trailer/carrier names for legs
      let legDrivers = new Map<string, string>();
      let legVehicles = new Map<string, string>();
      let legTrailers = new Map<string, string>();
      let legCarriers = new Map<string, string>();
      let legTrailerIds = new Map<string, string>();

      if (allTripIds.length > 0) {
        const { data: legsWithDetails } = await supabase
          .from("trip_legs")
          .select(`
            id, trip_id, leg_number, assignment_type, driver_id, vehicle_id, trailer_id, carrier_id, status,
            driver:drivers(id, name),
            vehicle:vehicles(id, plate_number),
            trailer:trailers(id, plate_number),
            carrier:business_partners!trip_legs_carrier_id_fkey(id, name)
          `)
          .in("trip_id", allTripIds)
          .order("leg_number");

        (legsWithDetails || []).forEach((leg: any) => {
          const driver = Array.isArray(leg.driver) ? leg.driver[0] : leg.driver;
          const vehicle = Array.isArray(leg.vehicle) ? leg.vehicle[0] : leg.vehicle;
          const trailer = Array.isArray(leg.trailer) ? leg.trailer[0] : leg.trailer;
          const carrier = Array.isArray(leg.carrier) ? leg.carrier[0] : leg.carrier;
          if (driver?.name) legDrivers.set(leg.id, driver.name);
          if (vehicle?.plate_number) legVehicles.set(leg.id, vehicle.plate_number);
          if (trailer?.plate_number) legTrailers.set(leg.id, trailer.plate_number);
          if (leg.trailer_id) legTrailerIds.set(leg.id, leg.trailer_id);
          if (carrier?.name) legCarriers.set(leg.id, carrier.name);
        });
      }
      
      // Group trips by order_id
      const tripsByOrder: Record<string, OrderTrip[]> = {};
      (tripOrdersData || []).forEach((to: any) => {
        if (!tripsByOrder[to.order_id]) tripsByOrder[to.order_id] = [];
        if (to.trip) {
          const trip = Array.isArray(to.trip) ? to.trip[0] : to.trip;
          const legs = (trip.trip_legs || []).map((leg: any) => ({
            id: leg.id,
            leg_number: leg.leg_number,
            assignment_type: leg.assignment_type,
            driver_id: leg.driver_id,
            driver_name: legDrivers.get(leg.id) || null,
            vehicle_id: leg.vehicle_id,
            vehicle_plate: legVehicles.get(leg.id) || null,
            trailer_id: legTrailerIds.get(leg.id) || null,
            trailer_plate: legTrailers.get(leg.id) || null,
            carrier_id: leg.carrier_id,
            carrier_name: legCarriers.get(leg.id) || null,
            status: leg.status ?? null,
          })).sort((a: TripLegInfo, b: TripLegInfo) => a.leg_number - b.leg_number);
          
          tripsByOrder[to.order_id].push({
            id: trip.id,
            reference_number: trip.reference_number,
            assignment_type: trip.assignment_type,
            driver: Array.isArray(trip.driver) ? trip.driver[0] : trip.driver,
            vehicle: Array.isArray(trip.vehicle) ? trip.vehicle[0] : trip.vehicle,
            carrier: Array.isArray(trip.carrier) ? trip.carrier[0] : trip.carrier,
            legs,
          });
        }
      });

      const sorted = data.map((o: any) => ({
        ...o,
        stops: (o.stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
        trips: tripsByOrder[o.id] || [],
      }));

      // ──────────────────────────────────────────────────────────────
      // Resolve "Execution" sub-status per parent.
      //
      // Per the v3 status spec, the parent pill (e.g. "In Execution") only
      // tells half the story. Ops also want to see *which* execution stage
      // we're at — Unassigned / Assigned / Planned / Dispatched / In Progress
      // / Delivered / Documents Pending — so they can scan the list at a
      // glance.
      //
      // We derive it as the *lowest active* status across:
      //   - this parent's own trip_legs (internal scope), and
      //   - this parent's forwarder *child* orders' fwd_* status.
      //
      // Only parents in execution-ish states get a sub-pill — Draft and
      // Customer Confirmation Required have no execution yet, and the
      // post-execution states (Documents Received, Ready for Invoicing,
      // Documents and Invoice Sent, Completed, Cancelled, On Hold) already
      // tell the full story on their own.
      // ──────────────────────────────────────────────────────────────
      const parentIds = sorted.filter(o => !!o.id).map(o => o.id);
      const fwdChildByParent = new Map<string, string[]>();
      if (parentIds.length > 0) {
        const { data: fwdChildren } = await supabase
          .from("orders")
          .select("parent_order_id, status")
          .in("parent_order_id", parentIds);
        (fwdChildren || []).forEach((c: any) => {
          if (!c.parent_order_id || !c.status) return;
          const arr = fwdChildByParent.get(c.parent_order_id) || [];
          arr.push(c.status);
          fwdChildByParent.set(c.parent_order_id, arr);
        });
      }

      // Internal scope: rank legs by execution depth (lower = earlier).
      const INTERNAL_RANK: Record<string, number> = {
        unassigned: 1, assigned: 2, planned: 3,
        dispatched_to_driver: 4, accepted_by_driver: 5,
        waiting_to_start: 6, in_progress: 7,
        delivered: 8, documents_pending: 9,
        documents_received: 10, completed: 11,
        cancelled: 99, on_hold: 99,
      };
      const FWD_RANK: Record<string, number> = {
        fwd_carrier_unassigned: 1, fwd_assigned_to_carrier: 2,
        fwd_carrier_confirmation_required: 3, fwd_carrier_confirmed: 4,
        fwd_waiting_to_start: 5, fwd_in_progress: 6,
        fwd_delivered: 7, fwd_documents_pending: 8,
        fwd_documents_received: 9, fwd_carrier_invoice_pending: 10,
        fwd_carrier_invoice_unpaid: 11, fwd_completed: 12,
        fwd_cancelled: 99, fwd_on_hold: 99,
      };

      const sortedWithExec: Order[] = sorted.map((o: any) => {
        // Skip parents that aren't actually in the execution band.
        const showExec = o.status === "in_execution" || o.status === "documents_received";
        if (!showExec) return { ...o, executionStatus: null, executionInternal: null, executionForwarder: null, isMixedExecution: false };

        // Lowest internal leg status across all this parent's trips.
        // We deliberately EXCLUDE subcontract legs here — they are
        // already represented by the FWD child status further down,
        // and including them double-counts. Without this filter the
        // row showed "Assigned"/"Delivered" (the leg's local status)
        // even when the subcontract pill on the order detail panel
        // said "Carrier Confirm. Req."/"Docs Received", because the
        // leg's internal rank ("assigned" = early) outranked the
        // forwarder rank in the comparison below.
        const legStatuses: string[] = (o.trips || [])
          .flatMap((t: any) => (t.legs || [])
            .filter((l: any) => l.assignment_type === "own_fleet")
            .map((l: any) => l.status)
            .filter(Boolean) as string[]);
        let bestInternal: { status: string; rank: number } | null = null;
        legStatuses.forEach(s => {
          const r = INTERNAL_RANK[s] ?? 50;
          if (!bestInternal || r < bestInternal.rank) bestInternal = { status: s, rank: r };
        });

        // Lowest forwarder child status across all this parent's children.
        const childStatuses = fwdChildByParent.get(o.id) || [];
        let bestFwd: { status: string; rank: number } | null = null;
        childStatuses.forEach(s => {
          const r = FWD_RANK[s] ?? 50;
          if (!bestFwd || r < bestFwd.rank) bestFwd = { status: s, rank: r };
        });

        // Mixed when the parent has BOTH own-fleet legs and subcontract
        // children. We need both signals to render the third pill.
        const hasOwnFleetLegs = (o.trips || []).some((t: any) =>
          (t.legs || []).some((l: any) => l.assignment_type === "own_fleet")
        );
        const hasFwdChildren = childStatuses.length > 0;
        const isMixed = hasOwnFleetLegs && hasFwdChildren;

        // Single-pill compatibility for non-Mixed rows. Pick whichever is
        // "earlier" — but prefer forwarder when both have the same rank,
        // since the carrier is on the critical path.
        let exec: { scope: "internal" | "forwarder"; status: string } | null = null;
        if (bestInternal && bestFwd) {
          exec = bestFwd.rank <= bestInternal.rank
            ? { scope: "forwarder", status: bestFwd.status }
            : { scope: "internal", status: bestInternal.status };
        } else if (bestInternal) {
          exec = { scope: "internal", status: bestInternal.status };
        } else if (bestFwd) {
          exec = { scope: "forwarder", status: bestFwd.status };
        }
        return {
          ...o,
          executionStatus: exec,
          executionInternal: bestInternal ? { status: bestInternal.status } : null,
          executionForwarder: bestFwd ? { status: bestFwd.status } : null,
          isMixedExecution: isMixed,
        };
      });

      setOrders(sortedWithExec);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [adminSession?.id, statusFilter, search, currentPage, pageSize, filters]);

  const fetchStats = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const { data } = await supabase.from("orders").select("status, customer_price, margin").eq("admin_id", adminSession.id).eq("is_draft", false).eq("commercial_role", "customer_order");
    if (data) {
      setStats({
        total: data.length,
        active: data.filter(o => isActiveStatus(o.status)).length,
        revenue: data.reduce((sum, o) => sum + (o.customer_price || 0), 0),
        margin: data.reduce((sum, o) => sum + (o.margin || 0), 0),
      });
    }
  }, [adminSession?.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setCurrentPage(1); }, [statusFilter, search, pageSize, filters]);

  // Load the option lists for the Customer + Carrier filter dropdowns.
  // We pull both kinds of partners in a single query and split on the
  // `types` ARRAY column, which is cheaper than two round-trips.
  useEffect(() => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    supabase
      .from("business_partners")
      .select("id, name, types")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data }) => {
        const all = data || [];
        setCustomers(all.filter((p: any) => Array.isArray(p.types) && p.types.includes("customer")).map(p => ({ id: p.id, name: p.name })));
        setCarriers(all.filter((p: any) => Array.isArray(p.types) && p.types.includes("carrier")).map(p => ({ id: p.id, name: p.name })));
      });
  }, [adminSession?.id]);

  // Restore selected order from URL ?order=<id> on initial load
  useEffect(() => {
    if (orders.length === 0 || selectedOrderId) return;
    const url = new URL(window.location.href);
    const orderId = url.searchParams.get("order");
    if (orderId) setSelectedOrderId(orderId);
  }, [orders, selectedOrderId]);

  // Realtime: refresh table when orders change
  useEffect(() => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
        fetchStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [adminSession?.id, fetchOrders, fetchStats]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const fmtCurrency = (a: number | null, c: string) => {
    if (a == null) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c || "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(a);
  };
  const getRoute = (stops: Order["stops"]) => {
    if (!stops || stops.length === 0) return null;
    const first = stops[0];
    const last = stops[stops.length - 1];
    return {
      fromCity: first.city || "?",
      fromCountry: first.country || null,
      toCity: last.city || "?",
      toCountry: last.country || null,
      stopsCount: stops.length,
    };
  };

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left: Orders List - Hidden on mobile when order is selected */}
      <div className={`flex flex-col transition-all duration-300 ease-in-out ${
        selectedOrderId 
          ? "hidden md:flex md:w-1/2 lg:w-1/2" 
          : "w-full"
      }`}>
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border/50">
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground tracking-tight">Transport Orders</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">{totalCount} orders total</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Quick access to the localized status reference guide so users
                can self-serve when they're not sure what a status means. */}
            <StatusGuide />
            <Link href="/admin/tms/planning" className="hidden md:inline-flex">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 px-3 text-xs">
                <Layers className="h-3.5 w-3.5" />
                Dispatch
              </Button>
            </Link>
            <Link href="/admin/tms/trips" className="hidden md:inline-flex">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 px-3 text-xs">
                <Route className="h-3.5 w-3.5" />
                Round Trips
              </Button>
            </Link>
            <Link href="/admin/tms/carriers/consolidation" className="hidden lg:inline-flex">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 px-3 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                Consolidate
              </Button>
            </Link>
            <Link href="/admin/tms/orders/new">
              <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 h-9 md:h-8 px-3 md:px-4 text-xs">
                <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
                <span className="hidden sm:inline">New Order</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Strip - Horizontal scroll on mobile */}
        <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-2 md:py-3 border-b border-border/50 bg-muted/20 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </div>
          <div className="h-8 w-px bg-border/50 shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{stats.active}</p>
              <p className="text-[10px] text-muted-foreground">Active</p>
            </div>
          </div>
          <div className="h-8 w-px bg-border/50 shrink-0 hidden sm:block" />
          <div className="flex items-center gap-2 shrink-0 hidden sm:flex">
            <div className="h-8 w-8 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{fmtCurrency(stats.revenue, "EUR")}</p>
              <p className="text-[10px] text-muted-foreground">Revenue</p>
            </div>
          </div>
          <div className="h-8 w-px bg-border/50 shrink-0 hidden lg:block" />
          <div className="flex items-center gap-2 shrink-0 hidden lg:flex">
            <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-base md:text-lg font-semibold leading-none">{fmtCurrency(stats.margin, "EUR")}</p>
              <p className="text-[10px] text-muted-foreground">Margin</p>
            </div>
          </div>
        </div>

        {/* Filters - Stacked on mobile. Now includes an "Advanced filters"
            popover (customer / carrier / dispatcher / source / date range)
            and a chip strip beneath the row that shows what's currently
            active and lets the user remove any chip with one click. */}
        <div className="flex flex-col gap-2 px-4 md:px-6 py-2.5 border-b border-border/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by reference, customer, carrier, cargo..."
                className="pl-9 h-10 md:h-8 text-sm md:text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 sm:w-[130px] h-10 md:h-8 text-sm md:text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_FILTER_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <OrdersAdvancedFilters
                value={filters}
                onChange={setFilters}
                customers={customers}
                carriers={carriers}
                users={adminUsers}
              />
            </div>
          </div>
          <OrdersFilterChips
            value={filters}
            onChange={setFilters}
            customers={customers}
            carriers={carriers}
            users={adminUsers}
          />
        </div>

        {/* Table - Desktop / Cards - Mobile */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-muted-foreground text-sm">Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No orders found</p>
              {!search && statusFilter === "all" && (
                <Link href="/admin/tms/orders/new">
                  <Button size="sm" className="mt-3 gap-1.5"><Plus className="h-3.5 w-3.5" />Create Order</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-border/30">
{orders.map(order => {
  const route = getRoute(order.stops);
  const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const trips = order.trips || [];
  // Get all legs across all trips
  const allLegs = trips.flatMap(t => t.legs || []);
  const hasOwnFleet = allLegs.some(l => l.assignment_type === "own_fleet");
  const hasSubcontract = allLegs.some(l => l.assignment_type === "forwarding");
  const hasMixed = hasOwnFleet && hasSubcontract;
  const ownFleetLegs = allLegs.filter(l => l.assignment_type === "own_fleet");
  const subcontractLegs = allLegs.filter(l => l.assignment_type === "forwarding");
  
  return (
  <div
  key={order.id}
  onClick={() => selectOrder(order.id)}
  className="px-4 py-3 active:bg-muted/50 cursor-pointer"
  >
  <div className="flex items-start justify-between gap-2 mb-2">
  <div className="flex items-center gap-1.5 flex-wrap">
  <span className="font-mono text-sm font-semibold text-foreground">{order.reference_number}</span>
  {hasMixed ? (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-400 border-amber-500/30 bg-amber-500/10">
      Mixed
    </Badge>
  ) : hasOwnFleet ? (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-blue-400 border-blue-500/30 bg-blue-500/10">
      Own Fleet
    </Badge>
  ) : hasSubcontract ? (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-indigo-400 border-indigo-500/30 bg-indigo-500/10">
      Subcontract
    </Badge>
  ) : null}
  {(order.created_from === "ai_upload" || order.created_from === "ai_email") && (
  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-[9px]">
  <Sparkles className="h-2.5 w-2.5" />AI
  </span>
  )}
  </div>
  <OrderStatusBadge status={order.status} scope="parent" size="sm" />
  </div>
  
  {route && (
  <div className="flex items-center gap-1.5 text-sm mb-2 min-w-0">
  <CountryFlag country={route.fromCountry} className="w-4 h-3" />
  <span className="text-foreground font-medium truncate">{route.fromCity}</span>
  <span className="text-muted-foreground shrink-0">→</span>
  <CountryFlag country={route.toCountry} className="w-4 h-3" />
  <span className="text-foreground font-medium truncate">{route.toCity}</span>
  </div>
  )}
  
  <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
  {customer && <span className="text-muted-foreground truncate">{customer.name}</span>}
  <span className="font-medium text-foreground shrink-0">{fmtCurrency(order.customer_price, order.customer_currency)}</span>
  </div>
  {/* Added · dispatcher · source — compact secondary metadata line on
      the mobile card. Kept on a single row to preserve density. */}
  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
    <span className="tabular-nums">{new Date(order.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
    {order.created_by && (
      <>
        <span>·</span>
        <span className="truncate max-w-[90px]">{adminUsersById.get(order.created_by)?.name ?? "—"}</span>
      </>
    )}
    <SourceBadge source={order.created_from} />
  </div>
  
  {/* Resources row */}
  {(hasOwnFleet || hasSubcontract) && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {hasOwnFleet && ownFleetLegs[0]?.driver_name && (
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          <span className="text-foreground">{ownFleetLegs[0].driver_name}</span>
          {ownFleetLegs.length > 1 && <span className="text-[9px]">+{ownFleetLegs.length - 1}</span>}
        </span>
      )}
      {hasOwnFleet && ownFleetLegs[0]?.vehicle_plate && (
        <span className="flex items-center gap-1">
          <Truck className="h-3 w-3" />
          <span className="text-foreground font-mono">{ownFleetLegs[0].vehicle_plate}</span>
        </span>
      )}
      {hasOwnFleet && ownFleetLegs[0]?.trailer_plate && (
        <span className="flex items-center gap-1">
          <Container className="h-3 w-3" />
          <span className="text-foreground font-mono">{ownFleetLegs[0].trailer_plate}</span>
        </span>
      )}
      {hasSubcontract && subcontractLegs[0]?.carrier_name && (
        <span className="flex items-center gap-1 text-indigo-400">
          <Building2 className="h-3 w-3" />
          <span className="truncate max-w-[140px]">{subcontractLegs[0].carrier_name}</span>
          {subcontractLegs.length > 1 && <span className="text-[9px] text-muted-foreground">+{subcontractLegs.length - 1}</span>}
        </span>
      )}
    </div>
  )}
  </div>
  );
  })}
              </div>

              {/* Desktop Table View */}
              <table className="w-full text-sm hidden md:table">
                <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-border/50">
                    <th className="text-left font-medium text-muted-foreground text-xs px-6 py-2.5">Reference</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Cust. Ref</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Route</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Customer</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Status</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Assignment</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Cargo</th>
                    <th className="text-left font-medium text-muted-foreground text-xs px-3 py-2.5">Added</th>
                    {!selectedOrderId && <th className="text-right font-medium text-muted-foreground text-xs px-3 py-2.5">Price</th>}
                    <th className="text-right font-medium text-muted-foreground text-xs px-4 py-2.5 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => {
                const route = getRoute(order.stops);
                const isSelected = selectedOrderId === order.id;
                const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
                const trips = order.trips || [];
                // Get all legs across all trips
                const allLegs = trips.flatMap(t => t.legs || []);
                // Determine execution type badges from legs
                const hasOwnFleet = allLegs.some(l => l.assignment_type === "own_fleet");
                const hasSubcontract = allLegs.some(l => l.assignment_type === "forwarding");
                const hasMixed = hasOwnFleet && hasSubcontract;
                // Check if all legs are assigned
                const ownFleetLegs = allLegs.filter(l => l.assignment_type === "own_fleet");
                const subcontractLegs = allLegs.filter(l => l.assignment_type === "forwarding");
                const allOwnFleetAssigned = ownFleetLegs.every(l => l.driver_id && l.vehicle_id);
                const allSubcontractAssigned = subcontractLegs.every(l => l.carrier_id);

                return (
                  <tr
                    key={order.id}
                    onClick={() => selectOrder(isSelected ? null : order.id)}
                    className={`cursor-pointer border-b border-border/30 transition-all duration-150 ${
                      isSelected
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "hover:bg-muted/30 border-l-2 border-l-transparent"
                    }`}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium text-foreground">{order.reference_number}</span>
                        {(order.created_from === "ai_upload" || order.created_from === "ai_email") && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-violet-500/10 text-violet-400 text-[9px]">
                            <Sparkles className="h-2 w-2" />AI
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-muted-foreground truncate max-w-[100px] block">{order.customer_reference || "-"}</span>
                    </td>
                    <td className="px-3 py-3">
                      {route ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <CountryFlag country={route.fromCountry} className="w-4 h-3" />
                          <span className="truncate max-w-[90px] text-foreground">{route.fromCity}</span>
                          <span className="text-muted-foreground shrink-0">→</span>
                          <CountryFlag country={route.toCountry} className="w-4 h-3" />
                          <span className="truncate max-w-[90px] text-foreground">{route.toCity}</span>
                        </div>
                      ) : <span className="text-muted-foreground text-xs">-</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-foreground truncate max-w-[100px] block">{customer?.name || "-"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <OrderStatusBadge status={order.status} scope="parent" size="sm" />
                        {/* For Mixed orders show BOTH internal and forwarder
                         * sub-pills with tiny scope tags so operators can
                         * see at a glance which side is blocking. For non-
                         * mixed orders fall back to the single picked
                         * sub-pill. */}
                        {order.isMixedExecution && (order.executionInternal || order.executionForwarder) ? (
                          <div className="flex flex-col gap-0.5">
                            {order.executionInternal && (
                              <div className="flex items-center gap-1">
                                <span className="text-[8px] uppercase tracking-wider text-blue-400/80 font-semibold w-12">Internal</span>
                                <OrderStatusBadge
                                  status={order.executionInternal.status}
                                  scope="internal"
                                  size="sm"
                                  className="text-[9px] py-0 opacity-90"
                                />
                              </div>
                            )}
                            {order.executionForwarder && (
                              <div className="flex items-center gap-1">
                                <span className="text-[8px] uppercase tracking-wider text-indigo-400/80 font-semibold w-12">Forwarder</span>
                                <OrderStatusBadge
                                  status={order.executionForwarder.status}
                                  scope="forwarder"
                                  size="sm"
                                  className="text-[9px] py-0 opacity-90"
                                />
                              </div>
                            )}
                          </div>
                        ) : order.executionStatus ? (
                          <OrderStatusBadge
                            status={order.executionStatus.status}
                            scope={order.executionStatus.scope}
                            size="sm"
                            className="text-[9px] py-0 self-start opacity-90"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs">
                        {trips.length === 0 || allLegs.length === 0 ? (
                          <span className="text-muted-foreground">No execution</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {/* Execution type badge */}
                            <div className="flex items-center gap-1">
                              {hasMixed ? (
                                <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-amber-400 border-amber-500/30 bg-amber-500/10">
                                  Mixed
                                </Badge>
                              ) : hasOwnFleet ? (
                                <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-blue-400 border-blue-500/30 bg-blue-500/10">
                                  Own Fleet
                                </Badge>
                              ) : hasSubcontract ? (
                                <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-indigo-400 border-indigo-500/30 bg-indigo-500/10">
                                  Subcontract
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[8px] px-1.5 py-0 text-muted-foreground border-border bg-muted/40">
                                  Undecided
                                </Badge>
                              )}
                            </div>
                            {/* Own Fleet resources: driver + truck + trailer */}
                            {hasOwnFleet && (
                              <div className="flex flex-col gap-0.5 text-[11px]">
                                {ownFleetLegs[0]?.driver_name ? (
                                  <div className="flex items-center gap-1 text-foreground">
                                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[110px]">{ownFleetLegs[0].driver_name}</span>
                                    {ownFleetLegs.length > 1 && <span className="text-muted-foreground text-[9px]">+{ownFleetLegs.length - 1}</span>}
                                  </div>
                                ) : (
                                  <span className="text-amber-400 text-[10px]">Driver unassigned</span>
                                )}
                                {(ownFleetLegs[0]?.vehicle_plate || ownFleetLegs[0]?.trailer_plate) && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    {ownFleetLegs[0]?.vehicle_plate && (
                                      <span className="flex items-center gap-1">
                                        <Truck className="h-3 w-3 shrink-0" />
                                        <span className="font-mono text-foreground">{ownFleetLegs[0].vehicle_plate}</span>
                                      </span>
                                    )}
                                    {ownFleetLegs[0]?.trailer_plate && (
                                      <span className="flex items-center gap-1">
                                        <Container className="h-3 w-3 shrink-0" />
                                        <span className="font-mono text-foreground">{ownFleetLegs[0].trailer_plate}</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Subcontract: carrier name */}
                            {hasSubcontract && (
                              subcontractLegs[0]?.carrier_name ? (
                                <div className="flex items-center gap-1 text-[11px]">
                                  <Building2 className="h-3 w-3 text-indigo-400 shrink-0" />
                                  <span className="truncate max-w-[120px] text-indigo-400">{subcontractLegs[0].carrier_name}</span>
                                  {subcontractLegs.length > 1 && <span className="text-muted-foreground text-[9px]">+{subcontractLegs.length - 1}</span>}
                                </div>
                              ) : (
                                <span className="text-amber-400 text-[10px]">Carrier unassigned</span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] text-muted-foreground">
                        {[order.weight_kg ? `${(order.weight_kg / 1000).toFixed(0)}t` : null, order.pallet_count ? `${order.pallet_count}p` : null].filter(Boolean).join(" / ") || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {/* "Added" column — when the order was created and by
                          which dispatcher. The source badge (manual / AI
                          email / AI upload / portal) is already shown next
                          to the Reference cell on desktop, so we omit it
                          here to avoid the duplicate AI tag. */}
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        <span className="text-foreground tabular-nums">
                          {new Date(order.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[140px] block">
                          {order.created_by ? (adminUsersById.get(order.created_by)?.name ?? "—") : <span className="italic">system</span>}
                        </span>
                      </div>
                    </td>
                    {!selectedOrderId && (
                      <td className="px-3 py-3 text-right">
                        <span className="text-xs font-medium text-foreground">{fmtCurrency(order.customer_price, order.customer_currency)}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500"
                            onClick={() => setDeleteOrderId(order.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Order
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Pagination -- always visible */}
        <div className="flex items-center justify-between px-4 md:px-6 py-2 md:py-2.5 border-t border-border/50 shrink-0 bg-background/95">
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {totalCount > 0
              ? <><span className="hidden sm:inline">{(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of </span>{totalCount}<span className="hidden sm:inline"> orders</span></>
              : "No orders"
            }
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5 md:gap-1">
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4 md:h-3.5 md:w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-2 md:hidden">{currentPage}/{totalPages}</span>
              <div className="hidden md:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span key={`dots-${i}`} className="text-xs text-muted-foreground px-1">...</span>
                    ) : (
                      <Button
                        key={p}
                        variant={currentPage === p ? "default" : "ghost"}
                        size="icon"
                        className={`h-7 w-7 text-xs ${currentPage === p ? "bg-primary text-primary-foreground" : ""}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4 md:h-3.5 md:w-3.5" />
              </Button>
            </div>
          )}
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
            <SelectTrigger className="w-[70px] md:w-[90px] h-8 md:h-7 text-[10px] md:text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / pg</SelectItem>
              <SelectItem value="50">50 / pg</SelectItem>
              <SelectItem value="100">100 / pg</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right: Detail Panel (full-screen mobile below header, 50% split desktop) */}
      {selectedOrderId && (
        <div className="fixed top-14 left-0 right-0 bottom-0 z-40 md:relative md:top-auto md:left-auto md:right-auto md:bottom-auto md:z-auto w-full md:w-1/2 border-l border-border/50 bg-card overflow-hidden">
          <OrderDetailPanel
            orderId={selectedOrderId}
            onClose={() => selectOrder(null)}
            onStatusChange={fetchOrders}
          />
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteOrderId} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone and will permanently remove the order along with all its stops, documents, and history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrder}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? "Deleting..." : "Delete Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
