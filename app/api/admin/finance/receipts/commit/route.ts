/**
 * Commit operator-approved bank receipts as invoice payments.
 *
 * Body: { admin_id, items: ReceiptCommitItem[] }
 *
 * For each item we:
 *  - insert a row into order_invoice_payments (bankRef stored as
 *    reference_number so re-imports are de-duplicated),
 *  - recompute paid_amount / remaining_amount / status on the invoice,
 *  - re-flag the invoice as Saga 'modified' (if already in Saga) so the
 *    agent pushes the new paid amount on its next poll.
 *
 * Idempotent: an item whose bankRef already exists on the invoice is skipped.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { ReceiptCommitItem } from "@/lib/bank-imports/types"

export const runtime = "nodejs"
export const maxDuration = 60

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

interface Body {
  admin_id: string
  items: ReceiptCommitItem[]
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body
  const { admin_id, items } = body
  if (!admin_id || !Array.isArray(items)) {
    return NextResponse.json({ error: "admin_id and items required" }, { status: 400 })
  }

  const supabase = service()

  let recorded = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of items) {
    if (!item.invoiceId || !item.bankRef || !(item.amount > 0)) {
      skipped++
      continue
    }

    try {
      // Load the invoice (tenant-scoped).
      const { data: invoice, error: invErr } = await supabase
        .from("order_invoices")
        .select(
          "id, amount, total_with_tax, paid_amount, remaining_amount, status, accounting_system, accounting_sync_status",
        )
        .eq("id", item.invoiceId)
        .eq("admin_id", admin_id)
        .single()
      if (invErr || !invoice) {
        errors.push(`Factura ${item.invoiceId}: negasita`)
        continue
      }

      // De-dup: same bank reference already recorded on this invoice?
      const { data: dup } = await supabase
        .from("order_invoice_payments")
        .select("id")
        .eq("admin_id", admin_id)
        .eq("invoice_id", item.invoiceId)
        .eq("reference_number", item.bankRef)
        .maybeSingle()
      if (dup) {
        skipped++
        continue
      }

      // Insert the payment. Column shape mirrors handleRecordPayment:
      // no currency column (inherited from invoice), reference_number holds
      // the bank ref, created_by left null (admin has no users row).
      const { error: payErr } = await supabase.from("order_invoice_payments").insert({
        invoice_id: item.invoiceId,
        admin_id,
        amount: Math.round(item.amount * 100) / 100,
        payment_date: item.paymentDate || new Date().toISOString().split("T")[0],
        payment_method: "bank_transfer",
        reference_number: item.bankRef,
        is_skonto: false,
        notes: buildNote(item),
        created_by: null,
      })
      if (payErr) {
        errors.push(`Factura ${item.invoiceId}: ${payErr.message}`)
        continue
      }

      // Recompute invoice payment state.
      const totalDue = invoice.total_with_tax || invoice.amount || 0
      const newPaid = Math.round(((invoice.paid_amount || 0) + item.amount) * 100) / 100
      const remaining = Math.max(0, Math.round((totalDue - newPaid) * 100) / 100)
      const fullyPaid = newPaid >= totalDue - 0.01

      const update: Record<string, unknown> = {
        paid_amount: newPaid,
        remaining_amount: remaining,
        status: fullyPaid ? "paid" : invoice.status === "issued" ? "partially_paid" : invoice.status,
        paid_date: fullyPaid ? item.paymentDate || new Date().toISOString().split("T")[0] : null,
      }

      // Reflect the payment in Saga on the next agent poll.
      if (
        invoice.accounting_system === "saga" &&
        ["synced", "validated", "paid"].includes(String(invoice.accounting_sync_status))
      ) {
        update.accounting_sync_status = "modified"
        update.accounting_sync_error = null
      }

      const { error: updErr } = await supabase
        .from("order_invoices")
        .update(update)
        .eq("id", item.invoiceId)
        .eq("admin_id", admin_id)
      if (updErr) {
        errors.push(`Factura ${item.invoiceId}: ${updErr.message}`)
        continue
      }

      recorded++
    } catch (e) {
      errors.push(`Factura ${item.invoiceId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ recorded, skipped, errors })
}

function buildNote(item: ReceiptCommitItem): string {
  const parts = ["Incasare bancara (CAMT.053)"]
  if (item.debtorName) parts.push(`de la ${item.debtorName}`)
  if (item.currency) parts.push(`${item.amount} ${item.currency}`)
  if (item.remittanceInfo) parts.push(`— ${item.remittanceInfo}`)
  return parts.join(" ")
}
