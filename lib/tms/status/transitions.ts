/**
 * Legal forward + reverse transitions per scope. Used by UI dialogs to
 * decide which actions to expose, and by API routes to validate writes.
 *
 * Sideways (cancel / hold) transitions are allowed from most states
 * and are listed in `SIDEWAYS_FROM_ANY`.
 */

import {
  PARENT_STATUSES,
  INTERNAL_STATUSES,
  FORWARDER_STATUSES,
  type ParentStatus,
  type InternalStatus,
  type ForwarderStatus,
} from "./registry"

// ── Parent transitions ────────────────────────────────────────────────────
export const PARENT_TRANSITIONS: Record<ParentStatus, ParentStatus[]> = {
  draft: ["customer_confirmation_required", "confirmed_to_customer", "cancelled", "on_hold"],
  customer_confirmation_required: ["confirmed_to_customer", "draft", "cancelled", "on_hold"],
  confirmed_to_customer: ["in_execution", "customer_confirmation_required", "cancelled", "on_hold"],
  // in_execution is auto-managed by trigger — no manual forward except cancel/hold.
  in_execution: ["documents_received", "cancelled", "on_hold"],
  documents_received: ["ready_for_invoicing", "in_execution" /* reverse */, "cancelled", "on_hold"],
  ready_for_invoicing: ["documents_and_invoice_sent", "documents_received" /* reverse */, "cancelled", "on_hold"],
  documents_and_invoice_sent: ["completed", "cancelled", "on_hold"],
  completed: [],
  cancelled: [],
  on_hold: ["draft", "confirmed_to_customer", "in_execution", "documents_received", "ready_for_invoicing"],
}

// ── Internal transitions ──────────────────────────────────────────────────
export const INTERNAL_TRANSITIONS: Record<InternalStatus, InternalStatus[]> = {
  unassigned: ["assigned", "planned", "cancelled", "on_hold"],
  assigned: ["planned", "unassigned", "cancelled", "on_hold"],
  planned: ["dispatched_to_driver", "assigned", "cancelled", "on_hold"],
  dispatched_to_driver: ["accepted_by_driver", "planned", "cancelled", "on_hold"],
  accepted_by_driver: ["waiting_to_start", "dispatched_to_driver", "cancelled", "on_hold"],
  waiting_to_start: ["in_progress", "cancelled", "on_hold"],
  in_progress: ["delivered", "cancelled", "on_hold"],
  delivered: ["documents_pending", "in_progress" /* reverse */, "cancelled", "on_hold"],
  documents_pending: ["documents_received", "delivered" /* reverse */, "cancelled", "on_hold"],
  documents_received: ["completed", "documents_pending" /* reverse */, "cancelled", "on_hold"],
  completed: [],
  cancelled: [],
  on_hold: ["unassigned", "assigned", "planned", "in_progress", "delivered"],
}

// ── Forwarder transitions ─────────────────────────────────────────────────
export const FORWARDER_TRANSITIONS: Record<ForwarderStatus, ForwarderStatus[]> = {
  fwd_unassigned: ["fwd_assigned_to_carrier", "fwd_cancelled", "fwd_on_hold"],
  fwd_assigned_to_carrier: ["fwd_carrier_confirmation_required", "fwd_unassigned", "fwd_cancelled", "fwd_on_hold"],
  fwd_carrier_confirmation_required: ["fwd_carrier_confirmed", "fwd_assigned_to_carrier", "fwd_cancelled", "fwd_on_hold"],
  fwd_carrier_confirmed: ["fwd_waiting_to_start", "fwd_carrier_confirmation_required", "fwd_cancelled", "fwd_on_hold"],
  fwd_waiting_to_start: ["fwd_in_progress", "fwd_cancelled", "fwd_on_hold"],
  fwd_in_progress: ["fwd_delivered", "fwd_cancelled", "fwd_on_hold"],
  fwd_delivered: ["fwd_documents_pending", "fwd_in_progress", "fwd_cancelled", "fwd_on_hold"],
  fwd_documents_pending: ["fwd_documents_received", "fwd_delivered", "fwd_cancelled", "fwd_on_hold"],
  fwd_documents_received: ["fwd_carrier_invoice_pending", "fwd_documents_pending", "fwd_cancelled", "fwd_on_hold"],
  fwd_carrier_invoice_pending: ["fwd_carrier_invoice_unpaid", "fwd_documents_received", "fwd_cancelled", "fwd_on_hold"],
  fwd_carrier_invoice_unpaid: ["fwd_completed", "fwd_carrier_invoice_pending", "fwd_cancelled", "fwd_on_hold"],
  fwd_completed: [],
  fwd_cancelled: [],
  fwd_on_hold: ["fwd_unassigned", "fwd_assigned_to_carrier", "fwd_carrier_confirmed", "fwd_in_progress"],
}

export function canTransition(
  scope: "parent" | "internal" | "forwarder",
  from: string,
  to: string,
): boolean {
  const map =
    scope === "parent"
      ? PARENT_TRANSITIONS
      : scope === "internal"
        ? INTERNAL_TRANSITIONS
        : FORWARDER_TRANSITIONS
  const allowed = (map as Record<string, string[]>)[from] ?? []
  return allowed.includes(to)
}

export function nextStatuses(scope: "parent" | "internal" | "forwarder", from: string): string[] {
  const map =
    scope === "parent"
      ? PARENT_TRANSITIONS
      : scope === "internal"
        ? INTERNAL_TRANSITIONS
        : FORWARDER_TRANSITIONS
  return (map as Record<string, string[]>)[from] ?? []
}
