import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { geocodeAddressSmart } from "@/lib/tms/geocode"

export const runtime = "nodejs"

/**
 * Driver-side trip-expense ingest. Writes directly to `cost_entries`
 * (post-consolidation). The row lands with status='pending_review' so the
 * finance Review Queue picks it up before it counts in P&L.
 *
 * Authorization: driver_id must be assigned to the trip (either via
 * trips.driver_id OR any trip_legs.driver_id) before we accept the insert.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await context.params
  const body = await req.json().catch(() => ({}))

  const driverId: string | null = typeof body.driver_id === "string" ? body.driver_id : null
  if (!driverId) {
    return NextResponse.json({ error: "driver_id is required" }, { status: 401 })
  }

  const supabase = serviceClient()

  // Authorize + resolve admin_id.
  const [{ data: trip }, { data: legs }] = await Promise.all([
    supabase.from("trips").select("id, admin_id, driver_id").eq("id", tripId).maybeSingle(),
    supabase.from("trip_legs").select("id, driver_id").eq("trip_id", tripId),
  ])
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 })
  }
  const driverIsOnTrip =
    trip.driver_id === driverId ||
    (legs ?? []).some((l) => l.driver_id === driverId)
  if (!driverIsOnTrip) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Geocoding safety net.
  let lat: number | null = body.latitude ?? null
  let lng: number | null = body.longitude ?? null
  if ((lat == null || lng == null) && body.location_label) {
    const hit = await geocodeAddressSmart(body.location_label, body.country ?? null)
    if (hit) { lat = hit.latitude; lng = hit.longitude }
  }

  const legId: string | null =
    typeof body.leg_id === "string"
      ? body.leg_id
      : (legs ?? []).find((l) => l.driver_id === driverId)?.id ?? null

  const category: string | null = body.category ?? null
  const isFuelish = category === "fuel" || category === "ad_blue" || category === "adblue"
  const qty: number | null = body.quantity != null ? Number(body.quantity) : null

  // Resolve cost_code from catalog if a catalog item was picked.
  let costCode: string | null = null
  if (body.cost_catalog_id) {
    const { data: cat } = await supabase
      .from("cost_catalog")
      .select("cost_code")
      .eq("id", body.cost_catalog_id)
      .maybeSingle()
    costCode = cat?.cost_code ?? null
  }

  const insert: Record<string, unknown> = {
    admin_id: trip.admin_id,
    trip_id: tripId,
    trip_leg_id: legId,
    order_id: body.order_id ?? null,
    driver_id: driverId,
    cost_catalog_id: body.cost_catalog_id ?? null,
    cost_code: costCode,
    category,
    description: body.description ?? null,
    notes: body.notes ?? null,
    vendor_name: body.vendor ?? null,
    location_label: body.location_label ?? null,
    latitude: lat,
    longitude: lng,
    country_code: body.country ?? null,
    amount: body.amount,
    amount_excl_vat:
      body.amount_excl_vat ??
      (body.amount != null && body.vat_amount != null
        ? Number(body.amount) - Number(body.vat_amount)
        : null),
    amount_incl_vat: body.amount_incl_vat ?? body.amount ?? null,
    tax_rate: body.tax_rate ?? null,
    tax_amount: body.tax_amount ?? body.vat_amount ?? null,
    fx_rate: body.fx_rate ?? null,
    currency: body.currency ?? "EUR",
    amount_eur: body.amount_eur ?? null,
    liters_qty: isFuelish ? qty : null,
    units_qty: !isFuelish ? qty : null,
    occurred_at: body.occurred_at ?? new Date().toISOString(),
    status: "pending_review",
    source: "trip_expense",
    receipt_url: body.receipt_url ?? null,
    extracted_data: body.extracted_data ?? null,
    extraction_confidence: body.extraction_confidence ?? null,
    recorded_by: null, // driver, not admin
  }

  const { data, error } = await supabase
    .from("cost_entries")
    .insert(insert)
    .select("id, trip_id, trip_leg_id, category, amount, currency, vendor_name, country_code")
    .single()

  if (error) {
    console.log("[v0] /driver/trips/expenses POST insert error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Audit trail
  await supabase.from("trip_events").insert({
    trip_id: tripId,
    leg_id: data.trip_leg_id,
    event_type: "expense_added",
    severity: "info",
    title: `${data.category ?? "expense"} ${data.amount} ${data.currency} (driver, pending review)`,
    description: body.description ?? null,
    metadata: {
      expense_id: data.id,
      vendor: data.vendor_name,
      country: data.country_code,
      source: "driver",
    },
    actor_type: "driver",
    actor_id: driverId,
  })

  return NextResponse.json({ expense: data })
}
