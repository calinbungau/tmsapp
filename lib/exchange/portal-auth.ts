import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface RecipientRow {
  id: string;
  offer_id: string;
  admin_id: string;
  partner_id: string | null;
  carrier_account_id: string | null;
  carrier_name: string | null;
  email: string | null;
  token: string;
  pin: string;
  response: string | null;
  responded_at: string | null;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_message: string | null;
  expires_at: string | null;
  view_count: number;
}

export type ValidateError = "not_found" | "expired" | "invalid_pin";

export interface ValidateResult {
  ok: boolean;
  error?: ValidateError;
  recipient?: RecipientRow;
}

/**
 * Validate a recipient token, and optionally its PIN. When `pin` is provided it
 * must match. Expiry is enforced. This is the single gate for every portal
 * action; the token is an unguessable secret and the PIN adds protection if a
 * link is forwarded.
 */
export async function validateRecipient(
  supabase: SupabaseClient,
  token: string,
  pin?: string | null
): Promise<ValidateResult> {
  const { data: recipient } = await supabase
    .from("freight_offer_recipients")
    .select(
      "id, offer_id, admin_id, partner_id, carrier_account_id, carrier_name, email, token, pin, " +
        "response, responded_at, quote_amount, quote_currency, quote_message, expires_at, view_count"
    )
    .eq("token", token)
    .maybeSingle();

  if (!recipient) return { ok: false, error: "not_found" };

  const rec = recipient as RecipientRow;

  if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "expired", recipient: rec };
  }

  if (pin != null) {
    if (String(pin).trim() !== rec.pin) {
      return { ok: false, error: "invalid_pin", recipient: rec };
    }
  }

  return { ok: true, recipient: rec };
}

/** Record a view (first + last + counter) for a recipient. Best-effort. */
export async function recordRecipientView(
  supabase: SupabaseClient,
  rec: RecipientRow
): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    await supabase
      .from("freight_offer_recipients")
      .update({
        last_viewed_at: nowIso,
        view_count: (rec.view_count || 0) + 1,
        ...(rec.view_count ? {} : { first_viewed_at: nowIso }),
      })
      .eq("id", rec.id);
  } catch {
    // non-critical
  }
}

/**
 * Get (or lazily create) the per-recipient conversation between the carrier and
 * the dispatcher about this offer. Scoped by recipient so each carrier has its
 * own private thread.
 */
export async function getOrCreateRecipientConversation(
  supabase: SupabaseClient,
  rec: RecipientRow,
  offerReference: string
): Promise<string> {
  const contextType = "freight_offer_recipient";
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("context_type", contextType)
    .eq("context_id", rec.id)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      type: "group",
      context_type: contextType,
      context_id: rec.id,
      title: `Offer ${offerReference} — ${rec.carrier_name || "Carrier"}`,
      created_by_id: rec.admin_id,
      created_by_type: "admin",
    })
    .select("id")
    .single();
  if (error) throw error;

  // Seed participants: the carrier (keyed by recipient id) and the tenant admin.
  await supabase.from("conversation_participants").insert([
    {
      conversation_id: conv.id,
      user_id: rec.id,
      user_type: "carrier",
      display_name: rec.carrier_name || "Carrier",
      role: "member",
    },
    {
      conversation_id: conv.id,
      user_id: rec.admin_id,
      user_type: "admin",
      display_name: "Dispatcher",
      role: "owner",
    },
  ]);

  return conv.id;
}
