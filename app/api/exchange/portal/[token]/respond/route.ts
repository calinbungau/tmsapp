import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, authorizeRecipient } from "@/lib/exchange/portal-auth";
import { createAdminNotification } from "@/lib/admin-notifications";

const VALID = new Set(["interested", "quoted", "declined"]);

// POST /api/exchange/portal/[token]/respond
// Body: { pin, response, quoteAmount?, currency?, message? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceClient();

  let body: {
    pin?: string;
    carrierAccountId?: string;
    response?: string;
    quoteAmount?: number | string | null;
    currency?: string;
    message?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { ok, error, recipient } = await authorizeRecipient(supabase, token, {
    pin: body.pin,
    carrierAccountId: body.carrierAccountId,
  });
  if (!recipient || error === "not_found")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (error === "expired") return NextResponse.json({ error: "expired" }, { status: 410 });
  if (error === "invalid_pin")
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });

  const response = String(body.response || "").toLowerCase();

  // ── Withdraw: the carrier cancels their existing response/quote, returning
  // the recipient to the "no response yet" state so they can respond afresh.
  if (response === "withdrawn") {
    // Once the dispatcher has finalized (awarded/declined), the carrier can no
    // longer take it back.
    if (recipient.dispatcher_decision) {
      return NextResponse.json({ error: "locked" }, { status: 409 });
    }
    const nowIso = new Date().toISOString();
    const { error: clearErr } = await supabase
      .from("freight_offer_recipients")
      .update({
        response: null,
        responded_at: null,
        quote_amount: null,
        quote_currency: null,
        quote_message: null,
        counter_status: null,
        counter_amount: null,
        counter_currency: null,
        counter_message: null,
        counter_at: null,
        counter_responded_at: null,
        updated_at: nowIso,
      })
      .eq("id", recipient.id);
    if (clearErr) {
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    const { data: wOffer } = await supabase
      .from("freight_offers")
      .select("reference")
      .eq("id", recipient.offer_id)
      .maybeSingle();
    const wCarrier = recipient.carrier_name || recipient.email || "A carrier";
    try {
      await createAdminNotification({
        adminId: recipient.admin_id,
        targetType: "all",
        notificationType: "freight_offer_response",
        priority: "low",
        payload: {
          title: "Carrier withdrew response",
          body: `${wCarrier} withdrew their response for ${wOffer?.reference || "offer"}.`,
          icon: "route",
          actionUrl: `/admin/tms/exchange/${recipient.offer_id}`,
          data: { offer_id: recipient.offer_id, recipient_id: recipient.id, response: "withdrawn" },
        },
      });
    } catch (e) {
      console.error("[portal/respond] withdraw notification failed", e);
    }
    return NextResponse.json({ success: true, response: null });
  }

  if (!VALID.has(response)) {
    return NextResponse.json({ error: "invalid_response" }, { status: 400 });
  }

  const quoteAmount =
    response === "quoted" && body.quoteAmount != null && body.quoteAmount !== ""
      ? Number(body.quoteAmount)
      : null;
  if (response === "quoted" && (quoteAmount == null || Number.isNaN(quoteAmount))) {
    return NextResponse.json({ error: "invalid_quote" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  // When the carrier submits any fresh response (re-quote / interested / decline)
  // while a dispatcher counter-offer was pending, that counter is superseded.
  const clearStaleCounter =
    recipient.counter_status === "pending"
      ? {
          counter_status: null,
          counter_amount: null,
          counter_currency: null,
          counter_message: null,
          counter_at: null,
          counter_responded_at: null,
        }
      : {};
  const { error: updateErr } = await supabase
    .from("freight_offer_recipients")
    .update({
      response,
      responded_at: nowIso,
      quote_amount: quoteAmount,
      quote_currency: body.currency || "EUR",
      quote_message: body.message?.trim() || null,
      updated_at: nowIso,
      ...clearStaleCounter,
    })
    .eq("id", recipient.id);

  if (updateErr) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Load offer reference for the notification body.
  const { data: offer } = await supabase
    .from("freight_offers")
    .select("reference, currency")
    .eq("id", recipient.offer_id)
    .maybeSingle();

  const carrier = recipient.carrier_name || recipient.email || "A carrier";
  const ref = offer?.reference || "offer";
  const label =
    response === "interested"
      ? `${carrier} is interested in ${ref}`
      : response === "quoted"
        ? `${carrier} quoted ${quoteAmount} ${body.currency || "EUR"} for ${ref}`
        : `${carrier} declined ${ref}`;

  // Dispatcher notification: in-app bell + realtime + web push.
  try {
    await createAdminNotification({
      adminId: recipient.admin_id,
      targetType: "all",
      notificationType: "freight_offer_response",
      priority: response === "declined" ? "low" : "normal",
      payload: {
        title: "Carrier response",
        body: label,
        icon: "route",
        actionUrl: `/admin/tms/exchange/${recipient.offer_id}`,
        data: {
          offer_id: recipient.offer_id,
          recipient_id: recipient.id,
          response,
          quote_amount: quoteAmount,
        },
      },
    });
  } catch (e) {
    console.error("[portal/respond] notification failed", e);
  }

  return NextResponse.json({ success: true, response, quoteAmount });
}
