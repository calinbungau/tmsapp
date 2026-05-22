"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Truck,
  Wallet,
  Receipt,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Layers,
  Fuel,
  Coins,
  User,
  Package,
  AlertTriangle,
} from "lucide-react";

/* ------------------------- types ------------------------- */

type OrderSummary = {
  order_id: string;
  reference_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_reference: string | null;
  status: string | null;
  customer_price_eur: number;
  subcontracted_cost_eur: number;
  internal_revenue_eur: number;
  internal_legs: number;
  subcontracted_legs: number;
  has_subcontract_children: boolean;
  cargo_description: string | null;
  weight_kg: number | null;
  pallet_count: number | null;
};

type LegSummary = {
  leg_id: string;
  leg_number: number | null;
  assignment_type: string | null;
  origin: string | null;
  destination: string | null;
  status: string | null;
  order_id: string | null;
  order_ref: string | null;
};

type Row = {
  trip_id: string;
  reference_number: string | null;
  status: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  trailer_id: string | null;
  trailer_label: string | null;
  driver_id: string | null;
  driver_name: string | null;
  distance_km: number;
  duration_hours: number;
  revenue_eur: number;
  actual_cost_eur: number;
  planned_cost_eur: number | null;
  profit_eur: number;
  margin_pct: number | null;
  cost_per_km: number | null;
  revenue_per_km: number | null;
  profit_per_km: number | null;
  cost_fuel_eur: number;
  cost_toll_eur: number;
  cost_driver_eur: number;
  cost_other_eur: number;
  is_mixed: boolean;
  internal_leg_count: number;
  subcontract_leg_count: number;
  order_count: number;
  orders: OrderSummary[];
  legs: LegSummary[];
};

const fetcher = (u: string) => fetch(u).then(r => r.json());

const eur = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-EU", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(n);

const eur2 = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-EU", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }).format(n);

const fmtKm = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString()} km`;

const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

/* ------------------------- page ------------------------- */

export default function InternalFleetPnLPage() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [from, setFrom] = React.useState<string>(startOfMonth);
  const [to, setTo] = React.useState<string>(todayStr);
  const [search, setSearch] = React.useState<string>("");
  const [vehicleFilter, setVehicleFilter] = React.useState<string>("all");
  const [driverFilter, setDriverFilter] = React.useState<string>("all");
  const [marginFilter, setMarginFilter] = React.useState<string>("all"); // all|profit|loss|low
  const [showPlanned, setShowPlanned] = React.useState<boolean>(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(25);

  const { session } = useAdminSession();
  const adminId = session?.id;
  const url = adminId
    ? `/api/admin/finance/reports/internal-fleet-pnl?admin_id=${adminId}&from=${from}&to=${to}&planned=${showPlanned ? 1 : 0}`
    : null;
  const { data, isLoading } = useSWR<{ items: Row[] }>(url, fetcher);

  const allRows = data?.items ?? [];

  /* filter options */
  const vehicleOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) {
      if (r.vehicle_id) m.set(r.vehicle_id, r.vehicle_label || r.vehicle_id);
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const driverOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) {
      if (r.driver_id) m.set(r.driver_id, r.driver_name || r.driver_id);
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (vehicleFilter !== "all" && r.vehicle_id !== vehicleFilter) return false;
      if (driverFilter !== "all" && r.driver_id !== driverFilter) return false;
      if (marginFilter === "profit" && r.profit_eur <= 0) return false;
      if (marginFilter === "loss" && r.profit_eur >= 0) return false;
      if (
        marginFilter === "low" &&
        !(r.margin_pct != null && r.margin_pct >= 0 && r.margin_pct < 5)
      )
        return false;
      if (q) {
        const hay = [
          r.reference_number,
          r.vehicle_label,
          r.trailer_label,
          r.driver_name,
          ...r.orders.map(o => o.reference_number || ""),
          ...r.orders.map(o => o.customer_name || ""),
          ...r.legs.map(l => `${l.origin || ""} ${l.destination || ""}`),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, search, vehicleFilter, driverFilter, marginFilter]);

  /* totals (over filtered set) */
  const totals = React.useMemo(() => {
    let revenue = 0,
      actual = 0,
      planned = 0,
      plannedHas = false,
      profit = 0,
      km = 0,
      tripCount = 0,
      mixed = 0,
      lossCount = 0;
    for (const r of filteredRows) {
      revenue += r.revenue_eur;
      actual += r.actual_cost_eur;
      profit += r.profit_eur;
      km += r.distance_km || 0;
      if (r.planned_cost_eur != null) {
        planned += r.planned_cost_eur;
        plannedHas = true;
      }
      tripCount += 1;
      if (r.is_mixed) mixed += 1;
      if (r.profit_eur < 0) lossCount += 1;
    }
    return {
      revenue,
      actual,
      planned: plannedHas ? planned : null,
      profit,
      km,
      tripCount,
      mixed,
      lossCount,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
      eurPerKm: km > 0 ? actual / km : null,
    };
  }, [filteredRows]);

  /* pagination */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function toggle(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin/finance/reports">
              <Button variant="outline" size="icon" aria-label="Back to reports">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Truck className="h-6 w-6" />
                Internal Fleet P&amp;L
              </h1>
              <p className="text-sm text-muted-foreground">
                One row per trip. Revenue allocated to internal legs (customer
                price minus subcontracted cost). Costs from cost_entries and
                trip_expenses, EUR ex VAT.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Vehicle</Label>
                <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All vehicles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vehicles</SelectItem>
                    {vehicleOptions.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Driver</Label>
                <Select value={driverFilter} onValueChange={setDriverFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All drivers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All drivers</SelectItem>
                    {driverOptions.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Margin</Label>
                <Select value={marginFilter} onValueChange={setMarginFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All trips</SelectItem>
                    <SelectItem value="profit">Profitable only</SelectItem>
                    <SelectItem value="loss">Loss-making only</SelectItem>
                    <SelectItem value="low">Margin &lt; 5%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="search"
                    className="pl-8"
                    placeholder="Trip ref, plate, driver, route…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <Button
                variant={showPlanned ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPlanned(p => !p)}
              >
                {showPlanned ? "Hide planned cost" : "Show planned cost"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Planned cost is pro-rated from active vehicle budgets that
                overlap the trip period.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Trips"
            value={totals.tripCount.toLocaleString()}
            icon={<Layers className="h-4 w-4" />}
            sub={
              totals.mixed
                ? `${totals.mixed} mixed`
                : totals.lossCount
                ? `${totals.lossCount} at loss`
                : "All internal"
            }
          />
          <KpiCard
            label="Revenue"
            value={eur(totals.revenue)}
            icon={<Wallet className="h-4 w-4" />}
            tone="primary"
          />
          <KpiCard
            label="Actual cost"
            value={eur(totals.actual)}
            icon={<Receipt className="h-4 w-4" />}
            sub={
              totals.eurPerKm != null
                ? `${totals.eurPerKm.toFixed(2)} €/km`
                : undefined
            }
          />
          {showPlanned && (
            <KpiCard
              label="Planned cost"
              value={totals.planned == null ? "—" : eur(totals.planned)}
              icon={<Coins className="h-4 w-4" />}
              sub={
                totals.planned != null
                  ? `Δ ${eur(totals.actual - totals.planned)}`
                  : "no budgets"
              }
              tone={
                totals.planned != null && totals.actual > totals.planned
                  ? "danger"
                  : "muted"
              }
            />
          )}
          <KpiCard
            label="Profit"
            value={eur(totals.profit)}
            icon={
              totals.profit >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )
            }
            tone={totals.profit >= 0 ? "success" : "danger"}
          />
          <KpiCard
            label="Margin"
            value={fmtPct(totals.marginPct)}
            icon={<TrendingUp className="h-4 w-4" />}
            sub={fmtKm(totals.km)}
            tone={
              totals.marginPct == null
                ? "muted"
                : totals.marginPct < 0
                ? "danger"
                : totals.marginPct < 5
                ? "warning"
                : "success"
            }
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              Trips ({filteredRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-8" />
                  <th className="text-left px-3 py-2">Trip</th>
                  <th className="text-left px-3 py-2">Vehicle / Driver</th>
                  <th className="text-left px-3 py-2">Period</th>
                  <th className="text-right px-3 py-2">Distance</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                  <th className="text-right px-3 py-2">Actual cost</th>
                  {showPlanned && (
                    <th className="text-right px-3 py-2">Planned</th>
                  )}
                  <th className="text-right px-3 py-2">Profit</th>
                  <th className="text-right px-3 py-2">Margin</th>
                  <th className="text-right px-3 py-2">€/km</th>
                  <th className="text-left px-3 py-2">Mix</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td
                      colSpan={showPlanned ? 12 : 11}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && pageRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={showPlanned ? 12 : 11}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No internal trips match your filters.
                    </td>
                  </tr>
                )}
                {pageRows.map(r => {
                  const isOpen = expanded.has(r.trip_id);
                  const tone =
                    r.profit_eur < 0
                      ? "text-destructive"
                      : r.margin_pct != null && r.margin_pct < 5
                      ? "text-amber-600"
                      : "text-emerald-600";
                  const plannedDelta =
                    r.planned_cost_eur != null
                      ? r.actual_cost_eur - r.planned_cost_eur
                      : null;
                  return (
                    <React.Fragment key={r.trip_id}>
                      <tr
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggle(r.trip_id)}
                      >
                        <td className="px-3 py-2 align-middle">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {r.reference_number || r.trip_id.slice(0, 8)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.order_count} order{r.order_count === 1 ? "" : "s"}
                            {" · "}
                            {r.internal_leg_count} internal leg
                            {r.internal_leg_count === 1 ? "" : "s"}
                            {r.subcontract_leg_count > 0 &&
                              ` · ${r.subcontract_leg_count} sub`}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {r.vehicle_label || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.driver_name || "—"}
                            {r.trailer_label ? ` · ${r.trailer_label}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div>{fmtDate(r.actual_start || r.planned_start)}</div>
                          <div className="text-xs text-muted-foreground">
                            → {fmtDate(r.actual_end || r.planned_end)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {fmtKm(r.distance_km)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {eur(r.revenue_eur)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {eur(r.actual_cost_eur)}
                        </td>
                        {showPlanned && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {r.planned_cost_eur == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={
                                      plannedDelta != null && plannedDelta > 0
                                        ? "text-destructive"
                                        : "text-emerald-600"
                                    }
                                  >
                                    {eur(r.planned_cost_eur)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    Δ vs actual: {eur(plannedDelta)}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </td>
                        )}
                        <td
                          className={`px-3 py-2 text-right whitespace-nowrap font-medium ${tone}`}
                        >
                          {eur(r.profit_eur)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right whitespace-nowrap ${tone}`}
                        >
                          {fmtPct(r.margin_pct)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-xs text-muted-foreground">
                          {r.cost_per_km != null
                            ? `${r.cost_per_km.toFixed(2)} €/km`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {r.is_mixed ? (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-700 border-amber-200"
                            >
                              Mixed
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              Internal
                            </Badge>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-muted/20 border-t">
                          <td colSpan={showPlanned ? 12 : 11} className="p-4">
                            <TripDetail row={r} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>

          {/* Pagination */}
          {filteredRows.length > pageSize && (
            <div className="flex items-center justify-between p-3 border-t flex-wrap gap-2">
              <div className="text-xs text-muted-foreground">
                Page {safePage} of {totalPages} · {filteredRows.length} trips
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={v => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 250].map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------- pieces ------------------------- */

function KpiCard({
  label,
  value,
  icon,
  sub,
  tone = "muted",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  sub?: string;
  tone?: "primary" | "success" | "danger" | "warning" | "muted";
}) {
  const toneCls: Record<string, string> = {
    primary: "text-foreground",
    success: "text-emerald-600",
    danger: "text-destructive",
    warning: "text-amber-600",
    muted: "text-foreground",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={`text-xl font-semibold mt-1 ${toneCls[tone]}`}>
          {value}
        </div>
        {sub && (
          <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

function TripDetail({ row }: { row: Row }) {
  return (
    <div className="space-y-4">
      {/* Cost breakdown bar */}
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5" />
          Cost composition
        </div>
        <CostBars row={row} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <CostStat
            icon={<Fuel className="h-3.5 w-3.5" />}
            label="Fuel"
            value={row.cost_fuel_eur}
            total={row.actual_cost_eur}
          />
          <CostStat
            icon={<Coins className="h-3.5 w-3.5" />}
            label="Tolls"
            value={row.cost_toll_eur}
            total={row.actual_cost_eur}
          />
          <CostStat
            icon={<User className="h-3.5 w-3.5" />}
            label="Driver"
            value={row.cost_driver_eur}
            total={row.actual_cost_eur}
          />
          <CostStat
            icon={<Package className="h-3.5 w-3.5" />}
            label="Other"
            value={row.cost_other_eur}
            total={row.actual_cost_eur}
          />
        </div>
      </div>

      {/* Orders */}
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5" />
          Orders ({row.orders.length})
        </div>
        {row.orders.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No customer orders linked to this trip.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-1.5">Order</th>
                  <th className="text-left px-3 py-1.5">Customer</th>
                  <th className="text-left px-3 py-1.5">Cargo</th>
                  <th className="text-right px-3 py-1.5">Customer price</th>
                  <th className="text-right px-3 py-1.5">Subcontracted</th>
                  <th className="text-right px-3 py-1.5">Internal revenue</th>
                  <th className="text-left px-3 py-1.5">Legs</th>
                </tr>
              </thead>
              <tbody>
                {row.orders.map(o => (
                  <tr key={o.order_id} className="border-t">
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/admin/orders/${o.order_id}`}
                        className="font-medium hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {o.reference_number || o.order_id.slice(0, 8)}
                      </Link>
                      {o.customer_reference && (
                        <div className="text-xs text-muted-foreground">
                          ref: {o.customer_reference}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{o.customer_name || "—"}</td>
                    <td className="px-3 py-1.5 max-w-[260px] truncate">
                      {o.cargo_description || "—"}
                      {(o.weight_kg || o.pallet_count) && (
                        <div className="text-xs text-muted-foreground">
                          {o.weight_kg ? `${o.weight_kg} kg` : ""}
                          {o.weight_kg && o.pallet_count ? " · " : ""}
                          {o.pallet_count ? `${o.pallet_count} plt` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {eur2(o.customer_price_eur)}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap text-muted-foreground">
                      {o.subcontracted_cost_eur > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />−
                              {eur2(o.subcontracted_cost_eur)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              Sum of child sub-orders' carrier cost. Subtracted
                              from customer price to isolate the internal share.
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">
                      {eur2(o.internal_revenue_eur)}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 text-xs">
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          {o.internal_legs} int
                        </Badge>
                        {o.subcontracted_legs > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200"
                          >
                            {o.subcontracted_legs} sub
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legs */}
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Truck className="h-3.5 w-3.5" />
          Legs ({row.legs.length})
        </div>
        {row.legs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No legs recorded.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-1.5">#</th>
                  <th className="text-left px-3 py-1.5">Type</th>
                  <th className="text-left px-3 py-1.5">From</th>
                  <th className="text-left px-3 py-1.5">To</th>
                  <th className="text-left px-3 py-1.5">Order</th>
                  <th className="text-left px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {row.legs.map(l => {
                  const isInternal =
                    l.assignment_type === "internal" || !l.assignment_type;
                  return (
                    <tr key={l.leg_id} className="border-t">
                      <td className="px-3 py-1.5">{l.leg_number ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <Badge
                          variant="outline"
                          className={
                            isInternal
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }
                        >
                          {isInternal ? "Internal" : "Subcontract"}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 max-w-[220px] truncate">
                        {l.origin || "—"}
                      </td>
                      <td className="px-3 py-1.5 max-w-[220px] truncate">
                        {l.destination || "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {l.order_id ? (
                          <Link
                            href={`/admin/orders/${l.order_id}`}
                            className="hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            {l.order_ref || l.order_id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {l.status || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CostBars({ row }: { row: Row }) {
  const total = Math.max(1, row.actual_cost_eur);
  const segs = [
    { key: "fuel", v: row.cost_fuel_eur, cls: "bg-emerald-500" },
    { key: "toll", v: row.cost_toll_eur, cls: "bg-sky-500" },
    { key: "driver", v: row.cost_driver_eur, cls: "bg-amber-500" },
    { key: "other", v: row.cost_other_eur, cls: "bg-muted-foreground/40" },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded">
      {segs.map(s => (
        <div
          key={s.key}
          className={s.cls}
          style={{ width: `${(s.v / total) * 100}%` }}
          aria-label={`${s.key} ${eur(s.v)}`}
        />
      ))}
    </div>
  );
}

function CostStat({
  icon,
  label,
  value,
  total,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{eur2(value)}</div>
      </div>
      <div className="text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
    </div>
  );
}
