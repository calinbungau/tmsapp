/**
 * Romanian "FACTURA" (tax invoice) PDF builder.
 *
 * Renders a TMS invoice (the ones synced to Saga, which have no SmartBill
 * document of their own) into a true PDF using jsPDF + jspdf-autotable, so
 * the operator can preview / download / email a proper invoice document
 * straight from the order panel.
 *
 * The visual layout intentionally mirrors the classic Saga print layout:
 *   - "FACTURA" title, "Numar", "Data / Scadent la", currency tag.
 *   - Furnizor (supplier) vs Client two-column fiscal header.
 *   - Line-items table: Nr. crt. | Denumire | UM | Cantitate | Pret unitar |
 *     Valoare | TVA (x%).
 *   - Subtotal row (sum Valoare / sum TVA) + a bold grand Total.
 *
 * jsPDF + jspdf-autotable are already used in this project (see
 * lib/telematic/door-temp-pdf.ts) and run fully in the browser, so the
 * document is built client-side with no headless Chromium.
 */
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export interface InvoicePdfSupplier {
  name: string
  /** Fiscal code / CUI, already formatted (e.g. "RO36372820"). */
  cif: string
  /** Trade register number, e.g. "J05/1472/2016". */
  regCom: string
  address?: string | null
  city?: string | null
  country?: string | null
  bankName?: string | null
  iban?: string | null
}

export interface InvoicePdfClient {
  name: string
  cif: string
  address?: string | null
  city?: string | null
  country?: string | null
}

export interface InvoicePdfLine {
  description: string
  um: string
  quantity: number
  unitPrice: number
  value: number
  vatRate: number
  vat: number
}

export interface InvoicePdfInput {
  invoiceNumber: string
  /** ISO date string (YYYY-MM-DD) or null. */
  date: string | null
  dueDate: string | null
  currency: string
  /** TMS order reference / id shown under the client block. */
  reference?: string | null
  notes?: string | null
  supplier: InvoicePdfSupplier
  client: InvoicePdfClient
  lines: InvoicePdfLine[]
}

export interface BuildInvoicePdfResult {
  blob: Blob
  base64: string
  filename: string
  /** Object URL for inline preview. Caller is responsible for revoking it. */
  objectUrl: string
}

// dd.mm.yyyy
function fmtDate(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

// 16271.5 -> "16 271.59" (space thousands, dot decimals). Mirrors the Saga print look.
function fmtNum(n: number, decimals: number): string {
  const fixed = (Number(n) || 0).toFixed(decimals)
  const [int, frac] = fixed.split(".")
  const sign = int.startsWith("-") ? "-" : ""
  const digits = sign ? int.slice(1) : int
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`
}

function sanitizeForFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
}

/** Build the invoice PDF entirely on the client. */
export function generateInvoicePdf(input: InvoicePdfInput): BuildInvoicePdfResult {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 40
  const right = pageWidth - 40

  const INK: [number, number, number] = [17, 18, 34]
  const GREY: [number, number, number] = [110, 110, 120]

  // ── Title block ──
  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text("FACTURA", left, 56)

  doc.setFontSize(11)
  doc.text(`Numar ${input.invoiceNumber || "-"}`, left, 78)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(`Data ${fmtDate(input.date)}`, left, 98)
  doc.text(`Scadent la ${fmtDate(input.dueDate)}`, left + 110, 98)

  // Currency tag on the right
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  const curTag = `- ${(input.currency || "RON").toUpperCase()} -`
  doc.text(curTag, right, 98, { align: "right" })

  // Divider
  doc.setDrawColor(180, 180, 188)
  doc.setLineWidth(0.8)
  doc.line(left, 118, right, 118)

  // ── Furnizor / Client columns ──
  const colRightX = left + (right - left) / 2 + 10
  let yL = 138
  let yR = 138

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GREY)
  doc.text("Furnizor", left, yL)
  doc.text("Client", colRightX, yR)
  yL += 20
  yR += 20

  // Supplier name + fiscal
  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(input.supplier.name || "-", left, yL)
  yL += 18
  doc.setFontSize(9.5)
  const supFiscal: string[] = []
  if (input.supplier.cif) supFiscal.push(`CIF ${input.supplier.cif}`)
  if (input.supplier.regCom) supFiscal.push(`RC ${input.supplier.regCom}`)
  if (supFiscal.length) {
    doc.setFont("helvetica", "bold")
    doc.text(supFiscal.join("     "), left, yL)
    yL += 16
  }
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...GREY)
  const supAddr = [input.supplier.address, [input.supplier.city, input.supplier.country].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join("  ")
  if (supAddr) {
    doc.text(supAddr, left, yL, { maxWidth: colRightX - left - 16 })
    yL += 14
  }
  if (input.supplier.iban) {
    doc.text(`${input.supplier.bankName ? input.supplier.bankName + "  " : ""}${input.supplier.iban}`, left, yL, {
      maxWidth: colRightX - left - 16,
    })
    yL += 14
  }

  // Client name + fiscal
  doc.setTextColor(...INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(input.client.name || "-", colRightX, yR)
  yR += 18
  if (input.client.cif) {
    doc.setFontSize(9.5)
    doc.text(`CIF ${input.client.cif}`, colRightX, yR)
    yR += 16
  }
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...GREY)
  const cliAddr = [input.client.address, [input.client.city, input.client.country].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join("  ")
  if (cliAddr) {
    doc.text(cliAddr, colRightX, yR, { maxWidth: right - colRightX })
    yR += 14
  }

  // Reference (order id / ref) centered under the columns
  let headerBottom = Math.max(yL, yR) + 6
  if (input.reference) {
    doc.setTextColor(...GREY)
    doc.setFontSize(8.5)
    doc.text(String(input.reference), colRightX, headerBottom)
    headerBottom += 16
  }

  // ── Items table ──
  const vatRates = Array.from(new Set(input.lines.map((l) => Math.round(l.vatRate)).filter((r) => r > 0)))
  const vatHeader = vatRates.length === 1 ? `TVA (${vatRates[0]}%)` : "TVA"

  const body = input.lines.map((l, i) => [
    String(i + 1),
    l.description,
    l.um || "BUC",
    fmtNum(l.quantity, 3),
    fmtNum(l.unitPrice, 4),
    fmtNum(l.value, 2),
    fmtNum(l.vat, 2),
  ])

  const sumValoare = input.lines.reduce((s, l) => s + (Number(l.value) || 0), 0)
  const sumTva = input.lines.reduce((s, l) => s + (Number(l.vat) || 0), 0)
  const grandTotal = sumValoare + sumTva

  autoTable(doc, {
    head: [["Nr. crt.", "Denumire produse/servicii", "UM", "Cantitate", "Pret unitar", "Valoare", vatHeader]],
    body,
    foot: [["", "", "", "", "", fmtNum(sumValoare, 2), fmtNum(sumTva, 2)]],
    startY: headerBottom + 6,
    margin: { left, right: 40 },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 4 },
      textColor: [26, 26, 26],
      lineColor: [210, 210, 216],
      lineWidth: 0,
    },
    headStyles: {
      fontStyle: "normal",
      textColor: [60, 60, 70],
      lineWidth: { top: 0.8, bottom: 0.8, left: 0, right: 0 },
      lineColor: [120, 120, 130],
    },
    footStyles: {
      fontStyle: "bold",
      textColor: INK,
      lineWidth: { top: 0.8, bottom: 0, left: 0, right: 0 },
      lineColor: [120, 120, 130],
    },
    columnStyles: {
      0: { halign: "right", cellWidth: 38 },
      1: { halign: "left" },
      2: { halign: "center", cellWidth: 34 },
      3: { halign: "right", cellWidth: 56 },
      4: { halign: "right", cellWidth: 72 },
      5: { halign: "right", cellWidth: 72 },
      6: { halign: "right", cellWidth: 72 },
    },
  })

  // ── Grand total ──
  const finalY = (doc as any).lastAutoTable?.finalY ?? headerBottom + 60
  const totalY = finalY + 34
  doc.setDrawColor(120, 120, 130)
  doc.setLineWidth(0.8)
  doc.line(right - 320, totalY - 16, right, totalY - 16)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text("Total", right - 200, totalY)
  doc.text(`${fmtNum(grandTotal, 2)}`, right, totalY, { align: "right" })

  // ── Notes (optional) ──
  if (input.notes && input.notes.trim()) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...GREY)
    doc.text(input.notes.trim(), left, totalY + 30, { maxWidth: right - left })
  }

  // ── Footer ──
  doc.setFontSize(8)
  doc.setTextColor(...GREY)
  const footer = "Document generat din TMS"
  doc.text(footer, (pageWidth - doc.getTextWidth(footer)) / 2, pageHeight - 24)

  doc.setProperties({
    title: `Factura_${input.invoiceNumber || ""}`,
    subject: "Factura",
    creator: input.supplier.name || "TMS",
  })

  const filename = `Factura_${sanitizeForFilename(input.invoiceNumber || "draft")}.pdf`
  const arr = doc.output("arraybuffer") as ArrayBuffer
  const buffer = new Uint8Array(arr)
  const blob = new Blob([buffer], { type: "application/pdf" })

  // base64 (chunked to avoid call-stack overflow on large docs)
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buffer.subarray(i, i + CHUNK)))
  }
  const base64 =
    typeof window !== "undefined" ? window.btoa(binary) : Buffer.from(buffer).toString("base64")

  const objectUrl = typeof URL !== "undefined" ? URL.createObjectURL(blob) : ""

  return { blob, base64, filename, objectUrl }
}
