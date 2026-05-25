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

type SubcontractStop = {
  type: string | null;
  city: string | null;
  country: string | null;
  planned_date: string | null;
  planned_time_from: string | null;
  planned_time_to: string | null;
};

type SubcontractInfo = {
  id: string;
  reference_number: string | null;
  status: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  customer_name: string | null;
  customer_reference: string | null;
  cost_amount: number;
  cost_currency: string | null;
  cargo_description: string | null;
  weight_kg: number | null;
  pallet_count: number | null;
  loading_meters: number | null;
  pickup: SubcontractStop | null;
  delivery: SubcontractStop | null;
  route_label: string | null;
  transport_from: string | null;
  transport_to: string | null;
  added_at: string | null;
  added_by: string | null;
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
      "id, reference_number, parent_order_id, carrier_id, customer_id, customer_reference, customer_price, customer_currency, status, cargo_description, weight_kg, pallet_count, loading_meters, created_at, created_by",
    )
    .eq("admin_id", adminId)
    .eq("commercial_role", "carrier_subcontract")
    .in("parent_order_id", parentIds);

  if (subErr) {
    console.log("[v0] subcontract fetch error:", subErr.message);
  }

  const subList = subs ?? [];
  const carrierIds = Array.from(
    new Set(
      subList
        .map(s => ((s as any).carrier_id as string) || ((s as any).customer_id as string))
        .filter(Boolean) as string[],
    ),
  );

  const carrierMap = new Map<string, string>();
  if (carrierIds.length) {
    const { data: bps } = await sb
      .from("business_partners")
      .select("id, name")
      .in("id", carrierIds);
    for (const bp of bps ?? []) {
      const nm = ((bp as any).name as string) || "";
      if (nm) carrierMap.set(bp.id as string, nm);
    }
  }

  // POD documents for the subcontract child orders.
  const subIds = subList.map(s => s.id as string);

  // Stops for each subcontract — used for route + transport dates.
  type StopRow = {
    order_id: string;
    sequence_order: number | null;
    stop_type: string | null;
    city: string | null;
    country: string | null;
    planned_date: string | null;
    planned_time_from: string | null;
    planned_time_to: string | null;
  };
  const stopsByOrder = new Map<string, StopRow[]>();
  if (subIds.length) {
    const { data: stops } = await sb
      .from("order_stops")
      .select(
        "order_id, sequence_order, stop_type, city, country, planned_date, planned_time_from, planned_time_to",
      )
      .in("order_id", subIds)
      .order("sequence_order", { ascending: true });
    for (const s of (stops ?? []) as StopRow[]) {
      const arr = stopsByOrder.get(s.order_id) || [];
      arr.push(s);
      stopsByOrder.set(s.order_id, arr);
    }
  }

  // Resolve "added by" — orders.created_by → users.employee_id → employees.first_name/last_name
  const creatorIds = Array.from(
    new Set(
      subList
        .map(s => (s as any).created_by as string | null)
        .filter(Boolean) as string[],
    ),
  );
  const creatorMap = new Map<string, string>();
  if (creatorIds.length) {
    const { data: usersRows } = await sb
      .from("users")
      .select("id, employee_id, email")
      .in("id", creatorIds);
    const empIds = ((usersRows ?? [])
      .map(u => (u as any).employee_id)
      .filter(Boolean)) as string[];
    const empNameMap = new Map<string, string>();
    if (empIds.length) {
      const { data: emps } = await sb
        .from("employees")
        .select("id, first_name, last_name")
        .in("id", empIds);
      for (const e of emps ?? []) {
        const fn = (e as any).first_name || "";
        const ln = (e as any).last_name || "";
        const name = `${fn} ${ln}`.trim();
        if (name) empNameMap.set((e as any).id as string, name);
      }
    }
    for (const u of usersRows ?? []) {
      const uid = (u as any).id as string;
      const eid = (u as any).employee_id as string | null;
      const fallback = ((u as any).email as string | null) || null;
      const name = (eid && empNameMap.get(eid)) || fallback || null;
      if (name) creatorMap.set(uid, name);
    }
  }

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

  // Index of parent customer name by parent order id (from RPC items).
  const parentCustomerName = new Map<string, string | null>();
  for (const r of items) {
    parentCustomerName.set(
      r.order_id,
      (r as any).customer_name ?? null,
    );
  }

  const subsByParent = new Map<string, SubcontractInfo[]>();
  for (const s of subList) {
    const pid = (s as any).parent_order_id as string;
    const carrierId =
      ((s as any).carrier_id as string) ||
      ((s as any).customer_id as string) ||
      null;
    const sid = (s as any).id as string;
    const pod = podMap.get(sid);

    const stops = stopsByOrder.get(sid) || [];
    const pickup = stops.find(x => (x.stop_type || "").toLowerCase() === "pickup") || stops[0] || null;
    const delivery =
      [...stops].reverse().find(x => (x.stop_type || "").toLowerCase() === "delivery") ||
      stops[stops.length - 1] ||
      null;

    const toStop = (st: StopRow | null): SubcontractStop | null =>
      st
        ? {
            type: st.stop_type,
            city: st.city,
            country: st.country,
            planned_date: st.planned_date,
            planned_time_from: st.planned_time_from,
            planned_time_to: st.planned_time_to,
          }
        : null;

    const routeLabel =
      pickup && delivery
        ? `${[pickup.city, pickup.country].filter(Boolean).join(", ")} → ${[delivery.city, delivery.country].filter(Boolean).join(", ")}`
        : pickup
          ? `${pickup.city ?? ""}`.trim()
          : null;

    const dates = stops
      .map(x => x.planned_date)
      .filter(Boolean) as string[];
    const transport_from = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
    const transport_to = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;

    const createdBy = (s as any).created_by as string | null;

    const info: SubcontractInfo = {
      id: sid,
      reference_number: ((s as any).reference_number as string) || null,
      status: ((s as any).status as string) || null,
      carrier_id: carrierId,
      carrier_name: carrierId ? carrierMap.get(carrierId) || null : null,
      customer_name: parentCustomerName.get(pid) ?? null,
      customer_reference: ((s as any).customer_reference as string) || null,
      cost_amount: Number((s as any).customer_price ?? 0),
      cost_currency: ((s as any).customer_currency as string) || null,
      cargo_description: ((s as any).cargo_description as string) || null,
      weight_kg:
        (s as any).weight_kg == null ? null : Number((s as any).weight_kg),
      pallet_count:
        (s as any).pallet_count == null ? null : Number((s as any).pallet_count),
      loading_meters:
        (s as any).loading_meters == null
          ? null
          : Number((s as any).loading_meters),
      pickup: toStop(pickup),
      delivery: toStop(delivery),
      route_label: routeLabel,
      transport_from,
      transport_to,
      added_at: ((s as any).created_at as string) || null,
      added_by: createdBy ? creatorMap.get(createdBy) || null : null,
      pod_count: pod?.count ?? 0,
      pod_last_uploaded_at: pod?.last ?? null,
      pod_status: (pod?.count ?? 0) > 0 ? "received" : "missing",
    };
    const arr = subsByParent.get(pid) || [];
    arr.push(info);
    subsByParent.set(pid, arr);
  }

  // ---- Per-order invoice lists (customer = outgoing, carrier = incoming) ----
  // Customer invoices live on the parent order; carrier invoices on the child
  // subcontract orders. We expose due_date + status + amounts so the UI can
  // surface "due in 10 days", "overdue", etc.
  type InvoiceLite = {
    id: string;
    invoice_number: string | null;
    direction: "incoming" | "outgoing";
    status: string | null;
    issue_date: string | null;
    due_date: string | null;
    paid_date: string | null;
    amount: number;
    total_with_tax: number;
    paid_amount: number;
    remaining_amount: number | null;
    currency: string | null;
    business_partner_id: string | null;
  };

  const allInvoiceOrderIds = Array.from(
    new Set([...parentIds, ...subIds]),
  );

  const customerInvoicesByParent = new Map<string, InvoiceLite[]>();
  const carrierInvoicesByParent = new Map<string, InvoiceLite[]>();
  // Map child sub order_id -> parent order_id (so we can group carrier
  // invoices that are attached to the child onto the parent row).
  const childToParent = new Map<string, string>();
  for (const s of subList) {
    childToParent.set(
      (s as any).id as string,
      (s as any).parent_order_id as string,
    );
  }

  if (allInvoiceOrderIds.length) {
    const { data: invs, error: invErr } = await sb
      .from("order_invoices")
      .select(
        "id, order_id, invoice_number, direction, status, issue_date, due_date, paid_date, amount, total_with_tax, paid_amount, remaining_amount, currency, business_partner_id",
      )
      .in("order_id", allInvoiceOrderIds);

    if (invErr) {
      console.log("[v0] order_invoices fetch error:", invErr.message);
    }

    for (const i of (invs ?? []) as any[]) {
      const dir = (i.direction as string) as "incoming" | "outgoing";
      const lite: InvoiceLite = {
        id: i.id,
        invoice_number: i.invoice_number ?? null,
        direction: dir,
        status: i.status ?? null,
        issue_date: i.issue_date ?? null,
        due_date: i.due_date ?? null,
        paid_date: i.paid_date ?? null,
        amount: Number(i.amount ?? 0),
        total_with_tax: Number(i.total_with_tax ?? i.amount ?? 0),
        paid_amount: Number(i.paid_amount ?? 0),
        remaining_amount:
          i.remaining_amount == null ? null : Number(i.remaining_amount),
        currency: i.currency ?? null,
        business_partner_id: i.business_partner_id ?? null,
      };
      const oid = i.order_id as string;
      if (parentIds.includes(oid)) {
        if (dir === "outgoing") {
          const arr = customerInvoicesByParent.get(oid) ?? [];
          arr.push(lite);
          customerInvoicesByParent.set(oid, arr);
        } else {
          // Edge case: incoming invoice attached directly to the parent.
          const arr = carrierInvoicesByParent.get(oid) ?? [];
          arr.push(lite);
          carrierInvoicesByParent.set(oid, arr);
        }
      } else {
        const parent = childToParent.get(oid);
        if (parent && dir === "incoming") {
          const arr = carrierInvoicesByParent.get(parent) ?? [];
          arr.push(lite);
          carrierInvoicesByParent.set(parent, arr);
        }
      }
    }
  }

  const enriched = items.map(r => ({
    ...r,
    subcontracts: subsByParent.get(r.order_id) ?? [],
    customer_invoices: customerInvoicesByParent.get(r.order_id) ?? [],
    carrier_invoices: carrierInvoicesByParent.get(r.order_id) ?? [],
  }));

  return NextResponse.json({ items: enriched });
}
