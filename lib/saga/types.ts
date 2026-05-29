/**
 * Saga exchange contract (SagaFactura).
 * Mirrors the JSON schema agreed with the accountant's Saga agent.
 */

export type SagaTip = "RON" | "VALUTA"

export interface SagaLinie {
  descriere: string // max 60
  um?: string // default "BUC"
  cantitate: number // 3 decimals
  pret: number // unit price w/o VAT, 4 decimals
  valoare: number // cantitate * pret, w/o VAT, 2 decimals
  procTVA: 0 | 5 | 9 | 19
  tva: number // valoare * procTVA / 100, 2 decimals
  cont?: string // default "704.1"
}

export interface SagaFactura {
  tip: SagaTip
  cod: string // Saga client code, max 8
  clientNume: string // max 64
  data: string // YYYY-MM-DD
  scadenta?: string // YYYY-MM-DD, default = data
  refTMS: string // internal TMS reference, max 150
  contClient: string // e.g. 4111.00002, max 20
  tipO?: string // default "007"
  moneda?: string // required when tip = VALUTA
  cursRef?: number // BNR rate, required when tip = VALUTA
  linii: SagaLinie[]
}

/** Envelope returned to the agent when pulling pending invoices. */
export interface SagaPendingInvoice {
  /** TMS internal invoice id — echoed back on validation. */
  tmsInvoiceId: string
  /** TMS order reference for human context. */
  orderReference: string | null
  factura: SagaFactura
}

/** Payload posted back by the agent once validated in Saga. */
export interface SagaValidatedPayload {
  tmsInvoiceId: string
  /** Final invoice number assigned in Saga (series + number). */
  sagaNumber: string
  /** Optionally the full validated SagaFactura (with any edits the accountant made). */
  factura?: SagaFactura
  /** Saga client code to remember for this customer. */
  cod?: string
  contClient?: string
  validatedAt?: string
}
