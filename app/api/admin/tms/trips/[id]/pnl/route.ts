import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const supabase = await createClient()

  const { data: pnl, error } = await supabase
    .from("trip_pnl")
    .select("*")
    .eq("trip_id", tripId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Pull trip-level rate context to synthesize driver wage
  const { data: trip } = await supabase
    .from("trips")
    .select(`
      id, distance_km, duration_minutes, driver_id,
      driver_rate_mode, driver_rate_per_km, driver_hourly_rate
    `)
    .eq("id", tripId)
    .maybeSingle()

  let driverDefault: {
    hourly_rate: number | null
    rate_per_km: number | null
    rate_mode: "hourly" | "per_km" | null
    name: string | null
  } | null = null

  if (trip?.driver_id) {
    const { data: d } = await supabase
      .from("drivers")
      .select("hourly_rate, rate_per_km, rate_mode, name")
      .eq("id", trip.driver_id)
      .maybeSingle()
    if (d) {
      driverDefault = {
        hourly_rate: (d as any).hourly_rate != null ? Number((d as any).hourly_rate) : null,
        rate_per_km: (d as any).rate_per_km != null ? Number((d as any).rate_per_km) : null,
        rate_mode: ((d as any).rate_mode as "hourly" | "per_km" | null) ?? "hourly",
        name: (d as any).name ?? null,
      }
    }
  }

  // Effective rate: trip override beats driver default
  const effectiveMode: "hourly" | "per_km" =
    ((trip as any)?.driver_rate_mode as "hourly" | "per_km" | null) ||
    driverDefault?.rate_mode ||
    "hourly"

  const effectiveHourly =
    (trip as any)?.driver_hourly_rate != null
      ? Number((trip as any).driver_hourly_rate)
      : driverDefault?.hourly_rate ?? null

  const effectivePerKm =
    (trip as any)?.driver_rate_per_km != null
      ? Number((trip as any).driver_rate_per_km)
      : driverDefault?.rate_per_km ?? null

  const distanceKm = n((trip as any)?.distance_km)
  const hours = n((trip as any)?.duration_minutes) / 60

  let driverWage = 0
  let driverWageBasis: { qty: number; unit: "h" | "km"; rate: number } | null = null
  if (effectiveMode === "per_km" && effectivePerKm && distanceKm > 0) {
    driverWage = effectivePerKm * distanceKm
    driverWageBasis = { qty: distanceKm, unit: "km", rate: effectivePerKm }
  } else if (effectiveMode === "hourly" && effectiveHourly && hours > 0) {
    driverWage = effectiveHourly * hours
    driverWageBasis = { qty: hours, unit: "h", rate: effectiveHourly }
  }

  const baseExpenses = n((pnl as any)?.expenses_amount)
  const revenue = n((pnl as any)?.revenue_amount)
  const carrier = n((pnl as any)?.carrier_cost_amount)
  const totalExpensesWithWage = baseExpenses + driverWage
  const margin = revenue - carrier - totalExpensesWithWage
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : null

  return NextResponse.json({
    pnl: pnl
      ? {
          ...pnl,
          expenses_amount: Number(totalExpensesWithWage.toFixed(2)),
          driver_wage: Number(driverWage.toFixed(2)),
          driver_wage_basis: driverWageBasis,
          margin_amount: Number(margin.toFixed(2)),
          margin_percent: marginPct != null ? Number(marginPct.toFixed(2)) : null,
        }
      : null,
    driver_rate: {
      driver_id: (trip as any)?.driver_id ?? null,
      driver_name: driverDefault?.name ?? null,
      effective_mode: effectiveMode,
      effective_hourly_rate: effectiveHourly,
      effective_rate_per_km: effectivePerKm,
      default_mode: driverDefault?.rate_mode ?? null,
      default_hourly_rate: driverDefault?.hourly_rate ?? null,
      default_rate_per_km: driverDefault?.rate_per_km ?? null,
      override_mode: (trip as any)?.driver_rate_mode ?? null,
      override_hourly_rate: (trip as any)?.driver_hourly_rate ?? null,
      override_rate_per_km: (trip as any)?.driver_rate_per_km ?? null,
      distance_km: distanceKm || null,
      hours: hours || null,
    },
  })
}
