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
 * GET /api/admin/action-center/definitions
 * List all rule definitions for the admin with their current settings
 */
export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ definitions: [] }, { status: 200 })
  }

  const supabase = serviceClient()

  const { data, error } = await supabase
    .from("action_center_definitions")
    .select("*")
    .eq("admin_id", adminId)
    .order("category")
    .order("code")

  if (error) {
    console.error("[ActionCenter] GET definitions error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ definitions: data ?? [] })
}

/**
 * PATCH /api/admin/action-center/definitions
 * Update a rule definition (toggle, thresholds, assignee, channels)
 */
export async function PATCH(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("admin_id")
  if (!adminId) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 })
  }

  const body = await req.json()
  const { definition_id, ...updates } = body

  if (!definition_id) {
    return NextResponse.json({ error: "definition_id required" }, { status: 400 })
  }

  // Only allow specific fields to be updated
  const allowedFields = [
    "is_enabled",
    "default_assignee_role",
    "severity_matrix",
    "thresholds",
    "notify_channels",
    "email_recipients",
    "escalation_after_hours",
    // Reminder schedule fields
    "reminder_offsets_before",
    "reminder_daily_after_due",
    "reminder_daily_max_days",
    "send_window",
    "business_hours_start",
    "business_hours_end",
    "skip_weekends",
    "timezone",
    "digest_mode",
    "escalation_role",
    "min_hours_between_emails",
  ]

  const safeUpdates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (field in updates) {
      safeUpdates[field] = updates[field]
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const supabase = serviceClient()

  const { data, error } = await supabase
    .from("action_center_definitions")
    .update(safeUpdates)
    .eq("id", definition_id)
    .eq("admin_id", adminId)
    .select()
    .single()

  if (error) {
    console.error("[ActionCenter] PATCH definition error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ definition: data })
}
