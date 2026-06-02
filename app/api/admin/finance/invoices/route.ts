/**
 * List invoices for the Finance > Invoices page.
 *
 * GET /api/admin/finance/invoices?admin_id=...&direction=outgoing&status=...&q=...
 *
 * Amounts are returned untouched in each invoice's own currency (no RON
 * conversion) so EUR invoices display as EUR.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const adminId = searchParams.get("admin_id")
  const direction = searchParams.get("direction") // "outgoing" | "incoming" | null (all)
  const status = searchParams.get("status") // exact status or null (all)
  const q = (searchParams.get("q") || "").trim()

  if (!adminId) return NextResponse.json({ error: "admin_id required" }, { status: 400 })

  const supabase = service()
  let query = supabase
    .from("order_invoices")
    .select(
      "id, invoice_number, external_invoice_number, direction, business_partner_id, amount, currency, total_with_tax, paid_amount, remaining_amount, status, issue_date, due_date, paid_date, accounting_system, accounting_sync_status, order_id, orders(reference_number, customer_reference, customer_id), business_partner:business_partners(id, name)",
    )
    .eq("admin_id", adminId)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (direction) query = query.eq("direction", direction)
  if (status) query = query.eq("status", status)
  if (q) {
    // Search across invoice number / external number.
    query = query.or(`invoice_number.ilike.%${q}%,external_invoice_number.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Many invoices carry no direct business_partner_id — the customer lives on
  // the linked order (orders.customer_id → business_partners). Resolve those
  // names in a single follow-up lookup so the list always shows a customer.
  const orderCustomerIds = Array.from(
    new Set(
      (data ?? [])
        .filter((inv: any) => !inv.business_partner?.name && inv.orders?.customer_id)
        .map((inv: any) => inv.orders.customer_id as string),
    ),
  )
  const customerNameById = new Map<string, string>()
  if (orderCustomerIds.length > 0) {
    const { data: partners } = await supabase
      .from("business_partners")
      .select("id, name")
      .in("id", orderCustomerIds)
    for (const p of partners ?? []) customerNameById.set(p.id, p.name)
  }

  const invoices = (data ?? []).map((inv: any) => {
    // total_with_tax can legitimately be 0 (older/mis-synced rows) — fall back
    // to the net amount so the list never shows a misleading 0 total.
    const total = Number(inv.total_with_tax) > 0 ? inv.total_with_tax : (inv.amount ?? 0)
    const remaining =
      inv.remaining_amount != null ? inv.remaining_amount : Math.max(0, total - (inv.paid_amount ?? 0))
    const partnerName =
      inv.business_partner?.name ??
      (inv.orders?.customer_id ? customerNameById.get(inv.orders.customer_id) : null) ??
      null
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number ?? inv.external_invoice_number ?? null,
      direction: inv.direction,
      partnerName,
      orderId: inv.order_id,
      orderReference: inv.orders?.reference_number ?? inv.orders?.customer_reference ?? null,
      amount: inv.amount ?? 0,
      totalWithTax: total,
      paidAmount: inv.paid_amount ?? 0,
      remainingAmount: Math.round(remaining * 100) / 100,
      currency: inv.currency ?? "EUR",
      status: inv.status,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      paidDate: inv.paid_date,
      accountingSystem: inv.accounting_system,
      accountingSyncStatus: inv.accounting_sync_status,
    }
  })

  return NextResponse.json({ invoices, count: invoices.length })
}
