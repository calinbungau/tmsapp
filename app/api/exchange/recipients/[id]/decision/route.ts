import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getServiceClient,
  getOrCreateRecipientConversation,
  type RecipientRow,
} from "@/lib/exchange/portal-auth";
import { sendNotificationToCarrier, NotificationTemplates } from "@/lib/notifications";

/**
 * Dispatcher decision on a single carrier response.
 *
 *  - "accept"  -> awards the offer to this carrier: stamps the award columns on
 *                 freight_offers, marks this recipient accepted, and (by default)
 *                 marks all other recipients declined. The offer status becomes
 *                 "awarded".
 *  - "decline" -> marks just this recipient declined (does not touch the award).
 *  - "reopen"  -> clears a previous decision/award (re-opens the offer).
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

  let body: { decision?: "accept" | "decline" | "reopen" } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const decision = body.decision;
  if (!decision || !["accept", "decline", "reopen"].includes(decision)) {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  }

  // Ownership check via the user-scoped client.
  const userClient = await createClient();
  const { data: recipient } = await userClient
    .from("freight_offer_recipients")
    .select(
      "id, offer_id, admin_id, partner_id, carrier_account_id, carrier_name, email, token, pin, " +
        "response, responded_at, quote_amount, quote_currency, quote_message, expires_at, view_count"
    )
    .eq("id", recipientId)
    .eq("admin_id", adminId)
    .maybeSingle();

  if (!recipient) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rec = recipient as unknown as RecipientRow;

  const svc = getServiceClient();
  const nowIso = new Date().toISOString();

  const { data: offer } = await svc
    .from("freight_offers")
    .select("id, reference, order_id, trip_leg_id, price_amount, currency")
    .eq("id", rec.offer_id)
    .maybeSingle();
  const reference = offer?.reference || "offer";

  let systemMessage = "";
  // Info about linked order for client-side FWD creation
  let linkedOrderInfo: { orderId: string; tripLegId?: string } | null = null;

  if (decision === "accept") {
    // Award the offer to this recipient.
    await svc
      .from("freight_offers")
      .update({
        status: "awarded",
        awarded_recipient_id: rec.id,
        awarded_carrier_id: rec.partner_id,
        awarded_at: nowIso,
      })
      .eq("id", rec.offer_id);

    await svc
      .from("freight_offer_recipients")
      .update({ dispatcher_decision: "accepted", decided_at: nowIso })
      .eq("id", rec.id);

    // Mark every other recipient of this offer as declined.
    await svc
      .from("freight_offer_recipients")
      .update({ dispatcher_decision: "declined", decided_at: nowIso })
      .eq("offer_id", rec.offer_id)
      .neq("id", rec.id);

    // ─── Award reflect-back to linked order ───────────────────
    // If this offer was published from an order, write the awarded carrier
    // and cost back to the order/leg so the TMS stays in sync.
    if (offer?.order_id) {
      const carrierCost = rec.quote_amount ?? offer.price_amount ?? null;
      const carrierCurrency = rec.quote_currency ?? offer.currency ?? "EUR";

      if (offer.trip_leg_id) {
        // Update the specific trip leg
        await svc
          .from("trip_legs")
          .update({
            carrier_id: rec.partner_id,
            carrier_cost: carrierCost,
            carrier_currency: carrierCurrency,
            assignment_type: "subcontract",
          })
          .eq("id", offer.trip_leg_id);
      }

      // Always update the order with carrier info
      // Fetch current order to compute margin
      const { data: orderData } = await svc
        .from("orders")
        .select("customer_price, customer_currency")
        .eq("id", offer.order_id)
        .maybeSingle();

      const customerPrice = orderData?.customer_price ?? 0;
      const margin = customerPrice > 0 && carrierCost
        ? ((customerPrice - carrierCost) / customerPrice) * 100
        : null;

      await svc
        .from("orders")
        .update({
          carrier_id: rec.partner_id,
          carrier_cost: carrierCost,
          carrier_currency: carrierCurrency,
          margin,
        })
        .eq("id", offer.order_id);

      // Log to order_activity_log
      await svc.from("order_activity_log").insert({
        order_id: offer.order_id,
        action: "exchange_award",
        performed_by_type: "admin",
        performed_by_id: adminId,
        details: {
          offer_reference: reference,
          carrier_name: rec.carrier_name,
          carrier_id: rec.partner_id,
          carrier_cost: carrierCost,
          carrier_currency: carrierCurrency,
          quote_amount: rec.quote_amount,
          trip_leg_id: offer.trip_leg_id,
        },
      });

      // Set linked order info for client response
      linkedOrderInfo = {
        orderId: offer.order_id,
        tripLegId: offer.trip_leg_id ?? undefined,
      };
    }

    systemMessage = `You have been awarded offer ${reference}. The dispatcher will follow up with the transport order.`;
  } else if (decision === "decline") {
    await svc
      .from("freight_offer_recipients")
      .update({ dispatcher_decision: "declined", decided_at: nowIso })
      .eq("id", rec.id);
    systemMessage = `The dispatcher has declined your response to offer ${reference}.`;
  } else {
    // reopen
    await svc
      .from("freight_offer_recipients")
      .update({ dispatcher_decision: null, decided_at: null })
      .eq("id", rec.id);
    // If this recipient was the awarded one, clear the offer award.
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
  try {
    const conversationId = await getOrCreateRecipientConversation(svc, rec, reference);
    await svc.from("messages").insert({
      conversation_id: conversationId,
      sender_id: adminId,
      sender_type: "admin",
      sender_name: "Dispatcher",
      content: systemMessage,
      message_type: "system",
    });
  } catch (e) {
    console.error("[exchange/decision] system message failed", e);
  }

  // Push the outcome to the carrier's registered device(s) (best-effort).
  try {
    const template =
      decision === "accept"
        ? NotificationTemplates.quoteAccepted(reference, rec.offer_id, rec.token)
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
