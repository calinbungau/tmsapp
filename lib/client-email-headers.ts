/**
 * Shared client-side helper to read the current admin session's
 * user_id from localStorage. Used by every component that posts to
 * an email-aware backend route — they need to send `x-user-id` so
 * the server can resolve the per-user `user_email_settings` row
 * instead of a tenant-scoped fallback.
 *
 * Returns "" when no session is stored (server-side render, logged
 * out, etc.) — the API treats an empty header as "no per-user
 * preference" and falls back to the legacy admin row.
 */
export function getCurrentUserIdFromSession(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("admin_session");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed?.user_id === "string" ? parsed.user_id : "";
  } catch {
    return "";
  }
}

/**
 * Builds the auth header bag every email-aware fetch should use.
 * Pass the admin id you already have on hand; the user id is read
 * from the session for you.
 */
export function buildEmailAuthHeaders(adminId: string | undefined | null): Record<string, string> {
  return {
    "x-admin-id": adminId || "",
    "x-user-id": getCurrentUserIdFromSession(),
  };
}
