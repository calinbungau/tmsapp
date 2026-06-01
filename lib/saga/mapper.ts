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

/** ISO-2 codes we recognise from a VAT prefix (EU + a few extras). */
const ISO2_CODES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "GB", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "NO",
  "PL", "PT", "RO", "SE", "SI", "SK", "CH", "TR", "RS", "UA", "MD", "XI",
])

/** Map a free-text country name (e.g. "Italy") to an ISO-2 code. */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  austria: "AT", belgium: "BE", bulgaria: "BG", cyprus: "CY",
  "czech republic": "CZ", czechia: "CZ", germany: "DE", denmark: "DK",
  estonia: "EE", greece: "GR", spain: "ES", finland: "FI", france: "FR",
  croatia: "HR", hungary: "HU", ireland: "IE", italy: "IT", italia: "IT",
  lithuania: "LT", luxembourg: "LU", latvia: "LV", malta: "MT",
  netherlands: "NL", poland: "PL", portugal: "PT", romania: "RO", romania_: "RO",
  sweden: "SE", slovenia: "SI", slovakia: "SK", switzerland: "CH",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", norway: "NO",
  turkey: "TR", serbia: "RS", ukraine: "UA", moldova: "MD",
}

/** Normalise a VAT string: uppercase, no spaces/dots/dashes. */
function normalizeVat(v: string | null | undefined): string {
  return (v ?? "").toString().toUpperCase().replace(/[\s.\-/]/g, "")
}

/** Leading two-letter ISO prefix of a VAT, if any (e.g. "IT0007..." -> "IT"). */
function vatCountryPrefix(v: string | null | undefined): string | null {
  const n = normalizeVat(v)
  const m = n.match(/^([A-Z]{2})\d/)
  if (m && ISO2_CODES.has(m[1])) return m[1]
  return null
}

/**
 * Resolve the client country (ISO-2) + fiscal code Saga should receive.
 *
 * Priority for country: VAT prefix > free-text country name > "RO" default.
 *  - Romanian clients: CIF is digits only (Saga stores RO clients by CUI).
 *  - Foreign clients: send the FULL VAT incl. the ISO prefix so the agent does
 *    not mistake it for a Romanian CUI and create the client as TARA = 'RO'.
 */
function resolveClientFiscal(partner: {
  vat_number?: string | null
  tax_id?: string | null
  country?: string | null
}): { tara: string; cif: string } {
  const vat = partner.vat_number || partner.tax_id || ""
  const prefix = vatCountryPrefix(partner.vat_number) || vatCountryPrefix(partner.tax_id)
  const nameIso = partner.country
    ? COUNTRY_NAME_TO_ISO[partner.country.trim().toLowerCase()] ?? null
    : null

  const tara = prefix || nameIso || "RO"

  if (tara === "RO") {
    return { tara, cif: cleanCIF(partner.vat_number, partner.tax_id) }
  }

  // Foreign client: ensure the VAT carries its ISO prefix.
  let cif = normalizeVat(vat)
  if (cif && !/^[A-Z]{2}/.test(cif)) cif = tara + cif
  return { tara, cif }
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
    exchange_rate?: number | null
  }
  order: {
    reference_number: string | null
    cargo_description: string | null
  } | null
  partner: {
    name: string | null
    vat_number: string | null
    tax_id: string | null
    country: string | null
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

  // The "Invoice Line Description" the user types in the dialog is stored in
  // invoice.notes. It is the human-written article/line name and takes
  // priority over the order's cargo description.
  const lineDescription = (invoice.notes || "").trim()

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
        descriere: clamp(
          li.description ?? li.descriere ?? (lineDescription || order?.cargo_description || "Servicii transport"),
          200,
        ),
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
        descriere: clamp(
          lineDescription || order?.cargo_description || `Servicii transport ${order?.reference_number ?? ""}`.trim(),
          200,
        ),
        um: "BUC",
        cantitate: 1,
        pret: round(valoare, 4),
        valoare,
        procTVA,
        tva,
      },
    ]
  }

  const { tara: clientTara, cif: clientCIF } = resolveClientFiscal(partner ?? {})

  const factura: SagaFactura = {
    tip,
    clientCIF,
    clientTara,
    clientNume: clamp(partner?.name || "", 64),
    data: invoice.issue_date || new Date().toISOString().slice(0, 10),
    scadenta: invoice.due_date || invoice.issue_date || new Date().toISOString().slice(0, 10),
    refTMS: clamp(order?.reference_number || invoice.id, 150),
    linii,
  }

  if (tip === "VALUTA") {
    factura.moneda = clamp(currency, 10)
    // Pass the BNR reference rate when available so the agent can post the
    // VALUTA invoice straight to Saga without manual intervention.
    const rate = Number(invoice.exchange_rate)
    if (Number.isFinite(rate) && rate > 0) {
      factura.cursRef = round(rate, 4)
    }
  }

  return factura
}
