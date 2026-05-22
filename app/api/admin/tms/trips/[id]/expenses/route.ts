import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { geocodeAddressSmart } from "@/lib/tms/geocode"

export const runtime = "nodejs"

/**
 * Service-role Supabase client. Used for admin-scoped writes that must bypass RLS
 * (the user's session is the cookie-based client; the policy on trip_expenses is
 * `authenticated/true/true`, but in our env the cookie-based client INSERT was
 * being rejected as `anon` by PostgREST. The project-wide convention for admin
 * routes is to write via SERVICE_ROLE_KEY — see app/api/upload/* and 30+ others).
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  // Use service-role for read too: trip_expenses RLS is permissive for authenticated,
  // but using the same client as the write avoids cookie-vs-anon mismatches we hit
  // when cookies don't propagate to nested route handlers in some Next.js 16 paths.
  const supabase = serviceClient()

  const { data, error } = await supabase
    .from("trip_expenses")
    .select("*, cost_catalog:cost_catalog_id ( id, cost_code, cost_line, unit )")
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false })

  if (error) {
    console.log("[v0] /expenses GET supabase error:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ expenses: data ?? [] })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  const body = await req.json()

  // Cookie-based client is used ONLY to identify the actor. The actual INSERT
  // goes through the service-role client below to bypass RLS misalignment.
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  console.log("[v0] /expenses POST: actor user", user?.id ?? "(no session)")

  const supabase = serviceClient()

  // ── Geocoding safety net ─────────────────────────────────────────────
  // The AI extractor populates lat/lng when the receipt clearly contains a
  // recognisable address; for messy fuel slips it often returns the
  // location_label only. Without coords the route map can't draw the orange
  // fuel pin, so we fall back to a forgiving Nominatim-based geocoder before
  // INSERT. This keeps the UI consistent regardless of AI output quality.
  let lat: number | null = body.latitude ?? null
  let lng: number | null = body.longitude ?? null
  if ((lat == null || lng == null) && body.location_label) {
    const hit = await geocodeAddressSmart(body.location_label, body.country ?? null)
    if (hit) {
      lat = hit.latitude
      lng = hit.longitude
      console.log("[v0] /expenses POST: geocode fallback success", {
        location_label: body.location_label, lat, lng,
      })
    }
  }

  const insert = {
    trip_id: tripId,
    leg_id: body.leg_id ?? null,
    order_id: body.order_id ?? null,
    category: body.category,
    description: body.description ?? null,
    amount: body.amount,
    currency: body.currency ?? "EUR",
    // amount_eur is now computed by the BEFORE trigger trip_expense_apply_fx
    // using fx_rates + occurred_at. We still allow the caller to pre-set it
    // for already-converted EUR amounts; otherwise the trigger fills it.
    amount_eur: body.amount_eur ?? null,
    fx_rate: body.fx_rate ?? null,
    // VAT (Phase 3). The OCR extractor surfaces vat_amount; the form may
    // also pass tax_rate / amount_excl_vat / amount_incl_vat for richer
    // capture. The BEFORE trigger mirrors these into amount_eur_excl_vat /
    // amount_eur_incl_vat for the EUR-normalised ledger.
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
    source: body.source ?? "admin",
    status: body.status ?? "recorded",
    recorded_by: user?.id ?? null,
    driver_id: body.driver_id ?? null,
    notes: body.notes ?? null,
    // Geo + AI extraction metadata (added 2026-05)
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
    console.log("[v0] /expenses POST: INSERT failed", {
      message: error.message,
      code: error.code,
      details: (error as any).details,
      hint: (error as any).hint,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  console.log("[v0] /expenses POST: INSERT ok", { id: data.id, category: data.category, amount: data.amount })

  // Append-only event (best-effort; never blocks the response)
  const { error: evtErr } = await supabase.from("trip_events").insert({
    trip_id: tripId,
    leg_id: data.leg_id,
    event_type: "expense_added",
    severity: "info",
    title: `${data.category} expense ${data.amount} ${data.currency}`,
    description: data.description ?? null,
    metadata: { expense_id: data.id, vendor: data.vendor, country: data.country },
    actor_type: "admin",
    actor_id: user?.id ?? null,
  })
  if (evtErr) console.log("[v0] /expenses POST: trip_events append failed (non-fatal)", evtErr.message)

  return NextResponse.json({ expense: data })
}
