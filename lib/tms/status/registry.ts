/**
 * TMS Status Registry — single source of truth for all order, leg, and
 * subcontract statuses.
 *
 * Three lifecycles, one rank scale (so parent status can be derived from
 * children deterministically):
 *
 *   Parent     (rows 1–16)  — orders.status where parent_order_id IS NULL
 *   Internal   (rows 4–15)  — trip_legs.status (own-fleet legs)
 *   Forwarder  (rows 4–15)  — orders.status where parent_order_id IS NOT NULL
 *
 * Convergence row: 13 (Documents Received) — where the parent auto-advances.
 *
 * IMPORTANT: this file is paired with the SQL function
 * `fn_recompute_parent_status` and the CHECK constraints in
 * `scripts/110_status_v3_unified.sql`. If you change ranks here, change them
 * in the SQL too — they MUST stay in sync. The Jest fixture in
 * `__tests__/status-derivation.fixtures.ts` exercises both implementations.
 */

export type StatusScope = "parent" | "internal" | "forwarder"

export type ParentStatus =
  | "draft"
  | "customer_confirmation_required"
  | "confirmed_to_customer"
  | "in_execution"
  | "documents_received"
  | "ready_for_invoicing"
  | "documents_and_invoice_sent"
  | "completed"
  | "cancelled"
  | "on_hold"

export type InternalStatus =
  | "unassigned"
  | "assigned"
  | "planned"
  | "dispatched_to_driver"
  | "accepted_by_driver"
  | "waiting_to_start"
  | "in_progress"
  | "delivered"
  | "documents_pending"
  | "documents_received"
  | "completed"
  | "cancelled"
  | "on_hold"

export type ForwarderStatus =
  | "fwd_unassigned"
  | "fwd_assigned_to_carrier"
  | "fwd_carrier_confirmation_required"
  | "fwd_carrier_confirmed"
  | "fwd_waiting_to_start"
  | "fwd_in_progress"
  | "fwd_delivered"
  | "fwd_documents_pending"
  | "fwd_documents_received"
  | "fwd_carrier_invoice_pending"
  | "fwd_carrier_invoice_unpaid"
  | "fwd_completed"
  | "fwd_cancelled"
  | "fwd_on_hold"

export type AnyStatus = ParentStatus | InternalStatus | ForwarderStatus

/**
 * Color band assigned to each row in the spec table. Drives the visual
 * grouping in the UI so a user immediately recognizes "pre-execution",
 * "in execution", "convergence", "post-execution", or "sideways".
 */
export type StatusBand = "commercial" | "execution" | "convergence" | "closeout" | "sideways"

export interface StatusEntry {
  /** DB enum value */
  value: string
  /** Short UI label (max ~20 chars) */
  label: string
  /** Long-form description for tooltips */
  description: string
  /** Lifecycle scope */
  scope: StatusScope
  /** Numeric rank for cross-scope comparison (1–16). Sideways = 99. */
  rank: number
  /** Color band for the visual grouping */
  band: StatusBand
  /** Tailwind classes for the pill background + border */
  pillClass: string
  /** Tailwind classes for the dot indicator */
  dotClass: string
  /** Whether the parent reaches this state automatically (via trigger) */
  isAuto?: boolean
  /** Whether terminal in its scope (no further forward transitions) */
  isTerminal?: boolean
}

// ── Parent ────────────────────────────────────────────────────────────────
export const PARENT_STATUSES: Record<ParentStatus, StatusEntry> = {
  draft: {
    value: "draft",
    label: "Draft",
    description: "Newly created order — not yet sent for confirmation.",
    scope: "parent",
    rank: 1,
    band: "commercial",
    pillClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    dotClass: "bg-zinc-400",
  },
  customer_confirmation_required: {
    value: "customer_confirmation_required",
    label: "Customer Confirm. Req.",
    description: "Sent to customer; awaiting their confirmation.",
    scope: "parent",
    rank: 2,
    band: "commercial",
    pillClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    dotClass: "bg-orange-400",
  },
  confirmed_to_customer: {
    value: "confirmed_to_customer",
    label: "Confirmed",
    description: "Customer has confirmed; ready to plan execution.",
    scope: "parent",
    rank: 3,
    band: "commercial",
    pillClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dotClass: "bg-blue-400",
  },
  in_execution: {
    value: "in_execution",
    label: "In Execution",
    description:
      "At least one leg or subcontract is in motion. Detail visible on children.",
    scope: "parent",
    rank: 4, // umbrella — covers ranks 4..12 of children
    band: "execution",
    pillClass: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    dotClass: "bg-violet-400",
    isAuto: true,
  },
  documents_received: {
    value: "documents_received",
    label: "Documents Received",
    description:
      "All children have delivered POD/CMR. Ready for office to validate.",
    scope: "parent",
    rank: 13,
    band: "convergence",
    pillClass: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    dotClass: "bg-teal-400",
    isAuto: true,
  },
  ready_for_invoicing: {
    value: "ready_for_invoicing",
    label: "Ready for Invoicing",
    description:
      "Documents have been validated by back-office; invoice may be issued.",
    scope: "parent",
    rank: 14,
    band: "closeout",
    pillClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-400",
  },
  documents_and_invoice_sent: {
    value: "documents_and_invoice_sent",
    label: "Docs & Invoice Sent",
    description: "Invoice and supporting documents have been sent to customer.",
    scope: "parent",
    rank: 15,
    band: "closeout",
    pillClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    dotClass: "bg-yellow-400",
  },
  completed: {
    value: "completed",
    label: "Completed",
    description: "Customer paid + all children completed.",
    scope: "parent",
    rank: 16,
    band: "closeout",
    pillClass: "bg-green-500/10 text-green-400 border-green-500/20",
    dotClass: "bg-green-400",
    isTerminal: true,
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    description: "Order cancelled.",
    scope: "parent",
    rank: 99,
    band: "sideways",
    pillClass: "bg-red-500/10 text-red-400 border-red-500/20",
    dotClass: "bg-red-400",
    isTerminal: true,
  },
  on_hold: {
    value: "on_hold",
    label: "On Hold",
    description: "Order paused. Resume to continue.",
    scope: "parent",
    rank: 99,
    band: "sideways",
    pillClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    dotClass: "bg-slate-400",
  },
}

// ── Internal (own-fleet legs) ─────────────────────────────────────────────
export const INTERNAL_STATUSES: Record<InternalStatus, StatusEntry> = {
  unassigned: {
    value: "unassigned",
    label: "Unassigned",
    description: "Leg created — no driver, truck, or trailer assigned yet.",
    scope: "internal",
    rank: 4,
    band: "execution",
    pillClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    dotClass: "bg-zinc-400",
  },
  assigned: {
    value: "assigned",
    label: "Assigned",
    description: "At least one resource (driver/truck/trailer) picked.",
    scope: "internal",
    rank: 5,
    band: "execution",
    pillClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    dotClass: "bg-indigo-400",
  },
  planned: {
    value: "planned",
    label: "Planned",
    description: "All resources locked, leg is scheduled.",
    scope: "internal",
    rank: 6,
    band: "execution",
    pillClass: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    dotClass: "bg-violet-400",
  },
  dispatched_to_driver: {
    value: "dispatched_to_driver",
    label: "Dispatched",
    description: "Sent to driver app.",
    scope: "internal",
    rank: 7,
    band: "execution",
    pillClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    dotClass: "bg-sky-400",
  },
  accepted_by_driver: {
    value: "accepted_by_driver",
    label: "Accepted",
    description: "Driver acknowledged in app.",
    scope: "internal",
    rank: 8,
    band: "execution",
    pillClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    dotClass: "bg-cyan-400",
  },
  waiting_to_start: {
    value: "waiting_to_start",
    label: "Waiting to Start",
    description: "Awaiting departure window.",
    scope: "internal",
    rank: 9,
    band: "execution",
    pillClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dotClass: "bg-blue-400",
  },
  in_progress: {
    value: "in_progress",
    label: "In Progress",
    description: "Truck on the move.",
    scope: "internal",
    rank: 10,
    band: "execution",
    pillClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-400",
  },
  delivered: {
    value: "delivered",
    label: "Delivered",
    description: "Goods delivered at destination.",
    scope: "internal",
    rank: 11,
    band: "execution",
    pillClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dotClass: "bg-emerald-400",
  },
  documents_pending: {
    value: "documents_pending",
    label: "Docs Pending",
    description: "Awaiting POD/CMR from driver.",
    scope: "internal",
    rank: 12,
    band: "execution",
    pillClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    dotClass: "bg-orange-400",
  },
  documents_received: {
    value: "documents_received",
    label: "Docs Received",
    description: "POD/CMR received. Leg's contribution to parent is closed.",
    scope: "internal",
    rank: 13,
    band: "convergence",
    pillClass: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    dotClass: "bg-teal-400",
  },
  completed: {
    value: "completed",
    label: "Completed",
    description: "Leg fully closed.",
    scope: "internal",
    rank: 16,
    band: "closeout",
    pillClass: "bg-green-500/10 text-green-400 border-green-500/20",
    dotClass: "bg-green-400",
    isTerminal: true,
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    description: "Leg cancelled.",
    scope: "internal",
    rank: 99,
    band: "sideways",
    pillClass: "bg-red-500/10 text-red-400 border-red-500/20",
    dotClass: "bg-red-400",
    isTerminal: true,
  },
  on_hold: {
    value: "on_hold",
    label: "On Hold",
    description: "Leg paused.",
    scope: "internal",
    rank: 99,
    band: "sideways",
    pillClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    dotClass: "bg-slate-400",
  },
}

// ── Forwarder (subcontract) ───────────────────────────────────────────────
export const FORWARDER_STATUSES: Record<ForwarderStatus, StatusEntry> = {
  fwd_unassigned: {
    value: "fwd_unassigned",
    label: "Carrier Unassigned",
    description: "Subcontract created — no carrier picked yet.",
    scope: "forwarder",
    rank: 4,
    band: "execution",
    pillClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    dotClass: "bg-zinc-400",
  },
  fwd_assigned_to_carrier: {
    value: "fwd_assigned_to_carrier",
    label: "Assigned to Carrier",
    description: "Carrier chosen, awaiting send.",
    scope: "forwarder",
    rank: 5,
    band: "execution",
    pillClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    dotClass: "bg-indigo-400",
  },
  fwd_carrier_confirmation_required: {
    value: "fwd_carrier_confirmation_required",
    label: "Carrier Confirm. Req.",
    description: "Sent to carrier; awaiting confirmation.",
    scope: "forwarder",
    rank: 6,
    band: "execution",
    pillClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    dotClass: "bg-cyan-400",
  },
  fwd_carrier_confirmed: {
    value: "fwd_carrier_confirmed",
    label: "Carrier Confirmed",
    description: "Carrier acknowledged.",
    scope: "forwarder",
    rank: 7,
    band: "execution",
    pillClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    dotClass: "bg-sky-400",
  },
  fwd_waiting_to_start: {
    value: "fwd_waiting_to_start",
    label: "Waiting to Start",
    description: "Awaiting departure window.",
    scope: "forwarder",
    rank: 9,
    band: "execution",
    pillClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dotClass: "bg-blue-400",
  },
  fwd_in_progress: {
    value: "fwd_in_progress",
    label: "In Progress",
    description: "Carrier executing the move.",
    scope: "forwarder",
    rank: 10,
    band: "execution",
    pillClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-400",
  },
  fwd_delivered: {
    value: "fwd_delivered",
    label: "Delivered",
    description: "Carrier reports delivery.",
    scope: "forwarder",
    rank: 11,
    band: "execution",
    pillClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dotClass: "bg-emerald-400",
  },
  fwd_documents_pending: {
    value: "fwd_documents_pending",
    label: "Docs Pending",
    description: "Awaiting POD/CMR from carrier.",
    scope: "forwarder",
    rank: 12,
    band: "execution",
    pillClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    dotClass: "bg-orange-400",
  },
  fwd_documents_received: {
    value: "fwd_documents_received",
    label: "Docs Received",
    description: "POD/CMR received from carrier.",
    scope: "forwarder",
    rank: 13,
    band: "convergence",
    pillClass: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    dotClass: "bg-teal-400",
  },
  fwd_carrier_invoice_pending: {
    value: "fwd_carrier_invoice_pending",
    label: "Carrier Invoice Pending",
    description: "Awaiting carrier invoice.",
    scope: "forwarder",
    rank: 14,
    band: "closeout",
    pillClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-400",
  },
  fwd_carrier_invoice_unpaid: {
    value: "fwd_carrier_invoice_unpaid",
    label: "Carrier Invoice Unpaid",
    description: "Carrier invoice received, payment due.",
    scope: "forwarder",
    rank: 15,
    band: "closeout",
    pillClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    dotClass: "bg-yellow-400",
  },
  fwd_completed: {
    value: "fwd_completed",
    label: "Completed",
    description: "Subcontract fully closed.",
    scope: "forwarder",
    rank: 16,
    band: "closeout",
    pillClass: "bg-green-500/10 text-green-400 border-green-500/20",
    dotClass: "bg-green-400",
    isTerminal: true,
  },
  fwd_cancelled: {
    value: "fwd_cancelled",
    label: "Cancelled",
    description: "Subcontract cancelled.",
    scope: "forwarder",
    rank: 99,
    band: "sideways",
    pillClass: "bg-red-500/10 text-red-400 border-red-500/20",
    dotClass: "bg-red-400",
    isTerminal: true,
  },
  fwd_on_hold: {
    value: "fwd_on_hold",
    label: "On Hold",
    description: "Subcontract paused.",
    scope: "forwarder",
    rank: 99,
    band: "sideways",
    pillClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    dotClass: "bg-slate-400",
  },
}

// ── Legacy alias map (back-compat for rows still on old enum values) ─────
// Keeps old data renderable while the migration backfills. ALWAYS look up
// statuses through getStatus() / getStatusEntry() so legacy rows resolve.
const LEGACY_ALIASES: Record<string, string> = {
  // Parent legacy
  confirmed: "confirmed_to_customer",
  dispatched: "in_execution",
  accepted: "in_execution",
  in_transit: "in_execution",
  delivered: "in_execution", // parent-level "delivered" was operational, becomes umbrella
  pod_received: "documents_received",
  invoiced: "documents_and_invoice_sent",
  // Forwarder legacy
  fwd_draft: "fwd_unassigned",
  fwd_client_confirmation_required: "fwd_unassigned", // commercial gate moved up to parent
  fwd_client_confirmed: "fwd_unassigned",
  fwd_assigned: "fwd_assigned_to_carrier",
  fwd_planned: "fwd_carrier_confirmed",
  fwd_in_transit: "fwd_in_progress",
}

const ALL: Record<string, StatusEntry> = {
  ...PARENT_STATUSES,
  ...INTERNAL_STATUSES,
  ...FORWARDER_STATUSES,
}

/**
 * Resolves any status string (current or legacy) to its canonical entry.
 * Returns a generic fallback for unknown values so the UI never crashes.
 */
export function getStatusEntry(value: string | null | undefined, scopeHint?: StatusScope): StatusEntry {
  if (!value) return FALLBACK
  // Direct hit
  if (ALL[value]) return ALL[value]
  // Legacy alias
  const aliased = LEGACY_ALIASES[value]
  if (aliased && ALL[aliased]) return ALL[aliased]
  // Scope-aware fallback so a legacy value still renders sensibly
  if (scopeHint === "forwarder") return FORWARDER_STATUSES.fwd_unassigned
  if (scopeHint === "internal") return INTERNAL_STATUSES.unassigned
  return FALLBACK
}

const FALLBACK: StatusEntry = {
  value: "unknown",
  label: "Unknown",
  description: "Unrecognised status",
  scope: "parent",
  rank: 0,
  band: "commercial",
  pillClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  dotClass: "bg-zinc-400",
}

/** Convenience accessors */
export function getRank(value: string | null | undefined): number {
  return getStatusEntry(value).rank
}
export function getLabel(value: string | null | undefined): string {
  return getStatusEntry(value).label
}

/** All statuses for a given scope, sorted by rank ascending. */
export function listScope(scope: StatusScope): StatusEntry[] {
  const map =
    scope === "parent"
      ? PARENT_STATUSES
      : scope === "internal"
        ? INTERNAL_STATUSES
        : FORWARDER_STATUSES
  return Object.values(map).sort((a, b) => a.rank - b.rank)
}

/** Active (non-sideways, non-completed) statuses for "active" KPI cards. */
export function isActiveStatus(value: string | null | undefined): boolean {
  const r = getRank(value)
  return r >= 1 && r < 16
}

/** Whether this status is one of the convergence terminals (rank 13). */
export function isAtConvergence(value: string | null | undefined): boolean {
  return getRank(value) === 13
}

/**
 * Maps a forwarder status to its same-rank internal-leg counterpart, so
 * when the user (or carrier) flips the FWD order to e.g. "Carrier
 * Confirmed", the linked subcontracted `trip_legs.status` advances in
 * lockstep ("planned" → "dispatched_to_driver", because both sit at
 * rank 7). Returns null when the forwarder rank has no internal twin
 * (e.g. ranks 14/15 which are forwarder-only invoice gates) — in those
 * cases the leg should keep its prior status.
 *
 * NOTE: this is the JS twin of the SQL trigger in
 * scripts/110_status_v3_unified.sql. Keep in sync.
 */
export function forwarderToInternal(fwdStatus: string | null | undefined): InternalStatus | null {
  const entry = getStatusEntry(fwdStatus, "forwarder")
  if (entry.scope !== "forwarder") return null
  // Sideways: mirror directly.
  if (entry.rank === 99) {
    if (entry.value === "fwd_cancelled") return "cancelled"
    if (entry.value === "fwd_on_hold") return "on_hold"
    return null
  }
  // Find the internal status with the same rank.
  const twin = Object.values(INTERNAL_STATUSES).find(s => s.rank === entry.rank)
  return (twin?.value as InternalStatus) ?? null
}
