import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

// GET /api/chat/driver-task-chats?driverId=xxx
// Returns task conversations for tasks assigned to this driver
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get("driverId");

  if (!driverId) {
    return NextResponse.json({ error: "driverId required" }, { status: 400 });
  }

  try {
    // 1. Find all tasks assigned to this driver (active ones)
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, reference_number, status")
      .eq("driver_id", driverId)
      .not("status", "in", '("completed","cancelled","deleted")');

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const taskIds = tasks.map((t: any) => t.id);
    const taskMap = new Map(tasks.map((t: any) => [t.id, t]));

    // 2. Find conversations bound to these tasks
    const { data: convos } = await supabase
      .from("conversations")
      .select("*")
      .eq("context_type", "task")
      .in("context_id", taskIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (!convos || convos.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    // 3. For each conversation, ensure driver is a participant (auto-add if not)
    const convoIds = convos.map((c: any) => c.id);
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("*")
      .in("conversation_id", convoIds);

    const participantsByConvo = new Map<string, any[]>();
    for (const p of allParticipants || []) {
      const list = participantsByConvo.get(p.conversation_id) || [];
      list.push(p);
      participantsByConvo.set(p.conversation_id, list);
    }

    // Get driver name for auto-adding
    const { data: driver } = await supabase
      .from("drivers")
      .select("name")
      .eq("id", driverId)
      .maybeSingle();

    const enriched = [];
    for (const conv of convos) {
      const parts = participantsByConvo.get(conv.id) || [];
      const isParticipant = parts.some(
        (p: any) => p.user_id === driverId && p.user_type === "driver"
      );

      // Auto-add driver as participant if they're assigned to the task but not in the chat
      if (!isParticipant) {
        const { data: newPart } = await supabase
          .from("conversation_participants")
          .insert({
            conversation_id: conv.id,
            user_id: driverId,
            user_type: "driver",
            display_name: driver?.name || "Driver",
            role: "member",
          })
          .select()
          .single();
        if (newPart) parts.push(newPart);
      }

      // Calculate unread count
      const myPart = parts.find(
        (p: any) => p.user_id === driverId && p.user_type === "driver"
      );
      let unreadCount = 0;
      if (myPart) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .gt("created_at", myPart.last_read_at || "1970-01-01")
          .is("deleted_at", null)
          .neq("sender_id", driverId);
        unreadCount = count || 0;
      }

      const task = taskMap.get(conv.context_id);
      enriched.push({
        ...conv,
        participants: parts,
        unread_count: unreadCount,
        title: conv.title || `Task ${task?.reference_number || ""}`,
        task_status: task?.status,
        task_reference: task?.reference_number,
      });
    }

    return NextResponse.json({ conversations: enriched });
  } catch (err: any) {
    console.error("Driver task chats error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
