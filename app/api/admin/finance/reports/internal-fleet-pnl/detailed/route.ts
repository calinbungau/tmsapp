import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Internal Fleet P&L — Detailed line items
 * ----------------------------------------
 * Returns a flat list of cost line-items, one row per source record,
 * keyed by trip so the Detailed export can render them line-by-line:
 *
 *   - Fuel & AdBlue refuels             (cost_entries fuel/adblue + trip_expenses fuel)
 *   - Tolls & vignettes                 (cost_entries toll + trip_expenses toll + toll_calculations)
 *   - Driver cost                       (duration_hours × drivers.hourly_rate + diurna entries)
 *   - Other trip expenses               (trip_expenses parking/ferry/repair/misc + order_expenses)
 *   - Allocated overhead                (cost_allocations: insurance, leasing, depreciation share, …)
 *
 * Plus a per-leg planned-vs-actual km appendix (route_meta vs trips.distance_km).
 *
 * The shape is flat by design: Trip Ref is on every row so consumers
 * (CSV / Excel / PDF) can render a single sortable table, or group by
 * trip on the client.
 */

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export type DetailedLineItem = {
  trip_id: string
  trip_ref: string | null
  bucket: "fuel" | "toll" | "driver" | "other" | "overhead"
  source: string // table/origin label e.g. "cost_entries", "trip_expenses", "toll_calculations", "drivers.hourly_rate"
  occurred_at: string | null
  description: string
  vendor: string | null
  country: string | null
  category: string | null
  cost_code: string | null
  quantity: number | null
  unit: string | null
  currency: string | null
  amount_eur: number
}

export type DetailedRevenueLine = {
  trip_id: string
  trip_ref: string | null
  order_id: string
  order_ref: string | null
  customer_name: string | null
  customer_price_eur: number
  subcontracted_cost_eur: number
  internal_revenue_eur: number
}

export type DetailedTripHeader = {
  trip_id: string
  trip_ref: string | null
  vehicle_plate: string | null
  driver_name: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  planned_km: number | null
  actual_km: number | null
  route_confirmed_at: string | null
  status: string | null
}

export type DetailedLegRow = {
  trip_id: string
  trip_ref: string | null
  leg_id: string
  leg_number: number | null
  origin: string | null
  destination: string | null
  planned_km: number | null
  actual_km: number | null
  delta_km: number | null
}

const FUEL_TOKENS = ["fuel", "diesel", "adblue", "ad_blue", "ad-blue"]
const TOLL_TOKENS = ["toll", "vignette", "highway", "motorway", "rovinieta"]
const DRIVER_TOKENS = ["per_diem", "diurna", "perdiem", "driver_allowance"]
const OVERHEAD_TOKENS = [
  "insurance",
  "leasing",
  "depreciation",
  "amortization",
  "registration",
  "license",
]

function bucketFor(category?: string | null, cost_code?: string | null): DetailedLineItem["bucket"] {
  const haystack = `${category ?? ""} ${cost_code ?? ""}`.toLowerCase()
  if (FUEL_TOKENS.some(t => haystack.includes(t))) return "fuel"
  if (TOLL_TOKENS.some(t => haystack.includes(t))) return "toll"
  if (DRIVER_TOKENS.some(t => haystack.includes(t))) return "driver"
  if (OVERHEAD_TOKENS.some(t => haystack.includes(t))) return "overhead"
  return "other"
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function loadFxToEurMap(sb: ReturnType<typeof serviceClient>): Promise<Map<string, number>> {
  const { data } = await sb
    .from("fx_rates")
    .select("currency, rate_to_ron, rate_date")
    .order("rate_date", { ascending: false })
    .limit(500)
  const latest = new Map<string, number>()
  for (const r of data ?? []) {
    const c = String((r as any).currency || "").toUpperCase()
    if (!c || latest.has(c)) continue
    const v = Number((r as any).rate_to_ron)
    if (Number.isFinite(v) && v > 0) latest.set(c, v)
  }
  const eurToRon = latest.get("EUR") ?? 5
  const out = new Map<string, number>()
  out.set("EUR", 1)
  for (const [c, ronPerUnit] of latest.entries()) {
    if (c === "EUR") continue
    out.set(c, ronPerUnit / eurToRon)
  }
  return out
}

function toEur(amount: unknown, currency: string | null | undefined, fx: Map<string, number>): number {
  const a = num(amount)
  if (!a) return 0
  const c = (currency || "EUR").toUpperCase()
  if (c === "EUR") return a
  const r = fx.get(c) ?? 1
  return a * r
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const adminId = sp.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ items: [], legs: [] }, { status: 200 })
  }
  // tripIds is a comma separated list (the page already has filtered rows in memory)
  const tripIdsParam = sp.get("trip_ids") ?? ""
  const tripIds = tripIdsParam.split(",").map(s => s.trim()).filter(Boolean)
  if (!tripIds.length) {
    return NextResponse.json({ items: [], legs: [] })
  }

  const sb = serviceClient()
  const fx = await loadFxToEurMap(sb)

  // 1. Trips (for ref + duration + driver_id + distance_km + status + confirmed)
  const { data: trips } = await sb
    .from("trips")
    .select(
      "id, reference_number, duration_minutes, distance_km, driver_id, vehicle_id, planned_start, planned_end, actual_start, actual_end, status, route_confirmed_at, planned_distance_km",
    )
    .eq("admin_id", adminId)
    .in("id", tripIds)
  type T = {
    id: string
    reference_number: string | null
    duration_minutes: number | null
    distance_km: number | null
    planned_distance_km: number | null
    driver_id: string | null
    vehicle_id: string | null
    planned_start: string | null
    planned_end: string | null
    actual_start: string | null
    actual_end: string | null
    status: string | null
    route_confirmed_at: string | null
  }
  const tripMap = new Map<string, T>()
  for (const t of (trips ?? []) as T[]) tripMap.set(t.id, t)

  const tripRef = (id: string): string | null => tripMap.get(id)?.reference_number ?? null

  // Vehicles (plate)
  const vehicleIds = Array.from(
    new Set(Array.from(tripMap.values()).map(t => t.vehicle_id).filter(Boolean) as string[]),
  )
  const vehiclePlate = new Map<string, string | null>()
  if (vehicleIds.length) {
    const { data } = await sb
      .from("vehicles")
      .select("id, license_plate")
      .in("id", vehicleIds)
    for (const v of data ?? []) {
      vehiclePlate.set((v as any).id as string, (v as any).license_plate as string | null)
    }
  }

  // 2. Drivers (for hourly_rate)
  const driverIds = Array.from(
    new Set(
      Array.from(tripMap.values()).map(t => t.driver_id).filter(Boolean) as string[],
    ),
  )
  const driverRate = new Map<string, { name: string | null; rate: number | null }>()
  if (driverIds.length) {
    const { data } = await sb
      .from("drivers")
      .select("id, name, hourly_rate")
      .in("id", driverIds)
    for (const d of data ?? []) {
      driverRate.set((d as any).id as string, {
        name: (d as any).name as string | null,
        rate: (d as any).hourly_rate as number | null,
      })
    }
  }

  // 3. cost_entries for these trips
  const { data: ce } = await sb
    .from("cost_entries")
    .select(
      "id, trip_id, category, cost_code, occurred_at, vendor_name, country_code, currency, amount_eur_excl_vat, amount_eur, liters_qty, kwh_qty, units_qty, days_qty, hours_qty, description",
    )
    .in("trip_id", tripIds)

  // 4. trip_expenses
  const { data: te } = await sb
    .from("trip_expenses")
    .select(
      "id, trip_id, category, occurred_at, vendor, country, currency, amount_eur_excl_vat, amount_eur, quantity, unit, description, notes",
    )
    .in("trip_id", tripIds)

  // 5. cost_allocations (allocated overhead)
  const { data: ca } = await sb
    .from("cost_allocations")
    .select(
      "id, trip_id, allocation_basis, allocated_amount_eur, allocation_percentage, period_start, period_end, target_level",
    )
    .in("trip_id", tripIds)

  // 6. toll_calculations — keyed on order_id; map orders -> trips via trip_orders
  const { data: tripOrders } = await sb
    .from("trip_orders")
    .select("trip_id, order_id")
    .in("trip_id", tripIds)
  const ordersByTrip = new Map<string, string[]>()
  const tripByOrder = new Map<string, string>()
  for (const r of tripOrders ?? []) {
    const tid = (r as any).trip_id as string
    const oid = (r as any).order_id as string
    if (!tid || !oid) continue
    const arr = ordersByTrip.get(tid) ?? []
    arr.push(oid)
    ordersByTrip.set(tid, arr)
    tripByOrder.set(oid, tid)
  }
  const orderIds = Array.from(tripByOrder.keys())

  let tollCalcs: any[] = []
  if (orderIds.length) {
    const { data } = await sb
      .from("toll_calculations")
      .select("id, order_id, total_toll_cost, currency, route_description, calculated_at")
      .in("order_id", orderIds)
    tollCalcs = data ?? []
  }

  // 7. order_expenses (parking, ferry, repairs, misc, …)
  let orderExpenses: any[] = []
  if (orderIds.length) {
    const { data } = await sb
      .from("order_expenses")
      .select("id, order_id, expense_type, expense_date, amount, currency, description")
      .in("order_id", orderIds)
    orderExpenses = data ?? []
  }

  // 8. trip_legs for planned vs actual km
  const { data: legsData } = await sb
    .from("trip_legs")
    .select(
      "id, trip_id, leg_number, origin_address, destination_address, route_meta",
    )
    .in("trip_id", tripIds)
  type LegRow = {
    id: string
    trip_id: string | null
    leg_number: number | null
    origin_address: string | null
    destination_address: string | null
    route_meta: Record<string, unknown> | null
  }
  const legsByTrip = new Map<string, LegRow[]>()
  for (const l of (legsData ?? []) as LegRow[]) {
    if (!l.trip_id) continue
    const arr = legsByTrip.get(l.trip_id) ?? []
    arr.push(l)
    legsByTrip.set(l.trip_id, arr)
  }

  /* ---- assemble line items ---- */
  const items: DetailedLineItem[] = []

  // cost_entries
  for (const r of (ce ?? []) as any[]) {
    if (!r.trip_id) continue
    const amt = num(r.amount_eur_excl_vat ?? r.amount_eur)
    if (!amt) continue
    const bucket = bucketFor(r.category, r.cost_code)
    const qty =
      num(r.liters_qty) ||
      num(r.kwh_qty) ||
      num(r.units_qty) ||
      num(r.days_qty) ||
      num(r.hours_qty) ||
      null
    const unit = r.liters_qty
      ? "L"
      : r.kwh_qty
      ? "kWh"
      : r.days_qty
      ? "days"
      : r.hours_qty
      ? "h"
      : r.units_qty
      ? "u"
      : null
    items.push({
      trip_id: r.trip_id,
      trip_ref: tripRef(r.trip_id),
      bucket,
      source: "cost_entries",
      occurred_at: r.occurred_at ?? null,
      description: r.description ?? r.cost_code ?? r.category ?? "Cost entry",
      vendor: r.vendor_name ?? null,
      country: r.country_code ?? null,
      category: r.category ?? null,
      cost_code: r.cost_code ?? null,
      quantity: qty,
      unit,
      currency: r.currency ?? "EUR",
      amount_eur: Number(amt.toFixed(2)),
    })
  }

  // trip_expenses
  for (const r of (te ?? []) as any[]) {
    if (!r.trip_id) continue
    const amt = num(r.amount_eur_excl_vat ?? r.amount_eur)
    if (!amt) continue
    const bucket = bucketFor(r.category, null)
    items.push({
      trip_id: r.trip_id,
      trip_ref: tripRef(r.trip_id),
      bucket,
      source: "trip_expenses",
      occurred_at: r.occurred_at ?? null,
      description: r.description ?? r.notes ?? r.category ?? "Trip expense",
      vendor: r.vendor ?? null,
      country: r.country ?? null,
      category: r.category ?? null,
      cost_code: null,
      quantity: r.quantity != null ? num(r.quantity) : null,
      unit: r.unit ?? null,
      currency: r.currency ?? "EUR",
      amount_eur: Number(amt.toFixed(2)),
    })
  }

  // toll_calculations (per order, attribute to trip)
  for (const r of tollCalcs as any[]) {
    const tid = tripByOrder.get(r.order_id as string)
    if (!tid) continue
    const eur = toEur(r.total_toll_cost, r.currency, fx)
    if (!eur) continue
    items.push({
      trip_id: tid,
      trip_ref: tripRef(tid),
      bucket: "toll",
      source: "toll_calculations",
      occurred_at: r.calculated_at ?? null,
      description: r.route_description ?? "Toll route",
      vendor: null,
      country: null,
      category: "toll_calculation",
      cost_code: null,
      quantity: null,
      unit: null,
      currency: r.currency ?? "EUR",
      amount_eur: Number(eur.toFixed(2)),
    })
  }

  // order_expenses (parking, ferry, repairs, misc)
  for (const r of orderExpenses as any[]) {
    const tid = tripByOrder.get(r.order_id as string)
    if (!tid) continue
    const eur = toEur(r.amount, r.currency, fx)
    if (!eur) continue
    items.push({
      trip_id: tid,
      trip_ref: tripRef(tid),
      bucket: "other",
      source: "order_expenses",
      occurred_at: r.expense_date ?? null,
      description: r.description ?? r.expense_type ?? "Order expense",
      vendor: null,
      country: null,
      category: r.expense_type ?? null,
      cost_code: null,
      quantity: null,
      unit: null,
      currency: r.currency ?? "EUR",
      amount_eur: Number(eur.toFixed(2)),
    })
  }

  // cost_allocations — allocated overhead share
  for (const r of (ca ?? []) as any[]) {
    if (!r.trip_id) continue
    const eur = num(r.allocated_amount_eur)
    if (!eur) continue
    items.push({
      trip_id: r.trip_id,
      trip_ref: tripRef(r.trip_id),
      bucket: "overhead",
      source: "cost_allocations",
      occurred_at: r.period_end ?? r.period_start ?? null,
      description: `Allocated ${r.allocation_basis ?? "overhead"} (${r.target_level ?? "trip"})`,
      vendor: null,
      country: null,
      category: r.allocation_basis ?? "overhead",
      cost_code: null,
      quantity: r.allocation_percentage != null ? num(r.allocation_percentage) : null,
      unit: r.allocation_percentage != null ? "%" : null,
      currency: "EUR",
      amount_eur: Number(eur.toFixed(2)),
    })
  }

  // Driver cost — synthetic line item (hours × hourly_rate)
  for (const t of tripMap.values()) {
    if (!t.driver_id) continue
    const info = driverRate.get(t.driver_id)
    const rate = info?.rate ? num(info.rate) : 0
    const hours = (num(t.duration_minutes) || 0) / 60
    if (rate > 0 && hours > 0) {
      const eur = rate * hours
      items.push({
        trip_id: t.id,
        trip_ref: t.reference_number,
        bucket: "driver",
        source: "drivers.hourly_rate",
        occurred_at: t.actual_start ?? t.planned_start ?? null,
        description: `Driver hours × hourly rate${info?.name ? ` (${info.name})` : ""}`,
        vendor: info?.name ?? null,
        country: null,
        category: "driver_hours",
        cost_code: null,
        quantity: Number(hours.toFixed(2)),
        unit: "h",
        currency: "EUR",
        amount_eur: Number(eur.toFixed(2)),
      })
    }
  }

  // sort: trip_ref, bucket priority, then date
  const bucketRank: Record<DetailedLineItem["bucket"], number> = {
    fuel: 1,
    toll: 2,
    driver: 3,
    other: 4,
    overhead: 5,
  }
  items.sort((a, b) => {
    const ra = a.trip_ref ?? ""
    const rb = b.trip_ref ?? ""
    if (ra !== rb) return ra.localeCompare(rb)
    if (a.bucket !== b.bucket) return bucketRank[a.bucket] - bucketRank[b.bucket]
    return (a.occurred_at ?? "").localeCompare(b.occurred_at ?? "")
  })

  /* ---- per-leg planned vs actual km ---- */
  const legs: DetailedLegRow[] = []
  for (const [tid, arr] of legsByTrip.entries()) {
    const t = tripMap.get(tid)
    const tripActual = num(t?.distance_km)
    const plannedSum = arr.reduce((s, l) => s + num((l.route_meta as any)?.distance_km), 0)
    for (const l of arr) {
      const planned = num((l.route_meta as any)?.distance_km) || null
      // Pro-rate the trip's actual km across legs by their planned share.
      // If we can't (no planned sum), leave actual_km null to be honest.
      const actual =
        planned != null && plannedSum > 0 && tripActual > 0
          ? Number(((planned / plannedSum) * tripActual).toFixed(1))
          : null
      legs.push({
        trip_id: tid,
        trip_ref: tripRef(tid),
        leg_id: l.id,
        leg_number: l.leg_number,
        origin: l.origin_address,
        destination: l.destination_address,
        planned_km: planned,
        actual_km: actual,
        delta_km:
          planned != null && actual != null
            ? Number((actual - planned).toFixed(1))
            : null,
      })
    }
  }
  legs.sort((a, b) => {
    const ra = a.trip_ref ?? ""
    const rb = b.trip_ref ?? ""
    if (ra !== rb) return ra.localeCompare(rb)
    return (a.leg_number ?? 0) - (b.leg_number ?? 0)
  })

  /* ---- revenue lines per trip per order ---- */
  const revenue: DetailedRevenueLine[] = []
  if (orderIds.length) {
    const { data: orders } = await sb
      .from("orders")
      .select(
        "id, reference_number, customer_id, customer_price, customer_currency, parent_order_id, carrier_cost, carrier_currency, customer:customers(id, name)",
      )
      .in("id", orderIds)

    type Ord = {
      id: string
      reference_number: string | null
      customer_id: string | null
      customer_price: number | null
      customer_currency: string | null
      parent_order_id: string | null
      carrier_cost: number | null
      carrier_currency: string | null
      customer: { id: string; name: string | null } | null
    }
    const ordersById = new Map<string, Ord>()
    for (const o of (orders ?? []) as any[]) {
      const cust = Array.isArray(o.customer) ? o.customer[0] ?? null : o.customer ?? null
      ordersById.set(o.id, { ...o, customer: cust } as Ord)
    }

    // sub-orders deduction (parent's children that are subcontracted)
    const { data: children } = await sb
      .from("orders")
      .select("id, parent_order_id, carrier_cost, carrier_currency")
      .in("parent_order_id", orderIds)
    const childCostByParent = new Map<string, number>()
    for (const c of (children ?? []) as any[]) {
      if (!c.parent_order_id) continue
      const eur = toEur(c.carrier_cost, c.carrier_currency, fx)
      childCostByParent.set(
        c.parent_order_id,
        (childCostByParent.get(c.parent_order_id) ?? 0) + eur,
      )
    }

    // also subcontracted legs on the same trip (carrier_cost on trip_legs)
    const { data: subcontractedLegs } = await sb
      .from("trip_legs")
      .select("trip_id, order_id, carrier_cost, carrier_currency, assignment_type, carrier_id")
      .in("trip_id", tripIds)
    const subLegCostByOrder = new Map<string, number>()
    for (const l of (subcontractedLegs ?? []) as any[]) {
      const isSub =
        (l.assignment_type && String(l.assignment_type).toLowerCase() !== "internal") ||
        !!l.carrier_id
      if (!isSub || !l.order_id) continue
      const eur = toEur(l.carrier_cost, l.carrier_currency, fx)
      subLegCostByOrder.set(l.order_id, (subLegCostByOrder.get(l.order_id) ?? 0) + eur)
    }

    for (const [tid, oids] of ordersByTrip.entries()) {
      for (const oid of oids) {
        const o = ordersById.get(oid)
        if (!o) continue
        const customerEur = toEur(o.customer_price, o.customer_currency, fx)
        const sub =
          (childCostByParent.get(o.id) ?? 0) +
          (subLegCostByOrder.get(o.id) ?? 0)
        const internal = Math.max(customerEur - sub, 0)
        revenue.push({
          trip_id: tid,
          trip_ref: tripRef(tid),
          order_id: o.id,
          order_ref: o.reference_number,
          customer_name: o.customer?.name ?? null,
          customer_price_eur: Number(customerEur.toFixed(2)),
          subcontracted_cost_eur: Number(sub.toFixed(2)),
          internal_revenue_eur: Number(internal.toFixed(2)),
        })
      }
    }
    revenue.sort((a, b) => (a.trip_ref ?? "").localeCompare(b.trip_ref ?? ""))
  }

  /* ---- trip headers ---- */
  const trip_headers: DetailedTripHeader[] = []
  for (const t of tripMap.values()) {
    trip_headers.push({
      trip_id: t.id,
      trip_ref: t.reference_number,
      vehicle_plate: t.vehicle_id ? vehiclePlate.get(t.vehicle_id) ?? null : null,
      driver_name: t.driver_id ? driverRate.get(t.driver_id)?.name ?? null : null,
      planned_start: t.planned_start,
      planned_end: t.planned_end,
      actual_start: t.actual_start,
      actual_end: t.actual_end,
      planned_km: t.planned_distance_km != null ? num(t.planned_distance_km) : null,
      actual_km: t.distance_km != null ? num(t.distance_km) : null,
      route_confirmed_at: t.route_confirmed_at,
      status: t.status,
    })
  }
  trip_headers.sort((a, b) => (a.trip_ref ?? "").localeCompare(b.trip_ref ?? ""))

  return NextResponse.json({ items, legs, revenue, trip_headers })
}
