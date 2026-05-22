"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type TripStatus =
  | "draft"
  | "planned"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "cancelled";

const FLOW: TripStatus[] = ["draft", "planned", "dispatched", "in_progress", "completed"];

const STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  dispatched: "Dispatched",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Tone tokens — kept neutral to match the minimalist top-bar treatment.
const STATUS_TONE: Record<TripStatus, string> = {
  draft: "bg-muted/40 text-muted-foreground ring-border/40",
  planned: "bg-blue-500/10 text-blue-300 ring-blue-500/25",
  dispatched: "bg-purple-500/10 text-purple-300 ring-purple-500/25",
  in_progress: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  completed: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  cancelled: "bg-red-500/10 text-red-300 ring-red-500/25",
};

interface Props {
  tripId: string;
  /** Current trip status. Accepts the raw value used in the trips table. */
  currentStatus: TripStatus;
  /** Called after the server confirms the new status. */
  onStatusChange?: (next: TripStatus) => void;
}

/**
 * Minimalist status chip with a dropdown to advance / revert / cancel.
 * Replaces the previous wide horizontal stepper.
 */
export function TripStatusStepper({ tripId, currentStatus, onStatusChange }: Props) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const currIdx = FLOW.indexOf(currentStatus);

  async function setStatus(next: TripStatus) {
    if (busy || next === currentStatus) return;
    if (next === "completed" || next === "cancelled") {
      const ok = window.confirm(
        next === "completed"
          ? "Mark this trip as Completed? This is irreversible from here."
          : "Cancel this trip?"
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tms/trips/${tripId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to update status");
      }
      onStatusChange?.(next);
      toast({ title: `Status: ${STATUS_LABEL[next]}` });
    } catch (e: any) {
      toast({ title: "Could not change status", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[10px] font-medium ring-1 transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 ${STATUS_TONE[currentStatus]}`}
        >
          {busy ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
          )}
          <span className="tracking-tight">{STATUS_LABEL[currentStatus]}</span>
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {FLOW.map((s, i) => {
          const isCurrent = s === currentStatus;
          // From cancelled, only allow re-opening to draft. Otherwise allow ±1 step from current.
          const reachable =
            currentStatus === "cancelled" ? s === "draft" : Math.abs(i - currIdx) <= 1 || isCurrent;
          return (
            <DropdownMenuItem
              key={s}
              disabled={isCurrent || !reachable}
              onClick={() => setStatus(s)}
              className="text-xs"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full mr-2 ${
                  isCurrent ? "bg-primary" : i < currIdx ? "bg-emerald-500" : "bg-muted-foreground/30"
                }`}
                aria-hidden
              />
              {STATUS_LABEL[s]}
              {isCurrent && (
                <span className="ml-auto text-[9px] text-muted-foreground">current</span>
              )}
            </DropdownMenuItem>
          );
        })}
        {currentStatus !== "completed" && currentStatus !== "cancelled" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setStatus("cancelled")}
              className="text-xs text-red-400 focus:text-red-400"
            >
              <span className="h-1.5 w-1.5 rounded-full mr-2 bg-red-500" aria-hidden />
              Cancel trip
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
