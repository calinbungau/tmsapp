/**
 * GET /api/saga/invoices/pending
 *
 * Pulled by the Saga agent running on the accountant's server.
 * Returns outgoing TMS invoices that need to be pushed to Saga:
 *   - 'pending' → new invoices, agent should INSERT into Saga
 *   - 'modified' → edited after initial sync, agent should UPDATE existing Saga doc
 * Excludes 'paid' invoices (locked/completed).
 *
 * Auth: x-api-key / x-api-username / x-api-secret  (scope: saga:read)
 *
 * Optional query params:
 *   limit  max number of invoices to return (default 50, max 200)
 */

import { type NextRequest, NextResponse } from "next/server"
import { authenticateApiRequest, getServiceClient } from "@/lib/api-auth"
import { mapInvoiceToSaga } from "@/lib/saga/mapper"
import { getBnrRate } from "@/lib/saga/bnr-rate"
import type { SagaPendingInvoice } from "@/lib/saga/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req, "saga:read")
  if (!auth.ok || !auth.credential) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const adminId = auth.credential.admin_id

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200)

  const supabase = getServiceClient()

  // Load Saga config for this tenant (default VAT rate).
  const { data: config } = await supabase
    .from("billing_integrations")
    .select("saga_default_vat_rate")
    .eq("admin_id", adminId)
    .eq("provider", "saga")
    .maybeSingle()

  const { data: invoices, error } = await supabase
    .from("order_invoices")
    .select(
      "id, order_id, direction, business_partner_id, amount, currency, tax_rate, issue_date, due_date, line_items, notes, exchange_rate, accounting_sync_status, accounting_sync_id, total_with_tax, paid_amount, remaining_amount, paid_date, status",
    )
    .eq("admin_id", adminId)
    .eq("direction", "outgoing")
    .eq("accounting_system", "saga")
    .in("accounting_sync_status", ["pending", "modified"])
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = invoices ?? []
  if (list.length === 0) {
    return NextResponse.json({ count: 0, invoices: [] })
  }

  // Batch-load related orders first (the order carries the customer link).
  const orderIds = [...new Set(list.map((i) => i.order_id).filter(Boolean))]
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id, reference_number, cargo_description, customer_id").in("id", orderIds)
    : { data: [] as any[] }

  const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]))

  // The customer can come from the invoice (business_partner_id) or, more
  // commonly, from the parent order (customer_id). Resolve both.
  const partnerIds = [
    ...new Set(
      [
        ...list.map((i) => i.business_partner_id),
        ...(orders ?? []).map((o: any) => o.customer_id),
      ].filter(Boolean),
    ),
  ]

  const { data: partners } = partnerIds.length
    ? await supabase.from("business_partners").select("id, name, vat_number, tax_id").in("id", partnerIds)
    : { data: [] as any[] }

  const partnerMap = new Map((partners ?? []).map((p: any) => [p.id, p]))

  // For foreign-currency (VALUTA) invoices that don't yet have an FX rate,
  // auto-fetch the official BNR reference rate for the invoice date. Persist it
  // back onto the invoice so the rate is stable and shown on the PDF.
  const rateMap = new Map<string, number>()
  await Promise.all(
    list.map(async (inv) => {
      const currency = (inv.currency || "RON").toUpperCase()
      if (currency === "RON" || currency === "LEI") return
      const existing = Number(inv.exchange_rate)
      if (Number.isFinite(existing) && existing > 0) {
        rateMap.set(inv.id, existing)
        return
      }
      const bnr = await getBnrRate(currency, inv.issue_date)
      if (bnr && bnr.rate > 0) {
        rateMap.set(inv.id, bnr.rate)
        // Persist so future pulls / the PDF reuse the same rate.
        await supabase.from("order_invoices").update({ exchange_rate: bnr.rate }).eq("id", inv.id)
      }
    }),
  )

  const payload: SagaPendingInvoice[] = list.map((inv) => {
    const resolvedRate = rateMap.get(inv.id) ?? (inv.exchange_rate as number | null) ?? null
    const order = orderMap.get(inv.order_id) ?? null
    const partner =
      partnerMap.get(inv.business_partner_id) ?? (order ? partnerMap.get(order.customer_id) : null) ?? null
    const isModified = inv.accounting_sync_status === "modified"
    // Surface any recorded payment so the agent can reflect it in Saga.
    const paidAmount = Number(inv.paid_amount) || 0
    const total = Number(inv.total_with_tax ?? inv.amount) || 0
    const remainingAmount =
      inv.remaining_amount != null ? Number(inv.remaining_amount) : Math.max(0, total - paidAmount)
    const hasPayment = paidAmount > 0 || inv.status === "paid"
    return {
      tmsInvoiceId: inv.id,
      orderReference: order?.reference_number ?? null,
      factura: mapInvoiceToSaga({
        invoice: { ...inv, exchange_rate: resolvedRate } as any,
        order,
        partner,
        config: config ?? null,
      }),
      // Tell the agent whether to INSERT (new) or UPDATE (modified) the Saga doc
      syncAction: isModified ? "update" : "insert",
      // If updating, pass the existing Saga number so agent can locate the row
      ...(isModified && inv.accounting_sync_id ? { sagaNumber: inv.accounting_sync_id } : {}),
      // Payment state so the agent can record the incasare / set NEACHITAT in Saga
      ...(hasPayment
        ? {
            payment: {
              paidAmount: Math.round(paidAmount * 100) / 100,
              remainingAmount: Math.round(remainingAmount * 100) / 100,
              paidDate: inv.paid_date ?? null,
              fullyPaid: inv.status === "paid" || remainingAmount <= 0,
            },
          }
        : {}),
    }
  })

  // Audit the pull.
  await supabase.from("saga_sync_log").insert({
    admin_id: adminId,
    api_credential_id: auth.credential.id,
    direction: "pull",
    status: "ok",
    payload: { count: payload.length, invoiceIds: list.map((i) => i.id) },
  })

  return NextResponse.json({ count: payload.length, invoices: payload })
}
