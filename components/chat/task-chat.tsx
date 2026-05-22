"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { ConversationView } from "./conversation-view";

interface Participant {
  user_id: string;
  user_type: string;
  display_name: string;
}

interface TaskChatProps {
  taskId: string;
  taskReference: string;
  currentUserId: string;
  currentUserType: string;
  currentUserName: string;
  driverId?: string | null;
  driverName?: string | null;
}

export function TaskChat({
  taskId,
  taskReference,
  currentUserId,
  currentUserType,
  currentUserName,
  driverId,
  driverName,
}: TaskChatProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get or create the task conversation
  const initConversation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First check if conversation already exists for this task
      const checkParams = new URLSearchParams({
        userId: currentUserId,
        userType: currentUserType,
        contextType: "task",
        contextId: taskId,
      });
      const checkRes = await fetch(`/api/chat/conversations?${checkParams}`);
      const checkData = await checkRes.json();

      if (checkData.conversation) {
        setConversationId(checkData.conversation.id);
        setParticipants(checkData.conversation.participants || []);
        setLoading(false);
        return;
      }

      // Create new task conversation
      const participantsList: { user_id: string; user_type: string; display_name: string }[] = [];

      // Add driver if assigned
      if (driverId && driverName) {
        participantsList.push({
          user_id: driverId,
          user_type: "driver",
          display_name: driverName,
        });
      }

      const createRes = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "task",
          context_type: "task",
          context_id: taskId,
          title: `${taskReference}`,
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
      console.error("Failed to init task chat:", err);
      setError("Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, currentUserType, currentUserName, driverId, driverName, taskReference]);

  useEffect(() => {
    initConversation();
  }, [initConversation]);

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
        <button
          type="button"
          onClick={initConversation}
          className="text-xs text-primary hover:underline mt-2"
        >
          Retry
        </button>
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
