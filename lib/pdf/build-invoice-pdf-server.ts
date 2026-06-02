/**
 * Server-side FACTURA builder for TMS/Saga invoices.
 * ──────────────────────────────────────────────────
 * TMS invoices synced to Saga have no SmartBill document and no stored
 * `file_url`, so when they need to be emailed (Send Docs to Customer) we have
 * to generate the Romanian FACTURA PDF on the fly — exactly like the order
 * panel does client-side via `buildInvoicePdf`. This is the server counterpart
 * so the send-docs API route can attach such invoices.
 *
 * It pulls the supplier (company_profiles + company_bank_accounts) and client
 * (business_partners) fiscal data, synthesises line items from
 * `line_items`/`amount`, and renders the PDF with the shared
 * `generateInvoicePdf` helper (jsPDF runs fine in Node).
 */
import { generateInvoicePdf } from "@/lib/pdf/generate-invoice-pdf"

type SupabaseLike = {
  from: (table: string) => any
}

export interface ServerInvoiceRow {
  id: string
  invoice_number: string | null
  issue_date: string | null
  due_date: string | null
  currency: string | null
  exchange_rate: number | null
  amount: number | null
  tax_rate: number | null
  notes: string | null
  line_items: any
  business_partner_id: string | null
  order_id: string | null
}

/**
 * Build a FACTURA PDF buffer for a single TMS/Saga invoice.
 * Returns null if the PDF could not be produced.
 */
export async function buildInvoicePdfBufferServer(
  supabase: SupabaseLike,
  adminId: string,
  inv: ServerInvoiceRow,
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const invCurrency = (inv.currency || "RON").toUpperCase()

    // ── Supplier = our company profile (+ currency-matched bank account) ──
    let supplier = {
      name: "",
      cif: "",
      regCom: "",
      address: null as string | null,
      city: null as string | null,
      country: null as string | null,
      bankName: null as string | null,
      iban: null as string | null,
      swift: null as string | null,
    }

    const { data: cp } = await supabase
      .from("company_profiles")
      .select(
        "company_name, vat_number, registration_number, address_line1, address_line2, city, country, bank_name, bank_iban, bank_swift",
      )
      .eq("admin_id", adminId)
      .single()
    if (cp) {
      supplier = {
        name: cp.company_name || "",
        cif: cp.vat_number || "",
        regCom: cp.registration_number || "",
        address: [cp.address_line1, cp.address_line2].filter(Boolean).join(", ") || null,
        city: cp.city || null,
        country: cp.country || null,
        bankName: cp.bank_name || null,
        iban: cp.bank_iban || null,
        swift: cp.bank_swift || null,
      }
    }

    const { data: banks } = await supabase
      .from("company_bank_accounts")
      .select("bank_name, iban, swift, currency, is_default")
      .eq("admin_id", adminId)
      .eq("currency", invCurrency)
      .order("is_default", { ascending: false })
      .order("sort_order", { ascending: true })
    const bank = banks?.[0]
    if (bank) {
      supplier.bankName = bank.bank_name || supplier.bankName
      supplier.iban = bank.iban || supplier.iban
      supplier.swift = bank.swift || supplier.swift
    }

    // ── Client = the invoice's business partner ──
    let client = {
      name: "",
      cif: "",
      address: null as string | null,
      city: null as string | null,
      country: null as string | null,
    }
    if (inv.business_partner_id) {
      const { data: bp } = await supabase
        .from("business_partners")
        .select("name, vat_number, tax_id, registration_number, address_line1, address_line2, city, country")
        .eq("id", inv.business_partner_id)
        .single()
      if (bp) {
        client = {
          name: bp.name || "",
          cif: bp.vat_number || bp.tax_id || "",
          address: [bp.address_line1, bp.address_line2].filter(Boolean).join(", ") || null,
          city: bp.city || null,
          country: bp.country || null,
        }
      }
    }

    // Order reference for the client block.
    let reference: string | null = inv.order_id || null
    if (inv.order_id) {
      const { data: ord } = await supabase
        .from("orders")
        .select("reference_number")
        .eq("id", inv.order_id)
        .single()
      if (ord?.reference_number) reference = ord.reference_number
    }

    // ── Line items: prefer explicit line_items, else synthesize one line. ──
    const defaultVat = inv.tax_rate && inv.tax_rate > 0 ? Math.round(inv.tax_rate) : 21
    const rawLines = Array.isArray(inv.line_items) && inv.line_items.length > 0 ? inv.line_items : null
    const lines = rawLines
      ? rawLines.map((li: any) => {
          const quantity = Number(li.quantity ?? 1) || 1
          const unitPrice = Number(li.unit_price ?? 0) || 0
          const value = Math.round(quantity * unitPrice * 100) / 100
          const vatRate = Number(li.tax_rate ?? defaultVat) || defaultVat
          const vat = Math.round(value * (vatRate / 100) * 100) / 100
          return {
            description: li.description || inv.notes || "Servicii transport",
            um: li.unit || "BUC",
            quantity,
            unitPrice,
            value,
            vatRate,
            vat,
          }
        })
      : (() => {
          const value = Number(inv.amount) || 0
          const vatRate = defaultVat
          const vat = Math.round(value * (vatRate / 100) * 100) / 100
          return [
            {
              description: inv.notes || `Servicii transport ${reference ?? ""}`.trim(),
              um: "BUC",
              quantity: 1,
              unitPrice: value,
              value,
              vatRate,
              vat,
            },
          ]
        })()

    const { blob, filename } = generateInvoicePdf({
      invoiceNumber: inv.invoice_number || "",
      date: inv.issue_date,
      dueDate: inv.due_date,
      currency: invCurrency,
      exchangeRate: inv.exchange_rate ?? null,
      reference,
      notes: inv.notes,
      supplier,
      client,
      lines,
    })

    const arrayBuf = await blob.arrayBuffer()
    return { buffer: Buffer.from(arrayBuf), filename }
  } catch (err) {
    console.error("[send-docs] server FACTURA generation failed", { invoiceId: inv.id, err })
    return null
  }
}
