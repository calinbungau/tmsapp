"use client";

import { useMemo, useState } from "react";
import {
  Route, Clock, Package, MapPin, AlertTriangle, Fuel, Receipt,
  Coins, Sparkles, AlertCircle, CheckCircle2, Timer,
} from "lucide-react";
import { checkDrivingRules, type DrivingRulesViolation } from "@/lib/tms/driving-rules";
import { forecastTolls, distancesByStopCountry, type TollForecast } from "@/lib/tms/toll-calculator";
import { optimizeStopOrder, type OptimizeResult } from "@/lib/tms/stop-optimizer";

interface Props {
  tripId: string;
  trip: any;
  stops: any[];
  linkedOrders: any[];
  routeInfo: { geometry: [number, number][] | null; distance_km: number; duration_hours: number; legs: any[] };
  onOptimizeStops?: (newOrder: any[]) => void;
}

export function TabOverview({ trip, stops, linkedOrders, routeInfo, onOptimizeStops }: Props) {
  const distance = routeInfo.distance_km || trip?.distance_km || 0;
  const durationHours = routeInfo.duration_hours || (trip?.duration_minutes ? trip.duration_minutes / 60 : 0);
  const totalRevenue = linkedOrders.reduce((s: number, o: any) => s + (Number(o.customer_price) || 0), 0);
  const revenueCurrency = linkedOrders.find((o: any) => o.customer_currency)?.customer_currency || "EUR";
  const fuelL = (distance / 100) * 25;
  const fuelCost = fuelL * 1.45;

  // Driving rules check
  const drivingViolations = useMemo<DrivingRulesViolation[]>(() => {
    const legs = routeInfo.legs?.map((l: any) => ({ duration_minutes: l?.duration_min ?? 0 })) || [];
    return checkDrivingRules(legs);
  }, [routeInfo.legs]);

  // Toll forecast
  const tollForecast = useMemo<TollForecast>(() => {
    const dists = distancesByStopCountry(stops);
    return forecastTolls(dists);
  }, [stops]);

  // Stop optimization suggestion
  const [optimizing, setOptimizing] = useState(false);
  const optimization = useMemo<OptimizeResult | null>(() => {
    if (stops.length < 4) return null;
    const optStops = stops.map((s: any) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      stop_type: s.stop_type,
      order_id: s.order_id,
    }));
    return optimizeStopOrder(optStops);
  }, [stops]);

  const stats = [
    { icon: Route,    label: "Distance",  value: `${Math.round(distance)} km`,                            tone: "text-blue-400" },
    { icon: Clock,    label: "Duration",  value: `${Math.floor(durationHours)}h ${Math.round((durationHours % 1) * 60)}m`, tone: "text-violet-400" },
    { icon: MapPin,   label: "Stops",     value: `${stops.length}`,                                       tone: "text-emerald-400" },
    { icon: Package,  label: "Orders",    value: `${linkedOrders.length}`,                                tone: "text-amber-400" },
    { icon: Receipt,  label: "Revenue",   value: `${totalRevenue.toFixed(0)} ${revenueCurrency}`,         tone: "text-emerald-400" },
    { icon: Fuel,     label: "Est. fuel", value: `${fuelL.toFixed(0)}L · ${fuelCost.toFixed(0)} EUR`,     tone: "text-orange-400" },
  ];

  const handleApplyOptimization = () => {
    if (!optimization || !onOptimizeStops) return;
    setOptimizing(true);
    // Map back to full stop objects in new order
    const newOrder = optimization.order.map((opt) => stops.find((s: any) => s.id === opt.id));
    onOptimizeStops(newOrder.filter(Boolean));
    setOptimizing(false);
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {stats.map(s => {
          const I = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
              <I className={`h-4 w-4 ${s.tone}`} />
              <div className="min-w-0">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                <div className="text-xs font-bold tabular-nums truncate">{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Planning Helpers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Driving Rules */}
        <div className={`rounded-lg border p-3 ${
          drivingViolations.length === 0
            ? "border-emerald-500/30 bg-emerald-500/5"
            : drivingViolations.some(v => v.severity === "error")
              ? "border-red-500/30 bg-red-500/5"
              : "border-amber-500/30 bg-amber-500/5"
        }`}>
          <h3 className="text-[10px] uppercase tracking-wide font-semibold mb-1.5 flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" />
            EU 561 Driving Rules
          </h3>
          {drivingViolations.length === 0 ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All clear — no violations detected
            </div>
          ) : (
            <ul className="space-y-1">
              {drivingViolations.slice(0, 3).map((v, i) => (
                <li key={i} className={`text-[11px] flex items-start gap-1.5 ${
                  v.severity === "error" ? "text-red-300" : "text-amber-300"
                }`}>
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{v.message}</span>
                </li>
              ))}
              {drivingViolations.length > 3 && (
                <li className="text-[10px] text-muted-foreground">+{drivingViolations.length - 3} more</li>
              )}
            </ul>
          )}
        </div>

        {/* Toll Forecast */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <h3 className="text-[10px] uppercase tracking-wide font-semibold mb-1.5 flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            Est. Tolls
          </h3>
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-lg font-bold tabular-nums text-orange-400">{tollForecast.totalEur.toFixed(0)}</span>
            <span className="text-[10px] text-muted-foreground">EUR</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {tollForecast.byCountry.filter(c => c.eur > 0).slice(0, 5).map(c => (
              <span key={c.country} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 font-mono">
                {c.country}: {c.eur.toFixed(0)}
              </span>
            ))}
          </div>
        </div>

        {/* Stop Optimization */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <h3 className="text-[10px] uppercase tracking-wide font-semibold mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Route Optimization
          </h3>
          {stops.length < 4 ? (
            <div className="text-[11px] text-muted-foreground">Add 4+ stops to enable optimization</div>
          ) : optimization && optimization.distanceAfterKm < optimization.distanceBeforeKm - 1 ? (
            <div className="space-y-1.5">
              <div className="text-[11px] text-emerald-300">
                Could save ~{Math.round(optimization.distanceBeforeKm - optimization.distanceAfterKm)} km
              </div>
              {onOptimizeStops && (
                <button
                  type="button"
                  onClick={handleApplyOptimization}
                  disabled={optimizing}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/15 text-primary hover:bg-primary/25 font-medium"
                >
                  <Sparkles className="h-3 w-3" />
                  Apply optimal order
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Stop order is already optimal
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Stop sequence */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Stop Sequence
          </h3>
          <ol className="space-y-1.5">
            {stops.map((s: any, i: number) => (
              <li key={s.id ?? i} className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">{i + 1}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold ${
                  s.stop_type === "pickup" ? "bg-blue-500/15 text-blue-300" :
                  s.stop_type === "delivery" ? "bg-emerald-500/15 text-emerald-300" :
                  "bg-muted text-muted-foreground"
                }`}>{s.stop_type}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.company_name || s.address || "—"}</div>
                  <div className="text-muted-foreground truncate">
                    {s.city || ""}{s.country ? `, ${s.country}` : ""}
                    {s.planned_date ? ` · ${s.planned_date}` : ""}
                    {s.planned_time_from ? ` ${s.planned_time_from}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Linked orders */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-muted-foreground" /> Linked Orders
          </h3>
          {linkedOrders.length === 0 ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-3 px-2 rounded-md bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              No orders linked. Add orders from the left sidebar.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {linkedOrders.map((o: any) => (
                <li key={o.id} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-md bg-background/40 border border-border/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold">{o.reference_number}</span>
                    <span className="text-muted-foreground truncate">{o.customer_name || o.customer?.name || ""}</span>
                  </div>
                  <span className="font-bold tabular-nums shrink-0">
                    {Number(o.customer_price || 0).toFixed(0)} {o.customer_currency || "EUR"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
