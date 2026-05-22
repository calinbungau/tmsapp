"use client";

/**
 * Send Documents to Customer dialog
 * ──────────────────────────────────
 * Opens from the parent INT order header. Lets the operator pick
 * any combination of:
 *   • outgoing customer invoices on this order
 *   • order documents on this order (Docs tab)
 *   • the same two sources on every subcontract child order
 * …and email them to the customer in one go. The merge toggle
 * collapses every selected attachment into a single PDF before
 * sending, which is how most accounting departments prefer to
 * receive shipment paperwork.
 *
 * Why a custom dialog rather than reusing SendToCarrierDialog:
 * the carrier flow sends ONE generated PDF; this one composes an
 * arbitrary multi-source selection. The data model and the UI
 * (grouped checkbox tree, merge toggle) are different enough that
 * sharing the component would create more branching than reuse
 * saves.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  Loader2,
  FileText,
  Receipt,
  Truck,
  Mail,
  AlertCircle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

const supabase = createClient();

type OrderDoc = {
  id: string;
  name: string | null;
  file_url: string | null;
  mime_type: string | null;
  document_type: string | null;
  created_at: string;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  file_url: string | null;
  direction: string | null;
  amount: number | null;
  currency: string | null;
  issue_date: string | null;
  // Smartbill-backed invoices don't store a `file_url` — the PDF is
  // fetched on demand from /api/smartbill/invoice using these two
  // fields. We treat such invoices as "downloadable" too.
  smartbill_series: string | null;
  smartbill_number: string | null;
};

// A row is selectable in the picker as long as we have SOME way to
// produce a PDF for it: either a stored Blob URL (`file_url`) or
// the Smartbill coordinates (`series` + `number`). Centralised in
// one helper so the filter, the select-all derivation, and the
// per-bundle counts all stay in lockstep — earlier this was just
// `i.file_url`, which silently hid every Smartbill invoice.
const invoiceHasFile = (i: Invoice) =>
  !!i.file_url || !!(i.smartbill_series && i.smartbill_number);

type ChildOrder = {
  id: string;
  reference_number: string | null;
  commercial_role: string | null;
};

type Bundle = {
  order: { id: string; reference_number: string | null };
  documents: OrderDoc[];
  invoices: Invoice[];
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  adminId?: string;
  customerEmailOnFile?: string | null;
  orderReference?: string | null;
  onSent?: () => void;
}

export function SendDocsToCustomerDialog({
  open,
  onOpenChange,
  orderId,
  adminId,
  customerEmailOnFile,
  orderReference,
  onSent,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [bundles, setBundles] = useState<Bundle[]>([]);

  // Selection: a flat Set of "type:id" strings so we can mix
  // documents and invoices in the same membership check.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Form fields
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [merge, setMerge] = useState(true);
  const [mergedFilename, setMergedFilename] = useState("");

  // ── Send history ──
  // Read from order_activity_log, action = 'documents_sent_to_customer'.
  // We DON'T block re-sending — the operator may legitimately need to
  // resend (customer claims they didn't receive it, ops sends a
  // corrected attachment, etc.). The history block is informational
  // only and serves two purposes: (1) prevents accidental duplicate
  // sends by surfacing the most recent attempt at a glance, and (2)
  // gives accounting an auditable trail of which docs went where.
  type HistoryEntry = {
    id: string;
    created_at: string;
    details: {
      recipient_email?: string;
      cc_email?: string | null;
      subject?: string;
      merged?: boolean;
      attachment_count?: number;
      document_count?: number;
      total_bytes?: number;
    } | null;
  };
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const refreshHistory = async () => {
    const { data } = await supabase
      .from("order_activity_log")
      .select("id, created_at, details")
      .eq("order_id", orderId)
      .eq("action", "documents_sent_to_customer")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data as HistoryEntry[]) || []);
  };

  // ── Load data when the dialog opens ──
  // We re-fetch every open rather than caching because the
  // Docs and Invoices tabs may have changed since last time.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // 1. Find subcontract children. Customer-facing parent
        //    orders typically have one carrier_subcontract child,
        //    but we don't hard-code that.
        const { data: kids } = await supabase
          .from("orders")
          .select("id, reference_number, commercial_role")
          .eq("parent_order_id", orderId);

        const orderIds = [orderId, ...((kids as ChildOrder[] | null)?.map((k) => k.id) || [])];

        // 2. Pull every document + invoice across parent and
        //    children in two batched queries.
        const [docsRes, invRes, parentRes, histRes] = await Promise.all([
          supabase
            .from("order_documents")
            .select("id, name, file_url, mime_type, document_type, created_at, order_id")
            .in("order_id", orderIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("order_invoices")
            .select(
              "id, invoice_number, file_url, direction, amount, currency, issue_date, order_id, smartbill_series, smartbill_number"
            )
            .in("order_id", orderIds)
            .order("issue_date", { ascending: false }),
          supabase
            .from("orders")
            .select("id, reference_number, customer_reference")
            .eq("id", orderId)
            .single(),
          // History of past sends for the PARENT order only — child
          // orders log their own activity which isn't relevant to the
          // customer-facing email feed displayed here.
          supabase
            .from("order_activity_log")
            .select("id, created_at, details")
            .eq("order_id", orderId)
            .eq("action", "documents_sent_to_customer")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        if (!cancelled) setHistory((histRes.data as HistoryEntry[]) || []);

        if (cancelled) return;

        const docsByOrder = new Map<string, OrderDoc[]>();
        (docsRes.data || []).forEach((d: any) => {
          const arr = docsByOrder.get(d.order_id) || [];
          arr.push(d);
          docsByOrder.set(d.order_id, arr);
        });

        // Only OUTGOING invoices (those the company issues to the
        // customer). Incoming carrier invoices are internal cost
        // documents and have no place in a customer email.
        const invByOrder = new Map<string, Invoice[]>();
        (invRes.data || [])
          .filter((i: any) => i.direction === "outgoing")
          .forEach((i: any) => {
            const arr = invByOrder.get(i.order_id) || [];
            arr.push(i);
            invByOrder.set(i.order_id, arr);
          });

        const parentBundle: Bundle = {
          order: { id: orderId, reference_number: parentRes.data?.reference_number || orderReference || null },
          documents: docsByOrder.get(orderId) || [],
          invoices: invByOrder.get(orderId) || [],
        };

        const childBundles: Bundle[] = (kids || []).map((k) => ({
          order: { id: k.id, reference_number: k.reference_number },
          documents: docsByOrder.get(k.id) || [],
          invoices: invByOrder.get(k.id) || [],
        }));

        setBundles([parentBundle, ...childBundles]);

        // Pre-select all outgoing invoices on the parent order by
        // default — that's the most common "send invoices to
        // customer" use case. The operator unchecks anything they
        // don't want.
        const defaultSelected = new Set<string>();
        parentBundle.invoices.forEach((i) => {
          if (invoiceHasFile(i)) defaultSelected.add(`invoice:${i.id}`);
        });
        setSelected(defaultSelected);

        // Default subject + filename + body.
        //
        // We combine the internal `reference_number` (e.g.
        // INT-2026-852601) with the customer's own `customer_reference`
        // (e.g. 13/5427) so the email arrives in the customer's
        // inbox already labelled with the number THEY filed it
        // under. Accounting teams almost always search by their own
        // reference, not ours, so without this the email becomes
        // hard to associate with a payment file on their side.
        //
        // Customer reference is treated as the primary identifier
        // when present: it leads the subject line and is the basis
        // for the merged-PDF filename. The internal reference is
        // shown after it (in parentheses in the subject, as "Our
        // ref:" in the body) so we keep our own audit trail.
        const ref = parentBundle.order.reference_number || orderReference || "";
        const custRef = (parentRes.data as any)?.customer_reference || "";

        const subjectLine = custRef && ref
          ? `Documents for order ${custRef} (Our ref: ${ref})`
          : custRef
            ? `Documents for order ${custRef}`
            : ref
              ? `Documents for order ${ref}`
              : "Documents for your order";
        setSubject(subjectLine);

        // Filename: prefer customer reference but sanitise — refs
        // like "13/5427" contain a slash which would corrupt the
        // attachment filename, so we replace any non-filename-safe
        // character with a dash.
        const filenameBase = (custRef || ref || "Documents").replace(/[^a-zA-Z0-9._-]+/g, "-");
        setMergedFilename(`Documents-${filenameBase}.pdf`);

        const bodyOrderLine = custRef && ref
          ? `your order ${custRef} (our ref: ${ref})`
          : custRef
            ? `your order ${custRef}`
            : ref
              ? `order ${ref}`
              : "your order";
        setMessageBody(
          `Dear customer,\n\nPlease find attached the documents for ${bodyOrderLine}.\n\nKind regards.`
        );
      } catch (err: any) {
        console.error("[v0] SendDocsDialog load failed", err);
        toast({
          title: "Failed to load documents",
          description: err?.message || "Try again in a moment",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, orderId, orderReference, toast]);

  // Reset recipient whenever the dialog opens — but only with
  // a value the user hasn't already overridden in this session.
  useEffect(() => {
    if (open) setRecipient(customerEmailOnFile || "");
  }, [open, customerEmailOnFile]);

  // ── Derived: every available "type:id" key, used for select-all ──
  const allKeys = useMemo(() => {
    const keys: string[] = [];
    bundles.forEach((b) => {
      b.invoices.forEach((i) => invoiceHasFile(i) && keys.push(`invoice:${i.id}`));
      b.documents.forEach((d) => d.file_url && keys.push(`order_document:${d.id}`));
    });
    return keys;
  }, [bundles]);

  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const someSelected = selected.size > 0;

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allKeys));
  };

  const toggleBundle = (b: Bundle) => {
    const bundleKeys = [
      ...b.invoices.filter(invoiceHasFile).map((i) => `invoice:${i.id}`),
      ...b.documents.filter((d) => d.file_url).map((d) => `order_document:${d.id}`),
    ];
    const allInBundleSelected = bundleKeys.length > 0 && bundleKeys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allInBundleSelected) {
        bundleKeys.forEach((k) => next.delete(k));
      } else {
        bundleKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!recipient.trim()) {
      toast({ title: "Recipient required", description: "Enter the customer email address.", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Select at least one document", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Translate the "type:id" keys back into the API payload shape.
      const docs = Array.from(selected).map((k) => {
        const [type, id] = k.split(":");
        return { type: type as "invoice" | "order_document", id };
      });

      const res = await fetch(`/api/orders/${orderId}/send-docs-to-customer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminId ? { "x-admin-id": adminId } : {}),
        },
        body: JSON.stringify({
          recipient_email: recipient.trim(),
          cc_email: cc.trim() || undefined,
          subject: subject.trim() || undefined,
          message: messageBody.trim() || undefined,
          documents: docs,
          merge,
          merged_filename: merge ? mergedFilename.trim() || undefined : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send");

      toast({
        title: "Documents sent",
        description: data.message || `Sent to ${recipient}`,
      });
      onSent?.();
      // Refresh the visible history block so the just-sent email
      // appears immediately as the top entry. We DON'T close the
      // dialog automatically — the operator typically wants to
      // confirm "yes, this was actually sent now" before moving on,
      // and seeing the new history row appear is the cleanest
      // confirmation of that.
      await refreshHistory();
    } catch (err: any) {
      console.error("[v0] SendDocsDialog send failed", err);
      toast({
        title: "Send failed",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const totalAvailable = allKeys.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-emerald-400" />
            Send Documents to Customer
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select documents from this order and its subcontract orders, then email them to the customer.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 py-4 space-y-5">
            {/* ── Send history ──
                Shown at the top so the operator can immediately spot
                whether the documents have already been sent (and to
                whom) before they re-send. Re-sending is allowed and
                expected — this is purely informational. Most recent
                first; we keep up to 20 entries in view. */}
            {history.length > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] overflow-hidden">
                <div className="px-3 py-2 flex items-center gap-2 border-b border-emerald-500/15">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-300">
                    Previously sent {history.length === 1 ? "once" : `${history.length} times`}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    You can send again
                  </span>
                </div>
                <ul className="divide-y divide-emerald-500/10 max-h-32 overflow-auto">
                  {history.map((entry) => {
                    const d = entry.details || {};
                    const when = new Date(entry.created_at);
                    const dateStr = when.toLocaleString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <li
                        key={entry.id}
                        className="px-3 py-2 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-0.5"
                      >
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {dateStr}
                        </span>
                        <span className="text-foreground/90 font-mono truncate max-w-[200px]">
                          {d.recipient_email || "—"}
                        </span>
                        {d.cc_email && (
                          <span className="text-muted-foreground truncate max-w-[180px]">
                            cc: {d.cc_email}
                          </span>
                        )}
                        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                          {d.attachment_count ?? d.document_count ?? 0}{" "}
                          {d.merged ? "merged" : "files"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* ── Recipient + subject ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="recipient" className="text-xs">
                  To <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="recipient"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="customer@example.com"
                  className="h-9 text-sm"
                />
                {!customerEmailOnFile && (
                  <p className="text-[10px] text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    No email on file for this customer
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc" className="text-xs">
                  CC <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="cc"
                  type="email"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="accounting@example.com"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject" className="text-xs">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body" className="text-xs">Message</Label>
              <Textarea
                id="body"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <Separator />

            {/* ── Documents picker ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold">Documents</Label>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {selected.size}/{totalAvailable} selected
                  </Badge>
                </div>
                {totalAvailable > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition"
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading documents…
                </div>
              ) : totalAvailable === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground border border-dashed border-border/50 rounded-md">
                  <FileText className="h-5 w-5 mb-1.5 opacity-50" />
                  No documents or invoices available on this order or its subcontracts yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {bundles.map((b, idx) => {
                    const total = b.invoices.filter(invoiceHasFile).length + b.documents.filter((d) => d.file_url).length;
                    if (total === 0 && idx > 0) {
                      // Hide empty children, but always show the parent header even when empty
                      return null;
                    }
                    const isParent = idx === 0;
                    const bundleKeys = [
                      ...b.invoices.filter(invoiceHasFile).map((i) => `invoice:${i.id}`),
                      ...b.documents.filter((d) => d.file_url).map((d) => `order_document:${d.id}`),
                    ];
                    const bundleAllSelected = bundleKeys.length > 0 && bundleKeys.every((k) => selected.has(k));

                    return (
                      <div
                        key={b.order.id}
                        className="border border-border/50 rounded-md overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/50">
                          <div className="flex items-center gap-2">
                            {isParent ? (
                              <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Truck className="h-3.5 w-3.5 text-indigo-400" />
                            )}
                            <span className="text-xs font-medium">
                              {b.order.reference_number || (isParent ? "This order" : "Subcontract")}
                            </span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {isParent ? "Parent" : "Subcontract"}
                            </Badge>
                          </div>
                          {total > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleBundle(b)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              {bundleAllSelected ? "Clear" : "Select"}
                            </button>
                          )}
                        </div>

                        {total === 0 ? (
                          <p className="text-[11px] text-muted-foreground px-3 py-2.5">No files</p>
                        ) : (
                          <ul className="divide-y divide-border/30">
                            {b.invoices
                              .filter(invoiceHasFile)
                              .map((i) => {
                                const key = `invoice:${i.id}`;
                                return (
                                  <li key={key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/20 transition">
                                    <Checkbox
                                      id={key}
                                      checked={selected.has(key)}
                                      onCheckedChange={() => toggleOne(key)}
                                    />
                                    <Receipt className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                    <label
                                      htmlFor={key}
                                      className="flex-1 min-w-0 text-xs cursor-pointer"
                                    >
                                      <span className="font-medium">
                                        Invoice {i.invoice_number || "(no number)"}
                                      </span>
                                      {i.amount != null && (
                                        <span className="text-muted-foreground ml-2">
                                          {i.currency || ""} {Number(i.amount).toFixed(2)}
                                        </span>
                                      )}
                                    </label>
                                    <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-400 border-emerald-500/30">
                                      Invoice
                                    </Badge>
                                  </li>
                                );
                              })}
                            {b.documents
                              .filter((d) => d.file_url)
                              .map((d) => {
                                const key = `order_document:${d.id}`;
                                return (
                                  <li key={key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/20 transition">
                                    <Checkbox
                                      id={key}
                                      checked={selected.has(key)}
                                      onCheckedChange={() => toggleOne(key)}
                                    />
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <label
                                      htmlFor={key}
                                      className="flex-1 min-w-0 text-xs cursor-pointer truncate"
                                      title={d.name || "Unnamed document"}
                                    >
                                      <span className="font-medium">{d.name || "Unnamed document"}</span>
                                    </label>
                                    {d.document_type && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                                        {d.document_type}
                                      </Badge>
                                    )}
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* ── Merge toggle ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="merge" className="text-xs font-semibold">
                    Merge into a single PDF
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Combines all selected files into one PDF attachment. Images are converted to PDF pages.
                  </p>
                </div>
                <Switch id="merge" checked={merge} onCheckedChange={setMerge} />
              </div>

              {merge && (
                <div className="space-y-1.5 pl-1">
                  <Label htmlFor="merged-name" className="text-[11px]">Filename</Label>
                  <Input
                    id="merged-name"
                    value={mergedFilename}
                    onChange={(e) => setMergedFilename(e.target.value)}
                    placeholder="Documents.pdf"
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border/50 gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending || !someSelected || !recipient.trim()} className="gap-1.5">
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" /> Send {selected.size > 0 ? `(${selected.size})` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
