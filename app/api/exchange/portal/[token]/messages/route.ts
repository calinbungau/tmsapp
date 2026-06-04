import { NextRequest, NextResponse } from "next/server";
import {
  getServiceClient,
  validateRecipient,
  getOrCreateRecipientConversation,
} from "@/lib/exchange/portal-auth";
import { createAdminNotification } from "@/lib/admin-notifications";

// GET /api/exchange/portal/[token]/messages?pin=123456&after=ISO
// Poll for the recipient's chat thread.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  const after = searchParams.get("after");
  const supabase = getServiceClient();

  const { ok, error, recipient } = await validateRecipient(supabase, token, pin ?? "");
  if (!recipient || error === "not_found")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (error === "expired") return NextResponse.json({ error: "expired" }, { status: 410 });
  if (error === "invalid_pin")
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });

  const { data: offer } = await supabase
    .from("freight_offers")
    .select("reference")
    .eq("id", recipient.offer_id)
    .maybeSingle();

  let conversationId: string;
  try {
    conversationId = await getOrCreateRecipientConversation(
      supabase,
      recipient,
      offer?.reference || "offer"
    );
  } catch {
    return NextResponse.json({ messages: [], conversationId: null });
  }

  let query = supabase
    .from("messages")
    .select("id, sender_id, sender_type, sender_name, content, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (after) query = query.gt("created_at", after);

  const { data: messages } = await query;

  // Mark the carrier participant as read.
  try {
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", recipient.id)
      .eq("user_type", "carrier");
  } catch {
    /* non-critical */
  }

  return NextResponse.json({ messages: messages || [], conversationId });
}

// POST /api/exchange/portal/[token]/messages
// Body: { pin, content }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceClient();

  let body: { pin?: string; content?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { ok, error, recipient } = await validateRecipient(supabase, token, body.pin ?? "");
  if (!recipient || error === "not_found")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (error === "expired") return NextResponse.json({ error: "expired" }, { status: 410 });
  if (error === "invalid_pin")
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });

  const content = (body.content || "").trim();
  if (!content) return NextResponse.json({ error: "empty" }, { status: 400 });

  const { data: offer } = await supabase
    .from("freight_offers")
    .select("reference")
    .eq("id", recipient.offer_id)
    .maybeSingle();

  const conversationId = await getOrCreateRecipientConversation(
    supabase,
    recipient,
    offer?.reference || "offer"
  );

  const senderName = recipient.carrier_name || recipient.email || "Carrier";
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: recipient.id,
      sender_type: "carrier",
      sender_name: senderName,
      content,
      message_type: "text",
    })
    .select("id, sender_id, sender_type, sender_name, content, created_at")
    .single();

  if (msgErr) return NextResponse.json({ error: "send_failed" }, { status: 500 });

  // Notify the dispatcher (bell + realtime + push).
  try {
    await createAdminNotification({
      adminId: recipient.admin_id,
      targetType: "all",
      notificationType: "chat_message",
      priority: "normal",
      payload: {
        title: `New message from ${senderName}`,
        body: content.length > 80 ? content.slice(0, 80) + "…" : content,
        icon: "message",
        actionUrl: `/admin/tms/exchange/${recipient.offer_id}?chat=${recipient.id}`,
        data: {
          offer_id: recipient.offer_id,
          recipient_id: recipient.id,
          conversation_id: conversationId,
        },
      },
    });
  } catch (e) {
    console.error("[portal/messages] notification failed", e);
  }

  return NextResponse.json({ message });
}
