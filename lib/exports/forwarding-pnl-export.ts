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

export type SubcontractInfo = {
  id: string
  reference_number: string | null
  carrier_id: string | null
  carrier_name: string | null
  cost_amount: number
  cost_currency: string | null
  pod_count: number
  pod_last_uploaded_at: string | null
  pod_status: "received" | "missing"
}

function podSummary(subs: SubcontractInfo[] | undefined) {
  if (!subs || subs.length === 0) return "n/a"
  const received = subs.filter(s => s.pod_status === "received").length
  if (received === 0) return "Missing"
  if (received === subs.length) return "Received"
  return `Partial ${received}/${subs.length}`
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
  key: keyof PnlRow | "created_date" | "pod_status"
  header: string
  width: number
  numFmt?: string
  align?: "left" | "right" | "center"
}> = [
  { key: "reference_number", header: "Order Ref", width: 18 },
  { key: "customer_name", header: "Customer", width: 30 },
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

  // ---- Sheet 3: Subcontracts (VLR-*)
  const allSubs = ctx.rows.flatMap(r =>
    (r.subcontracts ?? []).map(s => ({ parent: r, sub: s })),
  )
  if (allSubs.length > 0) {
    const subsSheet = wb.addWorksheet("Subcontracts", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    })
    const SUB_COLS = [
      { header: "Parent Order", key: "parent", width: 18 },
      { header: "Subcontract Ref", key: "sub_ref", width: 18 },
      { header: "Customer", key: "customer", width: 28 },
      { header: "Carrier", key: "carrier", width: 28 },
      { header: "Cost", key: "cost", width: 12, numFmt: "#,##0.00" },
      { header: "Curr", key: "cur", width: 7 },
      { header: "POD Status", key: "pod", width: 14 },
      { header: "POD Files", key: "pod_count", width: 10, numFmt: "0" },
      { header: "POD Last Upload", key: "pod_last", width: 22 },
    ] as const

    subsSheet.columns = SUB_COLS.map(c => ({
      header: c.header,
      key: c.key,
      width: c.width,
      style: (c as any).numFmt ? { numFmt: (c as any).numFmt } : {},
    }))

    const subHeader = subsSheet.getRow(1)
    subHeader.height = 30
    subHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      }
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF8B5CF6" } },
      }
    })

    allSubs.forEach(({ parent, sub }, idx) => {
      const r = subsSheet.addRow({
        parent: parent.reference_number ?? parent.order_id.slice(0, 8),
        sub_ref: sub.reference_number ?? sub.id.slice(0, 8),
        customer: parent.customer_name ?? "-",
        carrier: sub.carrier_name ?? "-",
        cost: sub.cost_amount,
        cur: sub.cost_currency ?? "",
        pod: sub.pod_status === "received" ? "Received" : "Missing",
        pod_count: sub.pod_count,
        pod_last: sub.pod_last_uploaded_at
          ? new Date(sub.pod_last_uploaded_at).toISOString().replace("T", " ").slice(0, 19)
          : "",
      })
      r.height = 20
      const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC"
      r.eachCell(cell => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: zebra },
        }
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        }
      })
      const podCell = r.getCell(7)
      podCell.font = {
        bold: true,
        color: {
          argb: sub.pod_status === "received" ? "FF059669" : "FFDC2626",
        },
      }
    })

    subsSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: SUB_COLS.length },
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
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right", fontStyle: "bold" },
      8: { halign: "right" },
      10: { halign: "right" },
      12: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return
      const r = ctx.rows[data.row.index]
      if (!r) return

      // Profit color
      if (data.column.index === 7) {
        data.cell.styles.textColor = (r.profit_eur ?? 0) >= 0 ? green : red
      }
      // Execution mode pill color
      if (data.column.index === 4) {
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
      if (data.column.index === 9) {
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
      if (data.column.index === 11) {
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
      if (data.column.index === 13) {
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
