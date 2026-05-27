"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight, ArrowUpDown, Calendar, ChevronDown, ChevronLeft, ChevronRight,
  Copy, DollarSign, ExternalLink, Filter, GripVertical, Kanban, LayoutList,
  MoreHorizontal, Package, Percent, Plus, RefreshCw, Search, Settings,
  TrendingDown, TrendingUp, Truck, XCircle, ArrowLeftRight, Clock,
  Building2, Route, Eye, CircleDot, AlertTriangle, UserPlus, Trash2,
} from "lucide-react";
import { QuickCreatePartnerDialog } from "@/components/tms/quick-create-partner-dialog";
import { toast } from "@/hooks/use-toast";
import { useAdminUsers, type AdminUser } from "@/hooks/use-admin-users";
import {
  OrdersAdvancedFilters,
  OrdersFilterChips,
  EMPTY_FILTERS,
  SourceBadge,
  type OrdersFilterValue,
} from "@/components/tms/orders-advanced-filters";

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
function getCountryCode(country: string): string {
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
function CountryFlag({ country, className = "w-4 h-3" }: { country: string; className?: string }) {
  const code = getCountryCode(country);
  if (!code) return null;
  return <img src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`} alt={country} className={`${className} rounded-[2px] object-cover shrink-0`} crossOrigin="anonymous" />;
}

// ─── Types ────────────────────────────────────────────────
interface FwdOrder {
  id: string;
  reference_number: string;
  // Customer-provided reference for this order (e.g. their PO number,
  // booking ref, file number). Surfaced as its own column on the Table
  // view and included in the search filter, since forwarders typically
  // look up jobs by the customer's reference, not by our internal FWD-…
  // number.
  customer_reference: string | null;
  order_type: string;
  status: string;
  customer_price: number | null;
  customer_currency: string;
  carrier_cost: number | null;
  carrier_currency: string;
  margin: number | null;
  cargo_description: string | null;
  weight_kg: number | null;
  pallet_count: number | null;
  loading_meters: number | null;
  // `created_from` keeps track of HOW the order entered the system (manual
  // entry, AI-from-email, AI-from-upload, etc.) so we can both filter
  // by source and surface a Source badge in the "Added" column.
  created_from: string | null;
  // `created_by` is the user id of the dispatcher who first saved the
  // order. We resolve it to a display name client-side via
  // useAdminUsers — see SourceBadge usage in TableView.
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer: { id: string; name: string } | null;
  carrier: { id: string; name: string } | null;
  stops: { id: string; stop_type: string; city: string | null; country: string | null; planned_date: string | null; sequence_order: number }[];
  forwarding_checklist: ForwardingChecklist | null;
}

interface ChecklistItem {
  checked: boolean;
  date: string | null;
  note: string;
}

interface ForwardingChecklist {
  documents_pending: ChecklistItem;
  documents_received: ChecklistItem;
  client_invoiced: ChecklistItem;
  docs_sent_to_client: ChecklistItem;
  carrier_payment_due: ChecklistItem;
  carrier_paid: ChecklistItem;
  client_payment_received: ChecklistItem;
}

const DEFAULT_CHECKLIST: ForwardingChecklist = {
  documents_pending: { checked: false, date: null, note: "" },
  documents_received: { checked: false, date: null, note: "" },
  client_invoiced: { checked: false, date: null, note: "" },
  docs_sent_to_client: { checked: false, date: null, note: "" },
  carrier_payment_due: { checked: false, date: null, note: "" },
  carrier_paid: { checked: false, date: null, note: "" },
  client_payment_received: { checked: false, date: null, note: "" },
};

const CHECKLIST_LABELS: Record<keyof ForwardingChecklist, { label: string }> = {
  documents_pending: { label: "Documents Pending (CMR/POD)" },
  documents_received: { label: "Documents Received (CMR/POD)" },
  client_invoiced: { label: "Invoiced to Client" },
  docs_sent_to_client: { label: "Documents Sent to Client" },
  carrier_payment_due: { label: "Carrier Payment Due" },
  carrier_paid: { label: "Carrier Paid" },
  client_payment_received: { label: "Client Payment Received" },
};

interface ForwarderSettings {
  profit_display_currency: string;
  default_carrier_currency: string;
  default_payment_terms_days: number;
  order_prefix: string;
  margin_warning_threshold: number;
  margin_danger_threshold: number;
  default_carrier_id: string | null;
  email_notifications: {
    on_carrier_assign: boolean;
    on_status_change: boolean;
    on_delivery_complete: boolean;
  };
  order_template: {
    show_company_logo: boolean;
    show_cargo_details: boolean;
    show_payment_terms: boolean;
    footer_text: string;
    language: string;
  };
}

const DEFAULT_SETTINGS: ForwarderSettings = {
  profit_display_currency: "EUR",
  default_carrier_currency: "EUR",
  default_payment_terms_days: 30,
  order_prefix: "FWD",
  margin_warning_threshold: 10,
  margin_danger_threshold: 5,
  default_carrier_id: null,
  email_notifications: { on_carrier_assign: true, on_status_change: true, on_delivery_complete: true },
  order_template: { show_company_logo: true, show_cargo_details: true, show_payment_terms: true, footer_text: "", language: "en" },
};

// ─── Pipeline Config ───────────────────────────────────────────────────────
// 13 visible columns matching the v3 status spec for Forwarder (subcontract)
// children. The first column is "Unassigned" (the child equivalent of "Carrier
// Unassigned") since fwd_draft / fwd_client_* are gone in v3. Closeout columns
// (Carrier Invoice Pending / Unpaid) replace the old Documents-Pending column.
const PIPELINE_COLUMNS = [
  { key: "fwd_unassigned", label: "Unassigned", color: "bg-yellow-500", dotColor: "bg-yellow-400", textColor: "text-yellow-400", borderColor: "border-yellow-500/30" },
  { key: "fwd_assigned_to_carrier", label: "Assigned", color: "bg-indigo-500", dotColor: "bg-indigo-400", textColor: "text-indigo-400", borderColor: "border-indigo-500/30" },
  { key: "fwd_carrier_confirmation_required", label: "Carrier Confirm.", color: "bg-cyan-500", dotColor: "bg-cyan-400", textColor: "text-cyan-400", borderColor: "border-cyan-500/30" },
  { key: "fwd_carrier_confirmed", label: "Carrier OK", color: "bg-sky-500", dotColor: "bg-sky-400", textColor: "text-sky-400", borderColor: "border-sky-500/30" },
  { key: "fwd_waiting_to_start", label: "Waiting", color: "bg-violet-500", dotColor: "bg-violet-400", textColor: "text-violet-400", borderColor: "border-violet-500/30" },
  { key: "fwd_in_progress", label: "In Progress", color: "bg-amber-500", dotColor: "bg-amber-400", textColor: "text-amber-400", borderColor: "border-amber-500/30" },
  { key: "fwd_delivered", label: "Delivered", color: "bg-emerald-500", dotColor: "bg-emerald-400", textColor: "text-emerald-400", borderColor: "border-emerald-500/30" },
  { key: "fwd_documents_pending", label: "Docs Pending", color: "bg-orange-500", dotColor: "bg-orange-400", textColor: "text-orange-400", borderColor: "border-orange-500/30" },
  { key: "fwd_documents_received", label: "Docs Received", color: "bg-teal-500", dotColor: "bg-teal-400", textColor: "text-teal-400", borderColor: "border-teal-500/30" },
  { key: "fwd_carrier_invoice_pending", label: "Invoice Pending", color: "bg-amber-500", dotColor: "bg-amber-400", textColor: "text-amber-400", borderColor: "border-amber-500/30" },
  { key: "fwd_carrier_invoice_unpaid", label: "Invoice Unpaid", color: "bg-yellow-500", dotColor: "bg-yellow-400", textColor: "text-yellow-400", borderColor: "border-yellow-500/30" },
  { key: "fwd_completed", label: "Completed", color: "bg-green-500", dotColor: "bg-green-400", textColor: "text-green-400", borderColor: "border-green-500/30" },
];

const FWD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  fwd_unassigned: { label: "Unassigned", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  fwd_assigned_to_carrier: { label: "Assigned to Carrier", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  fwd_carrier_confirmation_required: { label: "Carrier Confirm. Req.", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  fwd_carrier_confirmed: { label: "Carrier Confirmed", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  fwd_waiting_to_start: { label: "Waiting to Start", color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  fwd_in_progress: { label: "In Progress", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  fwd_delivered: { label: "Delivered", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  fwd_documents_pending: { label: "Docs Pending", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  fwd_documents_received: { label: "Docs Received", color: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  fwd_carrier_invoice_pending: { label: "Invoice Pending", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  fwd_carrier_invoice_unpaid: { label: "Invoice Unpaid", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  fwd_completed: { label: "Completed", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  fwd_cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  fwd_on_hold: { label: "On Hold", color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20" },
};

// ─── Helpers ──────────────────────────────────────────────
function calcProfit(o: FwdOrder): number | null {
  if (o.customer_price == null || o.carrier_cost == null) return null;
  return o.customer_price - o.carrier_cost;
}
function calcMargin(o: FwdOrder): number | null {
  if (o.customer_price == null || o.carrier_cost == null || o.customer_price === 0) return null;
  return ((o.customer_price - o.carrier_cost) / o.customer_price) * 100;
}
function marginClass(margin: number | null, settings: ForwarderSettings): string {
  if (margin == null) return "text-muted-foreground";
  if (margin < settings.margin_danger_threshold) return "text-red-400";
  if (margin < settings.margin_warning_threshold) return "text-amber-400";
  return "text-emerald-400";
}
function profitBgClass(margin: number | null, settings: ForwarderSettings): string {
  if (margin == null) return "bg-muted-foreground/20";
  if (margin < settings.margin_danger_threshold) return "bg-red-500";
  if (margin < settings.margin_warning_threshold) return "bg-amber-500";
  return "bg-emerald-500";
}
function getRoute(o: FwdOrder): { origin: { city: string; country: string }; dest: { city: string; country: string } } | null {
  const sorted = [...(o.stops || [])].sort((a, b) => a.sequence_order - b.sequence_order);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  return {
    origin: { city: first.city || "?", country: first.country || "" },
    dest: { city: last.city || "?", country: last.country || "" },
  };
}
function getDateRange(o: FwdOrder): string {
  const dates = o.stops.map(s => s.planned_date).filter(Boolean).sort();
  if (dates.length === 0) return "-";
  const from = dates[0]!.slice(5);
  const to = dates[dates.length - 1]!.slice(5);
  return from === to ? from : `${from} - ${to}`;
}
function formatCurrency(amount: number | null, currency: string): string {
  if (amount == null) return "-";
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Main Component ───────────────────────────────────────
export default function ForwarderBoardPage() {
  const { session: adminSession } = useAdminSession();
  const [orders, setOrders] = useState<FwdOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ForwarderSettings>(DEFAULT_SETTINGS);
  // Table is the default view. The previous default of "kanban"
  // (Pipeline) was overridden because the forwarders use the spreadsheet-
  // style Table view as their daily workspace and only occasionally
  // switch to Pipeline for the column-grouped status overview.
  const [view, setView] = useState<"kanban" | "table">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Legacy carrier dropdown kept for visual continuity (the Forwarder
  // Board has had it in the toolbar forever). It's wired to the same
  // `filters.carrierId` value as the advanced popover so the two stay
  // perfectly in sync.
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<OrdersFilterValue>(EMPTY_FILTERS);
  const { users: adminUsers, byId: adminUsersById } = useAdminUsers(adminSession?.id);
  const [sortCol, setSortCol] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  // Pagination state for the Table view. The page size is intentionally
  // generous (25) — forwarders want to scan many rows at once and the
  // row height is compact. Page is reset to 1 whenever the underlying
  // list shrinks (filter change, search) so we don't strand the user on
  // an empty page.
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const router = useRouter();

  // Fetch forwarder settings
  useEffect(() => {
    if (!adminSession?.id) return;
    const s = createClient();
    s.from("admins").select("forwarder_settings").eq("id", adminSession.id).single()
      .then(({ data }) => {
        if (data?.forwarder_settings) setSettings({ ...DEFAULT_SETTINGS, ...data.forwarder_settings });
      });
  }, [adminSession?.id]);

  // Fetch forwarding orders
  const fetchOrders = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("orders")
      .select(`
        id, reference_number, customer_reference, order_type, status, forwarding_checklist,
        customer_price, customer_currency, carrier_cost, carrier_currency, margin,
        cargo_description, weight_kg, pallet_count, loading_meters,
        created_from, created_by,
        created_at, updated_at, commercial_role, parent_order_id,
        customer:business_partners!orders_customer_id_fkey(id, name),
        carrier:business_partners!orders_carrier_id_fkey(id, name),
        stops:order_stops(id, stop_type, city, country, planned_date, sequence_order),
        parent_order:parent_order_id(id, reference_number)
      `)
      .eq("admin_id", adminSession.id)
      .eq("order_type", "forwarding")
      .eq("is_draft", false)
      .not("status", "eq", "fwd_cancelled")
      .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
    // Carrier comes from the unified advanced-filters value (the inline
    // toolbar dropdown is bound to `filters.carrierId`, so the two are
    // always the same selection).
    if (filters.carrierId !== "all") query = query.eq("carrier_id", filters.carrierId);
    if (filters.customerId !== "all") query = query.eq("customer_id", filters.customerId);
    if (filters.createdById !== "all") query = query.eq("created_by", filters.createdById);
    if (filters.createdFrom !== "all") query = query.eq("created_from", filters.createdFrom);
    if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
    if (filters.dateTo)   query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
    // NOTE: search is intentionally NOT applied server-side. We fetch
    // the full filtered (status/carrier) result set once and run search
    // entirely in memory below. Reasons:
    //   1. Search needs to cover related-table fields (customer.name,
    //      carrier.name) which postgrest cannot OR-combine with base
    //      columns in a single .or() clause.
    //   2. Forwarding-order volume per admin is bounded (hundreds to
    //      low thousands) so in-memory search is instant.
    //   3. Avoids re-roundtripping the DB on every keystroke.

    const { data } = await query;
    if (data) {
      setOrders(data.map((o: any) => ({
        ...o,
        stops: (o.stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
      })) as FwdOrder[]);
    }
    setLoading(false);
    // NOTE: `search` deliberately excluded. Search is applied
    // client-side against the already-fetched result set so typing in
    // the search box does not re-hit the database on every keystroke.
  }, [adminSession?.id, statusFilter, filters]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Fetch business partners for the filter dropdowns. Single round-trip
  // for both customers and carriers — we split by the `types` array on
  // the client because that's much cheaper than two separate queries.
  // NOTE: the live schema uses the `types` column (text[]), not the
  // older `partner_type` shape that this file previously referenced.
  useEffect(() => {
    if (!adminSession?.id) return;
    const s = createClient();
    s.from("business_partners")
      .select("id, name, types")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data }) => {
        const all = data || [];
        setCarriers(all.filter((p: any) => Array.isArray(p.types) && p.types.includes("carrier")).map(p => ({ id: p.id, name: p.name })));
        setCustomers(all.filter((p: any) => Array.isArray(p.types) && p.types.includes("customer")).map(p => ({ id: p.id, name: p.name })));
      });
  }, [adminSession?.id]);

  // ─── KPI Calculations ────────────────────────────────────
  const kpis = useMemo(() => {
    const active = orders.filter(o => !["fwd_cancelled", "fwd_completed"].includes(o.status));
    const totalRevenue = active.reduce((s, o) => s + (o.customer_price || 0), 0);
    const totalCost = active.reduce((s, o) => s + (o.carrier_cost || 0), 0);
    const netProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0;
    const inTransit = active.filter(o => o.status === "fwd_in_progress").length;
    const unassigned = active.filter(o => o.status === "fwd_unassigned").length;
    return { activeCount: active.length, totalRevenue, totalCost, netProfit, avgMargin, inTransit, unassigned };
  }, [orders]);

  // ─── Grouped orders for kanban ───────────────────────────
  const grouped = useMemo(() => {
    const map: Record<string, FwdOrder[]> = {};
    PIPELINE_COLUMNS.forEach(c => { map[c.key] = []; });
    orders.forEach(o => {
      if (map[o.status]) {
        map[o.status].push(o);
      } else if (o.status === "fwd_documents_pending" || o.status === "fwd_documents_received") {
        // Checklist-phase orders appear in the "Delivered" column with checklist indicators
        map["fwd_delivered"]?.push(o);
      }
    });
    return map;
  }, [orders]);

  // ─── Client-side search ──────────────────────────────────
  // Case-insensitive substring match across all the fields the
  // forwarder actually looks orders up by: our FWD reference, the
  // customer's own reference number (PO / file number), customer name,
  // carrier name, and the free-text cargo description.
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o => {
      const haystacks = [
        o.reference_number,
        o.customer_reference,
        o.customer?.name,
        o.carrier?.name,
        o.cargo_description,
      ];
      return haystacks.some(s => s?.toLowerCase().includes(q));
    });
  }, [orders, search]);

  // ─── Table sort ──��───────────────────────────────────────
  const sortedOrders = useMemo(() => {
    const sorted = [...visibleOrders];
    sorted.sort((a, b) => {
      let va: any, vb: any;
      switch (sortCol) {
        case "reference_number": va = a.reference_number; vb = b.reference_number; break;
        case "customer_reference": va = a.customer_reference || ""; vb = b.customer_reference || ""; break;
        case "customer": va = a.customer?.name || ""; vb = b.customer?.name || ""; break;
        case "carrier": va = a.carrier?.name || ""; vb = b.carrier?.name || ""; break;
        case "customer_price": va = a.customer_price || 0; vb = b.customer_price || 0; break;
        case "carrier_cost": va = a.carrier_cost || 0; vb = b.carrier_cost || 0; break;
        case "profit": va = calcProfit(a) || 0; vb = calcProfit(b) || 0; break;
        case "margin": va = calcMargin(a) || 0; vb = calcMargin(b) || 0; break;
        default: va = a.created_at; vb = b.created_at;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [visibleOrders, sortCol, sortDir]);

  // ─── Pagination ──────────────────────────────────────────
  const pageCount = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE));
  // Clamp the page whenever the list shrinks (filter/search) so we
  // don't get stuck on an empty page beyond the new end.
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);
  // Also reset to page 1 on any input that changes the result set —
  // intuitively, applying a new filter should bring the user to the top
  // of the new results, not leave them on page 7.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, filters]);

  const pagedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedOrders.slice(start, start + PAGE_SIZE);
  }, [sortedOrders, page]);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  // ─── Drag & Drop status change ──────────────────────────
  async function handleDrop(kanbanColumn: string) {
    if (!dragOrderId) return;
    const oid = dragOrderId;
    const order = orders.find(o => o.id === oid);
    // kanbanColumn is already a fwd_ status key that maps directly to DB
    if (!order || order.status === kanbanColumn) { setDragOrderId(null); return; }
    // Optimistic update
    setOrders(prev => prev.map(o => o.id === oid ? { ...o, status: kanbanColumn } : o));
    setDragOrderId(null);
    const supabase = createClient();
    await supabase.from("orders").update({ status: kanbanColumn }).eq("id", oid);
    await supabase.from("order_status_history").insert({
      order_id: oid, from_status: order.status, to_status: kanbanColumn,
      changed_by_type: "admin", changed_by: adminSession?.id,
      notes: `Dragged to ${kanbanColumn} by ${adminSession?.name || "Admin"}`,
    });

    // Auto-trigger CMR/POD email when order is dropped into Delivered or Documents Pending
    if ((kanbanColumn === "fwd_delivered" || kanbanColumn === "fwd_documents_pending") && adminSession?.id) {
      try {
        const res = await fetch("/api/orders/request-cmr-pod", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-id": adminSession.id,
            "x-user-id": adminSession.user_id || "",
          },
          body: JSON.stringify({ orderId: oid }),
        });
        if (res.ok) {
          // Status was auto-changed to fwd_documents_pending by the API
          setOrders(prev => prev.map(o => o.id === oid ? { ...o, status: "fwd_documents_pending" } : o));
        }
      } catch { /* non-critical */ }
    }
  }

  // Delete FWD order
  const handleDeleteOrder = async (orderId: string, refNum: string) => {
    console.log("[v0] handleDeleteOrder: invoked", { orderId, refNum });
    const ok = confirm(`Are you sure you want to delete ${refNum}? This action cannot be undone.`);
    console.log("[v0] handleDeleteOrder: confirm result", ok);
    if (!ok) return;
    const supabase = createClient();
    try {
      // 1) Unlink any trip_legs that point at this forwarding order
      console.log("[v0] handleDeleteOrder: step trip_legs.forwarding_order_id = null");
      const { error: unlinkErr, count: unlinkCount } = await supabase
        .from("trip_legs")
        .update({ forwarding_order_id: null })
        .eq("forwarding_order_id", orderId)
        .select("id", { count: "exact", head: true });
      console.log("[v0] handleDeleteOrder: trip_legs unlinked", { unlinkCount, unlinkErr });
      if (unlinkErr) throw unlinkErr;

      // 2) Delete related child rows
      // trip_stops also has order_id pointing at this FWD order — must clean before orders.delete
      console.log("[v0] handleDeleteOrder: step delete trip_stops");
      const { error: tripStopsErr } = await supabase.from("trip_stops").delete().eq("order_id", orderId);
      console.log("[v0] handleDeleteOrder: trip_stops result", { tripStopsErr });
      if (tripStopsErr) throw tripStopsErr;

      console.log("[v0] handleDeleteOrder: step delete order_stops");
      const { error: stopsErr } = await supabase.from("order_stops").delete().eq("order_id", orderId);
      console.log("[v0] handleDeleteOrder: order_stops result", { stopsErr });
      if (stopsErr) throw stopsErr;

      console.log("[v0] handleDeleteOrder: step delete trip_orders");
      const { error: tripOrdersErr } = await supabase.from("trip_orders").delete().eq("order_id", orderId);
      console.log("[v0] handleDeleteOrder: trip_orders result", { tripOrdersErr });
      if (tripOrdersErr) throw tripOrdersErr;

      console.log("[v0] handleDeleteOrder: step delete order_status_history");
      const { error: historyErr } = await supabase.from("order_status_history").delete().eq("order_id", orderId);
      console.log("[v0] handleDeleteOrder: order_status_history result", { historyErr });
      // Don't throw on history errors - some rows may have FK with ON DELETE behavior

      console.log("[v0] handleDeleteOrder: step delete order_documents");
      const { error: docsErr } = await supabase.from("order_documents").delete().eq("order_id", orderId);
      console.log("[v0] handleDeleteOrder: order_documents result", { docsErr });

      // 3) Delete the order itself
      console.log("[v0] handleDeleteOrder: step delete orders row");
      const { data: deletedRows, error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId)
        .select("id");
      console.log("[v0] handleDeleteOrder: orders.delete result", { deletedRows, error });
      if (error) throw error;
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error("No order row was deleted (RLS or row missing)");
      }

      setOrders(prev => prev.filter(o => o.id !== orderId));
      toast({ title: `Deleted ${refNum}` });
      console.log("[v0] handleDeleteOrder: success");
    } catch (err: any) {
      console.log("[v0] handleDeleteOrder: FAILED", err);
      toast({ title: "Delete failed", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const selectedOrder = orders.find(o => o.id === selectedOrderId) || null;
  const cur = settings.profit_display_currency;

  // ─── Render ─────────────────────────────────────────────
  return (
    // h-full (not h-screen) so the page fits below the global admin header.
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="px-3 md:px-6 pt-3 md:pt-5 pb-3">
          <div className="flex items-start md:items-center justify-between gap-3 mb-4 flex-col md:flex-row">
            <div className="flex items-center justify-between w-full md:w-auto">
              <div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-primary" />
                  Forwarder Board
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 hidden md:block">Manage forwarding orders, carriers &amp; profit tracking</p>
              </div>
              {/* Mobile actions */}
              <div className="flex items-center gap-2 md:hidden">
                <Button onClick={fetchOrders} variant="ghost" size="icon" className="h-10 w-10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
                <Link href="/admin/tms/orders/new?type=forwarding">
                  <Button size="icon" className="h-10 w-10"><Plus className="h-5 w-5" /></Button>
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              {/* View toggle */}
              <div className="flex items-center rounded-lg border border-border/50 bg-card/50 p-0.5 shrink-0">
                <button
                  onClick={() => setView("kanban")}
                  className={`flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-md text-xs font-medium transition-all ${view === "kanban" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Kanban className="h-4 w-4 md:h-3.5 md:w-3.5" /><span className="hidden sm:inline">Pipeline</span>
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-md text-xs font-medium transition-all ${view === "table" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutList className="h-4 w-4 md:h-3.5 md:w-3.5" /><span className="hidden sm:inline">Table</span>
                </button>
              </div>
              <Link href="/admin/tms/carriers/consolidation" className="hidden md:block">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Consolidate
                </Button>
              </Link>
              <Link href="/admin/settings/forwarding" className="hidden md:block">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"><Settings className="h-3.5 w-3.5 mr-1" />Config</Button>
              </Link>
              <Button onClick={fetchOrders} variant="ghost" size="icon" className="h-8 w-8 hidden md:flex"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
              <Link href="/admin/tms/orders/new?type=forwarding" className="hidden md:block">
                <Button size="sm" className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />New Forwarding Order</Button>
              </Link>
            </div>
          </div>

          {/* KPI Row - Horizontal scroll on mobile */}
          <div className="flex md:grid md:grid-cols-6 gap-2 md:gap-3 mb-3 md:mb-4 overflow-x-auto scrollbar-hide pb-1 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0">
            <KpiCard label="Active Orders" value={kpis.activeCount.toString()} icon={<Package className="h-4 w-4" />} accent="text-blue-400" />
            <KpiCard label="Total Revenue" value={formatCurrency(kpis.totalRevenue, cur)} icon={<DollarSign className="h-4 w-4" />} accent="text-emerald-400" />
            <KpiCard label="Total Costs" value={formatCurrency(kpis.totalCost, cur)} icon={<TrendingDown className="h-4 w-4" />} accent="text-orange-400" />
            <KpiCard label="Net Profit" value={formatCurrency(kpis.netProfit, cur)} icon={<TrendingUp className="h-4 w-4" />} accent={kpis.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} highlight={kpis.netProfit >= 0 ? "ring-emerald-500/20 bg-emerald-500/5" : "ring-red-500/20 bg-red-500/5"} />
            <KpiCard label="Avg Margin" value={`${kpis.avgMargin.toFixed(1)}%`} icon={<Percent className="h-4 w-4" />} accent={marginClass(kpis.avgMargin, settings)} />
            <KpiCard label="In Transit" value={kpis.inTransit.toString()} sub={kpis.unassigned > 0 ? `${kpis.unassigned} unassigned` : undefined} icon={<Truck className="h-4 w-4" />} accent="text-amber-400" />
          </div>

          {/* Filters - Stacked on mobile */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-3.5 md:w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 md:h-8 pl-9 md:pl-8 text-sm md:text-xs bg-card/50 border-border/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 md:h-8 flex-1 sm:w-[140px] text-sm md:text-xs bg-card/50 border-border/50">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {PIPELINE_COLUMNS.map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.carrierId}
                onValueChange={(v) => setFilters(f => ({ ...f, carrierId: v }))}
              >
                <SelectTrigger className="h-10 md:h-8 flex-1 sm:w-[160px] text-sm md:text-xs bg-card/50 border-border/50">
                  <SelectValue placeholder="All Carriers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Carriers</SelectItem>
                  {carriers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Advanced filters: customer / dispatcher / source / date
                  range. Carrier is intentionally HIDDEN inside the popover
                  because the toolbar already has a dedicated carrier
                  dropdown above and we don't want two controls fighting
                  over the same state. */}
              <OrdersAdvancedFilters
                value={filters}
                onChange={setFilters}
                customers={customers}
                carriers={carriers}
                users={adminUsers}
                hideCarrier
              />
            </div>
            <div className="hidden md:block ml-auto text-[10px] text-muted-foreground/60">
              {visibleOrders.length === orders.length
                ? `${orders.length} orders`
                : `${visibleOrders.length} of ${orders.length} orders`}
              {" "}&middot; Profit in {cur}
            </div>
          </div>
          {/* Active-filters chip strip — one chip per non-default filter
              with a one-click remove affordance. Hidden entirely when
              nothing's active (the component returns null). */}
          <div className="mt-2">
            <OrdersFilterChips
              value={filters}
              onChange={setFilters}
              customers={customers}
              carriers={carriers}
              users={adminUsers}
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {view === "kanban" ? (
          <KanbanView
            grouped={grouped}
            settings={settings}
            selectedOrderId={selectedOrderId}
            onSelect={setSelectedOrderId}
            dragOrderId={dragOrderId}
            onDragStart={setDragOrderId}
            onDrop={handleDrop}
            cur={cur}
          />
        ) : (
          <div className="h-full flex flex-col">
            <TableView
              orders={pagedOrders}
              settings={settings}
              selectedOrderId={selectedOrderId}
              onSelect={setSelectedOrderId}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={toggleSort}
              cur={cur}
              onDelete={handleDeleteOrder}
              onOpen={(id) => router.push(`/admin/tms/orders/${id}`)}
              usersById={adminUsersById}
            />
            {/* Pagination control — only renders when paging is actually
                needed (>1 page). The text on the left states the visible
                range so the user knows where they are in the result set. */}
            {pageCount > 1 && (
              <div className="shrink-0 flex items-center justify-between gap-2 px-3 md:px-5 py-2 border-t border-border/30 bg-card/20">
                <div className="text-[10px] text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedOrders.length)} of {sortedOrders.length}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <div className="px-2 text-[11px] tabular-nums">
                    Page <span className="font-semibold text-foreground">{page}</span> / {pageCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Detail Panel */}
      {selectedOrder && (
        <OrderBottomPanel
          order={selectedOrder}
          settings={settings}
          cur={cur}
          carriers={carriers}
          adminId={adminSession?.id}
          onClose={() => setSelectedOrderId(null)}
          onOrderUpdate={(orderId, updates) => {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
          }}
          onCarrierCreated={(carrier) => {
            setCarriers(prev => [...prev, carrier]);
          }}
          onChecklistUpdate={async (orderId, checklist) => {
            const supabase = createClient();
            const allItems = Object.values(checklist);
            const allChecked = allItems.every(v => v.checked);
            const anyChecked = allItems.some(v => v.checked);
            const docsReceived = (checklist as any).documents_received?.checked;
            let newStatus = selectedOrder.status;
            if (allChecked) newStatus = "fwd_completed";
            else if (docsReceived) newStatus = "fwd_documents_received";
            else if (anyChecked) newStatus = "fwd_documents_pending";
            else newStatus = "fwd_delivered";
            const updates: any = { forwarding_checklist: checklist, status: newStatus };
            await supabase.from("orders").update(updates).eq("id", orderId);
            if (newStatus !== selectedOrder.status) {
              await supabase.from("order_status_history").insert({
                order_id: orderId, from_status: selectedOrder.status, to_status: newStatus,
                changed_by_type: "admin", changed_by: adminSession?.id,
                notes: `Checklist updated by ${adminSession?.name || "Admin"}`,
              });
            }
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, forwarding_checklist: checklist, status: newStatus } : o));
          }}
        />
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────��────────────────
function KpiCard({ label, value, icon, accent, sub, highlight }: {
  label: string; value: string; icon: React.ReactNode; accent: string; sub?: string; highlight?: string;
}) {
  return (
    <div className={`rounded-lg border border-border/40 bg-card/40 backdrop-blur-sm px-3 md:px-4 py-2.5 md:py-3 min-w-[120px] md:min-w-0 shrink-0 md:shrink ${highlight ? `ring-1 ${highlight}` : ""}`}>
      <div className="flex items-center justify-between mb-0.5 md:mb-1">
        <span className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider font-medium whitespace-nowrap">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className={`text-base md:text-lg font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-[9px] md:text-[10px] text-amber-400/70 mt-0.5 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />{sub}</div>}
    </div>
  );
}

// ─── Kanban View ──────────────────────────────────────────
function KanbanView({ grouped, settings, selectedOrderId, onSelect, dragOrderId, onDragStart, onDrop, cur }: {
  grouped: Record<string, FwdOrder[]>; settings: ForwarderSettings; selectedOrderId: string | null;
  onSelect: (id: string | null) => void; dragOrderId: string | null; onDragStart: (id: string | null) => void;
  onDrop: (status: string) => void; cur: string;
}) {
  return (
    <div className="h-full overflow-x-auto px-2 md:px-4 py-2 md:py-4">
      <div className="flex gap-2 md:gap-3 h-full min-w-max">
        {PIPELINE_COLUMNS.map(col => {
          const colOrders = grouped[col.key] || [];
          const colRevenue = colOrders.reduce((s, o) => s + (calcProfit(o) || 0), 0);
          return (
            <div
              key={col.key}
              className={`flex flex-col w-[180px] md:w-[220px] shrink-0 rounded-xl border border-border/30 bg-card/20 backdrop-blur-sm transition-all ${
                dragOrderId ? "ring-1 ring-primary/10" : ""
              }`}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary/40"); }}
              onDragLeave={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40"); }}
              onDrop={e => { e.currentTarget.classList.remove("ring-2", "ring-primary/40"); onDrop(col.key); }}
            >
              {/* Column header */}
              <div className="px-3 py-2.5 border-b border-border/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                  <span className={`text-xs font-semibold ${col.textColor}`}>{col.label}</span>
                  <span className="text-[10px] text-muted-foreground/50 bg-muted-foreground/10 rounded-full px-1.5">{colOrders.length}</span>
                </div>
                <span className={`text-[10px] font-medium ${colRevenue >= 0 ? "text-emerald-400/60" : "text-red-400/60"}`}>
                  {formatCurrency(colRevenue, cur)}
                </span>
              </div>
              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-none">
                {colOrders.length === 0 && (
                  <div className="text-center py-8 text-[10px] text-muted-foreground/30">No orders</div>
                )}
                {colOrders.map(order => (
                  <KanbanCard
                    key={order.id}
                    order={order}
                    settings={settings}
                    isSelected={selectedOrderId === order.id}
                    onSelect={() => onSelect(selectedOrderId === order.id ? null : order.id)}
                    onDragStart={() => onDragStart(order.id)}
                    cur={cur}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────
function KanbanCard({ order, settings, isSelected, onSelect, onDragStart, cur }: {
  order: FwdOrder; settings: ForwarderSettings; isSelected: boolean;
  onSelect: () => void; onDragStart: () => void; cur: string;
}) {
  const route = getRoute(order);
  const profit = calcProfit(order);
  const margin = calcMargin(order);

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onClick={onSelect}
      className={`group rounded-lg border bg-card/60 backdrop-blur-sm p-3 cursor-pointer transition-all hover:bg-card/80 hover:shadow-md hover:shadow-black/10 ${
        isSelected ? "ring-2 ring-primary/50 border-primary/30 bg-card/80" : "border-border/30"
      }`}
    >
{/* Top row: ref + profit */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-foreground font-mono">{order.reference_number}</span>
                  {order.commercial_role === "subcontract_order" && (
                    <Badge variant="outline" className="text-[8px] bg-orange-500/10 text-orange-400 border-orange-500/20">SUB</Badge>
                  )}
                </div>
        {profit != null && (
          <span className={`text-[11px] font-bold ${marginClass(margin, settings)}`}>
            {profit >= 0 ? "+" : ""}{formatCurrency(profit, cur)}
          </span>
        )}
      </div>

      {/* Route */}
      {route && (
        <div className="flex items-center gap-1.5 mb-2">
          <CountryFlag country={route.origin.country} className="w-3.5 h-2.5" />
          <span className="text-[10px] font-medium truncate">{route.origin.city}</span>
          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
          <CountryFlag country={route.dest.country} className="w-3.5 h-2.5" />
          <span className="text-[10px] font-medium truncate">{route.dest.city}</span>
        </div>
      )}

      {/* Margin bar */}
      <div className="h-1 rounded-full bg-muted-foreground/10 mb-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${profitBgClass(margin, settings)}`}
          style={{ width: `${Math.min(Math.max(margin || 0, 0), 100)}%` }}
        />
      </div>

      {/* Checklist progress for post-delivery forwarding orders */}
      {["fwd_delivered", "fwd_documents_pending", "fwd_documents_received", "fwd_completed"].includes(order.status) && order.forwarding_checklist && (() => {
        const cl = order.forwarding_checklist;
        const checked = Object.values(cl).filter(v => v.checked).length;
        const total = Object.keys(cl).length;
        return (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex-1 h-1 rounded-full bg-muted-foreground/10 overflow-hidden">
              <div className={`h-full rounded-full ${checked === total ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${(checked / total) * 100}%` }} />
            </div>
            <span className={`text-[8px] font-bold ${checked === total ? "text-green-400" : "text-amber-400"}`}>{checked}/{total}</span>
          </div>
        );
      })()}

      {/* Bottom info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Building2 className="h-2.5 w-2.5" />
            <span className="truncate max-w-[70px]">{order.customer?.name || "-"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {order.carrier ? (
            <span className="text-indigo-400 truncate max-w-[70px]">{order.carrier.name}</span>
          ) : (
            <span className="text-red-400/70">No carrier</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] text-muted-foreground/50">{getDateRange(order)}</span>
        {order.pallet_count && <span className="text-[9px] text-muted-foreground/50">{order.pallet_count}p{order.weight_kg ? ` ${(order.weight_kg / 1000).toFixed(1)}t` : ""}</span>}
        {margin != null && <span className={`text-[9px] font-semibold ${marginClass(margin, settings)}`}>{margin.toFixed(1)}%</span>}
      </div>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────
function TableView({ orders, settings, selectedOrderId, onSelect, sortCol, sortDir, onSort, cur, onDelete, onOpen, usersById }: {
  orders: FwdOrder[]; settings: ForwarderSettings; selectedOrderId: string | null;
  onSelect: (id: string | null) => void; sortCol: string; sortDir: string; onSort: (col: string) => void; cur: string;
  onDelete: (id: string, ref: string) => void;
  // Called when the user clicks the body of a row — navigates to the
  // FWD order detail page in the same window. The dropdown menu stops
  // propagation so it still works without firing this handler.
  onOpen: (id: string) => void;
  // Lookup from `users.id` → display name. Pre-computed once at the
  // page level so each row render is just a Map.get().
  usersById: Map<string, AdminUser>;
}) {
  function SortHeader({ col, label, className = "" }: { col: string; label: string; className?: string }) {
    return (
      <th className={`px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none ${className}`} onClick={() => onSort(col)}>
        <span className="flex items-center gap-1">
          {label}
          {sortCol === col && <ArrowUpDown className="h-2.5 w-2.5 text-primary" />}
        </span>
      </th>
    );
  }

  return (
    <div className="h-full overflow-auto px-2 md:px-4 py-2 md:py-3">
      <div className="rounded-xl border border-border/30 bg-card/20 backdrop-blur-sm overflow-x-auto">
        <table className="w-full min-w-[1140px]">
          <thead>
            <tr className="border-b border-border/30">
              <SortHeader col="reference_number" label="Reference" />
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <SortHeader col="customer" label="Customer" />
              <SortHeader col="customer_reference" label="Cust. Ref" />
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Route</th>
              <SortHeader col="carrier" label="Carrier" />
              <SortHeader col="customer_price" label="Revenue" className="text-right" />
              <SortHeader col="carrier_cost" label="Cost" className="text-right" />
              <SortHeader col="profit" label="Profit" className="text-right" />
              <SortHeader col="margin" label="Margin" className="text-right" />
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cargo</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Dates</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Added</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => {
              const route = getRoute(order);
              const profit = calcProfit(order);
              const margin = calcMargin(order);
              const isSelected = selectedOrderId === order.id;
              const sc = FWD_STATUS_CONFIG[order.status] || FWD_STATUS_CONFIG.fwd_unassigned;
              return (
                <tr
                  key={order.id}
                  onClick={() => onOpen(order.id)}
                  className={`border-b border-border/10 cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-card/40"}`}
                >
<td className="px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold font-mono">{order.reference_number}</span>
                    {order.commercial_role === "subcontract_order" && (
                      <Badge variant="outline" className="text-[8px] bg-orange-500/10 text-orange-400 border-orange-500/20">SUB</Badge>
                    )}
                  </div>
                  {order.parent_order && (
                    <span className="text-[9px] text-muted-foreground">
                      Parent: {order.parent_order.reference_number}
                    </span>
                  )}
                </div>
              </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[9px] ${sc.color}`}>{sc.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">{order.customer?.name || "-"}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                    {order.customer_reference || <span className="text-muted-foreground/40">-</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {route && (
                      <div className="flex items-center gap-1">
                        <CountryFlag country={route.origin.country} className="w-3.5 h-2.5" />
                        <span className="text-[10px]">{route.origin.city}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30" />
                        <CountryFlag country={route.dest.country} className="w-3.5 h-2.5" />
                        <span className="text-[10px]">{route.dest.city}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {order.carrier ? (
                      <span className="text-xs text-indigo-400">{order.carrier.name}</span>
                    ) : (
                      <span className="text-xs text-red-400/60">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium">{formatCurrency(order.customer_price, order.customer_currency || cur)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{formatCurrency(order.carrier_cost, order.carrier_currency || cur)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-bold ${marginClass(margin, settings)}`}>{profit != null ? formatCurrency(profit, cur) : "-"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-semibold ${marginClass(margin, settings)}`}>{margin != null ? `${margin.toFixed(1)}%` : "-"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-muted-foreground">
                    {order.pallet_count || 0}p {order.weight_kg ? `${(order.weight_kg / 1000).toFixed(1)}t` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-muted-foreground">{getDateRange(order)}</td>
                  <td className="px-3 py-2.5">
                    {/* "Added" column — created date + dispatcher name +
                        source pill. We render two rows so the dispatcher
                        name + source pill share a line even on narrower
                        widths. */}
                    <div className="flex flex-col gap-0.5 text-[10px]">
                      <span className="text-foreground tabular-nums">
                        {new Date(order.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground truncate max-w-[100px]">
                          {order.created_by ? (usersById.get(order.created_by)?.name ?? "—") : <span className="italic">system</span>}
                        </span>
                        <SourceBadge source={order.created_from} />
                      </div>
                    </div>
                  </td>
                  {/* stopPropagation on the actions cell so clicking the
                      dropdown trigger / menu items does not also trigger
                      the row navigation handler. */}
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3 w-3" /></Button>
                      </DropdownMenuTrigger>
<DropdownMenuContent align="end" className="w-[160px]">
<DropdownMenuItem onClick={() => window.open(`/admin/tms/orders/${order.id}`, "_blank")} className="text-xs">
<ExternalLink className="h-3 w-3 mr-2" />Open in new tab
</DropdownMenuItem>
<DropdownMenuItem className="text-xs" onClick={() => navigator.clipboard.writeText(order.reference_number)}>
<Copy className="h-3 w-3 mr-2" />Copy Ref
</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem 
  className="text-xs text-destructive focus:text-destructive" 
  onSelect={(e) => {
    console.log("[v0] DropdownMenu Delete onSelect fired", { id: order.id, ref: order.reference_number });
    e.preventDefault();
    onDelete(order.id, order.reference_number);
  }}
>
<Trash2 className="h-3 w-3 mr-2" />Delete
</DropdownMenuItem>
</DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && !false && (
              <tr><td colSpan={14} className="px-4 py-12 text-center text-sm text-muted-foreground/50">No forwarding orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Bottom Detail Panel ─────────────���────────────────────
function OrderBottomPanel({ order, settings, cur, onClose, onChecklistUpdate, carriers, adminId, onOrderUpdate, onCarrierCreated }: {
  order: FwdOrder; settings: ForwarderSettings; cur: string; onClose: () => void;
  onChecklistUpdate: (orderId: string, checklist: ForwardingChecklist) => void;
  carriers: { id: string; name: string }[];
  adminId: string | undefined;
  onOrderUpdate: (orderId: string, updates: Partial<FwdOrder>) => void;
  onCarrierCreated: (carrier: { id: string; name: string }) => void;
}) {
  const route = getRoute(order);
  const profit = calcProfit(order);
  const margin = calcMargin(order);
  const sc = FWD_STATUS_CONFIG[order.status] || FWD_STATUS_CONFIG.fwd_unassigned;
  const checklist = order.forwarding_checklist || DEFAULT_CHECKLIST;
  const checklistEntries = Object.entries(checklist).filter(([key]) => key in CHECKLIST_LABELS) as [keyof ForwardingChecklist, ChecklistItem][];
  const checkedCount = checklistEntries.filter(([, v]) => v.checked).length;
  const totalCount = checklistEntries.length;
  const showChecklist = ["fwd_delivered", "fwd_documents_pending", "fwd_documents_received", "fwd_completed"].includes(order.status);
  
  // Local state for carrier editing
  const [editingCarrier, setEditingCarrier] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState(order.carrier?.id || "__none__");
  const [carrierCost, setCarrierCost] = useState(order.carrier_cost?.toString() || "0");
  const [carrierCurrency, setCarrierCurrency] = useState(order.carrier_currency || "EUR");
  const [saving, setSaving] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  const toggleChecklistItem = (key: keyof ForwardingChecklist) => {
    const updated = { ...checklist, [key]: { ...checklist[key], checked: !checklist[key].checked, date: !checklist[key].checked ? new Date().toISOString().slice(0, 10) : null } };
    onChecklistUpdate(order.id, updated);
  };
  
  // Save carrier assignment
  const saveCarrier = async () => {
    if (!adminId) return;
    setSaving(true);
    const supabase = createClient();
    const cost = parseFloat(carrierCost) || 0;
    const customerPrice = order.customer_price || 0;
    const newMargin = customerPrice > 0 ? ((customerPrice - cost) / customerPrice) * 100 : null;
    
    const { error } = await supabase.from("orders").update({
      carrier_id: selectedCarrierId && selectedCarrierId !== "__none__" ? selectedCarrierId : null,
      carrier_cost: cost,
      carrier_currency: carrierCurrency,
      margin: newMargin,
          status: selectedCarrierId && selectedCarrierId !== "__none__" && order.status === "fwd_unassigned" ? "fwd_assigned_to_carrier" : order.status,
    }).eq("id", order.id);
    
    if (!error) {
      const selectedCarrier = carriers.find(c => c.id === selectedCarrierId);
      onOrderUpdate(order.id, {
        carrier: selectedCarrierId && selectedCarrierId !== "__none__" ? { id: selectedCarrierId, name: selectedCarrier?.name || "" } : null,
        carrier_cost: cost,
        carrier_currency: carrierCurrency,
        margin: newMargin,
            status: selectedCarrierId && selectedCarrierId !== "__none__" && order.status === "fwd_unassigned" ? "fwd_assigned_to_carrier" : order.status,
      });
      setEditingCarrier(false);
    }
    setSaving(false);
  };

  return (
    <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm animate-in slide-in-from-bottom-2 shrink-0">
      {/* Mobile: Stacked layout, Desktop: Single row */}
      <div className="px-3 md:px-6 py-2 md:py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
        {/* Order info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold font-mono">{order.reference_number}</span>
            <Badge variant="outline" className={`text-[9px] ${sc.color}`}>{sc.label}</Badge>
            <span className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[120px] md:max-w-none">by {order.customer?.name || "-"}</span>
            {showChecklist && (
              <Badge variant="outline" className={`text-[9px] ${checkedCount === totalCount ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                {checkedCount}/{totalCount} steps
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-muted-foreground flex-wrap">
            {route && (
              <span className="flex items-center gap-1">
                <CountryFlag country={route.origin.country} className="w-3.5 h-2.5" />
                <span className="hidden sm:inline">{route.origin.city}</span>
                <ArrowRight className="h-2.5 w-2.5 opacity-40" />
                <CountryFlag country={route.dest.country} className="w-3.5 h-2.5" />
                <span className="hidden sm:inline">{route.dest.city}</span>
              </span>
            )}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{getDateRange(order)}</span>
            {order.pallet_count && <span>{order.pallet_count}p {order.weight_kg ? `${(order.weight_kg / 1000).toFixed(1)}t` : ""}</span>}
          </div>
        </div>

        {/* Mobile: Financials grid */}
        <div className="flex md:hidden flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-border/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground uppercase">Carrier:</span>
            <button onClick={() => setEditingCarrier(true)} className="text-[10px] font-medium text-indigo-400 hover:underline">
              {order.carrier?.name || <span className="text-red-400">Unassigned</span>}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground uppercase">Revenue:</span>
            <span className="text-[10px] font-medium text-emerald-400">{formatCurrency(order.customer_price, order.customer_currency || cur)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground uppercase">Cost:</span>
            <span className="text-[10px] font-medium">{formatCurrency(order.carrier_cost, order.carrier_currency || cur)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground uppercase">Profit:</span>
            <span className={`text-[10px] font-bold ${marginClass(margin, settings)}`}>{profit != null ? formatCurrency(profit, cur) : "-"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground uppercase">Margin:</span>
            <span className={`text-[10px] font-bold ${marginClass(margin, settings)}`}>{margin != null ? `${margin.toFixed(1)}%` : "-"}</span>
          </div>
        </div>

        {/* Desktop: Carrier - Editable */}
        <div className="hidden md:block shrink-0">
          {editingCarrier ? (
            <div className="flex items-end gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Carrier</div>
                <div className="flex items-center gap-1">
                  <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
                    <SelectTrigger className="h-8 w-[160px] text-xs bg-card/50 border-border/50">
                      <SelectValue placeholder="Select carrier..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No carrier</SelectItem>
                      {carriers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 bg-card/50 border-border/50 hover:bg-primary/20 hover:border-primary/50"
                    title="Create new carrier"
                    onClick={() => setShowQuickCreate(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Carrier Cost</div>
                <Input
                  type="number"
                  value={carrierCost}
                  onChange={(e) => setCarrierCost(e.target.value)}
                  className="h-8 w-[100px] text-xs bg-card/50 border-border/50"
                  placeholder="0.00"
                />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Currency</div>
                <Select value={carrierCurrency} onValueChange={setCarrierCurrency}>
                  <SelectTrigger className="h-8 w-[80px] text-xs bg-card/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="RON">RON</SelectItem>
                    <SelectItem value="HUF">HUF</SelectItem>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="CZK">CZK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={saveCarrier} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditingCarrier(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditingCarrier(true)}
              className="text-left hover:bg-card/30 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors group"
            >
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                Carrier
                <span className="opacity-0 group-hover:opacity-100 text-primary text-[8px] font-normal normal-case">(click to edit)</span>
              </div>
              <div className="text-xs font-medium">
                {order.carrier ? (
                  <span className="text-indigo-400">{order.carrier.name}</span>
                ) : (
                  <span className="text-red-400">Unassigned</span>
                )}
              </div>
            </button>
          )}
        </div>

        {/* Desktop: Financials */}
        <div className="hidden md:flex shrink-0 items-center gap-4">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Revenue</div>
            <div className="text-xs font-medium">{formatCurrency(order.customer_price, order.customer_currency || cur)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Cost</div>
            <div className="text-xs font-medium text-muted-foreground">{formatCurrency(order.carrier_cost, order.carrier_currency || cur)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Profit</div>
            <div className={`text-sm font-bold ${marginClass(margin, settings)}`}>{profit != null ? formatCurrency(profit, cur) : "-"}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Margin</div>
            <div className={`text-sm font-bold ${marginClass(margin, settings)}`}>{margin != null ? `${margin.toFixed(1)}%` : "-"}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5 md:gap-2 ml-auto md:ml-0">
          <Button variant="outline" size="sm" className="h-8 md:h-7 text-xs px-2 md:px-3" onClick={() => window.open(`/admin/tms/orders/${order.id}`, "_blank")}>
            <ExternalLink className="h-3 w-3 md:mr-1" /><span className="hidden md:inline">Open</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={onClose}>
            <XCircle className="h-4 w-4 md:h-3.5 md:w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mobile: Carrier Edit Modal */}
      {editingCarrier && (
        <div className="md:hidden border-t border-border/30 px-3 py-2 bg-card/30">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
                  <SelectTrigger className="h-10 text-xs bg-card/50 border-border/50">
                    <SelectValue placeholder="Select carrier..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No carrier</SelectItem>
                    {carriers.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => setShowQuickCreate(true)}>
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input type="number" value={carrierCost} onChange={(e) => setCarrierCost(e.target.value)} className="h-10 flex-1 text-xs" placeholder="Cost" />
              <Select value={carrierCurrency} onValueChange={setCarrierCurrency}>
                <SelectTrigger className="h-10 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["EUR", "USD", "GBP", "RON", "HUF", "PLN", "CZK"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-10 flex-1 text-xs" onClick={saveCarrier} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => setEditingCarrier(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Stops timeline */}
      {order.stops.length > 0 && (
        <div className="border-t border-border/30 px-3 md:px-6 py-2">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
            {order.stops.map((stop, i) => (
              <React.Fragment key={stop.id}>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card/30 shrink-0">
                  <CircleDot className={`h-3 w-3 ${stop.stop_type === "pickup" ? "text-blue-400" : stop.stop_type === "delivery" ? "text-emerald-400" : "text-muted-foreground"}`} />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <CountryFlag country={stop.country || ""} className="w-3 h-2" />
                      <span className="text-[10px] font-medium">{stop.city || "?"}</span>
                    </div>
                    <span className="text-[8px] text-muted-foreground/50">{stop.stop_type} {stop.planned_date ? `- ${stop.planned_date.slice(5)}` : ""}</span>
                  </div>
                </div>
                {i < order.stops.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/20 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Post-Delivery Checklist */}
      {showChecklist && (
        <div className="border-t border-border/30 px-3 md:px-6 py-2 md:py-3">
          <div className="flex items-center gap-2 md:gap-3 mb-2">
            <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Post-Delivery Checklist</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted-foreground/10 overflow-hidden max-w-[120px] md:max-w-[200px]">
              <div className={`h-full rounded-full transition-all ${checkedCount === totalCount ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${(checkedCount / totalCount) * 100}%` }} />
            </div>
            <span className={`text-[9px] md:text-[10px] font-bold ${checkedCount === totalCount ? "text-green-400" : "text-amber-400"}`}>{checkedCount}/{totalCount}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 md:gap-2">
            {checklistEntries.map(([key, item]) => {
              const meta = CHECKLIST_LABELS[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleChecklistItem(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left ${
                    item.checked
                      ? "bg-green-500/5 border-green-500/30 hover:bg-green-500/10"
                      : "bg-card/20 border-border/30 hover:bg-card/40"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    item.checked ? "bg-green-500 border-green-500" : "border-muted-foreground/30"
                  }`}>
                    {item.checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[10px] font-medium ${item.checked ? "text-green-400" : "text-foreground"}`}>{meta.label}</div>
                    {item.checked && item.date && <div className="text-[8px] text-muted-foreground/50">{item.date}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Quick Create Carrier Dialog */}
      {adminId && (
        <QuickCreatePartnerDialog
          open={showQuickCreate}
          onOpenChange={setShowQuickCreate}
          adminId={adminId}
          defaultType="carrier"
          onCreated={(partner) => {
            onCarrierCreated({ id: partner.id, name: partner.name });
            setSelectedCarrierId(partner.id);
          }}
        />
      )}
    </div>
  );
}
