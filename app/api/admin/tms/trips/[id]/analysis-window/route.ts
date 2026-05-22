import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Service-role client for admin writes. The trips RLS policies are wired to
 * authenticated users; the cookie-based server client gets rejected as `anon`
 * inside dynamic route handlers (same problem documented in
 * /api/admin/tms/trips/[id]/expenses), so we go through the service-role
 * client for the actual update — exactly like the rest of the admin TMS
 * routes do. The cookie client is still used to resolve the *current user*
 * (best-effort, for `route_confirmed_by`).
 */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Persists the user-chosen Planned-vs-Actual inspection window on the
 * trip. PATCH with `{ from, to, distance_km? }` (ISO timestamps) saves a
 * custom range and — if a GPS distance is supplied — also stamps
 * `trips.distance_km` and marks the trip's route as Confirmed by setting
 * `route_confirmed_at = now()` and `status = 'confirmed'` (only when the
 * trip is still in a pre-confirmed state, so we don't downgrade an
 * already-completed trip).
 *
 * PATCH with `{ reset: true }` clears the saved window AND the confirmed
 * markers so the trip falls back to the default first-stop → last-stop
 * window and is no longer shown as confirmed.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await context.params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const supabase = serviceClient()

  if (body?.reset === true) {
    const { error } = await supabase
      .from("trips")
      .update({
        analysis_window_from: null,
        analysis_window_to: null,
        route_confirmed_at: null,
        route_confirmed_by: null,
      })
      .eq("id", tripId)
    if (error) {
      console.error("[v0] analysis-window reset error:", error)
      return NextResponse.json(
        { error: "Failed to reset window", detail: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, reset: true, confirmed: false })
  }

  const from = typeof body?.from === "string" ? new Date(body.from) : null
  const to = typeof body?.to === "string" ? new Date(body.to) : null
  if (!from || isNaN(from.getTime()) || !to || isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "Both `from` and `to` must be valid ISO timestamps" },
      { status: 400 }
    )
  }
  if (to.getTime() <= from.getTime()) {
    return NextResponse.json(
      { error: "`to` must be after `from`" },
      { status: 400 }
    )
  }

  // Optional GPS-derived distance (km). Persist when sane.
  const distanceKm =
    typeof body?.distance_km === "number" && Number.isFinite(body.distance_km)
      ? Math.max(0, Math.round(body.distance_km * 100) / 100)
      : null

  // Resolve current user (for route_confirmed_by) — best-effort. Use the
  // cookie-based client here; we only need the auth context, not RLS.
  let confirmedBy: string | null = null
  try {
    const cookieClient = await createClient()
    const { data: auth } = await cookieClient.auth.getUser()
    confirmedBy = auth?.user?.id ?? null
  } catch {
    confirmedBy = null
  }

  const nowIso = new Date().toISOString()

  // Read current status so we don't downgrade a finished trip.
  const { data: existing, error: existingErr } = await supabase
    .from("trips")
    .select("id, status")
    .eq("id", tripId)
    .maybeSingle()
  if (existingErr) {
    console.error("[v0] analysis-window load error:", existingErr)
    return NextResponse.json(
      { error: "Failed to load trip", detail: existingErr.message },
      { status: 500 }
    )
  }

  const update: Record<string, unknown> = {
    analysis_window_from: from.toISOString(),
    analysis_window_to: to.toISOString(),
    route_confirmed_at: nowIso,
    route_confirmed_by: confirmedBy,
  }
  if (distanceKm != null) update.distance_km = distanceKm

  // Only promote to "confirmed" when trip is still in a pre-confirmed state.
  const promotable = new Set([null, "draft", "planned", "scheduled"])
  if (promotable.has(existing?.status ?? null)) {
    update.status = "confirmed"
  }

  const { error } = await supabase.from("trips").update(update).eq("id", tripId)
  if (error) {
    console.error("[v0] analysis-window save error:", error)
    return NextResponse.json(
      { error: "Failed to save window", detail: error.message },
      { status: 500 }
    )
  }
  return NextResponse.json({
    ok: true,
    confirmed: true,
    from: from.toISOString(),
    to: to.toISOString(),
    distance_km: distanceKm,
    route_confirmed_at: nowIso,
  })
}
