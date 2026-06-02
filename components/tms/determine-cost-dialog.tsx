"use client";

/**
 * DetermineCostDialog
 * ──────────────────────────────────────────────────────────────────────────
 * Big modal that lets dispatchers compute a carrier cost from real units
 * (vehicle / trailer / driver) and pricing rules, then save the breakdown
 * to `carrier_cost_calculations` and (optionally) apply it to the parent
 * Order or Trip Leg's `carrier_cost` column.
 *
 * Layout:
 *   ┌─────────────────────────────┬────────────────────────────────┐
 *   │  Form (unit / period / km / │  Map                           │
 *   │  pricing / extras / total)  │   - original order stops       │
 *   │                             │   - GPS polyline (when pulled) │
 *   └─────────────────────────────┴────────────────────────────────┘
 *
 * Why scalable:
 *  - Persists EVERY computation (not just the final number) so the company
 *    can audit, re-issue, or attach to the carrier confirmation later.
 *  - Multiple pricing modes: per_km, per_day, per_hour, fixed, hybrid.
 *  - Dynamic "extras" array (jsonb) for ad-hoc surcharges (tolls, ferry,
 *    waiting, ADR, etc.) without schema churn.
 *  - GPS source recorded so we know whether distance came from Traccar
 *    (real km), the order route (planned km), or a manual edit.
 *
 * GPS strategy:
 *  - We hit `/api/traccar/route-history` (singular vehicleId) which returns
 *    raw positions. Distance is computed client-side via haversine sum, so
 *    we don't depend on the Traccar `summary` endpoint (which 404s when the
 *    vehicle has no `traccar_device_id`). The polyline is also drawn on
 *    the right-side map for visual confirmation.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calculator, Truck, User, Package, Loader2, Plus, Trash2, Satellite, MapPin, Save, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

// Lazy-load the Leaflet map so the dialog stays SSR-safe. Leaflet pokes at
// `window` on import which would otherwise crash hydration.
const CostRouteMap = dynamic(() => import("./determine-cost-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading map…
    </div>
  ),
});

// ───────────────────────── Types ─────────────────────────

type UnitType = "vehicle" | "trailer" | "driver";
type PricingMode = "per_km" | "per_day" | "per_hour" | "fixed" | "hybrid";
type GpsSource = "traccar" | "driver_app" | "odometer" | "manual" | "order_route";

interface UnitOption {
  id: string;
  type: UnitType;
  label: string;        // plate, name, etc.
  hasGps: boolean;      // distance source can be Traccar
  vehicleId?: string;   // for trailer/driver, the inferred vehicle to query
}

interface Extra {
  id: string;
  label: string;
  amount: number;
}

interface SavedCalculation {
  id: string;
  unit_label: string | null;
  pricing_mode: PricingMode;
  total_amount: number | null;
  currency: string;
  is_applied: boolean;
  created_at: string;
}

export interface CostMapStop {
  id: string;
  stop_type?: string;
  label: string;
  lat: number;
  lng: number;
}

export interface CostMapPosition {
  lat: number;
  lng: number;
  time?: string;
  /** km/h — used to segment driving vs stopped (break) periods. */
  speed?: number;
  /** Heading in degrees — used to rotate the direction arrows. */
  course?: number;
  /** Engine state — helps split a trip when the truck shuts down. */
  ignition?: boolean | null;
  /** Reverse-geocoded label shown in arrow/stop popups. */
  address?: string | null;
  /** Traccar running odometer (km). */
  totalDistance?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** "order" applies to orders.carrier_cost ; "leg" applies to trip_legs.carrier_cost */
  mode: "order" | "leg";
  /** Required when mode === "order" */
  orderId?: string;
  /** Required when mode === "leg" */
  legId?: string;
  /** Tenant scope. */
  adminId: string;
  /** Pre-fill: known period, vehicle/trailer/driver already on the leg. */
  defaults?: {
    vehicleId?: string | null;
    trailerId?: string | null;
    driverId?: string | null;
    periodFrom?: string | null;
    periodTo?: string | null;
    /** Planned distance from the order/leg route, used as a fallback to GPS. */
    plannedDistanceKm?: number | null;
    currency?: string;
    initialAmount?: number | null;
    /** Stops with lat/lng for the right-side map. */
    stops?: CostMapStop[];
  };
  /** Called when user clicks "Apply"; receives the computed values. */
  onApply: (result: {
    calculationId: string;
    amount: number;
    currency: string;
  }) => void;
}

// ───────────────────────── Helpers ─────────────────────────

const CURRENCIES = ["EUR", "RON", "USD", "GBP"];

/** Round to 2 decimals safely. */
const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Whole days between two ISO/local strings, min 1 if both provided. */
function daysBetween(from?: string | null, to?: string | null): number {
  if (!from || !to) return 0;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/** Hours between two ISO/local strings. */
function hoursBetween(from?: string | null, to?: string | null): number {
  if (!from || !to) return 0;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return round2(ms / 3_600_000);
}

/** Trim an ISO string to the format <input type="datetime-local"> wants. */
function toLocalInput(value?: string | null): string {
  if (!value) return "";
  // Accept both "YYYY-MM-DDTHH:mm[:ss[.sss]Z]" and short "YYYY-MM-DDTHH:mm" inputs.
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Haversine distance in kilometres between two WGS84 points. */
function haversineKm(a: CostMapPosition, b: CostMapPosition): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ─────────────────────── Component ───────────────────────

export function DetermineCostDialog({
  open,
  onOpenChange,
  mode,
  orderId,
  legId,
  adminId,
  defaults,
  onApply,
}: Props) {
  const supabase = React.useMemo(() => createClient(), []);

  // ── Form state ────────────────────────────────────────
  const [unitType, setUnitType] = React.useState<UnitType>("vehicle");
  const [unitOptions, setUnitOptions] = React.useState<UnitOption[]>([]);
  const [unitId, setUnitId] = React.useState<string>("");

  const [periodFrom, setPeriodFrom] = React.useState<string>(toLocalInput(defaults?.periodFrom));
  const [periodTo,   setPeriodTo]   = React.useState<string>(toLocalInput(defaults?.periodTo));

  // Re-sync when defaults change (e.g. user re-opens dialog for a new order).
  React.useEffect(() => {
    if (open) {
      setPeriodFrom(toLocalInput(defaults?.periodFrom));
      setPeriodTo(toLocalInput(defaults?.periodTo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaults?.periodFrom, defaults?.periodTo]);

  const [pricingMode, setPricingMode] = React.useState<PricingMode>("per_km");
  const [ratePerKm, setRatePerKm]     = React.useState<string>("");
  const [ratePerDay, setRatePerDay]   = React.useState<string>("");
  const [ratePerHour, setRatePerHour] = React.useState<string>("");
  const [fixedAmount, setFixedAmount] = React.useState<string>("");
  const [currency, setCurrency]       = React.useState<string>(defaults?.currency || "EUR");

  const [distanceKm, setDistanceKm]   = React.useState<string>(
    defaults?.plannedDistanceKm ? String(round2(defaults.plannedDistanceKm)) : "",
  );
  const [distanceLoading, setDistanceLoading] = React.useState(false);
  const [gpsSource, setGpsSource]     = React.useState<GpsSource>("manual");
  // GPS polyline drawn on the right-side map.
  const [gpsTrack, setGpsTrack]       = React.useState<CostMapPosition[]>([]);

  const [extras, setExtras]           = React.useState<Extra[]>([]);
  const [notes, setNotes]             = React.useState<string>("");

  const [saving, setSaving]                 = React.useState(false);
  const [savedHistory, setSavedHistory]     = React.useState<SavedCalculation[]>([]);

  // Reset GPS track when unit/period changes so an old track doesn't linger.
  React.useEffect(() => { setGpsTrack([]); }, [unitId, periodFrom, periodTo]);

  // Prefill unit when defaults arrive (after options load).
  React.useEffect(() => {
    if (!unitId && unitOptions.length > 0 && defaults) {
      const want =
        unitType === "vehicle" ? defaults.vehicleId :
        unitType === "trailer" ? defaults.trailerId :
        defaults.driverId;
      if (want && unitOptions.some(u => u.id === want)) setUnitId(want);
    }
  }, [unitOptions, defaults, unitType, unitId]);

  // ── Load fleet options for the chosen unit type ──────
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        if (unitType === "vehicle") {
          const { data } = await supabase
            .from("vehicles")
            .select("id, plate_number, make, model, traccar_device_id")
            .eq("admin_id", adminId)
            .order("plate_number");
          if (cancelled) return;
          setUnitOptions((data || []).map((v: any) => ({
            id: v.id,
            type: "vehicle" as const,
            label: `${v.plate_number}${v.make ? ` · ${v.make}${v.model ? " " + v.model : ""}` : ""}`,
            hasGps: !!v.traccar_device_id,
            vehicleId: v.id,
          })));
        } else if (unitType === "trailer") {
          // Real column on trailers is `trailer_type` (not `type`). The
          // previous query returned an error and left the dropdown
          // empty — so the user couldn't select any trailer even when
          // GPS-equipped ones existed. We also pull make/model so the
          // label is informative ("ABC-123 · Krone Schwarzmüller").
          const { data } = await supabase
            .from("trailers")
            .select("id, plate_number, make, model, trailer_type, traccar_device_id")
            .eq("admin_id", adminId)
            .order("plate_number");
          if (cancelled) return;
          setUnitOptions((data || []).map((t: any) => {
            const subtitle = [t.make, t.model].filter(Boolean).join(" ") || t.trailer_type;
            return {
              id: t.id,
              type: "trailer" as const,
              label: `${t.plate_number}${subtitle ? ` · ${subtitle}` : ""}`,
              // Trailers carry their OWN Traccar device. The
              // /api/traccar/asset-history endpoint accepts trailerId
              // directly, so no vehicle resolution is needed here.
              hasGps: !!t.traccar_device_id,
            };
          }));
        } else {
          // Drivers table has a single `name` column (no first/last
          // split) and no `vehicle_id`. To know which vehicle to use
          // for GPS history, we look up any OPEN
          // vehicle_usage_session for the driver — i.e. one without
          // a check-in time, meaning the driver is currently signed
          // out with that vehicle.
          const [{ data: drivers }, { data: openSessions }] = await Promise.all([
            supabase
              .from("drivers")
              .select("id, name, phone, last_lat, last_lng")
              .eq("admin_id", adminId)
              .order("name"),
            supabase
              .from("vehicle_usage_sessions")
              .select("driver_id, vehicle_id, check_out_time")
              .eq("admin_id", adminId)
              .is("check_in_time", null)
              .order("check_out_time", { ascending: false }),
          ]);
          if (cancelled) return;
          // Map each driver to the most recent open-session vehicle.
          // Sessions are pre-sorted by check_out_time desc, so the
          // first one we see for a driver wins.
          const driverVehicle = new Map<string, string>();
          for (const s of openSessions || []) {
            if (s.driver_id && s.vehicle_id && !driverVehicle.has(s.driver_id)) {
              driverVehicle.set(s.driver_id, s.vehicle_id);
            }
          }
          setUnitOptions((drivers || []).map((d: any) => {
            const vid = driverVehicle.get(d.id);
            return {
              id: d.id,
              type: "driver" as const,
              label: d.name || d.phone || "Driver",
              // GPS is reachable for the driver iff they are currently
              // signed out with a vehicle (which carries the Traccar
              // device). Without a session we can still let them be
              // picked — the option just won't show a GPS badge.
              hasGps: !!vid,
              vehicleId: vid,
            };
          }));
        }
      } catch (err) {
        console.error("[v0] DetermineCost unit load failed", err);
      }
    })();
    return () => { cancelled = true; };
  }, [open, unitType, adminId, supabase]);

  // ── Load existing calculations for context (history) ─
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const q = supabase
        .from("carrier_cost_calculations")
        .select("id, unit_label, pricing_mode, total_amount, currency, is_applied, created_at")
        .eq("admin_id", adminId)
        .order("created_at", { ascending: false })
        .limit(10);
      const { data } =
        mode === "order"
          ? await q.eq("order_id", orderId!)
          : await q.eq("trip_leg_id", legId!);
      if (!cancelled) setSavedHistory((data as SavedCalculation[]) || []);
    })();
    return () => { cancelled = true; };
  }, [open, mode, orderId, legId, adminId, supabase]);

  // ── Pull positions from Traccar and compute distance ─
  // We use route-history (singular vehicleId) instead of summary because
  // the summary endpoint 404s when no vehicles match the admin scope, and
  // we also want the polyline for the map. Distance is the haversine sum.
  const fetchGpsDistance = React.useCallback(async () => {
    const opt = unitOptions.find(u => u.id === unitId);
    if (!opt) {
      toast({ title: "Pick a unit first", variant: "destructive" });
      return;
    }
    // Three GPS shapes:
    //   - vehicle: query /route-history with the vehicle's id
    //   - trailer: query /asset-history with trailerId (the trailer
    //     has its own Traccar device, no vehicle to resolve)
    //   - driver:  query /route-history with the vehicle from the
    //     currently-open vehicle_usage_session (set as opt.vehicleId)
    const isTrailer = opt.type === "trailer";
    const vehicleForGps = opt.vehicleId || (opt.type === "vehicle" ? opt.id : undefined);
    if (isTrailer ? !opt.hasGps : !vehicleForGps || !opt.hasGps) {
      toast({
        title: "No GPS available",
        description: opt.type === "driver"
          ? "Driver has no open vehicle session — can't trace their GPS for this window."
          : "This unit has no Traccar device linked. Enter the distance manually.",
        variant: "destructive",
      });
      return;
    }
    if (!periodFrom || !periodTo) {
      toast({
        title: "Pick a period",
        description: "From and To dates are required to query GPS.",
        variant: "destructive",
      });
      return;
    }
    try {
      setDistanceLoading(true);
      const params = new URLSearchParams({
        adminId,
        from: new Date(periodFrom).toISOString(),
        to: new Date(periodTo).toISOString(),
      });
      if (isTrailer) {
        params.set("trailerId", opt.id);
      } else {
        params.set("vehicleId", vehicleForGps!);
      }
      // Trailers go through /asset-history (supports trailerId);
      // vehicles & drivers go through /route-history.
      const endpoint = isTrailer
        ? "/api/traccar/asset-history"
        : "/api/traccar/route-history";
      const res = await fetch(`${endpoint}?${params.toString()}`);
      // Try to extract a useful error message (the route returns JSON on errors).
      if (!res.ok) {
        let msg = `GPS error ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = String(j.error);
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const json = await res.json();
      const rawPositions: Array<{
        lat: number; lng: number; time?: string;
        speed?: number; course?: number; ignition?: boolean | null;
        address?: string | null; totalDistance?: number | null;
      }> = json?.positions || [];

      if (rawPositions.length === 0) {
        toast({
          title: "No GPS points in period",
          description: "Traccar returned no positions for this vehicle/window. Enter manually or widen the period.",
          variant: "destructive",
        });
        setGpsTrack([]);
        return;
      }

      const positions: CostMapPosition[] = rawPositions
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map(p => ({
          lat: p.lat,
          lng: p.lng,
          time: p.time,
          speed: p.speed,
          course: p.course,
          ignition: p.ignition,
          address: p.address,
          totalDistance: p.totalDistance,
        }));

      // Prefer Traccar's running totalDistance if available — it accounts
      // for engine-on/off gaps better than naïve haversine summation.
      const first = rawPositions[0]?.totalDistance;
      const last = rawPositions[rawPositions.length - 1]?.totalDistance;
      let totalKm = 0;
      if (typeof first === "number" && typeof last === "number" && last >= first) {
        totalKm = last - first;
      } else {
        for (let i = 1; i < positions.length; i++) {
          totalKm += haversineKm(positions[i - 1], positions[i]);
        }
      }

      setGpsTrack(positions);
      setDistanceKm(String(round2(totalKm)));
      setGpsSource("traccar");
      toast({ title: "GPS distance loaded", description: `${round2(totalKm)} km from ${positions.length} points` });
    } catch (err) {
      console.error("[v0] GPS distance fetch failed", err);
      toast({ title: "GPS fetch failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setDistanceLoading(false);
    }
  }, [unitId, unitOptions, periodFrom, periodTo, adminId]);

  // ── Live total ───────────────────────────────────────
  const computed = React.useMemo(() => {
    const km = parseFloat(distanceKm) || 0;
    const days = daysBetween(periodFrom, periodTo);
    const hrs = hoursBetween(periodFrom, periodTo);

    let subtotal = 0;
    switch (pricingMode) {
      case "per_km":
        subtotal = km * (parseFloat(ratePerKm) || 0);
        break;
      case "per_day":
        subtotal = days * (parseFloat(ratePerDay) || 0);
        break;
      case "per_hour":
        subtotal = hrs * (parseFloat(ratePerHour) || 0);
        break;
      case "fixed":
        subtotal = parseFloat(fixedAmount) || 0;
        break;
      case "hybrid":
        subtotal =
          km * (parseFloat(ratePerKm) || 0) +
          days * (parseFloat(ratePerDay) || 0) +
          hrs * (parseFloat(ratePerHour) || 0) +
          (parseFloat(fixedAmount) || 0);
        break;
    }
    const extrasTotal = extras.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      km: round2(km),
      days,
      hrs,
      subtotal: round2(subtotal),
      extrasTotal: round2(extrasTotal),
      total: round2(subtotal + extrasTotal),
    };
  }, [distanceKm, periodFrom, periodTo, pricingMode, ratePerKm, ratePerDay, ratePerHour, fixedAmount, extras]);

  // ── Build the row that will be persisted ─────────────
  const buildPayload = React.useCallback((apply: boolean) => {
    const opt = unitOptions.find(u => u.id === unitId);
    return {
      admin_id: adminId,
      order_id:    mode === "order" ? orderId : null,
      trip_leg_id: mode === "leg"   ? legId   : null,
      unit_type: opt?.type || null,
      unit_id:   opt?.id   || null,
      unit_label: opt?.label || null,
      period_from: periodFrom ? new Date(periodFrom).toISOString() : null,
      period_to:   periodTo   ? new Date(periodTo).toISOString()   : null,
      pricing_mode: pricingMode,
      rate_per_km:  ratePerKm  ? Number(ratePerKm)  : null,
      rate_per_day: ratePerDay ? Number(ratePerDay) : null,
      rate_per_hour: ratePerHour ? Number(ratePerHour) : null,
      fixed_amount: fixedAmount ? Number(fixedAmount) : null,
      distance_km: distanceKm ? Number(distanceKm) : null,
      duration_hours: computed.hrs || null,
      days: computed.days || null,
      extras: extras.map(e => ({ label: e.label, amount: Number(e.amount) || 0 })),
      subtotal: computed.subtotal,
      total_amount: computed.total,
      currency,
      gps_source: gpsSource,
      // Persist a small route geometry so we can later replay the polyline
      // when re-opening the calculation. Cap to ~500 points to stay sane.
      route_geometry: gpsTrack.length
        ? {
            type: "LineString",
            coordinates: gpsTrack
              .filter((_p, i, arr) => i % Math.max(1, Math.floor(arr.length / 500)) === 0)
              .map(p => [p.lng, p.lat]),
          }
        : null,
      notes: notes || null,
      is_applied: apply,
    };
  }, [
    unitOptions, unitId, mode, orderId, legId, adminId, periodFrom, periodTo,
    pricingMode, ratePerKm, ratePerDay, ratePerHour, fixedAmount, distanceKm,
    computed, extras, currency, gpsSource, gpsTrack, notes,
  ]);

  // ── Save (without applying) ──────���───────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(false);
      const { error } = await supabase.from("carrier_cost_calculations").insert(payload);
      if (error) throw error;
      toast({ title: "Saved", description: "Cost breakdown stored for this " + (mode === "order" ? "order" : "leg") });
      // refresh history
      const q = supabase
        .from("carrier_cost_calculations")
        .select("id, unit_label, pricing_mode, total_amount, currency, is_applied, created_at")
        .eq("admin_id", adminId)
        .order("created_at", { ascending: false })
        .limit(10);
      const { data } = mode === "order"
        ? await q.eq("order_id", orderId!)
        : await q.eq("trip_leg_id", legId!);
      setSavedHistory((data as SavedCalculation[]) || []);
    } catch (err) {
      console.error("[v0] Save calculation failed", err);
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Save & apply ─────────────────────────────────────
  const handleApply = async () => {
    setSaving(true);
    try {
      // Unset previously applied row (partial unique index allows only ONE
      // applied calc per order or per leg).
      const unsetQ = supabase
        .from("carrier_cost_calculations")
        .update({ is_applied: false })
        .eq("admin_id", adminId)
        .eq("is_applied", true);
      const { error: unsetErr } =
        mode === "order"
          ? await unsetQ.eq("order_id", orderId!)
          : await unsetQ.eq("trip_leg_id", legId!);
      if (unsetErr) throw unsetErr;

      const payload = buildPayload(true);
      const { data, error } = await supabase
        .from("carrier_cost_calculations")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      onApply({
        calculationId: data!.id,
        amount: computed.total,
        currency,
      });
      toast({ title: "Applied", description: `Carrier cost set to ${computed.total} ${currency}` });
      onOpenChange(false);
    } catch (err) {
      console.error("[v0] Apply calculation failed", err);
      toast({ title: "Apply failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────
  const selectedUnit = unitOptions.find(u => u.id === unitId);
  const stops = defaults?.stops || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The dialog is wide on purpose: a 2-column layout (form + map +
          totals) needs at least ~1100px to read comfortably. We let it
          grow to 1500px on big screens and fall back to 95vw on narrower
          ones so the side panel behind it never clips the dialog edges. */}
      {/* Flex-column DialogContent so:
            – the header sits at the top (auto height)
            – the 2-column body fills the remaining space (`flex-1 min-h-0`)
            – the footer stays PINNED at the bottom regardless of body height
          Previously the body used `max-h: calc(92vh - 120px)` which was
          larger than the actual remaining space and pushed the footer
          (Cancel / Save breakdown / Apply) below the viewport. */}
      <DialogContent className="!max-w-[min(1500px,95vw)] w-[95vw] h-[88vh] max-h-[760px] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Determine Carrier Cost
          </DialogTitle>
          <DialogDescription>
            Pick a unit, its period, pricing rule and (optionally) pull real GPS distance. The full breakdown is saved
            for audit and re-issue on the carrier confirmation.
          </DialogDescription>
        </DialogHeader>

        {/* Two-column body: form on the left, map on the right. On wide
            screens we give the map slightly more space (it's the visual
            anchor) but keep both columns ≥ 460px so the form fields and
            the map controls never get crushed. Below lg the map drops
            beneath the form so phones stay usable. */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(460px,520px)_minmax(0,1fr)] gap-0">
          {/* ── LEFT: scrollable form ── */}
          <div className="overflow-y-auto p-5 space-y-5 border-r border-border/40">
            {/* Step 1 — Unit picker */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">1</Badge>
                <Label className="text-sm font-medium">Pick a unit</Label>
              </div>
              <Tabs value={unitType} onValueChange={(v) => { setUnitType(v as UnitType); setUnitId(""); }}>
                {/* `gap-1` + tighter text so the icon never overlaps the
                    label when the form column is at its narrowest. */}
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="vehicle" className="text-xs gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    <span>Vehicle</span>
                  </TabsTrigger>
                  <TabsTrigger value="trailer" className="text-xs gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    <span>Trailer</span>
                  </TabsTrigger>
                  <TabsTrigger value="driver" className="text-xs gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span>Driver</span>
                  </TabsTrigger>
                </TabsList>
                {(["vehicle", "trailer", "driver"] as const).map(t => (
                  <TabsContent key={t} value={t} className="mt-3">
                    <Select value={unitId} onValueChange={setUnitId}>
                      <SelectTrigger><SelectValue placeholder={`Select a ${t}…`} /></SelectTrigger>
                      <SelectContent>
                        {unitOptions.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            <div className="flex items-center gap-2">
                              <span>{u.label}</span>
                              {u.hasGps && (
                                <Badge variant="outline" className="text-[8px] py-0 h-4 text-emerald-400 border-emerald-500/30">GPS</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                        {unitOptions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">No {t}s found.</div>
                        )}
                      </SelectContent>
                    </Select>
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            <Separator />

            {/* Step 2 — Period (auto-filled from first/last stop dates) */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">2</Badge>
                <Label className="text-sm font-medium">Period</Label>
                <span className="text-[10px] text-muted-foreground">first stop → last stop</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">From</Label>
                  <Input type="datetime-local" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">To</Label>
                  <Input type="datetime-local" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
                </div>
              </div>
            </section>

            <Separator />

            {/* Step 3 — Distance */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">3</Badge>
                <Label className="text-sm font-medium">Distance</Label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="km"
                    value={distanceKm}
                    onChange={e => { setDistanceKm(e.target.value); setGpsSource("manual"); }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={distanceLoading || !selectedUnit?.hasGps}
                  onClick={fetchGpsDistance}
                  title={selectedUnit?.hasGps ? "Pull positions from Traccar and sum the distance" : "Selected unit has no Traccar device"}
                >
                  {distanceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Satellite className="h-3.5 w-3.5 mr-1" />}
                  Get GPS distance
                </Button>
                {defaults?.plannedDistanceKm != null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDistanceKm(String(round2(defaults.plannedDistanceKm!))); setGpsSource("order_route"); }}
                  >
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                    Use route ({round2(defaults.plannedDistanceKm)} km)
                  </Button>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Source: <span className="font-mono">{gpsSource}</span>
                {gpsSource === "traccar" && ` · ${gpsTrack.length} GPS points`}
                {gpsSource === "order_route" && " · planned route"}
                {gpsSource === "manual" && " · entered manually"}
              </div>
            </section>

            <Separator />

            {/* Step 4 — Pricing */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">4</Badge>
                <Label className="text-sm font-medium">Pricing</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Mode</Label>
                  <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as PricingMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_km">Price / km</SelectItem>
                      <SelectItem value="per_day">Price / day</SelectItem>
                      <SelectItem value="per_hour">Price / hour</SelectItem>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                      <SelectItem value="hybrid">Hybrid (km + day + hour + fixed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(pricingMode === "per_km" || pricingMode === "hybrid") && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Rate / km</Label>
                    <Input type="number" step="0.01" value={ratePerKm} onChange={e => setRatePerKm(e.target.value)} />
                  </div>
                )}
                {(pricingMode === "per_day" || pricingMode === "hybrid") && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Rate / day</Label>
                    <Input type="number" step="0.01" value={ratePerDay} onChange={e => setRatePerDay(e.target.value)} />
                  </div>
                )}
                {(pricingMode === "per_hour" || pricingMode === "hybrid") && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Rate / hour</Label>
                    <Input type="number" step="0.01" value={ratePerHour} onChange={e => setRatePerHour(e.target.value)} />
                  </div>
                )}
                {(pricingMode === "fixed" || pricingMode === "hybrid") && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Fixed amount</Label>
                    <Input type="number" step="0.01" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} />
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Step 5 — Extras */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">5</Badge>
                  <Label className="text-sm font-medium">Extras (tolls, ferry, ADR…)</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtras([...extras, { id: crypto.randomUUID(), label: "", amount: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add extra
                </Button>
              </div>
              <div className="space-y-2">
                {extras.map((x, i) => (
                  <div key={x.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Label (e.g. Toll Brenner)"
                      value={x.label}
                      onChange={e => setExtras(extras.map((y, j) => j === i ? { ...y, label: e.target.value } : y))}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={x.amount}
                      onChange={e => setExtras(extras.map((y, j) => j === i ? { ...y, amount: parseFloat(e.target.value) || 0 } : y))}
                      className="w-32"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                ))}
                {extras.length === 0 && <p className="text-[11px] text-muted-foreground">No extras yet.</p>}
              </div>
            </section>

            <Separator />

            {/* Notes */}
            <section className="space-y-2">
              <Label className="text-sm font-medium">Notes (internal)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes for the carrier confirmation…" />
            </section>

            {/* Recent saved breakdowns */}
            {savedHistory.length > 0 && (
              <section className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Recent calculations</Label>
                <div className="space-y-1">
                  {savedHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{h.unit_label || "—"}</span>
                        <Badge variant="outline" className="text-[9px] py-0">{h.pricing_mode}</Badge>
                        {h.is_applied && <Badge className="text-[9px] py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Applied</Badge>}
                      </div>
                      <span className="font-mono">{round2(h.total_amount || 0)} {h.currency}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT: map + live total ── */}
          <div className="flex flex-col min-h-[320px] lg:min-h-0">
            <div className="flex-1 min-h-[260px] lg:min-h-0 bg-muted/20">
              <CostRouteMap stops={stops} track={gpsTrack} unitLabel={selectedUnit?.label} />
            </div>
            {/* Live total pinned under the map */}
            <div className="border-t border-border/40 bg-card/40 p-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Distance</div>
                  <div className="font-mono">{computed.km} km</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Days · Hours</div>
                  <div className="font-mono">{computed.days}d · {computed.hrs}h</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Extras</div>
                  <div className="font-mono">{computed.extrasTotal} {currency}</div>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Subtotal</div>
                  <div className="font-mono text-sm">{computed.subtotal} {currency}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                  <div className="text-2xl font-bold text-primary">{computed.total} <span className="text-sm">{currency}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 px-5 py-3 border-t border-border/40 shrink-0 bg-card/40">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save breakdown
          </Button>
          <Button onClick={handleApply} disabled={saving || computed.total <= 0}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Calculator className="h-3.5 w-3.5 mr-1" />}
            Apply to Carrier Cost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
