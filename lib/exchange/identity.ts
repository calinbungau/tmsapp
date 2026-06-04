import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Carrier identity model.
 *
 * A carrier_account is a GLOBAL identity (one real transport company = one
 * login). Each tenant (admin) maintains its own business_partners row for that
 * same company. carrier_account_partners is the junction that links a single
 * global account to many tenant-scoped partners (one row per tenant).
 *
 * Matching rule: VAT number (business_partners.tax_id) is the primary anchor
 * ("one company = one entity"); email is the fallback when no VAT is on file.
 */

type PartnerMatch = {
  id: string;
  admin_id: string;
  name: string | null;
  tax_id: string | null;
  email: string | null;
};

/** Normalize a VAT / CUI for comparison: strip spaces, dashes, country prefix casing. */
export function normalizeVat(vat: string | null | undefined): string | null {
  if (!vat) return null;
  const cleaned = vat.replace(/[\s\-.]/g, "").toUpperCase();
  return cleaned.length ? cleaned : null;
}

/**
 * Find every carrier business partner (across all tenants) that represents the
 * same real company as the given account, by VAT first then email.
 */
export async function findMatchingPartners(
  supabase: SupabaseClient,
  opts: { vat?: string | null; email?: string | null }
): Promise<PartnerMatch[]> {
  const vat = normalizeVat(opts.vat);
  const email = opts.email?.toLowerCase().trim() || null;

  const results = new Map<string, PartnerMatch>();

  // Primary: VAT match. We fetch candidate carriers and compare normalized VAT
  // in code so formatting differences (RO123 vs RO 123) still match.
  if (vat) {
    const { data } = await supabase
      .from("business_partners")
      .select("id, admin_id, name, tax_id, email, types")
      .contains("types", ["carrier"])
      .not("tax_id", "is", null);
    for (const p of (data || []) as (PartnerMatch & { types: string[] })[]) {
      if (normalizeVat(p.tax_id) === vat) results.set(p.id, p);
    }
  }

  // Fallback: email match (covers carriers with no VAT on file).
  if (email) {
    const { data } = await supabase
      .from("business_partners")
      .select("id, admin_id, name, tax_id, email, types")
      .contains("types", ["carrier"])
      .ilike("email", email);
    for (const p of (data || []) as (PartnerMatch & { types: string[] })[]) {
      results.set(p.id, p);
    }
  }

  return Array.from(results.values());
}

/**
 * Link a carrier account to a set of tenant business partners, creating one
 * carrier_account_partners row per (admin, partner). Safe to call repeatedly —
 * relies on the UNIQUE(admin_id, partner_id) index to dedupe.
 *
 * Also backfills freight_offer_recipients.carrier_account_id so the carrier
 * immediately sees past offers from every linked tenant.
 */
export async function linkAccountToPartners(
  supabase: SupabaseClient,
  accountId: string,
  partners: { id: string; admin_id: string }[]
): Promise<number> {
  if (!partners.length) return 0;

  const rows = partners.map((p) => ({
    carrier_account_id: accountId,
    partner_id: p.id,
    admin_id: p.admin_id,
  }));

  // upsert on the unique (admin_id, partner_id) constraint; if a partner is
  // already linked to a DIFFERENT account we leave it as-is (ignoreDuplicates).
  const { error } = await supabase
    .from("carrier_account_partners")
    .upsert(rows, { onConflict: "admin_id,partner_id", ignoreDuplicates: true });
  if (error) {
    console.error("[identity] linkAccountToPartners upsert failed", error);
  }

  // Backfill recipient rows for these partners that have no account yet.
  const partnerIds = partners.map((p) => p.id);
  try {
    await supabase
      .from("freight_offer_recipients")
      .update({ carrier_account_id: accountId })
      .in("partner_id", partnerIds)
      .is("carrier_account_id", null);
  } catch (e) {
    console.error("[identity] recipient backfill failed", e);
  }

  return partners.length;
}

/**
 * Full resolve: given a freshly created/looked-up account, find all matching
 * partners by VAT/email and link them. Returns the linked partner count.
 */
export async function resolveAndLinkAccount(
  supabase: SupabaseClient,
  account: { id: string; vat_number?: string | null; email: string },
  extraPartnerId?: string | null
): Promise<number> {
  const partners = await findMatchingPartners(supabase, {
    vat: account.vat_number,
    email: account.email,
  });

  // Always include the partner the carrier onboarded through (token / invite),
  // even if its VAT/email doesn't match (e.g. partner record is incomplete).
  if (extraPartnerId && !partners.some((p) => p.id === extraPartnerId)) {
    const { data } = await supabase
      .from("business_partners")
      .select("id, admin_id, name, tax_id, email")
      .eq("id", extraPartnerId)
      .maybeSingle();
    if (data) partners.push(data as PartnerMatch);
  }

  return linkAccountToPartners(supabase, account.id, partners);
}
