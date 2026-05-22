import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Bulk approve / reject pending trip_expenses. Mirrors the audit semantics of
 * /api/admin/tms/trips/[id]/expenses/[expenseId] PATCH so every transition is
 * reflected in trip_events with actor_id and severity.
 *
 * Body: { ids: string[], action: "approve" | "reject", reason?: string,
 *         admin_id: string }
 *
 * `admin_id` is required and is sent by the client from its localStorage
 * `admin_session.id` (this app does not use Supabase Auth cookies). We
 * verify every requested expense belongs to a trip owned by that admin
 * before mutating anything.
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

  // Confirm every requested expense belongs to a trip owned by this admin
  // BEFORE we mutate anything. Without this guard a caller could approve
  // arbitrary expense IDs from other tenants by guessing the UUID.
  const { data: owned, error: ownErr } = await supabase
    .from("trip_expenses")
    .select("id, trip:trip_id ( admin_id )")
    .in("id", ids)
  if (ownErr) {
    return NextResponse.json({ error: ownErr.message }, { status: 400 })
  }
  const allowedIds = (owned ?? [])
    .filter((r) => {
      // Supabase typings flatten 1-1 embeds to an object; handle both shapes.
      const trip = (r as unknown as { trip: { admin_id: string } | { admin_id: string }[] | null }).trip
      const tripAdminId = Array.isArray(trip) ? trip[0]?.admin_id : trip?.admin_id
      return tripAdminId === adminId
    })
    .map((r) => r.id as string)

  if (!allowedIds.length) {
    return NextResponse.json({ updated: 0, ids: [] })
  }

  const newStatus = action === "approve" ? "approved" : "rejected"
  const stamps = {
    status: newStatus,
    approved_by: adminId,
    approved_at: new Date().toISOString(),
    rejected_reason: action === "reject" ? reason : null,
  }

  // Single UPDATE with .in() — much cheaper than N round-trips, and the
  // forward sync trigger to cost_entries fires per-row regardless.
  const { data, error } = await supabase
    .from("trip_expenses")
    .update(stamps)
    .in("id", allowedIds)
    .eq("status", "pending_review") // never re-process already-decided rows
    .select("id, trip_id, leg_id, category, amount, currency, vendor")

  if (error) {
    console.log("[v0] /finance/expenses/bulk:", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Audit events — best-effort, batch insert.
  if (data && data.length) {
    await supabase.from("trip_events").insert(
      data.map((e) => ({
        trip_id: e.trip_id,
        leg_id: e.leg_id,
        event_type: action === "approve" ? "expense_approved" : "expense_rejected",
        severity: action === "approve" ? "success" : "warning",
        title: `${e.category} ${e.amount} ${e.currency} ${newStatus}`,
        description: reason,
        metadata: { expense_id: e.id, vendor: e.vendor, bulk: true },
        actor_type: "admin",
        actor_id: adminId,
      })),
    )
  }

  return NextResponse.json({ updated: data?.length ?? 0, ids: data?.map((r) => r.id) ?? [] })
}
