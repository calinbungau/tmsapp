import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getServiceClient,
  type RecipientRow,
} from "@/lib/exchange/portal-auth";
import {
  awardOfferToRecipient,
  postRecipientSystemMessage,
  type OfferRow,
} from "@/lib/exchange/award";
import { sendNotificationToCarrier, NotificationTemplates } from "@/lib/notifications";

/**
 * Dispatcher decision on a single carrier response.
 *
 *  - "accept"  -> awards the offer to this carrier at their quoted price.
 *  - "decline" -> marks just this recipient declined.
 *  - "counter" -> sends a counter-offer (a different price) back to the carrier.
 *                 The carrier can then accept / decline / re-quote. No award yet.
 *  - "reopen"  -> clears a previous decision/award/counter (re-opens the offer).
 *
 * A system message is posted into the carrier's chat thread so they see the
 * outcome immediately in the portal / app (which both poll the conversation).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipientId } = await params;
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    decision?: "accept" | "decline" | "counter" | "reopen";
    counterAmount?: number | string | null;
    counterCurrency?: string;
    counterMessage?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const decision = body.decision;
  if (!decision || !["accept", "decline", "counter", "reopen"].includes(decision)) {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  }

  // Ownership check via the user-scoped client.
  const userClient = await createClient();
  const { data: recipient } = await userClient
    .from("freight_offer_recipients")
    .select(
      "id, offer_id, admin_id, partner_id, carrier_account_id, carrier_name, email, token, pin, " +
        "response, responded_at, quote_amount, quote_currency, quote_message, dispatcher_decision, decided_at, " +
        "counter_amount, counter_currency, counter_message, counter_at, counter_status, counter_responded_at, " +
        "expires_at, view_count"
    )
    .eq("id", recipientId)
    .eq("admin_id", adminId)
    .maybeSingle();

  if (!recipient) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rec = recipient as unknown as RecipientRow;

  const svc = getServiceClient();
  const nowIso = new Date().toISOString();

  const { data: offerData } = await svc
    .from("freight_offers")
    .select("id, reference, order_id, trip_leg_id, price_amount, currency")
    .eq("id", rec.offer_id)
    .maybeSingle();
  const offer = (offerData as OfferRow) || null;
  const reference = offer?.reference || "offer";

  let systemMessage = "";
  let linkedOrderInfo: { orderId: string; tripLegId?: string; carrierId?: string | null } | null = null;

  if (decision === "accept") {
    const result = await awardOfferToRecipient(svc, rec, offer!, {
      actorType: "admin",
      actorId: adminId,
    });
    linkedOrderInfo = result.linkedOrderInfo;
    systemMessage = `You have been awarded offer ${reference}. The dispatcher will follow up with the transport order.`;
  } else if (decision === "counter") {
    // Send a counter-offer back to the carrier. Validate the amount.
    const counterAmount =
      body.counterAmount != null && body.counterAmount !== ""
        ? Number(body.counterAmount)
        : null;
    if (counterAmount == null || Number.isNaN(counterAmount) || counterAmount <= 0) {
      return NextResponse.json({ error: "invalid_counter" }, { status: 400 });
    }
    const counterCurrency = body.counterCurrency || rec.quote_currency || offer?.currency || "EUR";
    await svc
      .from("freight_offer_recipients")
      .update({
        counter_amount: counterAmount,
        counter_currency: counterCurrency,
        counter_message: body.counterMessage?.trim() || null,
        counter_at: nowIso,
        counter_status: "pending",
        counter_responded_at: null,
        // A counter is a live negotiation: ensure no stale decision blocks it.
        dispatcher_decision: null,
        decided_at: null,
        updated_at: nowIso,
      })
      .eq("id", rec.id);
    systemMessage = `The dispatcher sent you a counter-offer of ${counterAmount} ${counterCurrency} for offer ${reference}.${
      body.counterMessage?.trim() ? ` "${body.counterMessage.trim()}"` : ""
    } Open the offer to accept, decline, or send a new quote.`;
  } else if (decision === "decline") {
    await svc
      .from("freight_offer_recipients")
      .update({ dispatcher_decision: "declined", decided_at: nowIso })
      .eq("id", rec.id);
    systemMessage = `The dispatcher has declined your response to offer ${reference}.`;
  } else {
    // reopen — clear decision and any active counter-offer.
    await svc
      .from("freight_offer_recipients")
      .update({
        dispatcher_decision: null,
        decided_at: null,
        counter_amount: null,
        counter_currency: null,
        counter_message: null,
        counter_at: null,
        counter_status: null,
        counter_responded_at: null,
      })
      .eq("id", rec.id);
    const { data: off } = await svc
      .from("freight_offers")
      .select("awarded_recipient_id")
      .eq("id", rec.offer_id)
      .maybeSingle();
    if (off?.awarded_recipient_id === rec.id) {
      await svc
        .from("freight_offers")
        .update({
          status: "published",
          awarded_recipient_id: null,
          awarded_carrier_id: null,
          awarded_at: null,
        })
        .eq("id", rec.offer_id);
    }
    systemMessage = `The dispatcher has re-opened offer ${reference}.`;
  }

  // Post a system message into the carrier's chat thread (best-effort).
  await postRecipientSystemMessage(svc, rec, reference, adminId, "admin", "Dispatcher", systemMessage);

  // Push the outcome to the carrier's registered device(s) (best-effort).
  try {
    const template =
      decision === "accept"
        ? NotificationTemplates.quoteAccepted(reference, rec.offer_id, rec.token)
        : decision === "counter"
        ? NotificationTemplates.counterOffer(reference, rec.offer_id, rec.token)
        : decision === "decline"
        ? NotificationTemplates.quoteDeclined(reference, rec.offer_id, rec.token)
        : NotificationTemplates.offerReopened(reference, rec.offer_id, rec.token);
    await sendNotificationToCarrier(
      { carrierAccountId: rec.carrier_account_id, partnerId: rec.partner_id },
      template
    );
  } catch (e) {
    console.error("[exchange/decision] carrier push failed", e);
  }

  return NextResponse.json({ ok: true, decision, linkedOrderInfo });
}
