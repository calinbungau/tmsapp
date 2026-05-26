import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * GET /api/admin/action-center/items
 * List open/snoozed items for the calling admin.
 * Supports filters: status, category, code, severity, assignee_user_id
 */
export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ items: [], count: 0 }, { status: 200 })
  }

  const supabase = serviceClient()

  // Build query
  let query = supabase
    .from("action_center_items")
    .select(`
      id,
      admin_id,
      definition_id,
      code,
      category,
      subject_type,
      subject_id,
      scope_key,
      title,
      body,
      payload,
      severity,
      status,
      assignee_user_id,
      assignee_role,
      due_at,
      snoozed_until,
      dismissed_reason,
      resolution_url,
      first_seen_at,
      last_seen_at,
      completed_at,
      completed_by,
      escalated_at,
      created_at,
      updated_at,
      assignee:assignee_user_id ( id, email, employee:employee_id ( first_name, last_name ) )
    `)
    .eq("admin_id", adminId)

  // Filter by status (default: open, snoozed)
  const statusParam = req.nextUrl.searchParams.get("status")
  if (statusParam) {
    const statuses = statusParam.split(",")
    query = query.in("status", statuses)
  } else {
    query = query.in("status", ["open", "snoozed"])
  }

  // Filter by category
  const categoryParam = req.nextUrl.searchParams.get("category")
  if (categoryParam) {
    query = query.eq("category", categoryParam)
  }

  // Filter by code
  const codeParam = req.nextUrl.searchParams.get("code")
  if (codeParam) {
    query = query.eq("code", codeParam)
  }

  // Filter by severity
  const severityParam = req.nextUrl.searchParams.get("severity")
  if (severityParam) {
    query = query.eq("severity", severityParam)
  }

  // Filter by assignee
  const assigneeParam = req.nextUrl.searchParams.get("assignee_user_id")
  if (assigneeParam === "unassigned") {
    query = query.is("assignee_user_id", null)
  } else if (assigneeParam) {
    query = query.eq("assignee_user_id", assigneeParam)
  }

  // Order by severity desc (critical first), then due_at asc
  query = query
    .order("severity", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500)

  const { data, error } = await query

  if (error) {
    console.error("[ActionCenter] GET items error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [], count: data?.length ?? 0 })
}

/**
 * POST /api/admin/action-center/items
 * Manually trigger a run of all detectors (for testing / on-demand refresh)
 */
export async function POST(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 })
  }

  const supabase = serviceClient()

  // Run the orchestrator
  const { data, error } = await supabase.rpc("_ac_run_all_detectors")

  if (error) {
    console.error("[ActionCenter] POST run detectors error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, detectors: data })
}
