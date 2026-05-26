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
  entry_time: "Ora",
  posting_date: { column: "Data postarii", transform: "european_date" },
  posting_time: "Ora postarii",
  // The Toll4Europe / Shell Romanian export contains BOTH a "Țara" column
  // (ISO alpha-2: DE, AT, HU, CZ, SK, PL, RO) and a "Cod țară" column
  // (internal numeric: 714/732/733/134/...). We bind the ISO column so the
  // country-aware Road tax rules (^DE$, ^AT$, …) actually match.
  country_code: "Țara",
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
    rules: [...FUEL_PRODUCT_RULES, ...tollRules()],
    notes:
      "Includes country-aware toll rules so combined Shell + Toll4Europe exports route Road tax rows to the correct per-country cost code (DE→A1-010, AT→A1-011, …). Falls back to A1-017 when country is unknown.",
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
    name: "OMV Petrom / Routex (Romanian export)",
    provider_type: "fuel",
    file_format: "xlsx",
    default_currency: "RON",
    default_cost_code: "A1-001",
    template: {
      version: 1,
      header_row_index: 0,
      fields: {
        // "Data TRX " comes as "2026-03-30 11:36:00" (ISO with trailing space).
        entry_date: { column: "Data TRX ", transform: "european_date" },
        country_code: "tara de livrare",
        vehicle_plate: { column: "numar de inmatriculare", transform: "normalize_plate" },
        // bon tranzactie is the per-transaction receipt id — unique enough for dedup.
        external_id: { column: "bon tranzactie", transform: "strip_apostrophe" },
        invoice_number: "factura nr.",
        vendor_name: "furnizor",
        // SC = transaction currency (RON, HUF, EUR, CZK…)
        currency: "SC",
        // The OMV export does NOT include a "total with VAT" column in
        // local currency: it gives Valoare SC (net) + TVA (vat). The resolver
        // computes amount_incl_vat = amount_excl_vat + tax_amount when the
        // gross column is missing, so this still produces correct totals.
        amount_excl_vat: { column: "Valoare SC", transform: "european_number" },
        tax_amount: { column: "TVA", transform: "european_number" },
        liters_qty: { column: "cantitate", transform: "european_number" },
        location_label: "punct de acceptanta",
        // Produs (com.) = normalized product category (DIESEL, VIGNETTE,
        // ROAD TOLL/BRIGDE/TUNNEL (VAT), ADBLUE (PUMP), OTHER LUBRICANTS…).
        // This is what mapping rules match against.
        product_code: "Produs (com.)",
        driver_card: { column: "card", transform: "strip_apostrophe" },
        notes: "Produs INV",
      } as MappingTemplate["fields"],
    },
    rules: [
      // Routex-specific product categories (uppercase, hyphenated).
      { external_name: "DIESEL", cost_code: "A1-001" },
      { external_name: "GASOLINE", cost_code: "A1-001" },
      { external_name: "PETROL", cost_code: "A1-001" },
      { external_name: "ADBLUE (PUMP)", cost_code: "A1-002" },
      { external_name: "ADBLUE", cost_code: "A1-002" },
      { external_name: "LNG", cost_code: "A1-003" },
      { external_name: "CNG", cost_code: "A1-003" },
      // Vignettes have a dedicated catalog code (A1-022).
      { external_name: "VIGNETTE", cost_code: "A1-022" },
      // "ROAD TOLL\t BRIGDE\t TUNNEL (VAT)" — match by substring "ROAD TOLL".
      { external_name: "ROAD TOLL", cost_code: "A1-010", match_field: "country_code", match_pattern: "^DE$" },
      { external_name: "ROAD TOLL", cost_code: "A1-011", match_field: "country_code", match_pattern: "^AT$" },
      { external_name: "ROAD TOLL", cost_code: "A1-012", match_field: "country_code", match_pattern: "^HU$" },
      { external_name: "ROAD TOLL", cost_code: "A1-013", match_field: "country_code", match_pattern: "^PL$" },
      { external_name: "ROAD TOLL", cost_code: "A1-014", match_field: "country_code", match_pattern: "^CZ$" },
      { external_name: "ROAD TOLL", cost_code: "A1-015", match_field: "country_code", match_pattern: "^SK$" },
      { external_name: "ROAD TOLL", cost_code: "A1-016", match_field: "country_code", match_pattern: "^RO$" },
      // Italy / Slovenia / others fall back to "Other tolls" (A1-017).
      { external_name: "ROAD TOLL", cost_code: "A1-017" },
      // Ancillary site services route to the available service codes.
      { external_name: "CARWASH", cost_code: "A1-031" },
      { external_name: "PARKING", cost_code: "A1-030" },
    ],
    notes:
      "Matches the OMV Petrom / Routex Romanian export. Local-currency gross is derived from Valoare SC + TVA. Tolls route per-country (RO→A1-016, HU→A1-012, AT→A1-011…), vignettes go to A1-022. Italy/Slovenia and any other country fall back to A1-017.",
  },
  {
    code: "CARGOBOX",
    name: "Cargobox (multi-country tolls)",
    provider_type: "toll",
    file_format: "xlsx",
    default_currency: "EUR",
    default_cost_code: "A1-017",
    template: {
      version: 1,
      header_row_index: 0,
      fields: {
        // "Data inceput" arrives as "2026-05-15 08:26" — parseFlexibleDate
        // handles both date-only and date+time, extracting YYYY-MM-DD.
        entry_date: { column: "Data inceput", transform: "european_date" },
        // "Domeniu Taxabil" is the ISO-2 country of the toll segment.
        country_code: "Domeniu Taxabil",
        vehicle_plate: { column: "Vehicul", transform: "normalize_plate" },
        // Cargobox files have no explicit transaction ID. Dedup is best
        // effort and relies on (occurred_at + vehicle + country) matching.
        currency: "Moneda",
        amount_incl_vat: { column: "Valoare Bruta", transform: "european_number" },
        amount_excl_vat: { column: "Valoare", transform: "european_number" },
        tax_amount: { column: "TVA", transform: "european_number" },
        // Every Cargobox row is a road tax — hard-code the Product label so
        // the import preview and ledger always show "Road tax" (matching the
        // cost catalog's "Taxă rutieră" labels for A1-010..017 and the
        // Shell / Toll4Europe convention) instead of the underlying
        // technology code (DSRC / GNSS / CHARGE). The original Tip serviciu
        // value is preserved in `notes` for traceability.
        product_code: { literal: "Road tax" },
        notes: { column: "Tip serviciu" },
        // The route segment ("ROVIGO SUD - VILLAMARZANA") is the most useful
        // human label for the station column.
        location_label: "Descrierea traseului",
      } as MappingTemplate["fields"],
    },
    rules: [
      // Single product label "Road tax" with country-driven cost code routing,
      // identical to the Shell / Toll4Europe convention so reports group cleanly.
      { external_name: "Road tax", cost_code: "A1-010", match_field: "country_code", match_pattern: "^DE$" },
      { external_name: "Road tax", cost_code: "A1-011", match_field: "country_code", match_pattern: "^AT$" },
      { external_name: "Road tax", cost_code: "A1-012", match_field: "country_code", match_pattern: "^HU$" },
      { external_name: "Road tax", cost_code: "A1-013", match_field: "country_code", match_pattern: "^PL$" },
      { external_name: "Road tax", cost_code: "A1-014", match_field: "country_code", match_pattern: "^CZ$" },
      { external_name: "Road tax", cost_code: "A1-015", match_field: "country_code", match_pattern: "^SK$" },
      { external_name: "Road tax", cost_code: "A1-016", match_field: "country_code", match_pattern: "^RO$" },
      // Italy, Slovenia, France and any other country fall back to "alte țări UE".
      { external_name: "Road tax", cost_code: "A1-017" },
    ],
    notes:
      "Matches the Cargobox EETS toll export. Every row is normalized to product 'Road tax' (matching the Shell / Toll4Europe convention and the cost catalog's 'Taxă rutieră' lines), regardless of underlying DSRC/GNSS/CHARGE technology, then routed by country (DE→A1-010, AT→A1-011, HU→A1-012, CZ→A1-014, RO→A1-016…). Italy, Slovenia, France and any other country use A1-017 (alte țări UE).",
  },
]

export function findPrebuilt(code: string): PrebuiltTemplate | undefined {
  return PREBUILT_TEMPLATES.find((t) => t.code === code)
}
