import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, authorizeRecipient } from "@/lib/exchange/portal-auth";
import {
  awardOfferToRecipient,
  postRecipientSystemMessage,
  type OfferRow,
} from "@/lib/exchange/award";
import { createAdminNotification } from "@/lib/admin-notifications";

/**
 * Carrier responds to a dispatcher's counter-offer from the portal.
 *
 * Body: { pin?, carrierAccountId?, action: "accept" | "decline" }
 *
 *  - "accept"  -> the offer is immediately AWARDED to this carrier at the
 *                 counter price (auto-award). All other recipients are declined.
 *  - "decline" -> the counter is marked declined; the negotiation stays open so
 *                 the carrier can still send a new quote or chat.
 *
 * Re-quoting after a counter is handled by the normal /respond route, which we
 * also update to clear an active counter so the dispatcher sees the new quote.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceClient();

  let body: { pin?: string; carrierAccountId?: string; action?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { error, recipient } = await authorizeRecipient(supabase, token, {
    pin: body.pin,
    carrierAccountId: body.carrierAccountId,
  });
  if (!recipient || error === "not_found")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (error === "expired") return NextResponse.json({ error: "expired" }, { status: 410 });
  if (error === "invalid_pin")
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });

  const action = String(body.action || "").toLowerCase();
  if (!["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  // There must be a live counter-offer to respond to.
  if (recipient.counter_status !== "pending" || recipient.counter_amount == null) {
    return NextResponse.json({ error: "no_active_counter" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { data: offerData } = await supabase
    .from("freight_offers")
    .select("id, reference, order_id, trip_leg_id, price_amount, currency")
    .eq("id", recipient.offer_id)
    .maybeSingle();
  const offer = (offerData as OfferRow) || null;
  const reference = offer?.reference || "offer";
  const carrier = recipient.carrier_name || recipient.email || "A carrier";
  const counterStr = `${recipient.counter_amount} ${recipient.counter_currency || "EUR"}`;

  let systemMessage = "";
  let linkedOrderInfo: { orderId: string; tripLegId?: string } | null = null;

  if (action === "accept") {
    // Persist the agreed counter as the carrier's quote, mark counter accepted.
    await supabase
      .from("freight_offer_recipients")
      .update({
        counter_status: "accepted",
        counter_responded_at: nowIso,
        response: "quoted",
        quote_amount: recipient.counter_amount,
        quote_currency: recipient.counter_currency || offer?.currency || "EUR",
        responded_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", recipient.id);

    // Re-read so the award helper sees the agreed amounts.
    recipient.response = "quoted";
    recipient.quote_amount = recipient.counter_amount;
    recipient.quote_currency = recipient.counter_currency;

    // Auto-award at the counter price.
    const result = await awardOfferToRecipient(supabase, recipient, offer!, {
      actorType: "carrier",
      actorId: recipient.carrier_account_id,
      carrierCostOverride: recipient.counter_amount,
      activityAction: "exchange_award_counter",
    });
    linkedOrderInfo = result.linkedOrderInfo;
    systemMessage = `${carrier} accepted the counter-offer of ${counterStr}. The offer is now awarded.`;
  } else {
    // Decline: close the counter but keep the negotiation open.
    await supabase
      .from("freight_offer_recipients")
      .update({
        counter_status: "declined",
        counter_responded_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", recipient.id);
    systemMessage = `${carrier} declined the counter-offer of ${counterStr}.`;
  }

  // System message into the shared thread (best-effort).
  await postRecipientSystemMessage(
    supabase,
    recipient,
    reference,
    recipient.id,
    "carrier",
    carrier,
    systemMessage
  );

  // Notify the dispatcher (in-app bell + realtime + web push).
  try {
    await createAdminNotification({
      adminId: recipient.admin_id,
      targetType: "all",
      notificationType:
        action === "accept" ? "freight_offer_counter_accepted" : "freight_offer_counter_declined",
      priority: action === "accept" ? "high" : "normal",
      payload: {
        title: action === "accept" ? "Counter-offer accepted" : "Counter-offer declined",
        body:
          action === "accept"
            ? `${carrier} accepted your counter-offer of ${counterStr} for ${reference}.`
            : `${carrier} declined your counter-offer of ${counterStr} for ${reference}.`,
        icon: "route",
        actionUrl: `/admin/tms/exchange/${recipient.offer_id}`,
        data: {
          offer_id: recipient.offer_id,
          recipient_id: recipient.id,
          counter_status: action === "accept" ? "accepted" : "declined",
          counter_amount: recipient.counter_amount,
        },
      },
    });
  } catch (e) {
    console.error("[portal/counter] notification failed", e);
  }

  return NextResponse.json({ success: true, action, linkedOrderInfo });
}
