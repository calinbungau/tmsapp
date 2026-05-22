import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/chat/messages - Get messages for a conversation (paginated)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  const limit = parseInt(searchParams.get("limit") || "50");
  const before = searchParams.get("before"); // cursor for pagination (created_at)
  const userId = searchParams.get("userId");
  const userType = searchParams.get("userType") || "admin";

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  try {
    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    // Mark as read: update last_read_at for this participant
    if (userId && messages && messages.length > 0) {
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .eq("user_type", userType);
    }

    return NextResponse.json({
      messages: (messages || []).reverse(), // Return in chronological order
      has_more: (messages || []).length === limit,
    });
  } catch (err: any) {
    console.error("Chat messages error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/chat/messages - Send a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      conversation_id,
      sender_id,
      sender_type,
      sender_name,
      content,
      message_type = "text",
      metadata,
      reply_to_id,
    } = body;

    if (!conversation_id || !sender_id || !sender_type || !content?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Resolve sender name if not provided
    let resolvedName = sender_name;
    if (!resolvedName) {
      if (sender_type === "admin") {
        const { data: admin } = await supabase.from("admins").select("name").eq("id", sender_id).single();
        resolvedName = admin?.name || "Admin";
      } else if (sender_type === "driver") {
        const { data: driver } = await supabase.from("drivers").select("name").eq("id", sender_id).single();
        resolvedName = driver?.name || "Driver";
      } else {
        resolvedName = sender_type;
      }
    }

    // Insert message
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        sender_id,
        sender_type,
        sender_name: resolvedName,
        content: content.trim(),
        message_type,
        metadata: metadata || null,
        reply_to_id: reply_to_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Update sender's last_read_at (they've seen their own message)
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversation_id)
      .eq("user_id", sender_id)
      .eq("user_type", sender_type);

    // Note: The DB trigger `update_conversation_last_message` automatically
    // updates conversations.last_message_at and last_message_preview

    // Create notifications for other participants
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id, user_type, display_name, muted")
      .eq("conversation_id", conversation_id);

    // Get conversation for context info
    const { data: conversation } = await supabase
      .from("conversations")
      .select("type, context_type, context_id, title")
      .eq("id", conversation_id)
      .single();

    if (participants) {
      const notifyParticipants = participants.filter(
        (p: any) => !(p.user_id === sender_id && p.user_type === sender_type) && !p.muted
      );

      // Resolve the company admin_id (FK to admins table) - needed for notifications
      let companyAdminId: string | null = null;
      if (sender_type === "admin") {
        // Check if sender_id IS an admins table ID
        const { data: adminCheck } = await supabase.from("admins").select("id").eq("id", sender_id).maybeSingle();
        if (adminCheck) {
          companyAdminId = adminCheck.id;
        } else {
          // sender_id is a users table ID - look up their admin_id
          const { data: userCheck } = await supabase.from("users").select("admin_id").eq("id", sender_id).maybeSingle();
          companyAdminId = userCheck?.admin_id || null;
        }
      } else if (sender_type === "driver") {
        // Driver - look up their admin_id from drivers table
        const { data: driverCheck } = await supabase.from("drivers").select("admin_id").eq("id", sender_id).maybeSingle();
        companyAdminId = driverCheck?.admin_id || null;
      }

      // Build notification entries for the existing notification system
      for (const p of notifyParticipants) {
        // Only create notifications for admin/user types (drivers get push separately)
        if (p.user_type === "admin") {
          try {
            const actionUrl = conversation?.context_type === "task"
              ? `/admin/fsm/tasks?chat=${conversation_id}`
              : conversation?.context_type === "order"
              ? `/admin/tms/orders?chat=${conversation_id}`
              : `/admin/chat?c=${conversation_id}`;

            const preview = content.trim().length > 80
              ? content.trim().substring(0, 80) + "..."
              : content.trim();

            if (!companyAdminId) continue; // Can't create notification without valid admin FK

            // Insert into notifications table + user_notifications junction
            const { data: notif } = await supabase
              .from("notifications")
              .insert({
                admin_id: companyAdminId,
                title: `New message from ${resolvedName || sender_type}`,
                body: preview,
                notification_type: "chat_message",
                priority: "normal",
                action_url: actionUrl,
                target_type: "user",
                target_id: p.user_id,
                data: {
                  conversation_id,
                  sender_id,
                  sender_type,
                  context_type: conversation?.context_type,
                  context_id: conversation?.context_id,
                },
              })
              .select("id")
              .single();

            if (notif) {
              await supabase.from("user_notifications").insert({
                notification_id: notif.id,
                user_id: p.user_id,
              });
            }
          } catch {
            // Non-critical - don't fail message send if notification fails
          }
        }
      }
    }

    return NextResponse.json({ message });
  } catch (err: any) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
