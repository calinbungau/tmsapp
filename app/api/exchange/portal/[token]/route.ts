import { NextRequest, NextResponse } from "next/server";
import {
  getServiceClient,
  validateRecipient,
  recordRecipientView,
  getOrCreateRecipientConversation,
  carrierAccountMatchesRecipient,
  linkRecipientToAccount,
} from "@/lib/exchange/portal-auth";

const OFFER_FIELDS =
  "id, reference, title, status, origin_city, origin_country, origin_postal_code, " +
  "dest_city, dest_country, dest_postal_code, load_date_from, load_date_to, " +
  "unload_date_from, unload_date_to, vehicle_type, body_type, weight_kg, ldm, " +
  "pallet_count, adr_class, goods_description, pricing_mode, price_amount, currency, " +
  "payment_terms_days, expires_at, awarded_recipient_id, awarded_at";

// GET /api/exchange/portal/[token] — lightweight meta (no PIN required).
// Reveals only enough to render the PIN gate (carrier name + masked status).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceClient();
  const { ok, error, recipient } = await validateRecipient(supabase, token);

  if (!recipient) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  if (error === "expired") {
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  // Company that posted the offer (for branding on the PIN gate).
  const { data: admin } = await supabase
    .from("admins")
    .select("company_name")
    .eq("id", recipient.admin_id)
    .maybeSingle();

  return NextResponse.json({
    status: "ok",
    needsPin: true,
    carrierName: recipient.carrier_name,
    companyName: admin?.company_name || null,
    hasAccount: !!recipient.carrier_account_id,
    email: recipient.email,
  });
}

// POST /api/exchange/portal/[token] — verify PIN and return the full offer,
// the carrier's current response, the conversation id, and recent messages.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceClient();

  let body: { pin?: string; carrierAccountId?: string; track?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  // A logged-in carrier may pass their account id (from the dashboard session)
  // to skip the PIN. Fall back to the header for flexibility.
  const carrierAccountId =
    body.carrierAccountId || request.headers.get("x-carrier-id") || null;

  // First load the recipient (token + expiry only) so we can decide how to authorize.
  const base = await validateRecipient(supabase, token);
  const recipient = base.recipient;

  if (!recipient || base.error === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (base.error === "expired") {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Authorize via a linked carrier account session, otherwise require the PIN.
  let viaAccount = false;
  if (carrierAccountId) {
    viaAccount = await carrierAccountMatchesRecipient(
      supabase,
      carrierAccountId,
      recipient
    );
  }

  if (!viaAccount) {
    if (String(body.pin ?? "").trim() !== recipient.pin) {
      return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
    }
  } else {
    // Persist the account link so future visits match directly.
    await linkRecipientToAccount(supabase, recipient, carrierAccountId!);
  }

  // Load offer + posting company.
  const { data: offerData } = await supabase
    .from("freight_offers")
    .select(OFFER_FIELDS)
    .eq("id", recipient.offer_id)
    .maybeSingle();

  if (!offerData) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }

  const offer = offerData as unknown as {
    reference: string;
    status: string;
    awarded_recipient_id: string | null;
    [key: string]: unknown;
  };

  const { data: admin } = await supabase
    .from("admins")
    .select("company_name, email, phone")
    .eq("id", recipient.admin_id)
    .maybeSingle();

  // Only count a view on a genuine open (initial unlock / PIN verify).
  // Realtime-triggered background refetches pass track:false to avoid an
  // infinite view-inflation loop (recording a view updates the recipient row,
  // which would re-trigger the realtime subscription and refetch again).
  if (body.track === true) {
    await recordRecipientView(supabase, recipient);
  }

  // Ensure the chat thread exists and load recent messages.
  let conversationId: string | null = null;
  let messages: unknown[] = [];
  try {
    conversationId = await getOrCreateRecipientConversation(
      supabase,
      recipient,
      offer.reference
    );
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, sender_type, sender_name, content, created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100);
    messages = msgs || [];
  } catch (e) {
    console.error("[portal] conversation init failed", e);
  }

  return NextResponse.json({
    offer,
    company: admin || null,
    recipient: {
      id: recipient.id,
      carrierName: recipient.carrier_name,
      email: recipient.email,
      response: recipient.response,
      respondedAt: recipient.responded_at,
      quoteAmount: recipient.quote_amount,
      quoteCurrency: recipient.quote_currency,
      quoteMessage: recipient.quote_message,
      dispatcherDecision: recipient.dispatcher_decision,
      decidedAt: recipient.decided_at,
      // True only when THIS recipient is the one the offer was awarded to.
      isAwarded:
        offer.status === "awarded" &&
        !!offer.awarded_recipient_id &&
        offer.awarded_recipient_id === recipient.id,
      // True when the offer has been awarded to someone (possibly another carrier).
      offerAwarded: offer.status === "awarded" && !!offer.awarded_recipient_id,
      hasAccount: !!recipient.carrier_account_id,
    },
    conversationId,
    messages,
  });
}
