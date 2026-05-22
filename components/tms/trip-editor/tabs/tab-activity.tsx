"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Activity, Receipt, FileText, MessageSquare, MapPin, Clock,
  AlertTriangle, Check, X, GitBranch, RefreshCw,
} from "lucide-react";

interface Event {
  id: string;
  trip_id: string;
  event_type: string;
  severity: string;
  title: string;
  description: string | null;
  metadata: any;
  occurred_at: string;
}

const ICON_MAP: Record<string, any> = {
  status_change: GitBranch,
  stop_arrival: MapPin,
  stop_departure: MapPin,
  gps_deviation: AlertTriangle,
  border_crossed: MapPin,
  geofence_in: MapPin,
  geofence_out: MapPin,
  expense_added: Receipt,
  expense_approved: Check,
  expense_rejected: X,
  document_uploaded: FileText,
  message_posted: MessageSquare,
  assignment_changed: GitBranch,
  route_replanned: GitBranch,
  manual_note: Activity,
};

const SEVERITY_TONE: Record<string, string> = {
  info: "text-muted-foreground bg-muted/30",
  success: "text-emerald-400 bg-emerald-500/10",
  warning: "text-amber-400 bg-amber-500/10",
  error: "text-red-400 bg-red-500/10",
};

interface Props { tripId: string }

export function TabActivity({ tripId }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/tms/trips/${tripId}/events`)
      .then(r => r.json())
      .then(d => { if (alive) { setEvents(d.events ?? []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripId, refreshKey]);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">Activity Timeline</span>
        <span className="text-[10px] text-muted-foreground">all events for this trip</span>
        <button
          type="button"
          onClick={() => setRefreshKey(k => k + 1)}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading events…
        </div>
      ) : events.length === 0 ? (
        <div className="text-[11px] text-muted-foreground p-4 rounded-md bg-muted/20 border border-border/40 text-center">
          No events yet. Activity will appear here as the trip progresses.
        </div>
      ) : (
        <ol className="relative border-l border-border/40 ml-2">
          {events.map(ev => {
            const Icon = ICON_MAP[ev.event_type] || Activity;
            const tone = SEVERITY_TONE[ev.severity] || SEVERITY_TONE.info;
            return (
              <li key={ev.id} className="ml-4 mb-3">
                <span className={`absolute -left-[14px] flex items-center justify-center w-7 h-7 rounded-full ${tone} ring-4 ring-background`}>
                  <Icon className="h-3 w-3" />
                </span>
                <div className="ml-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium">{ev.title}</div>
                    {ev.description && <div className="text-[10px] text-muted-foreground">{ev.description}</div>}
                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(ev.metadata).slice(0, 4).map(([k, v]) => (
                          <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                            {k}: {String(v).slice(0, 24)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap inline-flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(ev.occurred_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
