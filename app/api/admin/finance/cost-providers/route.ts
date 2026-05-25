/**
 * CRUD endpoints for cost_providers and their mapping rules.
 *
 *   GET    /api/admin/finance/cost-providers?admin_id=...
 *   POST   /api/admin/finance/cost-providers              { admin_id, ...fields, prebuilt_code? }
 *
 * The "prebuilt_code" shortcut lets the UI clone one of our pre-shipped
 * supplier templates (Toll4Europe, Shell, DKV, OMV) in one call — saving
 * the user from copying the field map manually.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { findPrebuilt } from "@/lib/cost-imports/prebuilt"

export const runtime = "nodejs"

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) return NextResponse.json({ providers: [] })

  const supabase = service()
  const { data, error } = await supabase
    .from("cost_providers")
    .select("*")
    .eq("admin_id", adminId)
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return rule counts in the same call so the list view can display them.
  const providerIds = (data ?? []).map((p) => p.id)
  let ruleCounts: Record<string, number> = {}
  if (providerIds.length) {
    const { data: rules } = await supabase
      .from("cost_provider_mappings")
      .select("provider_id")
      .in("provider_id", providerIds)
    ruleCounts = (rules ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.provider_id] = (acc[r.provider_id] || 0) + 1
      return acc
    }, {})
  }

  return NextResponse.json({
    providers: (data ?? []).map((p) => ({ ...p, rule_count: ruleCounts[p.id] || 0 })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { admin_id, prebuilt_code, ...rest } = body
  if (!admin_id) return NextResponse.json({ error: "admin_id required" }, { status: 400 })

  const supabase = service()

  // Cloning a prebuilt template: copy fields + seed mapping rules.
  if (prebuilt_code) {
    const tpl = findPrebuilt(prebuilt_code)
    if (!tpl) return NextResponse.json({ error: "Unknown prebuilt template" }, { status: 400 })

    const insertPayload = {
      admin_id,
      name: rest.name || tpl.name,
      code: rest.code || `${tpl.code}_${Date.now().toString(36)}`,
      provider_type: tpl.provider_type,
      file_format: tpl.file_format,
      file_delimiter: tpl.file_format === "csv" ? "auto" : null,
      file_encoding: "utf-8",
      has_header_row: true,
      default_currency: tpl.default_currency,
      default_cost_code: tpl.default_cost_code ?? null,
      mapping_template: tpl.template,
      is_active: true,
      import_method: tpl.file_format === "csv" ? "csv" : "excel",
      notes: tpl.notes || null,
    }

    const { data: provider, error } = await supabase
      .from("cost_providers")
      .insert(insertPayload)
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Seed rules. Resolve each cost_code to a cost_catalog_id when possible.
    if (tpl.rules.length) {
      const codes = Array.from(new Set(tpl.rules.map((r) => r.cost_code)))
      const { data: catalog } = await supabase
        .from("cost_catalog")
        .select("id, cost_code")
        .eq("admin_id", admin_id)
        .in("cost_code", codes)
      const codeToId = new Map<string, string>()
      ;(catalog ?? []).forEach((c) => {
        if (c.cost_code) codeToId.set(c.cost_code, c.id)
      })
      const ruleRows = tpl.rules.map((r) => ({
        admin_id,
        provider_id: provider.id,
        external_name: r.external_name,
        external_code: r.external_code ?? null,
        cost_code: r.cost_code,
        cost_catalog_id: codeToId.get(r.cost_code) ?? null,
        // Reuse vehicle_match_field/pattern as a generic conditional filter
        // (e.g. country_code = "DE" so "Road tax" → A1-010 only when DE).
        vehicle_match_field: r.match_field ?? null,
        vehicle_match_pattern: r.match_pattern ?? null,
        is_active: true,
      }))
      await supabase.from("cost_provider_mappings").insert(ruleRows)
    }
    return NextResponse.json({ provider })
  }

  // Plain create.
  const { data, error } = await supabase
    .from("cost_providers")
    .insert({ admin_id, ...rest })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ provider: data })
}
