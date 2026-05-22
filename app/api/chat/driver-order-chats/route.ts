import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/chat/driver-order-chats?driverId=xxx
// Returns trip conversations for trips assigned to this driver.
// Each trip carries one or more orders, so we display the linked order
// references in the conversation title (e.g. "Trip TRP-… - TMS-180, TMS-181").
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get("driverId");

  if (!driverId) {
    return NextResponse.json({ error: "driverId required" }, { status: 400 });
  }

  try {
    // 1. Find all active trips assigned to this driver
    const { data: trips } = await supabase
      .from("trips")
      .select("id, reference_number, status")
      .eq("driver_id", driverId)
      .not("status", "in", '("completed","cancelled","deleted")');

    if (!trips || trips.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const tripIds = trips.map((t: any) => t.id);
    const tripMap = new Map(trips.map((t: any) => [t.id, t]));

    // 2. Pull linked order references per trip for nicer titles
    const { data: tripOrders } = await supabase
      .from("trip_orders")
      .select("trip_id, order:orders(reference_number)")
      .in("trip_id", tripIds);

    const ordersByTrip = new Map<string, string[]>();
    for (const to of tripOrders || []) {
      const ref = (to as any).order?.reference_number;
      if (!ref) continue;
      const list = ordersByTrip.get((to as any).trip_id) || [];
      list.push(ref);
      ordersByTrip.set((to as any).trip_id, list);
    }

    // 3. Find conversations bound to these trips
    const { data: convos } = await supabase
      .from("conversations")
      .select("*")
      .eq("context_type", "trip")
      .in("context_id", tripIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (!convos || convos.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    // 4. For each conversation, ensure driver is a participant + compute unread
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

      // Auto-add driver if they own the trip but aren't in the chat yet
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

      const trip = tripMap.get(conv.context_id);
      const orderRefs = ordersByTrip.get(conv.context_id) || [];
      const title =
        conv.title ||
        (orderRefs.length > 0
          ? orderRefs.join(", ")
          : `Trip ${trip?.reference_number || ""}`);

      enriched.push({
        ...conv,
        participants: parts,
        unread_count: unreadCount,
        title,
        trip_status: trip?.status,
        trip_reference: trip?.reference_number,
        order_references: orderRefs,
      });
    }

    return NextResponse.json({ conversations: enriched });
  } catch (err: any) {
    console.error("Driver order chats error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
