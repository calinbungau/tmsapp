import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrCreateRecipientConversation,
  type RecipientRow,
} from "@/lib/exchange/portal-auth";

export interface OfferRow {
  id: string;
  reference: string | null;
  order_id: string | null;
  trip_leg_id: string | null;
  price_amount: number | null;
  currency: string | null;
}

export interface AwardResult {
  linkedOrderInfo: { orderId: string; tripLegId?: string } | null;
}

/**
 * Award a freight offer to a single recipient and reflect the result back to
 * the linked transport order / trip leg. This is the single source of truth for
 * "this carrier won the load" and is used both when the dispatcher clicks
 * Accept and when a carrier accepts the dispatcher's counter-offer.
 *
 * `carrierCostOverride` lets the caller pin the awarded cost (e.g. the agreed
 * counter-offer amount). When omitted we fall back to the carrier's quote and
 * then the offer's posted price.
 */
export async function awardOfferToRecipient(
  svc: SupabaseClient,
  rec: RecipientRow,
  offer: OfferRow,
  opts: {
    actorType: "admin" | "carrier";
    actorId: string | null;
    carrierCostOverride?: number | null;
    activityAction?: string;
  }
): Promise<AwardResult> {
  const nowIso = new Date().toISOString();
  const reference = offer.reference || "offer";

  // Stamp the award columns on the offer.
  await svc
    .from("freight_offers")
    .update({
      status: "awarded",
      awarded_recipient_id: rec.id,
      awarded_carrier_id: rec.partner_id,
      awarded_at: nowIso,
    })
    .eq("id", offer.id);

  // Mark this recipient accepted, every other recipient declined.
  await svc
    .from("freight_offer_recipients")
    .update({ dispatcher_decision: "accepted", decided_at: nowIso })
    .eq("id", rec.id);

  await svc
    .from("freight_offer_recipients")
    .update({ dispatcher_decision: "declined", decided_at: nowIso })
    .eq("offer_id", offer.id)
    .neq("id", rec.id);

  let linkedOrderInfo: { orderId: string; tripLegId?: string; carrierId?: string | null } | null = null;

  // ─── Award reflect-back to the linked order ───────────────────
  if (offer.order_id) {
    const carrierCost =
      opts.carrierCostOverride ?? rec.quote_amount ?? offer.price_amount ?? null;
    const carrierCurrency =
      rec.counter_currency ?? rec.quote_currency ?? offer.currency ?? "EUR";

    if (offer.trip_leg_id) {
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

    const { data: orderData } = await svc
      .from("orders")
      .select("customer_price")
      .eq("id", offer.order_id)
      .maybeSingle();

    const customerPrice = orderData?.customer_price ?? 0;
    const margin =
      customerPrice > 0 && carrierCost
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

    await svc.from("order_activity_log").insert({
      order_id: offer.order_id,
      action: opts.activityAction || "exchange_award",
      performed_by_type: opts.actorType,
      performed_by_id: opts.actorId,
      details: {
        offer_reference: reference,
        carrier_name: rec.carrier_name,
        carrier_id: rec.partner_id,
        carrier_cost: carrierCost,
        carrier_currency: carrierCurrency,
        quote_amount: rec.quote_amount,
        counter_amount: rec.counter_amount,
        trip_leg_id: offer.trip_leg_id,
      },
    });

    linkedOrderInfo = {
      orderId: offer.order_id,
      tripLegId: offer.trip_leg_id ?? undefined,
      carrierId: rec.partner_id ?? null,
    };
  }

  return { linkedOrderInfo };
}

/** Post a system message into the carrier's per-recipient chat thread. */
export async function postRecipientSystemMessage(
  svc: SupabaseClient,
  rec: RecipientRow,
  reference: string,
  senderId: string,
  senderType: "admin" | "carrier",
  senderName: string,
  content: string
): Promise<void> {
  try {
    const conversationId = await getOrCreateRecipientConversation(svc, rec, reference);
    await svc.from("messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
      sender_type: senderType,
      sender_name: senderName,
      content,
      message_type: "system",
    });
  } catch (e) {
    console.error("[exchange/award] system message failed", e);
  }
}
