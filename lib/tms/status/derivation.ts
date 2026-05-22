/**
 * Parent-status derivation — pure function used by the optimistic UI.
 * MUST mirror `fn_recompute_parent_status` in
 * `scripts/110_status_v3_unified.sql`.
 */

import { getRank, getStatusEntry, type ParentStatus } from "./registry"

export type ChildKind = "internal" | "forwarder"

export interface ChildSnapshot {
  kind: ChildKind
  status: string
  /** True if this child has any meaningful resource picked (driver/truck/carrier).
   *  Used for the "Confirmed" → "In Execution" transition gate. */
  hasResources?: boolean
}

export interface DerivedParent {
  /** Computed parent status (auto bands only — does not overwrite manual yellow rows). */
  status: ParentStatus | null
  /** Mode chip the UI should render next to the pill. */
  mode: "internal" | "subcontract" | "mixed" | "none"
  /** Secondary chip describing operational spread. */
  chip: string | null
  /** True when at least one child is on_hold or cancelled. */
  hasSideways: boolean
}

/**
 * Returns the parent status the trigger SHOULD set, given current children.
 *
 * Important:
 *  - Returns `null` if the parent is in commercial pre-execution (no
 *    children) or already past the convergence row (rows 14–16, manual).
 *    Caller must NOT overwrite the parent in those cases.
 */
export function deriveParentStatus(
  currentParentStatus: string,
  children: ChildSnapshot[],
): DerivedParent {
  // Normalize legacy parent statuses so older rows still progress through
  // the v3 unified state machine. The DB constraint accepts only the new
  // names for new writes, but rows created before scripts/110_status_v3_*
  // can still carry "confirmed" / "dispatched" — we treat them as their
  // v3 equivalents for derivation purposes only (we never write the
  // legacy value back).
  const LEGACY_PARENT_ALIASES: Record<string, string> = {
    confirmed: "confirmed_to_customer",
    dispatched: "in_execution",
    accepted: "in_execution",
    in_transit: "in_execution",
    delivered: "in_execution",
  }
  const normalizedParent = LEGACY_PARENT_ALIASES[currentParentStatus] ?? currentParentStatus

  // Pre-execution rows are commercial — leave the parent alone.
  const currentRank = getRank(normalizedParent)
  if (currentRank <= 3) {
    // Auto-promote to in_execution only when at least one child has crossed
    // rank 4 (resources picked) AND parent is past confirmed.
    if (normalizedParent === "confirmed_to_customer" && children.length > 0) {
      // fall through to the active calc below
    } else {
      return { status: null, mode: deriveMode(children), chip: null, hasSideways: false }
    }
  }

  // Manual closeout rows — never overwrite.
  if (
    normalizedParent === "ready_for_invoicing" ||
    normalizedParent === "documents_and_invoice_sent" ||
    normalizedParent === "completed" ||
    normalizedParent === "cancelled"
  ) {
    return { status: null, mode: deriveMode(children), chip: null, hasSideways: false }
  }

  if (children.length === 0) {
    return { status: null, mode: "none", chip: null, hasSideways: false }
  }

  // Partition active vs sideways children.
  const active: ChildSnapshot[] = []
  let cancelledCount = 0
  let onHoldCount = 0
  for (const c of children) {
    const r = getRank(c.status)
    if (r === 99) {
      if (c.status.includes("cancel")) cancelledCount++
      else onHoldCount++
      continue
    }
    active.push(c)
  }

  const hasSideways = cancelledCount > 0 || onHoldCount > 0
  const mode = deriveMode(children)

  // If every child was cancelled, leave the parent decision to the dispatcher.
  if (active.length === 0) {
    return {
      status: null,
      mode,
      chip: cancelledCount > 0 ? `${cancelledCount} cancelled` : `${onHoldCount} on hold`,
      hasSideways: true,
    }
  }

  const ranks = active.map((c) => getRank(c.status))
  const minRank = Math.min(...ranks)

  // Convergence — all children at rank 13 (or higher, e.g. fwd carrier-invoice
  // post-flow). Means parent should auto-advance to documents_received.
  if (minRank >= 13) {
    // Only auto-promote if the parent isn't already past 13.
    if (currentRank < 13) {
      return {
        status: "documents_received",
        mode,
        chip: buildChip(active, cancelledCount, onHoldCount, "docs"),
        hasSideways,
      }
    }
    return {
      status: null, // parent already past — don't touch
      mode,
      chip: buildChip(active, cancelledCount, onHoldCount, "docs"),
      hasSideways,
    }
  }

  // Otherwise parent is operationally in execution.
  return {
    status: "in_execution",
    mode,
    chip: buildChip(active, cancelledCount, onHoldCount, "exec"),
    hasSideways,
  }
}

function deriveMode(children: ChildSnapshot[]): DerivedParent["mode"] {
  if (children.length === 0) return "none"
  const hasInternal = children.some((c) => c.kind === "internal")
  const hasFwd = children.some((c) => c.kind === "forwarder")
  if (hasInternal && hasFwd) return "mixed"
  if (hasFwd) return "subcontract"
  return "internal"
}

function buildChip(
  active: ChildSnapshot[],
  cancelledCount: number,
  onHoldCount: number,
  phase: "exec" | "docs",
): string {
  // Bucket counts for display.
  let unassigned = 0
  let planning = 0 // ranks 5–7
  let inTransit = 0 // ranks 8–10
  let delivered = 0 // rank 11
  let docsPending = 0 // rank 12
  let docsReceived = 0 // rank 13+

  for (const c of active) {
    const r = getRank(c.status)
    if (r === 4) unassigned++
    else if (r >= 5 && r <= 7) planning++
    else if (r >= 8 && r <= 10) inTransit++
    else if (r === 11) delivered++
    else if (r === 12) docsPending++
    else if (r >= 13) docsReceived++
  }

  const parts: string[] = []
  const total = active.length

  if (phase === "docs") {
    parts.push(`${docsReceived}/${total} docs received`)
  } else {
    if (unassigned) parts.push(`${unassigned} unassigned`)
    if (planning) parts.push(`${planning} planning`)
    if (inTransit) parts.push(`${inTransit} in transit`)
    if (delivered) parts.push(`${delivered} delivered`)
    if (docsPending) parts.push(`${docsPending} awaiting docs`)
    if (docsReceived) parts.push(`${docsReceived} docs in`)
  }

  if (cancelledCount) parts.push(`${cancelledCount} cancelled`)
  if (onHoldCount) parts.push(`${onHoldCount} on hold`)

  return parts.join(" · ")
}

/** Friendly mode-chip label for the UI. */
export function modeLabel(mode: DerivedParent["mode"]): string | null {
  switch (mode) {
    case "internal":
      return "Internal"
    case "subcontract":
      return "Subcontract"
    case "mixed":
      return "Mixed"
    default:
      return null
  }
}

/** Resolve a status entry given a scope hint — convenience re-export. */
export { getStatusEntry }
