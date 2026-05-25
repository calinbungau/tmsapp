/**
 * Shared types for the Cost Provider Import feature.
 *
 * The flow is:
 *   1. Admin defines a `cost_provider` (Shell, T4E, DKV…) with file format settings.
 *   2. Admin defines a `mapping_template` (jsonb on cost_providers) that maps
 *      OUR target fields → SOURCE column names found in the supplier's file.
 *   3. Admin defines `cost_provider_mappings` rules (per-provider) that map
 *      a value found in the source row (e.g. "Diesel AGO") → our internal
 *      cost_code from cost_catalog.
 *   4. At import time we parse the file with the template + rules, resolve
 *      vehicle/driver/vendor by matching plate / name, and insert into
 *      cost_entries.
 */

/** Our canonical target fields a supplier file can be mapped to. */
export type TargetField =
  | "entry_date"
  | "posting_date"
  | "country_code"
  | "vehicle_plate"
  | "external_id"
  | "invoice_number"
  | "vendor_name"
  | "currency"
  | "amount_incl_vat"
  | "amount_excl_vat"
  | "tax_amount"
  | "tax_rate"
  | "amount_eur"
  | "tax_amount_eur"
  | "liters_qty"
  | "kwh_qty"
  | "km_qty"
  | "units_qty"
  | "location_label"
  | "product_code"
  | "driver_name"
  | "driver_card"
  | "notes"

export interface TargetFieldDef {
  key: TargetField
  label: string
  type: "string" | "number" | "date" | "currency"
  required?: boolean
  hint?: string
}

export const TARGET_FIELDS: TargetFieldDef[] = [
  { key: "entry_date", label: "Transaction Date", type: "date", required: true, hint: "Date when the cost was incurred" },
  { key: "posting_date", label: "Posting Date", type: "date" },
  { key: "country_code", label: "Country Code", type: "string", hint: "DE, RO, HU…" },
  { key: "vehicle_plate", label: "Vehicle Plate", type: "string", hint: "Used to resolve vehicle_id" },
  { key: "external_id", label: "External ID (transaction)", type: "string", required: true, hint: "Used for duplicate detection" },
  { key: "invoice_number", label: "Invoice Number", type: "string" },
  { key: "vendor_name", label: "Vendor / Network", type: "string", hint: "e.g. Shell CZ, Toll4Europe" },
  { key: "currency", label: "Transaction Currency", type: "string", required: true },
  { key: "amount_incl_vat", label: "Amount Incl. VAT", type: "number", required: true },
  { key: "amount_excl_vat", label: "Amount Excl. VAT", type: "number" },
  { key: "tax_amount", label: "VAT Amount", type: "number" },
  { key: "tax_rate", label: "VAT Rate (%)", type: "number" },
  { key: "amount_eur", label: "Amount in EUR (net)", type: "number", hint: "If supplied, used directly instead of FX conversion" },
  { key: "tax_amount_eur", label: "VAT Amount in EUR", type: "number" },
  { key: "liters_qty", label: "Liters (fuel)", type: "number" },
  { key: "kwh_qty", label: "kWh (electric)", type: "number" },
  { key: "km_qty", label: "Kilometers", type: "number" },
  { key: "units_qty", label: "Units / Quantity", type: "number" },
  { key: "location_label", label: "Location / Station", type: "string" },
  { key: "product_code", label: "Product Code / Name", type: "string", hint: "Drives cost-code mapping rules" },
  { key: "driver_name", label: "Driver Name", type: "string" },
  { key: "driver_card", label: "Driver Card / Tacho ID", type: "string" },
  { key: "notes", label: "Notes / Card Type", type: "string" },
]

/**
 * What's stored in cost_providers.mapping_template (jsonb).
 *
 * Two shapes are supported per target field:
 *  - string: the source column header (most common case).
 *  - { column, transform? }: column + optional value transform (trim, upper,
 *    strip prefix, parse number with comma decimal, etc.).
 */
export interface MappingTemplate {
  /** Maps our target field → source column header in the file. */
  fields: Partial<Record<TargetField, string | MappingFieldConfig>>
  /** Excel sheet name (xlsx only). Empty = first sheet. */
  sheet_name?: string
  /**
   * Some supplier files have a banner/title at the top before the real
   * header row. 0-based row index where the headers live (default 0).
   */
  header_row_index?: number
  /** Optional: skip first N data rows (e.g. summary banner). */
  data_start_offset?: number
  /** Optional schema version for future migrations. */
  version?: number
}

export interface MappingFieldConfig {
  column: string
  /** Optional transform applied to the raw cell value. */
  transform?: ValueTransform
}

export type ValueTransform =
  /** Strip leading apostrophe (Excel text-as-number prefix). */
  | "strip_apostrophe"
  /** Uppercase + remove all whitespace (good for plates). */
  | "normalize_plate"
  /** Replace comma decimal separator with dot, then parseFloat. */
  | "european_number"
  /** Parse "DD/MM/YYYY" or "DD.MM.YYYY". */
  | "european_date"

/**
 * A row's resolution outcome, used for the preview pane.
 */
export type RowStatus = "ready" | "needs_attention" | "duplicate" | "error"

export interface ParsedRow {
  /** 1-based row index in the source file (excluding header). */
  rowIndex: number
  /** Raw row keyed by source column header. */
  raw: Record<string, unknown>
  /** Mapped target fields after applying the template. */
  mapped: Partial<Record<TargetField, string | number | null>>
  /** Final resolution outcome. */
  status: RowStatus
  /** Human-readable reasons (rendered in the preview). */
  issues: string[]
  /** Resolved foreign keys. */
  resolved: {
    vehicle_id: string | null
    driver_id: string | null
    trailer_id: string | null
    vendor_id: string | null
    cost_catalog_id: string | null
    cost_code: string | null
  }
}

export interface ProviderRecord {
  id: string
  admin_id: string
  name: string
  code: string
  provider_type: string | null
  file_format: string | null
  file_delimiter: string | null
  file_encoding: string | null
  has_header_row: boolean | null
  default_currency: string | null
  default_cost_code: string | null
  mapping_template: MappingTemplate | null
  is_active: boolean | null
  notes: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website_url: string | null
  import_method: string | null
  last_import_at: string | null
  last_import_status: string | null
  created_at: string
  updated_at: string
}

export interface MappingRuleRecord {
  id: string
  admin_id: string
  provider_id: string
  /** Raw value from source (e.g. "Diesel AGO", "Road tax", "Vignette"). */
  external_code: string | null
  external_name: string | null
  cost_code: string | null
  cost_catalog_id: string | null
  vehicle_match_field: string | null
  vehicle_match_pattern: string | null
  default_allocation_level: string | null
  default_currency: string | null
  is_active: boolean
  match_count: number | null
  last_matched_at: string | null
}
