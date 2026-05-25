/**
 * Pre-built mapping templates for popular European fleet cost suppliers.
 * Users can clone any of these from the UI to skip manual setup.
 *
 * Field hints below are derived directly from real export samples, including
 * the user-provided Toll4Europe / Shell / AGES file that prompted this feature.
 */

import type { MappingTemplate, TargetField } from "./types"

export interface PrebuiltTemplate {
  /** Stable id used as cost_providers.code. */
  code: string
  name: string
  provider_type: string
  file_format: "xlsx" | "csv"
  default_currency: string
  default_cost_code?: string
  template: MappingTemplate
  /** Default mapping rules to seed for cost-code resolution. */
  rules: Array<{
    external_name: string
    external_code?: string
    cost_code: string
  }>
  notes?: string
}

const passthrough = (column: string) => column

/**
 * Toll4Europe / Shell combined export — the format from the user's sample
 * file. The same export bundles toll, fuel and vignette transactions.
 */
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

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    code: "TOLL4EUROPE",
    name: "Toll4Europe / Shell / AGES (combined)",
    provider_type: "fuel_card",
    file_format: "xlsx",
    default_currency: "EUR",
    default_cost_code: "OTHER_FLEET",
    template: {
      version: 1,
      header_row_index: 0,
      fields: T4E_SHELL_FIELDS,
    },
    rules: [
      { external_name: "Diesel AGO", cost_code: "FUEL_DIESEL" },
      { external_name: "Diesel", cost_code: "FUEL_DIESEL" },
      { external_name: "AdBlue", cost_code: "FUEL_ADBLUE" },
      { external_name: "Road tax", cost_code: "TOLL_ROAD" },
      { external_name: "Road tax (Internal PC)", cost_code: "TOLL_ROAD" },
      { external_name: "Vignette", cost_code: "TOLL_VIGNETTE" },
      { external_name: "Toll", cost_code: "TOLL_ROAD" },
    ],
    notes:
      "Matches the standard Toll4Europe combined export. Same template also works for Shell Fleet exports that follow the T4E layout.",
  },
  {
    code: "SHELL",
    name: "Shell Fleet (Romanian export)",
    provider_type: "fuel_card",
    file_format: "xlsx",
    default_currency: "EUR",
    default_cost_code: "FUEL_DIESEL",
    template: {
      version: 1,
      header_row_index: 0,
      fields: T4E_SHELL_FIELDS,
    },
    rules: [
      { external_name: "Diesel AGO", cost_code: "FUEL_DIESEL" },
      { external_name: "Diesel", cost_code: "FUEL_DIESEL" },
      { external_name: "AdBlue", cost_code: "FUEL_ADBLUE" },
      { external_name: "V-Power Diesel", cost_code: "FUEL_DIESEL" },
    ],
  },
  {
    code: "DKV",
    name: "DKV Fleet (CSV export)",
    provider_type: "fuel_card",
    file_format: "csv",
    default_currency: "EUR",
    default_cost_code: "FUEL_DIESEL",
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
    rules: [
      { external_name: "Diesel", cost_code: "FUEL_DIESEL" },
      { external_name: "AdBlue", cost_code: "FUEL_ADBLUE" },
      { external_name: "Maut", cost_code: "TOLL_ROAD" },
      { external_name: "Vignette", cost_code: "TOLL_VIGNETTE" },
    ],
    notes: "DKV exports as semicolon-separated CSV. Set delimiter to ';' if auto-detect fails.",
  },
  {
    code: "OMV_PETROM",
    name: "OMV Petrom Fleet",
    provider_type: "fuel_card",
    file_format: "xlsx",
    default_currency: "RON",
    default_cost_code: "FUEL_DIESEL",
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
    rules: [
      { external_name: "Motorina", cost_code: "FUEL_DIESEL" },
      { external_name: "AdBlue", cost_code: "FUEL_ADBLUE" },
      { external_name: "Benzina", cost_code: "FUEL_GASOLINE" },
    ],
  },
]

export function findPrebuilt(code: string): PrebuiltTemplate | undefined {
  return PREBUILT_TEMPLATES.find((t) => t.code === code)
}
