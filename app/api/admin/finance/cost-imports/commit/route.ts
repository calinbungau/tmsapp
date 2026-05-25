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

    if (date) {
      if (!dateMin || date < dateMin) dateMin = date
      if (!dateMax || date > dateMax) dateMax = date
    }
    if (typeof amount === "number") totalAmount += amount
    if (typeof amountEur === "number") totalAmountEur += amountEur

    toInsert.push({
      admin_id,
      provider_id,
      external_id: m.external_id ? String(m.external_id) : null,
      external_source: externalSource,
      source: "import",
      status: needsReview && !auto_approve ? "pending_review" : needsReview ? "pending_review" : status,
      cost_code: r.resolved.cost_code ?? provider.default_cost_code ?? null,
      cost_catalog_id: r.resolved.cost_catalog_id ?? null,
      vehicle_id: r.resolved.vehicle_id,
      driver_id: r.resolved.driver_id,
      trailer_id: r.resolved.trailer_id,
      vendor_id: r.resolved.vendor_id,
      vendor_name: m.vendor_name ? String(m.vendor_name) : null,
      entry_date: date,
      posting_date: m.posting_date ? String(m.posting_date) : null,
      country_code: m.country_code ? String(m.country_code).slice(0, 2) : null,
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
      location_label: m.location_label ? String(m.location_label) : null,
      description: m.product_code ? String(m.product_code) : null,
      notes: m.notes ? String(m.notes) : null,
      occurred_at: date ? new Date(date + "T00:00:00Z").toISOString() : null,
      extracted_data: { source_row: r.raw },
    })
  }

  // Insert in chunks to avoid payload limits.
  let inserted = 0
  const errors: string[] = []
  const CHUNK = 200
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK)
    const { data, error } = await supabase.from("cost_entries").insert(slice).select("id")
    if (error) {
      errors.push(error.message)
    } else {
      inserted += data?.length ?? 0
    }
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
    skipped: skipped.length,
    duplicates: skipped.filter((s) => s.reason === "duplicate").length,
    errors,
    status: finalStatus,
  })
}
