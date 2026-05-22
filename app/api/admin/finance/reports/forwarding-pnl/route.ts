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

type SubcontractInfo = {
  id: string;
  reference_number: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  cost_amount: number;
  cost_currency: string | null;
  pod_count: number;
  pod_last_uploaded_at: string | null;
  pod_status: "received" | "missing";
};

/**
 * GET /api/admin/finance/reports/forwarding-pnl?admin_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns one row per parent (customer) order with revenue, costs, profit,
 * execution mode, customer/carrier invoice statuses, and a `subcontracts`
 * array describing each VLR-* child order (carrier name, cost, POD status).
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

  const items = (data ?? []) as Array<{ order_id: string; [k: string]: unknown }>;
  if (items.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Pull subcontract children (VLR-*) for the parent orders we returned.
  const parentIds = items.map(r => r.order_id);
  const { data: subs, error: subErr } = await sb
    .from("orders")
    .select(
      "id, reference_number, parent_order_id, customer_id, customer_price, customer_currency",
    )
    .eq("admin_id", adminId)
    .eq("commercial_role", "carrier_subcontract")
    .in("parent_order_id", parentIds);

  if (subErr) {
    console.log("[v0] subcontract fetch error:", subErr.message);
  }

  const subList = subs ?? [];
  const carrierIds = Array.from(
    new Set(subList.map(s => s.customer_id).filter(Boolean) as string[]),
  );

  const carrierMap = new Map<string, string>();
  if (carrierIds.length) {
    const { data: bps } = await sb
      .from("business_partners")
      .select("id, name, company_name")
      .in("id", carrierIds);
    for (const bp of bps ?? []) {
      carrierMap.set(
        bp.id as string,
        ((bp as any).company_name || (bp as any).name || "") as string,
      );
    }
  }

  // POD documents for the subcontract child orders.
  const subIds = subList.map(s => s.id as string);
  const podMap = new Map<string, { count: number; last: string | null }>();
  if (subIds.length) {
    const { data: docs } = await sb
      .from("order_documents")
      .select("order_id, document_type, created_at")
      .in("order_id", subIds);
    for (const d of docs ?? []) {
      const dt = ((d as any).document_type || "").toString().toLowerCase();
      if (!dt.includes("pod") && !dt.includes("proof")) continue;
      const oid = (d as any).order_id as string;
      const cur = podMap.get(oid) || { count: 0, last: null };
      cur.count += 1;
      const ts = (d as any).created_at as string | null;
      if (ts && (!cur.last || ts > cur.last)) cur.last = ts;
      podMap.set(oid, cur);
    }
  }

  const subsByParent = new Map<string, SubcontractInfo[]>();
  for (const s of subList) {
    const pid = (s as any).parent_order_id as string;
    const carrierId = ((s as any).customer_id as string) || null;
    const pod = podMap.get((s as any).id as string);
    const info: SubcontractInfo = {
      id: (s as any).id as string,
      reference_number: ((s as any).reference_number as string) || null,
      carrier_id: carrierId,
      carrier_name: carrierId ? carrierMap.get(carrierId) || null : null,
      cost_amount: Number((s as any).customer_price ?? 0),
      cost_currency: ((s as any).customer_currency as string) || null,
      pod_count: pod?.count ?? 0,
      pod_last_uploaded_at: pod?.last ?? null,
      pod_status: (pod?.count ?? 0) > 0 ? "received" : "missing",
    };
    const arr = subsByParent.get(pid) || [];
    arr.push(info);
    subsByParent.set(pid, arr);
  }

  const enriched = items.map(r => ({
    ...r,
    subcontracts: subsByParent.get(r.order_id) ?? [],
  }));

  return NextResponse.json({ items: enriched });
}
