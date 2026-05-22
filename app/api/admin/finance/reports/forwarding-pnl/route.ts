import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
 * GET /api/admin/finance/reports/forwarding-pnl?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns one row per parent (customer) order with revenue, costs, profit,
 * execution mode (internal/subcontracted/mixed), and invoice statuses for
 * both customer (outgoing) and carrier (incoming) sides.
 */
export async function GET(req: NextRequest) {
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
    /* ignore */
  }

  if (!adminId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
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
