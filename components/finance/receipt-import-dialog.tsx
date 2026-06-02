"use client"

/**
 * Import Payments — bank receipt import from a bank statement.
 *
 * Steps:
 *   1. Provider — operator picks the bank provider (e.g. BT GO).
 *   2. Upload — operator picks the statement file (any file name).
 *   3. Preview — only incoming credits (CRDT) are shown. Each row displays the
 *      matched customer + suggested invoice; the operator confirms, picks a
 *      different open invoice, or skips the row. Nothing is written yet.
 *   4. Done — summary of how many payments were recorded.
 *
 * The actual matching happens server-side (/receipts/preview); recording the
 * confirmed allocations happens in /receipts/commit.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  Upload,
  FileText,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Ban,
  Landmark,
} from "lucide-react"
import type {
  ReceiptPreviewResult,
  ReceiptPreviewRow,
  ReceiptCommitItem,
} from "@/lib/bank-imports/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  adminId: string | null
  onImported?: () => void
}

interface OpenInvoiceOption {
  id: string
  invoiceNumber: string | null
  partnerName: string | null
  currency: string
  remainingAmount: number
  orderReference: string | null
}

const SKIP = "__skip__"

// Supported bank providers. Each maps to the statement format we parse on the
// server (currently CAMT.053). More providers can be added here over time.
const BANK_PROVIDERS = [
  { id: "bt_go", label: "BT GO", description: "Banca Transilvania — CAMT.053 statement", format: "camt053" },
] as const

type ProviderId = (typeof BANK_PROVIDERS)[number]["id"]

function fmtMoney(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—"
  try {
    return new Intl.NumberFormat("ro-RO", { style: "currency", currency, minimumFractionDigits: 2 }).format(
      amount,
    )
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function StatusBadge({ status }: { status: ReceiptPreviewRow["status"] }) {
  const map: Record<ReceiptPreviewRow["status"], { label: string; cls: string; icon: React.ElementType }> = {
    matched: { label: "Matched", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
    review: { label: "Review", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
    unmatched: { label: "Unmatched", cls: "bg-red-100 text-red-800 border-red-200", icon: HelpCircle },
    duplicate: { label: "Duplicate", cls: "bg-muted text-muted-foreground border-border", icon: Ban },
  }
  const { label, cls, icon: Icon } = map[status]
  return (
    <Badge variant="outline" className={cls}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  )
}

export function ReceiptImportDialog({ open, onOpenChange, adminId, onImported }: Props) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"provider" | "upload" | "preview" | "done">("provider")
  const [provider, setProvider] = useState<ProviderId>("bt_go")
  const [file, setFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<ReceiptPreviewResult | null>(null)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoiceOption[]>([])
  // Per-row chosen invoice id (or SKIP). Seeded from suggestedInvoiceId.
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ recorded: number; skipped: number; errors: string[] } | null>(null)

  const selectedProvider = BANK_PROVIDERS.find((p) => p.id === provider) ?? BANK_PROVIDERS[0]

  // Reset on open.
  useEffect(() => {
    if (!open) return
    setStep("provider")
    setProvider("bt_go")
    setFile(null)
    setPreview(null)
    setSelections({})
    setResult(null)
  }, [open])

  // Load open outgoing invoices so unmatched rows can be matched manually.
  useEffect(() => {
    if (!open || !adminId) return
    fetch(`/api/admin/finance/invoices?admin_id=${adminId}&direction=outgoing`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list: OpenInvoiceOption[] = (j.invoices ?? [])
          .filter((i: any) => (i.remainingAmount ?? 0) > 0.01)
          .map((i: any) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            partnerName: i.partnerName,
            currency: i.currency,
            remainingAmount: i.remainingAmount,
            orderReference: i.orderReference,
          }))
        setOpenInvoices(list)
      })
      .catch(() => setOpenInvoices([]))
  }, [open, adminId])

  async function runPreview() {
    if (!file || !adminId) return
    setPreviewing(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("admin_id", adminId)
      fd.append("provider", provider)
      const res = await fetch("/api/admin/finance/receipts/preview", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Preview failed")
      setPreview(json)
      // Seed selections with the system's suggestions.
      const seed: Record<string, string> = {}
      for (const row of json.rows as ReceiptPreviewRow[]) {
        seed[row.id] = row.status === "duplicate" ? SKIP : row.suggestedInvoiceId ?? SKIP
      }
      setSelections(seed)
      setStep("preview")
    } catch (e) {
      toast({
        title: "Could not read the file",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setPreviewing(false)
    }
  }

  // Build the candidate option list for a row: server candidates first, then
  // any other open invoice (for manual matching), de-duplicated.
  function optionsForRow(row: ReceiptPreviewRow): OpenInvoiceOption[] {
    const seen = new Set<string>()
    const out: OpenInvoiceOption[] = []
    for (const c of row.candidates) {
      if (seen.has(c.invoiceId)) continue
      seen.add(c.invoiceId)
      out.push({
        id: c.invoiceId,
        invoiceNumber: c.invoiceNumber,
        partnerName: c.partnerName,
        currency: c.currency,
        remainingAmount: c.remainingAmount,
        orderReference: c.orderReference,
      })
    }
    for (const inv of openInvoices) {
      if (seen.has(inv.id)) continue
      seen.add(inv.id)
      out.push(inv)
    }
    return out
  }

  const confirmableCount = useMemo(() => {
    if (!preview) return 0
    return preview.rows.filter((r) => selections[r.id] && selections[r.id] !== SKIP).length
  }, [preview, selections])

  async function commit() {
    if (!preview || !adminId) return
    const items: ReceiptCommitItem[] = []
    for (const row of preview.rows) {
      const invoiceId = selections[row.id]
      if (!invoiceId || invoiceId === SKIP) continue
      items.push({
        bankRef: row.credit.bankRef,
        invoiceId,
        amount: row.credit.amount,
        currency: row.credit.currency,
        paymentDate: row.credit.bookingDate ?? row.credit.valueDate,
        debtorName: row.credit.debtorName,
        remittanceInfo: row.credit.remittanceInfo,
      })
    }
    if (items.length === 0) {
      toast({ title: "Nothing to record", description: "Select at least one invoice." })
      return
    }
    setCommitting(true)
    try {
      const res = await fetch("/api/admin/finance/receipts/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_id: adminId, items }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Commit failed")
      setResult(json)
      setStep("done")
      onImported?.()
    } catch (e) {
      toast({
        title: "Recording failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl sm:max-w-6xl max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" aria-hidden="true" />
            Import Payments
          </DialogTitle>
          <DialogDescription>
            Choose your bank provider and upload its statement. The system matches incoming payments to
            customers and invoices, and you confirm before anything is recorded.
          </DialogDescription>
        </DialogHeader>

        {/* Step: Provider */}
        {step === "provider" && (
          <div className="flex flex-col gap-3 px-6 py-8">
            <label className="text-sm font-medium text-foreground">Bank provider</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
              <SelectTrigger aria-label="Bank provider">
                <SelectValue placeholder="Select a bank provider" />
              </SelectTrigger>
              <SelectContent>
                {BANK_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{selectedProvider.description}</p>
          </div>
        )}

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="flex flex-col gap-4 px-6 py-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Landmark className="h-4 w-4" aria-hidden="true" />
              <span>
                Provider: <span className="font-medium text-foreground">{selectedProvider.label}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">
                  {file ? file.name : "Select the statement file"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {file ? "Press Analyze to continue" : "Click to choose a file (any file name)"}
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && preview && (
          <div className="flex flex-col overflow-hidden">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-6 py-3 text-sm">
              {preview.account.iban && (
                <span className="text-muted-foreground">
                  Account: <span className="font-medium text-foreground">{preview.account.iban}</span>
                  {preview.account.currency ? ` (${preview.account.currency})` : ""}
                </span>
              )}
              <span className="ml-auto flex flex-wrap gap-3 text-xs">
                <span className="text-emerald-700">{preview.summary.matched} matched</span>
                <span className="text-amber-700">{preview.summary.review} to review</span>
                <span className="text-red-700">{preview.summary.unmatched} unmatched</span>
                <span className="text-muted-foreground">{preview.summary.duplicate} duplicate</span>
              </span>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Payer</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const opts = optionsForRow(row)
                    const isDuplicate = row.status === "duplicate"
                    return (
                      <tr key={row.id} className="border-b border-border align-top last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {row.credit.debtorName ?? "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.credit.bookingDate ?? ""}
                            {row.credit.debtorIban ? ` · ${row.credit.debtorIban}` : ""}
                          </div>
                          {row.credit.remittanceInfo && (
                            <div className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                              {row.credit.remittanceInfo}
                            </div>
                          )}
                          {row.partner && (
                            <div className="mt-1 text-xs text-foreground">
                              Customer: <span className="font-medium">{row.partner.partnerName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {fmtMoney(row.credit.amount, row.credit.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                          <div className="mt-1 max-w-[200px] text-xs text-muted-foreground">{row.note}</div>
                        </td>
                        <td className="px-4 py-3">
                          {isDuplicate ? (
                            <span className="text-xs text-muted-foreground">Ignored</span>
                          ) : (
                            <Select
                              value={selections[row.id] ?? SKIP}
                              onValueChange={(v) => setSelections((s) => ({ ...s, [row.id]: v }))}
                            >
                              <SelectTrigger className="w-[260px]" aria-label="Choose invoice">
                                <SelectValue placeholder="Choose invoice" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SKIP}>Do not record (skip)</SelectItem>
                                {opts.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    {(o.invoiceNumber ?? "no number") +
                                      " · " +
                                      fmtMoney(o.remainingAmount, o.currency) +
                                      (o.partnerName ? ` · ${o.partnerName}` : "")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && result && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-foreground">Payments recorded</h3>
            <p className="text-sm text-muted-foreground">
              {result.recorded} payment{result.recorded === 1 ? "" : "s"} recorded
              {result.skipped ? `, ${result.skipped} skipped` : ""}.
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2 w-full rounded-md border border-red-200 bg-red-50 p-3 text-left text-xs text-red-800">
                <p className="mb-1 font-medium">Errors:</p>
                <ul className="list-inside list-disc">
                  {result.errors.slice(0, 8).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-border px-6 py-4">
          {step === "provider" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("upload")}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={() => setStep("provider")} disabled={previewing}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button onClick={runPreview} disabled={!file || previewing}>
                {previewing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Analyze
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")} disabled={committing}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button onClick={commit} disabled={committing || confirmableCount === 0}>
                {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Record {confirmableCount} payment{confirmableCount === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
