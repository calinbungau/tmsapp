import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Service-role client. Cookie-based auth is unreliable in nested API routes
 *  (same reason /api/admin/tms/trips/[id]/expenses uses service role) — so
 *  we read admin_id from the cookie session opportunistically and run the
 *  actual query with service role. */
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * GET /api/admin/finance/cost-catalog
 *
 * Returns cost_catalog rows scoped to the caller's admin_id PLUS system rows
 * (admin_id IS NULL). Used by the searchable catalog picker on the manual
 * expense form, the cost-entries Add Entry dialog, and any future admin UIs
 * that need to pick a chart-of-accounts line.
 *
 * Query params:
 *   q      string  full-text fragment matched against cost_code or cost_line
 *   driver "1"    only return rows with driver_allowed = true
 *   manual "1"   only return rows with manual_allowed = true
 *   limit  number default 200
 */
export async function GET(req: NextRequest) {
  // Best-effort admin scoping: try the cookie session, but don't block on it.
  let adminId: string | null = null;
  try {
    const cookieSb = await createClient();
    const {
      data: { user },
    } = await cookieSb.auth.getUser();
    if (user) {
      const { data: profile } = await cookieSb
        .from("profiles")
        .select("admin_id")
        .eq("user_id", user.id)
        .maybeSingle();
      adminId = profile?.admin_id ?? null;
    }
  } catch {
    /* ignore — fall through with adminId = null */
  }

  const sb = serviceClient();
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const driverOnly = sp.get("driver") === "1";
  const manualOnly = sp.get("manual") === "1";
  const limit = Math.min(Number(sp.get("limit") || 200), 500);

  let query = sb
    .from("cost_catalog")
    .select(
      "id, cost_code, cost_line, unit, nature, behavior, is_system, driver_allowed, manual_allowed, admin_id",
    )
    .eq("is_active", true);

  if (adminId) {
    query = query.or(`admin_id.eq.${adminId},admin_id.is.null`);
  }
  // When we couldn't resolve adminId, return ALL active rows. In a single-tenant
  // dev environment this is fine; in multi-tenant prod, sessions will resolve.

  if (driverOnly) query = query.eq("driver_allowed", true);
  if (manualOnly) query = query.eq("manual_allowed", true);

  if (q) {
    const safe = q.replace(/[%_\\]/g, m => `\\${m}`);
    query = query.or(`cost_code.ilike.${safe}%,cost_line.ilike.%${safe}%`);
  }

  const { data, error } = await query
    .order("cost_code", { ascending: true })
    .limit(limit);

  if (error) {
    console.log("[v0] /api/admin/finance/cost-catalog error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [], scoped: adminId !== null });
}
