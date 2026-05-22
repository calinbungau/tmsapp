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
  Search,
  CalendarClock,
  X,
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

type InvoiceLite = {
  id: string;
  invoice_number: string | null;
  direction: "incoming" | "outgoing";
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  amount: number;
  total_with_tax: number;
  paid_amount: number;
  remaining_amount: number | null;
  currency: string | null;
  business_partner_id: string | null;
};

type Subcontract = {
  id: string;
  reference_number: string | null;
  status: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
};

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
  subcontracts?: Subcontract[];
  customer_invoices?: InvoiceLite[];
  carrier_invoices?: InvoiceLite[];
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
  const [search, setSearch] = React.useState<string>("");
  const [customerFilter, setCustomerFilter] = React.useState<string>("all");
  const [carrierFilter, setCarrierFilter] = React.useState<string>("all");
  const [parentStatusFilter, setParentStatusFilter] =
    React.useState<string>("all");
  const [childStatusFilter, setChildStatusFilter] =
    React.useState<string>("all");
  const [carrierInvFilter, setCarrierInvFilter] = React.useState<string>("all");
  const [dueFilter, setDueFilter] = React.useState<string>("all"); // any | overdue | soon | ok
  const [page, setPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(25);

  const { session } = useAdminSession();
  const adminId = session?.id;
  const url = adminId
    ? `/api/admin/finance/reports/forwarding-pnl?admin_id=${adminId}&from=${from}&to=${to}`
    : null;
  const { data, isLoading, error } = useSWR<{ items: Row[] }>(url, fetcher);

  // Issuer/owner company info — used to brand exports.
  const { data: companyProfile } = useSWR<{
    company_name: string | null;
    logo_url: string | null;
  } | null>(
    adminId ? ["company_profile", adminId] : null,
    async () => {
      const sb = (await import("@/lib/supabase/client")).createClient();
      const { data } = await sb
        .from("company_profiles")
        .select("company_name, logo_url")
        .eq("admin_id", adminId!)
        .maybeSingle();
      return data ?? null;
    },
  );

  // Helper: classify a single invoice by its due date relative to today.
  const todayMs = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  function classifyInvoice(inv: InvoiceLite): {
    bucket: "paid" | "overdue" | "soon" | "ok" | "noDue" | "draft";
    daysToDue: number | null;
  } {
    if (inv.status === "paid") return { bucket: "paid", daysToDue: null };
    if (inv.status === "draft") return { bucket: "draft", daysToDue: null };
    if (!inv.due_date) return { bucket: "noDue", daysToDue: null };
    const due = new Date(inv.due_date + "T00:00:00").getTime();
    const days = Math.round((due - todayMs) / 86400000);
    if (days < 0) return { bucket: "overdue", daysToDue: days };
    if (days <= 10) return { bucket: "soon", daysToDue: days };
    return { bucket: "ok", daysToDue: days };
  }

  // Derive customer/carrier option lists from the unfiltered dataset.
  const customerOptions = React.useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data?.items ?? []) {
      if (r.customer_id && r.customer_name) {
        set.set(r.customer_id, r.customer_name);
      }
    }
    return Array.from(set.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const carrierOptions = React.useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data?.items ?? []) {
      for (const s of r.subcontracts ?? []) {
        if (s.carrier_id && s.carrier_name) {
          set.set(s.carrier_id, s.carrier_name);
        }
      }
    }
    return Array.from(set.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const parentStatusOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.items ?? []) if (r.status) s.add(r.status);
    return Array.from(s).sort();
  }, [data]);

  const childStatusOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.items ?? []) {
      for (const sc of r.subcontracts ?? []) if (sc.status) s.add(sc.status);
    }
    return Array.from(s).sort();
  }, [data]);

  const rows = React.useMemo(() => {
    let items = data?.items ?? [];
    const q = search.trim().toLowerCase();

    if (execFilter !== "all") {
      items = items.filter(r => r.execution_mode === execFilter);
    }
    if (invFilter !== "all") {
      items = items.filter(r => r.customer_invoice_status === invFilter);
    }
    if (carrierInvFilter !== "all") {
      items = items.filter(r => r.carrier_invoice_status === carrierInvFilter);
    }
    if (customerFilter !== "all") {
      items = items.filter(r => r.customer_id === customerFilter);
    }
    if (carrierFilter !== "all") {
      items = items.filter(r =>
        (r.subcontracts ?? []).some(s => s.carrier_id === carrierFilter),
      );
    }
    if (parentStatusFilter !== "all") {
      items = items.filter(r => r.status === parentStatusFilter);
    }
    if (childStatusFilter !== "all") {
      items = items.filter(r =>
        (r.subcontracts ?? []).some(s => s.status === childStatusFilter),
      );
    }
    if (dueFilter !== "all") {
      items = items.filter(r => {
        const all = [
          ...(r.customer_invoices ?? []),
          ...(r.carrier_invoices ?? []),
        ];
        return all.some(inv => classifyInvoice(inv).bucket === dueFilter);
      });
    }
    if (q) {
      items = items.filter(r => {
        const haystack = [
          r.reference_number,
          r.customer_name,
          r.status,
          ...(r.subcontracts ?? []).flatMap(s => [s.reference_number, s.carrier_name, s.status]),
          ...(r.customer_invoices ?? []).map(i => i.invoice_number),
          ...(r.carrier_invoices ?? []).map(i => i.invoice_number),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return items;
  }, [
    data,
    execFilter,
    invFilter,
    carrierInvFilter,
    customerFilter,
    carrierFilter,
    parentStatusFilter,
    childStatusFilter,
    dueFilter,
    search,
    todayMs,
  ]);

  // Invoice statistics — split by direction (customer = outgoing, carrier = incoming).
  const invoiceStats = React.useMemo(() => {
    const make = () => ({
      total: 0,
      collected: 0,
      outstanding: 0,
      overdue: 0,
      dueSoon: 0,
      countTotal: 0,
      countOverdue: 0,
      countDueSoon: 0,
      countPaid: 0,
    });
    const customer = make();
    const carrier = make();

    for (const r of rows) {
      for (const inv of r.customer_invoices ?? []) {
        const total = inv.total_with_tax || inv.amount || 0;
        const paid = inv.paid_amount || 0;
        const remaining =
          inv.remaining_amount != null
            ? inv.remaining_amount
            : Math.max(total - paid, 0);
        customer.total += total;
        customer.collected += paid;
        customer.outstanding += remaining;
        customer.countTotal += 1;
        const cl = classifyInvoice(inv);
        if (cl.bucket === "paid") customer.countPaid += 1;
        if (cl.bucket === "overdue") {
          customer.overdue += remaining;
          customer.countOverdue += 1;
        }
        if (cl.bucket === "soon") {
          customer.dueSoon += remaining;
          customer.countDueSoon += 1;
        }
      }
      for (const inv of r.carrier_invoices ?? []) {
        const total = inv.total_with_tax || inv.amount || 0;
        const paid = inv.paid_amount || 0;
        const remaining =
          inv.remaining_amount != null
            ? inv.remaining_amount
            : Math.max(total - paid, 0);
        carrier.total += total;
        carrier.collected += paid;
        carrier.outstanding += remaining;
        carrier.countTotal += 1;
        const cl = classifyInvoice(inv);
        if (cl.bucket === "paid") carrier.countPaid += 1;
        if (cl.bucket === "overdue") {
          carrier.overdue += remaining;
          carrier.countOverdue += 1;
        }
        if (cl.bucket === "soon") {
          carrier.dueSoon += remaining;
          carrier.countDueSoon += 1;
        }
      }
    }
    return { customer, carrier };
  }, [rows, todayMs]);

  // Reset page to 1 whenever any filter / search / pageSize changes
  React.useEffect(() => {
    setPage(1);
  }, [
    execFilter,
    invFilter,
    carrierInvFilter,
    customerFilter,
    carrierFilter,
    parentStatusFilter,
    childStatusFilter,
    dueFilter,
    search,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = React.useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

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
        customerInvoices: invoiceStats.customer,
        carrierInvoices: invoiceStats.carrier,
      },
      filters: {
        execution: execFilter,
        customerInvoice: invFilter,
        carrierInvoice: carrierInvFilter,
        customer: customerFilter,
        carrier: carrierFilter,
        parentStatus: parentStatusFilter,
        childStatus: childStatusFilter,
        due: dueFilter,
        search,
      },
      company: {
        name: companyProfile?.company_name ?? session?.company_name ?? null,
        logoUrl: companyProfile?.logo_url ?? null,
      },
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
        <CardContent className="p-4 space-y-3">
          {/* Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by order ref, customer, carrier, invoice no…"
                className="pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              {isLoading
                ? "Loading…"
                : `${rows.length} order${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-end gap-3">
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
              <Label className="text-xs">Customer</Label>
              <TypeaheadSelect
                options={customerOptions}
                value={customerFilter}
                onChange={setCustomerFilter}
                placeholder="All customers"
                emptyLabel="All customers"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Carrier</Label>
              <TypeaheadSelect
                options={carrierOptions}
                value={carrierFilter}
                onChange={setCarrierFilter}
                placeholder="All carriers"
                emptyLabel="All carriers"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Parent status</Label>
              <select
                value={parentStatusFilter}
                onChange={e => setParentStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
              >
                <option value="all">All</option>
                {parentStatusOptions.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Child status</Label>
              <select
                value={childStatusFilter}
                onChange={e => setChildStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
              >
                <option value="all">All</option>
                {childStatusOptions.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
              <Label className="text-xs">Customer invoice</Label>
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
            <div className="space-y-1">
              <Label className="text-xs">Carrier invoice</Label>
              <select
                value={carrierInvFilter}
                onChange={e => setCarrierInvFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All</option>
                <option value="none">No Carrier Inv.</option>
                <option value="fully_invoiced">Invoiced</option>
                <option value="partial_paid">Partially Paid</option>
                <option value="fully_paid">Paid</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <select
                value={dueFilter}
                onChange={e => setDueFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="soon">Due ≤ 10 days</option>
                <option value="ok">Future</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setExecFilter("all");
                setInvFilter("all");
                setCarrierInvFilter("all");
                setCustomerFilter("all");
                setCarrierFilter("all");
                setParentStatusFilter("all");
                setChildStatusFilter("all");
                setDueFilter("all");
                setSearch("");
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
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
                  {pagedRows.map(r => (
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
                          <InvoiceDueLine
                            invoices={r.customer_invoices ?? []}
                            classify={classifyInvoice}
                          />
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
                          <InvoiceDueLine
                            invoices={r.carrier_invoices ?? []}
                            classify={classifyInvoice}
                          />
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
          {/* Pagination footer */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm">
              <div className="text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {(safePage - 1) * pageSize + 1}-
                  {Math.min(safePage * pageSize, rows.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {rows.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  Rows per page
                </Label>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {[10, 25, 50, 100, 200].map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                >
                  «
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  ‹ Prev
                </Button>
                <span className="px-3 text-xs text-muted-foreground">
                  Page{" "}
                  <span className="font-medium text-foreground">
                    {safePage}
                  </span>{" "}
                  / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  Next ›
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  »
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice statistics — Customer (A/R) & Carrier (A/P) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvoiceStatsCard
          title="Customer Invoices (A/R)"
          accent="blue"
          stats={invoiceStats.customer}
          ariaSubtitle="Money owed to us by customers"
        />
        <InvoiceStatsCard
          title="Carrier Invoices (A/P)"
          accent="orange"
          stats={invoiceStats.carrier}
          ariaSubtitle="Money we owe to carriers"
        />
      </div>
    </div>
  );
}

/* ----------------- Helper sub-components ----------------- */

function InvoiceDueLine({
  invoices,
  classify,
}: {
  invoices: InvoiceLite[];
  classify: (inv: InvoiceLite) => {
    bucket: "paid" | "overdue" | "soon" | "ok" | "noDue" | "draft";
    daysToDue: number | null;
  };
}) {
  if (!invoices.length) return null;
  // Show the most-urgent unpaid invoice (overdue first, then soon, then ok).
  const unpaid = invoices.filter(i => i.status !== "paid" && i.due_date);
  if (!unpaid.length) return null;
  const sorted = [...unpaid].sort((a, b) =>
    (a.due_date || "").localeCompare(b.due_date || ""),
  );
  const next = sorted[0];
  const cl = classify(next);
  const dueStr = next.due_date
    ? new Date(next.due_date + "T00:00:00").toLocaleDateString()
    : "—";

  let cls = "text-muted-foreground";
  let label: string = `Due ${dueStr}`;
  if (cl.bucket === "overdue") {
    cls = "text-red-600 font-medium";
    label = `Overdue · ${dueStr} (${Math.abs(cl.daysToDue ?? 0)}d)`;
  } else if (cl.bucket === "soon") {
    cls = "text-amber-600 font-medium";
    label = `Due in ${cl.daysToDue}d · ${dueStr}`;
  } else if (cl.bucket === "ok") {
    cls = "text-emerald-700/80";
    label = `Due ${dueStr}`;
  }

  return (
    <div className={`text-[11px] flex items-center gap-1 ${cls}`}>
      <CalendarClock className="h-3 w-3" />
      <span>{label}</span>
      {unpaid.length > 1 && (
        <span className="text-muted-foreground">
          (+{unpaid.length - 1})
        </span>
      )}
    </div>
  );
}

type InvStats = {
  total: number;
  collected: number;
  outstanding: number;
  overdue: number;
  dueSoon: number;
  countTotal: number;
  countOverdue: number;
  countDueSoon: number;
  countPaid: number;
};

function InvoiceStatsCard({
  title,
  accent,
  stats,
  ariaSubtitle,
}: {
  title: string;
  accent: "blue" | "orange";
  stats: InvStats;
  ariaSubtitle: string;
}) {
  const pctCollected =
    stats.total > 0 ? Math.min(100, (stats.collected / stats.total) * 100) : 0;
  const pctOverdue =
    stats.total > 0 ? Math.min(100, (stats.overdue / stats.total) * 100) : 0;
  const pctSoon =
    stats.total > 0 ? Math.min(100, (stats.dueSoon / stats.total) * 100) : 0;

  const headerCls =
    accent === "blue"
      ? "border-l-4 border-blue-500"
      : "border-l-4 border-orange-500";

  return (
    <Card className={headerCls}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {accent === "blue" ? (
            <Receipt className="h-4 w-4 text-blue-600" />
          ) : (
            <Building2 className="h-4 w-4 text-orange-600" />
          )}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{ariaSubtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top metric grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile
            label="Total Invoiced"
            value={fmtEUR(stats.total)}
            sub={`${stats.countTotal} invoice${stats.countTotal === 1 ? "" : "s"}`}
            tone="text-foreground"
          />
          <StatTile
            label="Collected"
            value={fmtEUR(stats.collected)}
            sub={`${stats.countPaid} paid`}
            tone="text-emerald-600"
          />
          <StatTile
            label="Outstanding"
            value={fmtEUR(stats.outstanding)}
            sub={`${stats.total > 0 ? ((stats.outstanding / stats.total) * 100).toFixed(0) : 0}% of total`}
            tone={accent === "blue" ? "text-blue-600" : "text-orange-600"}
          />
          <StatTile
            label="Overdue"
            value={fmtEUR(stats.overdue)}
            sub={`${stats.countOverdue} invoice${stats.countOverdue === 1 ? "" : "s"}`}
            tone="text-red-600"
          />
          <StatTile
            label="Due ≤ 10 days"
            value={fmtEUR(stats.dueSoon)}
            sub={`${stats.countDueSoon} invoice${stats.countDueSoon === 1 ? "" : "s"}`}
            tone="text-amber-600"
          />
          <StatTile
            label="Collection Rate"
            value={`${pctCollected.toFixed(1)}%`}
            sub="paid vs invoiced"
            tone="text-emerald-700"
          />
        </div>

        {/* Stacked bar — collected vs upcoming/overdue/other */}
        {stats.total > 0 && (
          <div className="space-y-1">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500"
                style={{ width: `${pctCollected}%` }}
                title={`Collected ${fmtEUR(stats.collected)}`}
              />
              <div
                className="bg-amber-500"
                style={{ width: `${pctSoon}%` }}
                title={`Due soon ${fmtEUR(stats.dueSoon)}`}
              />
              <div
                className="bg-red-500"
                style={{ width: `${pctOverdue}%` }}
                title={`Overdue ${fmtEUR(stats.overdue)}`}
              />
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <Legend dot="bg-emerald-500" label="Collected" />
              <Legend dot="bg-amber-500" label="Due ≤ 10d" />
              <Legend dot="bg-red-500" label="Overdue" />
              <Legend dot="bg-muted-foreground/30" label="Other" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Typeahead select with free-text search. Useful when there can be hundreds
 * of partners — the user types a few letters and we filter the list. Selecting
 * a row sets the underlying filter to that partner's id; clearing the input
 * sets it back to "all".
 */
function TypeaheadSelect({
  options,
  value,
  onChange,
  placeholder,
  emptyLabel,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // Keep the visible label in sync with the externally-controlled value.
  const selectedName =
    value === "all"
      ? ""
      : options.find(o => o.id === value)?.name ?? "";

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const display = open ? query : selectedName;
  const filtered = React.useMemo(() => {
    const q = (open ? query : "").trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter(o => o.name.toLowerCase().includes(q)).slice(0, 50);
  }, [options, query, open]);

  return (
    <div ref={wrapRef} className="relative min-w-[180px] max-w-[240px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={display}
          onFocus={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="h-9 pl-8 pr-7 text-sm"
        />
        {value !== "all" && (
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault();
              onChange("all");
              setQuery("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault();
              onChange("all");
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted ${value === "all" ? "bg-muted/50 font-medium" : ""}`}
          >
            {emptyLabel ?? "All"}
          </button>
          <div className="border-t" />
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No matches
            </div>
          ) : (
            filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted truncate ${o.id === value ? "bg-muted/50 font-medium" : ""}`}
                title={o.name}
              >
                {o.name}
              </button>
            ))
          )}
          {options.length > filtered.length && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-muted/30">
              Showing {filtered.length} of {options.length} — keep typing to
              narrow
            </div>
          )}
        </div>
      )}
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
