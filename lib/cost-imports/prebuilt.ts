/**
 * Pre-built mapping templates for popular European fleet cost suppliers.
 *
 * IMPORTANT: cost_code values here use the codes from our seed catalog
 * (A1-xxx — see cost_catalog table). Conditional rules use the
 * `vehicle_match_field` + `vehicle_match_pattern` columns of
 * cost_provider_mappings as a generic "match if column equals/regex pattern"
 * filter (typically applied to `country_code` so "Road tax" can resolve to
 * the correct per-country toll code).
 */

import type { MappingTemplate, TargetField } from "./types"

export interface PrebuiltRule {
  external_name: string
  external_code?: string
  cost_code: string
  /** Optional: only match if another mapped field has this value (e.g. country_code = "DE"). */
  match_field?: TargetField
  /** Regex pattern (case-insensitive) tested against `match_field`. */
  match_pattern?: string
}

export interface PrebuiltTemplate {
  code: string
  name: string
  provider_type: string
  file_format: "xlsx" | "csv"
  default_currency: string
  default_cost_code?: string
  template: MappingTemplate
  rules: PrebuiltRule[]
  notes?: string
}

/**
 * Country → toll cost-code mapping using the seed catalog.
 *   A1-010 DE Maut, A1-011 AT GO-Maut, A1-012 HU HU-GO, A1-013 PL e-TOLL,
 *   A1-014 CZ Myto, A1-015 SK, A1-016 RO Rovinieta, A1-017 other EU.
 */
const TOLL_BY_COUNTRY: Array<{ cc: string; code: string }> = [
  { cc: "DE", code: "A1-010" },
  { cc: "AT", code: "A1-011" },
  { cc: "HU", code: "A1-012" },
  { cc: "PL", code: "A1-013" },
  { cc: "CZ", code: "A1-014" },
  { cc: "SK", code: "A1-015" },
  { cc: "RO", code: "A1-016" },
]

/** Build a "Road tax" rule for each country. Falls back to A1-017 (other EU). */
function tollRules(): PrebuiltRule[] {
  const labels = ["Road tax", "Toll", "Maut", "Vignette", "Road tax (Internal PC)"]
  const out: PrebuiltRule[] = []
  for (const label of labels) {
    for (const { cc, code } of TOLL_BY_COUNTRY) {
      out.push({
        external_name: label,
        cost_code: code,
        match_field: "country_code",
        match_pattern: `^${cc}$`,
      })
    }
    // Fallback "any country" — comes after specific ones so resolver picks specific first.
    out.push({ external_name: label, cost_code: "A1-017" })
  }
  return out
}

const T4E_SHELL_FIELDS: Partial<Record<TargetField, string | { column: string; transform: any }>> = {
  entry_date: { column: "Data", transform: "european_date" },
  posting_date: { column: "Data postarii", transform: "european_date" },
  country_code: "Cod țară",
  vehicle_plate: { column: "Vehicul", transform: "normalize_plate" },
  external_id: { column: "Identificator tranzactie", transform: "strip_apostrophe" },
  invoice_number: "Număr factură",
  vendor_name: "Reţea",
  currency: "Moneda tranzacţiei",
  amount_incl_vat: { column: "Valoare bruta (TVA si reducere incluse)", transform: "european_number" },
  amount_excl_vat: { column: "Valoare netă in moneda tranzacţiei", transform: "european_number" },
  tax_amount: { column: "Valoare TVA", transform: "european_number" },
  tax_rate: { column: "Rata TVA", transform: "european_number" },
  amount_eur: { column: "Valoare netă in EURO", transform: "european_number" },
  tax_amount_eur: { column: "Valoarea TVA (EURO)", transform: "european_number" },
  liters_qty: { column: "Cantitate", transform: "european_number" },
  location_label: "Nume staţie",
  product_code: "Nume produs",
  driver_name: "Nume şofer",
  driver_card: { column: "Nr. Card", transform: "strip_apostrophe" },
  notes: "Tip card",
}

const FUEL_PRODUCT_RULES: PrebuiltRule[] = [
  { external_name: "Diesel AGO", cost_code: "A1-001" },
  { external_name: "Diesel", cost_code: "A1-001" },
  { external_name: "Motorina", cost_code: "A1-001" },
  { external_name: "Motorină", cost_code: "A1-001" },
  { external_name: "V-Power Diesel", cost_code: "A1-001" },
  { external_name: "AdBlue", cost_code: "A1-002" },
  { external_name: "DEF", cost_code: "A1-002" },
  { external_name: "LNG", cost_code: "A1-003" },
  { external_name: "CNG", cost_code: "A1-003" },
  { external_name: "HVO", cost_code: "A1-005" },
  { external_name: "Biodiesel", cost_code: "A1-005" },
  // ancillaries
  { external_name: "Parking", cost_code: "A1-030" },
  { external_name: "Parcare", cost_code: "A1-030" },
  { external_name: "Wash", cost_code: "A1-031" },
  { external_name: "Spalare", cost_code: "A1-031" },
  { external_name: "Ferry", cost_code: "A1-021" },
  { external_name: "Tunnel", cost_code: "A1-020" },
]

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    code: "TOLL4EUROPE",
    name: "Toll4Europe / Shell / AGES (combined)",
    provider_type: "fuel_toll",
    file_format: "xlsx",
    default_currency: "EUR",
    default_cost_code: "A1-017",
    template: { version: 1, header_row_index: 0, fields: T4E_SHELL_FIELDS },
    rules: [...FUEL_PRODUCT_RULES, ...tollRules()],
    notes:
      "Matches the standard Toll4Europe combined export. Toll rows are mapped per country (DE→A1-010, AT→A1-011, HU→A1-012…). Falls back to A1-017 if country is unknown.",
  },
  {
    code: "SHELL",
    name: "Shell Fleet (Romanian export)",
    provider_type: "fuel",
    file_format: "xlsx",
    default_currency: "EUR",
    default_cost_code: "A1-001",
    template: { version: 1, header_row_index: 0, fields: T4E_SHELL_FIELDS },
    rules: FUEL_PRODUCT_RULES,
  },
  {
    code: "DKV",
    name: "DKV Fleet (CSV export)",
    provider_type: "fuel_toll",
    file_format: "csv",
    default_currency: "EUR",
    default_cost_code: "A1-001",
    template: {
      version: 1,
      header_row_index: 0,
      fields: {
        entry_date: { column: "Beleg-Datum", transform: "european_date" },
        posting_date: { column: "Buchungs-Datum", transform: "european_date" },
        country_code: "Land",
        vehicle_plate: { column: "Kfz-Kennzeichen", transform: "normalize_plate" },
        external_id: "Beleg-Nr",
        invoice_number: "Rechnungs-Nr",
        vendor_name: "Akzeptanzpartner",
        currency: "Währung",
        amount_incl_vat: { column: "Brutto-Betrag", transform: "european_number" },
        amount_excl_vat: { column: "Netto-Betrag", transform: "european_number" },
        tax_amount: { column: "MwSt-Betrag", transform: "european_number" },
        tax_rate: { column: "MwSt-Satz", transform: "european_number" },
        liters_qty: { column: "Menge", transform: "european_number" },
        location_label: "Ort",
        product_code: "Produktbezeichnung",
        driver_card: { column: "Karten-Nr", transform: "strip_apostrophe" },
      } as MappingTemplate["fields"],
    },
    rules: [...FUEL_PRODUCT_RULES, ...tollRules()],
    notes: "DKV exports as semicolon-separated CSV. Set delimiter to ';' if auto-detect fails.",
  },
  {
    code: "OMV_PETROM",
    name: "OMV Petrom Fleet",
    provider_type: "fuel",
    file_format: "xlsx",
    default_currency: "RON",
    default_cost_code: "A1-001",
    template: {
      version: 1,
      header_row_index: 0,
      fields: {
        entry_date: { column: "Data", transform: "european_date" },
        country_code: "Tara",
        vehicle_plate: { column: "Numar inmatriculare", transform: "normalize_plate" },
        external_id: "Numar tranzactie",
        invoice_number: "Numar factura",
        vendor_name: "Statie",
        currency: "Moneda",
        amount_incl_vat: { column: "Valoare cu TVA", transform: "european_number" },
        amount_excl_vat: { column: "Valoare fara TVA", transform: "european_number" },
        tax_amount: { column: "TVA", transform: "european_number" },
        tax_rate: "Cota TVA",
        liters_qty: { column: "Cantitate", transform: "european_number" },
        location_label: "Adresa statie",
        product_code: "Produs",
        driver_card: { column: "Card", transform: "strip_apostrophe" },
      } as MappingTemplate["fields"],
    },
    rules: FUEL_PRODUCT_RULES,
  },
]

export function findPrebuilt(code: string): PrebuiltTemplate | undefined {
  return PREBUILT_TEMPLATES.find((t) => t.code === code)
}
