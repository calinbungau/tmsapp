import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

// GET /api/chat/conversations - List conversations for a user
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const userType = searchParams.get("userType") || "admin";
  const contextType = searchParams.get("contextType"); // 'task', 'order', or null for all
  const contextId = searchParams.get("contextId");
  const limit = parseInt(searchParams.get("limit") || "50");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    // If requesting a specific context conversation (e.g. task chat)
    if (contextType && contextId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("*")
        .eq("context_type", contextType)
        .eq("context_id", contextId)
        .maybeSingle();

      if (conv) {
        // Get participants
        const { data: participants } = await supabase
          .from("conversation_participants")
          .select("*")
          .eq("conversation_id", conv.id);

        // Get unread count for this user
        const myParticipant = (participants || []).find(
          (p: any) => p.user_id === userId && p.user_type === userType
        );
        let unreadCount = 0;
        if (myParticipant) {
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .gt("created_at", myParticipant.last_read_at || "1970-01-01")
            .is("deleted_at", null)
            .neq("sender_id", userId);
          unreadCount = count || 0;
        }

        return NextResponse.json({
          conversation: { ...conv, participants, unread_count: unreadCount },
        });
      }

      return NextResponse.json({ conversation: null });
    }

    // Get all conversation IDs for this user
    const { data: myParticipations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId)
      .eq("user_type", userType);

    if (!myParticipations || myParticipations.length === 0) {
      return NextResponse.json({ conversations: [], total_unread: 0 });
    }

    const convIds = myParticipations.map((p: any) => p.conversation_id);
    const lastReadMap = new Map(
      myParticipations.map((p: any) => [p.conversation_id, p.last_read_at])
    );

    // Fetch conversations
    const { data: conversations } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convIds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    // Fetch all participants for these conversations in one query
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("*")
      .in("conversation_id", convIds);

    // Calculate unread counts per conversation
    const unreadPromises = (conversations || []).map(async (conv: any) => {
      const lastRead = lastReadMap.get(conv.id) || "1970-01-01";
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .gt("created_at", lastRead)
        .is("deleted_at", null)
        .neq("sender_id", userId);
      return { conversation_id: conv.id, count: count || 0 };
    });
    const unreadCounts = await Promise.all(unreadPromises);
    const unreadMap = new Map(unreadCounts.map((u) => [u.conversation_id, u.count]));

    // Enrich conversations
    const enriched = (conversations || []).map((conv: any) => ({
      ...conv,
      participants: (allParticipants || []).filter(
        (p: any) => p.conversation_id === conv.id
      ),
      unread_count: unreadMap.get(conv.id) || 0,
    }));

    const totalUnread = unreadCounts.reduce((sum, u) => sum + u.count, 0);

    return NextResponse.json({ conversations: enriched, total_unread: totalUnread });
  } catch (err: any) {
    console.error("Chat conversations error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/chat/conversations - Create or get a conversation
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const body = await request.json();
    const {
      type, // 'direct', 'task', 'order', 'group'
      context_type, // 'task', 'order', or null
      context_id, // uuid of the task/order
      title,
      created_by_id,
      created_by_type, // 'admin', 'driver'
      created_by_name,
      participants, // [{ user_id, user_type, display_name }]
    } = body;

    if (!created_by_id || !created_by_type || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // For direct chats, check if one already exists between these two users
    if (type === "direct" && participants?.length === 1) {
      const other = participants[0];
      // Find conversations where both users are participants and type is direct
      const { data: myConvs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", created_by_id)
        .eq("user_type", created_by_type);

      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c: any) => c.conversation_id);
        const { data: otherConvs } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", other.user_id)
          .eq("user_type", other.user_type)
          .in("conversation_id", myConvIds);

        if (otherConvs && otherConvs.length > 0) {
          // Check if any of these is a direct conversation
          const { data: existing } = await supabase
            .from("conversations")
            .select("*")
            .eq("type", "direct")
            .in("id", otherConvs.map((c: any) => c.conversation_id))
            .limit(1)
            .maybeSingle();

          if (existing) {
            const { data: parts } = await supabase
              .from("conversation_participants")
              .select("*")
              .eq("conversation_id", existing.id);
            return NextResponse.json({ conversation: { ...existing, participants: parts }, created: false });
          }
        }
      }
    }

    // For context conversations (task/order), check if one already exists
    if (context_type && context_id) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("*")
        .eq("context_type", context_type)
        .eq("context_id", context_id)
        .maybeSingle();

      if (existing) {
        // Add creator as participant if not already
        const { data: existingPart } = await supabase
          .from("conversation_participants")
          .select("id")
          .eq("conversation_id", existing.id)
          .eq("user_id", created_by_id)
          .eq("user_type", created_by_type)
          .maybeSingle();

        if (!existingPart) {
          await supabase.from("conversation_participants").insert({
            conversation_id: existing.id,
            user_id: created_by_id,
            user_type: created_by_type,
            display_name: created_by_name || created_by_type,
            role: "member",
          });
        }

        const { data: parts } = await supabase
          .from("conversation_participants")
          .select("*")
          .eq("conversation_id", existing.id);
        return NextResponse.json({ conversation: { ...existing, participants: parts }, created: false });
      }
    }

    // Create new conversation
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .insert({
        type,
        context_type: context_type || null,
        context_id: context_id || null,
        title: title || null,
        created_by_id,
        created_by_type,
      })
      .select()
      .single();

    if (convError) throw convError;

    // Add creator as participant
    const participantRows = [
      {
        conversation_id: conv.id,
        user_id: created_by_id,
        user_type: created_by_type,
        display_name: created_by_name || created_by_type,
        role: "owner",
      },
    ];

    // Add other participants
    if (participants?.length) {
      for (const p of participants) {
        if (p.user_id !== created_by_id || p.user_type !== created_by_type) {
          participantRows.push({
            conversation_id: conv.id,
            user_id: p.user_id,
            user_type: p.user_type,
            display_name: p.display_name || p.user_type,
            role: "member",
          });
        }
      }
    }

    await supabase.from("conversation_participants").insert(participantRows);

    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("*")
      .eq("conversation_id", conv.id);

    return NextResponse.json({ conversation: { ...conv, participants: parts }, created: true });
  } catch (err: any) {
    console.error("Create conversation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/chat/conversations - Add participant to a conversation
export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const body = await request.json();
    const { conversationId, addParticipant } = body;

    if (!conversationId || !addParticipant) {
      return NextResponse.json({ error: "Missing conversationId or addParticipant" }, { status: 400 });
    }

    const { user_id, user_type, display_name } = addParticipant;

    // Check if already a participant
    const { data: existing } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user_id)
      .eq("user_type", user_type)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, message: "Already a participant" });
    }

    // Add as participant
    await supabase.from("conversation_participants").insert({
      conversation_id: conversationId,
      user_id,
      user_type,
      display_name: display_name || user_type,
      role: "member",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Add participant error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
