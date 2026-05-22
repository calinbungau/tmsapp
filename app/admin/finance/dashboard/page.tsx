"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Truck,
  Receipt,
  Fuel,
  Target,
  DollarSign,
  BarChart3,
  Calendar,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

interface DashboardStats {
  totalRevenue: number;
  totalCosts: number;
  grossMargin: number;
  marginPercent: number;
  tripsCompleted: number;
  ordersDelivered: number;
  avgRevenuePerKm: number;
  avgCostPerKm: number;
  totalDistanceKm: number;
}

interface CostBreakdown {
  group: string;
  groupName: string;
  amount: number;
  percentage: number;
}

interface BudgetAlert {
  id: string;
  name: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

export default function FinanceDashboardPage() {
  const { session: adminSession } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);

  useEffect(() => {
    if (!adminSession?.id) return;
    fetchDashboardData();
  }, [adminSession?.id, period]);

  const fetchDashboardData = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    
    const supabase = createClient();
    
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "quarter") {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    try {
      // Fetch completed orders in period
      const { data: orders } = await supabase
        .from("orders")
        .select("id, customer_price, carrier_cost, margin, customer_currency")
        .eq("admin_id", adminSession.id)
        .eq("commercial_role", "customer_order")
        .gte("created_at", startDate.toISOString());

      // Fetch trips in period with distance
      const { data: trips } = await supabase
        .from("trips")
        .select("id, total_distance_km")
        .eq("admin_id", adminSession.id)
        .gte("created_at", startDate.toISOString());

      // Fetch cost entries for the period
      const { data: costEntries } = await supabase
        .from("cost_entries")
        .select(`
          id, 
          net_amount, 
          currency,
          cost_catalog:cost_catalog(group_code, group_name)
        `)
        .eq("admin_id", adminSession.id)
        .gte("entry_date", startDate.toISOString().split("T")[0]);

      // Calculate stats
      const totalRevenue = orders?.reduce((sum, o) => sum + (Number(o.customer_price) || 0), 0) || 0;
      const totalCarrierCost = orders?.reduce((sum, o) => sum + (Number(o.carrier_cost) || 0), 0) || 0;
      const totalCostEntries = costEntries?.reduce((sum, e) => sum + (Number(e.net_amount) || 0), 0) || 0;
      const totalCosts = totalCarrierCost + totalCostEntries;
      const grossMargin = totalRevenue - totalCosts;
      const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
      const totalDistanceKm = trips?.reduce((sum, t) => sum + (Number(t.total_distance_km) || 0), 0) || 0;

      setStats({
        totalRevenue,
        totalCosts,
        grossMargin,
        marginPercent,
        tripsCompleted: trips?.length || 0,
        ordersDelivered: orders?.length || 0,
        avgRevenuePerKm: totalDistanceKm > 0 ? totalRevenue / totalDistanceKm : 0,
        avgCostPerKm: totalDistanceKm > 0 ? totalCosts / totalDistanceKm : 0,
        totalDistanceKm,
      });

      // Calculate cost breakdown by group
      const groupTotals: Record<string, { amount: number; name: string }> = {};
      costEntries?.forEach((entry) => {
        const catalog = entry.cost_catalog as any;
        const groupCode = catalog?.group_code || "OTHER";
        const groupName = catalog?.group_name || "Other";
        if (!groupTotals[groupCode]) {
          groupTotals[groupCode] = { amount: 0, name: groupName };
        }
        groupTotals[groupCode].amount += Number(entry.net_amount) || 0;
      });

      const totalForBreakdown = Object.values(groupTotals).reduce((sum, g) => sum + g.amount, 0) || 1;
      const breakdown = Object.entries(groupTotals)
        .map(([group, data]) => ({
          group,
          groupName: data.name,
          amount: data.amount,
          percentage: (data.amount / totalForBreakdown) * 100,
        }))
        .sort((a, b) => b.amount - a.amount);

      setCostBreakdown(breakdown);

      // Fetch budget alerts (budgets exceeding thresholds)
      const { data: budgets } = await supabase
        .from("cost_budgets")
        .select(`
          id, name, total_budget_amount,
          cost_budget_lines(budget_amount, warning_threshold_pct)
        `)
        .eq("admin_id", adminSession.id)
        .eq("status", "approved");

      // For now, show mock alerts - in production this would compare actuals vs budget
      setBudgetAlerts([]);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }

    setLoading(false);
  };

  const formatCurrency = (amount: number, currency = "EUR") => {
    return new Intl.NumberFormat("en-EU", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number, decimals = 0) => {
    return new Intl.NumberFormat("en-EU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your fleet&apos;s financial performance
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
          <SelectTrigger className="w-[140px]">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue Card */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Revenue
              </span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(stats?.totalRevenue || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(stats?.ordersDelivered || 0)} orders delivered
            </div>
          </CardContent>
        </Card>

        {/* Costs Card */}
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Total Costs
              </span>
              <Receipt className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(stats?.totalCosts || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(stats?.avgCostPerKm || 0, 2)} EUR/km avg
            </div>
          </CardContent>
        </Card>

        {/* Margin Card */}
        <Card
          className={`${
            (stats?.grossMargin || 0) >= 0
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Gross Margin
              </span>
              <Wallet className="h-4 w-4 text-blue-500" />
            </div>
            <div
              className={`text-2xl font-bold ${
                (stats?.grossMargin || 0) >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatCurrency(stats?.grossMargin || 0)}
            </div>
            <div className="flex items-center gap-1 text-xs mt-1">
              {(stats?.marginPercent || 0) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span
                className={
                  (stats?.marginPercent || 0) >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {formatNumber(stats?.marginPercent || 0, 1)}% margin
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Operations Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Operations
              </span>
              <Truck className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.totalDistanceKm || 0)} km
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(stats?.tripsCompleted || 0)} trips completed
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cost Breakdown by Group</CardTitle>
          </CardHeader>
          <CardContent>
            {costBreakdown.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No cost entries for this period</p>
                <Link href="/admin/finance/cost-entries">
                  <Button variant="outline" size="sm" className="mt-3">
                    Add Cost Entry
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {costBreakdown.slice(0, 6).map((item) => (
                  <div key={item.group} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.groupName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(item.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/finance/cost-entries" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Add Cost Entry
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/finance/cost-catalog" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Manage Cost Catalog
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/finance/budgets" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  View Budgets
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/finance/reports" className="block">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Generate Report
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Budget Alerts */}
      {budgetAlerts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Budget Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {budgetAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10"
                >
                  <div>
                    <p className="text-sm font-medium">{alert.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(alert.actual)} of {formatCurrency(alert.budgeted)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-amber-500">
                    {alert.variancePercent > 0 ? "+" : ""}
                    {formatNumber(alert.variancePercent, 1)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting Started (shown when no data) */}
      {!loading && costBreakdown.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
              <h3 className="text-lg font-semibold mb-2">
                Finance Module Ready
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your finance module is set up. Start by configuring your cost
                catalog to track expenses and analyze profitability.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/admin/finance/cost-catalog">
                  <Button>Configure Cost Catalog</Button>
                </Link>
                <Link href="/admin/finance/cost-entries">
                  <Button variant="outline">Add First Cost Entry</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
