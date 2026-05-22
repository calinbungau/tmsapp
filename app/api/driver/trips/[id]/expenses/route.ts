import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { geocodeAddressSmart } from "@/lib/tms/geocode"

export const runtime = "nodejs"

/**
 * Driver-side trip-expense ingest. Used by the "Add expense" flow inside the
 * driver app (manual entry + scan-and-confirm via /api/tms/extract-receipt).
 *
 * Differences vs the admin-side counterpart at
 *   /api/admin/tms/trips/[id]/expenses
 * — actor identity comes from the driver session (driver_id in body), not
 *   from a Supabase auth cookie;
 * — `source` is forced to "driver" and `status` to "pending_review" so the
 *   row lands in the finance Review Queue instead of going straight to the
 *   ledger;
 * — we re-verify that the caller's driver_id is actually assigned to the
 *   trip (via trips.driver_id OR any of its trip_legs.driver_id) before
 *   inserting, so a driver can't submit expenses against another driver's
 *   trip by guessing the trip UUID.
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

  const driverId: string | null =
    typeof body.driver_id === "string" ? body.driver_id : null
  if (!driverId) {
    return NextResponse.json({ error: "driver_id is required" }, { status: 401 })
  }

  const supabase = serviceClient()

  // ── Authorization: confirm this driver is assigned to this trip ──
  // Either via the legacy trip-level driver_id OR via any leg of the trip.
  const [{ data: trip }, { data: legs }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, driver_id")
      .eq("id", tripId)
      .maybeSingle(),
    supabase
      .from("trip_legs")
      .select("id, driver_id")
      .eq("trip_id", tripId),
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

  // ── Geocoding safety net (mirrors the admin route) ──
  let lat: number | null = body.latitude ?? null
  let lng: number | null = body.longitude ?? null
  if ((lat == null || lng == null) && body.location_label) {
    const hit = await geocodeAddressSmart(
      body.location_label,
      body.country ?? null,
    )
    if (hit) {
      lat = hit.latitude
      lng = hit.longitude
    }
  }

  // Pick a leg to attach to: the caller may explicitly pass leg_id, otherwise
  // we fall back to the first leg this driver owns on the trip (helps the
  // ledger pivot per-leg P&L correctly).
  const legId: string | null =
    typeof body.leg_id === "string"
      ? body.leg_id
      : (legs ?? []).find((l) => l.driver_id === driverId)?.id ?? null

  const insert = {
    trip_id: tripId,
    leg_id: legId,
    order_id: body.order_id ?? null,
    category: body.category,
    description: body.description ?? null,
    amount: body.amount,
    currency: body.currency ?? "EUR",
    // amount_eur is filled by the BEFORE trigger from fx_rates + occurred_at.
    amount_eur: body.amount_eur ?? null,
    fx_rate: body.fx_rate ?? null,
    tax_rate: body.tax_rate ?? null,
    tax_amount: body.tax_amount ?? body.vat_amount ?? null,
    amount_excl_vat:
      body.amount_excl_vat ??
      (body.amount != null && body.vat_amount != null
        ? Number(body.amount) - Number(body.vat_amount)
        : null),
    amount_incl_vat: body.amount_incl_vat ?? body.amount ?? null,
    occurred_at: body.occurred_at ?? new Date().toISOString(),
    country: body.country ?? null,
    vendor: body.vendor ?? null,
    receipt_url: body.receipt_url ?? null,
    // Forced provenance: the Review Queue uses these to badge the row as
    // "driver" and to know it must be approved before it hits cost_entries.
    source: "driver",
    status: "pending_review",
    driver_id: driverId,
    recorded_by: null,
    notes: body.notes ?? null,
    latitude: lat,
    longitude: lng,
    location_label: body.location_label ?? null,
    quantity: body.quantity ?? null,
    unit: body.unit ?? null,
    extracted_data: body.extracted_data ?? null,
    extraction_confidence: body.extraction_confidence ?? null,
  }

  const { data, error } = await supabase
    .from("trip_expenses")
    .insert(insert)
    .select()
    .single()

  if (error) {
    console.log("[v0] /driver/trips/expenses POST insert error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Best-effort audit event for the trip activity log.
  await supabase.from("trip_events").insert({
    trip_id: tripId,
    leg_id: data.leg_id,
    event_type: "expense_added",
    severity: "info",
    title: `${data.category} ${data.amount} ${data.currency} (driver, pending review)`,
    description: data.description ?? null,
    metadata: {
      expense_id: data.id,
      vendor: data.vendor,
      country: data.country,
      source: "driver",
    },
    actor_type: "driver",
    actor_id: driverId,
  })

  return NextResponse.json({ expense: data })
}
