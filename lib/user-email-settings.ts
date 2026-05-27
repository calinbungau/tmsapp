import { createClient } from "@supabase/supabase-js";

/**
 * Resolves the user_email_settings row for a given (admin, user) pair.
 *
 * Lookup order:
 *   1. Exact match on (admin_id, user_id) — the new per-user mailbox.
 *   2. Fallback: any row for this admin where user_id IS NULL — supports
 *      legacy installs that pre-date the per-user migration so existing
 *      send/sync flows do not break for tenants that have not yet
 *      configured personal mailboxes.
 *
 * Returns null if neither is found.
 */
export async function getUserEmailSettingsRow(
  supabase: ReturnType<typeof createClient>,
  adminId: string,
  userId: string | null,
): Promise<any | null> {
  if (userId) {
    const { data: own } = await supabase
      .from("user_email_settings")
      .select("*")
      .eq("admin_id", adminId)
      .eq("user_id", userId)
      .maybeSingle();
    if (own) return own;
  }

  // Fallback to legacy admin-scoped row (user_id IS NULL).
  const { data: legacy } = await supabase
    .from("user_email_settings")
    .select("*")
    .eq("admin_id", adminId)
    .is("user_id", null)
    .maybeSingle();

  return legacy ?? null;
}

/**
 * Pulls (adminId, userId) from the standard request headers used across
 * the email APIs. `x-user-id` is optional for backwards compat with the
 * legacy single-mailbox-per-tenant flow.
 */
export function readEmailIdentityHeaders(headers: Headers): {
  adminId: string | null;
  userId: string | null;
} {
  return {
    adminId: headers.get("x-admin-id"),
    userId: headers.get("x-user-id"),
  };
}
