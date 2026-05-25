/**
 * File parsing for cost-import. Handles xlsx/xls/csv into a unified
 * { headers, rows } shape so the rest of the pipeline doesn't care about
 * the source format.
 *
 * We isolate the heavy `xlsx` dependency here so it's only loaded inside
 * Node API routes (it's not safe to bundle for the browser at our size).
 */

import * as XLSX from "xlsx"
import Papa from "papaparse"

export interface ParsedFile {
  headers: string[]
  /** Each row is keyed by the matching header (raw, untransformed). */
  rows: Record<string, unknown>[]
  /** Detected sheet names (xlsx only). */
  sheets?: string[]
}

export interface ParseOptions {
  format?: "xlsx" | "xls" | "csv" | "auto"
  /** xlsx sheet name; defaults to the first sheet. */
  sheetName?: string
  /** 0-based header row inside the sheet (default 0). */
  headerRowIndex?: number
  /** csv delimiter. Default auto-detects (Papa's behavior). */
  delimiter?: string
  /** csv encoding. Default utf-8. */
  encoding?: string
  /** If false, treat first row as data (synthetic headers col_1, col_2, …). */
  hasHeaderRow?: boolean
}

/** Sniff format from filename if `auto`. */
export function detectFormat(filename: string): "xlsx" | "xls" | "csv" {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".xlsx")) return "xlsx"
  if (lower.endsWith(".xls")) return "xls"
  return "csv"
}

/**
 * Parse a Buffer into a uniform shape.
 *
 * IMPORTANT: we set `raw: false` on xlsx so dates and numbers don't get
 * silently coerced into JS Date objects (which then break our European-style
 * "31/03/2026" date detection). Instead we get the formatted string the user
 * sees in Excel and parse it ourselves in the resolver.
 */
export function parseBuffer(
  buf: Buffer,
  filename: string,
  opts: ParseOptions = {},
): ParsedFile {
  const format = opts.format && opts.format !== "auto" ? opts.format : detectFormat(filename)
  const headerRow = opts.headerRowIndex ?? 0
  const hasHeader = opts.hasHeaderRow ?? true

  if (format === "csv") {
    const text = buf.toString((opts.encoding as BufferEncoding) || "utf-8")
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: hasHeader,
      delimiter: opts.delimiter || "",
      skipEmptyLines: true,
      // Papa's dynamic typing turns "01/03/2026" into NaN sometimes — keep strings.
      dynamicTyping: false,
    })
    if (hasHeader) {
      const headers = (parsed.meta.fields ?? []).map((h) => String(h ?? "").trim())
      return {
        headers,
        rows: (parsed.data as Record<string, unknown>[]).filter((r) =>
          Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== ""),
        ),
      }
    }
    // Synthetic headers
    const matrix = parsed.data as unknown as unknown[][]
    if (matrix.length === 0) return { headers: [], rows: [] }
    const headers = matrix[0].map((_, i) => `col_${i + 1}`)
    const rows = matrix.map((arr) => {
      const r: Record<string, unknown> = {}
      headers.forEach((h, i) => (r[h] = arr[i]))
      return r
    })
    return { headers, rows }
  }

  // xlsx / xls
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false })
  const sheets = wb.SheetNames
  const sheetName = opts.sheetName && wb.Sheets[opts.sheetName] ? opts.sheetName : sheets[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return { headers: [], rows: [], sheets }
  }

  // Get raw 2D matrix so we can pick a custom header row.
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  })

  if (matrix.length === 0) return { headers: [], rows: [], sheets }

  let headers: string[]
  let dataStart: number
  if (hasHeader) {
    const headerArr = matrix[headerRow] ?? []
    headers = headerArr.map((h, i) => {
      const s = h == null ? "" : String(h).trim()
      return s || `col_${i + 1}`
    })
    dataStart = headerRow + 1
  } else {
    headers = (matrix[0] ?? []).map((_, i) => `col_${i + 1}`)
    dataStart = 0
  }

  const rows: Record<string, unknown>[] = []
  for (let r = dataStart; r < matrix.length; r++) {
    const arr = matrix[r] ?? []
    // Skip totally blank rows.
    if (!arr.some((v) => v !== null && v !== undefined && String(v).trim() !== "")) continue
    const row: Record<string, unknown> = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = arr[c] ?? null
    }
    rows.push(row)
  }

  return { headers, rows, sheets }
}

/**
 * Best-effort fuzzy matcher used by "Suggest mapping from sample file".
 * Returns a score 0..1 between a target field hint and a source header.
 */
export function headerSimilarity(target: string, source: string): number {
  const a = target.toLowerCase().replace(/[^a-z0-9]/g, "")
  const b = source.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!a || !b) return 0
  if (a === b) return 1
  if (b.includes(a) || a.includes(b)) return 0.85
  // Token-overlap score
  const at = new Set(target.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const bt = new Set(source.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  if (!at.size || !bt.size) return 0
  let inter = 0
  at.forEach((t) => {
    if (bt.has(t)) inter++
  })
  return inter / Math.max(at.size, bt.size)
}
