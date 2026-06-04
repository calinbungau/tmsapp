import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getServiceClient,
  getOrCreateRecipientConversation,
  type RecipientRow,
} from "@/lib/exchange/portal-auth";
import { sendNotificationToCarrier, NotificationTemplates } from "@/lib/notifications";

/**
 * Dispatcher side of the per-recipient chat. The admin is authenticated via the
 * `x-admin-id` header and must own the recipient row. We reuse the same
 * conversation the carrier portal uses (keyed by recipient id), so messages
 * flow between both sides of the same thread.
 */
async function loadOwnedRecipient(adminId: string, recipientId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("freight_offer_recipients")
    .select(
      "id, offer_id, admin_id, partner_id, carrier_account_id, carrier_name, email, token, pin, " +
        "response, responded_at, quote_amount, quote_currency, quote_message, expires_at, view_count"
    )
    .eq("id", recipientId)
    .eq("admin_id", adminId)
    .maybeSingle();
  return data as RecipientRow | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipientId } = await params;
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const recipient = await loadOwnedRecipient(adminId, recipientId);
  if (!recipient) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const after = searchParams.get("after");
  const svc = getServiceClient();

  const { data: offer } = await svc
    .from("freight_offers")
    .select("reference")
    .eq("id", recipient.offer_id)
    .maybeSingle();

  let conversationId: string;
  try {
    conversationId = await getOrCreateRecipientConversation(
      svc,
      recipient,
      offer?.reference || "offer"
    );
  } catch {
    return NextResponse.json({ messages: [], conversationId: null });
  }

  let query = svc
    .from("messages")
    .select("id, sender_id, sender_type, sender_name, content, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (after) query = query.gt("created_at", after);

  const { data: messages } = await query;

  // Mark the dispatcher participant as read.
  try {
    await svc
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", adminId)
      .eq("user_type", "admin");
  } catch {
    /* non-critical */
  }

  return NextResponse.json({ messages: messages || [], conversationId });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipientId } = await params;
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const recipient = await loadOwnedRecipient(adminId, recipientId);
  if (!recipient) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { content?: string; senderName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const content = (body.content || "").trim();
  if (!content) return NextResponse.json({ error: "empty" }, { status: 400 });

  const svc = getServiceClient();
  const { data: offer } = await svc
    .from("freight_offers")
    .select("reference")
    .eq("id", recipient.offer_id)
    .maybeSingle();

  const conversationId = await getOrCreateRecipientConversation(
    svc,
    recipient,
    offer?.reference || "offer"
  );

  const { data: message, error: msgErr } = await svc
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: adminId,
      sender_type: "admin",
      sender_name: body.senderName || "Dispatcher",
      content,
      message_type: "text",
    })
    .select("id, sender_id, sender_type, sender_name, content, created_at")
    .single();

  if (msgErr) return NextResponse.json({ error: "send_failed" }, { status: 500 });

  // Push the new dispatcher message to the carrier's device(s) (best-effort).
  try {
    const senderName = body.senderName || "Dispatcher";
    const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
    await sendNotificationToCarrier(
      { carrierAccountId: recipient.carrier_account_id, partnerId: recipient.partner_id },
      NotificationTemplates.carrierChatMessage(
        senderName,
        preview,
        recipient.offer_id,
        recipient.id,
        recipient.token
      )
    );
  } catch (e) {
    console.error("[exchange/recipients/messages] carrier push failed", e);
  }

  return NextResponse.json({ message });
}
