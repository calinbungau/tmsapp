"use client";

/**
 * SendByEmailDialog
 *
 * Reusable "compose & send" dialog that drops in next to any
 * "Generate PDF / export" action. The caller owns the document
 * (it can be a Telematic report PDF, a TMS invoice, a CMR scan,
 * anything) and just hands us a function that returns
 *   { filename, base64, contentType }
 * when the user clicks Send.
 *
 * Why a shared dialog?
 *   Every "send by email" surface in this app needs the same five
 *   things: recipient chips with autocomplete, optional CC/BCC,
 *   subject, body, and (most importantly) a uniform success/error
 *   toast + per-user recipient history. Keeping it in one place
 *   means the Telematic team can wire up email-send without
 *   reimplementing the Send-to-Carrier UI.
 *
 * Networking
 *   The dialog POSTs to /api/email/send which signs with the
 *   current operator's personal SMTP (configured in
 *   Settings → Email). When SMTP isn't configured the endpoint
 *   returns 400 with a clear error which we surface inline.
 */

import { useCallback, useEffect, useState } from "react";
import { Mail, Loader2, AlertCircle, CheckCircle2, Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmailRecipientInput } from "@/components/tms/email-recipient-input";
import { recordEmailRecipients } from "@/lib/email-recipients";

export interface SendByEmailAttachment {
  filename: string;
  /** Base64 string (NO data:...;base64, prefix). */
  base64: string;
  contentType: string;
}

export interface SendByEmailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  /** Required to query autocomplete + record history. */
  adminId: string;
  userId: string | null;

  /** Optional BP boost in the autocomplete + Save-as-contact CTA. */
  businessPartnerId?: string | null;
  businessPartnerName?: string | null;

  /** Pre-filled subject and body (each is fully editable). */
  defaultSubject: string;
  defaultBody?: string;
  defaultRecipients?: string[];

  /** Short tag stored in the recipient-history rows for debugging. */
  historyContext: string;

  /**
   * Lazy attachment builder. Called only after the user clicks Send,
   * so we don't burn CPU rendering a PDF that the user might cancel.
   * Throw or reject to abort the send with the error surfaced inline.
   */
  buildAttachment: () => Promise<SendByEmailAttachment>;

  /** Optional callback after a successful send. */
  onSent?: (recipients: string[]) => void;

  /**
   * Lets a caller customise the dialog header without forking the
   * component. The default ("Send by Email") is fine in 99% of
   * cases.
   */
  title?: string;
  description?: string;
}

export function SendByEmailDialog(props: SendByEmailDialogProps) {
  const {
    open,
    onOpenChange,
    adminId,
    userId,
    businessPartnerId,
    businessPartnerName,
    defaultSubject,
    defaultBody = "",
    defaultRecipients,
    historyContext,
    buildAttachment,
    onSent,
    title = "Send by Email",
    description = "Compose a message and we'll attach the PDF for you.",
  } = props;

  const [recipients, setRecipients] = useState<string[]>(defaultRecipients || []);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset to the caller's defaults whenever the dialog re-opens. This
  // matters because a parent may render the dialog with stale state
  // (e.g. user opens, closes, then re-opens with a new date range).
  useEffect(() => {
    if (open) {
      setRecipients(defaultRecipients || []);
      setCc([]);
      setShowCc(false);
      setSubject(defaultSubject);
      setBody(defaultBody);
      setSending(false);
      setError(null);
      setSuccess(null);
    }
  }, [open, defaultSubject, defaultBody, defaultRecipients]);

  const handleSend = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (recipients.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject can't be empty.");
      return;
    }

    setSending(true);
    try {
      // 1) Build the attachment lazily.
      const att = await buildAttachment();

      // 2) Convert plain-text body into a simple HTML paragraph so
      //    line breaks survive the round-trip through HTML email.
      //    We don't want a heavy template here — the body is meant
      //    to be a short cover note.
      const htmlBody = body
        .split(/\n{2,}/)
        .map((para) =>
          `<p style="margin:0 0 12px 0;line-height:1.5;color:#1a1a1a">` +
          para
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>") +
          `</p>`,
        )
        .join("");

      // 3) Fire the send.
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-id": adminId,
        },
        body: JSON.stringify({
          to: recipients,
          cc: cc.length > 0 ? cc : undefined,
          subject: subject.trim(),
          html: htmlBody || "<p></p>",
          attachments: [
            {
              filename: att.filename,
              content: att.base64,
              contentType: att.contentType,
            },
          ],
        }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data.error) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      // 4) Record the recipients into the per-user history so they
      //    show up at the top of next autocomplete dropdown. Best
      //    effort — failures here must NOT mask a successful send.
      try {
        await recordEmailRecipients({
          adminId,
          userId,
          emails: [...recipients, ...cc],
          businessPartnerId: businessPartnerId || null,
          context: historyContext,
        });
      } catch (histErr) {
        console.warn("[send-by-email] history record failed", histErr);
      }

      setSuccess(`Sent to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.`);
      onSent?.(recipients);

      // Auto-close after a short pause so the user sees the success
      // state. The parent can still force-close earlier via onSent.
      setTimeout(() => onOpenChange(false), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }, [
    recipients, cc, subject, body, adminId, userId, businessPartnerId,
    historyContext, buildAttachment, onSent, onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Recipients */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">To</Label>
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  + Add CC
                </button>
              )}
            </div>
            <EmailRecipientInput
              value={recipients}
              onChange={setRecipients}
              adminId={adminId}
              userId={userId}
              businessPartnerId={businessPartnerId}
              businessPartnerName={businessPartnerName}
              placeholder="name@company.com"
              disabled={sending}
            />
          </div>

          {showCc && (
            <div className="space-y-1.5">
              <Label className="text-xs">CC</Label>
              <EmailRecipientInput
                value={cc}
                onChange={setCc}
                adminId={adminId}
                userId={userId}
                businessPartnerId={businessPartnerId}
                businessPartnerName={businessPartnerName}
                placeholder="cc@company.com"
                disabled={sending}
              />
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject" className="text-xs">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
              className="text-sm"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="email-body" className="text-xs">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Add a short cover note (optional)..."
              disabled={sending}
              className="text-sm resize-none"
            />
          </div>

          {/* Attachment chip — purely informational */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 border border-border/40 rounded-md px-3 py-2">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span>The generated PDF will be attached automatically when you click Send.</span>
          </div>

          {/* Inline messages */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span className="break-words">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>{success}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || recipients.length === 0}>
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
