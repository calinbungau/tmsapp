import type { SagaFactura, SagaLinie } from "./types"

/** Default Romanian standard VAT rate. */
const DEFAULT_VAT_RATE = 21

/** Round helper to a fixed number of decimals (avoids float drift). */
function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * f) / f
}

/** Resolve the VAT percentage, defaulting to the RO standard rate (21). */
function resolveVat(rate: number | null | undefined): number {
  const r = Number(rate)
  if (!Number.isFinite(r) || r <= 0) return DEFAULT_VAT_RATE
  return Math.round(r)
}

/** Truncate to a max length (Saga has strict field limits). */
function clamp(value: string | null | undefined, max: number): string {
  return (value ?? "").toString().slice(0, max)
}

/** Extract a clean fiscal code (CUI) from a VAT/tax id, e.g. "RO12345678" -> "12345678". */
function cleanCIF(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!c) continue
    const digits = c.toString().replace(/[^0-9]/g, "")
    if (digits) return digits
  }
  return ""
}

export interface MapToSagaInput {
  invoice: {
    id: string
    amount: number | null
    currency: string | null
    tax_rate: number | null
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
    vat_number: string | null
    tax_id: string | null
  } | null
  config: {
    saga_default_vat_rate: number | null
  } | null
}

/**
 * Builds a SagaFactura from a TMS outgoing invoice + related order/partner.
 *
 * The invoice number is intentionally NOT included — Saga generates it during
 * validation. `refTMS` carries the TMS order reference for human matching only.
 * FX rate (cursRef) is left for the agent / accountant to fill for VALUTA.
 */
export function mapInvoiceToSaga(input: MapToSagaInput): SagaFactura {
  const { invoice, order, partner, config } = input

  const currency = (invoice.currency || "RON").toUpperCase()
  const tip = currency === "RON" ? "RON" : "VALUTA"
  const defaultVat = config?.saga_default_vat_rate ?? DEFAULT_VAT_RATE

  // Line items: prefer explicit invoice.line_items, otherwise synthesize one line.
  let linii: SagaLinie[] = []
  const rawLines = Array.isArray(invoice.line_items) ? invoice.line_items : []

  if (rawLines.length > 0) {
    linii = rawLines.map((li: any) => {
      const cantitate = round(Number(li.quantity ?? li.cantitate ?? 1), 3)
      const pret = round(Number(li.unit_price ?? li.price ?? li.pret ?? 0), 4)
      const valoare = round(
        li.value != null || li.valoare != null ? Number(li.value ?? li.valoare) : cantitate * pret,
        2,
      )
      const procTVA = resolveVat(li.vat_rate ?? li.procTVA ?? invoice.tax_rate ?? defaultVat)
      const tva = round(valoare * (procTVA / 100), 2)
      return {
        descriere: clamp(li.description ?? li.descriere ?? order?.cargo_description ?? "Servicii transport", 60),
        um: clamp(li.unit ?? li.um ?? "BUC", 5),
        cantitate,
        pret,
        valoare,
        procTVA,
        tva,
      }
    })
  } else {
    const valoare = round(Number(invoice.amount ?? 0), 2)
    const procTVA = resolveVat(invoice.tax_rate ?? defaultVat)
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
      },
    ]
  }

  const factura: SagaFactura = {
    tip,
    clientCIF: cleanCIF(partner?.vat_number, partner?.tax_id),
    clientNume: clamp(partner?.name || "", 64),
    data: invoice.issue_date || new Date().toISOString().slice(0, 10),
    scadenta: invoice.due_date || invoice.issue_date || new Date().toISOString().slice(0, 10),
    refTMS: clamp(order?.reference_number || invoice.id, 150),
    linii,
  }

  if (tip === "VALUTA") {
    factura.moneda = clamp(currency, 10)
    // cursRef intentionally omitted — the agent/accountant supplies the BNR rate.
  }

  return factura
}
