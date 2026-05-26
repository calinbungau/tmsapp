/**
 * Cost-code mapping rules for a provider.
 *
 *   POST   /api/admin/finance/cost-providers/[id]/rules   { admin_id, ...rule }
 *   PATCH  /api/admin/finance/cost-providers/[id]/rules   { admin_id, rule_id, ...patch }
 *   DELETE /api/admin/finance/cost-providers/[id]/rules?admin_id=...&rule_id=...
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()
  const { admin_id, ...rule } = body
  if (!admin_id) return NextResponse.json({ error: "admin_id required" }, { status: 400 })

  const supabase = service()
  // external_code is NOT NULL; if the user didn't supply one, derive a
  // deterministic synthetic key from the rule shape so the unique constraint
  // (admin_id, provider_id, external_code) doesn't reject same-name rules
  // that differ only by their conditional filter.
  const synthetic =
    rule.external_code ??
    [rule.external_name, rule.vehicle_match_field, rule.vehicle_match_pattern]
      .filter(Boolean)
      .join("|") ??
    `rule_${Date.now()}`
  const { data, error } = await supabase
    .from("cost_provider_mappings")
    .insert({
      admin_id,
      provider_id: id,
      is_active: true,
      ...rule,
      external_code: synthetic,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()
  const { admin_id, rule_id, ...patch } = body
  if (!admin_id || !rule_id)
    return NextResponse.json({ error: "admin_id and rule_id required" }, { status: 400 })

  const supabase = service()
  const { data, error } = await supabase
    .from("cost_provider_mappings")
    .update(patch)
    .eq("id", rule_id)
    .eq("provider_id", id)
    .eq("admin_id", admin_id)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const adminId = req.nextUrl.searchParams.get("admin_id")
  const ruleId = req.nextUrl.searchParams.get("rule_id")
  if (!adminId || !ruleId)
    return NextResponse.json({ error: "admin_id and rule_id required" }, { status: 400 })

  const supabase = service()
  const { error } = await supabase
    .from("cost_provider_mappings")
    .delete()
    .eq("id", ruleId)
    .eq("provider_id", id)
    .eq("admin_id", adminId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
