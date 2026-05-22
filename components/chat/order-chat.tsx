"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { ConversationView } from "./conversation-view";

interface OrderChatProps {
  orderId: string;
  orderReference: string;
  currentUserId: string;
  currentUserType: string;
  currentUserName: string;
  driverId?: string | null;
  driverName?: string | null;
}

export function OrderChat({
  orderId,
  orderReference,
  currentUserId,
  currentUserType,
  currentUserName,
  driverId,
  driverName,
}: OrderChatProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ user_id: string; user_type: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initConversation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check if conversation already exists for this order
      const checkParams = new URLSearchParams({
        userId: currentUserId,
        userType: currentUserType,
        contextType: "order",
        contextId: orderId,
      });
      const checkRes = await fetch(`/api/chat/conversations?${checkParams}`);
      const checkData = await checkRes.json();

      if (checkData.conversation) {
        setConversationId(checkData.conversation.id);
        setParticipants(checkData.conversation.participants || []);
        setLoading(false);
        return;
      }

      // Create new order conversation
      const participantsList: { user_id: string; user_type: string; display_name: string }[] = [];
      if (driverId && driverName) {
        participantsList.push({ user_id: driverId, user_type: "driver", display_name: driverName });
      }

      const createRes = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order",
          context_type: "order",
          context_id: orderId,
          title: orderReference,
          created_by_id: currentUserId,
          created_by_type: currentUserType,
          created_by_name: currentUserName,
          participants: participantsList,
        }),
      });
      const createData = await createRes.json();

      if (createData.conversation) {
        setConversationId(createData.conversation.id);
        setParticipants(createData.conversation.participants || []);
      } else {
        setError("Failed to create conversation");
      }
    } catch (err) {
      console.error("Failed to init order chat:", err);
      setError("Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [orderId, currentUserId, currentUserType, currentUserName, driverId, driverName, orderReference]);

  useEffect(() => { initConversation(); }, [initConversation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">{error}</p>
        <button type="button" onClick={initConversation} className="text-xs text-primary hover:underline mt-2">Retry</button>
      </div>
    );
  }

  if (!conversationId) return null;

  return (
    <div className="h-full flex flex-col">
      <ConversationView
        conversationId={conversationId}
        currentUserId={currentUserId}
        currentUserType={currentUserType}
        currentUserName={currentUserName}
        participants={participants}
        compact
      />
    </div>
  );
}
