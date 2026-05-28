"use client";

import React from "react"

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, X, ArrowLeft, ChevronRight, Search, Plus, Users, ClipboardList, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ConversationView } from "./conversation-view";

interface Conversation {
  id: string;
  type: string;
  context_type: string | null;
  context_id: string | null;
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  participants?: { user_id: string; user_type: string; display_name: string }[];
  unread_count?: number;
}

interface DriverChatFabProps {
  driverId: string;
  driverName: string;
  adminId: string;
  unreadCount: number;
  onUnreadChange?: (count: number) => void;
}

export function DriverChatFab({ driverId, driverName, adminId, unreadCount, onUnreadChange }: DriverChatFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"messages" | "job" | "orders">("messages");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTaskConvos, setActiveTaskConvos] = useState<Conversation[]>([]);
  const [activeOrderConvos, setActiveOrderConvos] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch DM conversations where driver is participant
      const res = await fetch(`/api/chat/conversations?userId=${driverId}&userType=driver`);
      const data = await res.json();
      const all: Conversation[] = data.conversations || [];
      setConversations(all.filter((c) => c.type === "direct"));

      // For Job Chats: fetch tasks assigned to this driver, then find their conversations
      const taskRes = await fetch(`/api/chat/driver-task-chats?driverId=${driverId}`);
      const taskData = await taskRes.json();
      setActiveTaskConvos(taskData.conversations || []);

      // For Order Chats: fetch trips assigned to this driver (each trip carries
      // one or more orders), then find their trip-context conversations.
      const orderRes = await fetch(`/api/chat/driver-order-chats?driverId=${driverId}`);
      const orderData = await orderRes.json();
      setActiveOrderConvos(orderData.conversations || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    if (isOpen) fetchConversations();
  }, [isOpen, fetchConversations]);

  // Realtime: refresh conversation list when conversations update
  useEffect(() => {
    if (!isOpen) return;
    const supabase = createClient();
    const ch = supabase
      .channel("driver-fab-convos")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => {
        fetchConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isOpen, fetchConversations]);

  const startNewChat = async (contactId: string, contactName: string, contactType: string) => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "direct",
          created_by_id: driverId,
          created_by_type: "driver",
          created_by_name: driverName,
          participants: [
            { user_id: contactId, user_type: contactType, display_name: contactName },
          ],
        }),
      });
      const data = await res.json();
      if (data.conversation) {
        setSelectedConvo(data.conversation);
        fetchConversations();
      }
    } catch {}
  };

  const timeAgo = (d: string | null) => {
    if (!d) return "";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const getConvoTitle = (c: Conversation) => {
    if (c.title) return c.title;
    const other = c.participants?.find((p) => p.user_id !== driverId);
    return other?.display_name || "Chat";
  };

  return (
    <>
      {/* FAB Button - only show when sheet is closed.
          Positioned bottom-LEFT (not bottom-right) because every
          action button on the driver screens — "Complete Loading",
          "Complete Unloading", "Submit", "Upload files" — is
          right-aligned by convention. A bottom-right FAB physically
          covers the orange primary CTA on the trip-detail page (see
          the user's screenshot from 5/28). The left corner is unused
          across all driver routes, so the FAB has its own safe
          territory and never fights for the same pixels as a primary
          action. We also bump it slightly higher (bottom-24 instead
          of bottom-[5.5rem]) so the chat icon doesn't crowd the
          bottom-nav badge on the active tab. */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-4 bottom-24 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all duration-300 active:scale-95"
          aria-label="Open chat"
        >
          <MessageSquare className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 ring-2 ring-background px-1.5 text-[11px] font-bold text-white animate-in zoom-in duration-200">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel (slide-up sheet) */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => { setIsOpen(false); setSelectedConvo(null); }} />

          {/* Sheet */}
          <div className="relative mt-12 flex-1 flex flex-col bg-background rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Sheet Header */}
            {selectedConvo ? (
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
                <button onClick={() => setSelectedConvo(null)} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{getConvoTitle(selectedConvo)}</p>
                  {selectedConvo.context_type === "task" && (
                    <p className="text-[10px] text-muted-foreground">Task conversation</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-4 pt-4 pb-2 bg-card border-b">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold">Chat</h2>
                  <div className="flex items-center gap-2">
                  <NewChatButton
                    driverId={driverId}
                    driverName={driverName}
                    adminId={adminId}
                    onStartChat={startNewChat}
                  />
                  <button
                    onClick={() => { setIsOpen(false); setSelectedConvo(null); }}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab("messages")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                      activeTab === "messages" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Messages
                    {conversations.filter(c => (c.unread_count || 0) > 0).length > 0 && (
                      <span className="h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        {conversations.filter(c => (c.unread_count || 0) > 0).length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("job")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                      activeTab === "job" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Jobs
                    {activeTaskConvos.filter(c => (c.unread_count || 0) > 0).length > 0 && (
                      <span className="h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        {activeTaskConvos.filter(c => (c.unread_count || 0) > 0).length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("orders")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                      activeTab === "orders" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5" />
                    Orders
                    {activeOrderConvos.filter(c => (c.unread_count || 0) > 0).length > 0 && (
                      <span className="h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        {activeOrderConvos.filter(c => (c.unread_count || 0) > 0).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto min-h-0">
              {selectedConvo ? (
                <ConversationView
                  conversationId={selectedConvo.id}
                  currentUserId={driverId}
                  currentUserType="driver"
                  currentUserName={driverName}
                  participants={selectedConvo.participants}
                  compact
                />
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
              ) : activeTab === "messages" ? (
                <ConvoList convos={conversations} driverId={driverId} onSelect={setSelectedConvo} emptyIcon={<Users className="h-8 w-8" />} emptyText="No direct messages yet" emptySubText="Start a conversation with an admin" />
              ) : activeTab === "job" ? (
                <ConvoList convos={activeTaskConvos} driverId={driverId} onSelect={setSelectedConvo} emptyIcon={<ClipboardList className="h-8 w-8" />} emptyText="No job chats yet" emptySubText="Task chats appear when created by dispatch" />
              ) : (
                <ConvoList convos={activeOrderConvos} driverId={driverId} onSelect={setSelectedConvo} emptyIcon={<Package className="h-8 w-8" />} emptyText="No order chats yet" emptySubText="Order chats appear when a trip is dispatched" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Conversation List Item ───

function ConvoList({
  convos,
  driverId,
  onSelect,
  emptyIcon,
  emptyText,
  emptySubText,
}: {
  convos: Conversation[];
  driverId: string;
  onSelect: (c: Conversation) => void;
  emptyIcon: React.ReactNode;
  emptyText: string;
  emptySubText: string;
}) {
  const timeAgo = (d: string | null) => {
    if (!d) return "";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  if (convos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        {emptyIcon}
        <p className="text-sm font-medium">{emptyText}</p>
        <p className="text-xs">{emptySubText}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {convos.map((c) => {
        const other = c.participants?.find((p) => p.user_id !== driverId);
        const title = c.title || other?.display_name || "Chat";
        const hasUnread = (c.unread_count || 0) > 0;
        const initials = title.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

        return (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
              hasUnread ? "bg-primary/5" : ""
            }`}
          >
            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
              c.context_type === "task"
                ? "bg-blue-500/15 text-blue-400"
                : c.context_type === "trip"
                ? "bg-amber-500/15 text-amber-400"
                : "bg-primary/15 text-primary"
            }`}>
              {c.context_type === "task" ? (
                <ClipboardList className="h-4 w-4" />
              ) : c.context_type === "trip" ? (
                <Package className="h-4 w-4" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                  {title}
                </p>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(c.last_message_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className={`text-xs truncate ${hasUnread ? "text-foreground" : "text-muted-foreground"}`}>
                  {c.last_message_preview || "No messages yet"}
                </p>
                {hasUnread && (
                  <span className="flex-shrink-0 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {c.unread_count}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

// ─── New Chat Button (contacts admin users) ───

function NewChatButton({
  driverId,
  driverName,
  adminId,
  onStartChat,
}: {
  driverId: string;
  driverName: string;
  adminId: string;
  onStartChat: (id: string, name: string, type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string; type: string }[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/chat/contacts?adminId=${adminId}`)
      .then((r) => r.json())
      .then((d) => {
        // Map API response fields to component fields
        const raw = d.contacts || [];
        setContacts(raw.map((c: any) => ({
          id: c.user_id || c.id,
          name: c.display_name || c.name || "Unknown",
          type: c.user_type || c.type || "admin",
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, adminId]);

  const filtered = contacts
    .filter((c) => !(c.id === driverId && c.type === "driver"))
    .filter((c) => (c.name || "").toLowerCase().includes(search.toLowerCase()));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-4 w-4" /> New Chat
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-4 max-h-[60vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">New Conversation</h3>
          <button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full bg-muted/30 border border-border/50 rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1 overflow-auto divide-y divide-border/20">
          {loading ? (
            <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No contacts found</p>
          ) : (
            filtered.map((c) => (
              <button
                key={`${c.type}-${c.id}`}
                onClick={() => { onStartChat(c.id, c.name, c.type); setOpen(false); }}
                className="w-full flex items-center gap-3 py-3 px-1 text-left hover:bg-muted/20 transition-colors"
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold ${
                  c.type === "admin" ? "bg-primary/15 text-primary" : "bg-blue-500/15 text-blue-400"
                }`}>
                  {(c.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{c.name || "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{c.type}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
