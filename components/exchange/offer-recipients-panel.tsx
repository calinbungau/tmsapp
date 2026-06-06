"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Inbox,
  Eye,
  EyeOff,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  BadgeEuro,
  Trophy,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Recipient {
  id: string;
  carrier_name: string | null;
  email: string | null;
  response: "interested" | "quoted" | "declined" | null;
  responded_at: string | null;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_message: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  dispatcher_decision: "accepted" | "declined" | null;
  decided_at: string | null;
}

interface OfferAward {
  status: string | null;
  awarded_recipient_id: string | null;
  awarded_carrier_id: string | null;
  awarded_at: string | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_type: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

function fmtTime(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const responseConfig: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  interested: {
    label: "Interested",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: CheckCircle2,
  },
  quoted: {
    label: "Quoted",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: BadgeEuro,
  },
  declined: {
    label: "Declined",
    className: "bg-muted text-muted-foreground",
    icon: XCircle,
  },
};

const jsonFetcher = (url: string, adminId: string) =>
  fetch(url, { headers: { "x-admin-id": adminId } }).then((r) => r.json());

export function OfferRecipientsPanel({
  offerId,
  adminId,
  onAwardLinkedOrder,
}: {
  offerId: string;
  adminId: string;
  onAwardLinkedOrder?: (orderId: string, tripLegId?: string) => void;
}) {
  const { data, isLoading, mutate } = useSWR(
    [`/api/exchange/offers/${offerId}/recipients`, adminId],
    ([url, id]) => jsonFetcher(url, id),
    { refreshInterval: 20000 }
  );
  const recipients: Recipient[] = data?.recipients || [];
  const award: OfferAward | null = data?.offer || null;
  const [chatWith, setChatWith] = useState<Recipient | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const responded = recipients.filter((r) => r.response).length;
  const viewed = recipients.filter((r) => r.first_viewed_at).length;
  const isAwarded = award?.status === "awarded" && !!award.awarded_recipient_id;
  const awardedRecipient = recipients.find((r) => r.id === award?.awarded_recipient_id);

  const decide = async (
    recipient: Recipient,
    decision: "accept" | "decline" | "reopen"
  ) => {
    setPendingId(recipient.id);
    try {
      const res = await fetch(`/api/exchange/recipients/${recipient.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-id": adminId },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      const data = await res.json().catch(() => ({}));
      const name = recipient.carrier_name || recipient.email || "Carrier";

      // If this was an accept with a linked order, notify the parent and show action
      if (decision === "accept" && data.linkedOrderInfo?.orderId) {
        toast({
          title: `Offer awarded to ${name}`,
          description: "Carrier and cost written back to the order. Create a forwarding subcontract?",
          action: onAwardLinkedOrder ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAwardLinkedOrder(data.linkedOrderInfo.orderId, data.linkedOrderInfo.tripLegId)}
            >
              Create FWD Order
            </Button>
          ) : undefined,
        });
      } else {
        toast({
          title:
            decision === "accept"
              ? `Offer awarded to ${name}`
              : decision === "decline"
                ? `Declined ${name}`
                : "Offer re-opened",
          description:
            decision === "accept"
              ? "Other carriers were marked as declined and the carrier was notified."
              : decision === "reopen"
                ? "You can now make a new decision."
                : "The carrier has been notified.",
        });
      }
      await mutate();
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Carrier responses</h2>
        </div>
        {recipients.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{viewed} viewed</span>
            <span>·</span>
            <span>{responded} responded</span>
          </div>
        )}
      </div>

      {isAwarded && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Trophy className="h-4 w-4 shrink-0" />
          <span className="text-pretty">
            Awarded to{" "}
            <span className="font-semibold">
              {awardedRecipient?.carrier_name || awardedRecipient?.email || "a carrier"}
            </span>
            {awardedRecipient?.response === "quoted" &&
              awardedRecipient.quote_amount != null &&
              ` · ${awardedRecipient.quote_amount} ${awardedRecipient.quote_currency || "EUR"}`}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No carriers have been sent this offer yet. Use Publish to email it to your groups.
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {recipients.map((r) => {
            const rc = r.response ? responseConfig[r.response] : null;
            const busy = pendingId === r.id;
            const isWinner = r.id === award?.awarded_recipient_id;
            return (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {r.carrier_name || r.email || "Carrier"}
                    </span>
                    {rc && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${rc.className}`}
                      >
                        <rc.icon className="h-3 w-3" />
                        {rc.label}
                      </span>
                    )}
                    {r.dispatcher_decision === "accepted" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Trophy className="h-3 w-3" />
                        Awarded
                      </span>
                    )}
                    {r.dispatcher_decision === "declined" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        <X className="h-3 w-3" />
                        Declined
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {r.first_viewed_at ? (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {r.view_count}× · last {fmtTime(r.last_viewed_at)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <EyeOff className="h-3 w-3" /> Not opened
                      </span>
                    )}
                    {r.response === "quoted" && r.quote_amount != null && (
                      <span className="font-medium text-foreground">
                        {r.quote_amount} {r.quote_currency || "EUR"}
                      </span>
                    )}
                  </div>
                  {r.quote_message && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      &ldquo;{r.quote_message}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Decision controls: only meaningful once the carrier has
                      responded with interest or a quote. */}
                  {r.response && r.response !== "declined" && !r.dispatcher_decision && !isAwarded && (
                    <>
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={busy}
                        onClick={() => decide(r, "accept")}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 sm:mr-1" />
                        )}
                        <span className="hidden sm:inline">Accept</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={busy}
                        onClick={() => decide(r, "decline")}
                      >
                        <X className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Decline</span>
                      </Button>
                    </>
                  )}
                  {(r.dispatcher_decision || (isAwarded && isWinner)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={busy}
                      onClick={() => decide(r, "reopen")}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 sm:mr-1" />
                      )}
                      <span className="hidden sm:inline">Reopen</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setChatWith(r)}
                  >
                    <MessageSquare className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Chat</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!chatWith} onOpenChange={(o) => !o && setChatWith(null)}>
        <SheetContent className="flex flex-col p-0 sm:max-w-md">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="text-base">
              {chatWith?.carrier_name || chatWith?.email || "Carrier"}
            </SheetTitle>
          </SheetHeader>
          {chatWith && (
            <RecipientChat recipientId={chatWith.id} adminId={adminId} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RecipientChat({
  recipientId,
  adminId,
}: {
  recipientId: string;
  adminId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/exchange/recipients/${recipientId}/messages`, {
        headers: { "x-admin-id": adminId },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      /* ignore */
    }
  }, [recipientId, adminId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      const res = await fetch(`/api/exchange/recipients/${recipientId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-id": adminId },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok && data.message) setMessages((m) => [...m, data.message]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 text-pretty">
            No messages yet. Start the conversation with this carrier.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_type === "admin";
            return (
              <div
                key={m.id}
                className={`flex flex-col max-w-[80%] ${mine ? "ml-auto items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {fmtTime(m.created_at)}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t p-3 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message..."
          rows={1}
          className="resize-none min-h-10 max-h-32"
        />
        <Button size="icon" onClick={send} disabled={sending || !input.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </>
  );
}
