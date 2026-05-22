"use client"

import { cn } from "@/lib/utils"
import { getStatusEntry, type StatusScope } from "@/lib/tms/status/registry"

interface OrderStatusBadgeProps {
  status: string | null | undefined
  scope?: StatusScope
  /** Optional secondary chip text shown after the pill (e.g. "2 legs · in transit") */
  chip?: string | null
  /** Compact mode: smaller pill, no description */
  size?: "sm" | "md"
  className?: string
  /** Show colored dot before the label */
  showDot?: boolean
}

/**
 * Unified status pill driven by the v3 status registry. Use this everywhere
 * an order, leg, or subcontract status is rendered — never inline.
 */
export function OrderStatusBadge({
  status,
  scope,
  chip,
  size = "md",
  className,
  showDot = true,
}: OrderStatusBadgeProps) {
  const entry = getStatusEntry(status, scope)

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-medium",
          size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
          entry.pillClass,
        )}
        title={entry.description}
      >
        {showDot && (
          <span
            aria-hidden
            className={cn(
              "rounded-full",
              size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
              entry.dotClass,
            )}
          />
        )}
        <span className="leading-none">{entry.label}</span>
        {entry.isAuto && (
          <span
            aria-label="Automatic transition"
            className="ml-0.5 text-[9px] uppercase tracking-wide opacity-60"
          >
            auto
          </span>
        )}
      </span>
      {chip && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {chip}
        </span>
      )}
    </span>
  )
}
