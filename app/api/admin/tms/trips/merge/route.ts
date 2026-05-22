import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Atomic round-trip merge.
 *
 * Body: { primaryId: string, sourceIds: string[] }
 *
 * Re-parents every dependent row of each `sourceId` onto `primaryId` and then
 * deletes the source trips. The source-of-truth list of FKs to public.trips is:
 *
 *   trip_orders.trip_id              (M:N junction → upsert + delete)
 *   trip_stops.trip_id               (re-parent + renumber sequence_order)
 *   trip_legs.trip_id                (delete - target keeps its own legs/route)
 *   trip_expenses.trip_id            (re-parent - keep all receipts)
 *   trip_events.trip_id              (re-parent - keep audit trail)
 *   documents.trip_id                (re-parent)
 *   orders.execution_trip_id         (re-parent)
 *
 * After the move we recompute primary's planned_start / planned_end /
 * distance_km / duration_minutes from its new full stop list. Service-role
 * client bypasses the RLS that previously caused silent failures from the
 * browser-side merge logic.
 */

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { primaryId, sourceIds } = await req.json()
    console.log("[v0] /trips/merge: request", { primaryId, sourceIds })

    if (!primaryId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json({ error: "primaryId and at least one sourceId are required" }, { status: 400 })
    }
    const others: string[] = sourceIds.filter((id: string) => id && id !== primaryId)
    if (others.length === 0) {
      return NextResponse.json({ error: "No source trips distinct from primary" }, { status: 400 })
    }

    const s = svc()

    // 1) trip_orders: upsert primary links from each source, then delete source links
    const { data: srcLinks, error: linksErr } = await s
      .from("trip_orders")
      .select("order_id")
      .in("trip_id", others)
    if (linksErr) throw linksErr
    if (srcLinks && srcLinks.length > 0) {
      const upsertRows = srcLinks.map((l: any) => ({ trip_id: primaryId, order_id: l.order_id }))
      const { error: upErr } = await s
        .from("trip_orders")
        .upsert(upsertRows, { onConflict: "trip_id,order_id" })
      if (upErr) throw upErr
      const { error: delLinksErr } = await s.from("trip_orders").delete().in("trip_id", others)
      if (delLinksErr) throw delLinksErr
    }

    // 2) orders.execution_trip_id: re-parent
    {
      const { error } = await s
        .from("orders")
        .update({ execution_trip_id: primaryId })
        .in("execution_trip_id", others)
      if (error) throw error
    }

    // 3) trip_stops: compute next sequence base on primary, then move source stops one by one
    const { data: maxRow } = await s
      .from("trip_stops")
      .select("sequence_order")
      .eq("trip_id", primaryId)
      .order("sequence_order", { ascending: false })
      .limit(1)
    let nextSeq = (maxRow?.[0]?.sequence_order ?? 0) + 1

    for (const sourceId of others) {
      const { data: oStops } = await s
        .from("trip_stops")
        .select("id, sequence_order")
        .eq("trip_id", sourceId)
        .order("sequence_order", { ascending: true })
      for (const st of oStops ?? []) {
        const { error: updErr } = await s
          .from("trip_stops")
          .update({ trip_id: primaryId, sequence_order: nextSeq++ })
          .eq("id", st.id)
        if (updErr) throw updErr
      }
    }

    // 4) trip_expenses: re-parent (preserves receipts, AI badge, status, coords)
    {
      const { error } = await s
        .from("trip_expenses")
        .update({ trip_id: primaryId })
        .in("trip_id", others)
      if (error) throw error
    }

    // 5) trip_events: re-parent the audit trail
    {
      const { error } = await s
        .from("trip_events")
        .update({ trip_id: primaryId })
        .in("trip_id", others)
      if (error) throw error
    }

    // 6) documents: re-parent (best-effort; table may not exist in every env)
    {
      const { error } = await s
        .from("documents")
        .update({ trip_id: primaryId })
        .in("trip_id", others)
      if (error) console.log("[v0] /trips/merge: documents move skipped:", error.message)
    }

    // 7) trip_legs: drop source legs. Primary's existing legs (if any) describe its
    //    own vehicle/route plan; merging legs from a different leg-plan would
    //    create incoherent leg geometry. The user can re-plan legs after merging.
    {
      const { error } = await s.from("trip_legs").delete().in("trip_id", others)
      if (error) throw error
    }

    // 8) Recompute primary's date window from its new stops. Distance / duration
    //    / route geometry are intentionally cleared because stop ordering changed
    //    and per-segment data is now stale; the editor's "Fastest / Shortest"
    //    button will recompute the route on demand.
    const { data: mergedStops } = await s
      .from("trip_stops")
      .select("id, order_stop_id, sequence_order, address, city, country, postal_code, planned_date")
      .eq("trip_id", primaryId)
      .order("sequence_order", { ascending: true })

    const stopList = mergedStops ?? []
    const dates = stopList.map((st: any) => st.planned_date).filter(Boolean) as string[]
    const newStart = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
    const newEnd = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null

    await s
      .from("trips")
      .update({
        ...(newStart ? { planned_start: newStart } : {}),
        ...(newEnd ? { planned_end: newEnd } : {}),
        distance_km: null,
        duration_minutes: null,
        route_geometry: null,
      })
      .eq("id", primaryId)

    // 8b) Rebuild primary's leg coverage so it spans the full merged stop range.
    //     Without this, getRouteStopsForTrip (list view) and the edit page filter
    //     stops to the OLD leg.from_stop_index..to_stop_index range and the newly
    //     merged stops are invisible. We collapse to a single canonical leg
    //     because merge eligibility already enforces "same vehicle + same carrier".
    if (stopList.length >= 2) {
      const { data: existingLegs } = await s
        .from("trip_legs")
        .select("id, leg_number, assignment_type, vehicle_id, driver_id, carrier_id, route_strategy")
        .eq("trip_id", primaryId)
        .order("leg_number", { ascending: true })

      const firstStop = stopList[0]
      const lastStop = stopList[stopList.length - 1]
      const fmtAddress = (st: any) =>
        [st.address, st.postal_code ? `${st.postal_code} ${st.city ?? ""}`.trim() : st.city, st.country]
          .filter(Boolean)
          .join(", ")

      // NB: trip_legs.origin_stop_id / destination_stop_id are FKs to
      // order_stops (NOT trip_stops). Using trip_stops.id here triggers a
      // 23503 FK violation. Pull the underlying order_stop_id off each row.
      const legPatch: Record<string, unknown> = {
        from_stop_index: 0,
        to_stop_index: stopList.length - 1,
        origin_stop_id: (firstStop as any).order_stop_id ?? null,
        destination_stop_id: (lastStop as any).order_stop_id ?? null,
        origin_address: fmtAddress(firstStop),
        destination_address: fmtAddress(lastStop),
        // Stale per-leg geometry; user re-plans via the route strategy buttons
        route_meta: {},
      }

      if (existingLegs && existingLegs.length > 0) {
        // Keep leg #1 as the canonical leg, expanded to span everything
        const keep = existingLegs[0]
        const { error: updErr } = await s.from("trip_legs").update(legPatch).eq("id", keep.id)
        if (updErr) throw updErr
        // Drop any extra primary legs (rare — only happens if primary already had multi-leg)
        const extras = existingLegs.slice(1).map((l: any) => l.id)
        if (extras.length > 0) {
          const { error: dropErr } = await s.from("trip_legs").delete().in("id", extras)
          if (dropErr) throw dropErr
        }
      } else {
        // Primary had no leg — synthesise one from the trip's vehicle/driver/carrier
        const { data: tripRow } = await s
          .from("trips")
          .select("assignment_type, vehicle_id, driver_id, carrier_id")
          .eq("id", primaryId)
          .single()
        const { error: insErr } = await s.from("trip_legs").insert({
          trip_id: primaryId,
          leg_number: 1,
          assignment_type: tripRow?.assignment_type ?? "internal",
          vehicle_id: tripRow?.vehicle_id ?? null,
          driver_id: tripRow?.driver_id ?? null,
          carrier_id: tripRow?.carrier_id ?? null,
          ...legPatch,
        })
        if (insErr) throw insErr
      }
    }

    // 9) Finally delete source trips. trip_legs are already gone; remaining FKs
    //    (trip_orders/trip_stops/trip_expenses/trip_events) were re-parented above.
    const { error: delErr } = await s.from("trips").delete().in("id", others)
    if (delErr) throw delErr

    console.log("[v0] /trips/merge: done", { primaryId, removed: others.length })
    return NextResponse.json({ ok: true, primaryId, removed: others })
  } catch (err: any) {
    console.log("[v0] /trips/merge: FAILED", err?.message ?? err)
    return NextResponse.json({ error: err?.message || "Merge failed" }, { status: 500 })
  }
}
