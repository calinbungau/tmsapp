"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckCircle2,
  Mail,
  Loader2,
  Send,
  FileCheck2,
  Receipt,
  Clock,
  ExternalLink,
  Copy,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// CarrierDocumentRequestCard
// ─────────────────────────────────────────────────────────────────────────────
// Mounts on the Overview tab of an FWD subcontractor order once the order
// reaches the post-delivery checklist phase. Shows:
//
//   • Whether the carrier has been emailed the upload link (and when)
//   • Per-step progress (CMR/POD received? Invoice received?)
//   • A Resend popover that lets the operator override the recipient
//     email and add a custom note before sending the reminder
//
// All data comes from the latest `carrier_upload_tokens` row for the
// order (token_type='cmr_pod'). The card is intentionally read-mostly:
// it does not own status changes for the order itself — those happen
// upstream when the email is sent or when the carrier completes a
// step via the public portal.
// ─────────────────────────────────────────────────────────────────────────────

interface CarrierUploadToken {
  id: string;
  token: string;
  created_at: string;
  expires_at: string;
  cmr_pod_uploaded_at: string | null;
  invoice_uploaded_at: string | null;
  carrier_email: string | null;
}

interface Props {
  orderId: string;
  carrierEmailOnFile: string | null;
  adminId: string | undefined;
  onChange?: () => void;
}

export function CarrierDocumentRequestCard({
  orderId,
  carrierEmailOnFile,
  adminId,
  onChange,
}: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const [token, setToken] = useState<CarrierUploadToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Resend form state
  const [customEmail, setCustomEmail] = useState("");
  const [customMessage, setCustomMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("carrier_upload_tokens")
      .select("id, token, created_at, expires_at, cmr_pod_uploaded_at, invoice_uploaded_at, carrier_email")
      .eq("order_id", orderId)
      .eq("token_type", "cmr_pod")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setToken(data as CarrierUploadToken | null);
    setLoading(false);
  }, [orderId, supabase]);

  useEffect(() => { refresh(); }, [refresh]);

  const cmrDone = !!token?.cmr_pod_uploaded_at;
  const invoiceDone = !!token?.invoice_uploaded_at;
  const bothDone = cmrDone && invoiceDone;

  const uploadUrl = (() => {
    if (!token?.token) return null;
    // Mirror the email-send logic: prefer NEXT_PUBLIC_APP_URL but
    // fall back to the production domain when running on a preview.
    const envUrl =
      (typeof window !== "undefined" ? window.location.origin : "") || "";
    const isPreview = /vercel\.app|v0-|\.vusercontent\./.test(envUrl);
    const base = !isPreview && envUrl ? envUrl : "https://app.bngtracking.ro";
    return `${base}/carrier/confirm/${token.token}`;
  })();

  const handleSend = async (force: boolean) => {
    if (!adminId) {
      toast({ title: "Not signed in", description: "Cannot send carrier request without an admin session.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/orders/request-cmr-pod", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-id": adminId },
        body: JSON.stringify({
          orderId,
          forceResend: force,
          recipientEmail: customEmail.trim() || undefined,
          customMessage: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        toast({
          title: data.alreadyComplete ? "Already complete" : "Could not send",
          description: data.error || "Request failed",
          variant: data.alreadyComplete ? "default" : "destructive",
        });
      } else {
        toast({
          title: force ? "Reminder sent" : "Carrier notified",
          description: `Sent to ${data.sentTo || "carrier"}`,
        });
        setPopoverOpen(false);
        setCustomEmail("");
        setCustomMessage("");
        await refresh();
        onChange?.();
      }
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!uploadUrl) return;
    try {
      await navigator.clipboard.writeText(uploadUrl);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const fmtRelative = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading carrier request status...
      </div>
    );
  }

  // No request has ever been sent yet — surface the first-send CTA.
  if (!token) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">Carrier Document Request</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            No request sent yet. The carrier will receive a secure two-step
            upload link for CMR/POD and the freight invoice.
          </p>
          <SendPopover
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            customEmail={customEmail}
            setCustomEmail={setCustomEmail}
            customMessage={customMessage}
            setCustomMessage={setCustomMessage}
            placeholderEmail={carrierEmailOnFile || ""}
            sending={sending}
            onSend={() => handleSend(false)}
            sendLabel="Send to carrier"
            triggerLabel="Send Request"
            triggerIcon={<Send className="h-3.5 w-3.5" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">Carrier Document Request</span>
        </div>
        {bothDone ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Complete
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Sent {fmtRelative(token.created_at)}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Step progress */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <StepStatus
            icon={<FileCheck2 className="h-3.5 w-3.5" />}
            label="CMR / POD"
            done={cmrDone}
            doneAt={token.cmr_pod_uploaded_at}
            fmt={fmtRelative}
          />
          <StepStatus
            icon={<Receipt className="h-3.5 w-3.5" />}
            label="Invoice"
            done={invoiceDone}
            doneAt={token.invoice_uploaded_at}
            fmt={fmtRelative}
          />
        </div>

        {/* Recipient + actions */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span>Sent to:</span>
            <span className="text-foreground/80">{token.carrier_email || carrierEmailOnFile || "—"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {uploadUrl && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] gap-1.5"
                  onClick={handleCopyLink}
                >
                  <Copy className="h-3 w-3" /> Copy link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] gap-1.5"
                  asChild
                >
                  <a href={uploadUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> Open
                  </a>
                </Button>
              </>
            )}
            {/* Resend button: always visible, even when both steps are
                complete. Per user request "keep resend all the time" so
                the operator can manually re-send the upload link if the
                carrier loses it or a new contact needs it. The button
                label changes from "Send Request" (not sent yet) to
                "Resend" (token already sent once). The popover gives the
                option to override the recipient email and add a custom
                note. */}
            <SendPopover
              open={popoverOpen}
              onOpenChange={setPopoverOpen}
              customEmail={customEmail}
              setCustomEmail={setCustomEmail}
              customMessage={customMessage}
              setCustomMessage={setCustomMessage}
              placeholderEmail={token.carrier_email || carrierEmailOnFile || ""}
              sending={sending}
              onSend={() => handleSend(true)}
              sendLabel={token.last_sent_at ? "Resend link" : "Send link"}
              triggerLabel={token.last_sent_at ? "Resend" : "Send Request"}
              triggerIcon={<Send className="h-3 w-3" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepStatus({
  icon, label, done, doneAt, fmt,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  doneAt: string | null;
  fmt: (s: string | null) => string;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 flex items-center gap-2 ${
      done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/40 bg-muted/20"
    }`}>
      <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${
        done ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/40 text-muted-foreground"
      }`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium leading-tight">{label}</div>
        <div className="text-[10px] text-muted-foreground leading-tight">
          {done ? `Received ${fmt(doneAt)}` : "Pending"}
        </div>
      </div>
    </div>
  );
}

function SendPopover({
  open, onOpenChange,
  customEmail, setCustomEmail,
  customMessage, setCustomMessage,
  placeholderEmail, sending, onSend,
  sendLabel, triggerLabel, triggerIcon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customEmail: string;
  setCustomEmail: (v: string) => void;
  customMessage: string;
  setCustomMessage: (v: string) => void;
  placeholderEmail: string;
  sending: boolean;
  onSend: () => void;
  sendLabel: string;
  triggerLabel: string;
  triggerIcon: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm" className="h-7 text-[11px] gap-1.5">
          {triggerIcon} {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Recipient email (optional)
            </label>
            <Input
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder={placeholderEmail || "carrier@example.com"}
              type="email"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave blank to send to the carrier&apos;s email on file.
            </p>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Custom note (optional)
            </label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Hi team, please send the docs as soon as possible..."
              className="text-xs min-h-[64px]"
            />
          </div>
          <Button
            size="sm"
            className="w-full h-8 text-xs gap-1.5"
            disabled={sending}
            onClick={onSend}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {sendLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
