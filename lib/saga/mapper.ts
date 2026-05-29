import type { SagaFactura, SagaLinie } from "./types"

/** Round helper to a fixed number of decimals (avoids float drift). */
function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * f) / f
}

/** Normalize a VAT percentage to the Saga-allowed enum (0,5,9,19). */
function normalizeVat(rate: number | null | undefined): 0 | 5 | 9 | 19 {
  const r = Math.round(Number(rate ?? 0))
  if (r >= 19) return 19
  if (r >= 9) return 9
  if (r >= 5) return 5
  return 0
}

/** Truncate to a max length (Saga has strict field limits). */
function clamp(value: string | null | undefined, max: number): string {
  return (value ?? "").toString().slice(0, max)
}

export interface MapToSagaInput {
  invoice: {
    id: string
    invoice_number: string | null
    amount: number | null
    currency: string | null
    tax_rate: number | null
    total_with_tax: number | null
    issue_date: string | null
    due_date: string | null
    line_items: any
    notes: string | null
  }
  order: {
    reference_number: string | null
    cargo_description: string | null
  } | null
  partner: {
    name: string | null
  } | null
  mapping: {
    saga_cod: string | null
    cont_client: string | null
    default_cont: string | null
    default_tip_o: string | null
  } | null
  config: {
    saga_default_cont: string | null
    saga_default_tip_o: string | null
    saga_client_account_prefix: string | null
    saga_default_vat_rate: number | null
  } | null
}

/**
 * Builds a SagaFactura from a TMS outgoing invoice + related order/partner.
 * Falls back to sensible defaults; FX rate (cursRef) is left for the agent /
 * accountant to fill when missing for VALUTA invoices.
 */
export function mapInvoiceToSaga(input: MapToSagaInput): SagaFactura {
  const { invoice, order, partner, mapping, config } = input

  const currency = (invoice.currency || "RON").toUpperCase()
  const tip = currency === "RON" ? "RON" : "VALUTA"

  const defaultCont = mapping?.default_cont || config?.saga_default_cont || "704.1"
  const tipO = mapping?.default_tip_o || config?.saga_default_tip_o || "007"
  const prefix = config?.saga_client_account_prefix || "4111"
  const cod = clamp(mapping?.saga_cod || "", 8)
  const contClient = clamp(mapping?.cont_client || (cod ? `${prefix}.${cod}` : prefix), 20)

  // Line items: prefer explicit invoice.line_items, otherwise synthesize one line.
  let linii: SagaLinie[] = []
  const rawLines = Array.isArray(invoice.line_items) ? invoice.line_items : []

  if (rawLines.length > 0) {
    linii = rawLines.map((li: any) => {
      const cantitate = round(Number(li.quantity ?? li.cantitate ?? 1), 3)
      const pret = round(Number(li.unit_price ?? li.price ?? li.pret ?? 0), 4)
      const valoare = round(
        li.value != null || li.valoare != null
          ? Number(li.value ?? li.valoare)
          : cantitate * pret,
        2,
      )
      const procTVA = normalizeVat(li.vat_rate ?? li.procTVA ?? invoice.tax_rate ?? config?.saga_default_vat_rate)
      const tva = round(valoare * (procTVA / 100), 2)
      return {
        descriere: clamp(li.description ?? li.descriere ?? order?.cargo_description ?? "Servicii transport", 60),
        um: clamp(li.unit ?? li.um ?? "BUC", 5),
        cantitate,
        pret,
        valoare,
        procTVA,
        tva,
        cont: clamp(li.account ?? li.cont ?? defaultCont, 20),
      }
    })
  } else {
    const valoare = round(Number(invoice.amount ?? 0), 2)
    const procTVA = normalizeVat(invoice.tax_rate ?? config?.saga_default_vat_rate)
    const tva = round(valoare * (procTVA / 100), 2)
    linii = [
      {
        descriere: clamp(order?.cargo_description || `Servicii transport ${order?.reference_number ?? ""}`.trim(), 60),
        um: "BUC",
        cantitate: 1,
        pret: round(valoare, 4),
        valoare,
        procTVA,
        tva,
        cont: clamp(defaultCont, 20),
      },
    ]
  }

  const factura: SagaFactura = {
    tip,
    cod,
    clientNume: clamp(partner?.name || "", 64),
    data: invoice.issue_date || new Date().toISOString().slice(0, 10),
    scadenta: invoice.due_date || invoice.issue_date || new Date().toISOString().slice(0, 10),
    refTMS: clamp(invoice.invoice_number || order?.reference_number || invoice.id, 150),
    contClient,
    tipO,
    linii,
  }

  if (tip === "VALUTA") {
    factura.moneda = clamp(currency, 10)
    // cursRef intentionally omitted — the agent/accountant supplies the BNR rate.
  }

  return factura
}
