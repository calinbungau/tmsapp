import { randomBytes, randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedCarrier } from "@/lib/exchange/resolve-carriers";

const FALLBACK_DAYS = 14;

export function generateRecipientToken(): string {
  return randomBytes(24).toString("base64url");
}

export function generateRecipientPin(): string {
  // 6-digit numeric PIN, zero-padded.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Compute when a recipient link should stop working: the offer's expiry, or a
 * fallback of 14 days from now if the offer has no explicit expiry.
 */
export function computeRecipientExpiry(offerExpiresAt: string | null | undefined): string {
  if (offerExpiresAt) {
    const d = new Date(offerExpiresAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + FALLBACK_DAYS);
  return fallback.toISOString();
}

export interface UpsertRecipientResult {
  recipientId: string;
  partnerId: string | null;
  email: string | null;
  carrierName: string | null;
  token: string;
  pin: string;
  isNew: boolean;
}

/**
 * Ensure a freight_offer_recipients row exists for each resolved carrier on an
 * offer. Reuses an existing row (and its token/PIN) when one is already present
 * for the same offer+partner, so re-sending an email keeps the same link.
 * Returns the recipient rows (token + PIN) so the caller can build email links.
 */
export async function upsertRecipients(
  supabase: SupabaseClient,
  params: {
    offerId: string;
    adminId: string;
    offerExpiresAt: string | null | undefined;
    carriers: ResolvedCarrier[];
  }
): Promise<UpsertRecipientResult[]> {
  const { offerId, adminId, offerExpiresAt, carriers } = params;
  const expiresAt = computeRecipientExpiry(offerExpiresAt);

  // Load existing recipients for this offer so we can reuse tokens/PINs.
  const { data } = await supabase
    .from("freight_offer_recipients")
    .select("id, partner_id, email, carrier_name, token, pin")
    .eq("offer_id", offerId);

  type ExistingRow = {
    id: string;
    partner_id: string | null;
    email: string | null;
    carrier_name: string | null;
    token: string;
    pin: string;
  };
  const existing = (data || []) as ExistingRow[];

  const byPartner = new Map<string, ExistingRow>();
  const byEmail = new Map<string, ExistingRow>();
  for (const r of existing) {
    if (r.partner_id) byPartner.set(r.partner_id, r);
    if (r.email) byEmail.set(r.email.toLowerCase(), r);
  }

  const results: UpsertRecipientResult[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const nowIso = new Date().toISOString();

  for (const c of carriers) {
    const match =
      (c.id && byPartner.get(c.id)) ||
      (c.email && byEmail.get(c.email.toLowerCase())) ||
      null;

    if (match) {
      // Refresh expiry + sent timestamp on the existing row.
      await supabase
        .from("freight_offer_recipients")
        .update({ expires_at: expiresAt, sent_at: nowIso, updated_at: nowIso })
        .eq("id", match.id);
      results.push({
        recipientId: match.id,
        partnerId: match.partner_id,
        email: match.email,
        carrierName: match.carrier_name,
        token: match.token,
        pin: match.pin,
        isNew: false,
      });
      continue;
    }

    const token = generateRecipientToken();
    const pin = generateRecipientPin();
    toInsert.push({
      offer_id: offerId,
      admin_id: adminId,
      partner_id: c.id ?? null,
      carrier_name: c.name ?? null,
      email: c.email ?? null,
      token,
      pin,
      sent_at: nowIso,
      expires_at: expiresAt,
    });
  }

  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("freight_offer_recipients")
      .insert(toInsert)
      .select("id, partner_id, email, carrier_name, token, pin");
    if (error) throw error;
    for (const r of inserted || []) {
      results.push({
        recipientId: r.id,
        partnerId: r.partner_id,
        email: r.email,
        carrierName: r.carrier_name,
        token: r.token,
        pin: r.pin,
        isNew: true,
      });
    }
  }

  return results;
}
