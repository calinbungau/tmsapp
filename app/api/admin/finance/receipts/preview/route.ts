/**
 * Preview a bank statement (CAMT.053 / BT GO) for receipt import ("incasari").
 *
 * Body: multipart/form-data { file: .xml, admin_id }
 *
 * - Parses only incoming credits (CRDT).
 * - Matches each credit to a customer (debtor) by IBAN then fuzzy name.
 * - Matches each credit to an open invoice by reference-in-text, then exact
 *   open-amount; remaining open invoices for the customer are offered for
 *   manual selection.
 * - Flags credits already recorded (by bank reference) as duplicates.
 *
 * Returns a ReceiptPreviewResult; nothing is written to the DB here.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseCamt053 } from "@/lib/bank-imports/camt"
import {
  matchPartner,
  matchInvoices,
  classifyRow,
  type PartnerRecord,
  type OpenInvoiceRecord,
} from "@/lib/bank-imports/match"
import type { ReceiptPreviewResult, ReceiptPreviewRow } from "@/lib/bank-imports/types"

export const runtime = "nodejs"
export const maxDuration = 60

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 })
  }

  const file = form.get("file")
  const adminId = String(form.get("admin_id") || "")
  if (!adminId) return NextResponse.json({ error: "admin_id required" }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })

  const xml = await file.text()

  let parsed
  try {
    parsed = parseCamt053(xml)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Nu am putut citi fisierul CAMT.053" },
      { status: 400 },
    )
  }

  const supabase = service()

  // Load this tenant's customers (business partners) for matching.
  const { data: partnersData, error: pErr } = await supabase
    .from("business_partners")
    .select("id, name, bank_iban")
    .eq("admin_id", adminId)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  const partners: PartnerRecord[] = partnersData ?? []

  // Load open (unpaid / partially paid) invoices with their order reference.
  const { data: invData, error: iErr } = await supabase
    .from("order_invoices")
    .select(
      "id, invoice_number, amount, total_with_tax, paid_amount, remaining_amount, currency, status, business_partner_id, order_id, orders(reference_number, customer_reference)",
    )
    .eq("admin_id", adminId)
    .eq("direction", "outgoing")
    .in("status", ["issued", "partially_paid", "sent", "overdue"])
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  // Map of partner id -> name for labeling candidates.
  const partnerNameById = new Map(partners.map((p) => [p.id, p.name ?? ""]))

  const openInvoices: OpenInvoiceRecord[] = (invData ?? []).map((inv: any) => {
    const total = inv.total_with_tax ?? inv.amount ?? 0
    const remaining =
      inv.remaining_amount != null ? inv.remaining_amount : Math.max(0, total - (inv.paid_amount ?? 0))
    const orderRef = inv.orders?.reference_number ?? inv.orders?.customer_reference ?? null
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      order_id: inv.order_id,
      order_reference: orderRef,
      business_partner_id: inv.business_partner_id,
      partner_name: inv.business_partner_id ? partnerNameById.get(inv.business_partner_id) ?? null : null,
      currency: inv.currency,
      total_with_tax: total,
      remaining_amount: Math.round(remaining * 100) / 100,
    }
  })

  // Detect already-recorded receipts by bank reference.
  const bankRefs = parsed.credits.map((c) => c.bankRef).filter(Boolean)
  let recordedRefs = new Set<string>()
  if (bankRefs.length > 0) {
    const { data: existing } = await supabase
      .from("order_invoice_payments")
      .select("reference_number")
      .eq("admin_id", adminId)
      .in("reference_number", bankRefs)
    for (const r of existing ?? []) {
      if (r.reference_number) recordedRefs.add(r.reference_number as string)
    }
  }

  const rows: ReceiptPreviewRow[] = parsed.credits.map((credit, idx) => {
    if (recordedRefs.has(credit.bankRef)) {
      return {
        id: `r${idx}`,
        credit,
        status: "duplicate",
        partner: null,
        candidates: [],
        suggestedInvoiceId: null,
        note: "Deja inregistrata (referinta bancara existenta).",
      }
    }

    const partner = matchPartner(credit, partners)
    const candidates = matchInvoices(credit, partner, openInvoices)
    const { status, suggestedInvoiceId, note } = classifyRow(partner, candidates)

    return { id: `r${idx}`, credit, status, partner, candidates, suggestedInvoiceId, note }
  })

  const summary = {
    totalCredits: rows.length,
    matched: rows.filter((r) => r.status === "matched").length,
    review: rows.filter((r) => r.status === "review").length,
    unmatched: rows.filter((r) => r.status === "unmatched").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
  }

  const result: ReceiptPreviewResult = { account: parsed.account, rows, summary }
  return NextResponse.json(result)
}
