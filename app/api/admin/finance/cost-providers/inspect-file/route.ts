/**
 * Inspect a freshly uploaded supplier file:
 *   - Returns headers + sheet names + first N preview rows.
 *   - Optionally suggests a field mapping by fuzzy-matching the file's
 *     headers against our canonical TARGET_FIELDS (used by "Suggest mapping
 *     from sample file" in the provider editor).
 *
 * POST multipart/form-data with `file` field, plus optional:
 *   - sheet_name        (xlsx)
 *   - header_row_index  (defaults 0)
 *   - format            ("xlsx" | "xls" | "csv" | "auto")
 *   - delimiter         (csv)
 *   - has_header_row    ("true" | "false", default true)
 *   - suggest           ("true" → run fuzzy mapping suggestion)
 */

import { NextRequest, NextResponse } from "next/server"
import { parseBuffer, headerSimilarity } from "@/lib/cost-imports/parse"
import { TARGET_FIELDS, type TargetField } from "@/lib/cost-imports/types"

export const runtime = "nodejs"
// Excel files can be a few MB — bump body limit by streaming the FormData.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get("file") as File | null
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const headerRowIndex = Number(fd.get("header_row_index") ?? 0) || 0
  const sheetName = (fd.get("sheet_name") as string) || undefined
  const format = (fd.get("format") as string) || "auto"
  const delimiter = (fd.get("delimiter") as string) || ""
  const hasHeader = String(fd.get("has_header_row") ?? "true") !== "false"

  const parsed = parseBuffer(buf, file.name, {
    format: (format as "auto" | "xlsx" | "xls" | "csv") || "auto",
    sheetName,
    headerRowIndex,
    delimiter: delimiter || undefined,
    hasHeaderRow: hasHeader,
  })

  const previewRows = parsed.rows.slice(0, 10)

  let suggestions: Partial<Record<TargetField, string>> | undefined
  if (String(fd.get("suggest") ?? "false") === "true") {
    suggestions = suggestMapping(parsed.headers)
  }

  return NextResponse.json({
    headers: parsed.headers,
    sheets: parsed.sheets ?? [],
    row_count: parsed.rows.length,
    preview: previewRows,
    suggestions,
  })
}

/**
 * Fuzzy-match each canonical TARGET_FIELD against the file's source columns.
 * For each target we pick the highest-scoring source column above 0.4.
 * Plus dictionary hints for common European fleet supplier formats.
 */
function suggestMapping(headers: string[]): Partial<Record<TargetField, string>> {
  const dict: Record<TargetField, string[]> = {
    entry_date: ["data", "date", "beleg-datum", "transaction date", "data tranzactie", "datum"],
    posting_date: ["data postarii", "buchungs-datum", "posting date"],
    country_code: ["cod tara", "cod țară", "land", "country", "tara"],
    vehicle_plate: ["vehicul", "kfz-kennzeichen", "numar inmatriculare", "plate", "vehicle"],
    external_id: ["identificator tranzactie", "transaction id", "beleg-nr", "numar tranzactie"],
    invoice_number: ["numar factura", "număr factură", "rechnungs-nr", "invoice number"],
    vendor_name: ["retea", "reţea", "akzeptanzpartner", "statie", "station", "merchant", "vendor"],
    currency: ["moneda", "moneda tranzactiei", "moneda tranzacţiei", "currency", "währung"],
    amount_incl_vat: ["valoare bruta", "valoare cu tva", "brutto-betrag", "gross", "total"],
    amount_excl_vat: ["valoare neta", "valoare netă", "valoare fara tva", "netto-betrag", "net"],
    tax_amount: ["valoare tva", "tva", "mwst-betrag", "vat amount"],
    tax_rate: ["rata tva", "cota tva", "mwst-satz", "vat rate"],
    amount_eur: ["valoare neta in euro", "valoare netă in euro", "amount eur", "betrag eur"],
    tax_amount_eur: ["valoarea tva (euro)", "tva euro", "vat eur"],
    liters_qty: ["cantitate", "menge", "litri", "liters", "volume"],
    kwh_qty: ["kwh", "energy"],
    km_qty: ["km", "kilometri", "distance"],
    units_qty: ["units", "quantity", "buc"],
    location_label: ["nume statie", "nume staţie", "ort", "adresa statie", "location"],
    product_code: ["nume produs", "produktbezeichnung", "produs", "product"],
    driver_name: ["nume sofer", "nume şofer", "driver", "fahrer"],
    driver_card: ["nr. card", "nr card", "karten-nr", "card", "card no"],
    notes: ["tip card", "kartentyp", "card type", "notes"],
  }

  const out: Partial<Record<TargetField, string>> = {}
  for (const f of TARGET_FIELDS) {
    let best = ""
    let bestScore = 0
    for (const h of headers) {
      // Combine dictionary hits with raw label similarity.
      const dictMax = (dict[f.key] || []).reduce(
        (m, hint) => Math.max(m, headerSimilarity(hint, h)),
        0,
      )
      const labelScore = headerSimilarity(f.label, h)
      const score = Math.max(dictMax, labelScore * 0.7)
      if (score > bestScore) {
        bestScore = score
        best = h
      }
    }
    if (bestScore >= 0.5 && best) out[f.key] = best
  }
  return out
}
