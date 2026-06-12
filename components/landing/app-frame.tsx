"use client"

import { Lock } from "lucide-react"
import type { ReactNode } from "react"

/**
 * AppFrame
 *
 * A faux desktop-app window used to present in-product mockups on the landing
 * page. It renders a macOS-style title bar, an optional address/label, a subtle
 * diagonal "CONFIDENTIAL" watermark and a glow. Sensitive cells inside the
 * children can be hidden with the <Redacted /> helper below so we showcase the
 * UI without exposing real customer data.
 */
export function AppFrame({
  label,
  confidentialNote,
  children,
}: {
  label: string
  confidentialNote: string
  children: ReactNode
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl ring-1 ring-black/5">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-destructive/70" />
            <span className="h-3 w-3 rounded-full bg-primary/80" />
            <span className="h-3 w-3 rounded-full bg-chart-3/70" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-md border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            <span>{label}</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary sm:inline-flex">
            {confidentialNote}
          </span>
        </div>

        {/* Watermarked content */}
        <div className="relative">
          <WatermarkLayer />
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </div>
  )
}

function WatermarkLayer() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-14 overflow-hidden opacity-[0.05]"
    >
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="-rotate-[24deg] whitespace-nowrap text-base font-extrabold uppercase tracking-[0.3em] text-foreground"
        >
          BNG Tracking · Confidential
        </span>
      ))}
    </div>
  )
}

/**
 * Redacted
 *
 * Wraps a piece of demo content (a name, an address, a license plate...) and
 * renders it blurred + non-selectable so the layout reads as real product data
 * without disclosing anything legible.
 */
export function Redacted({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`pointer-events-none select-none blur-[5px] saturate-50 ${className}`}
      aria-hidden
    >
      {children}
    </span>
  )
}
