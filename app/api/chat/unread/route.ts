import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

// GET /api/chat/unread - Get total unread count for badge
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const userType = searchParams.get("userType") || "admin";

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    // Get all conversations this user is part of
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId)
      .eq("user_type", userType);

    if (!participations || participations.length === 0) {
      return NextResponse.json({ total_unread: 0, per_conversation: {} });
    }

    const perConversation: Record<string, number> = {};
    let totalUnread = 0;

    // Count unread messages per conversation
    await Promise.all(
      participations.map(async (p: any) => {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", p.conversation_id)
          .gt("created_at", p.last_read_at || "1970-01-01")
          .is("deleted_at", null)
          .neq("sender_id", userId);

        const unread = count || 0;
        if (unread > 0) {
          perConversation[p.conversation_id] = unread;
          totalUnread += unread;
        }
      })
    );

    return NextResponse.json({ total_unread: totalUnread, per_conversation: perConversation });
  } catch (err: any) {
    console.error("Unread count error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/chat/unread - Mark conversation as read
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const body = await request.json();
    const { conversation_id, user_id, user_type = "admin" } = body;

    if (!conversation_id || !user_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversation_id)
      .eq("user_id", user_id)
      .eq("user_type", user_type);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
