"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatInbox } from "@/components/chat/chat-inbox";
import { Loader2 } from "lucide-react";

export default function AdminChatPage() {
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get("c");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (stored) {
      setSession(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <p className="text-muted-foreground">Please log in to access chat.</p>
      </div>
    );
  }

  // Determine current user identity
  const currentUserId = session.user_id || session.id;
  const currentUserType = "admin";
  const currentUserName = session.email?.split("@")[0] || "Admin";
  const adminId = session.user_id ? session.id : session.id; // admins table id

  return (
    <div className="h-[calc(100vh-64px)] -m-6 border border-border/30 rounded-xl overflow-hidden bg-background">
      <ChatInbox
        currentUserId={currentUserId}
        currentUserType={currentUserType}
        currentUserName={currentUserName}
        adminId={adminId}
        initialConversationId={initialConvId}
      />
    </div>
  );
}
