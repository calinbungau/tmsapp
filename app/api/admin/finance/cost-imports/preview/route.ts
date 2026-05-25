/**
 * Preview a cost-provider file import.
 *
 * Parses the uploaded file using the saved provider template, runs the
 * resolver (vehicle/driver/vendor/cost-code lookups + duplicate detection),
 * and returns rows tagged with their resolution status. NO writes happen.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseBuffer } from "@/lib/cost-imports/parse"
import { applyTemplate } from "@/lib/cost-imports/resolve"
import type { MappingTemplate } from "@/lib/cost-imports/types"

export const runtime = "nodejs"
export const maxDuration = 90

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get("file") as File | null
  const adminId = fd.get("admin_id") as string
  const providerId = fd.get("provider_id") as string
  if (!file || !adminId || !providerId) {
    return NextResponse.json(
      { error: "file, admin_id and provider_id required" },
      { status: 400 },
    )
  }

  const supabase = service()

  // Load provider + rules + lookup tables in parallel.
  const [
    { data: provider, error: pErr },
    { data: rules, error: rErr },
    { data: vehicles },
    { data: drivers },
    { data: vendors },
    { data: catalog },
  ] = await Promise.all([
    supabase.from("cost_providers").select("*").eq("id", providerId).eq("admin_id", adminId).single(),
    supabase.from("cost_provider_mappings").select("*").eq("provider_id", providerId).eq("admin_id", adminId),
    supabase.from("vehicles").select("id, plate_number").eq("admin_id", adminId),
    supabase.from("drivers").select("id, name, driver_card_number").eq("admin_id", adminId),
    supabase.from("business_partners").select("id, name").eq("admin_id", adminId),
    supabase.from("cost_catalog").select("id, cost_code").eq("admin_id", adminId),
  ])
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 })
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 })

  const tpl = (provider.mapping_template as MappingTemplate | null) || { fields: {} }
  const buf = Buffer.from(await file.arrayBuffer())
  const parsed = parseBuffer(buf, file.name, {
    format:
      (provider.file_format as "xlsx" | "xls" | "csv" | undefined) ||
      (file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx"),
    sheetName: tpl.sheet_name,
    headerRowIndex: tpl.header_row_index ?? 0,
    delimiter:
      provider.file_delimiter && provider.file_delimiter !== "auto"
        ? provider.file_delimiter
        : undefined,
    hasHeaderRow: provider.has_header_row !== false,
  })

  // Look up existing external_ids on cost_entries to detect duplicates.
  const externalSource = `provider:${provider.code || provider.id}`
  const { data: existing } = await supabase
    .from("cost_entries")
    .select("external_id")
    .eq("admin_id", adminId)
    .eq("provider_id", providerId)
    .not("external_id", "is", null)
    .limit(20000)
  const existingSet = new Set<string>(
    (existing ?? [])
      .filter((r) => r.external_id)
      .map((r) => `${externalSource}|${String(r.external_id).trim()}`),
  )

  const rows = applyTemplate(parsed.rows, {
    template: tpl,
    rules: rules ?? [],
    vehicles: vehicles ?? [],
    drivers: drivers ?? [],
    vendors: vendors ?? [],
    catalog: catalog ?? [],
    existingExternalIds: existingSet,
    defaultCurrency: provider.default_currency,
    defaultCostCode: provider.default_cost_code,
    externalSource,
  })

  // Summary
  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    needs_attention: rows.filter((r) => r.status === "needs_attention").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    error: rows.filter((r) => r.status === "error").length,
  }

  return NextResponse.json({
    headers: parsed.headers,
    rows,
    summary,
    file_name: file.name,
    file_size_bytes: buf.length,
    provider: {
      id: provider.id,
      name: provider.name,
      code: provider.code,
      default_currency: provider.default_currency,
      external_source: externalSource,
    },
  })
}
