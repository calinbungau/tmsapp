import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Finance Review Queue — lists every cost_entries row currently in
 * `pending_review` for the calling admin. Post-consolidation, the queue
 * reads directly from cost_entries (legacy trip_expenses is being retired).
 *
 * Tenant isolation: cost_entries has its own admin_id column, so we no
 * longer need the trip-id round-trip.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ expenses: [], count: 0 }, { status: 200 })
  }

  const supabase = serviceClient()

  const { data, error } = await supabase
    .from("cost_entries")
    .select(`
      id,
      trip_id,
      trip_leg_id,
      category,
      cost_code,
      cost_catalog_id,
      vendor_name,
      description,
      amount,
      currency,
      amount_eur,
      tax_rate,
      tax_amount,
      amount_excl_vat,
      amount_incl_vat,
      amount_eur_excl_vat,
      amount_eur_incl_vat,
      occurred_at,
      country_code,
      location_label,
      latitude,
      longitude,
      receipt_url,
      liters_qty,
      units_qty,
      source,
      driver_id,
      recorded_by,
      extracted_data,
      extraction_confidence,
      created_at,
      cost_catalog:cost_catalog_id (
        id, cost_code, cost_line, unit, nature, behavior,
        is_system, driver_allowed, manual_allowed
      ),
      trip:trip_id ( id, reference_number, vehicle_id, driver_id ),
      driver:driver_id ( id, name, email )
    `)
    .eq("admin_id", adminId)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    console.log("[v0] /finance/expenses/pending GET error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Reshape to the legacy field names the Review Queue UI expects.
  const expenses = (data ?? []).map((r: any) => ({
    ...r,
    leg_id: r.trip_leg_id ?? null,
    vendor: r.vendor_name ?? null,
    country: r.country_code ?? null,
    quantity: r.liters_qty ?? r.units_qty ?? null,
    unit: r.liters_qty != null ? "L" : null,
  }))

  return NextResponse.json({ expenses, count: expenses.length })
}
