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
 * POST /api/admin/action-center/bulk
 * Bulk update multiple items: snooze, dismiss, complete, reassign
 */
export async function POST(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  const userId = req.nextUrl.searchParams.get("user_id")
  if (!adminId) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 })
  }

  const body = await req.json()
  const { item_ids, action } = body

  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    return NextResponse.json({ error: "item_ids array required" }, { status: 400 })
  }

  const supabase = serviceClient()

  // Build update object based on action
  const updates: Record<string, any> = {}
  let eventType: string | null = null
  const eventMetadata: Record<string, any> = {}

  switch (action) {
    case "snooze":
      if (!body.snooze_until) {
        return NextResponse.json({ error: "snooze_until required" }, { status: 400 })
      }
      updates.status = "snoozed"
      updates.snoozed_until = body.snooze_until
      eventType = "snoozed"
      eventMetadata.snooze_until = body.snooze_until
      break

    case "dismiss":
      updates.status = "dismissed"
      updates.dismissed_reason = body.reason || "Bulk dismissed"
      updates.completed_at = new Date().toISOString()
      updates.completed_by = userId || null
      eventType = "dismissed"
      eventMetadata.reason = body.reason || "Bulk dismissed"
      break

    case "complete":
      updates.status = "done"
      updates.completed_at = new Date().toISOString()
      updates.completed_by = userId || null
      eventType = "completed"
      break

    case "reassign":
      updates.assignee_user_id = body.assignee_user_id || null
      updates.assignee_role = body.assignee_role || null
      eventType = "reassigned"
      eventMetadata.new_assignee_user_id = body.assignee_user_id
      break

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  // Update all items
  const { data: updatedItems, error } = await supabase
    .from("action_center_items")
    .update(updates)
    .eq("admin_id", adminId)
    .in("id", item_ids)
    .in("status", ["open", "snoozed"]) // Only update actionable items
    .select("id")

  if (error) {
    console.error("[ActionCenter] Bulk update error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const updatedCount = updatedItems?.length ?? 0

  // Record events for all updated items
  if (eventType && updatedItems && updatedItems.length > 0) {
    const events = updatedItems.map((item: { id: string }) => ({
      admin_id: adminId,
      item_id: item.id,
      event_type: "bulk_action",
      actor_type: userId ? "user" : "system",
      actor_id: userId || null,
      metadata: { ...eventMetadata, action, bulk_count: updatedCount },
    }))

    await supabase.from("action_center_events").insert(events)
  }

  return NextResponse.json({ success: true, updated_count: updatedCount })
}
