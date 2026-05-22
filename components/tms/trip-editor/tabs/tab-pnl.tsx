"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Wallet, Truck, Receipt, Fuel, Coins, User, Pencil, Save, X, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface DriverRate {
  driver_id: string | null;
  driver_name: string | null;
  effective_mode: "hourly" | "per_km";
  effective_hourly_rate: number | null;
  effective_rate_per_km: number | null;
  default_mode: "hourly" | "per_km" | null;
  default_hourly_rate: number | null;
  default_rate_per_km: number | null;
  override_mode: "hourly" | "per_km" | null;
  override_hourly_rate: number | null;
  override_rate_per_km: number | null;
  distance_km: number | null;
  hours: number | null;
}

interface Props {
  tripId: string;
  refreshKey: number;
  routeInfo: { distance_km: number };
}

export function TabPnL({ tripId, refreshKey, routeInfo }: Props) {
  const [pnl, setPnl] = useState<any>(null);
  const [driverRate, setDriverRate] = useState<DriverRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [draftMode, setDraftMode] = useState<"hourly" | "per_km">("hourly");
  const [draftHourly, setDraftHourly] = useState("");
  const [draftPerKm, setDraftPerKm] = useState("");
  const [innerRefresh, setInnerRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/tms/trips/${tripId}/pnl`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        setPnl(d.pnl);
        setDriverRate(d.driver_rate ?? null);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripId, refreshKey, innerRefresh]);

  const startEditRate = () => {
    if (!driverRate) return;
    setDraftMode(driverRate.effective_mode);
    setDraftHourly(
      driverRate.effective_hourly_rate != null ? String(driverRate.effective_hourly_rate) : ""
    );
    setDraftPerKm(
      driverRate.effective_rate_per_km != null ? String(driverRate.effective_rate_per_km) : ""
    );
    setEditingRate(true);
  };

  const saveRateOverride = async () => {
    setSavingRate(true);
    try {
      const supabase = createClient();
      const payload: Record<string, any> = {
        driver_rate_mode: draftMode,
        driver_hourly_rate: draftMode === "hourly" && draftHourly !== "" ? Number(draftHourly) : null,
        driver_rate_per_km: draftMode === "per_km" && draftPerKm !== "" ? Number(draftPerKm) : null,
      };
      await supabase.from("trips").update(payload).eq("id", tripId);
      setEditingRate(false);
      setInnerRefresh(x => x + 1);
    } finally {
      setSavingRate(false);
    }
  };

  const clearOverride = async () => {
    setSavingRate(true);
    try {
      const supabase = createClient();
      await supabase.from("trips").update({
        driver_rate_mode: null,
        driver_hourly_rate: null,
        driver_rate_per_km: null,
      }).eq("id", tripId);
      setEditingRate(false);
      setInnerRefresh(x => x + 1);
    } finally {
      setSavingRate(false);
    }
  };

  if (loading || !pnl) {
    return (
      <div className="p-4 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Calculating margin…
      </div>
    );
  }

  const revenue = Number(pnl.revenue_amount) || 0;
  const carrier = Number(pnl.carrier_cost_amount) || 0;
  const fuel = Number(pnl.expenses_fuel) || 0;
  const tolls = Number(pnl.expenses_toll) || 0;
  const driverPerDiem = Number(pnl.expenses_driver) || 0;
  const other = Number(pnl.expenses_other) || 0;
  const driverWage = Number(pnl.driver_wage) || 0;
  const wageBasis = pnl.driver_wage_basis as { qty: number; unit: "h" | "km"; rate: number } | null;
  const margin = Number(pnl.margin_amount) || 0;
  const marginPct = pnl.margin_percent != null ? Number(pnl.margin_percent) : null;
  const ccy = pnl.revenue_currency || "EUR";
  const isPos = margin >= 0;

  const distance = routeInfo.distance_km || pnl.distance_km || 0;
  const eurPerKm = distance > 0 ? margin / distance : null;

  const hasOverride =
    !!driverRate?.override_mode ||
    driverRate?.override_hourly_rate != null ||
    driverRate?.override_rate_per_km != null;

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

        {/* Driver Pay editor */}
        {driverRate?.driver_id && (
          <div className="mt-4 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <User className="h-3 w-3" />
                Driver Pay {driverRate.driver_name ? `· ${driverRate.driver_name}` : ""}
              </span>
              {!editingRate && (
                <button
                  type="button"
                  onClick={startEditRate}
                  className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>

            {!editingRate ? (
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {driverRate.effective_mode === "per_km"
                      ? `${(driverRate.effective_rate_per_km ?? 0).toFixed(3)} ${ccy}/km × ${(driverRate.distance_km ?? 0).toFixed(0)} km`
                      : `${(driverRate.effective_hourly_rate ?? 0).toFixed(2)} ${ccy}/h × ${(driverRate.hours ?? 0).toFixed(2)} h`}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {driverWage.toFixed(2)} {ccy}
                  </span>
                </div>
                {hasOverride ? (
                  <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                    Trip override active
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Using driver default</span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Select value={draftMode} onValueChange={(v) => setDraftMode(v as "hourly" | "per_km")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly (EUR/h)</SelectItem>
                    <SelectItem value="per_km">Per km (EUR/km)</SelectItem>
                  </SelectContent>
                </Select>
                {draftMode === "hourly" ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draftHourly}
                    onChange={(e) => setDraftHourly(e.target.value)}
                    placeholder="EUR / hour"
                    className="h-8 text-xs"
                  />
                ) : (
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={draftPerKm}
                    onChange={(e) => setDraftPerKm(e.target.value)}
                    placeholder="EUR / km"
                    className="h-8 text-xs"
                  />
                )}
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={saveRateOverride}
                    disabled={savingRate}
                    className="h-7 text-[11px] flex-1"
                  >
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                  {hasOverride && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={clearOverride}
                      disabled={savingRate}
                      className="h-7 text-[11px]"
                      title="Reset to driver default"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingRate(false)}
                    disabled={savingRate}
                    className="h-7 text-[11px]"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Default:{" "}
                  {driverRate.default_mode === "per_km"
                    ? `${(driverRate.default_rate_per_km ?? 0).toFixed(3)} ${ccy}/km`
                    : `${(driverRate.default_hourly_rate ?? 0).toFixed(2)} ${ccy}/h`}
                </p>
              </div>
            )}
          </div>
        )}
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
          <Line
            icon={User}
            label={
              wageBasis
                ? `Driver wage (${wageBasis.qty.toFixed(wageBasis.unit === "km" ? 0 : 2)} ${wageBasis.unit} × ${wageBasis.rate.toFixed(wageBasis.unit === "km" ? 3 : 2)})`
                : "Driver wage"
            }
            value={-driverWage}
            ccy={ccy}
            subtle
          />
          <Line icon={User}    label="Driver per-diem" value={-driverPerDiem} ccy={ccy} subtle />
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
