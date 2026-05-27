"use client";

/**
 * Share Tracking Link dialog
 * ──────────────────────────
 * Opens from the parent order header. Lets the operator:
 *   1. Pick a GPS source (vehicle / trailer / driver) from the assets
 *      attached to this order or its subcontract children.
 *   2. Set an expiry date for the public link.
 *   3. Toggle what the customer sees (status, stops, ETA).
 *   4. Optionally email the link to a recipient straight away.
 *
 * The dialog also lists existing shares for this order — each row
 * exposes copy / extend / revoke / resend, so the operator never has
 * to leave the dialog to manage them. Extending the expiry is the
 * primary "edit" path (per the user request: "we should setup an
 * end date of the link share, this could be modified").
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Truck, User, Link2, Copy, Check, X, Mail, RefreshCw,
  AlertCircle, ExternalLink, MapPin, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildEmailAuthHeaders } from "@/lib/client-email-headers";

interface ResourceOption {
  id: string;
  label: string;
  sub: string | null;
  has_gps: boolean;
  last_seen_at?: string | null;
  // True when this asset is referenced by the order or one of its
  // subcontract children (directly or via a trip_leg). Used to group
  // the dropdown into "On this order" vs "Other assets".
  in_order: boolean;
}

interface ShareRow {
  id: string;
  token: string;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  gps_source: "vehicle" | "trailer" | "driver";
  vehicle_id: string | null;
  trailer_id: string | null;
  driver_id: string | null;
  show_status: boolean;
  show_stops: boolean;
  show_eta: boolean;
  recipient_email: string | null;
  last_sent_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  adminId: string;
  customerEmailOnFile?: string | null;
  orderReference?: string | null;
}

// Helper: today's date, formatted for <input type="date"> — used as
// the default Start date so the link is active immediately.
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Helper: default expiry = 14 days from now, formatted for <input type="date">
function defaultExpiryDate(): string {
  const d = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ShareTrackingLinkDialog({
  open,
  onOpenChange,
  orderId,
  adminId,
  customerEmailOnFile,
  orderReference,
}: DialogProps) {
  const { toast } = useToast();

  // ── Data loaded from the API ──
  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [resources, setResources] = useState<{
    vehicles: ResourceOption[];
    trailers: ResourceOption[];
    drivers: ResourceOption[];
  }>({ vehicles: [], trailers: [], drivers: [] });

  // ── New share form state ──
  const [gpsSource, setGpsSource] = useState<"vehicle" | "trailer" | "driver">("vehicle");
  const [resourceId, setResourceId] = useState<string>("");
  // Start date defaults to today (link is active immediately). The
  // operator can push it into the future for advance-share scenarios
  // — the public page will then render the "available from …" state
  // until the chosen day.
  const [startDate, setStartDate] = useState<string>(todayDate());
  const [expiryDate, setExpiryDate] = useState<string>(defaultExpiryDate());
  const [showStatus, setShowStatus] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [showEta, setShowEta] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState<string>(customerEmailOnFile || "");
  const [customMessage, setCustomMessage] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Selection feedback — once a share is created we show the URL inline
  // so the operator can copy it without scrolling to the history list.
  const [justCreatedUrl, setJustCreatedUrl] = useState<string | null>(null);

  // Per-row UI state for the history list (which row is being acted on,
  // which one was just copied so we can flash the check icon).
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // ── Loader ──
  const load = useCallback(async () => {
    if (!open || !orderId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/tracking-shares`, {
        headers: buildEmailAuthHeaders(adminId),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load shares");
      setShares(json.shares || []);
      setResources(json.resources || { vehicles: [], trailers: [], drivers: [] });

      // Auto-select a default GPS resource: prefer vehicles, then
      // trailers, then drivers. Only consider GPS-capable ones — no
      // point letting the operator pick something with no signal.
      const firstGpsVehicle = (json.resources?.vehicles || []).find((v: ResourceOption) => v.has_gps);
      const firstGpsTrailer = (json.resources?.trailers || []).find((t: ResourceOption) => t.has_gps);
      const firstGpsDriver = (json.resources?.drivers || []).find((d: ResourceOption) => d.has_gps);
      if (firstGpsVehicle) {
        setGpsSource("vehicle"); setResourceId(firstGpsVehicle.id);
      } else if (firstGpsTrailer) {
        setGpsSource("trailer"); setResourceId(firstGpsTrailer.id);
      } else if (firstGpsDriver) {
        setGpsSource("driver"); setResourceId(firstGpsDriver.id);
      }
    } catch (err: any) {
      toast({ title: "Failed to load", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [open, orderId, adminId, toast]);

  useEffect(() => { load(); }, [load]);

  // Reset transient state when the dialog closes so the next open
  // starts fresh (we keep `shares` cached so reopen is instant).
  useEffect(() => {
    if (!open) {
      setJustCreatedUrl(null);
      setCustomMessage("");
    }
  }, [open]);

  // Keep the resource dropdown's value in sync when gpsSource changes
  // — falls back to the first option of the newly-selected category.
  useEffect(() => {
    const list = resources[`${gpsSource}s` as keyof typeof resources];
    if (!list?.find((r) => r.id === resourceId)) {
      const firstGps = list?.find((r) => r.has_gps);
      setResourceId(firstGps?.id || list?.[0]?.id || "");
    }
  }, [gpsSource]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentResources = useMemo<ResourceOption[]>(() => {
    return resources[`${gpsSource}s` as keyof typeof resources] || [];
  }, [resources, gpsSource]);

  // Split the dropdown list into the two groups so the JSX can render
  // section headers cleanly. Done as memos so we don't allocate fresh
  // arrays on every keystroke or hover.
  const onOrderResources = useMemo(
    () => currentResources.filter((r) => r.in_order),
    [currentResources]
  );
  const otherResources = useMemo(
    () => currentResources.filter((r) => !r.in_order),
    [currentResources]
  );

  const selectedResource = currentResources.find((r) => r.id === resourceId);

  // ── Create new share ──
  const handleCreate = async () => {
    if (!resourceId) {
      toast({ title: "Pick a GPS source", variant: "destructive" });
      return;
    }
    if (!expiryDate) {
      toast({ title: "Set an end date", variant: "destructive" });
      return;
    }
    if (startDate && expiryDate && startDate > expiryDate) {
      toast({
        title: "Date range is invalid",
        description: "Start date must be on or before the end date.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      // Build the validity window in local time:
      //   start = start-of-day, expiry = end-of-day, so the chosen
      //   dates are inclusive (a 1-day window of today→today gives
      //   the customer the whole calendar day to view the link).
      const startsAtIso = startDate
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : new Date().toISOString();
      const expiresAtIso = new Date(`${expiryDate}T23:59:59`).toISOString();

      const body: Record<string, any> = {
        gps_source: gpsSource,
        starts_at: startsAtIso,
        expires_at: expiresAtIso,
        show_status: showStatus,
        show_stops: showStops,
        show_eta: showEta,
        recipient_email: recipientEmail.trim() || undefined,
        custom_message: customMessage.trim() || undefined,
        base_url: window.location.origin,
      };
      if (gpsSource === "vehicle") body.vehicle_id = resourceId;
      if (gpsSource === "trailer") body.trailer_id = resourceId;
      if (gpsSource === "driver") body.driver_id = resourceId;

      const res = await fetch(`/api/orders/${orderId}/tracking-shares`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildEmailAuthHeaders(adminId),
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create share");

      setJustCreatedUrl(json.public_url);
      setShares((prev) => [json.share, ...prev]);

      // If the email failed but the share itself was created, tell
      // the operator so they can resend or copy the URL manually.
      if (json.email_error) {
        toast({
          title: "Link created — email failed",
          description: json.email_error,
          variant: "destructive",
        });
      } else if (recipientEmail.trim()) {
        toast({
          title: "Link emailed",
          description: `Sent to ${recipientEmail.trim()}`,
        });
      } else {
        toast({ title: "Tracking link created", description: "Copy the URL to share it." });
      }
    } catch (err: any) {
      toast({ title: "Could not create link", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ── Per-row actions ──
  const patchShare = async (shareId: string, body: Record<string, any>) => {
    setBusyRowId(shareId);
    try {
      const res = await fetch(`/api/orders/${orderId}/tracking-shares`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildEmailAuthHeaders(adminId),
        },
        body: JSON.stringify({ share_id: shareId, base_url: window.location.origin, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setShares((prev) => prev.map((s) => (s.id === shareId ? json.share : s)));
      if (json.email_error) {
        toast({ title: "Email failed", description: json.email_error, variant: "destructive" });
      }
      return json;
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setBusyRowId(null);
    }
  };

  const copyUrl = async (token: string, rowId: string) => {
    try {
      const url = `${window.location.origin}/track/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedTokenId(rowId);
      setTimeout(() => setCopiedTokenId(null), 1500);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const extendExpiry = (share: ShareRow) => {
    // Naive but useful: bump expiry to 14 days from now. The operator
    // can override later by editing the date inline — see below.
    const newIso = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    patchShare(share.id, { expires_at: newIso });
  };

  const updateExpiry = (share: ShareRow, dateStr: string) => {
    const iso = new Date(`${dateStr}T23:59:59`).toISOString();
    patchShare(share.id, { expires_at: iso });
  };

  const updateStart = (share: ShareRow, dateStr: string) => {
    // Start-of-day so the chosen calendar date is inclusive on the
    // public side — this matches how `updateExpiry` uses end-of-day.
    const iso = new Date(`${dateStr}T00:00:00`).toISOString();
    patchShare(share.id, { starts_at: iso });
  };

  const revoke = (share: ShareRow) => {
    patchShare(share.id, { revoked_at: new Date().toISOString() });
  };

  const resend = async (share: ShareRow) => {
    const to = share.recipient_email || customerEmailOnFile;
    if (!to) {
      toast({
        title: "No recipient on file",
        description: "Add an email to the original send, then resend.",
        variant: "destructive",
      });
      return;
    }
    await patchShare(share.id, { resend: true, recipient_email: to });
  };

  // ── Derived: is the chosen resource lacking GPS? show a helper warning ──
  const noGpsWarning = selectedResource && !selectedResource.has_gps;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-sky-600" />
            Share live tracking
            {orderReference && (
              <span className="text-muted-foreground font-normal text-sm">
                · {orderReference}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Generate a secure public link the customer can open to see the
            live GPS location of this shipment, with optional status and
            stop information.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Step 1: GPS source ────────────────────────────────��── */}
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> GPS source
                </h3>
                <RadioGroup
                  value={gpsSource}
                  onValueChange={(v) => setGpsSource(v as any)}
                  className="grid grid-cols-3 gap-2 mb-3"
                >
                  {(
                    [
                      {
                        value: "vehicle",
                        label: "Vehicle",
                        icon: Truck,
                        all: resources.vehicles,
                      },
                      {
                        value: "trailer",
                        label: "Trailer",
                        icon: Truck,
                        all: resources.trailers,
                      },
                      {
                        value: "driver",
                        label: "Driver",
                        icon: User,
                        all: resources.drivers,
                      },
                    ] as const
                  ).map(({ value, label, icon: Icon, all }) => {
                    const onOrderCount = all.filter((r: ResourceOption) => r.in_order).length;
                    const totalCount = all.length;
                    return (
                      <label
                        key={value}
                        htmlFor={`gps-${value}`}
                        className={`flex flex-col items-center gap-1 p-3 rounded-md border cursor-pointer text-xs transition-colors ${
                          gpsSource === value
                            ? "bg-sky-50 border-sky-300 text-sky-900"
                            : "border-input hover:bg-muted"
                        } ${totalCount === 0 ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <RadioGroupItem id={`gps-${value}`} value={value} className="sr-only" />
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{label}</span>
                        {/* Counts: highlight the on-order subset because
                            that's the operator's most likely pick, and
                            show the master-data total in parens for
                            context ("3 on order · 28 total"). */}
                        <span className="text-[10px] text-muted-foreground">
                          {onOrderCount > 0 ? (
                            <>
                              <span className="text-sky-700 font-medium">{onOrderCount} on order</span>
                              {totalCount > onOrderCount && (
                                <span> · {totalCount} total</span>
                              )}
                            </>
                          ) : (
                            <>{totalCount} available</>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>

                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a resource" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {currentResources.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No GPS-equipped {gpsSource}s in master data
                      </div>
                    ) : (
                      <>
                        {/* On-order group ───────────────────────────────
                            Rendered first because in 95% of cases the
                            operator wants the asset that's already
                            assigned to the order. Heading is only shown
                            when there's also an "Other" group below,
                            otherwise it adds noise. */}
                        {onOrderResources.length > 0 && (
                          <>
                            {otherResources.length > 0 && (
                              <div className="px-2 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                                On this order
                              </div>
                            )}
                            {onOrderResources.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                <span className="flex items-center gap-2">
                                  <span>{r.label}</span>
                                  {r.sub && (
                                    <span className="text-muted-foreground text-xs">· {r.sub}</span>
                                  )}
                                  <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-[10px] py-0 px-1.5">
                                    On order
                                  </Badge>
                                  {!r.has_gps && (
                                    <Badge variant="outline" className="text-[10px] py-0">
                                      No GPS
                                    </Badge>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </>
                        )}

                        {/* Other-assets group ──────────────────────────
                            Every other GPS-equipped asset in the
                            admin's master data. Lets the operator pick
                            something not formally on the order yet
                            (last-minute swap, owner-driver subbed in,
                            etc.). */}
                        {otherResources.length > 0 && (
                          <>
                            {onOrderResources.length > 0 && (
                              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground border-t border-border/40 mt-1">
                                Other assets
                              </div>
                            )}
                            {otherResources.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                <span className="flex items-center gap-2">
                                  <span>{r.label}</span>
                                  {r.sub && (
                                    <span className="text-muted-foreground text-xs">· {r.sub}</span>
                                  )}
                                  {!r.has_gps && (
                                    <Badge variant="outline" className="text-[10px] py-0">
                                      No GPS
                                    </Badge>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>

                {noGpsWarning && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      This {gpsSource} has no GPS device configured. The link
                      will work but the customer will see &quot;no live position&quot;
                      until tracking is set up.
                    </span>
                  </div>
                )}
              </section>

              <Separator />

              {/* ── Step 2: Validity window & display options ────────────
                  We expose both Start and End dates so the operator can
                  share the link in advance (e.g. day before pickup) but
                  only allow viewing once transport actually starts. The
                  End date stays the primary control — Start defaults to
                  today and most users won't change it. */}
              <section className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" /> Link valid window
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="start-date" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Start date
                      </Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        max={expiryDate || undefined}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="expiry" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        End date
                      </Label>
                      <Input
                        id="expiry"
                        type="date"
                        value={expiryDate}
                        min={startDate || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Default: starts today, ends in 14 days. Both dates are inclusive — you can change them later from the history below.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold mb-2 block">
                    What the customer sees
                  </Label>
                  <div className="flex items-center justify-between text-sm">
                    <span>Order status</span>
                    <Switch checked={showStatus} onCheckedChange={setShowStatus} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Stops list</span>
                    <Switch checked={showStops} onCheckedChange={setShowStops} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>ETA (when available)</span>
                    <Switch checked={showEta} onCheckedChange={setShowEta} />
                  </div>
                </div>
              </section>

              <Separator />

              {/* ── Step 3: Optional email ─────────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Send by email <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </h3>
                <Input
                  type="email"
                  placeholder="recipient@example.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="mb-2"
                />
                <textarea
                  placeholder="Optional message to include in the email"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={2}
                  className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Leave the email blank to just generate a link you can copy and paste.
                </p>
              </section>

              {/* ── Just-created banner ─────────────────────────────────── */}
              {justCreatedUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center gap-3">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <Input
                    readOnly
                    value={justCreatedUrl}
                    className="flex-1 bg-white text-xs font-mono"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(justCreatedUrl);
                      toast({ title: "Copied!" });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              )}

              {/* ── Existing shares history ─────────────────────────────── */}
              {shares.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold mb-3">
                      Existing links ({shares.length})
                    </h3>
                    <div className="space-y-2">
                      {shares.map((share) => (
                        <ShareHistoryRow
                          key={share.id}
                          share={share}
                          busy={busyRowId === share.id}
                          copied={copiedTokenId === share.id}
                          onCopy={() => copyUrl(share.token, share.id)}
                          onExtend={() => extendExpiry(share)}
                          onSetStart={(d) => updateStart(share, d)}
                          onSetExpiry={(d) => updateExpiry(share, d)}
                          onRevoke={() => revoke(share)}
                          onResend={() => resend(share)}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleCreate} disabled={creating || loading || !resourceId}>
            {creating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            {recipientEmail.trim() ? "Create & email link" : "Create link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// History row sub-component
// ────��────────────────────────────────────────────────────────────────────
function ShareHistoryRow({
  share,
  busy,
  copied,
  onCopy,
  onExtend,
  onSetStart,
  onSetExpiry,
  onRevoke,
  onResend,
}: {
  share: ShareRow;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onExtend: () => void;
  onSetStart: (d: string) => void;
  onSetExpiry: (d: string) => void;
  onRevoke: () => void;
  onResend: () => void;
}) {
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const now = Date.now();
  const expired = new Date(share.expires_at).getTime() < now;
  const revoked = !!share.revoked_at;
  // A share with a future starts_at is "Pending" rather than "Active".
  const notYetActive = share.starts_at && new Date(share.starts_at).getTime() > now;
  const active = !expired && !revoked && !notYetActive;

  const statusBadge = revoked ? (
    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Revoked</Badge>
  ) : expired ? (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Expired</Badge>
  ) : notYetActive ? (
    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">Pending</Badge>
  ) : (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
  );

  return (
    <div className="border rounded-md p-3 bg-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {statusBadge}
            <Badge variant="outline" className="text-[10px] capitalize">
              {share.gps_source}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {fmtDate(share.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <span>
              Starts:{" "}
              {editingStart ? (
                <Input
                  type="date"
                  defaultValue={share.starts_at.slice(0, 10)}
                  max={share.expires_at.slice(0, 10)}
                  className="h-7 inline-block w-36 text-xs"
                  autoFocus
                  onBlur={(e) => {
                    setEditingStart(false);
                    if (e.target.value && e.target.value !== share.starts_at.slice(0, 10)) {
                      onSetStart(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingStart(false);
                  }}
                />
              ) : (
                <button
                  className="underline decoration-dotted hover:text-foreground"
                  onClick={() => setEditingStart(true)}
                  disabled={busy}
                >
                  {fmtDate(share.starts_at)}
                </button>
              )}
            </span>
            <span className="text-muted-foreground/60">→</span>
            <span>
              Ends:{" "}
              {editingExpiry ? (
                <Input
                  type="date"
                  defaultValue={share.expires_at.slice(0, 10)}
                  min={share.starts_at.slice(0, 10) || new Date().toISOString().slice(0, 10)}
                  className="h-7 inline-block w-36 text-xs"
                  autoFocus
                  onBlur={(e) => {
                    setEditingExpiry(false);
                    if (e.target.value && e.target.value !== share.expires_at.slice(0, 10)) {
                      onSetExpiry(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingExpiry(false);
                  }}
                />
              ) : (
                <button
                  className="underline decoration-dotted hover:text-foreground"
                  onClick={() => setEditingExpiry(true)}
                  disabled={busy}
                >
                  {fmtDate(share.expires_at)}
                </button>
              )}
            </span>
            {share.view_count > 0 && (
              <span className="text-emerald-600">
                · Viewed {share.view_count}× ({fmtDate(share.last_viewed_at)})
              </span>
            )}
          </div>
          {share.recipient_email && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Sent to {share.recipient_email}
              {share.last_sent_at ? ` on ${fmtDate(share.last_sent_at)}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onCopy}
          disabled={!active}
        >
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copied" : "Copy URL"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => window.open(`/track/${share.token}`, "_blank")}
          disabled={!active}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> Open
        </Button>
        {active && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onExtend}
            disabled={busy}
          >
            <Clock className="h-3 w-3 mr-1" /> Extend 14d
          </Button>
        )}
        {(active || expired) && share.recipient_email && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onResend}
            disabled={busy || !active}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Resend
          </Button>
        )}
        {active && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 ml-auto"
            onClick={onRevoke}
            disabled={busy}
          >
            <X className="h-3 w-3 mr-1" /> Revoke
          </Button>
        )}
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
