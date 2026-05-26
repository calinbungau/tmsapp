import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { geocodeAddressSmart } from "@/lib/tms/geocode"

export const runtime = "nodejs"

/**
 * Trip-scoped expense API, post-consolidation.
 *
 * Reads and writes go directly to `cost_entries` — the legacy `trip_expenses`
 * table is being retired and the sync triggers have been removed. The shape
 * returned to the UI is preserved (legacy trip_expense field names) so the
 * Trip Editor Expenses/Fuel tabs keep working without changes.
 *
 * Provider-imported rows (Shell, Cargobox, OMV, …) are surfaced with
 * read_only:true and a provider-derived `source` badge so the UI hides
 * edit/delete actions on them.
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** BNG cost code → UI category bucket (kept identical to pre-consolidation). */
function categoryFromCostCode(code: string | null | undefined): string {
  if (!code) return "other"
  const c = code.toUpperCase()
  if (c === "A1-001" || c === "A1-003" || c === "A1-004" || c === "A1-005") return "fuel"
  if (c === "A1-002") return "ad_blue"
  if (/^A1-01[0-7]$/.test(c)) return "toll"
  if (c === "A1-020" || c === "A1-022") return "toll"
  if (c === "A1-030") return "parking"
  if (c === "A1-031") return "wash"
  return "other"
}

/** Map app-facing source value to a legal cost_entries.source. */
function normalizeSource(s: string | null | undefined): string {
  const v = String(s ?? "").toLowerCase()
  const allowed = new Set([
    "manual", "provider_import", "trip_expense", "order_expense",
    "maintenance", "toll", "recurring", "api", "ai_extraction",
  ])
  if (allowed.has(v)) return v
  if (v === "ai" || v === "openai" || v === "llm" || v === "gpt" || v === "vision") return "ai_extraction"
  if (v === "driver") return "trip_expense"
  if (v === "admin" || v === "" || v == null) return "manual"
  return "manual"
}

/** Map app-facing status to a legal cost_entries.status. */
function normalizeStatus(s: string | null | undefined): string {
  const v = String(s ?? "").toLowerCase()
  const allowed = new Set(["draft", "pending_review", "approved", "posted", "paid", "disputed", "rejected", "cancelled"])
  if (allowed.has(v)) return v
  if (v === "recorded" || v === "") return "approved"
  return "approved"
}

/** Reshape a cost_entries row into the legacy trip_expense shape the tabs use. */
function reshape(c: any, opts: { isProvider: boolean }) {
  const code = c.cost_code ?? c.cost_catalog?.cost_code ?? null
  // Prefer the row's own category if set; fall back to code-derived bucket.
  const category = c.category ?? categoryFromCostCode(code)
  const qty =
    category === "fuel" || category === "ad_blue"
      ? c.liters_qty ?? c.units_qty ?? null
      : c.units_qty ?? null
  const unit =
    category === "fuel" || category === "ad_blue"
      ? c.liters_qty != null ? "L" : c.cost_catalog?.unit ?? null
      : c.cost_catalog?.unit ?? null
  const providerCode = c.cost_providers?.code ?? null
  const source = opts.isProvider
    ? (providerCode ? providerCode.toUpperCase() : "provider_import")
    : (c.source ?? "manual")
  return {
    id: c.id,
    trip_id: c.trip_id,
    leg_id: c.trip_leg_id ?? null,
    order_id: c.order_id ?? null,
    category,
    description: c.description ?? null,
    amount: c.amount_incl_vat ?? c.amount ?? null,
    currency: c.currency ?? "EUR",
    amount_eur: c.amount_eur ?? null,
    tax_rate: c.tax_rate ?? null,
    tax_amount: c.tax_amount ?? null,
    amount_excl_vat: c.amount_excl_vat ?? null,
    amount_incl_vat: c.amount_incl_vat ?? c.amount ?? null,
    amount_eur_excl_vat: c.amount_eur_excl_vat ?? null,
    amount_eur_incl_vat: c.amount_eur_incl_vat ?? c.amount_eur ?? null,
    occurred_at: c.occurred_at,
    country: c.country_code ?? null,
    vendor: c.vendor_name ?? c.cost_providers?.name ?? null,
    receipt_url: c.receipt_url ?? null,
    source,
    status: c.status ?? "approved",
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    location_label: c.location_label ?? null,
    quantity: qty,
    unit,
    extraction_confidence: c.extraction_confidence ?? null,
    cost_catalog_id: c.cost_catalog_id ?? null,
    cost_catalog: c.cost_catalog ?? null,
    driver_id: c.driver_id ?? null,
    notes: c.notes ?? null,
    // UI flags
    read_only: opts.isProvider,
    origin: opts.isProvider ? "cost_entry" : "trip_expense",
    // Carry the freeze state through so the UI can render a "closed" badge
    // later if we want; harmless otherwise.
    closed_at: c.closed_at ?? null,
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await context.params
  const supabase = serviceClient()

  const { data, error } = await supabase
    .from("cost_entries")
    .select(`
      id, trip_id, trip_leg_id, order_id, vehicle_id, driver_id,
      cost_code, cost_catalog_id, category, description, notes,
      amount, amount_incl_vat, amount_excl_vat, tax_rate, tax_amount,
      amount_eur, amount_eur_excl_vat, amount_eur_incl_vat,
      currency, fx_rate, occurred_at, country_code,
      vendor_name, location_label, latitude, longitude,
      units_qty, liters_qty, kwh_qty, status, source,
      external_source, external_id, extraction_confidence,
      receipt_url, provider_id, closed_at,
      cost_catalog:cost_catalog_id ( id, cost_code, cost_line, unit ),
      cost_providers:provider_id ( id, code, name )
    `)
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false })

  if (error) {
    console.log("[v0] /expenses GET cost_entries error:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expenses = (data ?? []).map((c: any) =>
    reshape(c, { isProvider: !!c.provider_id }),
  )

  return NextResponse.json({ expenses })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await context.params
  const body = await req.json()

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  console.log("[v0] /expenses POST: actor user", user?.id ?? "(no session)")

  const supabase = serviceClient()

  // Resolve admin_id from the trip (cost_entries.admin_id NOT NULL on insert).
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("admin_id")
    .eq("id", tripId)
    .maybeSingle()
  if (tripErr || !trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 })
  }

  // Geocoding safety net
  let lat: number | null = body.latitude ?? null
  let lng: number | null = body.longitude ?? null
  if ((lat == null || lng == null) && body.location_label) {
    const hit = await geocodeAddressSmart(body.location_label, body.country ?? null)
    if (hit) { lat = hit.latitude; lng = hit.longitude }
  }

  const category = body.category ?? null
  // If the caller picked a catalog item, preserve its cost_code so reports
  // and the bucket-derivation function stay accurate.
  let costCode: string | null = null
  if (body.cost_catalog_id) {
    const { data: cat } = await supabase
      .from("cost_catalog")
      .select("cost_code")
      .eq("id", body.cost_catalog_id)
      .maybeSingle()
    costCode = cat?.cost_code ?? null
  }

  const isFuelish = category === "fuel" || category === "ad_blue" || category === "adblue"
  const qty: number | null = body.quantity != null ? Number(body.quantity) : null

  const insert: Record<string, unknown> = {
    admin_id: trip.admin_id,
    trip_id: tripId,
    trip_leg_id: body.leg_id ?? null,
    order_id: body.order_id ?? null,
    driver_id: body.driver_id ?? null,
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
    status: normalizeStatus(body.status ?? "approved"),
    source: normalizeSource(body.source ?? "manual"),
    receipt_url: body.receipt_url ?? null,
    extracted_data: body.extracted_data ?? null,
    extraction_confidence: body.extraction_confidence ?? null,
    recorded_by: user?.id ?? null,
  }

  const { data, error } = await supabase
    .from("cost_entries")
    .insert(insert)
    .select(`
      id, trip_id, trip_leg_id, order_id, driver_id,
      cost_code, cost_catalog_id, category, description, notes,
      amount, amount_incl_vat, amount_excl_vat, tax_rate, tax_amount,
      amount_eur, amount_eur_excl_vat, amount_eur_incl_vat,
      currency, occurred_at, country_code,
      vendor_name, location_label, latitude, longitude,
      units_qty, liters_qty, status, source, receipt_url,
      extraction_confidence, provider_id, closed_at,
      cost_catalog:cost_catalog_id ( id, cost_code, cost_line, unit )
    `)
    .single()

  if (error) {
    console.log("[v0] /expenses POST: INSERT failed", {
      message: error.message, code: error.code,
      details: (error as any).details, hint: (error as any).hint,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  console.log("[v0] /expenses POST: INSERT ok", { id: data.id, category: data.category, amount: data.amount })

  // Audit trail
  await supabase.from("trip_events").insert({
    trip_id: tripId,
    leg_id: data.trip_leg_id,
    event_type: "expense_added",
    severity: "info",
    title: `${data.category ?? "expense"} ${data.amount} ${data.currency}`,
    description: data.description ?? null,
    metadata: { expense_id: data.id, vendor: data.vendor_name, country: data.country_code },
    actor_type: "admin",
    actor_id: user?.id ?? null,
  })

  return NextResponse.json({ expense: reshape(data, { isProvider: !!data.provider_id }) })
}
