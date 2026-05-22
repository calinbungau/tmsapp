"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { ConversationView } from "./conversation-view";

interface TripChatProps {
  tripId: string;
  tripReference: string;
  currentUserId: string;
  currentUserType: "admin" | "driver";
  currentUserName: string;
  driverId?: string | null;
  driverName?: string | null;
}

/**
 * TripChat: A chat component bound to a trip (context_type: 'trip').
 * Reuses the generic ConversationView for rendering messages.
 * 
 * For Admin: Creates/joins conversation with driver as participant
 * For Driver: Joins existing conversation created by admin
 */
export function TripChat({
  tripId,
  tripReference,
  currentUserId,
  currentUserType,
  currentUserName,
  driverId,
  driverName,
}: TripChatProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ user_id: string; user_type: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initConversation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check if conversation already exists for this trip
      const checkParams = new URLSearchParams({
        userId: currentUserId,
        userType: currentUserType,
        contextType: "trip",
        contextId: tripId,
      });
      const checkRes = await fetch(`/api/chat/conversations?${checkParams}`);
      const checkData = await checkRes.json();

      if (checkData.conversation) {
        setConversationId(checkData.conversation.id);
        setParticipants(checkData.conversation.participants || []);
        
        // If driver is accessing but not yet a participant, add them
        if (currentUserType === "driver") {
          const isParticipant = (checkData.conversation.participants || []).some(
            (p: any) => p.user_id === currentUserId && p.user_type === "driver"
          );
          if (!isParticipant) {
            await fetch("/api/chat/conversations", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversationId: checkData.conversation.id,
                addParticipant: {
                  user_id: currentUserId,
                  user_type: "driver",
                  display_name: currentUserName,
                },
              }),
            });
          }
        }
        
        setLoading(false);
        return;
      }

      // Create new trip conversation
      const participantsList: { user_id: string; user_type: string; display_name: string }[] = [];
      
      // If admin is creating and driver exists, add driver as participant
      if (currentUserType === "admin" && driverId && driverName) {
        participantsList.push({ user_id: driverId, user_type: "driver", display_name: driverName });
      }
      
      // If driver is creating (rare), they are added automatically by the API

      const createRes = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trip",
          context_type: "trip",
          context_id: tripId,
          title: tripReference,
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
      console.error("Failed to init trip chat:", err);
      setError("Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [tripId, currentUserId, currentUserType, currentUserName, driverId, driverName, tripReference]);

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
