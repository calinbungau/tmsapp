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
 * GET /api/admin/action-center/stats
 * Get counts by status, severity, and category for the dashboard widget
 */
export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  const userId = req.nextUrl.searchParams.get("user_id") // Optional: filter by assignee
  
  if (!adminId) {
    return NextResponse.json({ stats: {} }, { status: 200 })
  }

  const supabase = serviceClient()

  // Get all open/snoozed items to compute stats
  let query = supabase
    .from("action_center_items")
    .select("id, severity, status, category, assignee_user_id")
    .eq("admin_id", adminId)
    .in("status", ["open", "snoozed"])

  const { data: items, error } = await query

  if (error) {
    console.error("[ActionCenter] GET stats error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allItems = items ?? []

  // Compute aggregate stats
  const stats = {
    total: allItems.length,
    by_severity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    } as Record<string, number>,
    by_status: {
      open: 0,
      snoozed: 0,
    } as Record<string, number>,
    by_category: {} as Record<string, number>,
    // User-specific counts (if user_id provided)
    assigned_to_me: 0,
    unassigned: 0,
  }

  for (const item of allItems) {
    // By severity
    if (item.severity in stats.by_severity) {
      stats.by_severity[item.severity]++
    }

    // By status
    if (item.status in stats.by_status) {
      stats.by_status[item.status]++
    }

    // By category
    stats.by_category[item.category] = (stats.by_category[item.category] || 0) + 1

    // Assignee stats
    if (!item.assignee_user_id) {
      stats.unassigned++
    } else if (userId && item.assignee_user_id === userId) {
      stats.assigned_to_me++
    }
  }

  return NextResponse.json({ stats })
}
