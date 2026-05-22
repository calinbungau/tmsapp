"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MessageSquare, Search, Plus, Users, MapPin, ClipboardList,
  User, Loader2, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationView } from "./conversation-view";

interface Conversation {
  id: string;
  type: string;
  context_type: string | null;
  context_id: string | null;
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  participants: Participant[];
  unread_count: number;
}

interface Participant {
  user_id: string;
  user_type: string;
  display_name: string;
}

interface Contact {
  user_id: string;
  user_type: string;
  display_name: string;
  subtitle: string;
}

interface ChatInboxProps {
  currentUserId: string;
  currentUserType: string;
  currentUserName: string;
  adminId: string;
  initialConversationId?: string | null;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

function getConversationIcon(conv: Conversation) {
  if (conv.context_type === "task") return ClipboardList;
  if (conv.context_type === "order") return MapPin;
  if (conv.type === "group") return Users;
  return User;
}

function getConversationTitle(conv: Conversation, currentUserId: string) {
  if (conv.title) return conv.title;
  if (conv.type === "direct") {
    const other = conv.participants.find(
      (p) => p.user_id !== currentUserId
    );
    return other?.display_name || "Direct Message";
  }
  if (conv.context_type === "task") return `Task Chat`;
  return "Conversation";
}

export function ChatInbox({
  currentUserId,
  currentUserType,
  currentUserName,
  adminId,
  initialConversationId,
}: ChatInboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConversationId || null);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        userId: currentUserId,
        userType: currentUserType,
      });
      const res = await fetch(`/api/chat/conversations?${params}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentUserType]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime: listen for conversation updates (new messages update last_message_at)
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("chat-inbox")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          const updated = payload.new as any;
          setConversations((prev) => {
            const exists = prev.find((c) => c.id === updated.id);
            if (!exists) {
              // New conversation we're part of - refetch
              fetchConversations();
              return prev;
            }
            return prev
              .map((c) =>
                c.id === updated.id
                  ? {
                      ...c,
                      last_message_at: updated.last_message_at,
                      last_message_preview: updated.last_message_preview,
                      unread_count:
                        selectedConvId === c.id ? 0 : c.unread_count + 1,
                    }
                  : c
              )
              .sort((a, b) => {
                const aTime = a.last_message_at || a.created_at;
                const bTime = b.last_message_at || b.created_at;
                return new Date(bTime).getTime() - new Date(aTime).getTime();
              });
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, selectedConvId]);

  // When selecting a conversation, reset its unread count
  const selectConversation = (convId: string) => {
    setSelectedConvId(convId);
    setShowNewChat(false);
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
    );
  };

  // New chat: fetch contacts
  const openNewChat = async () => {
    setShowNewChat(true);
    setSelectedConvId(null);
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/chat/contacts?adminId=${adminId}`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setLoadingContacts(false);
    }
  };

  // Start a DM with a contact
  const startDirectChat = async (contact: Contact) => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "direct",
          created_by_id: currentUserId,
          created_by_type: currentUserType,
          created_by_name: currentUserName,
          participants: [
            {
              user_id: contact.user_id,
              user_type: contact.user_type,
              display_name: contact.display_name,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.conversation) {
        if (data.created) {
          setConversations((prev) => [data.conversation, ...prev]);
        }
        selectConversation(data.conversation.id);
      }
    } catch (err) {
      console.error("Failed to start chat:", err);
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedConvId);
  const filteredConversations = searchQuery
    ? conversations.filter((c) => {
        const title = getConversationTitle(c, currentUserId).toLowerCase();
        const preview = (c.last_message_preview || "").toLowerCase();
        const q = searchQuery.toLowerCase();
        return title.includes(q) || preview.includes(q);
      })
    : conversations;

  const filteredContacts = contactSearch
    ? contacts.filter(
        (c) =>
          c.display_name.toLowerCase().includes(contactSearch.toLowerCase()) ||
          c.subtitle.toLowerCase().includes(contactSearch.toLowerCase())
      )
    : contacts;

  // Remove self from contacts
  const availableContacts = filteredContacts.filter(
    (c) => !(c.user_id === currentUserId && c.user_type === currentUserType)
  );

  return (
    <div className="flex h-full bg-background">
      {/* Conversation list - left panel */}
      <div
        className={`${
          selectedConvId ? "hidden md:flex" : "flex"
        } w-full md:w-80 lg:w-96 flex-col border-r border-border/50 flex-shrink-0`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground">Messages</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={openNewChat}
              className="h-8 gap-1.5 text-xs bg-transparent"
            >
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* New chat - contact list */}
          {showNewChat && (
            <div>
              <div className="px-4 pt-3 pb-2">
                <button
                  type="button"
                  onClick={() => setShowNewChat(false)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to conversations
                </button>
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              {loadingContacts && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {availableContacts.map((contact) => (
                <button
                  key={`${contact.user_type}-${contact.user_id}`}
                  type="button"
                  onClick={() => startDirectChat(contact)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      contact.user_type === "driver"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-purple-500/20 text-purple-400"
                    }`}
                  >
                    {contact.display_name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {contact.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.subtitle}
                      {contact.user_type === "driver" && (
                        <span className="ml-1 text-blue-400">Driver</span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
              {!loadingContacts && availableContacts.length === 0 && (
                <p className="text-center py-8 text-sm text-muted-foreground">No contacts found</p>
              )}
            </div>
          )}

          {/* Regular conversation list */}
          {!showNewChat &&
            !loading &&
            filteredConversations.map((conv) => {
              const Icon = getConversationIcon(conv);
              const title = getConversationTitle(conv, currentUserId);
              const isSelected = conv.id === selectedConvId;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => selectConversation(conv.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-border/20 ${
                    isSelected
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      conv.context_type === "task"
                        ? "bg-amber-500/15 text-amber-400"
                        : conv.type === "direct"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-purple-500/15 text-purple-400"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-sm truncate ${
                          conv.unread_count > 0
                            ? "font-bold text-foreground"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {title}
                      </p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p
                        className={`text-xs truncate ${
                          conv.unread_count > 0
                            ? "text-foreground/80"
                            : "text-muted-foreground"
                        }`}
                      >
                        {conv.last_message_preview || "No messages yet"}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="h-5 min-w-[20px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5 flex-shrink-0">
                          {conv.unread_count > 99 ? "99+" : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

          {!showNewChat && !loading && filteredConversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground px-4">
              <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs mt-1 text-center">
                Start a new chat with a driver or team member
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={openNewChat}
                className="mt-4 gap-1.5 bg-transparent"
              >
                <Plus className="h-3.5 w-3.5" /> New Chat
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Conversation view - right panel */}
      <div
        className={`${
          selectedConvId ? "flex" : "hidden md:flex"
        } flex-1 flex-col min-w-0`}
      >
        {selectedConv ? (
          <>
            {/* Conversation header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50">
              <button
                type="button"
                onClick={() => setSelectedConvId(null)}
                className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  selectedConv.context_type === "task"
                    ? "bg-amber-500/15 text-amber-400"
                    : selectedConv.type === "direct"
                    ? "bg-blue-500/15 text-blue-400"
                    : "bg-purple-500/15 text-purple-400"
                }`}
              >
                {(() => {
                  const Icon = getConversationIcon(selectedConv);
                  return <Icon className="h-4 w-4" />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {getConversationTitle(selectedConv, currentUserId)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedConv.participants.length} participant
                  {selectedConv.participants.length !== 1 ? "s" : ""}
                  {selectedConv.context_type && (
                    <span className="ml-1 capitalize">
                      - {selectedConv.context_type} chat
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <ConversationView
                conversationId={selectedConv.id}
                currentUserId={currentUserId}
                currentUserType={currentUserType}
                currentUserName={currentUserName}
                participants={selectedConv.participants}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">Select a conversation</p>
            <p className="text-xs mt-1">
              Choose from the list or start a new chat
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
