"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Wallet } from "lucide-react";

export interface TripPnL {
  trip_id: string;
  revenue_amount: number;
  revenue_currency: string;
  carrier_cost_amount: number;
  expenses_amount: number;
  expenses_fuel: number;
  expenses_toll: number;
  expenses_driver: number;
  expenses_other: number;
  pending_review_count: number;
  margin_amount: number;
  margin_percent: number | null;
}

interface Props {
  tripId: string;
  refreshKey?: number;
  onClick?: () => void;
}

export function TripPnLPill({ tripId, refreshKey = 0, onClick }: Props) {
  const [pnl, setPnl] = useState<TripPnL | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/tms/trips/${tripId}/pnl`)
      .then(r => r.json())
      .then(d => { if (alive) { setPnl(d.pnl ?? null); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripId, refreshKey]);

  if (loading || !pnl) {
    return (
      <div className="flex items-center gap-2 bg-background/90 backdrop-blur-md rounded-lg border border-border/50 shadow-lg px-2.5 py-1.5">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">P&amp;L</span>
      </div>
    );
  }

  const margin = Number(pnl.margin_amount) || 0;
  const marginPct = pnl.margin_percent != null ? Number(pnl.margin_percent) : null;
  const isPositive = margin >= 0;
  const isHealthy = marginPct != null && marginPct >= 15;
  const isWeak = marginPct != null && marginPct < 5;

  const tone = !isPositive
    ? "border-red-500/40 text-red-400 bg-red-500/10"
    : isWeak
    ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
    : isHealthy
    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
    : "border-border/50 text-foreground bg-background/90";

  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 backdrop-blur-md rounded-lg border shadow-lg px-2.5 py-1.5 transition-all hover:scale-[1.02] ${tone}`}
      title={`Revenue ${pnl.revenue_amount.toFixed(0)} - Carrier ${pnl.carrier_cost_amount.toFixed(0)} - Expenses ${pnl.expenses_amount.toFixed(0)}`}
    >
      <Wallet className="h-3 w-3" />
      <span className="text-[10px] font-medium opacity-70">Margin</span>
      <span className="text-xs font-bold tabular-nums">
        {isPositive ? "+" : ""}{margin.toFixed(0)} {pnl.revenue_currency}
      </span>
      {marginPct != null && (
        <span className="text-[10px] font-medium opacity-70 tabular-nums">· {marginPct.toFixed(0)}%</span>
      )}
      <Icon className="h-3 w-3" />
      {pnl.pending_review_count > 0 && (
        <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-bold px-1">
          {pnl.pending_review_count}
        </span>
      )}
    </button>
  );
}
