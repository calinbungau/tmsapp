import type {
  BankCreditEntry,
  InvoiceMatchCandidate,
  PartnerMatch,
  ReceiptMatchStatus,
} from "./types"

/**
 * Matching helpers for bank receipts. Pure functions so they can be unit-tested
 * and reused; the API route supplies the partner/invoice data from Supabase.
 */

const COMPANY_NOISE = [
  "srl",
  "s r l",
  "sr l",
  "sa",
  "s a",
  "gmbh",
  "ag",
  "kg",
  "spa",
  "s p a",
  "srls",
  "scarl",
  "s c a r l",
  "ltd",
  "limited",
  "bv",
  "nv",
  "sas",
  "sarl",
  "oü",
  "ou",
  "doo",
  "d o o",
  "sp z oo",
  "sp zoo",
  "spzoo",
  "kft",
  "co",
  "company",
  "trasporti",
  "internazionali",
  "transport",
  "transporti",
  "logistic",
  "logistics",
  "spedition",
  "speditions",
]

/** Lowercase, strip diacritics, punctuation and common company suffixes. */
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return ""
  let s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .toLowerCase()
    .replace(/[.,/\\&'"`()\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Remove standalone noise tokens (company forms / generic industry words).
  const tokens = s.split(" ").filter(Boolean)
  const kept = tokens.filter((t) => !COMPANY_NOISE.includes(t))
  s = (kept.length ? kept : tokens).join(" ")
  return s.trim()
}

function normalizeIban(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/** Levenshtein distance (iterative, O(n*m)). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(
        prev[j] + 1, // deletion
        prev[j - 1] + 1, // insertion
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      )
      prevDiag = tmp
    }
  }
  return prev[b.length]
}

/** Similarity 0-1 between two normalized names. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  // Token overlap (Jaccard) blended with edit-distance ratio.
  const ta = new Set(a.split(" ").filter(Boolean))
  const tb = new Set(b.split(" ").filter(Boolean))
  const inter = [...ta].filter((t) => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size || 1
  const jaccard = inter / union

  const maxLen = Math.max(a.length, b.length) || 1
  const editRatio = 1 - levenshtein(a, b) / maxLen

  return Math.max(jaccard, 0.5 * jaccard + 0.5 * editRatio)
}

export interface PartnerRecord {
  id: string
  name: string | null
  bank_iban?: string | null
}

/**
 * Identify the customer (debtor) for a credit. IBAN is the strongest signal,
 * then exact normalized-name, then fuzzy name above a threshold.
 */
export function matchPartner(
  credit: BankCreditEntry,
  partners: PartnerRecord[],
): PartnerMatch | null {
  const creditIban = normalizeIban(credit.debtorIban)
  if (creditIban) {
    const byIban = partners.find((p) => normalizeIban(p.bank_iban) === creditIban && creditIban.length > 0)
    if (byIban) {
      return { partnerId: byIban.id, partnerName: byIban.name ?? "", reason: "iban", score: 1 }
    }
  }

  const target = normalizeCompanyName(credit.debtorName)
  if (!target) return null

  let best: { p: PartnerRecord; score: number } | null = null
  for (const p of partners) {
    const candidate = normalizeCompanyName(p.name)
    if (!candidate) continue
    const score = nameSimilarity(target, candidate)
    if (!best || score > best.score) best = { p, score }
  }

  if (!best) return null
  if (best.score >= 0.92) {
    return { partnerId: best.p.id, partnerName: best.p.name ?? "", reason: "name-exact", score: best.score }
  }
  if (best.score >= 0.62) {
    return { partnerId: best.p.id, partnerName: best.p.name ?? "", reason: "name-fuzzy", score: best.score }
  }
  return null
}

export interface OpenInvoiceRecord {
  id: string
  invoice_number: string | null
  order_id: string | null
  order_reference: string | null
  business_partner_id: string | null
  partner_name: string | null
  currency: string | null
  total_with_tax: number | null
  remaining_amount: number | null
}

/** Normalize a string for substring reference search (digits + letters only). */
function refKey(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function approxEqual(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol
}

/**
 * Build ranked invoice candidates for a credit.
 *
 * Priority:
 *  1. Invoice number found inside the remittance/reference text.
 *  2. Open invoice whose remaining amount equals the credit (same currency).
 *  3. Other open invoices for the matched partner (shown for manual pick).
 */
export function matchInvoices(
  credit: BankCreditEntry,
  partner: PartnerMatch | null,
  openInvoices: OpenInvoiceRecord[],
): InvoiceMatchCandidate[] {
  const remitKey = refKey(credit.remittanceInfo)
  const candidates: InvoiceMatchCandidate[] = []
  const seen = new Set<string>()

  const push = (
    inv: OpenInvoiceRecord,
    reason: InvoiceMatchCandidate["reason"],
    score: number,
  ) => {
    if (seen.has(inv.id)) {
      // Keep the higher score / stronger reason.
      const existing = candidates.find((c) => c.invoiceId === inv.id)
      if (existing && score > existing.score) {
        existing.score = score
        existing.reason = reason
      }
      return
    }
    seen.add(inv.id)
    candidates.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      orderId: inv.order_id,
      orderReference: inv.order_reference,
      partnerName: inv.partner_name,
      currency: inv.currency ?? credit.currency,
      totalWithTax: inv.total_with_tax ?? 0,
      remainingAmount: inv.remaining_amount ?? 0,
      reason,
      score,
    })
  }

  const sameCurrency = (inv: OpenInvoiceRecord) =>
    !inv.currency || !credit.currency || inv.currency.toUpperCase() === credit.currency.toUpperCase()

  // 1) Reference match: invoice number / order reference appears in remittance text.
  if (remitKey.length >= 3) {
    for (const inv of openInvoices) {
      const num = refKey(inv.invoice_number)
      const ord = refKey(inv.order_reference)
      const refHit =
        (num.length >= 3 && remitKey.includes(num)) || (ord.length >= 4 && remitKey.includes(ord))
      if (refHit) {
        const amountHit = approxEqual(inv.remaining_amount ?? 0, credit.amount) && sameCurrency(inv)
        push(inv, "reference", amountHit ? 0.99 : 0.85)
      }
    }
  }

  // 2) Exact open-amount match (same currency).
  for (const inv of openInvoices) {
    if (approxEqual(inv.remaining_amount ?? 0, credit.amount) && sameCurrency(inv)) {
      // Higher score if it also belongs to the matched partner.
      const partnerHit = partner && inv.business_partner_id === partner.partnerId
      push(inv, "amount", partnerHit ? 0.9 : 0.7)
    }
  }

  // 3) Remaining open invoices for the matched partner (manual selection).
  if (partner) {
    for (const inv of openInvoices) {
      if (inv.business_partner_id === partner.partnerId) {
        push(inv, "partner-open", 0.3)
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

/** Decide the overall row status + suggested invoice from candidates. */
export function classifyRow(
  partner: PartnerMatch | null,
  candidates: InvoiceMatchCandidate[],
): { status: ReceiptMatchStatus; suggestedInvoiceId: string | null; note: string } {
  const top = candidates[0]

  if (top && top.score >= 0.95) {
    return {
      status: "matched",
      suggestedInvoiceId: top.invoiceId,
      note:
        top.reason === "reference"
          ? "Potrivire dupa numar factura + suma."
          : "Potrivire dupa suma exacta.",
    }
  }

  if (top && top.score >= 0.6) {
    return {
      status: "review",
      suggestedInvoiceId: top.invoiceId,
      note: partner
        ? `Client: ${partner.partnerName}. Verificati factura sugerata.`
        : "Verificati factura sugerata.",
    }
  }

  if (partner && candidates.length > 0) {
    return {
      status: "review",
      suggestedInvoiceId: candidates[0].invoiceId,
      note: `Client ${partner.partnerName} gasit. Selectati factura corecta.`,
    }
  }

  if (partner) {
    return {
      status: "review",
      suggestedInvoiceId: null,
      note: `Client ${partner.partnerName} gasit, dar nicio factura deschisa. Alegeti manual.`,
    }
  }

  return {
    status: "unmatched",
    suggestedInvoiceId: null,
    note: "Niciun client identificat. Atribuiti manual.",
  }
}
