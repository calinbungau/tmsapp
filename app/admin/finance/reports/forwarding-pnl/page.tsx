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
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Truck,
  Building2,
  Wallet,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  FileType2,
  ChevronDown,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportPnlCsv,
  exportPnlExcel,
  exportPnlPdf,
} from "@/lib/exports/forwarding-pnl-export";

type Row = {
  order_id: string;
  reference_number: string | null;
  status: string | null;
  order_type: string | null;
  commercial_role: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  revenue_amount: number;
  revenue_currency: string;
  revenue_eur: number;
  cost_total_eur: number;
  cost_internal_eur: number;
  cost_subcontract_eur: number;
  cost_other_eur: number;
  profit_eur: number;
  margin_pct: number | null;
  execution_mode: "internal" | "subcontracted" | "mixed" | "unassigned";
  legs_total: number;
  legs_internal: number;
  legs_subcontract: number;
  child_subcontract_count: number;
  customer_invoice_status:
    | "none"
    | "draft"
    | "issued"
    | "paid"
    | "partial"
    | "overdue";
  customer_invoiced_eur: number;
  customer_paid_eur: number;
  customer_outstanding_eur: number;
  carrier_invoice_status:
    | "none"
    | "fully_invoiced"
    | "partial_paid"
    | "fully_paid";
  carrier_invoiced_eur: number;
  carrier_paid_eur: number;
  carrier_outstanding_eur: number;
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtMoney = (n: number, c = "EUR") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c || "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

function ExecutionBadge({ mode }: { mode: Row["execution_mode"] }) {
  const map: Record<Row["execution_mode"], { label: string; cls: string }> = {
    internal: {
      label: "Internal",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    },
    subcontracted: {
      label: "Subcontracted",
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    },
    mixed: {
      label: "Mixed",
      cls: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    },
    unassigned: {
      label: "Unassigned",
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const s = map[mode];
  return (
    <Badge variant="outline" className={s.cls}>
      {s.label}
    </Badge>
  );
}

function CustomerInvoiceBadge({
  status,
}: {
  status: Row["customer_invoice_status"];
}) {
  const map: Record<
    Row["customer_invoice_status"],
    { label: string; cls: string; Icon: typeof Clock }
  > = {
    none: {
      label: "Not Invoiced",
      cls: "bg-muted text-muted-foreground border-border",
      Icon: AlertCircle,
    },
    draft: {
      label: "Draft",
      cls: "bg-muted text-muted-foreground border-border",
      Icon: Clock,
    },
    issued: {
      label: "Issued",
      cls: "bg-blue-500/10 text-blue-600 border-blue-500/30",
      Icon: Receipt,
    },
    partial: {
      label: "Partial",
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      Icon: Clock,
    },
    paid: {
      label: "Paid",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
      Icon: CheckCircle2,
    },
    overdue: {
      label: "Overdue",
      cls: "bg-red-500/10 text-red-600 border-red-500/30",
      Icon: AlertCircle,
    },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge variant="outline" className={cls}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function CarrierInvoiceBadge({
  status,
}: {
  status: Row["carrier_invoice_status"];
}) {
  const map: Record<
    Row["carrier_invoice_status"],
    { label: string; cls: string }
  > = {
    none: {
      label: "No Carrier Inv.",
      cls: "bg-muted text-muted-foreground border-border",
    },
    fully_invoiced: {
      label: "Invoiced",
      cls: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    },
    partial_paid: {
      label: "Partially Paid",
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    },
    fully_paid: {
      label: "Paid",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

export default function ForwardingPnLPage() {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [from, setFrom] = React.useState<string>(startOfYear);
  const [to, setTo] = React.useState<string>(todayStr);
  const [execFilter, setExecFilter] = React.useState<string>("all");
  const [invFilter, setInvFilter] = React.useState<string>("all");

  const { session } = useAdminSession();
  const adminId = session?.id;
  const url = adminId
    ? `/api/admin/finance/reports/forwarding-pnl?admin_id=${adminId}&from=${from}&to=${to}`
    : null;
  const { data, isLoading, error } = useSWR<{ items: Row[] }>(url, fetcher);

  const rows = React.useMemo(() => {
    let items = data?.items ?? [];
    if (execFilter !== "all") {
      items = items.filter(r => r.execution_mode === execFilter);
    }
    if (invFilter !== "all") {
      items = items.filter(r => r.customer_invoice_status === invFilter);
    }
    return items;
  }, [data, execFilter, invFilter]);

  // Totals
  const totals = React.useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenue_eur || 0;
        acc.cost += r.cost_total_eur || 0;
        acc.profit += r.profit_eur || 0;
        acc.subcontract += r.cost_subcontract_eur || 0;
        acc.outstanding_in += r.customer_outstanding_eur || 0;
        acc.outstanding_out += r.carrier_outstanding_eur || 0;
        return acc;
      },
      {
        revenue: 0,
        cost: 0,
        profit: 0,
        subcontract: 0,
        outstanding_in: 0,
        outstanding_out: 0,
      },
    );
  }, [rows]);

  const avgMargin =
    totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const [exporting, setExporting] = React.useState<null | "csv" | "xlsx" | "pdf">(null);

  function buildExportContext() {
    return {
      from,
      to,
      rows: rows as any,
      totals: {
        revenue: totals.revenue,
        costs: totals.cost,
        profit: totals.profit,
        arOutstanding: totals.outstanding_in,
        apOutstanding: totals.outstanding_out,
        avgMargin,
        count: rows.length,
      },
      filters: { execution: execFilter, customerInvoice: invFilter },
    };
  }

  async function handleExport(kind: "csv" | "xlsx" | "pdf") {
    if (!rows.length) return;
    try {
      setExporting(kind);
      const ctx = buildExportContext();
      if (kind === "csv") exportPnlCsv(ctx);
      else if (kind === "xlsx") await exportPnlExcel(ctx);
      else await exportPnlPdf(ctx);
    } finally {
      setExporting(null);
    }
  }

  function exportCsv() {
    handleExport("csv");
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/finance/reports"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Reports
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-2">
            <Layers className="h-6 w-6" />
            Forwarding Orders P&amp;L
          </h1>
          <p className="text-sm text-muted-foreground">
            Per-parent-order revenue, costs, profit, execution mix and invoice
            status.
          </p>
        </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={!rows.length || !!exporting}
                className="relative gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/30 disabled:opacity-50 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-700 dark:disabled:to-slate-700"
              >
                {exporting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Exporting {exporting.toUpperCase()}...
                  </span>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-4 w-4 opacity-80" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-2">
              <DropdownMenuLabel className="px-2 pt-1 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Export report
                  </span>
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  >
                    {rows.length} orders
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={!!exporting}
                onClick={() => handleExport("pdf")}
                className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 focus:bg-rose-500/10"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm shadow-rose-500/30">
                  <FileType2 className="h-4 w-4" />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">PDF Report</span>
                  <span className="text-xs text-muted-foreground">
                    Branded landscape with KPIs &amp; table
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={!!exporting}
                onClick={() => handleExport("xlsx")}
                className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 focus:bg-emerald-500/10"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm shadow-emerald-500/30">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">Excel workbook</span>
                  <span className="text-xs text-muted-foreground">
                    Summary + Orders sheets, formatted
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={!!exporting}
                onClick={() => handleExport("csv")}
                className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 focus:bg-sky-500/10"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/30">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">CSV file</span>
                  <span className="text-xs text-muted-foreground">
                    Raw data with summary header
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Execution</Label>
            <select
              value={execFilter}
              onChange={e => setExecFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="internal">Internal only</option>
              <option value="subcontracted">Subcontracted only</option>
              <option value="mixed">Mixed</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Customer Invoice</Label>
            <select
              value={invFilter}
              onChange={e => setInvFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="none">Not Invoiced</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${rows.length} order${rows.length === 1 ? "" : "s"}`}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Revenue"
          value={fmtEUR(totals.revenue)}
          icon={Wallet}
          tone="text-foreground"
        />
        <KpiCard
          label="Total Costs"
          value={fmtEUR(totals.cost)}
          icon={Truck}
          tone="text-amber-600"
        />
        <KpiCard
          label="Profit"
          value={fmtEUR(totals.profit)}
          icon={totals.profit >= 0 ? TrendingUp : TrendingDown}
          tone={totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}
          sub={`${avgMargin.toFixed(1)}% avg margin`}
        />
        <KpiCard
          label="A/R Outstanding"
          value={fmtEUR(totals.outstanding_in)}
          icon={Receipt}
          tone="text-blue-600"
          sub="From customers"
        />
        <KpiCard
          label="A/P Outstanding"
          value={fmtEUR(totals.outstanding_out)}
          icon={Building2}
          tone="text-orange-600"
          sub="To carriers"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-red-600">
              Failed to load report.
            </div>
          ) : isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-sm text-muted-foreground text-center">
              No orders in this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Order</th>
                    <th className="text-left p-3 font-medium">Customer</th>
                    <th className="text-left p-3 font-medium">Execution</th>
                    <th className="text-right p-3 font-medium">Revenue</th>
                    <th className="text-right p-3 font-medium">Cost</th>
                    <th className="text-right p-3 font-medium">Profit</th>
                    <th className="text-right p-3 font-medium">Margin</th>
                    <th className="text-left p-3 font-medium">Customer Inv.</th>
                    <th className="text-left p-3 font-medium">Carrier Inv.</th>
                    <th className="text-right p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.order_id}
                      className="border-t hover:bg-muted/30"
                    >
                      <td className="p-3">
                        <div className="font-medium">
                          {r.reference_number ?? r.order_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                          {r.status ? ` · ${r.status}` : ""}
                        </div>
                      </td>
                      <td className="p-3">
                        {r.customer_name ?? (
                          <span className="text-muted-foreground italic">
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-2">
                                <ExecutionBadge mode={r.execution_mode} />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="text-xs space-y-0.5">
                                <div>Total legs: {r.legs_total}</div>
                                <div>Internal: {r.legs_internal}</div>
                                <div>Subcontracted: {r.legs_subcontract}</div>
                                {r.child_subcontract_count > 0 && (
                                  <div>
                                    Subcontract orders:{" "}
                                    {r.child_subcontract_count}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="p-3 text-right">
                        <div className="font-medium">
                          {fmtMoney(r.revenue_amount, r.revenue_currency)}
                        </div>
                        {r.revenue_currency !== "EUR" && (
                          <div className="text-xs text-muted-foreground">
                            ≈ {fmtEUR(r.revenue_eur)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="font-medium cursor-help">
                                {fmtEUR(r.cost_total_eur)}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="text-xs space-y-0.5">
                                <div>
                                  Internal: {fmtEUR(r.cost_internal_eur)}
                                </div>
                                <div>
                                  Subcontract:{" "}
                                  {fmtEUR(r.cost_subcontract_eur)}
                                </div>
                                <div>Other: {fmtEUR(r.cost_other_eur)}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td
                        className={`p-3 text-right font-semibold ${
                          r.profit_eur >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {fmtEUR(r.profit_eur)}
                      </td>
                      <td
                        className={`p-3 text-right ${
                          (r.margin_pct ?? 0) >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {r.margin_pct == null
                          ? "—"
                          : `${Number(r.margin_pct).toFixed(1)}%`}
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <CustomerInvoiceBadge
                            status={r.customer_invoice_status}
                          />
                          {r.customer_invoiced_eur > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {fmtEUR(r.customer_paid_eur)} /{" "}
                              {fmtEUR(r.customer_invoiced_eur)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <CarrierInvoiceBadge
                            status={r.carrier_invoice_status}
                          />
                          {r.carrier_invoiced_eur > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {fmtEUR(r.carrier_paid_eur)} /{" "}
                              {fmtEUR(r.carrier_invoiced_eur)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/tms/orders/${r.order_id}`}
                          className="inline-flex items-center text-xs text-blue-600 hover:underline"
                        >
                          Open
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-medium">
                  <tr>
                    <td className="p-3" colSpan={3}>
                      Totals ({rows.length})
                    </td>
                    <td className="p-3 text-right">
                      {fmtEUR(totals.revenue)}
                    </td>
                    <td className="p-3 text-right">{fmtEUR(totals.cost)}</td>
                    <td
                      className={`p-3 text-right ${
                        totals.profit >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {fmtEUR(totals.profit)}
                    </td>
                    <td className="p-3 text-right">
                      {avgMargin.toFixed(1)}%
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      A/R: {fmtEUR(totals.outstanding_in)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      A/P: {fmtEUR(totals.outstanding_out)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
        <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
        {sub && (
          <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}
