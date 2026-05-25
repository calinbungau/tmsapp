/**
 * Apply a mapping template + provider rules to parsed rows, resolving
 * vehicle/driver/vendor/cost_code so they're ready to insert into
 * cost_entries.
 *
 * This module is pure: it takes the resolver lookup tables (vehicles, drivers,
 * partners, mapping rules, existing external_ids) as plain arrays / sets so it
 * can be exercised without a Supabase client. The caller (API route) is
 * responsible for fetching those.
 */

import type {
  MappingTemplate,
  MappingFieldConfig,
  ParsedRow,
  RowStatus,
  TargetField,
  ValueTransform,
  MappingRuleRecord,
} from "./types"

export interface VehicleLookup {
  id: string
  plate_number: string | null
}
export interface DriverLookup {
  id: string
  name: string | null
  driver_card_number: string | null
}
export interface VendorLookup {
  id: string
  name: string | null
}

export interface CatalogLookup {
  id: string
  cost_code: string | null
}

export interface ResolverContext {
  template: MappingTemplate
  rules: MappingRuleRecord[]
  vehicles: VehicleLookup[]
  drivers: DriverLookup[]
  vendors: VendorLookup[]
  catalog: CatalogLookup[]
  /** Set of `${external_source}|${external_id}` for duplicate detection. */
  existingExternalIds: Set<string>
  defaultCurrency?: string | null
  defaultCostCode?: string | null
  externalSource: string
}

export function applyTemplate(
  rows: Record<string, unknown>[],
  ctx: ResolverContext,
): ParsedRow[] {
  const tpl = ctx.template
  const fields = tpl.fields || {}

  // Pre-build normalized lookup maps.
  const plateMap = new Map<string, string>()
  ctx.vehicles.forEach((v) => {
    if (v.plate_number) plateMap.set(normalizePlate(v.plate_number), v.id)
  })
  const driverByCard = new Map<string, string>()
  const driverByName = new Map<string, string>()
  ctx.drivers.forEach((d) => {
    if (d.driver_card_number) driverByCard.set(d.driver_card_number.trim().toUpperCase(), d.id)
    if (d.name) driverByName.set(d.name.trim().toLowerCase(), d.id)
  })
  const vendorByName = new Map<string, string>()
  ctx.vendors.forEach((v) => {
    if (v.name) vendorByName.set(v.name.trim().toLowerCase(), v.id)
  })
  const catalogByCode = new Map<string, string>()
  ctx.catalog.forEach((c) => {
    if (c.cost_code) catalogByCode.set(c.cost_code.trim().toUpperCase(), c.id)
  })

  const out: ParsedRow[] = []
  const offset = tpl.data_start_offset || 0
  const startIdx = Math.max(0, offset)

  for (let i = startIdx; i < rows.length; i++) {
    const raw = rows[i]
    const issues: string[] = []
    const mapped: Partial<Record<TargetField, string | number | null>> = {}

    // --- 1. Map raw cells → target fields with transforms.
    for (const [targetKey, conf] of Object.entries(fields)) {
      if (!conf) continue
      const cfg: MappingFieldConfig = typeof conf === "string" ? { column: conf } : conf
      if (!cfg.column) continue
      const cell = raw[cfg.column]
      const target = targetKey as TargetField
      mapped[target] = transformValue(cell, cfg.transform, target)
    }

    // --- 2. Resolve cost code via mapping rules.
    let resolvedCostCode: string | null = null
    let resolvedCatalogId: string | null = null
    const productCode = String(mapped.product_code ?? "").trim()
    if (productCode) {
      const rule = matchRule(ctx.rules, productCode)
      if (rule) {
        resolvedCostCode = rule.cost_code
        resolvedCatalogId = rule.cost_catalog_id
      }
    }
    if (!resolvedCostCode && ctx.defaultCostCode) {
      resolvedCostCode = ctx.defaultCostCode
    }
    if (resolvedCostCode && !resolvedCatalogId) {
      resolvedCatalogId = catalogByCode.get(resolvedCostCode.trim().toUpperCase()) ?? null
    }
    if (!resolvedCostCode) {
      issues.push(
        productCode
          ? `No mapping rule for product "${productCode}"`
          : "No product code in row and no default cost code",
      )
    }

    // --- 3. Resolve vehicle by plate.
    let vehicleId: string | null = null
    const plate = String(mapped.vehicle_plate ?? "").trim()
    if (plate) {
      vehicleId = plateMap.get(normalizePlate(plate)) ?? null
      if (!vehicleId) issues.push(`Vehicle "${plate}" not found in fleet`)
    }

    // --- 4. Resolve driver by card or name.
    let driverId: string | null = null
    const card = String(mapped.driver_card ?? "").trim().toUpperCase()
    const driverName = String(mapped.driver_name ?? "").trim()
    if (card) driverId = driverByCard.get(card) ?? null
    if (!driverId && driverName) driverId = driverByName.get(driverName.toLowerCase()) ?? null

    // --- 5. Resolve vendor (business_partner) by name.
    let vendorId: string | null = null
    const vendorName = String(mapped.vendor_name ?? "").trim()
    if (vendorName) vendorId = vendorByName.get(vendorName.toLowerCase()) ?? null

    // --- 6. Currency / amounts sanity.
    if (mapped.currency == null && ctx.defaultCurrency) {
      mapped.currency = ctx.defaultCurrency
    }
    if (mapped.amount_incl_vat == null) {
      issues.push("Missing amount")
    }
    if (mapped.entry_date == null) {
      issues.push("Missing transaction date")
    }

    // --- 7. Duplicate detection by external_source + external_id.
    let isDuplicate = false
    const externalId = mapped.external_id != null ? String(mapped.external_id).trim() : ""
    if (externalId) {
      const key = `${ctx.externalSource}|${externalId}`
      if (ctx.existingExternalIds.has(key)) isDuplicate = true
    }

    let status: RowStatus = "ready"
    if (isDuplicate) status = "duplicate"
    else if (issues.length > 0) status = "needs_attention"

    out.push({
      rowIndex: i + 1,
      raw,
      mapped,
      status,
      issues,
      resolved: {
        vehicle_id: vehicleId,
        driver_id: driverId,
        trailer_id: null,
        vendor_id: vendorId,
        cost_catalog_id: resolvedCatalogId,
        cost_code: resolvedCostCode,
      },
    })
  }

  return out
}

/* ---------------- Helpers ---------------- */

export function normalizePlate(v: string): string {
  return v
    .replace(/^['"`]+/, "") // strip Excel apostrophe prefix
    .replace(/[\s-]/g, "")
    .toUpperCase()
}

function transformValue(
  cell: unknown,
  transform: ValueTransform | undefined,
  target: TargetField,
): string | number | null {
  if (cell == null) return null
  let s = String(cell).trim()
  if (s === "") return null

  // Default per-target coercion.
  const numericTargets: TargetField[] = [
    "amount_incl_vat",
    "amount_excl_vat",
    "tax_amount",
    "tax_rate",
    "amount_eur",
    "tax_amount_eur",
    "liters_qty",
    "kwh_qty",
    "km_qty",
    "units_qty",
  ]
  const dateTargets: TargetField[] = ["entry_date", "posting_date"]

  if (transform === "strip_apostrophe") {
    s = s.replace(/^['"`]+/, "")
  } else if (transform === "normalize_plate") {
    return normalizePlate(s)
  } else if (transform === "european_number") {
    return parseEuropeanNumber(s)
  } else if (transform === "european_date") {
    return parseEuropeanDate(s)
  }

  if (numericTargets.includes(target)) {
    return parseFlexibleNumber(s)
  }
  if (dateTargets.includes(target)) {
    return parseFlexibleDate(s)
  }
  if (target === "vehicle_plate") return normalizePlate(s)
  if (target === "country_code") return s.toUpperCase()
  return s
}

/**
 * Parse "1.234,56" or "1,234.56" or "1234.56". European exports often use
 * thousand-separator dots and comma decimals; we handle both.
 */
export function parseFlexibleNumber(s: string): number | null {
  const cleaned = s.replace(/[^\d.,\-]/g, "")
  if (!cleaned) return null
  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  let normalized: string
  if (lastComma > lastDot) {
    // Comma is decimal separator: remove dots (thousand sep), then replace comma with dot.
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else {
    // Dot is decimal separator: remove commas (thousand sep).
    normalized = cleaned.replace(/,/g, "")
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseEuropeanNumber(s: string): number | null {
  return parseFlexibleNumber(s)
}

/** Parse "31/03/2026", "31-03-2026", "31.03.2026", or ISO. Returns YYYY-MM-DD. */
export function parseFlexibleDate(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const eu = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(trimmed)
  if (eu) {
    const dd = eu[1].padStart(2, "0")
    const mm = eu[2].padStart(2, "0")
    let yyyy = eu[3]
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 50 ? "19" : "20") + yyyy
    return `${yyyy}-${mm}-${dd}`
  }
  // Fallback to Date parsing (handles "Mar 1 2026" etc.).
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function parseEuropeanDate(s: string): string | null {
  return parseFlexibleDate(s)
}

/**
 * Match a product code/name against the provider's mapping rules.
 * Rules are matched in this order:
 *   1. Exact case-insensitive equality on external_code.
 *   2. Exact case-insensitive equality on external_name.
 *   3. Substring match on external_name.
 */
export function matchRule(
  rules: MappingRuleRecord[],
  value: string,
): MappingRuleRecord | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  const active = rules.filter((r) => r.is_active !== false)

  for (const r of active) {
    if (r.external_code && r.external_code.trim().toLowerCase() === v) return r
  }
  for (const r of active) {
    if (r.external_name && r.external_name.trim().toLowerCase() === v) return r
  }
  for (const r of active) {
    const en = (r.external_name || "").trim().toLowerCase()
    if (en && v.includes(en)) return r
  }
  return null
}
