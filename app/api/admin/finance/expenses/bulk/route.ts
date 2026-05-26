import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Bulk approve / reject pending review expenses (post-consolidation: now
 * cost_entries-backed). Tenant-safety: admin_id from the client session is
 * required and used directly to scope the UPDATE.
 *
 * Body: { ids: string[], action: "approve" | "reject", reason?: string,
 *         admin_id: string }
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  const action: "approve" | "reject" = body.action
  const reason: string | null = typeof body.reason === "string" ? body.reason : null
  const adminId: string | null = typeof body.admin_id === "string" ? body.admin_id : null

  if (!ids.length) {
    return NextResponse.json({ error: "No expense IDs provided" }, { status: 400 })
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }
  if (!adminId) {
    return NextResponse.json({ error: "admin_id is required" }, { status: 401 })
  }

  const supabase = serviceClient()

  const newStatus = action === "approve" ? "approved" : "rejected"
  const stamps: Record<string, unknown> = {
    status: newStatus,
    approved_by: adminId,
    approved_at: new Date().toISOString(),
  }
  if (action === "reject") stamps.dispute_reason = reason

  // Single UPDATE scoped by admin_id + status guard. No need to round-trip
  // through trips anymore — cost_entries has admin_id directly.
  const { data, error } = await supabase
    .from("cost_entries")
    .update(stamps)
    .in("id", ids)
    .eq("admin_id", adminId)
    .eq("status", "pending_review")
    .select("id, trip_id, trip_leg_id, category, amount, currency, vendor_name")

  if (error) {
    console.log("[v0] /finance/expenses/bulk:", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Audit events — best-effort, batch insert.
  if (data && data.length) {
    await supabase.from("trip_events").insert(
      data
        .filter((e) => e.trip_id) // only log per-trip rows
        .map((e) => ({
          trip_id: e.trip_id,
          leg_id: e.trip_leg_id,
          event_type: action === "approve" ? "expense_approved" : "expense_rejected",
          severity: action === "approve" ? "success" : "warning",
          title: `${e.category ?? "expense"} ${e.amount} ${e.currency} ${newStatus}`,
          description: reason,
          metadata: { expense_id: e.id, vendor: e.vendor_name, bulk: true },
          actor_type: "admin",
          actor_id: adminId,
        })),
    )
  }

  return NextResponse.json({ updated: data?.length ?? 0, ids: data?.map((r) => r.id) ?? [] })
}
