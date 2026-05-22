// Export utilities for the Internal Fleet P&L report.
// Generates CSV, Excel (.xlsx) and PDF outputs from the same trip-grain
// dataset. Mirrors the pattern of forwarding-pnl-export.ts so both reports
// share visual conventions (header band, KPI cards, branded summary, etc.).

import ExcelJS from "exceljs"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

/* ---------- shared helpers ---------- */

function fmtDateTime(input: string | Date | null | undefined): string {
  if (!input) return ""
  const d = typeof input === "string" ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

function fmtMoney(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0)
}

function fmtMoneyOrDash(n: number | null | undefined) {
  return n == null ? "—" : fmtMoney(n)
}

function fmtKm(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${Math.round(n).toLocaleString("en-US")} km`
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

const logoCache = new Map<string, string | null>()
async function loadImageDataUrl(url: string): Promise<string | null> {
  if (logoCache.has(url)) return logoCache.get(url) ?? null
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logoCache.set(url, null)
      return null
    }
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    logoCache.set(url, dataUrl)
    return dataUrl
  } catch {
    logoCache.set(url, null)
    return null
  }
}

/* ---------- types (shape coming from the page) ---------- */

export type FleetOrderSummary = {
  order_id: string
  reference_number: string | null
  customer_id: string | null
  customer_name: string | null
  customer_reference: string | null
  status: string | null
  customer_price_eur: number
  subcontracted_cost_eur: number
  internal_revenue_eur: number
  internal_legs: number
  subcontracted_legs: number
  has_subcontract_children: boolean
  cargo_description: string | null
  weight_kg: number | null
  pallet_count: number | null
}

export type FleetLegSummary = {
  leg_id: string
  leg_number: number | null
  assignment_type: string | null
  origin: string | null
  destination: string | null
  status: string | null
  order_id: string | null
  order_ref: string | null
}

export type FleetTripRow = {
  trip_id: string
  reference_number: string | null
  status: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  vehicle_id: string | null
  vehicle_label: string | null
  trailer_id: string | null
  trailer_label: string | null
  driver_id: string | null
  driver_name: string | null
  distance_km: number
  duration_hours: number
  revenue_eur: number
  actual_cost_eur: number
  planned_cost_eur: number | null
  profit_eur: number
  margin_pct: number | null
  cost_per_km: number | null
  revenue_per_km: number | null
  profit_per_km: number | null
  cost_fuel_eur: number
  cost_toll_eur: number
  cost_driver_eur: number
  cost_other_eur: number
  is_mixed: boolean
  internal_leg_count: number
  subcontract_leg_count: number
  order_count: number
  orders: FleetOrderSummary[]
  legs: FleetLegSummary[]
}

export type FleetPnlTotals = {
  tripCount: number
  revenue: number
  actual: number
  planned: number | null
  profit: number
  km: number
  marginPct: number | null
  eurPerKm: number | null
  mixed: number
  lossCount: number
}

export type FleetExportContext = {
  from: string
  to: string
  rows: FleetTripRow[]
  totals: FleetPnlTotals
  showPlanned: boolean
  filters?: {
    vehicle?: string
    driver?: string
    margin?: string
    search?: string
  }
  company?: {
    name: string | null
    logoUrl: string | null
  } | null
}

/* ---------- Detailed (line-by-line) types ---------- */

export type FleetDetailedItem = {
  trip_id: string
  trip_ref: string | null
  bucket: "fuel" | "toll" | "driver" | "other" | "overhead"
  source: string
  occurred_at: string | null
  description: string
  vendor: string | null
  country: string | null
  category: string | null
  cost_code: string | null
  quantity: number | null
  unit: string | null
  currency: string | null
  amount_eur: number
}

export type FleetDetailedLeg = {
  trip_id: string
  trip_ref: string | null
  leg_id: string
  leg_number: number | null
  origin: string | null
  destination: string | null
  planned_km: number | null
  actual_km: number | null
  delta_km: number | null
}

export type FleetDetailedRevenueLine = {
  trip_id: string
  trip_ref: string | null
  order_id: string
  order_ref: string | null
  customer_name: string | null
  customer_price_eur: number
  subcontracted_cost_eur: number
  internal_revenue_eur: number
}

export type FleetDetailedTripHeader = {
  trip_id: string
  trip_ref: string | null
  vehicle_plate: string | null
  driver_name: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  planned_km: number | null
  actual_km: number | null
  route_confirmed_at: string | null
  status: string | null
}

export type FleetDetailedStop = {
  trip_id: string
  trip_ref: string | null
  stop_id: string
  sequence_order: number | null
  stop_type: string | null
  company_name: string | null
  address: string | null
  city: string | null
  country: string | null
  planned_date: string | null
  planned_time_from: string | null
  planned_time_to: string | null
  actual_arrival: string | null
  actual_departure: string | null
  status: string | null
  reference_number: string | null
}

export type FleetDetailedExportContext = FleetExportContext & {
  items: FleetDetailedItem[]
  legs: FleetDetailedLeg[]
  revenue: FleetDetailedRevenueLine[]
  trip_headers: FleetDetailedTripHeader[]
  stops?: FleetDetailedStop[]
}

const BUCKET_LABEL: Record<FleetDetailedItem["bucket"], string> = {
  fuel: "Fuel & AdBlue",
  toll: "Tolls & vignettes",
  driver: "Driver",
  other: "Other expenses",
  overhead: "Allocated overhead",
}

const BUCKET_COLOR: Record<FleetDetailedItem["bucket"], string> = {
  fuel: "FFF97316", // orange
  toll: "FF0EA5E9", // sky
  driver: "FF8B5CF6", // violet
  other: "FF64748B", // slate
  overhead: "FFF59E0B", // amber
}

function fileBaseDetailed(ctx: FleetDetailedExportContext) {
  return `internal-fleet-pnl-detailed_${ctx.from}_${ctx.to}`
}

/* ---------- column registry (shared across CSV/Excel) ---------- */

type ColKey =
  | "reference_number"
  | "trip_period"
  | "status"
  | "vehicle_label"
  | "trailer_label"
  | "driver_name"
  | "distance_km"
  | "order_count"
  | "internal_leg_count"
  | "subcontract_leg_count"
  | "revenue_eur"
  | "actual_cost_eur"
  | "planned_cost_eur"
  | "cost_fuel_eur"
  | "cost_toll_eur"
  | "cost_driver_eur"
  | "cost_other_eur"
  | "profit_eur"
  | "margin_pct"
  | "cost_per_km"
  | "revenue_per_km"
  | "is_mixed"

const COLUMNS: Array<{
  key: ColKey
  header: string
  width: number
  numFmt?: string
  align?: "left" | "right" | "center"
}> = [
  { key: "reference_number", header: "Trip Ref", width: 18 },
  { key: "trip_period", header: "Period", width: 22 },
  { key: "status", header: "Status", width: 14 },
  { key: "vehicle_label", header: "Vehicle", width: 14 },
  { key: "trailer_label", header: "Trailer", width: 14 },
  { key: "driver_name", header: "Driver", width: 22 },
  { key: "distance_km", header: "Distance (km)", width: 12, numFmt: "#,##0", align: "right" },
  { key: "order_count", header: "Orders", width: 8, align: "right" },
  { key: "internal_leg_count", header: "Internal legs", width: 11, align: "right" },
  { key: "subcontract_leg_count", header: "Subc. legs", width: 10, align: "right" },
  { key: "revenue_eur", header: "Revenue EUR", width: 14, numFmt: "#,##0.00", align: "right" },
  { key: "actual_cost_eur", header: "Actual cost EUR", width: 14, numFmt: "#,##0.00", align: "right" },
  { key: "planned_cost_eur", header: "Planned cost EUR", width: 15, numFmt: "#,##0.00", align: "right" },
  { key: "cost_fuel_eur", header: "Fuel EUR", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "cost_toll_eur", header: "Toll EUR", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "cost_driver_eur", header: "Driver EUR", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "cost_other_eur", header: "Other EUR", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "profit_eur", header: "Profit EUR", width: 13, numFmt: "#,##0.00", align: "right" },
  { key: "margin_pct", header: "Margin %", width: 10, numFmt: "0.00", align: "right" },
  { key: "cost_per_km", header: "EUR/km", width: 9, numFmt: "0.000", align: "right" },
  { key: "revenue_per_km", header: "Rev/km", width: 9, numFmt: "0.000", align: "right" },
  { key: "is_mixed", header: "Mixed", width: 7, align: "center" },
]

function tripPeriod(r: FleetTripRow): string {
  const start = r.actual_start || r.planned_start
  const end = r.actual_end || r.planned_end
  if (start && end) return `${fmtDate(start)} → ${fmtDate(end)}`
  if (start) return fmtDate(start)
  if (end) return fmtDate(end)
  return ""
}

function cellValue(r: FleetTripRow, key: ColKey): string | number {
  switch (key) {
    case "reference_number":
      return r.reference_number ?? r.trip_id.slice(0, 8)
    case "trip_period":
      return tripPeriod(r)
    case "status":
      return (r.status ?? "").replace(/_/g, " ")
    case "vehicle_label":
      return r.vehicle_label ?? ""
    case "trailer_label":
      return r.trailer_label ?? ""
    case "driver_name":
      return r.driver_name ?? ""
    case "distance_km":
      return Math.round(r.distance_km || 0)
    case "order_count":
      return r.order_count
    case "internal_leg_count":
      return r.internal_leg_count
    case "subcontract_leg_count":
      return r.subcontract_leg_count
    case "revenue_eur":
      return r.revenue_eur ?? 0
    case "actual_cost_eur":
      return r.actual_cost_eur ?? 0
    case "planned_cost_eur":
      return r.planned_cost_eur ?? 0
    case "cost_fuel_eur":
      return r.cost_fuel_eur ?? 0
    case "cost_toll_eur":
      return r.cost_toll_eur ?? 0
    case "cost_driver_eur":
      return r.cost_driver_eur ?? 0
    case "cost_other_eur":
      return r.cost_other_eur ?? 0
    case "profit_eur":
      return r.profit_eur ?? 0
    case "margin_pct":
      return r.margin_pct == null ? "" : Number(r.margin_pct.toFixed(2))
    case "cost_per_km":
      return r.cost_per_km == null ? "" : Number(r.cost_per_km.toFixed(3))
    case "revenue_per_km":
      return r.revenue_per_km == null ? "" : Number(r.revenue_per_km.toFixed(3))
    case "is_mixed":
      return r.is_mixed ? "Mixed" : "Internal"
    default:
      return ""
  }
}

function fileBase(ctx: FleetExportContext) {
  return `internal-fleet-pnl_${ctx.from}_${ctx.to}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------------- CSV ---------------- */

export function exportFleetPnlCsv(ctx: FleetExportContext) {
  const cols = ctx.showPlanned
    ? COLUMNS
    : COLUMNS.filter(c => c.key !== "planned_cost_eur")

  const headers = cols.map(c => c.header)
  const lines = ctx.rows.map(r =>
    cols
      .map(c => {
        const v = cellValue(r, c.key)
        const s = typeof v === "number" ? String(v) : String(v ?? "")
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      })
      .join(","),
  )

  const meta = [
    `Internal Fleet P&L`,
    `Period,${ctx.from} to ${ctx.to}`,
    `Generated,${fmtDateTime(new Date())}`,
    `Trips,${ctx.totals.tripCount}`,
    `Revenue EUR,${ctx.totals.revenue.toFixed(2)}`,
    `Actual cost EUR,${ctx.totals.actual.toFixed(2)}`,
    `Planned cost EUR,${ctx.totals.planned == null ? "" : ctx.totals.planned.toFixed(2)}`,
    `Profit EUR,${ctx.totals.profit.toFixed(2)}`,
    `Avg Margin %,${ctx.totals.marginPct == null ? "" : ctx.totals.marginPct.toFixed(2)}`,
    `Distance (km),${Math.round(ctx.totals.km)}`,
    `EUR / km,${ctx.totals.eurPerKm == null ? "" : ctx.totals.eurPerKm.toFixed(3)}`,
    "",
  ]

  // Per-trip section: include nested orders + legs as separate sub-tables so a
  // CSV consumer still sees the relationship between trips and their cargo.
  const detail: string[] = ["", "Trip details (orders & legs)"]
  for (const r of ctx.rows) {
    detail.push("")
    detail.push(
      `Trip,${r.reference_number ?? r.trip_id.slice(0, 8)},${r.vehicle_label ?? ""},${r.driver_name ?? ""}`,
    )
    if (r.orders.length) {
      detail.push("Orders")
      detail.push("Order Ref,Customer,Customer Ref,Status,Customer price EUR,Subcontracted cost EUR,Internal revenue EUR,Internal legs,Subc. legs,Cargo")
      for (const o of r.orders) {
        const cargoBits = [
          o.cargo_description ?? "",
          o.weight_kg ? `${o.weight_kg} kg` : "",
          o.pallet_count ? `${o.pallet_count} pal` : "",
        ]
          .filter(Boolean)
          .join(" / ")
        const cells = [
          o.reference_number ?? "",
          o.customer_name ?? "",
          o.customer_reference ?? "",
          o.status ?? "",
          o.customer_price_eur.toFixed(2),
          o.subcontracted_cost_eur.toFixed(2),
          o.internal_revenue_eur.toFixed(2),
          String(o.internal_legs),
          String(o.subcontracted_legs),
          cargoBits,
        ]
          .map(s => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s))
          .join(",")
        detail.push(cells)
      }
    }
    if (r.legs.length) {
      detail.push("Legs")
      detail.push("Leg #,Assignment,Origin,Destination,Status,Order Ref")
      for (const l of r.legs) {
        const cells = [
          l.leg_number == null ? "" : String(l.leg_number),
          l.assignment_type ?? "",
          l.origin ?? "",
          l.destination ?? "",
          l.status ?? "",
          l.order_ref ?? "",
        ]
          .map(s => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s))
          .join(",")
        detail.push(cells)
      }
    }
  }

  const csv = [...meta, headers.join(","), ...lines, ...detail].join("\r\n")
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  })
  triggerDownload(blob, `${fileBase(ctx)}.csv`)
}

/* ---------------- Excel ---------------- */

export async function exportFleetPnlExcel(ctx: FleetExportContext) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "BNG Track"
  wb.created = new Date()

  const cols = ctx.showPlanned
    ? COLUMNS
    : COLUMNS.filter(c => c.key !== "planned_cost_eur")

  /* ---- Sheet 1: Summary ---- */
  const summary = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  })
  summary.columns = [{ width: 30 }, { width: 22 }]

  summary.mergeCells("A1:B1")
  const title = summary.getCell("A1")
  title.value = "Internal Fleet P&L"
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } }
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  }
  summary.getRow(1).height = 38

  summary.mergeCells("A2:B2")
  summary.getCell("A2").value = `${ctx.from}  to  ${ctx.to}`
  summary.getCell("A2").font = { color: { argb: "FF64748B" }, italic: true, size: 11 }
  summary.getCell("A2").alignment = { horizontal: "left", indent: 1 }
  summary.getRow(2).height = 22

  if (ctx.company?.name) {
    summary.mergeCells("A3:B3")
    summary.getCell("A3").value = `Issued by ${ctx.company.name}`
    summary.getCell("A3").font = { color: { argb: "FFF59E0B" }, bold: true, size: 10 }
    summary.getCell("A3").alignment = { horizontal: "left", indent: 1 }
    summary.getRow(3).height = 18
  }

  const kpis: Array<[string, string | number, string, "money" | "count" | "pct" | "km" | "perkm"]> = [
    ["Trips", ctx.totals.tripCount, "FF334155", "count"],
    ["Revenue (EUR)", ctx.totals.revenue, "FF0EA5E9", "money"],
    ["Actual cost (EUR)", ctx.totals.actual, "FFF97316", "money"],
  ]
  if (ctx.showPlanned) {
    kpis.push([
      "Planned cost (EUR)",
      ctx.totals.planned ?? 0,
      ctx.totals.planned != null && ctx.totals.actual > ctx.totals.planned
        ? "FFEF4444"
        : "FF8B5CF6",
      "money",
    ])
    if (ctx.totals.planned != null) {
      kpis.push([
        "Actual − Planned (EUR)",
        ctx.totals.actual - ctx.totals.planned,
        ctx.totals.actual > ctx.totals.planned ? "FFEF4444" : "FF10B981",
        "money",
      ])
    }
  }
  kpis.push(
    ["Profit (EUR)", ctx.totals.profit, ctx.totals.profit >= 0 ? "FF10B981" : "FFEF4444", "money"],
    ["Avg margin %", ctx.totals.marginPct ?? 0, "FF8B5CF6", "pct"],
    ["Distance (km)", Math.round(ctx.totals.km), "FF334155", "km"],
    ["EUR / km (cost)", ctx.totals.eurPerKm ?? 0, "FFF97316", "perkm"],
    ["Mixed trips", ctx.totals.mixed, "FFF59E0B", "count"],
    ["Loss-making trips", ctx.totals.lossCount, "FFEF4444", "count"],
  )

  kpis.forEach((k, i) => {
    const r = summary.getRow(4 + i)
    r.height = 26
    r.getCell(1).value = k[0]
    r.getCell(1).font = { bold: true, color: { argb: "FF334155" } }
    r.getCell(1).alignment = { vertical: "middle", indent: 1 }
    r.getCell(2).value = k[1]
    r.getCell(2).alignment = { horizontal: "right", vertical: "middle", indent: 1 }
    r.getCell(2).font = { bold: true, color: { argb: k[2] }, size: 13 }
    if (k[3] === "money") r.getCell(2).numFmt = '"€"#,##0.00'
    else if (k[3] === "pct") r.getCell(2).numFmt = "0.00\\%"
    else if (k[3] === "km") r.getCell(2).numFmt = "#,##0\" km\""
    else if (k[3] === "perkm") r.getCell(2).numFmt = '"€"0.000'
    ;[1, 2].forEach(c => {
      r.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
      }
      r.getCell(c).border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      }
    })
  })

  /* ---- Sheet 2: Trips ---- */
  const ws = wb.addWorksheet("Trips", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  ws.columns = cols.map(c => ({
    key: c.key,
    header: c.header,
    width: c.width,
  }))
  // Header row styling
  const headerRow = ws.getRow(1)
  headerRow.height = 26
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    }
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFF59E0B" } },
    }
  })

  ctx.rows.forEach((r, idx) => {
    const data: Record<string, string | number> = {}
    for (const c of cols) data[c.key] = cellValue(r, c.key) as string | number
    const added = ws.addRow(data)
    added.height = 22
    added.eachCell((cell, colNumber) => {
      const col = cols[colNumber - 1]
      if (col.numFmt) cell.numFmt = col.numFmt
      if (col.align) cell.alignment = { horizontal: col.align, vertical: "middle", indent: 1 }
      else cell.alignment = { vertical: "middle", indent: 1 }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
      }
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      }
    })
    // Profit color
    const profitIdx = cols.findIndex(c => c.key === "profit_eur") + 1
    if (profitIdx > 0) {
      const cell = added.getCell(profitIdx)
      cell.font = {
        bold: true,
        color: { argb: r.profit_eur >= 0 ? "FF10B981" : "FFEF4444" },
      }
    }
    // Margin color
    const marginIdx = cols.findIndex(c => c.key === "margin_pct") + 1
    if (marginIdx > 0 && r.margin_pct != null) {
      const cell = added.getCell(marginIdx)
      cell.font = {
        bold: true,
        color: {
          argb:
            r.margin_pct < 0
              ? "FFEF4444"
              : r.margin_pct < 5
              ? "FFF59E0B"
              : "FF10B981",
        },
      }
    }
    // Mixed badge color
    const mixIdx = cols.findIndex(c => c.key === "is_mixed") + 1
    if (mixIdx > 0) {
      const cell = added.getCell(mixIdx)
      cell.font = {
        bold: true,
        color: { argb: r.is_mixed ? "FFF59E0B" : "FF10B981" },
      }
    }
    // Planned-vs-actual flag
    if (ctx.showPlanned) {
      const plannedIdx = cols.findIndex(c => c.key === "planned_cost_eur") + 1
      if (plannedIdx > 0 && r.planned_cost_eur != null) {
        const cell = added.getCell(plannedIdx)
        const over = r.actual_cost_eur > r.planned_cost_eur
        cell.font = {
          bold: true,
          color: { argb: over ? "FFEF4444" : "FF10B981" },
        }
      }
    }
  })

  // Totals row
  const totalsData: Record<string, string | number> = {}
  for (const c of cols) {
    if (c.key === "reference_number") totalsData[c.key] = "TOTAL"
    else if (c.key === "distance_km") totalsData[c.key] = Math.round(ctx.totals.km)
    else if (c.key === "revenue_eur") totalsData[c.key] = ctx.totals.revenue
    else if (c.key === "actual_cost_eur") totalsData[c.key] = ctx.totals.actual
    else if (c.key === "planned_cost_eur" && ctx.totals.planned != null)
      totalsData[c.key] = ctx.totals.planned
    else if (c.key === "profit_eur") totalsData[c.key] = ctx.totals.profit
    else if (c.key === "margin_pct" && ctx.totals.marginPct != null)
      totalsData[c.key] = Number(ctx.totals.marginPct.toFixed(2))
    else if (c.key === "cost_per_km" && ctx.totals.eurPerKm != null)
      totalsData[c.key] = Number(ctx.totals.eurPerKm.toFixed(3))
    else if (c.key === "order_count")
      totalsData[c.key] = ctx.rows.reduce((s, r) => s + r.order_count, 0)
    else totalsData[c.key] = ""
  }
  const totalsRow = ws.addRow(totalsData)
  totalsRow.height = 24
  totalsRow.eachCell((cell, colNumber) => {
    const col = cols[colNumber - 1]
    if (col.numFmt) cell.numFmt = col.numFmt
    if (col.align)
      cell.alignment = { horizontal: col.align, vertical: "middle", indent: 1 }
    else cell.alignment = { vertical: "middle", indent: 1 }
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    }
    cell.border = {
      top: { style: "medium", color: { argb: "FFF59E0B" } },
    }
  })

  /* ---- Sheet 3: Orders (flattened, one row per order under its trip) ---- */
  const ordersWs = wb.addWorksheet("Orders", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  ordersWs.columns = [
    { key: "trip_ref", header: "Trip Ref", width: 18 },
    { key: "vehicle", header: "Vehicle", width: 14 },
    { key: "driver", header: "Driver", width: 22 },
    { key: "order_ref", header: "Order Ref", width: 18 },
    { key: "customer", header: "Customer", width: 26 },
    { key: "customer_ref", header: "Cust. Ref", width: 14 },
    { key: "status", header: "Status", width: 18 },
    { key: "cargo", header: "Cargo", width: 28 },
    { key: "internal_legs", header: "Internal legs", width: 11, align: "right" },
    { key: "subcontract_legs", header: "Subc. legs", width: 10, align: "right" },
    { key: "customer_price", header: "Customer price EUR", width: 16, numFmt: "#,##0.00", align: "right" },
    { key: "subcontract_cost", header: "Subcontracted cost EUR", width: 18, numFmt: "#,##0.00", align: "right" },
    { key: "internal_revenue", header: "Internal revenue EUR", width: 18, numFmt: "#,##0.00", align: "right" },
  ] as any
  ordersWs.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    }
    cell.alignment = { vertical: "middle", indent: 1 }
  })
  ordersWs.getRow(1).height = 24

  let oi = 0
  for (const r of ctx.rows) {
    for (const o of r.orders) {
      const cargoBits = [
        o.cargo_description ?? "",
        o.weight_kg ? `${o.weight_kg} kg` : "",
        o.pallet_count ? `${o.pallet_count} pal` : "",
      ]
        .filter(Boolean)
        .join(" / ")
      const row = ordersWs.addRow({
        trip_ref: r.reference_number ?? r.trip_id.slice(0, 8),
        vehicle: r.vehicle_label ?? "",
        driver: r.driver_name ?? "",
        order_ref: o.reference_number ?? "",
        customer: o.customer_name ?? "",
        customer_ref: o.customer_reference ?? "",
        status: (o.status ?? "").replace(/_/g, " "),
        cargo: cargoBits,
        internal_legs: o.internal_legs,
        subcontract_legs: o.subcontracted_legs,
        customer_price: o.customer_price_eur,
        subcontract_cost: o.subcontracted_cost_eur,
        internal_revenue: o.internal_revenue_eur,
      })
      row.eachCell(cell => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: oi % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
        }
        cell.alignment = cell.alignment ?? { vertical: "middle", indent: 1 }
      })
      oi += 1
    }
  }

  /* ---- Sheet 4: Legs ---- */
  const legsWs = wb.addWorksheet("Legs", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  legsWs.columns = [
    { key: "trip_ref", header: "Trip Ref", width: 18 },
    { key: "vehicle", header: "Vehicle", width: 14 },
    { key: "leg_number", header: "Leg #", width: 8, align: "right" },
    { key: "assignment", header: "Assignment", width: 14 },
    { key: "origin", header: "Origin", width: 24 },
    { key: "destination", header: "Destination", width: 24 },
    { key: "status", header: "Status", width: 16 },
    { key: "order_ref", header: "Order Ref", width: 18 },
  ] as any
  legsWs.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    }
    cell.alignment = { vertical: "middle", indent: 1 }
  })
  legsWs.getRow(1).height = 24
  let li = 0
  for (const r of ctx.rows) {
    for (const l of r.legs) {
      const row = legsWs.addRow({
        trip_ref: r.reference_number ?? r.trip_id.slice(0, 8),
        vehicle: r.vehicle_label ?? "",
        leg_number: l.leg_number ?? "",
        assignment: l.assignment_type ?? "",
        origin: l.origin ?? "",
        destination: l.destination ?? "",
        status: (l.status ?? "").replace(/_/g, " "),
        order_ref: l.order_ref ?? "",
      })
      row.eachCell(cell => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: li % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
        }
        cell.alignment = cell.alignment ?? { vertical: "middle", indent: 1 }
      })
      // Color subcontract legs amber
      const assignIdx = 4
      const cell = row.getCell(assignIdx)
      if (l.assignment_type === "subcontracted") {
        cell.font = { bold: true, color: { argb: "FFF59E0B" } }
      } else if (l.assignment_type === "internal") {
        cell.font = { bold: true, color: { argb: "FF10B981" } }
      }
      li += 1
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileBase(ctx)}.xlsx`,
  )
}

/* ---------------- PDF ---------------- */

export async function exportFleetPnlPdf(ctx: FleetExportContext) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()

  const ink: [number, number, number] = [15, 23, 42]
  const accent: [number, number, number] = [245, 158, 11]
  const muted: [number, number, number] = [100, 116, 139]
  const green: [number, number, number] = [16, 185, 129]
  const red: [number, number, number] = [220, 38, 38]
  const blue: [number, number, number] = [14, 165, 233]
  const orange: [number, number, number] = [249, 115, 22]
  const violet: [number, number, number] = [139, 92, 246]

  // Header band
  const headerH = 96
  doc.setFillColor(...ink)
  doc.rect(0, 0, pageW, headerH, "F")
  doc.setFillColor(...accent)
  doc.rect(0, headerH, pageW, 3, "F")

  const titleX = 32

  const bngLogo = await loadImageDataUrl("/images/logo-full-bng.png")
  if (bngLogo) {
    const bngH = 32
    const bngW = bngH * (768 / 295)
    const bngLeft = pageW - 32 - bngW
    const bngY = (headerH - bngH) / 2
    doc.addImage(bngLogo, "PNG", bngLeft, bngY, bngW, bngH)
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("Internal Fleet P&L", titleX, 34)

  const hasCompany = !!ctx.company?.name
  if (hasCompany) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...accent)
    doc.text(ctx.company!.name!, titleX, 52)
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(203, 213, 225)
  doc.text(`Period: ${ctx.from}  to  ${ctx.to}`, titleX, hasCompany ? 70 : 56)

  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `Generated ${fmtDateTime(new Date())}  ·  ${ctx.totals.tripCount} trips  ·  ${fmtKm(ctx.totals.km)}`,
    titleX,
    hasCompany ? 86 : 72,
  )

  // KPI cards
  const cardY = 116
  const cardH = 56
  const gap = 10
  const cards: Array<{ label: string; value: string; color: [number, number, number] }> = [
    { label: "Revenue", value: `EUR ${fmtMoney(ctx.totals.revenue)}`, color: blue },
    { label: "Actual cost", value: `EUR ${fmtMoney(ctx.totals.actual)}`, color: orange },
  ]
  if (ctx.showPlanned) {
    const plannedTone =
      ctx.totals.planned != null && ctx.totals.actual > ctx.totals.planned
        ? red
        : violet
    cards.push({
      label: "Planned cost",
      value: ctx.totals.planned == null ? "—" : `EUR ${fmtMoney(ctx.totals.planned)}`,
      color: plannedTone,
    })
  }
  cards.push(
    {
      label: "Profit",
      value: `EUR ${fmtMoney(ctx.totals.profit)}`,
      color: ctx.totals.profit >= 0 ? green : red,
    },
    {
      label: "Avg margin",
      value: fmtPct(ctx.totals.marginPct),
      color: violet,
    },
    {
      label: "Cost / km",
      value:
        ctx.totals.eurPerKm == null
          ? "—"
          : `EUR ${ctx.totals.eurPerKm.toFixed(3)}`,
      color: orange,
    },
  )
  const cardW = (pageW - 64 - gap * (cards.length - 1)) / cards.length
  cards.forEach((c, i) => {
    const x = 32 + i * (cardW + gap)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, cardY, cardW, cardH, 6, 6, "F")
    doc.setFillColor(...c.color)
    doc.rect(x, cardY, 3, cardH, "F")

    doc.setTextColor(...muted)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(c.label.toUpperCase(), x + 12, cardY + 18)

    doc.setTextColor(...ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text(c.value, x + 12, cardY + 40)
  })

  // Trips table
  const head = [
    [
      "Trip Ref",
      "Period",
      "Vehicle / Driver",
      "Route summary",
      "Distance",
      "Orders",
      "Revenue",
      "Cost",
      ...(ctx.showPlanned ? ["Planned"] : []),
      "Profit",
      "Margin",
      "EUR/km",
    ],
  ]

  const body = ctx.rows.map(r => {
    const ref = r.reference_number ?? r.trip_id.slice(0, 8)
    const periodStr = tripPeriod(r)
    const veh =
      [r.vehicle_label, r.driver_name].filter(Boolean).join("\n") ||
      "—"
    const route =
      [
        r.legs[0]?.origin && `${r.legs[0]!.origin} → ${r.legs[r.legs.length - 1]!.destination ?? ""}`,
        r.is_mixed ? "Mixed" : null,
        `${r.internal_leg_count} int / ${r.subcontract_leg_count} sub`,
      ]
        .filter(Boolean)
        .join("\n") || "—"
    const cells: (string | number)[] = [
      ref,
      periodStr,
      veh,
      route,
      fmtKm(r.distance_km),
      `${r.order_count}`,
      `EUR ${fmtMoney(r.revenue_eur)}`,
      `EUR ${fmtMoney(r.actual_cost_eur)}`,
    ]
    if (ctx.showPlanned) {
      cells.push(
        r.planned_cost_eur == null
          ? "—"
          : `EUR ${fmtMoney(r.planned_cost_eur)}`,
      )
    }
    cells.push(
      `EUR ${fmtMoney(r.profit_eur)}`,
      r.margin_pct == null ? "—" : `${r.margin_pct.toFixed(1)}%`,
      r.cost_per_km == null ? "—" : `EUR ${r.cost_per_km.toFixed(3)}`,
    )
    return cells
  })

  const profitCol = head[0].indexOf("Profit")
  const marginCol = head[0].indexOf("Margin")
  const plannedCol = ctx.showPlanned ? head[0].indexOf("Planned") : -1

  autoTable(doc, {
    head,
    body,
    startY: 188,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      textColor: ink,
      valign: "middle",
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { cellWidth: 92 },
      2: { cellWidth: 90 },
      3: { cellWidth: 110 },
      4: { halign: "right", cellWidth: 56 },
      5: { halign: "right", cellWidth: 38 },
      6: { halign: "right", cellWidth: 70 },
      7: { halign: "right", cellWidth: 70 },
    },
    didParseCell: data => {
      if (data.section !== "body") return
      const r = ctx.rows[data.row.index]
      if (!r) return
      if (data.column.index === profitCol) {
        data.cell.styles.textColor = r.profit_eur >= 0 ? green : red
        data.cell.styles.fontStyle = "bold"
      }
      if (data.column.index === marginCol && r.margin_pct != null) {
        data.cell.styles.textColor =
          r.margin_pct < 0 ? red : r.margin_pct < 5 ? accent : green
        data.cell.styles.fontStyle = "bold"
      }
      if (
        plannedCol > 0 &&
        data.column.index === plannedCol &&
        r.planned_cost_eur != null
      ) {
        data.cell.styles.textColor =
          r.actual_cost_eur > r.planned_cost_eur ? red : green
        data.cell.styles.fontStyle = "bold"
      }
    },
  })

  // Footer page numbers
  const pageCount = doc.getNumberOfPages()
  const pageH = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageW - 32,
      pageH - 16,
      { align: "right" },
    )
    doc.setTextColor(...accent)
    doc.text("BNG Tracking · Internal Fleet P&L", 32, pageH - 16)
  }

  doc.save(`${fileBase(ctx)}.pdf`)
}

/* ============================================================ */
/* ============== Detailed (line-by-line) exports ============= */
/* ============================================================ */

/* ---- shared helpers for Detailed P&L grouping ---- */

type TripPnlGroup = {
  trip_id: string
  trip_ref: string | null
  header: FleetDetailedTripHeader | null
  revenue_lines: FleetDetailedRevenueLine[]
  items: FleetDetailedItem[]
  legs: FleetDetailedLeg[]
  stops: FleetDetailedStop[]
  revenue_eur: number
  cost_eur: number
  profit_eur: number
  margin_pct: number
  cost_per_km: number
  bucket_totals: Record<FleetDetailedItem["bucket"], number>
}

function groupDetailed(ctx: FleetDetailedExportContext): TripPnlGroup[] {
  const groups = new Map<string, TripPnlGroup>()
  const ensure = (trip_id: string, trip_ref: string | null) => {
    let g = groups.get(trip_id)
    if (!g) {
      g = {
        trip_id,
        trip_ref,
        header: null,
        revenue_lines: [],
        items: [],
        legs: [],
        stops: [],
        revenue_eur: 0,
        cost_eur: 0,
        profit_eur: 0,
        margin_pct: 0,
        cost_per_km: 0,
        bucket_totals: { fuel: 0, toll: 0, driver: 0, other: 0, overhead: 0 },
      }
      groups.set(trip_id, g)
    }
    return g
  }

  for (const h of ctx.trip_headers ?? []) {
    ensure(h.trip_id, h.trip_ref).header = h
  }
  for (const r of ctx.revenue ?? []) {
    const g = ensure(r.trip_id, r.trip_ref)
    g.revenue_lines.push(r)
    g.revenue_eur += r.internal_revenue_eur
  }
  for (const it of ctx.items) {
    const g = ensure(it.trip_id, it.trip_ref)
    g.items.push(it)
    g.cost_eur += it.amount_eur
    g.bucket_totals[it.bucket] += it.amount_eur
  }
  for (const l of ctx.legs) {
    ensure(l.trip_id, l.trip_ref).legs.push(l)
  }
  for (const s of ctx.stops ?? []) {
    ensure(s.trip_id, s.trip_ref).stops.push(s)
  }

  const out = Array.from(groups.values())
  for (const g of out) {
    g.profit_eur = g.revenue_eur - g.cost_eur
    g.margin_pct = g.revenue_eur > 0 ? (g.profit_eur / g.revenue_eur) * 100 : 0
    const km = g.header?.actual_km ?? g.header?.planned_km ?? null
    g.cost_per_km = km && km > 0 ? g.cost_eur / km : 0
    g.stops.sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
    g.legs.sort((a, b) => (a.leg_number ?? 0) - (b.leg_number ?? 0))
  }
  out.sort((a, b) => (a.trip_ref ?? "").localeCompare(b.trip_ref ?? ""))
  return out
}

function detailedGrandTotals(groups: TripPnlGroup[]) {
  let revenue = 0,
    cost = 0,
    km = 0
  const buckets: Record<FleetDetailedItem["bucket"], number> = {
    fuel: 0,
    toll: 0,
    driver: 0,
    other: 0,
    overhead: 0,
  }
  for (const g of groups) {
    revenue += g.revenue_eur
    cost += g.cost_eur
    km += g.header?.actual_km ?? g.header?.planned_km ?? 0
    for (const b of Object.keys(buckets) as FleetDetailedItem["bucket"][]) {
      buckets[b] += g.bucket_totals[b]
    }
  }
  const profit = revenue - cost
  return {
    revenue,
    cost,
    profit,
    km,
    margin_pct: revenue > 0 ? (profit / revenue) * 100 : 0,
    cost_per_km: km > 0 ? cost / km : 0,
    buckets,
    trip_count: groups.length,
  }
}

/* ---- Detailed CSV ---- */

export function exportFleetPnlDetailedCsv(ctx: FleetDetailedExportContext) {
  const groups = groupDetailed(ctx)
  const tot = detailedGrandTotals(groups)
  const csvEscape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const row = (parts: (string | number | null | undefined)[]) =>
    parts.map(p => csvEscape(p == null ? "" : String(p))).join(",")

  const lines: string[] = []
  // Global header
  lines.push(`Internal Fleet P&L — Detailed`)
  lines.push(`Period,${ctx.from} to ${ctx.to}`)
  lines.push(`Generated,${fmtDateTime(new Date())}`)
  lines.push(`Trips,${tot.trip_count}`)
  lines.push(`Total Revenue EUR,${tot.revenue.toFixed(2)}`)
  lines.push(`Total Cost EUR,${tot.cost.toFixed(2)}`)
  lines.push(`Total Profit EUR,${tot.profit.toFixed(2)}`)
  lines.push(`Total Margin %,${tot.margin_pct.toFixed(2)}`)
  lines.push(`Total km,${tot.km.toFixed(0)}`)
  lines.push(`EUR/km,${tot.cost_per_km.toFixed(3)}`)
  lines.push("")

  // Per-trip blocks
  for (const g of groups) {
    lines.push(
      `### TRIP ${g.trip_ref ?? g.trip_id.slice(0, 8)} | ${g.header?.vehicle_plate ?? "—"} | ${g.header?.driver_name ?? "—"} | ${
        g.header?.actual_start ? fmtDate(g.header.actual_start) : g.header?.planned_start ? fmtDate(g.header.planned_start) : ""
      } → ${g.header?.actual_end ? fmtDate(g.header.actual_end) : g.header?.planned_end ? fmtDate(g.header.planned_end) : ""}${
        g.header?.route_confirmed_at ? " [CONFIRMED]" : ""
      }`,
    )
    lines.push(
      row([
        "",
        `Planned km: ${g.header?.planned_km ?? "—"}`,
        `Actual km: ${g.header?.actual_km ?? "—"}`,
        `Status: ${g.header?.status ?? "—"}`,
      ]),
    )

    // Revenue
    lines.push("")
    lines.push("REVENUE")
    lines.push(row(["Order Ref", "Customer", "Customer Price EUR", "Subcontracted Cost EUR", "Internal Revenue EUR"]))
    for (const r of g.revenue_lines) {
      lines.push(
        row([
          r.order_ref ?? r.order_id.slice(0, 8),
          r.customer_name ?? "",
          r.customer_price_eur.toFixed(2),
          r.subcontracted_cost_eur.toFixed(2),
          r.internal_revenue_eur.toFixed(2),
        ]),
      )
    }
    lines.push(row(["", "Revenue total", "", "", g.revenue_eur.toFixed(2)]))

    // Costs
    lines.push("")
    lines.push("COSTS")
    lines.push(row(["Bucket", "Source", "Date", "Description", "Vendor", "Country", "Qty", "Unit", "Amount EUR"]))
    for (const it of g.items) {
      lines.push(
        row([
          BUCKET_LABEL[it.bucket],
          it.source,
          it.occurred_at ? fmtDate(it.occurred_at) : "",
          it.description,
          it.vendor ?? "",
          it.country ?? "",
          it.quantity ?? "",
          it.unit ?? "",
          it.amount_eur.toFixed(2),
        ]),
      )
    }
    // Bucket subtotals
    for (const b of ["fuel", "toll", "driver", "other", "overhead"] as FleetDetailedItem["bucket"][]) {
      const v = g.bucket_totals[b]
      if (v) lines.push(row(["", `Subtotal ${BUCKET_LABEL[b]}`, "", "", "", "", "", "", v.toFixed(2)]))
    }
    lines.push(row(["", "Cost total", "", "", "", "", "", "", g.cost_eur.toFixed(2)]))

    // Legs
    if (g.legs.length) {
      lines.push("")
      lines.push("LEGS — Planned vs Actual km")
      lines.push(row(["Leg #", "Origin", "Destination", "Planned km", "Actual km", "Δ km"]))
      for (const l of g.legs) {
        lines.push(
          row([
            l.leg_number ?? "",
            l.origin ?? "",
            l.destination ?? "",
            l.planned_km ?? "",
            l.actual_km ?? "",
            l.delta_km ?? "",
          ]),
        )
      }
    }

    // Trip P&L footer
    lines.push("")
    lines.push("TRIP P&L")
    lines.push(row(["Revenue EUR", g.revenue_eur.toFixed(2)]))
    lines.push(row(["Cost EUR", g.cost_eur.toFixed(2)]))
    lines.push(row(["Profit EUR", g.profit_eur.toFixed(2)]))
    lines.push(row(["Margin %", g.margin_pct.toFixed(2)]))
    lines.push(row(["EUR/km", g.cost_per_km.toFixed(3)]))
    lines.push("")
    lines.push("")
  }

  // Grand totals
  lines.push("GRAND TOTALS")
  lines.push(row(["Trips", tot.trip_count]))
  lines.push(row(["Revenue EUR", tot.revenue.toFixed(2)]))
  lines.push(row(["Cost EUR", tot.cost.toFixed(2)]))
  lines.push(row(["Profit EUR", tot.profit.toFixed(2)]))
  lines.push(row(["Margin %", tot.margin_pct.toFixed(2)]))
  lines.push(row(["km", tot.km.toFixed(0)]))
  lines.push(row(["EUR/km", tot.cost_per_km.toFixed(3)]))

  const csv = lines.join("\r\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  triggerDownload(blob, `${fileBaseDetailed(ctx)}.csv`)
}

/* ---- Detailed Excel ---- */

export async function exportFleetPnlDetailedExcel(ctx: FleetDetailedExportContext) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "BNG Track"
  wb.created = new Date()

  const groups = groupDetailed(ctx)
  const tot = detailedGrandTotals(groups)

  /* ---------- Summary sheet (KPIs + cost composition) ---------- */
  const summary = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] })
  summary.columns = [{ width: 32 }, { width: 22 }]
  summary.mergeCells("A1:B1")
  const title = summary.getCell("A1")
  title.value = "Internal Fleet P&L — Detailed"
  title.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } }
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
  summary.getRow(1).height = 36

  summary.mergeCells("A2:B2")
  summary.getCell("A2").value = `${ctx.from}  to  ${ctx.to}`
  summary.getCell("A2").font = { color: { argb: "FF64748B" }, italic: true }

  let row = 4
  const writeKpi = (label: string, value: number | string, numFmt?: string, color?: string) => {
    const r = summary.getRow(row)
    r.getCell(1).value = label
    r.getCell(2).value = value
    if (numFmt) r.getCell(2).numFmt = numFmt
    r.getCell(2).alignment = { horizontal: "right" }
    r.getCell(2).font = {
      bold: true,
      color: color ? { argb: color } : { argb: "FF0F172A" },
    }
    row += 1
  }
  summary.getCell(`A${row}`).value = "P&L"
  summary.getCell(`A${row}`).font = { bold: true }
  row += 1
  writeKpi("Trips", tot.trip_count)
  writeKpi("Revenue (internal)", tot.revenue, '"€"#,##0.00')
  writeKpi("Total cost", tot.cost, '"€"#,##0.00')
  writeKpi("Profit", tot.profit, '"€"#,##0.00', tot.profit >= 0 ? "FF10B981" : "FFEF4444")
  writeKpi("Margin %", tot.margin_pct, "0.00", tot.margin_pct >= 0 ? "FF10B981" : "FFEF4444")
  writeKpi("km", tot.km, "#,##0")
  writeKpi("EUR/km", tot.cost_per_km, "0.000")
  row += 1
  summary.getCell(`A${row}`).value = "Cost composition"
  summary.getCell(`A${row}`).font = { bold: true }
  row += 1
  const order: FleetDetailedItem["bucket"][] = ["fuel", "toll", "driver", "other", "overhead"]
  for (const b of order) {
    const r = summary.getRow(row)
    r.getCell(1).value = BUCKET_LABEL[b]
    r.getCell(2).value = tot.buckets[b]
    r.getCell(2).numFmt = '"€"#,##0.00'
    r.getCell(2).alignment = { horizontal: "right" }
    r.getCell(2).font = { bold: true, color: { argb: BUCKET_COLOR[b] } }
    row += 1
  }

  /* ---------- Trip P&L (flat: one row per trip) ---------- */
  const flat = wb.addWorksheet("Trip P&L (flat)", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  flat.columns = [
    { key: "trip_ref", header: "Trip Ref", width: 18 },
    { key: "vehicle", header: "Vehicle", width: 14 },
    { key: "driver", header: "Driver", width: 22 },
    { key: "period", header: "Period", width: 22 },
    { key: "confirmed", header: "Confirmed", width: 10 },
    { key: "planned_km", header: "Planned km", width: 11, style: { numFmt: "#,##0" } },
    { key: "actual_km", header: "Actual km", width: 11, style: { numFmt: "#,##0" } },
    { key: "revenue", header: "Revenue EUR", width: 14, style: { numFmt: '"€"#,##0.00' } },
    { key: "fuel", header: "Fuel EUR", width: 12, style: { numFmt: '"€"#,##0.00' } },
    { key: "toll", header: "Toll EUR", width: 12, style: { numFmt: '"€"#,##0.00' } },
    { key: "driver_cost", header: "Driver EUR", width: 12, style: { numFmt: '"€"#,##0.00' } },
    { key: "other", header: "Other EUR", width: 12, style: { numFmt: '"€"#,##0.00' } },
    { key: "overhead", header: "Overhead EUR", width: 13, style: { numFmt: '"€"#,##0.00' } },
    { key: "cost", header: "Total cost EUR", width: 14, style: { numFmt: '"€"#,##0.00' } },
    { key: "profit", header: "Profit EUR", width: 13, style: { numFmt: '"€"#,##0.00' } },
    { key: "margin", header: "Margin %", width: 10, style: { numFmt: "0.00" } },
    { key: "eurkm", header: "EUR/km", width: 9, style: { numFmt: "0.000" } },
  ] as any
  flat.getRow(1).height = 24
  flat.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
    cell.alignment = { vertical: "middle", indent: 1 }
    cell.border = { bottom: { style: "medium", color: { argb: "FFF59E0B" } } }
  })
  groups.forEach((g, i) => {
    const periodFrom =
      g.header?.actual_start ?? g.header?.planned_start ?? null
    const periodTo = g.header?.actual_end ?? g.header?.planned_end ?? null
    const period =
      (periodFrom ? fmtDate(periodFrom) : "") +
      (periodTo ? ` → ${fmtDate(periodTo)}` : "")
    const added = flat.addRow({
      trip_ref: g.trip_ref ?? g.trip_id.slice(0, 8),
      vehicle: g.header?.vehicle_plate ?? "",
      driver: g.header?.driver_name ?? "",
      period,
      confirmed: g.header?.route_confirmed_at ? "Yes" : "—",
      planned_km: g.header?.planned_km ?? "",
      actual_km: g.header?.actual_km ?? "",
      revenue: g.revenue_eur,
      fuel: g.bucket_totals.fuel,
      toll: g.bucket_totals.toll,
      driver_cost: g.bucket_totals.driver,
      other: g.bucket_totals.other,
      overhead: g.bucket_totals.overhead,
      cost: g.cost_eur,
      profit: g.profit_eur,
      margin: g.margin_pct,
      eurkm: g.cost_per_km,
    })
    added.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
      }
      cell.alignment = cell.alignment ?? { vertical: "middle", indent: 1 }
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } }
      if (col === 15) {
        cell.font = { bold: true, color: { argb: g.profit_eur >= 0 ? "FF10B981" : "FFEF4444" } }
      } else if (col === 16) {
        cell.font = { bold: true, color: { argb: g.margin_pct >= 0 ? "FF10B981" : "FFEF4444" } }
      } else if (col === 5 && g.header?.route_confirmed_at) {
        cell.font = { bold: true, color: { argb: "FF10B981" } }
      }
    })
  })
  // Totals row
  const totalsRow = flat.addRow({
    trip_ref: "TOTAL",
    vehicle: "",
    driver: "",
    period: "",
    confirmed: "",
    planned_km: "",
    actual_km: tot.km,
    revenue: tot.revenue,
    fuel: tot.buckets.fuel,
    toll: tot.buckets.toll,
    driver_cost: tot.buckets.driver,
    other: tot.buckets.other,
    overhead: tot.buckets.overhead,
    cost: tot.cost,
    profit: tot.profit,
    margin: tot.margin_pct,
    eurkm: tot.cost_per_km,
  })
  totalsRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }
  })

  /* ---------- Trip P&L (vertical: per-trip block) ---------- */
  const vert = wb.addWorksheet("Trip P&L (vertical)", { views: [{ showGridLines: false }] })
  vert.columns = [
    { width: 22 },
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ]
  let vrow = 1
  for (const g of groups) {
    // Trip header band
    vert.mergeCells(`A${vrow}:E${vrow}`)
    const hCell = vert.getCell(`A${vrow}`)
    hCell.value = `Trip ${g.trip_ref ?? g.trip_id.slice(0, 8)} — ${g.header?.vehicle_plate ?? "—"} · ${g.header?.driver_name ?? "—"}${g.header?.route_confirmed_at ? "  [CONFIRMED]" : ""}`
    hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
    hCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 }
    hCell.alignment = { vertical: "middle", indent: 1 }
    vert.getRow(vrow).height = 26
    vrow += 1

    // Sub-header line
    const periodFrom = g.header?.actual_start ?? g.header?.planned_start ?? null
    const periodTo = g.header?.actual_end ?? g.header?.planned_end ?? null
    const sub = vert.getCell(`A${vrow}`)
    sub.value = `${periodFrom ? fmtDate(periodFrom) : ""}${periodTo ? `  →  ${fmtDate(periodTo)}` : ""}  ·  Planned km: ${g.header?.planned_km ?? "—"}  ·  Actual km: ${g.header?.actual_km ?? "—"}  ·  Status: ${g.header?.status ?? "—"}`
    vert.mergeCells(`A${vrow}:E${vrow}`)
    sub.font = { italic: true, color: { argb: "FF64748B" } }
    sub.alignment = { vertical: "middle", indent: 1 }
    vrow += 2

    // Revenue table
    const rh = vert.getRow(vrow)
    ;["Order Ref", "Customer", "Customer Price EUR", "Subc. Cost EUR", "Internal Revenue EUR"].forEach((t, i) => {
      const c = rh.getCell(i + 1)
      c.value = t
      c.font = { bold: true, color: { argb: "FFFFFFFF" } }
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }
      c.alignment = { vertical: "middle", indent: 1 }
    })
    vrow += 1
    for (const r of g.revenue_lines) {
      const rr = vert.getRow(vrow)
      rr.getCell(1).value = r.order_ref ?? r.order_id.slice(0, 8)
      rr.getCell(2).value = r.customer_name ?? ""
      rr.getCell(3).value = r.customer_price_eur
      rr.getCell(3).numFmt = '"€"#,##0.00'
      rr.getCell(4).value = r.subcontracted_cost_eur
      rr.getCell(4).numFmt = '"€"#,##0.00'
      rr.getCell(5).value = r.internal_revenue_eur
      rr.getCell(5).numFmt = '"€"#,##0.00'
      rr.getCell(5).font = { bold: true }
      vrow += 1
    }
    const revTotal = vert.getRow(vrow)
    revTotal.getCell(1).value = "Revenue total"
    revTotal.getCell(1).font = { bold: true }
    revTotal.getCell(5).value = g.revenue_eur
    revTotal.getCell(5).numFmt = '"€"#,##0.00'
    revTotal.getCell(5).font = { bold: true, color: { argb: "FF10B981" } }
    vrow += 2

    // Cost table
    const ch = vert.getRow(vrow)
    ;["Bucket", "Description", "Date / Vendor", "Qty", "Amount EUR"].forEach((t, i) => {
      const c = ch.getCell(i + 1)
      c.value = t
      c.font = { bold: true, color: { argb: "FFFFFFFF" } }
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }
      c.alignment = { vertical: "middle", indent: 1 }
    })
    vrow += 1
    for (const it of g.items) {
      const rr = vert.getRow(vrow)
      rr.getCell(1).value = BUCKET_LABEL[it.bucket]
      rr.getCell(1).font = { bold: true, color: { argb: BUCKET_COLOR[it.bucket] } }
      rr.getCell(2).value = it.description
      rr.getCell(3).value =
        (it.occurred_at ? fmtDate(it.occurred_at) : "") +
        (it.vendor ? ` · ${it.vendor}` : "")
      rr.getCell(4).value = it.quantity != null ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : ""
      rr.getCell(5).value = it.amount_eur
      rr.getCell(5).numFmt = '"€"#,##0.00'
      vrow += 1
    }
    // Bucket subtotals
    for (const b of order) {
      const v = g.bucket_totals[b]
      if (!v) continue
      const rr = vert.getRow(vrow)
      rr.getCell(2).value = `Subtotal ${BUCKET_LABEL[b]}`
      rr.getCell(2).font = { italic: true, color: { argb: BUCKET_COLOR[b] } }
      rr.getCell(5).value = v
      rr.getCell(5).numFmt = '"€"#,##0.00'
      rr.getCell(5).font = { bold: true, color: { argb: BUCKET_COLOR[b] } }
      vrow += 1
    }
    const costTotal = vert.getRow(vrow)
    costTotal.getCell(2).value = "Cost total"
    costTotal.getCell(2).font = { bold: true }
    costTotal.getCell(5).value = g.cost_eur
    costTotal.getCell(5).numFmt = '"€"#,##0.00'
    costTotal.getCell(5).font = { bold: true, color: { argb: "FFEF4444" } }
    vrow += 2

    // Legs
    if (g.legs.length) {
      const lh = vert.getRow(vrow)
      ;["Leg #", "Origin", "Destination", "Planned km", "Actual km / Δ"].forEach((t, i) => {
        const c = lh.getCell(i + 1)
        c.value = t
        c.font = { bold: true, color: { argb: "FFFFFFFF" } }
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }
      })
      vrow += 1
      for (const l of g.legs) {
        const rr = vert.getRow(vrow)
        rr.getCell(1).value = l.leg_number ?? ""
        rr.getCell(2).value = l.origin ?? ""
        rr.getCell(3).value = l.destination ?? ""
        rr.getCell(4).value = l.planned_km ?? ""
        rr.getCell(4).numFmt = "#,##0.0"
        const deltaText =
          l.actual_km != null
            ? `${l.actual_km}${l.delta_km != null ? ` (${l.delta_km > 0 ? "+" : ""}${l.delta_km})` : ""}`
            : "—"
        rr.getCell(5).value = deltaText
        if (l.delta_km != null) {
          rr.getCell(5).font = { color: { argb: l.delta_km > 0 ? "FFEF4444" : "FF10B981" }, bold: true }
        }
        vrow += 1
      }
      vrow += 1
    }

    // P&L footer
    const pf = vert.getRow(vrow)
    pf.getCell(1).value = "TRIP P&L"
    pf.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
    pf.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF59E0B" } }
    pf.getCell(2).value = `Revenue ${g.revenue_eur.toFixed(2)}`
    pf.getCell(3).value = `Cost ${g.cost_eur.toFixed(2)}`
    pf.getCell(4).value = `Profit ${g.profit_eur.toFixed(2)}`
    pf.getCell(4).font = { bold: true, color: { argb: g.profit_eur >= 0 ? "FF10B981" : "FFEF4444" } }
    pf.getCell(5).value = `Margin ${g.margin_pct.toFixed(2)}%  ·  €/km ${g.cost_per_km.toFixed(3)}`
    pf.getCell(5).font = { bold: true }
    vrow += 3
  }

  /* ---------- Line items sheet (flat detail) ---------- */
  const ws = wb.addWorksheet("Line items", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  ws.columns = [
    { key: "trip_ref", header: "Trip Ref", width: 16 },
    { key: "bucket", header: "Bucket", width: 16 },
    { key: "source", header: "Source", width: 18 },
    { key: "date", header: "Date", width: 12 },
    { key: "description", header: "Description", width: 36 },
    { key: "vendor", header: "Vendor", width: 18 },
    { key: "country", header: "Country", width: 8 },
    { key: "category", header: "Category", width: 18 },
    { key: "cost_code", header: "Cost code", width: 14 },
    { key: "quantity", header: "Qty", width: 8, style: { numFmt: "#,##0.00" } },
    { key: "unit", header: "Unit", width: 6 },
    { key: "currency", header: "Cur", width: 6 },
    { key: "amount_eur", header: "Amount EUR", width: 14, style: { numFmt: '"€"#,##0.00' } },
  ] as any
  const headerRow = ws.getRow(1)
  headerRow.height = 24
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
    cell.alignment = { vertical: "middle", indent: 1 }
    cell.border = { bottom: { style: "medium", color: { argb: "FFF59E0B" } } }
  })

  ctx.items.forEach((it, i) => {
    const added = ws.addRow({
      trip_ref: it.trip_ref ?? it.trip_id.slice(0, 8),
      bucket: BUCKET_LABEL[it.bucket],
      source: it.source,
      date: it.occurred_at ? fmtDate(it.occurred_at) : "",
      description: it.description,
      vendor: it.vendor ?? "",
      country: it.country ?? "",
      category: it.category ?? "",
      cost_code: it.cost_code ?? "",
      quantity: it.quantity ?? "",
      unit: it.unit ?? "",
      currency: it.currency ?? "",
      amount_eur: it.amount_eur,
    })
    added.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
      }
      cell.alignment = cell.alignment ?? { vertical: "middle", indent: 1 }
      if (col === 2) {
        cell.font = { bold: true, color: { argb: BUCKET_COLOR[it.bucket] } }
      }
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } }
    })
  })

  /* ---------- Per-leg planned vs actual km ---------- */
  const legsWs = wb.addWorksheet("Legs km", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  legsWs.columns = [
    { key: "trip_ref", header: "Trip Ref", width: 16 },
    { key: "leg_number", header: "Leg #", width: 8, style: { alignment: { horizontal: "right" } } },
    { key: "origin", header: "Origin", width: 28 },
    { key: "destination", header: "Destination", width: 28 },
    { key: "planned_km", header: "Planned km", width: 12, style: { numFmt: "#,##0.0" } },
    { key: "actual_km", header: "Actual km", width: 12, style: { numFmt: "#,##0.0" } },
    { key: "delta_km", header: "Δ km", width: 10, style: { numFmt: "+#,##0.0;-#,##0.0;0" } },
  ] as any
  legsWs.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }
    cell.alignment = { vertical: "middle", indent: 1 }
  })
  legsWs.getRow(1).height = 22
  ctx.legs.forEach((l, i) => {
    const added = legsWs.addRow({
      trip_ref: l.trip_ref ?? l.trip_id.slice(0, 8),
      leg_number: l.leg_number ?? "",
      origin: l.origin ?? "",
      destination: l.destination ?? "",
      planned_km: l.planned_km ?? "",
      actual_km: l.actual_km ?? "",
      delta_km: l.delta_km ?? "",
    })
    added.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
      }
      cell.alignment = cell.alignment ?? { vertical: "middle", indent: 1 }
      if (col === 7 && typeof l.delta_km === "number") {
        cell.font = {
          bold: true,
          color: { argb: l.delta_km > 0 ? "FFEF4444" : "FF10B981" },
        }
      }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileBaseDetailed(ctx)}.xlsx`,
  )
}

/* ---- Detailed PDF ---- */

export async function exportFleetPnlDetailedPdf(ctx: FleetDetailedExportContext) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const ink: [number, number, number] = [15, 23, 42]
  const accent: [number, number, number] = [245, 158, 11]
  const muted: [number, number, number] = [100, 116, 139]
  const green: [number, number, number] = [16, 185, 129]
  const red: [number, number, number] = [239, 68, 68]

  const groups = groupDetailed(ctx)
  const tot = detailedGrandTotals(groups)

  // Header band — title + company subtitle on the left, BNG logo on the right
  // (mirrors Forwarding Orders P&L for visual consistency).
  const company = ctx.company
  const hasCompany = !!company?.name
  const headerH = 96
  doc.setFillColor(...ink)
  doc.rect(0, 0, pageW, headerH, "F")
  doc.setFillColor(...accent)
  doc.rect(0, headerH, pageW, 3, "F")

  const titleX = 32
  const bngLogo = await loadImageDataUrl("/images/logo-full-bng.png")
  if (bngLogo) {
    const bngH = 32
    const bngW = bngH * (768 / 295)
    const bngLeft = pageW - 32 - bngW
    const bngY = (headerH - bngH) / 2
    doc.addImage(bngLogo, "PNG", bngLeft, bngY, bngW, bngH)
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("Internal Fleet P&L — Detailed", titleX, 34)

  if (hasCompany) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...accent)
    doc.text(company!.name!, titleX, 52)
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(203, 213, 225)
  doc.text(`Period: ${ctx.from}  to  ${ctx.to}`, titleX, hasCompany ? 70 : 56)

  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `Generated ${fmtDateTime(new Date())} · ${tot.trip_count} trips · Revenue EUR ${fmtMoney(tot.revenue)} · Cost EUR ${fmtMoney(tot.cost)} · Profit EUR ${fmtMoney(tot.profit)} (${tot.margin_pct.toFixed(1)}%)`,
    titleX,
    hasCompany ? 86 : 72,
  )

  // KPI cards
  const stripY = headerH + 20
  const stripH = 50
  const cardGap = 10
  type KpiCard = { label: string; value: string; color: [number, number, number] }
  const kpis: KpiCard[] = [
    { label: "REVENUE", value: `EUR ${fmtMoney(tot.revenue)}`, color: ink },
    { label: "TOTAL COST", value: `EUR ${fmtMoney(tot.cost)}`, color: red },
    {
      label: "PROFIT",
      value: `EUR ${fmtMoney(tot.profit)}`,
      color: tot.profit >= 0 ? green : red,
    },
    {
      label: "MARGIN",
      value: `${tot.margin_pct.toFixed(2)}%`,
      color: tot.margin_pct >= 0 ? green : red,
    },
    { label: "EUR / KM", value: tot.cost_per_km.toFixed(3), color: ink },
  ]
  const cardW = (pageW - 64 - cardGap * (kpis.length - 1)) / kpis.length
  kpis.forEach((c, i) => {
    const x = 32 + i * (cardW + cardGap)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, stripY, cardW, stripH, 6, 6, "F")
    doc.setFillColor(...c.color)
    doc.rect(x, stripY, 3, stripH, "F")
    doc.setTextColor(...muted)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(c.label, x + 12, stripY + 18)
    doc.setTextColor(...c.color)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text(c.value, x + 12, stripY + 38)
  })

  let cursorY = stripY + stripH + 16

  const ensureSpace = (need: number) => {
    if (cursorY + need > pageH - 40) {
      doc.addPage()
      cursorY = 40
    }
  }

  for (const g of groups) {
    ensureSpace(80)

    // Trip header band
    doc.setFillColor(...ink)
    doc.rect(32, cursorY, pageW - 64, 26, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(
      `Trip ${g.trip_ref ?? g.trip_id.slice(0, 8)}  ·  ${g.header?.vehicle_plate ?? "—"}  ·  ${g.header?.driver_name ?? "—"}`,
      40,
      cursorY + 17,
    )
    if (g.header?.route_confirmed_at) {
      doc.setTextColor(...green)
      doc.text("CONFIRMED", pageW - 40, cursorY + 17, { align: "right" })
    } else {
      doc.setTextColor(...accent)
      doc.text(
        `Profit EUR ${fmtMoney(g.profit_eur)} · ${g.margin_pct.toFixed(1)}%`,
        pageW - 40,
        cursorY + 17,
        { align: "right" },
      )
    }
    cursorY += 26

    // Sub-line: dates + km
    doc.setFillColor(241, 245, 249)
    doc.rect(32, cursorY, pageW - 64, 18, "F")
    doc.setTextColor(...muted)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    const periodFrom = g.header?.actual_start ?? g.header?.planned_start ?? null
    const periodTo = g.header?.actual_end ?? g.header?.planned_end ?? null
    const periodStr = `${periodFrom ? fmtDate(periodFrom) : "—"} → ${periodTo ? fmtDate(periodTo) : "—"}`
    doc.text(
      `${periodStr}  ·  Planned km ${g.header?.planned_km ?? "—"}  ·  Actual km ${g.header?.actual_km ?? "—"}  ·  Status ${g.header?.status ?? "—"}`,
      40,
      cursorY + 12,
    )
    cursorY += 22

    // Revenue table
    if (g.revenue_lines.length) {
      autoTable(doc, {
        startY: cursorY,
        theme: "grid",
        head: [["Order Ref", "Customer", "Customer Price EUR", "Subc. Cost EUR", "Internal Revenue EUR"]],
        body: [
          ...g.revenue_lines.map(r => [
            r.order_ref ?? r.order_id.slice(0, 8),
            r.customer_name ?? "",
            `EUR ${fmtMoney(r.customer_price_eur)}`,
            `EUR ${fmtMoney(r.subcontracted_cost_eur)}`,
            `EUR ${fmtMoney(r.internal_revenue_eur)}`,
          ]),
          ["", "Revenue total", "", "", `EUR ${fmtMoney(g.revenue_eur)}`],
        ],
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5 },
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        tableWidth: "auto",
        columnStyles: {
          0: { cellWidth: 90, fontStyle: "bold" },
          2: { halign: "right", cellWidth: 110 },
          3: { halign: "right", cellWidth: 110 },
          4: { halign: "right", cellWidth: 130, fontStyle: "bold" },
        },
        didParseCell: data => {
          if (data.section === "body" && data.row.index === g.revenue_lines.length) {
            data.cell.styles.fillColor = [220, 252, 231]
            data.cell.styles.fontStyle = "bold"
          }
        },
        margin: { left: 32, right: 32 },
      })
      // @ts-expect-error autoTable adds finalY
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 8
    }

    // Costs table
    if (g.items.length) {
      ensureSpace(60)
      const order: FleetDetailedItem["bucket"][] = ["fuel", "toll", "driver", "other", "overhead"]
      const subtotalRows: any[][] = []
      for (const b of order) {
        const v = g.bucket_totals[b]
        if (v) subtotalRows.push(["", `Subtotal ${BUCKET_LABEL[b]}`, "", "", "", "", `EUR ${fmtMoney(v)}`])
      }
      autoTable(doc, {
        startY: cursorY,
        theme: "grid",
        head: [["Bucket", "Description", "Date", "Vendor", "Qty", "Unit", "Amount EUR"]],
        body: [
          ...g.items.map(it => [
            BUCKET_LABEL[it.bucket],
            it.description,
            it.occurred_at ? fmtDate(it.occurred_at) : "",
            it.vendor ?? "",
            it.quantity == null ? "" : String(it.quantity),
            it.unit ?? "",
            `EUR ${fmtMoney(it.amount_eur)}`,
          ]),
          ...subtotalRows,
          ["", "Cost total", "", "", "", "", `EUR ${fmtMoney(g.cost_eur)}`],
        ],
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: ink },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        tableWidth: "auto",
        columnStyles: {
          0: { cellWidth: 80, fontStyle: "bold" },
          2: { cellWidth: 60 },
          3: { cellWidth: 110 },
          4: { halign: "right", cellWidth: 40 },
          5: { cellWidth: 30 },
          6: { halign: "right", cellWidth: 90, fontStyle: "bold" },
        },
        didParseCell: data => {
          if (data.section !== "body") return
          const itemsLen = g.items.length
          const totalRowIdx = itemsLen + subtotalRows.length
          if (data.row.index < itemsLen && data.column.index === 0) {
            const it = g.items[data.row.index]
            if (it) {
              const argb = BUCKET_COLOR[it.bucket]
              data.cell.styles.textColor = [
                parseInt(argb.slice(2, 4), 16),
                parseInt(argb.slice(4, 6), 16),
                parseInt(argb.slice(6, 8), 16),
              ]
            }
          } else if (data.row.index >= itemsLen && data.row.index < totalRowIdx) {
            data.cell.styles.fillColor = [255, 251, 235]
            data.cell.styles.fontStyle = "bold"
          } else if (data.row.index === totalRowIdx) {
            data.cell.styles.fillColor = [254, 226, 226]
            data.cell.styles.fontStyle = "bold"
          }
        },
        margin: { left: 32, right: 32 },
      })
      // @ts-expect-error autoTable adds finalY
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 8
    }

    // Stops (Route)
    if (g.stops.length) {
      ensureSpace(60)
      autoTable(doc, {
        startY: cursorY,
        theme: "grid",
        head: [["#", "Type", "Company", "Address", "City", "Country", "Planned", "Actual", "Ref"]],
        body: g.stops.map(s => {
          const planned = [
            s.planned_date ? fmtDate(s.planned_date) : null,
            s.planned_time_from && s.planned_time_to
              ? `${s.planned_time_from.slice(0, 5)}–${s.planned_time_to.slice(0, 5)}`
              : s.planned_time_from?.slice(0, 5) ?? null,
          ].filter(Boolean).join(" ")
          const actual = s.actual_arrival
            ? fmtDateTime(s.actual_arrival)
            : s.actual_departure
            ? fmtDateTime(s.actual_departure)
            : ""
          return [
            s.sequence_order == null ? "" : String(s.sequence_order),
            (s.stop_type ?? "").toUpperCase(),
            s.company_name ?? "",
            s.address ?? "",
            s.city ?? "",
            s.country ?? "",
            planned || "—",
            actual || "—",
            s.reference_number ?? "",
          ]
        }),
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        tableWidth: "auto",
        columnStyles: {
          0: { halign: "right", cellWidth: 22 },
          1: { fontStyle: "bold", cellWidth: 50 },
          6: { cellWidth: 80 },
          7: { cellWidth: 90 },
          8: { cellWidth: 60 },
        },
        margin: { left: 32, right: 32 },
      })
      // @ts-expect-error autoTable adds finalY
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 8
    }

    // Legs
    if (g.legs.length) {
      ensureSpace(60)
      autoTable(doc, {
        startY: cursorY,
        theme: "grid",
        head: [["Leg #", "Origin", "Destination", "Planned km", "Actual km", "Δ km"]],
        body: g.legs.map(l => [
          l.leg_number == null ? "" : String(l.leg_number),
          l.origin ?? "",
          l.destination ?? "",
          l.planned_km == null ? "—" : String(l.planned_km),
          l.actual_km == null ? "—" : String(l.actual_km),
          l.delta_km == null ? "—" : l.delta_km > 0 ? `+${l.delta_km}` : String(l.delta_km),
        ]),
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        tableWidth: "auto",
        columnStyles: {
          0: { halign: "right", cellWidth: 40 },
          3: { halign: "right", cellWidth: 70 },
          4: { halign: "right", cellWidth: 70 },
          5: { halign: "right", cellWidth: 60, fontStyle: "bold" },
        },
        didParseCell: data => {
          if (data.section !== "body" || data.column.index !== 5) return
          const l = g.legs[data.row.index]
          if (!l || l.delta_km == null) return
          data.cell.styles.textColor = l.delta_km > 0 ? red : green
        },
        margin: { left: 32, right: 32 },
      })
      // @ts-expect-error autoTable adds finalY
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 8
    }

    // Trip P&L footer band
    ensureSpace(34)
    doc.setFillColor(...accent)
    doc.rect(32, cursorY, pageW - 64, 26, "F")
    doc.setTextColor(...ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("TRIP P&L", 40, cursorY + 17)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    const pnlText = `Revenue EUR ${fmtMoney(g.revenue_eur)}    Cost EUR ${fmtMoney(g.cost_eur)}    Profit EUR ${fmtMoney(g.profit_eur)}    Margin ${g.margin_pct.toFixed(2)}%    EUR/km ${g.cost_per_km.toFixed(3)}`
    doc.text(pnlText, pageW - 40, cursorY + 17, { align: "right" })
    cursorY += 30
  }

  // Grand totals page
  ensureSpace(160)
  doc.setFillColor(...ink)
  doc.rect(32, cursorY, pageW - 64, 30, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("GRAND TOTALS", 40, cursorY + 20)
  cursorY += 30

  autoTable(doc, {
    startY: cursorY,
    theme: "plain",
    body: [
      ["Trips", String(tot.trip_count)],
      ["Revenue", `EUR ${fmtMoney(tot.revenue)}`],
      ["Total cost", `EUR ${fmtMoney(tot.cost)}`],
      ["Profit", `EUR ${fmtMoney(tot.profit)}`],
      ["Margin %", `${tot.margin_pct.toFixed(2)}%`],
      ["km", tot.km.toFixed(0)],
      ["EUR / km", tot.cost_per_km.toFixed(3)],
      ["Fuel & AdBlue", `EUR ${fmtMoney(tot.buckets.fuel)}`],
      ["Tolls & vignettes", `EUR ${fmtMoney(tot.buckets.toll)}`],
      ["Driver", `EUR ${fmtMoney(tot.buckets.driver)}`],
      ["Other expenses", `EUR ${fmtMoney(tot.buckets.other)}`],
      ["Allocated overhead", `EUR ${fmtMoney(tot.buckets.overhead)}`],
    ],
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: 240, fontStyle: "bold", textColor: muted },
      1: { halign: "right", cellWidth: 200, fontStyle: "bold", textColor: ink },
    },
    margin: { left: 32, right: 32 },
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    doc.text(`Page ${i} of ${pageCount}`, pageW - 32, pageH - 16, { align: "right" })
    doc.setTextColor(...accent)
    doc.text("BNG Tracking · Internal Fleet P&L (Detailed)", 32, pageH - 16)
  }

  doc.save(`${fileBaseDetailed(ctx)}.pdf`)
}
