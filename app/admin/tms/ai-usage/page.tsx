"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Brain, Zap, DollarSign, FileText, Clock, TrendingUp,
  AlertTriangle, Settings, Loader2, ArrowUpRight, BarChart3,
  ChevronRight, CalendarDays, Check, X,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Area, AreaChart,
} from "recharts";

// ─── Types ─────────────────────────────────────────────
interface AiLog {
  id: string;
  order_id: string | null;
  document_name: string;
  document_type: string | null;
  page_count: number;
  relevant_pages: number[];
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  extraction_model: string;
  classification_model: string | null;
  estimated_cost_usd: number;
  processing_time_ms: number;
  extraction_confidence: number;
  was_corrected: boolean;
  status: string;
  created_at: string;
}

interface MonthlyUsage {
  used: number;
  limit: number | null;
  warningPct: number;
}

// ─── Chart Colors ─────────────────────────────────────
const CHART_PRIMARY = "#2563eb";
const CHART_SECONDARY = "#06b6d4";
const CHART_SUCCESS = "#10b981";
const CHART_MUTED = "#94a3b8";
const CHART_WARNING = "#f59e0b";

// ─── Metric Card ─────────────────────────────────────
function MetricCard({ label, value, subValue, icon: Icon, trend, color }: {
  label: string; value: string; subValue?: string;
  icon: React.ElementType; trend?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color || "bg-primary/10"}`}>
            <Icon className={`h-4.5 w-4.5 ${color ? "text-white" : "text-primary"}`} />
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-xs text-emerald-500">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Usage Gauge ──────────────────────────────────────
function UsageGauge({ used, limit, warningPct }: { used: number; limit: number | null; warningPct: number }) {
  if (!limit) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const isWarning = pct >= warningPct;
  const isOver = pct >= 100;

  return (
    <Card className={isOver ? "border-destructive/50" : isWarning ? "border-amber-500/50" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Monthly Budget</p>
            <p className="text-xs text-muted-foreground">
              ${used.toFixed(4)} of ${limit.toFixed(2)} used
            </p>
          </div>
          <Badge variant={isOver ? "destructive" : isWarning ? "outline" : "secondary"} className="text-xs">
            {pct.toFixed(1)}%
          </Badge>
        </div>
        <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isOver ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isWarning && !isOver && (
          <p className="mt-2 text-xs text-amber-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Approaching monthly limit ({warningPct}% threshold)
          </p>
        )}
        {isOver && (
          <p className="mt-2 text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Monthly limit reached! AI extraction is paused.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════
export default function AiUsagePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [adminSession, setAdminSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage>({ used: 0, limit: null, warningPct: 80 });
  const [editingLimit, setEditingLimit] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [newWarningPct, setNewWarningPct] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const s = createClient();

    // Fetch all logs (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data: logsData } = await s.from("ai_extraction_logs")
      .select("*")
      .eq("admin_id", adminSession.id)
      .gte("created_at", ninetyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    setLogs(logsData || []);

    // Calculate monthly usage
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthLogs = (logsData || []).filter(l => l.created_at >= monthStart);
    const usedThisMonth = monthLogs.reduce((sum, l) => sum + (l.estimated_cost_usd || 0), 0);

    // Get limit from company_profiles
    const { data: profile } = await s.from("company_profiles")
      .select("ai_monthly_limit_usd, ai_monthly_warning_pct")
      .eq("admin_id", adminSession.id)
      .single();

    setMonthlyUsage({
      used: usedThisMonth,
      limit: profile?.ai_monthly_limit_usd || null,
      warningPct: profile?.ai_monthly_warning_pct || 80,
    });
    setNewLimit(profile?.ai_monthly_limit_usd?.toString() || "");
    setNewWarningPct(profile?.ai_monthly_warning_pct?.toString() || "80");

    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Computed stats
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = logs.filter(l => new Date(l.created_at) >= monthStart);

    const totalTokens = thisMonth.reduce((s, l) => s + l.total_input_tokens + l.total_output_tokens, 0);
    const totalCost = thisMonth.reduce((s, l) => s + l.estimated_cost_usd, 0);
    const avgConfidence = thisMonth.length > 0 ? thisMonth.reduce((s, l) => s + l.extraction_confidence, 0) / thisMonth.length : 0;
    const avgProcessingTime = thisMonth.length > 0 ? thisMonth.reduce((s, l) => s + l.processing_time_ms, 0) / thisMonth.length : 0;
    const correctedCount = thisMonth.filter(l => l.was_corrected).length;
    const accuracyRate = thisMonth.length > 0 ? ((thisMonth.length - correctedCount) / thisMonth.length * 100) : 100;

    return {
      extractionsThisMonth: thisMonth.length,
      totalTokens,
      totalCost,
      avgConfidence,
      avgProcessingTime,
      accuracyRate,
      correctedCount,
    };
  }, [logs]);

  // Daily chart data
  const dailyData = useMemo(() => {
    const now = new Date();
    const days: Record<string, { date: string; extractions: number; tokens: number; cost: number }> = {};

    // Fill last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: key, extractions: 0, tokens: 0, cost: 0 };
    }

    logs.forEach(l => {
      const key = l.created_at.slice(0, 10);
      if (days[key]) {
        days[key].extractions += 1;
        days[key].tokens += l.total_input_tokens + l.total_output_tokens;
        days[key].cost += l.estimated_cost_usd;
      }
    });

    return Object.values(days).map(d => ({
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    }));
  }, [logs]);

  // Model distribution
  const modelDistribution = useMemo(() => {
    const models: Record<string, number> = {};
    logs.forEach(l => { const m = l.extraction_model || "unknown"; models[m] = (models[m] || 0) + 1; });
    return Object.entries(models).map(([name, count]) => ({ name: name.replace("openai/", ""), value: count }));
  }, [logs]);

  const PIE_COLORS = [CHART_PRIMARY, CHART_SECONDARY, CHART_SUCCESS, CHART_WARNING];

  // Save limit
  const saveLimit = async () => {
    if (!adminSession?.id) return;
    const s = createClient();

    const { error } = await s.from("company_profiles")
      .update({
        ai_monthly_limit_usd: newLimit ? parseFloat(newLimit) : null,
        ai_monthly_warning_pct: newWarningPct ? parseInt(newWarningPct) : 80,
      })
      .eq("admin_id", adminSession.id);

    if (error) {
      // If no row exists, insert one
      await s.from("company_profiles").upsert({
        admin_id: adminSession.id,
        ai_monthly_limit_usd: newLimit ? parseFloat(newLimit) : null,
        ai_monthly_warning_pct: newWarningPct ? parseInt(newWarningPct) : 80,
      }, { onConflict: "admin_id" });
    }

    setMonthlyUsage(prev => ({
      ...prev,
      limit: newLimit ? parseFloat(newLimit) : null,
      warningPct: newWarningPct ? parseInt(newWarningPct) : 80,
    }));
    setEditingLimit(false);
    toast({ title: "AI budget updated" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Usage</h1>
            <p className="text-sm text-muted-foreground">Monitor AI extraction costs, tokens, and performance</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={() => setEditingLimit(true)}>
            <Settings className="h-3.5 w-3.5" />
            Budget Settings
          </Button>
        </div>

        {/* Budget Settings Dialog */}
        {editingLimit && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Monthly AI Budget Settings</h3>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingLimit(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="text-xs">Monthly Limit (USD)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={newLimit}
                    onChange={e => setNewLimit(e.target.value)}
                    placeholder="e.g. 50.00 (leave empty for unlimited)"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Warning Threshold (%)</Label>
                  <Input
                    type="number" min="1" max="100"
                    value={newWarningPct}
                    onChange={e => setNewWarningPct(e.target.value)}
                    placeholder="80"
                  />
                </div>
                <Button size="sm" onClick={saveLimit} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                When the monthly usage exceeds the warning threshold, you will see alerts. When it reaches 100%, AI extraction will be paused until next month.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Budget Gauge */}
        <UsageGauge used={monthlyUsage.used} limit={monthlyUsage.limit} warningPct={monthlyUsage.warningPct} />

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Extractions This Month"
            value={stats.extractionsThisMonth.toString()}
            icon={FileText}
          />
          <MetricCard
            label="Total Tokens"
            value={stats.totalTokens.toLocaleString()}
            subValue={`$${stats.totalCost.toFixed(4)} total cost`}
            icon={Zap}
            color="bg-cyan-500"
          />
          <MetricCard
            label="Avg Confidence"
            value={`${stats.avgConfidence.toFixed(0)}%`}
            subValue={`${stats.accuracyRate.toFixed(0)}% accuracy (${stats.correctedCount} corrected)`}
            icon={Brain}
            color="bg-violet-500"
          />
          <MetricCard
            label="Avg Processing Time"
            value={`${(stats.avgProcessingTime / 1000).toFixed(1)}s`}
            icon={Clock}
            color="bg-emerald-500"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Daily Extractions Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Daily Extractions & Cost</CardTitle>
              <CardDescription className="text-xs">Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                    formatter={(value: number, name: string) => {
                      if (name === "cost") return [`$${value.toFixed(4)}`, "Cost"];
                      if (name === "tokens") return [value.toLocaleString(), "Tokens"];
                      return [value, "Extractions"];
                    }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="extractions" fill={CHART_PRIMARY} fillOpacity={0.15} stroke={CHART_PRIMARY} strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="cost" stroke={CHART_SECONDARY} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Model Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Model Distribution</CardTitle>
              <CardDescription className="text-xs">All extractions</CardDescription>
            </CardHeader>
            <CardContent>
              {modelDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={modelDistribution}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {modelDistribution.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, "Extractions"]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                  No extractions yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Extractions Table */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Recent Extractions</CardTitle>
                <CardDescription className="text-xs">All AI extractions in the last 90 days</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">{logs.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Document</th>
                    <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Date</th>
                    <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Pages</th>
                    <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Input Tokens</th>
                    <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Output Tokens</th>
                    <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Total Tokens</th>
                    <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Cost</th>
                    <th className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground">Time</th>
                    <th className="text-center py-2.5 px-4 font-medium text-xs text-muted-foreground">Confidence</th>
                    <th className="text-center py-2.5 px-4 font-medium text-xs text-muted-foreground">Corrected</th>
                    <th className="text-left py-2.5 px-4 font-medium text-xs text-muted-foreground">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Brain className="h-8 w-8 text-muted-foreground/30" />
                          <p className="text-sm">No AI extractions yet</p>
                          <p className="text-xs">Upload a transport order PDF from the New Order page to get started</p>
                        </div>
                      </td>
                    </tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2 max-w-[200px]">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate text-xs font-medium">{log.document_name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs">
                        {log.page_count}
                        {log.relevant_pages && log.relevant_pages.length < log.page_count && (
                          <span className="text-muted-foreground ml-1">({log.relevant_pages.length} relevant)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs font-mono">{log.total_input_tokens.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right text-xs font-mono">{log.total_output_tokens.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right text-xs font-mono font-semibold">
                        {(log.total_input_tokens + log.total_output_tokens).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs font-mono">${log.estimated_cost_usd.toFixed(4)}</td>
                      <td className="py-2.5 px-4 text-right text-xs">{(log.processing_time_ms / 1000).toFixed(1)}s</td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          variant={log.extraction_confidence >= 80 ? "default" : log.extraction_confidence >= 50 ? "secondary" : "destructive"}
                          className="text-[10px] px-1.5"
                        >
                          {log.extraction_confidence}%
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {log.was_corrected ? (
                          <span className="text-amber-500 text-xs">Yes</span>
                        ) : (
                          <span className="text-emerald-500 text-xs">No</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">
                        {(log.extraction_model || "").replace("openai/", "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Cost Estimation Guide */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cost Estimation Guide</CardTitle>
            <CardDescription className="text-xs">Approximate costs per extraction by model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { model: "GPT-4.1 Mini", costRange: "$0.002 - $0.005", tokensRange: "2,000 - 5,000", best: "Best value, fast" },
                { model: "GPT-4.1", costRange: "$0.008 - $0.015", tokensRange: "2,000 - 5,000", best: "Higher accuracy" },
                { model: "GPT-4o Mini", costRange: "$0.001 - $0.003", tokensRange: "2,000 - 5,000", best: "Cheapest option" },
              ].map(item => (
                <div key={item.model} className="p-3 rounded-lg bg-muted/30 space-y-2">
                  <p className="text-sm font-semibold">{item.model}</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Cost per order: <span className="font-mono text-foreground">{item.costRange}</span></p>
                    <p>Tokens: <span className="font-mono text-foreground">{item.tokensRange}</span></p>
                    <p className="text-primary">{item.best}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Example:</strong> At 1,000 orders/month with GPT-4.1 Mini, your estimated monthly cost is approximately <span className="font-mono font-bold text-emerald-500">$3.00 - $5.00</span>. 
                With the smart page classification pipeline, multi-page documents cost the same as single-page ones.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
