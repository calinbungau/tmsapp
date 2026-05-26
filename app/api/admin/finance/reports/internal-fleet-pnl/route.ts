import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Internal Fleet P&L
 * ------------------
 * One row per Trip (`trips`). For each trip we compute:
 *
 *   revenue_eur        = SUM over orders touched by the trip of:
 *                          customer_price (EUR-converted)
 *                          minus subcontracted-cost share for that order
 *                          (sum of child sub-orders' carrier_cost +
 *                           any trip_legs.carrier_cost on that order
 *                           that are NOT this internal trip's legs).
 *                        For a 100% internal order the subtraction is zero
 *                        and revenue_eur === customer_price_eur.
 *
 *   actual_cost_eur    = SUM(cost_entries.amount_eur_excl_vat WHERE trip_id = T)
 *                      + SUM(trip_expenses.amount_eur_excl_vat WHERE trip_id = T)
 *                        (we use _excl_vat because input VAT is recoverable;
 *                         falls back to amount_eur if excl_vat is null)
 *
 *   planned_cost_eur   = pro-rated slice of any cost_budgets matching the
 *                        trip's vehicle and overlapping the trip period.
 *                        Returns null when no relevant budget exists.
 *
 *   profit_eur         = revenue_eur - actual_cost_eur
 *   margin_pct         = profit_eur / revenue_eur * 100   (null if rev <= 0)
 *
 * The route returns ONLY trips that have at least one internal leg
 * (assignment_type = 'internal' OR vehicle_id IS NOT NULL with no carrier_id),
 * since this report is dedicated to the internal fleet.
 */
type Currency = string | null;

type TripRow = {
  id: string;
  reference_number: string | null;
  status: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  vehicle_id: string | null;
  trailer_id: string | null;
  driver_id: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  carrier_id: string | null;
  assignment_type: string | null;
};

type LegRow = {
  id: string;
  trip_id: string | null;
  forwarding_order_id: string | null;
  assignment_type: string | null;
  vehicle_id: string | null;
  carrier_id: string | null;
  carrier_cost: number | null;
  carrier_currency: Currency;
  leg_number: number | null;
  origin_address: string | null;
  destination_address: string | null;
  status: string | null;
  driver_id: string | null;
};

type OrderRow = {
  id: string;
  reference_number: string | null;
  parent_order_id: string | null;
  status: string | null;
  customer_id: string | null;
  customer_price: number | null;
  customer_currency: Currency;
  carrier_cost: number | null;
  carrier_currency: Currency;
  commercial_role: string | null;
  customer_reference: string | null;
  cargo_description: string | null;
  weight_kg: number | null;
  pallet_count: number | null;
};

type CostEntryRow = {
  id: string;
  trip_id: string | null;
  trip_leg_id: string | null;
  order_id: string | null;
  vehicle_id: string | null;
  amount_eur_excl_vat: number | null;
  amount_eur: number | null;
  category: string | null;
  cost_code: string | null;
  occurred_at: string | null;
};

type TripExpenseRow = {
  id: string;
  trip_id: string | null;
  leg_id: string | null;
  order_id: string | null;
  amount_eur_excl_vat: number | null;
  amount_eur: number | null;
  category: string | null;
  occurred_at: string | null;
};

type BudgetRow = {
  id: string;
  vehicle_id: string | null;
  total_budget_amount: number | null;
  period_start: string | null;
  period_end: string | null;
  scope_level: string | null;
  status: string | null;
  currency: string | null;
};

type TripPnlRow = {
  trip_id: string;
  distance_km: number | null;
  duration_minutes: number | null;
  expenses_amount: number | null;
  expenses_fuel: number | null;
  expenses_toll: number | null;
  expenses_driver: number | null;
  expenses_other: number | null;
};

type ApiOrderSummary = {
  order_id: string;
  reference_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_reference: string | null;
  status: string | null;
  customer_price_eur: number;
  subcontracted_cost_eur: number;
  internal_revenue_eur: number;
  internal_legs: number;
  subcontracted_legs: number;
  has_subcontract_children: boolean;
  cargo_description: string | null;
  weight_kg: number | null;
  pallet_count: number | null;
};

type ApiLegSummary = {
  leg_id: string;
  leg_number: number | null;
  assignment_type: string | null;
  origin: string | null;
  destination: string | null;
  status: string | null;
  order_id: string | null;
  order_ref: string | null;
};

export type FleetPnlRow = {
  trip_id: string;
  reference_number: string | null;
  status: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  trailer_id: string | null;
  trailer_label: string | null;
  driver_id: string | null;
  driver_name: string | null;
  distance_km: number;
  duration_hours: number;
  // Money (EUR)
  revenue_eur: number;
  actual_cost_eur: number;
  planned_cost_eur: number | null;
  profit_eur: number;
  margin_pct: number | null;
  cost_per_km: number | null;
  revenue_per_km: number | null;
  profit_per_km: number | null;
  // Cost breakdown (EUR)
  cost_fuel_eur: number;
  cost_toll_eur: number;
  cost_driver_eur: number;
  cost_other_eur: number;
  // Composition flags
  is_mixed: boolean;
  internal_leg_count: number;
  subcontract_leg_count: number;
  order_count: number;
  // Nested
  orders: ApiOrderSummary[];
  legs: ApiLegSummary[];
};

/* ---------------- helpers ---------------- */

function toEur(amount: number | null | undefined, currency: Currency, fxMap: Map<string, number>): number {
  const a = Number(amount ?? 0);
  if (!a) return 0;
  const c = (currency || "EUR").toUpperCase();
  if (c === "EUR") return a;
  // fxMap stores rate_to_eur. Fall back to 1 if missing rather than dropping money.
  const r = fxMap.get(c) ?? 1;
  return a * r;
}

/** Pick the most-recent rate per currency from fx_rates (rate_to_ron). */
async function loadFxToEurMap(
  sb: ReturnType<typeof serviceClient>,
): Promise<Map<string, number>> {
  // The schema only exposes rate_to_ron. We compute X→EUR = rate_to_ron(X) / rate_to_ron(EUR).
  const { data } = await sb
    .from("fx_rates")
    .select("currency, rate_to_ron, rate_date")
    .order("rate_date", { ascending: false })
    .limit(500);
  const latest = new Map<string, number>();
  for (const r of data ?? []) {
    const c = String((r as any).currency || "").toUpperCase();
    if (!c || latest.has(c)) continue;
    const v = Number((r as any).rate_to_ron);
    if (Number.isFinite(v) && v > 0) latest.set(c, v);
  }
  const eurToRon = latest.get("EUR") ?? 5; // safe default if RON FX missing
  const out = new Map<string, number>();
  out.set("EUR", 1);
  for (const [c, ronPerUnit] of latest.entries()) {
    if (c === "EUR") continue;
    out.set(c, ronPerUnit / eurToRon); // X→EUR
  }
  return out;
}

function computeOverlapDays(
  budgetStart: string | null,
  budgetEnd: string | null,
  tripStart: string | null,
  tripEnd: string | null,
): { overlapDays: number; budgetDays: number } {
  if (!budgetStart || !budgetEnd) return { overlapDays: 0, budgetDays: 0 };
  const bs = new Date(budgetStart + "T00:00:00").getTime();
  const be = new Date(budgetEnd + "T23:59:59").getTime();
  const ts = tripStart ? new Date(tripStart).getTime() : bs;
  const te = tripEnd ? new Date(tripEnd).getTime() : ts;
  const start = Math.max(bs, ts);
  const end = Math.min(be, te);
  if (end <= start) return { overlapDays: 0, budgetDays: 0 };
  const dayMs = 86400000;
  return {
    overlapDays: Math.max(1, Math.round((end - start) / dayMs)),
    budgetDays: Math.max(1, Math.round((be - bs) / dayMs)),
  };
}

/* ---------------- main ---------------- */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const adminId = sp.get("admin_id");
  if (!adminId) return NextResponse.json({ items: [] }, { status: 200 });

  const from = sp.get("from"); // YYYY-MM-DD
  const to = sp.get("to");
  const includePlanned = sp.get("planned") !== "0"; // default ON

  const sb = serviceClient();

  // 1. Trips in window for this admin
  let tripsQ = sb
    .from("trips")
    .select(
      "id, reference_number, status, planned_start, planned_end, actual_start, actual_end, vehicle_id, trailer_id, driver_id, distance_km, duration_minutes, carrier_id, assignment_type",
    )
    .eq("admin_id", adminId)
    .order("planned_start", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (from) tripsQ = tripsQ.gte("planned_start", `${from}T00:00:00`);
  if (to) tripsQ = tripsQ.lte("planned_start", `${to}T23:59:59`);

  const { data: trips, error: tripErr } = await tripsQ;
  if (tripErr) {
    console.log("[v0] internal-fleet-pnl trips error:", tripErr.message);
    return NextResponse.json({ error: tripErr.message }, { status: 500 });
  }

  const tripsArr = (trips ?? []) as TripRow[];
  if (!tripsArr.length) {
    return NextResponse.json({ items: [] });
  }

  const tripIds = tripsArr.map(t => t.id);

  // 2. Legs across all those trips, in one shot
  const { data: legs } = await sb
    .from("trip_legs")
    .select(
      "id, trip_id, forwarding_order_id, assignment_type, vehicle_id, carrier_id, carrier_cost, carrier_currency, leg_number, origin_address, destination_address, status, driver_id",
    )
    .in("trip_id", tripIds);
  const legsArr = (legs ?? []) as LegRow[];

  // Trips that are 100% subcontracted (no internal leg) get filtered out.
  const internalTripIds = new Set<string>();
  for (const l of legsArr) {
    const isInternal =
      l.assignment_type === "internal" ||
      (!l.carrier_id && (l.vehicle_id || l.assignment_type === null));
    if (isInternal && l.trip_id) internalTripIds.add(l.trip_id);
  }
  // Also keep trips whose top-level row is internal even if legs missing
  for (const t of tripsArr) {
    if (
      t.assignment_type === "internal" ||
      (!t.carrier_id && (t.vehicle_id || !t.assignment_type))
    ) {
      internalTripIds.add(t.id);
    }
  }

  const filteredTrips = tripsArr.filter(t => internalTripIds.has(t.id));
  if (!filteredTrips.length) return NextResponse.json({ items: [] });
  const filteredTripIds = filteredTrips.map(t => t.id);

  // 3. Trip ↔ Order links via trip_orders, and the orders themselves
  const { data: tripOrders } = await sb
    .from("trip_orders")
    .select("trip_id, order_id, sequence")
    .in("trip_id", filteredTripIds);
  const tripOrdersArr = (tripOrders ?? []) as Array<{
    trip_id: string;
    order_id: string;
    sequence: number | null;
  }>;
  const orderIdSet = new Set<string>();
  for (const r of tripOrdersArr) orderIdSet.add(r.order_id);
  for (const l of legsArr) {
    if (l.forwarding_order_id) orderIdSet.add(l.forwarding_order_id);
  }
  const orderIds = Array.from(orderIdSet);

  let orders: OrderRow[] = [];
  if (orderIds.length) {
    const { data } = await sb
      .from("orders")
      .select(
        "id, reference_number, parent_order_id, status, customer_id, customer_price, customer_currency, carrier_cost, carrier_currency, commercial_role, customer_reference, cargo_description, weight_kg, pallet_count",
      )
      .in("id", orderIds);
    orders = (data ?? []) as OrderRow[];
  }

  // 4. Subcontract children — used to compute "subcontracted cost" subtracted from revenue
  let subChildren: OrderRow[] = [];
  if (orderIds.length) {
    const { data } = await sb
      .from("orders")
      .select(
        "id, reference_number, parent_order_id, status, customer_id, customer_price, customer_currency, carrier_cost, carrier_currency, commercial_role, customer_reference, cargo_description, weight_kg, pallet_count",
      )
      .eq("admin_id", adminId)
      .in("parent_order_id", orderIds);
    subChildren = (data ?? []) as OrderRow[];
  }
  const childCostByParent = new Map<string, { eur: number; count: number }>();
  // We need FX before we can sum. Defer until after fx loaded below.

  // 5. Customers (business partners) for naming
  const customerIds = Array.from(
    new Set(orders.map(o => o.customer_id).filter(Boolean) as string[]),
  );
  const customerNameMap = new Map<string, string>();
  if (customerIds.length) {
    const { data } = await sb
      .from("business_partners")
      .select("id, name")
      .in("id", customerIds);
    for (const r of data ?? []) {
      const nm = (r as any).name as string | null;
      if (nm) customerNameMap.set((r as any).id as string, nm);
    }
  }

  // 6. Vehicles, trailers, drivers
  const vehicleIds = Array.from(
    new Set(filteredTrips.map(t => t.vehicle_id).filter(Boolean) as string[]),
  );
  const trailerIds = Array.from(
    new Set(filteredTrips.map(t => t.trailer_id).filter(Boolean) as string[]),
  );
  const driverIds = Array.from(
    new Set(filteredTrips.map(t => t.driver_id).filter(Boolean) as string[]),
  );

  const vehicleMap = new Map<string, string>();
  if (vehicleIds.length) {
    const { data } = await sb
      .from("vehicles")
      .select("id, plate_number, make, model")
      .in("id", vehicleIds);
    for (const v of data ?? []) {
      const plate = (v as any).plate_number as string | null;
      const make = (v as any).make as string | null;
      const model = (v as any).model as string | null;
      const label = [plate, [make, model].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" - ");
      if (label) vehicleMap.set((v as any).id as string, label);
    }
  }
  const trailerMap = new Map<string, string>();
  if (trailerIds.length) {
    const { data } = await sb
      .from("trailers")
      .select("id, plate_number")
      .in("id", trailerIds);
    for (const v of data ?? []) {
      const plate = (v as any).plate_number as string | null;
      if (plate) trailerMap.set((v as any).id as string, plate);
    }
  }
  const driverMap = new Map<string, string>();
  if (driverIds.length) {
    const { data } = await sb
      .from("drivers")
      .select("id, name")
      .in("id", driverIds);
    for (const d of data ?? []) {
      const nm = (d as any).name as string | null;
      if (nm) driverMap.set((d as any).id as string, nm);
    }
  }

  // 7. trip_pnl view — already has expense breakdown per trip in EUR
  const { data: pnl } = await sb
    .from("trip_pnl")
    .select(
      "trip_id, distance_km, duration_minutes, expenses_amount, expenses_fuel, expenses_toll, expenses_driver, expenses_other",
    )
    .in("trip_id", filteredTripIds);
  const pnlMap = new Map<string, TripPnlRow>();
  for (const p of (pnl ?? []) as TripPnlRow[]) pnlMap.set(p.trip_id, p);

  // 8. Cost entries (amount_eur_excl_vat is the canonical figure for fleet P&L)
  const { data: costEntries } = await sb
    .from("cost_entries")
    .select(
      "id, trip_id, trip_leg_id, order_id, vehicle_id, amount_eur_excl_vat, amount_eur, category, cost_code, occurred_at",
    )
    .in("trip_id", filteredTripIds);
  const ceArr = (costEntries ?? []) as CostEntryRow[];
  const ceByTrip = new Map<string, CostEntryRow[]>();
  for (const e of ceArr) {
    if (!e.trip_id) continue;
    const arr = ceByTrip.get(e.trip_id) || [];
    arr.push(e);
    ceByTrip.set(e.trip_id, arr);
  }

  // 9. trip_expenses — REMOVED post-consolidation. cost_entries is now the
  //    single source of truth for trip costs (driver/admin/AI/provider rows
  //    were backfilled there and the legacy table is being retired).
  const teByTrip = new Map<string, never[]>();

  // 10. Cost budgets (only when planned costs are requested)
  let budgets: BudgetRow[] = [];
  if (includePlanned && vehicleIds.length) {
    const { data } = await sb
      .from("cost_budgets")
      .select(
        "id, vehicle_id, total_budget_amount, period_start, period_end, scope_level, status, currency",
      )
      .eq("admin_id", adminId)
      .in("vehicle_id", vehicleIds);
    budgets = ((data ?? []) as BudgetRow[]).filter(
      b => b.status !== "draft" && b.status !== "archived",
    );
  }

  // 11. FX
  const fxMap = await loadFxToEurMap(sb);

  // Now we can sum subcontract child cost per parent
  for (const c of subChildren) {
    if (!c.parent_order_id) continue;
    const eur = toEur(c.carrier_cost, c.carrier_currency, fxMap);
    const cur = childCostByParent.get(c.parent_order_id) || { eur: 0, count: 0 };
    cur.eur += eur;
    cur.count += 1;
    childCostByParent.set(c.parent_order_id, cur);
  }

  // Build order summaries grouped by trip
  const orderById = new Map<string, OrderRow>();
  for (const o of orders) orderById.set(o.id, o);
  const ordersByTrip = new Map<string, ApiOrderSummary[]>();

  for (const link of tripOrdersArr) {
    const o = orderById.get(link.order_id);
    if (!o) continue;
    // Skip subcontract child orders linked here — we want parent-level revenue.
    if (o.commercial_role === "carrier_subcontract") continue;
    // Internal vs subcontracted leg count for this order WITHIN this trip
    let internal_legs = 0;
    let sub_legs = 0;
    for (const l of legsArr) {
      if (l.trip_id !== link.trip_id) continue;
      if (l.forwarding_order_id !== o.id) continue;
      const isInternal =
        l.assignment_type === "internal" ||
        (!l.carrier_id && (l.vehicle_id || !l.assignment_type));
      if (isInternal) internal_legs += 1;
      else sub_legs += 1;
    }
    const child = childCostByParent.get(o.id) || { eur: 0, count: 0 };
    const customer_price_eur = toEur(o.customer_price, o.customer_currency, fxMap);
    const subcontracted_cost_eur = child.eur;
    const internal_revenue_eur = Math.max(
      0,
      customer_price_eur - subcontracted_cost_eur,
    );
    const summary: ApiOrderSummary = {
      order_id: o.id,
      reference_number: o.reference_number,
      customer_id: o.customer_id,
      customer_name: o.customer_id ? customerNameMap.get(o.customer_id) ?? null : null,
      customer_reference: o.customer_reference,
      status: o.status,
      customer_price_eur,
      subcontracted_cost_eur,
      internal_revenue_eur,
      internal_legs,
      subcontracted_legs: sub_legs,
      has_subcontract_children: child.count > 0,
      cargo_description: o.cargo_description,
      weight_kg: o.weight_kg,
      pallet_count: o.pallet_count,
    };
    const arr = ordersByTrip.get(link.trip_id) || [];
    arr.push(summary);
    ordersByTrip.set(link.trip_id, arr);
  }

  // Build leg summaries grouped by trip
  const legsByTrip = new Map<string, ApiLegSummary[]>();
  const orderRefById = new Map<string, string | null>();
  for (const o of orders) orderRefById.set(o.id, o.reference_number);
  for (const l of legsArr) {
    if (!l.trip_id) continue;
    const arr = legsByTrip.get(l.trip_id) || [];
    arr.push({
      leg_id: l.id,
      leg_number: l.leg_number,
      assignment_type: l.assignment_type,
      origin: l.origin_address,
      destination: l.destination_address,
      status: l.status,
      order_id: l.forwarding_order_id,
      order_ref: l.forwarding_order_id
        ? orderRefById.get(l.forwarding_order_id) ?? null
        : null,
    });
    legsByTrip.set(l.trip_id, arr);
  }

  // Final row builder
  const items: FleetPnlRow[] = filteredTrips.map(t => {
    const tripOrders = ordersByTrip.get(t.id) ?? [];
    const tripLegs = legsByTrip.get(t.id) ?? [];
    const internal_leg_count = tripLegs.filter(
      l =>
        l.assignment_type === "internal" ||
        (!l.assignment_type && !l.assignment_type),
    ).length;
    const subcontract_leg_count = tripLegs.length - internal_leg_count;

    const revenue_eur = tripOrders.reduce(
      (s, o) => s + (o.internal_revenue_eur || 0),
      0,
    );

    // Actual cost: cost_entries is the single source of truth post-consolidation
    // (it now includes the rows that used to live in trip_expenses).
    const ce = ceByTrip.get(t.id) ?? [];
    const sumCe = ce.reduce(
      (s, e) => s + Number(e.amount_eur_excl_vat ?? e.amount_eur ?? 0),
      0,
    );
    const actual_cost_eur = sumCe;

    // Cost breakdown taken from trip_pnl when available (already classified)
    const p = pnlMap.get(t.id);
    const cost_fuel_eur = Number(p?.expenses_fuel ?? 0);
    const cost_toll_eur = Number(p?.expenses_toll ?? 0);
    const cost_driver_eur = Number(p?.expenses_driver ?? 0);
    const cost_other_eur = Math.max(
      0,
      actual_cost_eur - cost_fuel_eur - cost_toll_eur - cost_driver_eur,
    );

    // Planned cost = pro-rated overlap of vehicle budgets
    let planned_cost_eur: number | null = null;
    if (includePlanned && t.vehicle_id) {
      const tripStart = t.actual_start || t.planned_start;
      const tripEnd = t.actual_end || t.planned_end;
      let total = 0;
      let matched = false;
      for (const b of budgets) {
        if (b.vehicle_id !== t.vehicle_id) continue;
        const { overlapDays, budgetDays } = computeOverlapDays(
          b.period_start,
          b.period_end,
          tripStart,
          tripEnd,
        );
        if (!overlapDays || !budgetDays) continue;
        const amt = toEur(
          b.total_budget_amount ?? 0,
          (b.currency as Currency) ?? "EUR",
          fxMap,
        );
        total += amt * (overlapDays / budgetDays);
        matched = true;
      }
      planned_cost_eur = matched ? Number(total.toFixed(2)) : null;
    }

    const profit_eur = revenue_eur - actual_cost_eur;
    const margin_pct =
      revenue_eur > 0 ? (profit_eur / revenue_eur) * 100 : null;

    const distance_km = Number(t.distance_km ?? p?.distance_km ?? 0);
    const duration_hours = Math.max(
      0,
      Number(t.duration_minutes ?? p?.duration_minutes ?? 0) / 60,
    );
    const km = distance_km > 0 ? distance_km : null;

    return {
      trip_id: t.id,
      reference_number: t.reference_number,
      status: t.status,
      planned_start: t.planned_start,
      planned_end: t.planned_end,
      actual_start: t.actual_start,
      actual_end: t.actual_end,
      vehicle_id: t.vehicle_id,
      vehicle_label: t.vehicle_id ? vehicleMap.get(t.vehicle_id) ?? null : null,
      trailer_id: t.trailer_id,
      trailer_label: t.trailer_id ? trailerMap.get(t.trailer_id) ?? null : null,
      driver_id: t.driver_id,
      driver_name: t.driver_id ? driverMap.get(t.driver_id) ?? null : null,
      distance_km,
      duration_hours: Number(duration_hours.toFixed(2)),
      revenue_eur: Number(revenue_eur.toFixed(2)),
      actual_cost_eur: Number(actual_cost_eur.toFixed(2)),
      planned_cost_eur,
      profit_eur: Number(profit_eur.toFixed(2)),
      margin_pct: margin_pct == null ? null : Number(margin_pct.toFixed(2)),
      cost_per_km: km ? Number((actual_cost_eur / km).toFixed(3)) : null,
      revenue_per_km: km ? Number((revenue_eur / km).toFixed(3)) : null,
      profit_per_km: km ? Number((profit_eur / km).toFixed(3)) : null,
      cost_fuel_eur: Number(cost_fuel_eur.toFixed(2)),
      cost_toll_eur: Number(cost_toll_eur.toFixed(2)),
      cost_driver_eur: Number(cost_driver_eur.toFixed(2)),
      cost_other_eur: Number(cost_other_eur.toFixed(2)),
      is_mixed: subcontract_leg_count > 0 && internal_leg_count > 0,
      internal_leg_count,
      subcontract_leg_count,
      order_count: tripOrders.length,
      orders: tripOrders,
      legs: tripLegs.sort(
        (a, b) => (a.leg_number ?? 0) - (b.leg_number ?? 0),
      ),
    };
  });

  return NextResponse.json({ items });
}
