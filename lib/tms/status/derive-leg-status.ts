/**
 * Derive the correct internal leg status from its assignment shape.
 *
 * The v3 unified state machine (see scripts/110_status_v3_unified.sql and
 * lib/tms/status/registry.ts) orders the early execution-band statuses as:
 *
 *   rank 4  unassigned         no driver / vehicle / carrier picked
 *   rank 5  assigned           at least one resource picked
 *   rank 6  planned            all expected resources locked in
 *   rank 7+ dispatched/...     operator-driven progressions (we never auto-set these)
 *
 * Earlier code blindly inserted every freshly-created leg with status
 * "planned", which made the leg chip read "Planned" even when the leg had
 * no driver/vehicle/carrier whatsoever — visually misleading and it also
 * prevented the parent's `deriveParentStatus` from seeing the difference
 * between "ready to roll" and "still needs ops attention".
 *
 * The rules below are intentionally conservative. We **never** auto-promote
 * a leg to "planned" — that rank means "ops has reviewed and locked this
 * leg in" and must be a deliberate operator click on the chip. Saving
 * resources in the assignment dialog only proves the leg has resources,
 * not that anyone has signed off on them, so the highest auto-derived
 * value is "assigned":
 *
 *  - own_fleet: "assigned" once any of driver / vehicle / trailer is
 *    set; otherwise "unassigned".
 *  - forwarding: "assigned" once a carrier is picked; otherwise
 *    "unassigned".
 *  - undecided: always "unassigned" — the assignment_type itself
 *    signals the leg is operationally pending.
 *
 * Returns one of "unassigned" | "assigned" | "planned". Never returns
 * dispatched/in_progress/etc — those are forward operator actions, not
 * derivations from resource fullness, and surface only when the operator
 * explicitly clicks the chip / "Dispatch to driver" / etc.
 */
export type AssignmentShape = {
  assignment_type: "own_fleet" | "forwarding" | "undecided" | null | undefined
  driver_id?: string | null
  vehicle_id?: string | null
  trailer_id?: string | null
  carrier_id?: string | null
}

export type DerivedLegStatus = "unassigned" | "assigned" | "planned"

export function deriveLegStatus(shape: AssignmentShape): DerivedLegStatus {
  const { assignment_type, driver_id, vehicle_id, trailer_id, carrier_id } = shape

  if (assignment_type === "own_fleet") {
    if (driver_id || vehicle_id || trailer_id) return "assigned"
    return "unassigned"
  }

  if (assignment_type === "forwarding") {
    return carrier_id ? "assigned" : "unassigned"
  }

  // undecided / null / unknown
  return "unassigned"
}

/**
 * Decide whether we are allowed to overwrite the leg's existing status with
 * a freshly derived one. We only auto-roll between the three "resource
 * fullness" buckets (rank ≤ 6). Anything past rank 6 (dispatched, in
 * progress, delivered, docs, etc.) reflects an operator action and must
 * never be silently rolled back by a resource edit.
 */
const ROLLABLE_STATUSES = new Set([
  "unassigned",
  "assigned",
  "planned",
  // Treat null/undefined like "fresh" — caller decides what to do.
])

export function canAutoRollLegStatus(currentStatus: string | null | undefined): boolean {
  if (!currentStatus) return true
  return ROLLABLE_STATUSES.has(currentStatus)
}
