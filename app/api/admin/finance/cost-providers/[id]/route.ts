/**
 * Single-provider read/update/delete + nested mapping-rules CRUD.
 *
 *   GET    /api/admin/finance/cost-providers/[id]?admin_id=...
 *   PATCH  /api/admin/finance/cost-providers/[id]   { admin_id, ...fields }
 *   DELETE /api/admin/finance/cost-providers/[id]?admin_id=...
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) return NextResponse.json({ error: "admin_id required" }, { status: 400 })

  const supabase = service()
  const [{ data: provider, error: pErr }, { data: rules, error: rErr }] = await Promise.all([
    supabase.from("cost_providers").select("*").eq("id", id).eq("admin_id", adminId).single(),
    supabase
      .from("cost_provider_mappings")
      .select("*")
      .eq("provider_id", id)
      .eq("admin_id", adminId)
      .order("external_name"),
  ])
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 })
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  return NextResponse.json({ provider, rules: rules ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()
  const { admin_id, ...patch } = body
  if (!admin_id) return NextResponse.json({ error: "admin_id required" }, { status: 400 })

  const supabase = service()
  const { data, error } = await supabase
    .from("cost_providers")
    .update(patch)
    .eq("id", id)
    .eq("admin_id", admin_id)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ provider: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) return NextResponse.json({ error: "admin_id required" }, { status: 400 })

  const supabase = service()
  // Cascade rules first (no FK cascade is set in the schema we see).
  await supabase.from("cost_provider_mappings").delete().eq("provider_id", id).eq("admin_id", adminId)
  const { error } = await supabase
    .from("cost_providers")
    .delete()
    .eq("id", id)
    .eq("admin_id", adminId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
