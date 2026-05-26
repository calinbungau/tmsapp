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

interface RouteParams {
  params: Promise<{ itemId: string }>
}

/**
 * GET /api/admin/action-center/items/[itemId]
 * Get a single item with its event history
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { itemId } = await params
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 })
  }

  const supabase = serviceClient()

  const { data: item, error } = await supabase
    .from("action_center_items")
    .select(`
      *,
      assignee:assignee_user_id ( id, name, email ),
      definition:definition_id ( id, code, title, description, category )
    `)
    .eq("id", itemId)
    .eq("admin_id", adminId)
    .single()

  if (error || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 })
  }

  // Get event history
  const { data: events } = await supabase
    .from("action_center_events")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(50)

  return NextResponse.json({ item, events: events ?? [] })
}

/**
 * PATCH /api/admin/action-center/items/[itemId]
 * Update item: snooze, dismiss, complete, reassign, change severity
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { itemId } = await params
  const adminId = req.nextUrl.searchParams.get("admin_id")
  const userId = req.nextUrl.searchParams.get("user_id")
  if (!adminId) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 })
  }

  const body = await req.json()
  const supabase = serviceClient()

  // Build update object
  const updates: Record<string, any> = {}
  let eventType: string | null = null
  const eventMetadata: Record<string, any> = {}

  // Snooze
  if (body.action === "snooze" && body.snooze_until) {
    updates.status = "snoozed"
    updates.snoozed_until = body.snooze_until
    eventType = "snoozed"
    eventMetadata.snooze_until = body.snooze_until
  }

  // Dismiss
  if (body.action === "dismiss") {
    updates.status = "dismissed"
    updates.dismissed_reason = body.reason || null
    updates.completed_at = new Date().toISOString()
    updates.completed_by = userId || null
    eventType = "dismissed"
    eventMetadata.reason = body.reason
  }

  // Complete (mark done)
  if (body.action === "complete") {
    updates.status = "done"
    updates.completed_at = new Date().toISOString()
    updates.completed_by = userId || null
    eventType = "completed"
  }

  // Reopen
  if (body.action === "reopen") {
    updates.status = "open"
    updates.completed_at = null
    updates.completed_by = null
    updates.snoozed_until = null
    updates.dismissed_reason = null
    eventType = "reopened"
  }

  // Reassign
  if (body.action === "reassign") {
    updates.assignee_user_id = body.assignee_user_id || null
    updates.assignee_role = body.assignee_role || null
    eventType = "reassigned"
    eventMetadata.new_assignee_user_id = body.assignee_user_id
    eventMetadata.new_assignee_role = body.assignee_role
  }

  // Change severity
  if (body.action === "change_severity" && body.severity) {
    eventMetadata.old_severity = null // Will be filled after fetch
    updates.severity = body.severity
    eventType = "severity_changed"
    eventMetadata.new_severity = body.severity
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid action provided" }, { status: 400 })
  }

  // Update item
  const { data: updatedItem, error } = await supabase
    .from("action_center_items")
    .update(updates)
    .eq("id", itemId)
    .eq("admin_id", adminId)
    .select()
    .single()

  if (error) {
    console.error("[ActionCenter] PATCH item error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Record event
  if (eventType) {
    await supabase.from("action_center_events").insert({
      admin_id: adminId,
      item_id: itemId,
      event_type: eventType,
      actor_type: userId ? "user" : "system",
      actor_id: userId || null,
      metadata: eventMetadata,
    })
  }

  return NextResponse.json({ item: updatedItem })
}
