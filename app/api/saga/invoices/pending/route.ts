/**
 * GET /api/saga/invoices/pending
 *
 * Pulled by the Saga agent running on the accountant's server.
 * Returns outgoing TMS invoices that are queued for Saga validation
 * (accounting_system = 'saga' AND accounting_sync_status = 'pending'),
 * mapped into the SagaFactura exchange format.
 *
 * Auth: x-api-key / x-api-username / x-api-secret  (scope: saga:read)
 *
 * Optional query params:
 *   limit  max number of invoices to return (default 50, max 200)
 */

import { type NextRequest, NextResponse } from "next/server"
import { authenticateApiRequest, getServiceClient } from "@/lib/api-auth"
import { mapInvoiceToSaga } from "@/lib/saga/mapper"
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
      "id, order_id, direction, business_partner_id, amount, currency, tax_rate, issue_date, due_date, line_items, notes",
    )
    .eq("admin_id", adminId)
    .eq("direction", "outgoing")
    .eq("accounting_system", "saga")
    .eq("accounting_sync_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = invoices ?? []
  if (list.length === 0) {
    return NextResponse.json({ count: 0, invoices: [] })
  }

  // Batch-load related orders and partners.
  const orderIds = [...new Set(list.map((i) => i.order_id).filter(Boolean))]
  const partnerIds = [...new Set(list.map((i) => i.business_partner_id).filter(Boolean))]

  const [{ data: orders }, { data: partners }] = await Promise.all([
    orderIds.length
      ? supabase.from("orders").select("id, reference_number, cargo_description").in("id", orderIds)
      : Promise.resolve({ data: [] as any[] }),
    partnerIds.length
      ? supabase.from("business_partners").select("id, name, vat_number, tax_id").in("id", partnerIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]))
  const partnerMap = new Map((partners ?? []).map((p: any) => [p.id, p]))

  const payload: SagaPendingInvoice[] = list.map((inv) => {
    const order = orderMap.get(inv.order_id) ?? null
    const partner = partnerMap.get(inv.business_partner_id) ?? null
    return {
      tmsInvoiceId: inv.id,
      orderReference: order?.reference_number ?? null,
      factura: mapInvoiceToSaga({ invoice: inv as any, order, partner, config: config ?? null }),
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
