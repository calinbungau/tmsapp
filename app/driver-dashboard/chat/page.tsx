"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, Search, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { ConversationView } from "@/components/chat/conversation-view";

interface DriverSession {
  id: string;
  name: string;
  admin_id: string;
}

interface Conversation {
  id: string;
  type: string;
  context_type: string | null;
  context_id: string | null;
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  participants: { user_id: string; user_type: string; display_name: string }[];
  unread_count: number;
}

interface Admin {
  id: string;
  name: string;
  email: string;
}

export default function DriverChatPage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (session) setDriver(JSON.parse(session));
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!driver) return;
    try {
      const res = await fetch(`/api/chat/conversations?userId=${driver.id}&userType=driver`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [driver]);

  useEffect(() => {
    if (driver) fetchConversations();
  }, [driver, fetchConversations]);

  // Realtime: update conversation list
  useEffect(() => {
    if (!driver) return;
    const supabase = createClient();
    const channel = supabase
      .channel("driver-chat-inbox")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => {
        fetchConversations();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as any;
        // If it's not from us, refresh
        if (msg.sender_id !== driver.id || msg.sender_type !== "driver") {
          fetchConversations();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driver, fetchConversations]);

  const fetchAdmins = async () => {
    if (!driver) return;
    try {
      const res = await fetch(`/api/chat/contacts?adminId=${driver.admin_id}`);
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch { /* ignore */ }
  };

  const startDM = async (admin: Admin) => {
    if (!driver || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "direct",
          created_by_id: driver.id,
          created_by_type: "driver",
          participants: [
            { user_id: driver.id, user_type: "driver", display_name: driver.name },
            { user_id: admin.id, user_type: "admin", display_name: admin.name },
          ],
        }),
      });
      const data = await res.json();
      if (data.conversation) {
        setSelectedId(data.conversation.id);
        setShowNewChat(false);
        fetchConversations();
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  const getConvoTitle = (c: Conversation) => {
    if (c.title) return c.title;
    const other = c.participants?.find(
      (p) => !(p.user_id === driver?.id && p.user_type === "driver")
    );
    return other?.display_name || "Chat";
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

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const title = getConvoTitle(c).toLowerCase();
    return title.includes(search.toLowerCase());
  });

  // Mobile: show either list or conversation
  if (selectedId) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px-72px)]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-card">
          <button onClick={() => setSelectedId(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="font-semibold text-sm truncate">
            {conversations.find((c) => c.id === selectedId)
              ? getConvoTitle(conversations.find((c) => c.id === selectedId)!)
              : "Chat"}
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <ConversationView
            conversationId={selectedId}
            currentUserId={driver?.id || ""}
            currentUserType="driver"
            currentUserName={driver?.name || "Driver"}
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px-72px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <h1 className="text-lg font-bold">Messages</h1>
        <button
          onClick={() => { setShowNewChat(true); fetchAdmins(); }}
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-6">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Start a chat with an admin</p>
          </div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 border-b border-border/20 ${
                c.unread_count > 0 ? "bg-primary/5" : ""
              }`}
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                {c.context_type === "task" ? (
                  <MessageSquare className="h-5 w-5 text-primary" />
                ) : (
                  <User className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm truncate ${c.unread_count > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                    {getConvoTitle(c)}
                  </p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {timeAgo(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={`text-xs truncate ${c.unread_count > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {c.last_message_preview || "No messages yet"}
                  </p>
                  {c.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground flex-shrink-0">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* New Chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowNewChat(false)}>
          <div
            className="w-full max-w-lg bg-card border-t border-border rounded-t-2xl max-h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <h2 className="font-semibold">New Message</h2>
              <button onClick={() => setShowNewChat(false)} className="text-sm text-muted-foreground">Cancel</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {admins.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No contacts available</div>
              ) : (
                admins.map((admin) => (
                  <button
                    key={admin.id}
                    onClick={() => startDM(admin)}
                    disabled={creating}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{admin.name}</p>
                      <p className="text-xs text-muted-foreground">{admin.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
