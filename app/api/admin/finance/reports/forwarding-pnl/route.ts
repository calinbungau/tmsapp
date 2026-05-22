import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * GET /api/admin/finance/reports/forwarding-pnl?admin_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns one row per parent (customer) order with revenue, costs, profit,
 * execution mode (internal/subcontracted/mixed), and invoice statuses for
 * both customer (outgoing) and carrier (incoming) sides.
 *
 * Tenant isolation: this app uses a client-side admin session (localStorage
 * `admin_session.id`) — the client must pass `admin_id` explicitly. We fail
 * closed (empty list) when it's missing so we never leak other tenants'
 * data via service-role.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const adminId = sp.get("admin_id");
  if (!adminId) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const from = sp.get("from") || null;
  const to = sp.get("to") || null;

  const sb = serviceClient();
  const { data, error } = await sb.rpc("fn_forwarding_pnl", {
    p_admin_id: adminId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.log("[v0] forwarding-pnl rpc error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
