"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package, DollarSign, TrendingUp, Users, Search, Check, ChevronLeft,
  Calendar, Clock, FileText, Download, Mail, Repeat, Loader2, X, BarChart3,
  Truck, FileBarChart, Plus, Trash2, Eye, CalendarClock, Route, Award,
  Activity, Gauge, Receipt, ArrowUpRight, ArrowDownRight, Filter, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TMS_REPORT_TYPES, TMS_REPORT_CATEGORIES, getTMSReportsByCategory,
  getTMSReportName, getTMSReportDescription, getTMSCategoryLabel, getTMSColumnLabel,
  formatCurrency,
  type TMSReportTypeDef, type TMSReportCategory,
} from "@/lib/tms-report-types";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, DollarSign, TrendingUp, Users, BarChart3, Truck, Route, Award, Activity, Gauge, Receipt, Clock,
};

const REPORT_MODULES = [
  { id: "instant_reports", icon: FileBarChart },
  { id: "scheduled_reports", icon: CalendarClock },
];

interface SavedReport {
  id: string;
  report_type: string;
  name: string;
  config: Record<string, unknown>;
  report_data: { rows: any[]; summary?: any };
  status: string;
  created_at: string;
  date_from: string;
  date_to: string;
}

type Panel2View = "saved_list" | "create_new";

export default function TMSReportsPage() {
  const router = useRouter();
  const { session: adminSession } = useAdminSession();
  const supabase = createClient();
  const { t, locale } = useTranslation();

  // Panel 1
  const [selectedModule, setSelectedModule] = useState("instant_reports");

  // Panel 2
  const [panel2View, setPanel2View] = useState<Panel2View>("saved_list");
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selectedSavedReportId, setSelectedSavedReportId] = useState<string | null>(null);

  // Create new flow
  const [selectedReportType, setSelectedReportType] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");

  // Panel 3 - Configuration
  const [reportTitle, setReportTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [orderType, setOrderType] = useState<"all" | "internal" | "forwarding">("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Report data
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<"configure" | "preview">("configure");
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportSummary, setReportSummary] = useState<any>(null);

  // Default dates (last 30 days)
  useEffect(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    setDateFrom(thirtyDaysAgo.toISOString().split("T")[0]);
    setDateTo(now.toISOString().split("T")[0]);
  }, []);

  // Fetch saved reports
  const fetchSavedReports = useCallback(async () => {
    if (!adminSession?.id) return;
    setSavedLoading(true);
    try {
      const { data } = await supabase
        .from("report_runs")
        .select("*")
        .eq("admin_id", adminSession.id)
        .like("report_type", "tms_%")
        .order("created_at", { ascending: false })
        .limit(50);
      setSavedReports(data || []);
    } catch { /* silent */ }
    setSavedLoading(false);
  }, [adminSession?.id, supabase]);

  useEffect(() => { fetchSavedReports(); }, [fetchSavedReports]);

  const reportsByCategory = useMemo(() => getTMSReportsByCategory(), []);
  const filteredReportTypes = useMemo(() => {
    if (!reportSearch.trim()) return null;
    const q = reportSearch.toLowerCase();
    return TMS_REPORT_TYPES.filter((r) =>
      r.nameEn.toLowerCase().includes(q) || r.descriptionEn.toLowerCase().includes(q)
    );
  }, [reportSearch]);
  const activeReport = useMemo(() =>
    TMS_REPORT_TYPES.find((r) => r.id === selectedReportType) || null,
    [selectedReportType]
  );

  // Generate report
  const generateReport = useCallback(async () => {
    if (!adminSession?.id || !activeReport || !dateFrom || !dateTo) return;
    setGenerating(true);
    try {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);

      let rows: any[] = [];
      let summary: any = null;

      // Build base query
      let query = supabase
        .from("orders")
        .select(`
          id, reference_number, order_type, status, created_at,
          customer_price, carrier_cost, margin, customer_currency, carrier_currency,
          estimated_distance_km, weight_kg, pallet_count,
          customer:customer_id(id, name),
          carrier:carrier_id(id, name)
        `)
        .eq("admin_id", adminSession.id)
        .eq("is_draft", false)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());

      if (orderType !== "all") {
        query = query.eq("order_type", orderType);
      }

      const { data: orders, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      // Also fetch stops for route info
      const orderIds = orders?.map(o => o.id) || [];
      const { data: stops } = await supabase
        .from("order_stops")
        .select("order_id, city, country, stop_type, sequence_order")
        .in("order_id", orderIds)
        .order("sequence_order");

      const stopsMap = new Map<string, any[]>();
      stops?.forEach(s => {
        if (!stopsMap.has(s.order_id)) stopsMap.set(s.order_id, []);
        stopsMap.get(s.order_id)!.push(s);
      });

      // Process based on report type
      switch (activeReport.id) {
        case "orders_summary": {
          rows = (orders || []).map(o => {
            const orderStops = stopsMap.get(o.id) || [];
            const pickup = orderStops.find(s => s.stop_type === "pickup");
            const delivery = orderStops.filter(s => s.stop_type === "delivery").pop();
            const route = pickup && delivery
              ? `${pickup.city || pickup.country || "?"} → ${delivery.city || delivery.country || "?"}`
              : "-";
            return {
              reference_number: o.reference_number,
              order_type: o.order_type === "forwarding" ? t("tms.reports.typeForwarding") : t("tms.reports.typeInternal"),
              status: o.status,
              customer_name: o.customer?.name || "-",
              route,
              created_at: new Date(o.created_at).toLocaleDateString(),
              customer_price: o.customer_price || 0,
              carrier_cost: o.carrier_cost || 0,
              margin: (o.customer_price || 0) - (o.carrier_cost || 0),
            };
          });
          const totalRevenue = rows.reduce((s, r) => s + r.customer_price, 0);
          const totalCost = rows.reduce((s, r) => s + r.carrier_cost, 0);
          summary = {
            total_orders: rows.length,
            total_revenue: totalRevenue,
            total_cost: totalCost,
            total_margin: totalRevenue - totalCost,
            avg_margin_percent: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : 0,
          };
          break;
        }

        case "orders_by_status": {
          const statusCounts = new Map<string, { count: number; revenue: number }>();
          (orders || []).forEach(o => {
            const stat = statusCounts.get(o.status) || { count: 0, revenue: 0 };
            stat.count++;
            stat.revenue += o.customer_price || 0;
            statusCounts.set(o.status, stat);
          });
          const total = orders?.length || 1;
          rows = Array.from(statusCounts.entries()).map(([status, data]) => ({
            status,
            count: data.count,
            total_revenue: data.revenue,
            avg_processing_time: "-",
            percentage: ((data.count / total) * 100).toFixed(1),
          }));
          summary = { total_statuses: rows.length, total_orders: orders?.length || 0 };
          break;
        }

        case "revenue_report": {
          const periodMap = new Map<string, { orders: number; revenue: number; cost: number }>();
          (orders || []).forEach(o => {
            const d = new Date(o.created_at);
            let period: string;
            if (groupBy === "day") period = d.toISOString().split("T")[0];
            else if (groupBy === "week") {
              const weekStart = new Date(d);
              weekStart.setDate(d.getDate() - d.getDay());
              period = `${t("tms.reports.weekOf").replace("{date}", weekStart.toISOString().split("T")[0])}`;
            } else {
              period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            }
            const p = periodMap.get(period) || { orders: 0, revenue: 0, cost: 0 };
            p.orders++;
            p.revenue += o.customer_price || 0;
            p.cost += o.carrier_cost || 0;
            periodMap.set(period, p);
          });
          rows = Array.from(periodMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([period, data]) => ({
              period,
              order_count: data.orders,
              total_revenue: data.revenue,
              total_cost: data.cost,
              gross_margin: data.revenue - data.cost,
              margin_percent: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : 0,
            }));
          const totalRev = rows.reduce((s, r) => s + r.total_revenue, 0);
          const totalCst = rows.reduce((s, r) => s + r.total_cost, 0);
          summary = {
            periods: rows.length,
            total_revenue: totalRev,
            total_cost: totalCst,
            total_margin: totalRev - totalCst,
          };
          break;
        }

        case "margin_analysis": {
          const entityMap = new Map<string, { name: string; orders: number; revenue: number; cost: number }>();
          (orders || []).forEach(o => {
            const key = o.customer?.id || "unknown";
            const name = o.customer?.name || t("tms.reports.unknownCustomer");
            const e = entityMap.get(key) || { name, orders: 0, revenue: 0, cost: 0 };
            e.orders++;
            e.revenue += o.customer_price || 0;
            e.cost += o.carrier_cost || 0;
            entityMap.set(key, e);
          });
          rows = Array.from(entityMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .map(e => ({
              entity_name: e.name,
              order_count: e.orders,
              total_revenue: e.revenue,
              total_cost: e.cost,
              margin: e.revenue - e.cost,
              margin_percent: e.revenue > 0 ? ((e.revenue - e.cost) / e.revenue * 100).toFixed(1) : 0,
              avg_order_value: e.orders > 0 ? e.revenue / e.orders : 0,
            }));
          summary = { entities: rows.length };
          break;
        }

        case "carrier_performance": {
          const carrierMap = new Map<string, { name: string; orders: number; cost: number; onTime: number }>();
          (orders || []).forEach(o => {
            if (!o.carrier) return;
            const key = o.carrier.id;
            const c = carrierMap.get(key) || { name: o.carrier.name, orders: 0, cost: 0, onTime: 0 };
            c.orders++;
            c.cost += o.carrier_cost || 0;
            if (o.status === "delivered" || o.status === "completed" || o.status === "fwd_delivered" || o.status === "fwd_completed") {
              c.onTime++;
            }
            carrierMap.set(key, c);
          });
          rows = Array.from(carrierMap.values())
            .sort((a, b) => b.orders - a.orders)
            .map(c => ({
              carrier_name: c.name,
              order_count: c.orders,
              on_time_rate: c.orders > 0 ? ((c.onTime / c.orders) * 100).toFixed(0) : 0,
              avg_cost: c.orders > 0 ? c.cost / c.orders : 0,
              total_cost: c.cost,
              issues: 0,
              rating: "-",
            }));
          summary = { carriers: rows.length };
          break;
        }

        case "customer_analysis": {
          const customerMap = new Map<string, { name: string; orders: number; revenue: number; cost: number; lastOrder: Date }>();
          (orders || []).forEach(o => {
            if (!o.customer) return;
            const key = o.customer.id;
            const c = customerMap.get(key) || { name: o.customer.name, orders: 0, revenue: 0, cost: 0, lastOrder: new Date(0) };
            c.orders++;
            c.revenue += o.customer_price || 0;
            c.cost += o.carrier_cost || 0;
            const orderDate = new Date(o.created_at);
            if (orderDate > c.lastOrder) c.lastOrder = orderDate;
            customerMap.set(key, c);
          });
          rows = Array.from(customerMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .map(c => ({
              customer_name: c.name,
              order_count: c.orders,
              total_revenue: c.revenue,
              avg_order_value: c.orders > 0 ? c.revenue / c.orders : 0,
              margin_percent: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue * 100).toFixed(1) : 0,
              payment_days: "-",
              last_order: c.lastOrder.toLocaleDateString(),
            }));
          summary = { customers: rows.length, total_revenue: rows.reduce((s, r) => s + r.total_revenue, 0) };
          break;
        }

        case "operational_kpis": {
          const totalOrders = orders?.length || 0;
          const totalRevenue = orders?.reduce((s, o) => s + (o.customer_price || 0), 0) || 0;
          const totalMargin = orders?.reduce((s, o) => s + ((o.customer_price || 0) - (o.carrier_cost || 0)), 0) || 0;
          const completedOrders = orders?.filter(o =>
            ["delivered", "completed", "fwd_delivered", "fwd_completed"].includes(o.status)
          ).length || 0;
          rows = [
            { kpi_name: t("tms.reports.kpiTotalOrders"), current_value: totalOrders, previous_value: 0, change: 0, target: 100, achievement: totalOrders },
            { kpi_name: t("tms.reports.kpiTotalRevenue"), current_value: totalRevenue, previous_value: 0, change: 0, target: 50000, achievement: ((totalRevenue / 50000) * 100).toFixed(0) },
            { kpi_name: t("tms.reports.kpiGrossMargin"), current_value: totalMargin, previous_value: 0, change: 0, target: 10000, achievement: ((totalMargin / 10000) * 100).toFixed(0) },
            { kpi_name: t("tms.reports.kpiCompletionRate"), current_value: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(0) : 0, previous_value: 0, change: 0, target: 95, achievement: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(0) : 0 },
            { kpi_name: t("tms.reports.kpiAvgOrderValue"), current_value: totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(0) : 0, previous_value: 0, change: 0, target: 500, achievement: 0 },
          ];
          break;
        }

        default:
          rows = (orders || []).map(o => ({
            reference_number: o.reference_number,
            order_type: o.order_type,
            status: o.status,
            customer_price: o.customer_price || 0,
          }));
      }

      setReportData(rows);
      setReportSummary(summary);
      setViewMode("preview");

      // Save to database
      await supabase.from("report_runs").insert({
        admin_id: adminSession.id,
        report_type: `tms_${activeReport.id}`,
        name: reportTitle || activeReport.nameEn,
        date_from: from.toISOString(),
        date_to: to.toISOString(),
        config: { groupBy, orderType, statusFilter },
        report_data: { rows, summary },
        status: "completed",
      });
      fetchSavedReports();
    } catch (err) {
      console.error("Report generation error:", err);
    } finally {
      setGenerating(false);
    }
  }, [adminSession?.id, activeReport, dateFrom, dateTo, groupBy, orderType, statusFilter, reportTitle, supabase, fetchSavedReports]);

  // View saved report
  const viewSavedReport = useCallback((report: SavedReport) => {
    setSelectedSavedReportId(report.id);
    const rt = TMS_REPORT_TYPES.find((r) => `tms_${r.id}` === report.report_type);
    if (rt) setSelectedReportType(rt.id);
    setReportTitle(report.name);
    setReportData(report.report_data?.rows || []);
    setReportSummary(report.report_data?.summary || null);
    if (report.date_from) setDateFrom(report.date_from.split("T")[0]);
    if (report.date_to) setDateTo(report.date_to.split("T")[0]);
    setViewMode("preview");
  }, []);

  // Delete saved report
  const deleteSavedReport = useCallback(async (id: string) => {
    await supabase.from("report_runs").delete().eq("id", id);
    setSavedReports((p) => p.filter((r) => r.id !== id));
    if (selectedSavedReportId === id) {
      setSelectedSavedReportId(null);
      setViewMode("configure");
    }
  }, [supabase, selectedSavedReportId]);

  const startNewReport = () => {
    setPanel2View("create_new");
    setSelectedReportType(null);
    setSelectedSavedReportId(null);
    setViewMode("configure");
    setReportData([]);
    setReportSummary(null);
  };

  const backToSavedList = () => {
    setPanel2View("saved_list");
    setSelectedReportType(null);
    setSelectedSavedReportId(null);
    setViewMode("configure");
  };

  const formatValue = (value: any, type: string) => {
    if (value === null || value === undefined || value === "-") return "-";
    switch (type) {
      case "currency": return formatCurrency(Number(value));
      case "percent": return `${value}%`;
      case "status": {
        const hit = t(`tms.reports.status.${value}`, "");
        return hit || value;
      }
      default: return value;
    }
  };

  // Mobile state for showing/hiding panels
  const [mobilePanel, setMobilePanel] = useState<"modules" | "list" | "config">("modules");

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Panel 1: Report Modules - Hidden on mobile when viewing other panels */}
      <div className={`${mobilePanel === "modules" ? "flex" : "hidden"} md:flex w-full md:w-[220px] border-r border-border/40 flex-col bg-card/60 shrink-0`}>
        <div className="p-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/admin/tms")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t("tms.reports.title")}</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {REPORT_MODULES.map((mod) => {
            const Icon = mod.icon;
            const isActive = selectedModule === mod.id;
            const modLabel = mod.id === "instant_reports" ? t("tms.reports.instantReports") : t("tms.reports.scheduledReports");
            const modDesc = mod.id === "instant_reports" ? t("tms.reports.instantReportsDesc") : t("tms.reports.scheduledReportsDesc");
            return (
              <button key={mod.id} onClick={() => { setSelectedModule(mod.id); setPanel2View("saved_list"); setMobilePanel("list"); }}
                className={`w-full text-left px-3 py-3 flex items-start gap-3 transition-all min-h-[60px] ${isActive ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/30 border-l-2 border-transparent"}`}>
                <div className={`w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-primary/20" : "bg-muted/40"}`}>
                  <Icon className={`h-5 w-5 md:h-4 md:w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm md:text-xs font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>{modLabel}</div>
                  <div className="text-xs md:text-[10px] text-muted-foreground leading-snug mt-0.5">{modDesc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick Stats */}
        <div className="p-3 border-t border-border/30 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("tms.reports.quickStats")}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <div className="text-[10px] text-emerald-400">{t("tms.reports.generated")}</div>
              <div className="text-sm font-bold text-emerald-500">{savedReports.length}</div>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-2">
              <div className="text-[10px] text-blue-400">{t("tms.reports.scheduled")}</div>
              <div className="text-sm font-bold text-blue-500">0</div>
            </div>
          </div>
        </div>
      </div>

      {/* Panel 2: Saved Reports List OR Create New */}
      {selectedModule === "instant_reports" && (
        <div className={`${mobilePanel === "list" ? "flex" : "hidden"} md:flex w-full md:w-[340px] border-r border-border/40 flex-col bg-card/30 shrink-0`}>
          {panel2View === "saved_list" ? (
            <>
              <div className="p-3 border-b border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setMobilePanel("modules")} className="md:hidden text-muted-foreground hover:text-foreground">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{t("tms.reports.generatedReports")}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{savedReports.length}</span>
                </div>
                <Button onClick={() => { startNewReport(); setMobilePanel("config"); }} className="w-full gap-2 h-10 md:h-8" size="sm">
                  <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" /> {t("tms.reports.createNewReport")}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {savedLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">{t("tms.reports.noReportsYet")}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{t("tms.reports.noReportsHint")}</p>
                  </div>
                ) : (
                  savedReports.map((report) => {
                    const rt = TMS_REPORT_TYPES.find((r) => `tms_${r.id}` === report.report_type);
                    const isSelected = selectedSavedReportId === report.id;
                    const IconComp = rt ? ICON_MAP[rt.icon] || Package : Package;
                    return (
                      <div key={report.id}
                        className={`group border-b border-border/10 transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/20"}`}>
                        <button onClick={() => { viewSavedReport(report); setMobilePanel("config"); }}
                          className="w-full text-left px-3 py-3 flex items-start gap-3 min-h-[60px]">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-primary/20" : "bg-muted/40"}`}>
                            <IconComp className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-semibold truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {report.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {(rt ? getTMSReportName(rt, locale) : t("tms.reports.reportFallback"))} • {new Date(report.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {report.date_from?.split("T")[0]} → {report.date_to?.split("T")[0]}
                            </div>
                          </div>
                        </button>
                        <div className="px-3 pb-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => viewSavedReport(report)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-500"
                            onClick={() => deleteSavedReport(report.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Create New Report Flow */
            <>
              <div className="p-3 border-b border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => { backToSavedList(); setMobilePanel("list"); }} className="text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                  </button>
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{t("tms.reports.selectReportType")}</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder={t("tms.reports.searchReports")} value={reportSearch} onChange={(e) => setReportSearch(e.target.value)}
                    className="h-8 pl-8 text-xs bg-background/50" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredReportTypes ? (
                  <div className="p-2 space-y-1">
                    {filteredReportTypes.map((rt) => {
                      const IconComp = ICON_MAP[rt.icon] || Package;
                      const isSelected = selectedReportType === rt.id;
                      return (
                        <button key={rt.id} onClick={() => { setSelectedReportType(rt.id); setMobilePanel("config"); }}
                          className={`w-full text-left px-3 py-3 md:py-2.5 rounded-lg flex items-center gap-3 transition-all min-h-[50px] ${isSelected ? "bg-primary/15 ring-1 ring-primary/30" : "hover:bg-muted/30"}`}>
                          <div className={`w-9 h-9 md:w-7 md:h-7 rounded-md flex items-center justify-center ${isSelected ? "bg-primary/20" : "bg-muted/40"}`}>
                            <IconComp className={`h-4 w-4 md:h-3.5 md:w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {getTMSReportName(rt, locale)}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{getTMSReportDescription(rt, locale)}</div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  Object.entries(reportsByCategory).map(([cat, reports]) => (
                    <div key={cat} className="border-b border-border/10 last:border-0">
                      <div className="px-3 py-2 bg-muted/20">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {getTMSCategoryLabel(cat as TMSReportCategory, locale)}
                        </span>
                      </div>
                      <div className="p-2 space-y-1">
                        {reports.map((rt) => {
                          const IconComp = ICON_MAP[rt.icon] || Package;
                          const isSelected = selectedReportType === rt.id;
                          return (
                            <button key={rt.id} onClick={() => { if (rt.available) { setSelectedReportType(rt.id); setMobilePanel("config"); } }}
                              disabled={!rt.available}
                              className={`w-full text-left px-3 py-3 md:py-2.5 rounded-lg flex items-center gap-3 transition-all min-h-[50px] ${
                                !rt.available ? "opacity-40 cursor-not-allowed" :
                                isSelected ? "bg-primary/15 ring-1 ring-primary/30" : "hover:bg-muted/30"
                              }`}>
                              <div className={`w-9 h-9 md:w-7 md:h-7 rounded-md flex items-center justify-center ${isSelected ? "bg-primary/20" : "bg-muted/40"}`}>
                                <IconComp className={`h-4 w-4 md:h-3.5 md:w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                                  {getTMSReportName(rt, locale)}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">{getTMSReportDescription(rt, locale)}</div>
                              </div>
                              {!rt.available && <Badge variant="outline" className="text-[9px] h-4">{t("tms.reports.soon")}</Badge>}
                              {isSelected && rt.available && <Check className="h-4 w-4 text-primary shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Panel 2 for Scheduled Reports */}
      {selectedModule === "scheduled_reports" && (
        <div className={`${mobilePanel === "list" ? "flex" : "hidden"} md:flex w-full md:w-[340px] border-r border-border/40 flex-col bg-card/30 shrink-0`}>
          <div className="p-3 border-b border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setMobilePanel("modules")} className="md:hidden text-muted-foreground hover:text-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{t("tms.reports.scheduledReports")}</span>
              </div>
            </div>
            <Button className="w-full gap-2 h-10 md:h-8" size="sm" disabled>
              <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" /> {t("tms.reports.scheduleNewReport")}
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <CalendarClock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{t("tms.reports.scheduledComingSoon")}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">{t("tms.reports.scheduledComingSoonHint")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Panel 3: Configuration / Preview */}
      <div className={`${mobilePanel === "config" ? "flex" : "hidden"} md:flex flex-1 flex-col overflow-hidden`}>
        {!activeReport && viewMode === "configure" ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">{t("tms.reports.selectReport")}</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                {t("tms.reports.selectReportHint")}
              </p>
              <Button onClick={() => setMobilePanel("list")} className="md:hidden mt-4 gap-2" variant="outline">
                <ChevronLeft className="h-4 w-4" /> {t("tms.reports.backToReports")}
              </Button>
            </div>
          </div>
        ) : viewMode === "configure" && activeReport ? (
          <>
            {/* Configuration Header */}
            <div className="p-3 md:p-4 border-b border-border/40 bg-card/50">
              <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
                <div className="flex items-center gap-3">
                  <button onClick={() => setMobilePanel("list")} className="md:hidden text-muted-foreground hover:text-foreground shrink-0">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  {(() => { const IconComp = ICON_MAP[activeReport.icon] || Package; return <IconComp className="h-5 w-5 text-primary shrink-0" />; })()}
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold truncate">{getTMSReportName(activeReport, locale)}</h2>
                    <p className="text-xs text-muted-foreground truncate">{getTMSReportDescription(activeReport, locale)}</p>
                  </div>
                </div>
                <Button onClick={generateReport} disabled={generating} className="gap-2 w-full md:w-auto h-11 md:h-9 shrink-0">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                  {generating ? t("tms.reports.generating") : t("tms.reports.generateReport")}
                </Button>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4">
              <div className="max-w-2xl space-y-5 md:space-y-6">
                {/* Report Title */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("tms.reports.reportTitleOptional")}</label>
                  <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)}
                    placeholder={getTMSReportName(activeReport, locale)} className="h-11 md:h-9 text-base md:text-sm" />
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("tms.reports.fromDate")}</label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 md:h-9 text-base md:text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("tms.reports.toDate")}</label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-11 md:h-9 text-base md:text-sm" />
                  </div>
                </div>

                {/* Quick Date Ranges */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { tKey: "today", days: 0 },
                    { tKey: "last7days", days: 7 },
                    { tKey: "last30days", days: 30 },
                    { tKey: "last90days", days: 90 },
                    { tKey: "thisMonth", days: "month" },
                    { tKey: "lastMonth", days: "lastMonth" },
                  ].map((range) => (
                    <Button key={range.tKey} variant="outline" size="sm" className="h-9 md:h-7 text-xs px-3"
                      onClick={() => {
                        const now = new Date();
                        let from: Date;
                        if (range.days === "month") {
                          from = new Date(now.getFullYear(), now.getMonth(), 1);
                        } else if (range.days === "lastMonth") {
                          from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                          now.setDate(0);
                        } else {
                          from = new Date(now.getTime() - (range.days as number) * 24 * 60 * 60 * 1000);
                        }
                        setDateFrom(from.toISOString().split("T")[0]);
                        setDateTo(now.toISOString().split("T")[0]);
                      }}>
                      {t(`tms.reports.${range.tKey}`)}
                    </Button>
                  ))}
                </div>

                {/* Filters */}
                <div className="space-y-4 pt-4 border-t border-border/30">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tms.reports.filters")}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("tms.reports.orderType")}</label>
                      <Select value={orderType} onValueChange={(v) => setOrderType(v as any)}>
                        <SelectTrigger className="h-11 md:h-9 text-base md:text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("tms.reports.allOrders")}</SelectItem>
                          <SelectItem value="internal">{t("tms.reports.internalOnly")}</SelectItem>
                          <SelectItem value="forwarding">{t("tms.reports.forwardingOnly")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {activeReport.filters?.includes("group_by") && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("tms.reports.groupBy")}</label>
                        <Select value={groupBy} onValueChange={setGroupBy}>
                          <SelectTrigger className="h-11 md:h-9 text-base md:text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day">{t("tms.reports.day")}</SelectItem>
                            <SelectItem value="week">{t("tms.reports.week")}</SelectItem>
                            <SelectItem value="month">{t("tms.reports.month")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Columns Preview */}
                <div className="space-y-3 pt-4 border-t border-border/30">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tms.reports.reportColumns")}</span>
                  <div className="flex flex-wrap gap-2">
                    {activeReport.columns.map((col) => (
                      <Badge key={col.key} variant="secondary" className="text-[10px]">
                        {getTMSColumnLabel(col, locale)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Preview Mode */
          <>
            <div className="p-3 md:p-4 border-b border-border/40 bg-card/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-10 w-10 md:h-8 md:w-8 shrink-0" onClick={() => { setViewMode("configure"); setMobilePanel("list"); }}>
                    <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                  </Button>
                  {activeReport && (() => { const IconComp = ICON_MAP[activeReport.icon] || Package; return <IconComp className="h-5 w-5 text-primary shrink-0 hidden md:block" />; })()}
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold truncate">{reportTitle || (activeReport ? getTMSReportName(activeReport, locale) : t("tms.reports.reportFallback"))}</h2>
                    <p className="text-xs text-muted-foreground">{dateFrom} → {dateTo} • {t("tms.reports.rowsCount").replace("{count}", String(reportData.length))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-[52px] md:pl-0">
                  <Button variant="outline" size="sm" className="gap-1.5 h-10 md:h-8 flex-1 md:flex-none" onClick={() => generateReport()}>
                    <RefreshCw className="h-4 w-4 md:h-3.5 md:w-3.5" /> {t("tms.reports.refresh")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 h-10 md:h-8 flex-1 md:flex-none">
                    <Download className="h-4 w-4 md:h-3.5 md:w-3.5" /> {t("tms.reports.export")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {reportSummary && (
              <div className="p-4 border-b border-border/30 bg-gradient-to-r from-background via-muted/20 to-background">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(reportSummary).map(([key, value], idx) => {
                    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                    const prettified = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    const label = t(`tms.reports.summary${camelKey.charAt(0).toUpperCase()}${camelKey.slice(1)}`, prettified);
                    const isPositive = typeof value === "number" && value > 0;
                    const isCurrency = key.includes("revenue") || key.includes("cost") || key.includes("margin");
                    const isMargin = key.includes("margin");
                    const isRevenue = key.includes("revenue");
                    const isCost = key.includes("cost");
                    
                    // Dynamic gradient backgrounds
                    const bgClass = isMargin 
                      ? "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20"
                      : isRevenue 
                        ? "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20"
                        : isCost
                          ? "bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20"
                          : "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20";
                    
                    const textClass = isMargin 
                      ? "text-emerald-500" 
                      : isRevenue 
                        ? "text-blue-500" 
                        : isCost 
                          ? "text-orange-500" 
                          : "text-foreground";

                    return (
                      <div key={key} className={`rounded-xl border p-4 ${bgClass} relative overflow-hidden group hover:scale-[1.02] transition-all duration-200`}>
                        <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-gradient-to-bl from-white/5 to-transparent -mr-10 -mt-10" />
                        <div className="relative">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
                          <div className={`text-xl font-bold mt-2 flex items-center gap-1.5 ${textClass}`}>
                            {isCurrency ? formatCurrency(value as number) : String(value)}
                            {isMargin && isPositive && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                                <ArrowUpRight className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                          {/* Mini sparkline placeholder */}
                          <div className="mt-2 h-6 flex items-end gap-0.5 opacity-40">
                            {[...Array(8)].map((_, i) => (
                              <div 
                                key={i} 
                                className={`w-1.5 rounded-t-sm ${isMargin ? "bg-emerald-500" : isRevenue ? "bg-blue-500" : isCost ? "bg-orange-500" : "bg-primary"}`}
                                style={{ height: `${20 + Math.random() * 80}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Data Table */}
            <div className="flex-1 overflow-auto">
              {reportData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">{t("tms.reports.noDataPeriod")}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{t("tms.reports.noDataHint")}</p>
                  </div>
                </div>
              ) : (
                <div className="p-2 md:p-4">
                  <div className="rounded-xl border border-border/40 overflow-x-auto bg-card/50">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-left font-semibold text-muted-foreground px-4 py-3 text-[10px] uppercase tracking-wider">#</th>
                          {activeReport?.columns.map((col) => (
                            <th key={col.key} className="text-left font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap text-[10px] uppercase tracking-wider">
                              {getTMSColumnLabel(col, locale)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {reportData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-muted/20 transition-colors group">
                            <td className="px-4 py-3 text-muted-foreground/60 font-mono">{idx + 1}</td>
                            {activeReport?.columns.map((col, colIdx) => (
                              <td key={col.key} className={`px-4 py-3 ${colIdx === 0 ? "font-medium" : ""}`}>
                                {col.type === "status" ? (
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] h-5 font-medium ${
                                      ["delivered", "completed", "fwd_delivered", "fwd_completed"].includes(row[col.key]) 
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                        : ["in_transit", "fwd_in_transit", "dispatched"].includes(row[col.key])
                                          ? "border-blue-500/30 bg-blue-500/10 text-blue-500"
                                          : ["draft", "cancelled"].includes(row[col.key])
                                            ? "border-muted-foreground/30 bg-muted/20 text-muted-foreground"
                                            : "border-orange-500/30 bg-orange-500/10 text-orange-500"
                                    }`}
                                  >
                                    {formatValue(row[col.key], col.type)}
                                  </Badge>
                                ) : col.type === "currency" ? (
                                  <span className={`font-semibold tabular-nums ${
                                    col.key.includes("margin") 
                                      ? row[col.key] > 0 ? "text-emerald-500" : row[col.key] < 0 ? "text-red-500" : "text-muted-foreground"
                                      : col.key.includes("revenue") 
                                        ? "text-blue-500" 
                                        : col.key.includes("cost") 
                                          ? "text-orange-500" 
                                          : ""
                                  }`}>
                                    {formatValue(row[col.key], col.type)}
                                  </span>
                                ) : col.type === "percent" ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium tabular-nums">{formatValue(row[col.key], col.type)}</span>
                                    <div className="w-16 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                      <div 
                                        className="h-full rounded-full bg-primary/60"
                                        style={{ width: `${Math.min(100, Number(row[col.key]) || 0)}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className={colIdx === 0 ? "text-foreground" : "text-muted-foreground"}>
                                    {formatValue(row[col.key], col.type)}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Table Footer */}
                  <div className="flex items-center justify-between mt-4 px-2">
                    <p className="text-xs text-muted-foreground">
                      {(reportData.length === 1 ? t("tms.reports.showingRow") : t("tms.reports.showingRows")).replace("{count}", String(reportData.length))}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <Download className="h-3 w-3" /> {t("tms.reports.exportCsv")}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <FileText className="h-3 w-3" /> {t("tms.reports.exportPdf")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
