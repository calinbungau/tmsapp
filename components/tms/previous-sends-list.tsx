"use client";

// Renders the per-order "Previously sent to carrier" history inside the
// Send-to-Carrier dialog. Each entry displays:
//   - timestamp + dispatcher (if known)
//   - language / recipient list / subject
//   - a collapsible diff showing which order fields have changed
//     between that send and the *current* order data.
//
// We diff against an in-memory snapshot rather than re-fetching the
// order so the comparison is consistent with what the operator sees
// in the live preview pane.

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { buildEmailAuthHeaders } from "@/lib/client-email-headers";

type Snapshot = {
  order?: Record<string, any>;
  stops?: Array<Record<string, any>>;
};

type SendEntry = {
  id: string;
  created_at: string;
  details: {
    carrier_name?: string;
    carrier_emails?: string[];
    carrier_email?: string;
    recipient_count?: number;
    language?: string;
    subject?: string;
    message?: string | null;
    sent_at?: string;
    order_snapshot?: Snapshot;
    pdf_storage_path?: string;
    pdf_filename?: string;
  } | null;
  performed_by_id?: string | null;
};

interface PreviousSendsListProps {
  orderId: string;
  // Current snapshot — same shape as what the API stores. Built by the
  // dialog from `orderData` so the diff stays in sync with the preview.
  currentSnapshot: Snapshot;
  // Increment to force a refetch (e.g. after a fresh send completes).
  refreshKey?: number;
  // Required so the per-entry "Download" button can authorize itself
  // against the /api/orders/[orderId]/sent-pdf/[logId] endpoint.
  adminId?: string | null;
}

// Human-readable labels for the snapshot fields. Anything not listed
// here is omitted from the diff so we don't show changes for fields
// the operator doesn't care about (e.g. internal IDs).
const ORDER_FIELD_LABELS: Record<string, string> = {
  customer_price: "Customer Price",
  customer_currency: "Customer Currency",
  carrier_cost: "Carrier Cost",
  carrier_currency: "Carrier Currency",
  weight_kg: "Weight (kg)",
  pallet_count: "Pallets",
  volume_m3: "Volume (m³)",
  loading_meters: "LDM",
  cargo_description: "Cargo",
  goods_type: "Goods Type",
  adr_class: "ADR Class",
  special_instructions: "Special Instructions",
  temperature_min: "Temp. Min",
  temperature_max: "Temp. Max",
  estimated_distance_km: "Distance (km)",
  estimated_duration_hours: "Duration (h)",
};

const STOP_FIELD_LABELS: Record<string, string> = {
  company_name: "Company",
  address: "Address",
  city: "City",
  country: "Country",
  postal_code: "Postal Code",
  planned_date: "Date",
  planned_time_from: "From",
  planned_time_to: "To",
  reference_number: "Reference",
};

function fmtVal(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function diffOrder(prev?: Record<string, any>, curr?: Record<string, any>) {
  const out: Array<{ field: string; label: string; from: any; to: any }> = [];
  if (!prev || !curr) return out;
  for (const key of Object.keys(ORDER_FIELD_LABELS)) {
    const p = prev[key];
    const c = curr[key];
    // Compare loosely so 100 === "100" doesn't register as a change.
    if (fmtVal(p) !== fmtVal(c)) {
      out.push({ field: key, label: ORDER_FIELD_LABELS[key], from: p, to: c });
    }
  }
  return out;
}

function diffStops(prev?: any[], curr?: any[]) {
  const changes: string[] = [];
  const prevStops = prev || [];
  const currStops = curr || [];
  if (prevStops.length !== currStops.length) {
    changes.push(
      `Number of stops changed: ${prevStops.length} → ${currStops.length}`,
    );
  }
  const len = Math.max(prevStops.length, currStops.length);
  for (let i = 0; i < len; i++) {
    const p = prevStops[i];
    const c = currStops[i];
    if (!p || !c) continue;
    for (const key of Object.keys(STOP_FIELD_LABELS)) {
      if (fmtVal(p[key]) !== fmtVal(c[key])) {
        changes.push(
          `Stop #${i + 1} ${STOP_FIELD_LABELS[key]}: "${fmtVal(p[key])}" → "${fmtVal(c[key])}"`,
        );
      }
    }
  }
  return changes;
}

export function PreviousSendsList({ orderId, currentSnapshot, refreshKey = 0, adminId }: PreviousSendsListProps) {
  const [entries, setEntries] = useState<SendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Per-entry download state so the spinner only shows on the row the
  // user clicked.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (entry: SendEntry) => {
    if (!entry.id) return;
    setDownloadingId(entry.id);
    try {
      const headers: Record<string, string> = adminId
        ? buildEmailAuthHeaders(adminId)
        : {};
      const res = await fetch(
        `/api/orders/${orderId}/sent-pdf/${entry.id}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok || !data?.url) {
        alert(data?.error || "Could not load archived PDF");
        return;
      }
      // Trigger a download. We rely on the signed URL having a
      // download disposition + filename hint set server-side.
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename || "order.pdf";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      alert(e?.message || "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("order_activity_log")
        .select("id, created_at, details, performed_by_id")
        .eq("order_id", orderId)
        .eq("action", "order_sent_to_carrier")
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setEntries((data as any) || []);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshKey]);

  if (loading) {
    return (
      <div className="text-[10px] text-muted-foreground px-1">Loading send history…</div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground px-1">
        No previous sends recorded for this order.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => {
        const d = entry.details || ({} as SendEntry["details"]);
        const recipients = d?.carrier_emails && d.carrier_emails.length
          ? d.carrier_emails
          : (d?.carrier_email ? [d.carrier_email] : []);
        const sentAt = new Date(d?.sent_at || entry.created_at);
        const orderChanges = diffOrder(d?.order_snapshot?.order, currentSnapshot.order);
        const stopChanges = diffStops(d?.order_snapshot?.stops, currentSnapshot.stops);
        const totalChanges = orderChanges.length + stopChanges.length;
        const isExpanded = expandedId === entry.id;
        // Most recent send is shown expanded so dispatchers immediately
        // see what's changed since they last sent it.
        const showByDefault = idx === 0;
        const open = isExpanded || (expandedId === null && showByDefault);

        return (
          <div
            key={entry.id}
            className="rounded-md border border-border/50 bg-card/30 text-[10px] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpandedId(open ? "" : entry.id)}
              className="w-full flex items-start gap-2 p-2 hover:bg-card/60 transition-colors text-left"
            >
              {open ? (
                <ChevronDown className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <History className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold">
                    {sentAt.toLocaleDateString()} {sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {idx === 0 && (
                    <span className="px-1 py-px rounded bg-primary/15 text-primary border border-primary/30 text-[9px] uppercase tracking-wider">
                      Latest
                    </span>
                  )}
                  {totalChanges > 0 && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-amber-500">
                      <AlertTriangle className="h-3 w-3" />
                      {totalChanges} change{totalChanges === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate">
                  {recipients.length > 0
                    ? `To: ${recipients.join(", ")}`
                    : "(no recipients recorded)"}
                </div>
                {d?.language && (
                  <div className="text-muted-foreground">
                    Language: {String(d.language).toUpperCase()}
                    {d?.subject ? ` · ${d.subject}` : ""}
                  </div>
                )}
              </div>
            </button>

            {open && (
              <div className="px-2 pb-2 pt-0 border-t border-border/30 space-y-1.5">
                {/* Re-download the exact PDF that was attached to the
                    email on this date. We surface the button when an
                    archived path exists; older log rows from before
                    archival was enabled simply won't show it. */}
                {d?.pdf_storage_path && (
                  <div className="pt-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1.5"
                      disabled={downloadingId === entry.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(entry);
                      }}
                    >
                      {downloadingId === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      Download sent PDF
                    </Button>
                  </div>
                )}
                {totalChanges === 0 ? (
                  <div className="text-[10px] text-emerald-500 pt-1.5">
                    Order is unchanged since this send.
                  </div>
                ) : (
                  <>
                    {orderChanges.length > 0 && (
                      <div className="pt-1.5">
                        <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[9px] mb-0.5">
                          Order field changes
                        </div>
                        <div className="space-y-0.5">
                          {orderChanges.map((c) => (
                            <div key={c.field} className="leading-tight">
                              <span className="text-muted-foreground">{c.label}:</span>{" "}
                              <span className="text-red-400 line-through">{fmtVal(c.from)}</span>
                              <span className="text-muted-foreground"> → </span>
                              <span className="text-emerald-400">{fmtVal(c.to)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {stopChanges.length > 0 && (
                      <div className="pt-1.5">
                        <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[9px] mb-0.5">
                          Stop changes
                        </div>
                        <div className="space-y-0.5">
                          {stopChanges.map((line, i) => (
                            <div key={i} className="leading-tight text-muted-foreground">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
