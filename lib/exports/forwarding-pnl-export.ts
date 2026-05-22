// Export utilities for the Forwarding Orders P&L report.
// Generates CSV, Excel (.xlsx) and PDF outputs from the same Row[] dataset.
//
// All three formats share the same column order so the user gets the
// exact same data regardless of the format they pick.

import ExcelJS from "exceljs"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export type PnlRow = {
  order_id: string
  reference_number: string | null
  status: string | null
  order_type: string | null
  commercial_role: string | null
  created_at: string
  customer_id: string | null
  customer_name: string | null
  revenue_amount: number
  revenue_currency: string
  revenue_eur: number
  cost_total_eur: number
  cost_internal_eur: number
  cost_subcontract_eur: number
  cost_other_eur: number
  profit_eur: number
  margin_pct: number | null
  execution_mode: "internal" | "subcontracted" | "mixed" | "unassigned"
  legs_total: number
  legs_internal: number
  legs_subcontract: number
  child_subcontract_count: number
  customer_invoice_status:
    | "none"
    | "draft"
    | "issued"
    | "paid"
    | "partial"
    | "overdue"
  customer_invoiced_eur: number
  customer_paid_eur: number
  customer_outstanding_eur: number
  carrier_invoice_status:
    | "none"
    | "fully_invoiced"
    | "fully_paid"
    | "partial_paid"
  carrier_invoiced_eur: number
  carrier_paid_eur: number
  carrier_outstanding_eur: number
  subcontracts?: SubcontractInfo[]
}

export type SubcontractStop = {
  type: string | null
  city: string | null
  country: string | null
  planned_date: string | null
  planned_time_from: string | null
  planned_time_to: string | null
}

export type SubcontractInfo = {
  id: string
  reference_number: string | null
  status: string | null
  carrier_id: string | null
  carrier_name: string | null
  customer_name: string | null
  customer_reference: string | null
  cost_amount: number
  cost_currency: string | null
  cargo_description: string | null
  weight_kg: number | null
  pallet_count: number | null
  loading_meters: number | null
  pickup: SubcontractStop | null
  delivery: SubcontractStop | null
  route_label: string | null
  transport_from: string | null
  transport_to: string | null
  added_at: string | null
  added_by: string | null
  pod_count: number
  pod_last_uploaded_at: string | null
  pod_status: "received" | "missing"
}

function fmtCargo(s: SubcontractInfo) {
  const parts: string[] = []
  if (s.pallet_count) parts.push(`${s.pallet_count}p`)
  if (s.loading_meters) parts.push(`${Number(s.loading_meters).toFixed(1)}ldm`)
  if (s.weight_kg) parts.push(`${(Number(s.weight_kg) / 1000).toFixed(1)}t`)
  return parts.join(" ")
}

function fmtTransportRange(s: SubcontractInfo) {
  if (!s.transport_from && !s.transport_to) return ""
  if (s.transport_from === s.transport_to) return s.transport_from ?? ""
  return `${s.transport_from ?? "?"} → ${s.transport_to ?? "?"}`
}

function podSummary(subs: SubcontractInfo[] | undefined) {
  if (!subs || subs.length === 0) return "n/a"
  const received = subs.filter(s => s.pod_status === "received").length
  if (received === 0) return "Missing"
  if (received === subs.length) return "Received"
  return `Partial ${received}/${subs.length}`
}

function carrierSummary(subs: SubcontractInfo[] | undefined) {
  if (!subs || subs.length === 0) return "—"
  const names = Array.from(
    new Set(
      subs
        .map(s => (s.carrier_name ?? "").trim())
        .filter(n => n.length > 0),
    ),
  )
  if (names.length === 0) return "—"
  if (names.length === 1) return names[0]
  if (names.length === 2) return names.join(" + ")
  return `${names[0]} +${names.length - 1}`
}

export type PnlTotals = {
  revenue: number
  costs: number
  profit: number
  arOutstanding: number
  apOutstanding: number
  avgMargin: number
  count: number
}

export type ExportContext = {
  from: string
  to: string
  rows: PnlRow[]
  totals: PnlTotals
  filters?: {
    execution?: string
    customerInvoice?: string
  }
}

const COLUMNS: Array<{
  key: keyof PnlRow | "created_date" | "pod_status" | "carrier_summary"
  header: string
  width: number
  numFmt?: string
  align?: "left" | "right" | "center"
}> = [
  { key: "reference_number", header: "Order Ref", width: 18 },
  { key: "customer_name", header: "Customer", width: 28 },
  { key: "carrier_summary", header: "Carrier", width: 28 },
  { key: "created_date", header: "Created", width: 12 },
  { key: "status", header: "Status", width: 16 },
  { key: "execution_mode", header: "Execution", width: 14 },
  { key: "legs_total", header: "Legs", width: 8, align: "right" },
  { key: "legs_internal", header: "Internal", width: 9, align: "right" },
  { key: "legs_subcontract", header: "Subc.", width: 8, align: "right" },
  { key: "revenue_amount", header: "Revenue", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "revenue_currency", header: "Curr", width: 7 },
  { key: "revenue_eur", header: "Revenue EUR", width: 14, numFmt: "#,##0.00", align: "right" },
  { key: "cost_total_eur", header: "Cost Total EUR", width: 14, numFmt: "#,##0.00", align: "right" },
  { key: "cost_internal_eur", header: "Internal EUR", width: 13, numFmt: "#,##0.00", align: "right" },
  { key: "cost_subcontract_eur", header: "Subc. EUR", width: 13, numFmt: "#,##0.00", align: "right" },
  { key: "cost_other_eur", header: "Other EUR", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "profit_eur", header: "Profit EUR", width: 13, numFmt: "#,##0.00", align: "right" },
  { key: "margin_pct", header: "Margin %", width: 10, numFmt: "0.00", align: "right" },
  { key: "customer_invoice_status", header: "Customer INV.", width: 14 },
  { key: "customer_invoiced_eur", header: "Cust. Invoiced", width: 14, numFmt: "#,##0.00", align: "right" },
  { key: "customer_paid_eur", header: "Cust. Paid", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "customer_outstanding_eur", header: "Cust. Outstanding", width: 16, numFmt: "#,##0.00", align: "right" },
  { key: "carrier_invoice_status", header: "Carrier INV.", width: 14 },
  { key: "carrier_invoiced_eur", header: "Carr. Invoiced", width: 14, numFmt: "#,##0.00", align: "right" },
  { key: "carrier_paid_eur", header: "Carr. Paid", width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "carrier_outstanding_eur", header: "Carr. Outstanding", width: 16, numFmt: "#,##0.00", align: "right" },
  { key: "pod_status", header: "POD (Carrier)", width: 14 },
]

function cellValue(r: PnlRow, key: (typeof COLUMNS)[number]["key"]) {
  if (key === "created_date") {
    return r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ""
  }
  if (key === "pod_status") {
    return podSummary(r.subcontracts)
  }
  if (key === "carrier_summary") {
    return carrierSummary(r.subcontracts)
  }
  const v = (r as any)[key]
  return v === null || v === undefined ? "" : v
}

function fileBase(ctx: ExportContext) {
  return `forwarding-pnl_${ctx.from}_${ctx.to}`
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

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)
}

// ---------------- CSV ----------------
export function exportPnlCsv(ctx: ExportContext) {
  const headers = COLUMNS.map(c => c.header)
  const lines = ctx.rows.map(r =>
    COLUMNS.map(c => {
      const v = cellValue(r, c.key)
      const s = typeof v === "number" ? String(v) : String(v ?? "")
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(","),
  )
  // Pretty header block
  const meta = [
    `Forwarding Orders P&L`,
    `Period,${ctx.from} to ${ctx.to}`,
    `Generated,${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    `Orders,${ctx.totals.count}`,
    `Revenue EUR,${ctx.totals.revenue.toFixed(2)}`,
    `Cost Total EUR,${ctx.totals.costs.toFixed(2)}`,
    `Profit EUR,${ctx.totals.profit.toFixed(2)}`,
    `Avg Margin %,${ctx.totals.avgMargin.toFixed(2)}`,
    "",
  ]
  const csv = [...meta, headers.join(","), ...lines].join("\r\n")
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  })
  triggerDownload(blob, `${fileBase(ctx)}.csv`)
}

// ---------------- Excel ----------------
export async function exportPnlExcel(ctx: ExportContext) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "BNG Track"
  wb.created = new Date()

  // ---- Sheet 1: Summary
  const summary = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  })
  summary.columns = [{ width: 26 }, { width: 22 }]

  summary.mergeCells("A1:B1")
  const title = summary.getCell("A1")
  title.value = "Forwarding Orders P&L"
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

  const kpis: Array<[string, string | number, string]> = [
    ["Orders", ctx.totals.count, "FF334155"],
    ["Revenue (EUR)", ctx.totals.revenue, "FF0EA5E9"],
    ["Total Costs (EUR)", ctx.totals.costs, "FFF97316"],
    ["Profit (EUR)", ctx.totals.profit, "FF10B981"],
    ["Avg Margin %", ctx.totals.avgMargin, "FF8B5CF6"],
    ["A/R Outstanding (EUR)", ctx.totals.arOutstanding, "FF3B82F6"],
    ["A/P Outstanding (EUR)", ctx.totals.apOutstanding, "FFEF4444"],
  ]

  kpis.forEach((k, i) => {
    const r = summary.getRow(4 + i)
    r.height = 26
    r.getCell(1).value = k[0]
    r.getCell(1).font = { bold: true, color: { argb: "FF334155" } }
    r.getCell(1).alignment = { vertical: "middle", indent: 1 }
    r.getCell(2).value = k[1]
    r.getCell(2).alignment = { horizontal: "right", vertical: "middle", indent: 1 }
    r.getCell(2).font = { bold: true, color: { argb: k[2] }, size: 13 }
    if (typeof k[1] === "number" && k[0] !== "Orders" && !k[0].includes("Margin")) {
      r.getCell(2).numFmt = '"€"#,##0.00'
    } else if (k[0].includes("Margin")) {
      r.getCell(2).numFmt = "0.00\\%"
    }
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

  // ---- Sheet 2: Orders
  const ws = wb.addWorksheet("Orders", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  })
  ws.columns = COLUMNS.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.numFmt
      ? { numFmt: c.numFmt, alignment: { horizontal: c.align ?? "left" } }
      : { alignment: { horizontal: c.align ?? "left" } },
  }))

  // Header style
  const headerRow = ws.getRow(1)
  headerRow.height = 30
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    }
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFF59E0B" } },
    }
  })

  // Data rows
  ctx.rows.forEach((r, idx) => {
    const row: Record<string, any> = {}
    COLUMNS.forEach(c => {
      row[c.key as string] = cellValue(r, c.key)
    })
    const added = ws.addRow(row)
    added.height = 20
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC"
    added.eachCell(cell => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: zebra },
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      }
    })

    // Profit color (positive green / negative red)
    const profitCellIdx =
      COLUMNS.findIndex(c => c.key === "profit_eur") + 1
    if (profitCellIdx > 0) {
      const cell = added.getCell(profitCellIdx)
      cell.font = {
        bold: true,
        color: {
          argb:
            (r.profit_eur ?? 0) >= 0 ? "FF059669" : "FFDC2626",
        },
      }
    }

    // Execution mode pill-like color
    const exIdx = COLUMNS.findIndex(c => c.key === "execution_mode") + 1
    if (exIdx > 0) {
      const map: Record<string, string> = {
        internal: "FF10B981",
        subcontracted: "FF8B5CF6",
        mixed: "FFF59E0B",
        unassigned: "FF94A3B8",
      }
      const c = added.getCell(exIdx)
      c.font = { bold: true, color: { argb: map[r.execution_mode] ?? "FF334155" } }
    }
  })

  // Totals row
  const totalsRow = ws.addRow({
    reference_number: "TOTAL",
    revenue_eur: ctx.totals.revenue,
    cost_total_eur: ctx.totals.costs,
    profit_eur: ctx.totals.profit,
    customer_outstanding_eur: ctx.totals.arOutstanding,
    carrier_outstanding_eur: ctx.totals.apOutstanding,
    margin_pct: ctx.totals.avgMargin,
  })
  totalsRow.height = 26
  totalsRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    }
    cell.border = {
      top: { style: "medium", color: { argb: "FFF59E0B" } },
    }
  })

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  }

  // ---- Sheet 3: Subcontracts (VLR-*) — rich, "Forwarder Board"-style sheet
  const allSubs = ctx.rows.flatMap(r =>
    (r.subcontracts ?? []).map(s => ({ parent: r, sub: s })),
  )
  if (allSubs.length > 0) {
    const subsSheet = wb.addWorksheet("Subcontracts", {
      views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })

    // Title band (row 1)
    subsSheet.mergeCells("A1:N1")
    const tcell = subsSheet.getCell("A1")
    tcell.value = `Subcontract Orders (VLR)  ·  ${allSubs.length} legs  ·  ${ctx.from} → ${ctx.to}`
    tcell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } }
    tcell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    tcell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    }
    subsSheet.getRow(1).height = 30

    const SUB_COLS = [
      { header: "Reference", key: "ref", width: 16 },
      { header: "Parent", key: "parent", width: 18 },
      { header: "Status", key: "status", width: 16 },
      { header: "Customer", key: "customer", width: 26 },
      { header: "Cust. Ref", key: "cust_ref", width: 16 },
      { header: "Route", key: "route", width: 32 },
      { header: "Carrier", key: "carrier", width: 26 },
      { header: "Cost", key: "cost", width: 12, numFmt: "#,##0.00" },
      { header: "Curr", key: "cur", width: 7 },
      { header: "Cargo", key: "cargo", width: 16 },
      { header: "Transport Dates", key: "tdates", width: 22 },
      { header: "POD", key: "pod", width: 14 },
      { header: "Added On", key: "added_on", width: 12 },
      { header: "Added By", key: "added_by", width: 20 },
    ] as const

    // Header row (row 2)
    const headerRowIdx = 2
    SUB_COLS.forEach((c, i) => {
      const col = subsSheet.getColumn(i + 1)
      col.width = c.width
      if ((c as any).numFmt) col.numFmt = (c as any).numFmt
      const cell = subsSheet.getCell(headerRowIdx, i + 1)
      cell.value = c.header
    })
    const subHeader = subsSheet.getRow(headerRowIdx)
    subHeader.height = 28
    subHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      }
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true }
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF8B5CF6" } },
      }
    })

    // Data rows
    allSubs.forEach(({ parent, sub }, idx) => {
      const r = subsSheet.addRow({})
      r.height = 22
      const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC"

      const setCell = (
        colIdx: number,
        value: any,
        opts: {
          align?: "left" | "right" | "center"
          bold?: boolean
          colorArgb?: string
          numFmt?: string
        } = {},
      ) => {
        const cell = r.getCell(colIdx)
        cell.value = value
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: zebra },
        }
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        }
        cell.alignment = {
          vertical: "middle",
          horizontal: opts.align ?? "left",
          indent: opts.align === "right" ? 0 : 1,
          wrapText: false,
        }
        if (opts.numFmt) cell.numFmt = opts.numFmt
        cell.font = {
          bold: !!opts.bold,
          size: 10,
          color: { argb: opts.colorArgb ?? "FF0F172A" },
        }
      }

      // 1 Reference
      setCell(1, sub.reference_number ?? sub.id.slice(0, 8), {
        bold: true,
        colorArgb: "FF0EA5E9",
      })
      // 2 Parent
      setCell(2, parent.reference_number ?? parent.order_id.slice(0, 8), {
        colorArgb: "FF64748B",
      })
      // 3 Status
      const statusColors: Record<string, string> = {
        delivered: "FF059669",
        in_progress: "FFF59E0B",
        carrier_confirmed: "FF0EA5E9",
        assigned_to_carrier: "FF8B5CF6",
        cancelled: "FFDC2626",
      }
      const stKey = (sub.status || "").toLowerCase()
      setCell(3, sub.status ?? "-", {
        bold: true,
        colorArgb: statusColors[stKey] ?? "FF334155",
      })
      // 4 Customer
      setCell(4, sub.customer_name ?? parent.customer_name ?? "-")
      // 5 Cust ref
      setCell(5, sub.customer_reference ?? "")
      // 6 Route
      setCell(6, sub.route_label ?? "-", { colorArgb: "FF334155" })
      // 7 Carrier
      setCell(7, sub.carrier_name ?? "-", { bold: true })
      // 8 Cost
      setCell(8, sub.cost_amount, {
        align: "right",
        bold: true,
        numFmt: "#,##0.00",
        colorArgb: "FFF97316",
      })
      // 9 Currency
      setCell(9, sub.cost_currency ?? "", {
        align: "center",
        colorArgb: "FF64748B",
      })
      // 10 Cargo
      setCell(10, fmtCargo(sub), { colorArgb: "FF475569" })
      // 11 Transport dates
      setCell(11, fmtTransportRange(sub), { colorArgb: "FF475569" })
      // 12 POD
      const podLabel =
        sub.pod_status === "received"
          ? sub.pod_count > 1
            ? `Received (${sub.pod_count})`
            : "Received"
          : "Missing"
      setCell(12, podLabel, {
        bold: true,
        colorArgb: sub.pod_status === "received" ? "FF059669" : "FFDC2626",
      })
      // 13 Added on
      setCell(
        13,
        sub.added_at
          ? new Date(sub.added_at).toISOString().slice(0, 10)
          : "",
        { colorArgb: "FF64748B" },
      )
      // 14 Added by
      setCell(14, sub.added_by ?? "system", {
        colorArgb: "FF334155",
      })
    })

    subsSheet.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: headerRowIdx, column: SUB_COLS.length },
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  triggerDownload(blob, `${fileBase(ctx)}.xlsx`)
}

// ---------------- PDF ----------------
export function exportPnlPdf(ctx: ExportContext) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // Brand colors
  const ink: [number, number, number] = [15, 23, 42]      // slate-900
  const accent: [number, number, number] = [245, 158, 11] // amber-500
  const muted: [number, number, number] = [100, 116, 139] // slate-500
  const green: [number, number, number] = [16, 185, 129]
  const red: [number, number, number] = [220, 38, 38]
  const blue: [number, number, number] = [14, 165, 233]
  const orange: [number, number, number] = [249, 115, 22]
  const violet: [number, number, number] = [139, 92, 246]

  // Header band
  doc.setFillColor(...ink)
  doc.rect(0, 0, pageW, 70, "F")
  doc.setFillColor(...accent)
  doc.rect(0, 70, pageW, 3, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text("Forwarding Orders P&L", 32, 35)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(203, 213, 225)
  doc.text(`Period: ${ctx.from}  to  ${ctx.to}`, 32, 55)

  const generated = new Date().toISOString().slice(0, 19).replace("T", " ")
  doc.text(`Generated ${generated}`, pageW - 32, 55, { align: "right" })
  doc.text(`${ctx.totals.count} orders`, pageW - 32, 35, { align: "right" })

  // KPI cards
  const cardY = 90
  const cardH = 56
  const gap = 10
  const cards: Array<{ label: string; value: string; color: [number, number, number] }> = [
    { label: "Revenue", value: `EUR ${fmtMoney(ctx.totals.revenue)}`, color: blue },
    { label: "Total Costs", value: `EUR ${fmtMoney(ctx.totals.costs)}`, color: orange },
    { label: "Profit", value: `EUR ${fmtMoney(ctx.totals.profit)}`, color: green },
    { label: "Avg Margin", value: `${ctx.totals.avgMargin.toFixed(2)}%`, color: violet },
    { label: "A/R Outstanding", value: `EUR ${fmtMoney(ctx.totals.arOutstanding)}`, color: blue },
    { label: "A/P Outstanding", value: `EUR ${fmtMoney(ctx.totals.apOutstanding)}`, color: red },
  ]
  const cardW = (pageW - 64 - gap * (cards.length - 1)) / cards.length
  cards.forEach((c, i) => {
    const x = 32 + i * (cardW + gap)
    // card bg
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, cardY, cardW, cardH, 6, 6, "F")
    // accent bar
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

  // Table
  const head = [
    [
      "Order Ref",
      "Customer",
      "Carrier",
      "Created",
      "Status",
      "Execution",
      "Revenue EUR",
      "Cost EUR",
      "Profit EUR",
      "Margin",
      "Customer INV.",
      "Cust. Out.",
      "Carrier INV.",
      "Carr. Out.",
      "POD",
    ],
  ]
  const body = ctx.rows.map(r => [
    r.reference_number ?? r.order_id.slice(0, 8),
    r.customer_name ?? "-",
    carrierSummary(r.subcontracts),
    new Date(r.created_at).toISOString().slice(0, 10),
    r.status ?? "-",
    r.execution_mode,
    fmtMoney(r.revenue_eur),
    fmtMoney(r.cost_total_eur),
    fmtMoney(r.profit_eur),
    r.margin_pct == null ? "-" : `${Number(r.margin_pct).toFixed(1)}%`,
    r.customer_invoice_status,
    fmtMoney(r.customer_outstanding_eur),
    r.carrier_invoice_status,
    fmtMoney(r.carrier_outstanding_eur),
    podSummary(r.subcontracts),
  ])

  autoTable(doc, {
    head,
    body,
    startY: cardY + cardH + 18,
    margin: { left: 32, right: 32 },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      textColor: ink,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: ink,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: "bold" },
      2: { textColor: violet, fontStyle: "bold" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right", fontStyle: "bold" },
      9: { halign: "right" },
      11: { halign: "right" },
      13: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return
      const r = ctx.rows[data.row.index]
      if (!r) return

      // Profit color
      if (data.column.index === 8) {
        data.cell.styles.textColor = (r.profit_eur ?? 0) >= 0 ? green : red
      }
      // Execution mode pill color
      if (data.column.index === 5) {
        const map: Record<string, [number, number, number]> = {
          internal: green,
          subcontracted: violet,
          mixed: accent,
          unassigned: muted,
        }
        data.cell.styles.textColor = map[r.execution_mode] ?? ink
        data.cell.styles.fontStyle = "bold"
      }
      // Invoice status colors
      if (data.column.index === 10) {
        const map: Record<string, [number, number, number]> = {
          paid: green,
          partial: accent,
          overdue: red,
          issued: blue,
          draft: muted,
          none: muted,
        }
        data.cell.styles.textColor =
          map[r.customer_invoice_status] ?? ink
        data.cell.styles.fontStyle = "bold"
      }
      if (data.column.index === 12) {
        const map: Record<string, [number, number, number]> = {
          fully_paid: green,
          partial_paid: accent,
          fully_invoiced: blue,
          none: muted,
        }
        data.cell.styles.textColor =
          map[r.carrier_invoice_status] ?? ink
        data.cell.styles.fontStyle = "bold"
      }
      // POD column
      if (data.column.index === 14) {
        const txt = String(data.cell.raw ?? "").toLowerCase()
        if (txt === "received") data.cell.styles.textColor = green
        else if (txt.startsWith("partial")) data.cell.styles.textColor = accent
        else if (txt === "missing") data.cell.styles.textColor = red
        else data.cell.styles.textColor = muted
        data.cell.styles.fontStyle = "bold"
      }
    },
    didDrawPage: () => {
      // Footer
      const str = `Page ${doc.getNumberOfPages()}`
      doc.setFontSize(8)
      doc.setTextColor(...muted)
      doc.text("BNG Track  •  Forwarding Orders P&L", 32, pageH - 18)
      doc.text(str, pageW - 32, pageH - 18, { align: "right" })
    },
  })

  doc.save(`${fileBase(ctx)}.pdf`)
}
