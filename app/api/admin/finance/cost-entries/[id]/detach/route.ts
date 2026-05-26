import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Manual override for an auto-attached cost_entries row.
 *
 * Auto-attach picks the trip whose vehicle window contains the cost's
 * occurred_at; for overlapping windows (two trips chaining the same truck
 * on the same day) it can pick the wrong one. This endpoint lets a
 * reviewer detach the row so it stops contributing to that trip's P&L
 * and either:
 *   1) sits unattached (default) until the cron / next stop edit
 *      re-evaluates it, or
 *   2) re-runs the attach logic right now if `?reattach=1` is passed.
 *
 * We do NOT support "move to a specific trip id" yet -- that opens the
 * door to mis-attributing fuel to trips the row's vehicle never ran.
 * Reviewers should fix the underlying trip windows instead.
 */
function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const url = new URL(req.url)
  const reattach = url.searchParams.get("reattach") === "1"

  const s = service()

  // Need admin_id for the (optional) reattach call.
  const { data: row, error: fetchErr } = await s
    .from("cost_entries")
    .select("id, admin_id")
    .eq("id", id)
    .single()
  if (fetchErr || !row) {
    return NextResponse.json({ error: fetchErr?.message ?? "Not found" }, { status: 404 })
  }

  const { error: updErr } = await s
    .from("cost_entries")
    .update({ trip_id: null, trip_leg_id: null })
    .eq("id", id)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  let reattached: { attached_to_trip: number; attached_to_leg: number } | null = null
  if (reattach && row.admin_id) {
    const { data, error: rpcErr } = await s.rpc("tms_auto_attach_cost_entries", {
      p_admin_id: row.admin_id,
      p_ids: [id],
    })
    if (rpcErr) {
      // Detach succeeded; only the reattach failed. Surface that distinctly
      // so the UI can tell the user "detached, but reattach failed".
      return NextResponse.json(
        { ok: true, detached: true, reattach_error: rpcErr.message },
        { status: 200 },
      )
    }
    if (Array.isArray(data) && data[0]) {
      reattached = {
        attached_to_trip: data[0].attached_to_trip ?? 0,
        attached_to_leg: data[0].attached_to_leg ?? 0,
      }
    }
  }

  return NextResponse.json({ ok: true, detached: true, reattached })
}
