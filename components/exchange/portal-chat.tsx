"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_type: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Carrier-facing chat thread for an offer. Authenticates every request with the
 * recipient token + PIN and polls for new messages every few seconds.
 */
export function PortalChat({
  token,
  pin,
  carrierAccountId,
  initialMessages,
}: {
  token: string;
  pin: string;
  carrierAccountId: string | null;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(
    initialMessages.length ? initialMessages[initialMessages.length - 1].created_at : null
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Poll for new messages.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const params = new URLSearchParams();
        if (pin) params.set("pin", pin);
        if (carrierAccountId) params.set("carrierAccountId", carrierAccountId);
        if (lastAtRef.current) params.set("after", lastAtRef.current);
        const res = await fetch(`/api/exchange/portal/${token}/messages?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const incoming: ChatMessage[] = data.messages || [];
        if (active && incoming.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of incoming) if (!seen.has(m.id)) merged.push(m);
            return merged;
          });
          lastAtRef.current = incoming[incoming.length - 1].created_at;
          scrollToBottom();
        }
      } catch {
        /* ignore poll errors */
      }
    };
    const interval = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token, pin, carrierAccountId, scrollToBottom]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      const res = await fetch(`/api/exchange/portal/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, carrierAccountId, content }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
        );
        lastAtRef.current = data.message.created_at;
        scrollToBottom();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Chat with the dispatcher</p>
        <p className="text-xs text-muted-foreground">Ask questions about this offer</p>
      </div>

      <div ref={scrollRef} className="flex flex-col gap-3 p-4 max-h-80 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No messages yet. Start the conversation below.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_type === "carrier";
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {mine ? "You" : m.sender_name || "Dispatcher"} · {fmtTime(m.created_at)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
