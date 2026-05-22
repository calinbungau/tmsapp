import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Lists every trip_expense currently in `pending_review` for the calling
 * admin's trips. Used by the finance Review Queue page.
 *
 * Tenant isolation: trip_expenses has no admin_id column, so we must scope
 * via the parent trips.admin_id. This app uses a localStorage-based session
 * (admins.id stored as `admin_session.id` on the client) — there is no
 * Supabase Auth cookie to read on the server. The convention used by every
 * other admin write route (see /finance/seed-cost-catalog, /users, etc.)
 * is for the client to pass `admin_id` explicitly. We require it here and
 * fail closed (empty list) when it's missing so we never leak other
 * tenants' rows the way the previous unscoped service-role query did.
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
    // Fail closed: unauthenticated callers must not see any rows.
    return NextResponse.json({ expenses: [], count: 0 }, { status: 200 })
  }

  const supabase = serviceClient()

  // Step 1: find the trip ids owned by this admin. We use a separate query
  // (rather than a !inner filter) because PostgREST embed filters silently
  // return ALL rows when the join filter is malformed — exactly the bug
  // that leaked other tenants' expenses into this queue.
  const { data: trips, error: tripsErr } = await supabase
    .from("trips")
    .select("id")
    .eq("admin_id", adminId)

  if (tripsErr) {
    console.log("[v0] /finance/expenses/pending trips lookup:", tripsErr.message)
    return NextResponse.json({ error: tripsErr.message }, { status: 500 })
  }
  const tripIds = (trips ?? []).map((t) => t.id)
  if (!tripIds.length) {
    return NextResponse.json({ expenses: [], count: 0 })
  }

  // Step 2: fetch pending expenses ONLY for those trips.
  const { data, error } = await supabase
    .from("trip_expenses")
    .select(
      `
      id,
      trip_id,
      leg_id,
      category,
      cost_catalog_id,
      vendor,
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
      country,
      location_label,
      latitude,
      longitude,
      receipt_url,
      quantity,
      unit,
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
      `,
    )
    .eq("status", "pending_review")
    .in("trip_id", tripIds)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    console.log("[v0] /finance/expenses/pending GET error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ expenses: data ?? [], count: data?.length ?? 0 })
}
