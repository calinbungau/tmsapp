"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Link2,
  Copy,
  Check,
  Mail,
  CheckCircle2,
  Clock,
  Send,
} from "lucide-react";

type Status = "loading" | "not_invited" | "invited" | "connected";

interface Props {
  partnerId: string;
  partnerEmail: string | null;
  adminId: string;
  userId?: string | null;
}

/**
 * Portal-invite panel shown on carrier business partners. Lets the dispatcher
 * generate a shareable signup link and optionally email it. Reflects whether
 * the carrier is already connected (has a linked account) or has a pending
 * invite. The link onboards the carrier and links their global account to this
 * tenant's partner record.
 */
export function CarrierPortalInvite({ partnerId, partnerEmail, adminId, userId }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [account, setAccount] = useState<{ email: string; contactName: string | null; lastLoginAt: string | null } | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailedNote, setEmailedNote] = useState<string | null>(null);

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-admin-id": adminId,
      ...(userId ? { "x-user-id": userId } : {}),
    }),
    [adminId, userId]
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/exchange/carrier-invites?partnerId=${partnerId}`, {
        headers: headers(),
      });
      const data = await res.json();
      setStatus(data.status || "not_invited");
      setInviteUrl(data.invite?.url || null);
      setAccount(data.account || null);
    } catch {
      setStatus("not_invited");
    }
  }, [partnerId, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const createInvite = async (sendEmail: boolean) => {
    setWorking(true);
    setEmailedNote(null);
    try {
      const res = await fetch("/api/exchange/carrier-invites", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ partnerId, sendEmail }),
      });
      const data = await res.json();
      if (data.status === "connected") {
        setStatus("connected");
        await load();
      } else if (data.url) {
        setInviteUrl(data.url);
        setStatus("invited");
        if (sendEmail) {
          setEmailedNote(data.emailed ? "Invitation emailed to the carrier." : "Link created, but the email could not be sent (check SMTP settings).");
        }
      }
    } catch {
      setEmailedNote("Something went wrong. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">Connected to the portal</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This carrier has an active account
              {account?.email ? ` (${account.email})` : ""}. They can see your offers and respond in the app.
            </p>
            {account?.lastLoginAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last login: {new Date(account.lastLoginAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Link2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">Carrier portal access</p>
            {status === "invited" && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">
                <Clock className="mr-1 h-3 w-3" /> Invited
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite this carrier to create a free account so they can view offers, send quotes,
            and chat with you. One account works across every company that engages them.
          </p>
        </div>
      </div>

      {inviteUrl && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Invite link</label>
          <div className="flex gap-2">
            <Input readOnly value={inviteUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copy link">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {emailedNote && <p className="text-sm text-muted-foreground">{emailedNote}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => createInvite(true)} disabled={working || !partnerEmail}>
          {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          {status === "invited" ? "Resend email" : "Invite by email"}
        </Button>
        <Button type="button" variant="outline" onClick={() => createInvite(false)} disabled={working}>
          {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {inviteUrl ? "Regenerate link" : "Create invite link"}
        </Button>
      </div>
      {!partnerEmail && (
        <p className="text-xs text-amber-600">
          Add an email to this partner to send the invitation by email, or create a link to share manually.
        </p>
      )}
    </div>
  );
}
