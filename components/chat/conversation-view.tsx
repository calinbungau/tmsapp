"use client";

import React from "react"

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, Paperclip, ArrowDown, Loader2, Reply, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation, type TranslateFn } from "@/components/i18n/i18n-provider";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  message_type: string;
  metadata: any;
  reply_to_id: string | null;
  created_at: string;
}

interface Participant {
  user_id: string;
  user_type: string;
  display_name: string;
}

interface ConversationViewProps {
  conversationId: string;
  currentUserId: string;
  currentUserType: string;
  currentUserName: string;
  participants?: Participant[];
  compact?: boolean; // For embedding in task detail panel
}

function formatMessageTime(dateStr: string, t: TranslateFn) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  if (isYesterday) return `${t("chat.yesterday")} ${time}`;
  if (diffMs < 7 * 86400000) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function shouldShowDateSeparator(current: Message, previous: Message | null) {
  if (!previous) return true;
  return new Date(current.created_at).toDateString() !== new Date(previous.created_at).toDateString();
}

function formatDateSeparator(dateStr: string, t: TranslateFn) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t("chat.today");
  if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString()) return t("chat.yesterday");
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export function ConversationView({
  conversationId,
  currentUserId,
  currentUserType,
  currentUserName,
  participants,
  compact = false,
}: ConversationViewProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [loadedParticipants, setLoadedParticipants] = useState<Participant[]>([]);

  // Auto-fetch participants if not provided
  useEffect(() => {
    if (participants && participants.length > 0) {
      setLoadedParticipants(participants);
      return;
    }
    const supabase = createClient();
    supabase
      .from("conversation_participants")
      .select("user_id, user_type, display_name")
      .eq("conversation_id", conversationId)
      .then(({ data }) => {
        if (data) setLoadedParticipants(data);
      });
  }, [conversationId, participants]);

  const participantMap = new Map(
    loadedParticipants.map((p) => [`${p.user_type}:${p.user_id}`, p.display_name])
  );

  const getSenderName = (msg: Message) => {
    // Try participant map first, then fall back to sender_name on the message itself
    return participantMap.get(`${msg.sender_type}:${msg.sender_id}`) || (msg as any).sender_name || msg.sender_type;
  };

  const getSenderInitials = (msg: Message) => {
    const name = getSenderName(msg);
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const getSenderColor = (msg: Message) => {
    if (msg.sender_type === "system") return "bg-muted text-muted-foreground";
    if (msg.sender_type === "driver") return "bg-blue-500/20 text-blue-400";
    // Hash the sender_id for consistent colors for different admins
    const hash = msg.sender_id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const colors = [
      "bg-purple-500/20 text-purple-400",
      "bg-emerald-500/20 text-emerald-400",
      "bg-amber-500/20 text-amber-400",
      "bg-rose-500/20 text-rose-400",
      "bg-cyan-500/20 text-cyan-400",
    ];
    return colors[hash % colors.length];
  };

  // Fetch messages
  const fetchMessages = useCallback(async (before?: string) => {
    try {
      const params = new URLSearchParams({
        conversationId,
        userId: currentUserId,
        userType: currentUserType,
        limit: "50",
      });
      if (before) params.set("before", before);

      const res = await fetch(`/api/chat/messages?${params}`);
      const data = await res.json();

      if (before) {
        setMessages((prev) => [...(data.messages || []), ...prev]);
      } else {
        setMessages(data.messages || []);
      }
      setHasMore(data.has_more || false);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, currentUserId, currentUserType]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  // Auto-scroll to bottom on new messages.
  // We scroll the *container* (not the end-ref) because:
  //   - scrollIntoView() defaults to block:"start", which would push the
  //     END marker to the TOP of the container — hiding all messages above.
  //   - When there's no overflow (few messages), scrollTop=scrollHeight is
  //     a no-op, so the date separator + first message stay visible.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || loading) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length, loading]);

  // Scroll position detection for "scroll to bottom" button
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 100);
  };

  // Realtime: listen for new messages
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Skip messages sent by current user - the API response handles those
          if (newMsg.sender_id === currentUserId && newMsg.sender_type === currentUserType) {
            // But still replace optimistic message if it exists
            setMessages((prev) => {
              const hasOptimistic = prev.some((m) => m.id.startsWith("temp-"));
              if (hasOptimistic) {
                // Replace the first temp message with the real one
                let replaced = false;
                return prev.map((m) => {
                  if (!replaced && m.id.startsWith("temp-")) {
                    replaced = true;
                    return newMsg;
                  }
                  return m;
                });
              }
              // Already handled by API response, skip
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            return;
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Mark as read if we're viewing this conversation
          fetch("/api/chat/unread", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_id: conversationId,
              user_id: currentUserId,
              user_type: currentUserType,
            }),
          }).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, currentUserType]);

  // Send message
  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || sending) return;

    setSending(true);
    setNewMessage("");

    // Optimistic add
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: currentUserId,
      sender_type: currentUserType,
      content: text,
      message_type: "text",
      metadata: null,
      reply_to_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          sender_id: currentUserId,
          sender_type: currentUserType,
          sender_name: currentUserName,
          content: text,
        }),
      });
      const data = await res.json();
      if (data.message) {
        // Replace optimistic with real message
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? data.message : m))
        );
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setNewMessage(text); // Restore the message
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Handle Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isMine = (msg: Message) =>
    msg.sender_id === currentUserId && msg.sender_type === currentUserType;

  return (
    <div className={`flex flex-col ${compact ? "h-full" : "h-full"}`}>
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1 relative"
        onScroll={handleScroll}
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasMore && !loading && (
          <button
            type="button"
            onClick={() => {
              if (messages.length > 0) fetchMessages(messages[0].created_at);
            }}
            className="w-full text-center py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("chat.loadEarlier")}
          </button>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">{t("chat.noMessagesYet")}</p>
            <p className="text-xs mt-1">{t("chat.sendToStart")}</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const mine = isMine(msg);
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showDate = shouldShowDateSeparator(msg, prevMsg);
          const isConsecutive =
            prevMsg &&
            prevMsg.sender_id === msg.sender_id &&
            prevMsg.sender_type === msg.sender_type &&
            !showDate &&
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 120000;
          const isSystem = msg.sender_type === "system";

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {formatDateSeparator(msg.created_at, t)}
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
              )}

              {isSystem ? (
                <div className="flex items-center justify-center py-1">
                  <span className="text-[10px] text-muted-foreground bg-muted/30 rounded-full px-3 py-1">
                    {msg.content}
                  </span>
                </div>
              ) : mine ? (
                <div className={`flex justify-end ${isConsecutive ? "mt-0.5" : "mt-3"}`}>
                  <div className="max-w-[75%] flex flex-col items-end">
                    {!isConsecutive && (
                      <span className="text-[9px] text-muted-foreground mb-0.5 mr-1">
                        {formatMessageTime(msg.created_at, t)}
                      </span>
                    )}
                    <div className={`rounded-2xl rounded-br-md px-3.5 py-2 text-sm bg-primary text-primary-foreground ${
                      msg.id.startsWith("temp-") ? "opacity-70" : ""
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`flex gap-2 ${isConsecutive ? "mt-0.5 ml-8" : "mt-3"}`}>
                  {!isConsecutive && (
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-4 ${getSenderColor(msg)}`}>
                      {getSenderInitials(msg)}
                    </div>
                  )}
                  <div className="max-w-[75%]">
                    {!isConsecutive && (
                      <div className="flex items-center gap-2 mb-0.5 ml-1">
                        <span className="text-[10px] font-semibold text-foreground">{getSenderName(msg)}</span>
                        <span className="text-[9px] text-muted-foreground">{formatMessageTime(msg.created_at, t)}</span>
                        {msg.sender_type === "driver" && (
                          <span className="text-[8px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">{t("chat.driver")}</span>
                        )}
                      </div>
                    )}
                    <div className="rounded-2xl rounded-bl-md px-3.5 py-2 text-sm bg-card border border-border/50">
                      <p className="whitespace-pre-wrap break-words text-foreground">{msg.content}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={() => {
              const c = messagesContainerRef.current;
              if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
            }}
            className="h-8 w-8 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input area — pinned to the bottom of the flex column.
          flex-shrink-0 ensures the composer is never compressed by the
          messages list above it; bg-card prevents the messages from
          showing through when the list is scrolled to the very bottom. */}
      <div className="flex-shrink-0 border-t border-border/50 p-3 bg-card">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.typeMessage")}
              rows={1}
              className="w-full resize-none rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 max-h-32 overflow-y-auto"
              style={{ minHeight: "40px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 128) + "px";
              }}
            />
          </div>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="h-10 w-10 rounded-xl flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground/50 mt-1 ml-1">
          {t("chat.enterToSend")}
        </p>
      </div>
    </div>
  );
}
