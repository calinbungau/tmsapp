/**
 * Client-side parent status recomputation.
 *
 * The SQL trigger `fn_recompute_parent_status` (scripts/110_status_v3_unified.sql)
 * is the source of truth, but it relies on `orders.execution_trip_id`
 * being wired up to find the parent's trip_legs. For legacy or partially
 * imported orders this column can be null, which means a leg status
 * change won't bubble up to the parent.
 *
 * To keep the UX honest (the user expects "set leg to delivered" → parent
 * advances to "documents_received" immediately), we mirror the SQL logic
 * here using the existing `deriveParentStatus` pure function and write
 * the result back from the client. This is safe to run alongside the
 * trigger: both compute the same value, so the second write is a no-op.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { deriveParentStatus, type ChildSnapshot } from "./derivation"

/**
 * Recompute and persist the parent's status given the latest snapshot
 * of its children. Returns the new status if it changed, or null.
 *
 * @param supabase   the project's supabase client (browser or server)
 * @param parentId   the orders.id of the parent (must be a parent row)
 * @param tripId     optional execution_trip_id; when provided we also
 *                   pull trip_legs as internal children. When the parent
 *                   has multiple trips, the caller should aggregate
 *                   beforehand and call this once.
 */
export async function recomputeParentStatus(
  supabase: SupabaseClient,
  parentId: string,
  tripId?: string | null,
): Promise<string | null> {
  // 1. Read the parent's current status.
  const { data: parent, error: parentErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", parentId)
    .single()
  if (parentErr || !parent) return null

  // 2. Pull subcontract children (forwarder kind).
  const { data: fwdChildren } = await supabase
    .from("orders")
    .select("status")
    .eq("parent_order_id", parentId)
  const children: ChildSnapshot[] = (fwdChildren || [])
    .filter((c: any) => !!c.status)
    .map((c: any) => ({ kind: "forwarder", status: c.status }))

  // 3. Pull trip legs (internal kind). Trips ↔ orders is a many-to-many
  // via the `trip_orders` junction, NOT a direct FK on `trips.order_id`.
  // We resolve trip ids through the junction unless the caller already
  // passed an explicit one.
  let tripIds: string[] = []
  if (tripId) {
    tripIds = [tripId]
  } else {
    const { data: links } = await supabase
      .from("trip_orders")
      .select("trip_id")
      .eq("order_id", parentId)
    tripIds = (links || []).map((r: any) => r.trip_id).filter(Boolean)
  }

  if (tripIds.length > 0) {
    const { data: legs } = await supabase
      .from("trip_legs")
      .select("status")
      .in("trip_id", tripIds)
    ;(legs || [])
      .filter((l: any) => !!l.status)
      .forEach((l: any) => children.push({ kind: "internal", status: l.status }))
  }

  // 4. Run the derivation and persist if it changed.
  const derived = deriveParentStatus(parent.status, children)
  if (!derived.status || derived.status === parent.status) return null

  const { error: updErr } = await supabase
    .from("orders")
    .update({ status: derived.status })
    .eq("id", parentId)
  if (updErr) {
    console.error("[v0] recomputeParentStatus update failed", updErr)
    return null
  }
  return derived.status
}
