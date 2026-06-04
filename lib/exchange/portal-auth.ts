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
  dispatcher_decision: "accepted" | "declined" | null;
  decided_at: string | null;
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
        "response, responded_at, quote_amount, quote_currency, quote_message, " +
        "dispatcher_decision, decided_at, expires_at, view_count"
    )
    .eq("token", token)
    .maybeSingle();

  if (!recipient) return { ok: false, error: "not_found" };

  const rec = recipient as unknown as RecipientRow;

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

/**
 * Single authorization gate for portal sub-actions (respond, messages, etc.).
 * A request is authorized either by a valid PIN OR by a logged-in carrier
 * account session that owns the recipient. This mirrors the main offer route so
 * that carriers who opened the offer from their dashboard (PIN-less) can also
 * submit quotes and chat. Expiry is always enforced.
 */
export async function authorizeRecipient(
  supabase: SupabaseClient,
  token: string,
  opts: { pin?: string | null; carrierAccountId?: string | null }
): Promise<ValidateResult> {
  const base = await validateRecipient(supabase, token);
  const recipient = base.recipient;

  if (!recipient || base.error === "not_found") {
    return { ok: false, error: "not_found" };
  }
  if (base.error === "expired") {
    return { ok: false, error: "expired", recipient };
  }

  // Prefer the carrier account session when present and matching.
  if (opts.carrierAccountId) {
    const match = await carrierAccountMatchesRecipient(
      supabase,
      opts.carrierAccountId,
      recipient
    );
    if (match) {
      await linkRecipientToAccount(supabase, recipient, opts.carrierAccountId);
      return { ok: true, recipient };
    }
  }

  // Otherwise fall back to the emailed PIN.
  if (String(opts.pin ?? "").trim() !== recipient.pin) {
    return { ok: false, error: "invalid_pin", recipient };
  }

  return { ok: true, recipient };
}

/**
 * Authorize a logged-in carrier account against a recipient row WITHOUT a PIN.
 * Mirrors the matching used by the carrier offers list: a recipient belongs to
 * an account when it points at that account directly, or when its partner_id is
 * one of the tenant partners linked to the account (its own partner_id or any
 * row in carrier_account_partners). Returns true when access should be granted.
 */
export async function carrierAccountMatchesRecipient(
  supabase: SupabaseClient,
  carrierAccountId: string,
  rec: RecipientRow
): Promise<boolean> {
  if (!carrierAccountId) return false;

  // Direct link.
  if (rec.carrier_account_id && rec.carrier_account_id === carrierAccountId) {
    return true;
  }

  // The recipient must be addressed to a partner to match by partner.
  if (!rec.partner_id) return false;

  const { data: account } = await supabase
    .from("carrier_accounts")
    .select("id, partner_id")
    .eq("id", carrierAccountId)
    .maybeSingle();

  if (!account) return false;

  const partnerIds = new Set<string>();
  if (account.partner_id) partnerIds.add(account.partner_id);

  const { data: links } = await supabase
    .from("carrier_account_partners")
    .select("partner_id")
    .eq("carrier_account_id", carrierAccountId);
  for (const l of links || []) {
    if (l.partner_id) partnerIds.add(l.partner_id);
  }

  return partnerIds.has(rec.partner_id);
}

/**
 * Best-effort: stamp the recipient with the carrier account id once we know the
 * logged-in account owns it. This keeps the direct (carrier_account_id) match
 * fast for future visits and ties the chat identity to the account.
 */
export async function linkRecipientToAccount(
  supabase: SupabaseClient,
  rec: RecipientRow,
  carrierAccountId: string
): Promise<void> {
  if (rec.carrier_account_id === carrierAccountId) return;
  try {
    await supabase
      .from("freight_offer_recipients")
      .update({ carrier_account_id: carrierAccountId })
      .eq("id", rec.id);
  } catch {
    // non-critical
  }
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
