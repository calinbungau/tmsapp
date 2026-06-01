import { XMLParser } from "fast-xml-parser"
import type { BankCreditEntry, BankStatementAccount } from "./types"

/**
 * Parse a Banca Transilvania (BT GO) CAMT.053.001.08 statement into incoming
 * credits ("incasari"). Only CRDT entries are returned; debits (card/POS
 * payments, fees, outgoing transfers) are ignored.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Tags can appear 0, 1 or many times; normalize to arrays where it matters.
  isArray: (name) => name === "Ntry" || name === "TxDtls" || name === "Ustrd",
  trimValues: true,
  parseTagValue: false, // keep raw strings; we coerce numbers ourselves
})

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/** Get the text content of a node that may be a string or { "#text": ... }. */
function text(node: any): string | null {
  if (node === undefined || node === null) return null
  if (typeof node === "string") return node.trim() || null
  if (typeof node === "number") return String(node)
  if (typeof node === "object" && "#text" in node) {
    const t = node["#text"]
    return t === undefined || t === null ? null : String(t).trim() || null
  }
  return null
}

/** Pull a date string (YYYY-MM-DD) out of <Dt><Dt>..</Dt></Dt> or <Dt>..</Dt>. */
function parseDate(node: any): string | null {
  if (!node) return null
  // node may be { Dt: "2026-05-04" } or { Dt: { Dt: "..." } } or { DtTm: "..." }
  const dt = node.Dt ?? node.DtTm ?? node
  const raw = text(dt) ?? text(node.DtTm)
  if (!raw) return null
  // Normalize datetime to date.
  return raw.slice(0, 10)
}

function parseAmount(node: any): { amount: number; currency: string } {
  if (!node) return { amount: 0, currency: "" }
  const raw = text(node) ?? "0"
  const ccy = node?.["@_Ccy"] ?? ""
  const amount = Number.parseFloat(raw.replace(/,/g, "")) || 0
  return { amount, currency: String(ccy) }
}

export interface ParsedStatement {
  account: BankStatementAccount
  credits: BankCreditEntry[]
}

export function parseCamt053(xml: string): ParsedStatement {
  const doc = parser.parse(xml)

  const stmt = doc?.Document?.BkToCstmrStmt?.Stmt
  if (!stmt) {
    throw new Error("Fisier invalid: nu am gasit structura CAMT.053 (BkToCstmrStmt/Stmt).")
  }

  // A file may technically contain multiple statements; BT exports one.
  const stmtNode = Array.isArray(stmt) ? stmt[0] : stmt

  const acctId = stmtNode?.Acct?.Id
  const account: BankStatementAccount = {
    iban: text(acctId?.IBAN) ?? text(acctId?.Othr?.Id),
    currency: text(stmtNode?.Acct?.Ccy),
    ownerName: text(stmtNode?.Acct?.Nm) ?? text(doc?.Document?.BkToCstmrStmt?.GrpHdr?.MsgRcpt?.Nm),
  }

  const entries = toArray(stmtNode?.Ntry)
  const credits: BankCreditEntry[] = []

  for (const ntry of entries) {
    const cdtDbt = text(ntry?.CdtDbtInd)
    if (cdtDbt !== "CRDT") continue // only incoming receipts

    const status = text(ntry?.Sts?.Cd) ?? text(ntry?.Sts)
    if (status && status !== "BOOK") continue // skip pending/info entries

    const { amount, currency } = parseAmount(ntry?.Amt)
    if (amount <= 0) continue

    const bookingDate = parseDate(ntry?.BookgDt)
    const valueDate = parseDate(ntry?.ValDt)

    // Transaction-level details (take the first; BT credits are single-tx).
    const txList = toArray(ntry?.NtryDtls?.TxDtls)
    const tx = txList[0] ?? {}

    const dbtrPty = tx?.RltdPties?.Dbtr?.Pty ?? tx?.RltdPties?.Dbtr
    const debtorName = text(dbtrPty?.Nm) ?? null
    const debtorIban =
      text(tx?.RltdPties?.DbtrAcct?.Id?.IBAN) ?? text(tx?.RltdPties?.DbtrAcct?.Id?.Othr?.Id) ?? null

    // Remittance / reference text from multiple possible locations.
    const remitParts: string[] = []
    const addtl = text(tx?.AddtlTxInf) ?? text(ntry?.AddtlNtryInf)
    if (addtl) remitParts.push(addtl)
    for (const u of toArray(tx?.RmtInf?.Ustrd)) {
      const t = text(u)
      if (t) remitParts.push(t)
    }
    const endToEnd = text(tx?.Refs?.EndToEndId)
    if (endToEnd && endToEnd.toUpperCase() !== "NOTPROVIDED") remitParts.push(endToEnd)
    const instrId = text(tx?.Refs?.InstrId)

    const bankRef =
      text(ntry?.AcctSvcrRef) ?? text(ntry?.NtryRef) ?? instrId ?? `${bookingDate ?? ""}-${amount}-${debtorName ?? ""}`

    credits.push({
      bankRef,
      bookingDate,
      valueDate,
      amount: Math.round(amount * 100) / 100,
      currency: currency || account.currency || "",
      debtorName,
      debtorIban,
      remittanceInfo: remitParts.join(" | "),
    })
  }

  return { account, credits }
}
