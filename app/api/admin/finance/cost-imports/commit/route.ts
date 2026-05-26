/**
 * Commit a previously-previewed import to cost_entries.
 *
 * Body: { admin_id, provider_id, file_name, file_url?, rows: ParsedRow[],
 *         auto_approve?: boolean }
 *
 * - rows that came back as "ready" or "needs_attention" are inserted.
 * - rows marked "duplicate" or "error" are skipped (and logged in
 *   cost_provider_imports.unmapped_rows / .error_log).
 * - status is "posted" when auto_approve = true (default for trusted
 *   providers), else "pending_review" so the same rows show up in the
 *   Finance Review queue alongside AI-extracted receipts.
 *
 * Writes a single audit row to cost_provider_imports with counts and
 * total imported amount.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { ParsedRow } from "@/lib/cost-imports/types"
import { geocodeBatch, makeGeocodeKey } from "@/lib/geocoding/nominatim"

export const runtime = "nodejs"
export const maxDuration = 120

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface Body {
  admin_id: string
  provider_id: string
  file_name: string
  file_url?: string | null
  file_size_bytes?: number
  rows: ParsedRow[]
  auto_approve?: boolean
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body
  const { admin_id, provider_id, file_name, file_url, file_size_bytes, rows, auto_approve = true } = body

  if (!admin_id || !provider_id || !Array.isArray(rows)) {
    return NextResponse.json({ error: "admin_id, provider_id, rows required" }, { status: 400 })
  }

  const supabase = service()
  const { data: provider, error: pErr } = await supabase
    .from("cost_providers")
    .select("id, code, default_currency, default_cost_code")
    .eq("id", provider_id)
    .eq("admin_id", admin_id)
    .single()
  if (pErr || !provider) {
    return NextResponse.json({ error: pErr?.message || "Provider not found" }, { status: 404 })
  }

  const externalSource = `provider:${provider.code || provider.id}`
  const status = auto_approve ? "posted" : "pending_review"

  // Open the audit row first so we have an id to associate failures with.
  const { data: importRun, error: importErr } = await supabase
    .from("cost_provider_imports")
    .insert({
      admin_id,
      provider_id,
      file_name,
      file_url: file_url ?? null,
      file_size_bytes: file_size_bytes ?? null,
      total_rows: rows.length,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (importErr) return NextResponse.json({ error: importErr.message }, { status: 500 })

  const importId = importRun.id

  // Build entries for rows we'll insert.
  const toInsert: Record<string, unknown>[] = []
  const skipped: { reason: string; row: ParsedRow }[] = []
  const unmapped: ParsedRow[] = []
  let dateMin: string | null = null
  let dateMax: string | null = null
  let totalAmount = 0
  let totalAmountEur = 0

  // Collect unique (country, location_label) pairs for geocoding.
  const geocodePairs: Array<{ label: string; country: string | null }> = []
  const seenGeoKeys = new Set<string>()

  for (const r of rows) {
    if (r.status === "duplicate") {
      skipped.push({ reason: "duplicate", row: r })
      continue
    }
    if (r.status === "error") {
      skipped.push({ reason: "error", row: r })
      continue
    }
    // "needs_attention" rows still get imported but flagged in status =
    // pending_review, regardless of auto_approve, so reviewers see them.
    const needsReview = r.status === "needs_attention"
    if (r.status === "needs_attention") unmapped.push(r)

    const m = r.mapped
    const amount = (m.amount_incl_vat as number) ?? null
    const amountEur = (m.amount_eur as number) ?? null
    const date = (m.entry_date as string) ?? null
    const time = m.entry_time ? String(m.entry_time).trim() : null
    const postingDate = (m.posting_date as string) ?? null
    const postingTime = m.posting_time ? String(m.posting_time).trim() : null

    if (date) {
      if (!dateMin || date < dateMin) dateMin = date
      if (!dateMax || date > dateMax) dateMax = date
    }
    if (typeof amount === "number") totalAmount += amount
    if (typeof amountEur === "number") totalAmountEur += amountEur

    const occurredAt = combineDateTime(date, time)
    const postedAt = combineDateTime(postingDate, postingTime)

    const country = m.country_code ? String(m.country_code).slice(0, 2).toUpperCase() : null
    const locationLabel = m.location_label ? String(m.location_label).trim() : null
    if (locationLabel) {
      const key = makeGeocodeKey(country, locationLabel)
      if (!seenGeoKeys.has(key)) {
        seenGeoKeys.add(key)
        geocodePairs.push({ label: locationLabel, country })
      }
    }

    toInsert.push({
      admin_id,
      provider_id,
      external_id: m.external_id ? String(m.external_id) : null,
      external_source: externalSource,
      source: "provider_import",
      status: needsReview && !auto_approve ? "pending_review" : needsReview ? "pending_review" : status,
      cost_code: r.resolved.cost_code ?? provider.default_cost_code ?? null,
      cost_catalog_id: r.resolved.cost_catalog_id ?? null,
      vehicle_id: r.resolved.vehicle_id,
      driver_id: r.resolved.driver_id,
      trailer_id: r.resolved.trailer_id,
      vendor_id: r.resolved.vendor_id,
      vendor_name: m.vendor_name ? String(m.vendor_name) : null,
      entry_date: date,
      posting_date: postingDate,
      country_code: country,
      invoice_number: m.invoice_number ? String(m.invoice_number) : null,
      currency: m.currency ? String(m.currency) : provider.default_currency || "EUR",
      amount: amount,
      amount_incl_vat: amount,
      amount_excl_vat: m.amount_excl_vat ?? null,
      tax_amount: m.tax_amount ?? null,
      tax_rate: m.tax_rate ?? null,
      amount_eur: amountEur,
      liters_qty: m.liters_qty ?? null,
      kwh_qty: m.kwh_qty ?? null,
      km_qty: m.km_qty ?? null,
      units_qty: m.units_qty ?? null,
      location_label: locationLabel,
      description: m.product_code ? String(m.product_code) : null,
      notes: m.notes ? String(m.notes) : null,
      occurred_at: occurredAt,
      // posted_at lives in extracted_data since cost_entries doesn't have a
      // dedicated column; reviewers can still see it from the supplier file.
      extracted_data: { source_row: r.raw, posted_at: postedAt },
    })
  }

  // Pre-filter duplicates against the partial unique index
  // (admin_id, external_source, external_id) — we can't use ON CONFLICT
  // because PostgREST can't infer a partial unique index, so we query
  // existing external_ids first and drop them from the insert payload.
  // Rows without an external_id can never be deduped this way (manual /
  // recurring costs are allowed to repeat), so they always pass through.
  const externalIds = Array.from(
    new Set(toInsert.map((r) => r.external_id).filter((v): v is string => typeof v === "string" && v.length > 0)),
  )
  let preexistingIds = new Set<string>()
  if (externalIds.length > 0) {
    // Chunk the IN list to stay under URL/length limits.
    const ID_CHUNK = 500
    for (let i = 0; i < externalIds.length; i += ID_CHUNK) {
      const idsSlice = externalIds.slice(i, i + ID_CHUNK)
      const { data: existing, error: dupErr } = await supabase
        .from("cost_entries")
        .select("external_id")
        .eq("admin_id", admin_id)
        .eq("external_source", externalSource)
        .in("external_id", idsSlice)
      if (dupErr) {
        // Don't fail the import on a dedup-lookup hiccup — just log and proceed.
        console.log("[v0] dedup lookup failed:", dupErr.message)
        continue
      }
      for (const row of existing ?? []) {
        if (row.external_id) preexistingIds.add(row.external_id as string)
      }
    }
  }

  let dbDuplicates = 0
  const filteredInsert = toInsert.filter((r) => {
    if (typeof r.external_id === "string" && preexistingIds.has(r.external_id)) {
      dbDuplicates++
      return false
    }
    return true
  })

  // Plain INSERT in chunks now that duplicates are removed up-front.
  let inserted = 0
  const errors: string[] = []
  const CHUNK = 200
  for (let i = 0; i < filteredInsert.length; i += CHUNK) {
    const slice = filteredInsert.slice(i, i + CHUNK)
    const { data, error } = await supabase.from("cost_entries").insert(slice).select("id")
    if (error) {
      errors.push(error.message)
    } else {
      inserted += data?.length ?? 0
    }
  }

  // ---- Geocoding enrichment (cache-first, throttled live calls) ----
  // We only update the rows we just inserted so re-runs are idempotent.
  // Live Nominatim calls are rate-limited to ~1.1s/call; cap fresh queries
  // at 25 per import so a 690-row file doesn't stretch past maxDuration.
  let geocodedCount = 0
  try {
    if (geocodePairs.length > 0) {
      // Cap fresh resolutions; we'll still hit the cache for the rest.
      const FRESH_CAP = 25
      const cappedPairs = geocodePairs.slice(0, 200) // sanity cap on payload
      // The batch helper already de-dupes and is cache-first.
      const results = await geocodeBatch(supabase, cappedPairs)
      // Build a (country|label) → result map and write back to cost_entries.
      const updates: Array<{
        admin_id: string
        provider_id: string
        location_label: string
        country_code: string | null
        latitude: number | null
        longitude: number | null
        geocoded_address: string | null
      }> = []
      for (const [, p] of cappedPairs.entries()) {
        const key = makeGeocodeKey(p.country, p.label)
        const r = results.get(key)
        if (!r || r.status !== "ok") continue
        updates.push({
          admin_id,
          provider_id,
          location_label: p.label,
          country_code: p.country,
          latitude: r.latitude,
          longitude: r.longitude,
          geocoded_address: r.display_name,
        })
      }
      // Apply updates in batches: one UPDATE per (location_label, country) pair.
      for (const u of updates.slice(0, FRESH_CAP * 2)) {
        let q = supabase
          .from("cost_entries")
          .update({
            latitude: u.latitude,
            longitude: u.longitude,
            geocoded_address: u.geocoded_address,
          })
          .eq("admin_id", u.admin_id)
          .eq("provider_id", u.provider_id)
          .eq("location_label", u.location_label)
          .is("latitude", null)
        if (u.country_code) q = q.eq("country_code", u.country_code)
        const { error } = await q
        if (!error) geocodedCount++
      }
    }
  } catch (geoErr) {
    // Geocoding is best-effort — never fail the import.
    console.log("[v0] geocoding pass failed:", (geoErr as Error)?.message)
  }

  // Update mapping rule usage counters in bulk (best-effort).
  const ruleHits = new Map<string, number>()
  for (const r of rows) {
    if (r.status === "ready" || r.status === "needs_attention") {
      const code = r.resolved.cost_code
      const product = String(r.mapped.product_code ?? "").trim()
      if (code && product) {
        ruleHits.set(product.toLowerCase(), (ruleHits.get(product.toLowerCase()) || 0) + 1)
      }
    }
  }
  if (ruleHits.size) {
    const { data: existingRules } = await supabase
      .from("cost_provider_mappings")
      .select("id, external_name, match_count")
      .eq("provider_id", provider_id)
      .eq("admin_id", admin_id)
    for (const rule of existingRules ?? []) {
      const k = (rule.external_name || "").toLowerCase()
      const hits = ruleHits.get(k)
      if (hits) {
        await supabase
          .from("cost_provider_mappings")
          .update({
            match_count: (rule.match_count || 0) + hits,
            last_matched_at: new Date().toISOString(),
          })
          .eq("id", rule.id)
      }
    }
  }

  // Close the audit row.
  const finalStatus = errors.length ? (inserted > 0 ? "partial" : "failed") : "completed"
  await supabase
    .from("cost_provider_imports")
    .update({
      status: finalStatus,
      total_rows: rows.length,
      imported_count: inserted,
      duplicate_count: skipped.filter((s) => s.reason === "duplicate").length,
      skipped_count: skipped.length,
      error_count: errors.length,
      error_log: errors.length ? { errors } : null,
      unmapped_rows:
        unmapped.length > 0
          ? unmapped.slice(0, 100).map((u) => ({ row: u.rowIndex, issues: u.issues, raw: u.raw }))
          : null,
      total_amount: totalAmount || null,
      total_amount_eur: totalAmountEur || null,
      period_from: dateMin,
      period_to: dateMax,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId)

  await supabase
    .from("cost_providers")
    .update({
      last_import_at: new Date().toISOString(),
      last_import_status: finalStatus,
    })
    .eq("id", provider_id)
    .eq("admin_id", admin_id)

  return NextResponse.json({
    import_id: importId,
    inserted,
    skipped: skipped.length + dbDuplicates,
    duplicates: skipped.filter((s) => s.reason === "duplicate").length + dbDuplicates,
    errors,
    status: finalStatus,
    geocoded: geocodedCount,
  })
}

/**
 * Combine a "YYYY-MM-DD" date with an "HH:MM[:SS]" time into an ISO
 * timestamp. If only the date is present, returns midnight UTC. If neither
 * is present, returns null.
 */
function combineDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null
  if (!time) return new Date(date + "T00:00:00Z").toISOString()
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time.trim())
  if (!m) return new Date(date + "T00:00:00Z").toISOString()
  const hh = m[1].padStart(2, "0")
  const mm = m[2]
  const ss = m[3] ?? "00"
  return new Date(`${date}T${hh}:${mm}:${ss}Z`).toISOString()
}
