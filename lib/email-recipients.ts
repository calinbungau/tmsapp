/**
 * Shared client-side helpers for the email recipient autocomplete +
 * recording subsystem. Two tables back this feature:
 *
 *   1. `business_partner_contacts` — N contacts per business partner
 *      (name, email, phone, mobile, position, department, language,
 *      whatsapp, notes, is_primary, is_active). The new source of
 *      truth for who-to-email at a BP, replacing the legacy single
 *      contact_person/email/phone columns on `business_partners`
 *      (those still exist for back-compat and were back-filled into
 *      this table on migration).
 *
 *   2. `email_recipients_history` — per-user log of every email
 *      address the operator has actually used. Powers autocomplete
 *      so that addresses typed by hand once become first-class
 *      suggestions next time, even if the recipient never gets
 *      saved as a BP contact.
 *
 * Every "send email" dialog in the app SHOULD route through
 * `recordEmailRecipients()` after a successful send so the user's
 * memory grows organically without anyone having to maintain a
 * separate address book.
 */

import { createClient } from "@/lib/supabase/client";

export type RecipientSuggestion = {
  // Stable React key — built from the source + id pair below.
  key: string;
  // Where this suggestion came from. Used by the UI to render a
  // small badge ("Contact", "History", "Primary") so the operator
  // can tell saved BP contacts apart from ad-hoc history.
  source: "bp_contact" | "history";
  email: string;
  name: string | null;
  // Optional metadata surfaced in the dropdown row.
  position?: string | null;
  business_partner_id?: string | null;
  business_partner_contact_id?: string | null;
  is_primary?: boolean;
  // Higher = ranks earlier in the list. Computed in the search call.
  score?: number;
};

// Loose email matcher: anything resembling "x@y.z" is accepted.
// Real validation happens at SMTP send time and at the API layer.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (e: string) => EMAIL_RE.test((e || "").trim());

/**
 * Fetch autocomplete suggestions for the operator. Merges two
 * sources and ranks them with a simple boost system:
 *
 *   - BP contacts of the currently-relevant business partner score
 *     highest (the operator is almost certainly sending to one of
 *     them — they opened the dialog from that BP's context).
 *   - Other BP contacts and recent history score next, ordered by
 *     last-used recency.
 *
 * The `query` arg does case-insensitive contains-match against
 * email AND name. An empty query returns the most-recent default
 * suggestions so the dropdown is useful before the user types.
 */
export async function searchEmailRecipients(opts: {
  adminId: string;
  userId: string | null;
  query: string;
  businessPartnerId?: string | null;
  limit?: number;
}): Promise<RecipientSuggestion[]> {
  const { adminId, userId, businessPartnerId } = opts;
  const limit = opts.limit ?? 8;
  const q = (opts.query || "").trim().toLowerCase();

  if (!adminId) return [];

  const supabase = createClient();

  // We pull a generous candidate set from each source (3× the
  // requested limit) then filter + rank locally. This keeps the
  // SQL simple and avoids needing a Postgres full-text setup.
  const candLimit = Math.max(limit * 3, 24);

  const [contactsRes, historyRes] = await Promise.all([
    supabase
      .from("business_partner_contacts")
      .select(
        "id, business_partner_id, name, email, position, is_primary, updated_at"
      )
      .eq("admin_id", adminId)
      .eq("is_active", true)
      .not("email", "is", null)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(candLimit),
    userId
      ? supabase
          .from("email_recipients_history")
          .select(
            "id, email, name, business_partner_id, business_partner_contact_id, last_used_at, use_count"
          )
          .eq("user_id", userId)
          .order("last_used_at", { ascending: false })
          .limit(candLimit)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const matchesQuery = (email: string | null, name: string | null) => {
    if (!q) return true;
    const e = (email || "").toLowerCase();
    const n = (name || "").toLowerCase();
    return e.includes(q) || n.includes(q);
  };

  const out: RecipientSuggestion[] = [];

  // -- BP contacts -------------------------------------------------
  for (const c of (contactsRes.data || []) as any[]) {
    if (!c.email) continue;
    if (!matchesQuery(c.email, c.name)) continue;
    let score = 50;
    if (businessPartnerId && c.business_partner_id === businessPartnerId) score += 100;
    if (c.is_primary) score += 10;
    // Prefix matches feel more relevant than mid-string matches.
    if (q && c.email.toLowerCase().startsWith(q)) score += 15;
    out.push({
      key: `bp_contact:${c.id}`,
      source: "bp_contact",
      email: c.email,
      name: c.name,
      position: c.position,
      business_partner_id: c.business_partner_id,
      business_partner_contact_id: c.id,
      is_primary: !!c.is_primary,
      score,
    });
  }

  // -- Per-user history -------------------------------------------
  // Dedupe against contacts already in `out` (case-insensitive email).
  const seen = new Set(out.map((s) => s.email.toLowerCase()));
  for (const h of (historyRes.data || []) as any[]) {
    if (!h.email) continue;
    const lower = h.email.toLowerCase();
    if (seen.has(lower)) continue;
    if (!matchesQuery(h.email, h.name)) continue;
    let score = 20;
    if (q && lower.startsWith(q)) score += 15;
    // Frequency bonus, capped so a single power-recipient doesn't
    // permanently dominate the list.
    score += Math.min(h.use_count || 0, 10);
    out.push({
      key: `history:${h.id}`,
      source: "history",
      email: h.email,
      name: h.name,
      business_partner_id: h.business_partner_id,
      business_partner_contact_id: h.business_partner_contact_id,
      score,
    });
    seen.add(lower);
  }

  out.sort((a, b) => (b.score || 0) - (a.score || 0));
  return out.slice(0, limit);
}

/**
 * Record that a set of email addresses was just sent to. Called
 * AFTER a successful send from any send-email dialog. Safe to
 * call with an empty list (no-op).
 *
 * Behavior:
 *   - Upserts one row per (user_id, lower(email)) pair.
 *   - Increments `use_count` and bumps `last_used_at` on conflict.
 *   - Stamps the BP linkage if known, so future autocomplete
 *     queries can surface the BP context.
 *
 * The function never throws — recording is best-effort and we
 * absolutely do NOT want a logging failure to block the user's
 * actual send confirmation.
 */
export async function recordEmailRecipients(opts: {
  adminId: string;
  userId: string | null;
  emails: string[];
  businessPartnerId?: string | null;
  // Short tag describing where the send originated, e.g.
  // "send_to_carrier", "send_docs_to_customer". Helps debug
  // history pollution if a dialog goes rogue.
  context?: string;
}): Promise<void> {
  const { adminId, userId, businessPartnerId, context } = opts;
  if (!adminId || !userId) return;
  const cleaned = Array.from(
    new Set(
      (opts.emails || [])
        .map((e) => (e || "").trim())
        .filter(isValidEmail)
        .map((e) => e) // preserve original casing for display
    )
  );
  if (cleaned.length === 0) return;

  const supabase = createClient();

  // We need to know whether each email already maps to a BP contact
  // so we can stamp `business_partner_contact_id` on the history
  // row. One round-trip pulls everything matching the lowercased
  // emails for this admin.
  const lowerEmails = cleaned.map((e) => e.toLowerCase());
  const { data: bpMatches } = await supabase
    .from("business_partner_contacts")
    .select("id, business_partner_id, email, name")
    .eq("admin_id", adminId)
    .eq("is_active", true)
    .in("email", cleaned); // exact-match first
  // Build a lowercased lookup so we tolerate users typing "X@y.com"
  // vs. the stored "x@y.com".
  const bpByEmail = new Map<string, { id: string; business_partner_id: string; name: string | null }>();
  for (const row of (bpMatches || []) as any[]) {
    if (row.email) bpByEmail.set(row.email.toLowerCase(), row);
  }

  // Fetch existing history rows in one shot so we can choose
  // insert vs. update without N round-trips. (We can't rely on
  // PostgREST upsert because we need to BUMP use_count on conflict,
  // and PostgREST upsert with onConflict doesn't expose SQL
  // expressions for the update side.)
  const { data: existing } = await supabase
    .from("email_recipients_history")
    .select("id, email, use_count")
    .eq("user_id", userId)
    .in("email", cleaned);
  const existingByLower = new Map<string, { id: string; use_count: number }>();
  for (const row of (existing || []) as any[]) {
    if (row.email) existingByLower.set(row.email.toLowerCase(), row);
  }

  const now = new Date().toISOString();
  const toInsert: any[] = [];
  const toUpdate: Array<{ id: string; use_count: number }> = [];

  for (const email of cleaned) {
    const lower = email.toLowerCase();
    const bp = bpByEmail.get(lower);
    const linkedBpId = bp?.business_partner_id ?? businessPartnerId ?? null;
    const linkedContactId = bp?.id ?? null;
    const existingRow = existingByLower.get(lower);
    if (existingRow) {
      toUpdate.push({ id: existingRow.id, use_count: (existingRow.use_count || 0) + 1 });
    } else {
      toInsert.push({
        admin_id: adminId,
        user_id: userId,
        email,
        name: bp?.name ?? null,
        business_partner_id: linkedBpId,
        business_partner_contact_id: linkedContactId,
        context: context ?? null,
        use_count: 1,
        last_used_at: now,
      });
    }
  }

  // Best-effort writes. We swallow errors so a transient RLS issue
  // never bubbles up into the send-confirmation toast — the user
  // already cares that their email went out.
  try {
    if (toInsert.length > 0) {
      await supabase.from("email_recipients_history").insert(toInsert);
    }
    // Updates run in parallel; per-row is fine, the list is tiny.
    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map((u) =>
          supabase
            .from("email_recipients_history")
            .update({ use_count: u.use_count, last_used_at: now })
            .eq("id", u.id)
        )
      );
    }
  } catch (err) {
    console.error("[email-recipients] record failed (non-fatal)", err);
  }
}

/**
 * Promote a typed-in email into a saved BP contact. Used by the
 * inline "Save as contact for <BP>" action in the autocomplete UI.
 * Returns the newly created contact id, or null on failure.
 */
export async function quickCreateBpContact(opts: {
  adminId: string;
  businessPartnerId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  createdBy?: string | null;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("business_partner_contacts")
    .insert({
      admin_id: opts.adminId,
      business_partner_id: opts.businessPartnerId,
      email: opts.email.trim(),
      name: opts.name?.trim() || null,
      phone: opts.phone?.trim() || null,
      is_primary: false,
      is_active: true,
      created_by: opts.createdBy || null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[email-recipients] quickCreateBpContact failed", error);
    return null;
  }
  return data?.id ?? null;
}
