"use client"

/**
 * Inline editable status chip for a single trip-leg row.
 *
 * Why this exists
 * ----------------
 * A "Mixed" parent order can have several legs of different kinds:
 *
 *   - own_fleet legs   → only the INTERNAL scope makes sense; there's no
 *                        forwarder child behind them.
 *   - forwarding legs  → the carrier is the source of truth, so we expose
 *                        the FORWARDER scope only. The leg's internal
 *                        status is mirrored automatically (same-rank twin).
 *   - undecided legs   → INTERNAL only, until assignment_type is set.
 *
 * Design choices that matter for the UX:
 *
 *  - The chip itself is a Popover trigger. We use a dashed border + a
 *    pencil icon so the affordance is obvious at a glance — earlier
 *    iterations rendered a plain pill which read as a static label.
 *  - The popover lists ALL statuses for the relevant scope (sorted by
 *    rank), with the current value visually pinned and disabled. We
 *    intentionally do NOT restrict to "next legal transitions": dispatch
 *    operators routinely need to roll back ("ops accidentally marked
 *    delivered, set it back to in_progress") and the SQL trigger is the
 *    real guardrail.
 *  - After every write we call `recomputeParentLocally` so the parent
 *    chip updates without waiting for a database round-trip — the SQL
 *    trigger only fires when `execution_trip_id` is wired up, which isn't
 *    always the case for legacy data.
 */

import * as React from "react"
import { Pencil, Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { listScope, type StatusScope } from "@/lib/tms/status/registry"

interface LegStatusChipProps {
  /** "internal" for own-fleet/undecided legs, "forwarder" for subcontracted legs. */
  scope: Extract<StatusScope, "internal" | "forwarder">
  /** Current status value in the chosen scope. */
  value: string
  /** Title shown in the popover header (e.g. "Leg 1" or "VLR-1508"). */
  contextLabel: string
  /** Persist a new status; resolves once the DB write is complete. */
  onChange: (next: string) => Promise<void> | void
  /** Optional. Shows a small label above the chip ("INTERNAL" / "FORWARDER"). */
  showScopeLabel?: boolean
  /** Optional. Override the chip color band. */
  className?: string
  /** Optional. Disable interaction (e.g. while saving). */
  disabled?: boolean
  /**
   * Read-only mode. Renders a static pill instead of a Popover trigger.
   *
   * Why: forwarding (subcontracted) legs are not authoritative — the FWD
   * child order owns the lifecycle. Surfacing the chip as editable here
   * tempts ops to "fix" it from the parent and immediately drift away
   * from the FWD's status. We render the same colored pill so the
   * information is still glanceable, but without the pencil/popover.
   */
  readOnly?: boolean
}

/** Returns the visual band for a chip given an internal-leg status. */
function internalChipClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/20"
    case "documents_received":
    case "documents_pending":
      return "bg-teal-500/10 text-teal-400 border-teal-500/40 hover:bg-teal-500/20"
    case "in_progress":
    case "delivered":
      return "bg-amber-500/10 text-amber-400 border-amber-500/40 hover:bg-amber-500/20"
    case "dispatched_to_driver":
    case "accepted_by_driver":
    case "waiting_to_start":
      return "bg-blue-500/10 text-blue-400 border-blue-500/40 hover:bg-blue-500/20"
    case "cancelled":
    case "on_hold":
      return "bg-rose-500/10 text-rose-400 border-rose-500/40 hover:bg-rose-500/20"
    default:
      return "bg-muted text-muted-foreground border-muted-foreground/30 hover:bg-muted/70"
  }
}

/** Returns the visual band for a chip given a forwarder status. */
function forwarderChipClass(status: string): string {
  if (status === "fwd_completed")
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/20"
  if (status === "fwd_cancelled" || status === "fwd_on_hold")
    return "bg-rose-500/10 text-rose-400 border-rose-500/40 hover:bg-rose-500/20"
  if (status === "fwd_in_progress" || status === "fwd_delivered")
    return "bg-amber-500/10 text-amber-400 border-amber-500/40 hover:bg-amber-500/20"
  // default forwarder palette — indigo, distinct from internal blue
  return "bg-indigo-500/10 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/20"
}

/** Strips the "fwd_" prefix and replaces underscores with spaces for display. */
function humanize(value: string): string {
  return value.replace(/^fwd_/, "").replace(/_/g, " ")
}

export function LegStatusChip({
  scope,
  value,
  contextLabel,
  onChange,
  showScopeLabel = true,
  className,
  disabled,
  readOnly = false,
}: LegStatusChipProps) {
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // All statuses in this scope, sorted by rank — including the current
  // one (which we'll mark as selected) and sideways exits (cancelled,
  // on_hold) so dispatch can hit those in one click.
  const options = React.useMemo(() => listScope(scope), [scope])

  const chipClass =
    scope === "internal" ? internalChipClass(value) : forwarderChipClass(value)

  const scopeLabel = scope === "internal" ? "Internal" : "Forwarder"

  // Read-only branch: subcontracted leg viewed from the parent. Status
  // is owned by the FWD child, so we show a non-interactive pill (same
  // colors, no pencil, no popover).
  if (readOnly) {
    return (
      <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        {showScopeLabel && (
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
            {scopeLabel}
          </span>
        )}
        <span
          className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border capitalize ${chipClass} ${className ?? ""}`}
          title="Status is managed from the forwarding (FWD) order"
          aria-label={`${scopeLabel} status (managed on FWD order)`}
        >
          {humanize(value)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {showScopeLabel && (
        <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {scopeLabel}
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || saving}
            className={`group inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-dashed transition-all hover:border-solid hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${chipClass} ${className ?? ""}`}
            aria-label={`Change ${scopeLabel.toLowerCase()} status`}
            title={`Click to change ${scopeLabel.toLowerCase()} status`}
          >
            <span className="capitalize">{humanize(value)}</span>
            <Pencil className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="px-3 py-2 border-b border-border/40">
            <div className="text-[11px] font-semibold">Change {scopeLabel.toLowerCase()} status</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {scopeLabel} scope · {contextLabel}
            </div>
          </div>
          <div className="p-1 max-h-[320px] overflow-y-auto">
            {options.map((entry) => {
              const isCurrent = entry.value === value
              return (
                <button
                  key={entry.value}
                  type="button"
                  disabled={isCurrent || saving}
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (isCurrent) return
                    setSaving(true)
                    try {
                      await onChange(entry.value)
                      setOpen(false)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] flex items-center justify-between gap-2 ${
                    isCurrent
                      ? "bg-accent/60 text-foreground cursor-default"
                      : "hover:bg-accent text-foreground/90"
                  }`}
                >
                  <span className="flex items-center gap-1.5 capitalize">
                    {isCurrent && <Check className="h-3 w-3 text-emerald-400" />}
                    {humanize(entry.value)}
                  </span>
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    #{entry.rank}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground">
            Parent &amp; linked statuses sync automatically.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
