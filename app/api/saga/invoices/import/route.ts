/**
 * POST /api/saga/invoices/import   (Phase 2 — scaffold)
 *
 * Reserved for the reverse flow: the agent pushes invoices that exist in Saga
 * back into the TMS so we can reconcile / detect drift. For now this endpoint
 * authenticates, logs the received payload, and returns a diff-only preview
 * without mutating invoices. The actual reconciliation logic will be built
 * on top of this once the validation loop is in production.
 *
 * Auth: x-api-key / x-api-username / x-api-secret  (scope: saga:import)
 */

import { type NextRequest, NextResponse } from "next/server"
import { authenticateApiRequest, getServiceClient } from "@/lib/api-auth"
import type { SagaFactura } from "@/lib/saga/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ImportBody {
  invoices: Array<{ sagaNumber: string; refTMS?: string; factura: SagaFactura }>
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req, "saga:import")
  if (!auth.ok || !auth.credential) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const adminId = auth.credential.admin_id

  let body: ImportBody
  try {
    body = (await req.json()) as ImportBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const incoming = Array.isArray(body?.invoices) ? body.invoices : []
  const supabase = getServiceClient()

  // Build a diff preview against existing TMS invoices (no writes yet).
  const diffs: Array<Record<string, any>> = []
  for (const item of incoming) {
    const ref = item.refTMS || item.factura?.refTMS
    if (!ref) {
      diffs.push({ sagaNumber: item.sagaNumber, matched: false, reason: "missing refTMS" })
      continue
    }
    const { data: match } = await supabase
      .from("order_invoices")
      .select("id, invoice_number, amount, total_with_tax, accounting_sync_id")
      .eq("admin_id", adminId)
      .or(`invoice_number.eq.${ref},accounting_sync_id.eq.${item.sagaNumber}`)
      .maybeSingle()

    const sagaValoare = (item.factura?.linii ?? []).reduce((s, l) => s + (Number(l.valoare) || 0), 0)
    const sagaTva = (item.factura?.linii ?? []).reduce((s, l) => s + (Number(l.tva) || 0), 0)
    const sagaTotal = Math.round((sagaValoare + sagaTva + Number.EPSILON) * 100) / 100

    diffs.push({
      sagaNumber: item.sagaNumber,
      refTMS: ref,
      matched: !!match,
      tmsInvoiceId: match?.id ?? null,
      changed: match ? Math.abs(Number(match.total_with_tax ?? 0) - sagaTotal) > 0.01 : null,
      tmsTotal: match?.total_with_tax ?? null,
      sagaTotal,
    })
  }

  await supabase.from("saga_sync_log").insert({
    admin_id: adminId,
    api_credential_id: auth.credential.id,
    direction: "import",
    status: "ok",
    payload: { count: incoming.length, diffs } as any,
  })

  return NextResponse.json({
    ok: true,
    mode: "preview",
    message: "Import preview only — reconciliation not yet enabled.",
    count: incoming.length,
    diffs,
  })
}
