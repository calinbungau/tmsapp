// Types for bank statement (CAMT.053) receipt imports ("Incasari").

/** Account-level metadata parsed from a CAMT.053 statement. */
export interface BankStatementAccount {
  iban: string | null
  currency: string | null
  ownerName: string | null
}

/** A single incoming credit (receipt) parsed from the statement. */
export interface BankCreditEntry {
  /** Stable bank reference used for de-duplication (AcctSvcrRef / NtryRef / InstrId). */
  bankRef: string
  /** Booking date (YYYY-MM-DD). */
  bookingDate: string | null
  /** Value date (YYYY-MM-DD). */
  valueDate: string | null
  /** Credit amount (always positive). */
  amount: number
  /** ISO currency code of the amount, e.g. "EUR", "RON". */
  currency: string
  /** Payer (debtor) name as printed on the statement, e.g. "CML Transport GmbH". */
  debtorName: string | null
  /** Payer IBAN, when present. */
  debtorIban: string | null
  /** Free-text remittance / reference info (AddtlTxInf + RmtInf/Ustrd + EndToEndId). */
  remittanceInfo: string
}

/** A candidate invoice match for a credit, surfaced for operator approval. */
export interface InvoiceMatchCandidate {
  invoiceId: string
  invoiceNumber: string | null
  orderId: string | null
  orderReference: string | null
  partnerName: string | null
  currency: string
  totalWithTax: number
  remainingAmount: number
  /** How this candidate was found. */
  reason: "reference" | "amount" | "only-open" | "partner-open"
  /** 0-1 confidence used for ranking and auto-selection. */
  score: number
}

/** A matched customer (business partner) for a credit. */
export interface PartnerMatch {
  partnerId: string
  partnerName: string
  /** How the partner was identified. */
  reason: "iban" | "name-exact" | "name-fuzzy"
  score: number
}

export type ReceiptMatchStatus =
  | "matched" // confident customer + single confident invoice
  | "review" // customer and/or invoice found but needs confirmation
  | "unmatched" // no confident customer/invoice -> manual assignment
  | "duplicate" // already recorded previously

/** A fully-analyzed receipt row presented in the import preview. */
export interface ReceiptPreviewRow {
  /** Index within the parsed file (stable id for the UI). */
  id: string
  credit: BankCreditEntry
  status: ReceiptMatchStatus
  partner: PartnerMatch | null
  /** Ranked invoice candidates (best first). */
  candidates: InvoiceMatchCandidate[]
  /** The invoice the system pre-selected (best candidate) or null. */
  suggestedInvoiceId: string | null
  /** Human-readable explanation of the match outcome. */
  note: string
}

export interface ReceiptPreviewResult {
  account: BankStatementAccount
  rows: ReceiptPreviewRow[]
  summary: {
    totalCredits: number
    matched: number
    review: number
    unmatched: number
    duplicate: number
  }
}

/** One confirmed allocation the operator approved for recording. */
export interface ReceiptCommitItem {
  bankRef: string
  invoiceId: string
  amount: number
  currency: string
  paymentDate: string | null
  debtorName: string | null
  remittanceInfo: string
}
