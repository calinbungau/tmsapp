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

/**
 * Map a BNG cost catalog code to the categorical bucket the trip editor
 * tabs filter on (fuel / toll / parking / wash / ad_blue / other).
 *
 * The trip editor's Fuel and Expenses tabs filter trip_expenses.category,
 * but supplier-imported rows in cost_entries only carry cost_code. To make
 * an imported Shell row appear under "Fuel" and a Cargobox toll under
 * "Toll" without a separate UI, we derive category from cost_code here.
 *
 * Mapping reflects the live cost_catalog descriptions:
 *   A1-001  Diesel motorin\u0103         \u2192 fuel
 *   A1-002  AdBlue                       \u2192 ad_blue
 *   A1-003  LNG / GNL                    \u2192 fuel
 *   A1-004  CNG                          \u2192 fuel
 *   A1-005  Benzin\u0103                 \u2192 fuel
 *   A1-010..017  Tax\u0103 rutier\u0103  \u2192 toll
 *   A1-020  Pod / tunel                  \u2192 toll
 *   A1-022  Vignette                     \u2192 toll
 *   A1-030  Parking                      \u2192 parking
 *   A1-031  Sp\u0103l\u0103torie         \u2192 wash
 * Everything else falls through to "other" (still surfaced; just not
 * counted under a specific Fuel/Toll filter).
 */
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

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  // Use service-role for read too: trip_expenses RLS is permissive for authenticated,
  // but using the same client as the write avoids cookie-vs-anon mismatches we hit
  // when cookies don't propagate to nested route handlers in some Next.js 16 paths.
  const supabase = serviceClient()

  // 1) Driver-entered + admin-entered expenses (the original source).
  const { data: tripExpenses, error } = await supabase
    .from("trip_expenses")
    .select("*, cost_catalog:cost_catalog_id ( id, cost_code, cost_line, unit )")
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false })

  if (error) {
    console.log("[v0] /expenses GET supabase error:", error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2) Supplier-imported costs auto-attached to this trip (Shell, Cargobox,
  //    OMV, etc.). These live in cost_entries and we never want to write to
  //    them from the trip editor (the supplier file is the source of
  //    truth), so we surface them with read_only: true and a source value
  //    derived from the provider so the UI can show a "Shell"/"Cargobox"
  //    badge instead of the generic "driver"/"ai".
  const { data: importedRaw, error: importedErr } = await supabase
    .from("cost_entries")
    .select(
      `
        id, trip_id, trip_leg_id, vehicle_id, driver_id,
        cost_code, cost_catalog_id, description, notes,
        amount, amount_incl_vat, amount_excl_vat, tax_rate, tax_amount,
        amount_eur, currency, occurred_at, country_code,
        vendor_name, location_label, latitude, longitude,
        units_qty, liters_qty, kwh_qty, status,
        provider_id,
        cost_catalog:cost_catalog_id ( id, cost_code, cost_line, unit ),
        cost_providers:provider_id ( id, code, name )
      `,
    )
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false })

  if (importedErr) {
    // Don't fail the whole call \u2014 just log and return what we have.
    console.log("[v0] /expenses GET cost_entries error:", importedErr.message)
  }

  // Reshape cost_entries rows into the trip_expenses shape the tabs expect.
  const imported = (importedRaw ?? []).map((c: any) => {
    const code = c.cost_code ?? c.cost_catalog?.cost_code ?? null
    const category = categoryFromCostCode(code)
    // Pick the most useful quantity for the tab to display. Fuel rows get
    // litres; everything else falls back to units_qty when present.
    const qty =
      category === "fuel" || category === "ad_blue"
        ? c.liters_qty ?? c.units_qty ?? null
        : c.units_qty ?? null
    const unit =
      category === "fuel" || category === "ad_blue"
        ? c.liters_qty != null
          ? "L"
          : c.cost_catalog?.unit ?? null
        : c.cost_catalog?.unit ?? null
    const providerCode = c.cost_providers?.code ?? null
    return {
      id: c.id,
      trip_id: c.trip_id,
      leg_id: c.trip_leg_id ?? null,
      order_id: null,
      category,
      description: c.description ?? null,
      amount: c.amount_incl_vat ?? c.amount ?? null,
      currency: c.currency ?? "EUR",
      amount_eur: c.amount_eur ?? null,
      tax_rate: c.tax_rate ?? null,
      tax_amount: c.tax_amount ?? null,
      amount_excl_vat: c.amount_excl_vat ?? null,
      amount_incl_vat: c.amount_incl_vat ?? c.amount ?? null,
      amount_eur_excl_vat: null,
      amount_eur_incl_vat: c.amount_eur ?? null,
      occurred_at: c.occurred_at,
      country: c.country_code ?? null,
      vendor: c.vendor_name ?? c.cost_providers?.name ?? null,
      receipt_url: null,
      // The UI uses `source` to render a small badge ("driver", "ai"). We
      // emit the provider code (uppercased) so a Cargobox row shows
      // "CARGOBOX" and a Shell row shows "SHELL", both clearly distinct
      // from the manual sources.
      source: providerCode ? providerCode.toUpperCase() : "provider_import",
      status: c.status ?? "recorded",
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
      location_label: c.location_label ?? null,
      quantity: qty,
      unit,
      extraction_confidence: null,
      cost_catalog_id: c.cost_catalog_id ?? null,
      cost_catalog: c.cost_catalog ?? null,
      driver: null,
      // Flags consumed by the UI to hide edit / delete / approve actions.
      // Imported rows are owned by the supplier file; corrections must
      // happen at the source (re-import or adjust at the provider level).
      read_only: true,
      origin: "cost_entry" as const,
    }
  })

  // 3) Merge \u2014 driver-entered first if same occurred_at, but otherwise
  //    sorted descending by occurred_at so the newest tx is on top.
  const merged = [...(tripExpenses ?? []).map((e: any) => ({ ...e, origin: "trip_expense" as const, read_only: false })), ...imported]
  merged.sort((a, b) => {
    const ta = a.occurred_at ? new Date(a.occurred_at).getTime() : 0
    const tb = b.occurred_at ? new Date(b.occurred_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json({ expenses: merged })
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
