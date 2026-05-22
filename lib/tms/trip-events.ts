import type { SupabaseClient } from "@supabase/supabase-js";

export type TripEventType =
  | "status_change"
  | "stop_arrival"
  | "stop_departure"
  | "gps_deviation"
  | "border_crossed"
  | "geofence_in"
  | "geofence_out"
  | "expense_added"
  | "expense_approved"
  | "expense_rejected"
  | "document_uploaded"
  | "message_posted"
  | "assignment_changed"
  | "route_replanned"
  | "manual_note";

export type TripEventSeverity = "info" | "success" | "warning" | "error";
export type TripEventActorType = "admin" | "driver" | "system" | "carrier";

export interface LogTripEventArgs {
  tripId: string;
  eventType: TripEventType;
  title: string;
  description?: string;
  severity?: TripEventSeverity;
  actorType?: TripEventActorType;
  actorId?: string | null;
  legId?: string | null;
  stopId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only writer for trip_events. Never throws — failure is logged but
 * never breaks the user-facing operation that triggered the event.
 */
export async function logTripEvent(
  supabase: SupabaseClient,
  args: LogTripEventArgs
): Promise<void> {
  try {
    await supabase.from("trip_events").insert({
      trip_id: args.tripId,
      event_type: args.eventType,
      severity: args.severity ?? "info",
      title: args.title,
      description: args.description ?? null,
      actor_type: args.actorType ?? "admin",
      actor_id: args.actorId ?? null,
      leg_id: args.legId ?? null,
      stop_id: args.stopId ?? null,
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    console.log("[v0] logTripEvent failed", err);
  }
}
