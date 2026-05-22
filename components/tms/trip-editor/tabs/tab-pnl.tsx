"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Wallet, Truck, Receipt, Fuel, Coins, User } from "lucide-react";

interface Props {
  tripId: string;
  refreshKey: number;
  routeInfo: { distance_km: number };
}

export function TabPnL({ tripId, refreshKey, routeInfo }: Props) {
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/tms/trips/${tripId}/pnl`)
      .then(r => r.json())
      .then(d => { if (alive) { setPnl(d.pnl); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripId, refreshKey]);

  if (loading || !pnl) {
    return (
      <div className="p-4 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Calculating margin…
      </div>
    );
  }

  const revenue = Number(pnl.revenue_amount) || 0;
  const carrier = Number(pnl.carrier_cost_amount) || 0;
  const expenses = Number(pnl.expenses_amount) || 0;
  const fuel = Number(pnl.expenses_fuel) || 0;
  const tolls = Number(pnl.expenses_toll) || 0;
  const driver = Number(pnl.expenses_driver) || 0;
  const other = Number(pnl.expenses_other) || 0;
  const margin = Number(pnl.margin_amount) || 0;
  const marginPct = pnl.margin_percent != null ? Number(pnl.margin_percent) : null;
  const ccy = pnl.revenue_currency || "EUR";
  const isPos = margin >= 0;

  // €/km figure
  const distance = routeInfo.distance_km || pnl.distance_km || 0;
  const eurPerKm = distance > 0 ? margin / distance : null;

  return (
    <div className="h-full overflow-y-auto p-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Big margin card */}
      <div className={`lg:col-span-1 rounded-lg border p-4 ${isPos ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}>
        <div className="flex items-center gap-2 mb-2">
          <Wallet className={`h-4 w-4 ${isPos ? "text-emerald-400" : "text-red-400"}`} />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Net Margin</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tabular-nums ${isPos ? "text-emerald-300" : "text-red-300"}`}>
            {isPos ? "+" : ""}{margin.toFixed(0)}
          </span>
          <span className="text-sm text-muted-foreground">{ccy}</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {marginPct != null && (
            <span className={`text-xs font-semibold tabular-nums ${isPos ? "text-emerald-400" : "text-red-400"}`}>
              {marginPct.toFixed(1)}% margin
            </span>
          )}
          {eurPerKm != null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {eurPerKm.toFixed(2)} {ccy}/km
            </span>
          )}
          {isPos
            ? <TrendingUp className="h-4 w-4 text-emerald-400" />
            : <TrendingDown className="h-4 w-4 text-red-400" />
          }
        </div>
      </div>

      {/* Breakdown */}
      <div className="lg:col-span-2 rounded-lg border border-border/40 p-3">
        <h3 className="text-xs font-semibold mb-2">Breakdown</h3>
        <div className="space-y-1.5">
          <Line icon={Receipt} label="Revenue (orders)"        value={revenue}  ccy={ccy} positive />
          <Line icon={Truck}   label="Carrier cost (forwarding)" value={-carrier} ccy={ccy} />
          <div className="my-1 border-t border-border/30" />
          <Line icon={Fuel}    label="Fuel"          value={-fuel}   ccy={ccy} subtle />
          <Line icon={Coins}   label="Tolls"         value={-tolls}  ccy={ccy} subtle />
          <Line icon={User}    label="Driver per-diem" value={-driver} ccy={ccy} subtle />
          <Line icon={Receipt} label="Other expenses" value={-other}  ccy={ccy} subtle />
          <div className="my-1 border-t border-border/30" />
          <Line icon={Wallet}  label="Net margin"    value={margin}  ccy={ccy} bold />
        </div>
        {pnl.pending_review_count > 0 && (
          <p className="mt-3 text-[10px] text-amber-400">
            {pnl.pending_review_count} expense(s) pending review — they are included as cost until rejected.
          </p>
        )}
      </div>
    </div>
  );
}

function Line({ icon: I, label, value, ccy, positive, subtle, bold }: { icon: any; label: string; value: number; ccy: string; positive?: boolean; subtle?: boolean; bold?: boolean }) {
  const isNeg = value < 0;
  const tone = bold ? (value >= 0 ? "text-emerald-300" : "text-red-300") : positive ? "text-emerald-300" : isNeg ? (subtle ? "text-muted-foreground" : "text-red-300") : "text-foreground";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className={`inline-flex items-center gap-1.5 ${subtle ? "pl-3 text-muted-foreground" : ""}`}>
        <I className="h-3 w-3 opacity-60" />
        {label}
      </span>
      <span className={`tabular-nums ${tone} ${bold ? "font-bold text-sm" : ""}`}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)} {ccy}
      </span>
    </div>
  );
}
