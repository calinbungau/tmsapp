"use client"

/**
 * Finance > Invoices
 *
 * Lists invoices (default: outgoing / sales invoices customers pay us) with
 * status + currency filters and free-text search. Amounts are shown in each
 * invoice's own currency — no RON conversion. The "Import Incasari" button
 * opens the CAMT.053 bank-statement import flow.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, RefreshCw, Search, ExternalLink, FileText } from "lucide-react"
import { ReceiptImportDialog } from "@/components/finance/receipt-import-dialog"

interface InvoiceRow {
  id: string
  invoiceNumber: string | null
  direction: string
  partnerName: string | null
  orderId: string | null
  orderReference: string | null
  amount: number
  totalWithTax: number
  paidAmount: number
  remainingAmount: number
  currency: string
  status: string
  issueDate: string | null
  dueDate: string | null
  paidDate: string | null
  accountingSystem: string | null
  accountingSyncStatus: string | null
}

function getAdminId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem("admin_session")
    if (!raw) return null
    const s = JSON.parse(raw) as { id?: string }
    return s?.id ?? null
  } catch {
    return null
  }
}

function fmtMoney(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—"
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partially_paid: "bg-amber-100 text-amber-800 border-amber-200",
  issued: "bg-sky-100 text-sky-800 border-sky-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
  draft: "bg-muted text-muted-foreground border-border",
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partially_paid: "Partial",
  issued: "Issued",
  sent: "Sent",
  overdue: "Overdue",
  draft: "Draft",
}

export default function InvoicesPage() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState<string>("outgoing")
  const [status, setStatus] = useState<string>("all")
  const [currency, setCurrency] = useState<string>("all")
  const [q, setQ] = useState("")
  const [showImport, setShowImport] = useState(false)

  const fetchInvoices = useCallback(async () => {
    const adminId = getAdminId()
    if (!adminId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ admin_id: adminId })
      if (direction !== "all") params.set("direction", direction)
      if (status !== "all") params.set("status", status)
      if (q.trim()) params.set("q", q.trim())
      const res = await fetch(`/api/admin/finance/invoices?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load invoices")
      setInvoices(json.invoices ?? [])
    } catch (e) {
      toast({
        title: "Could not load invoices",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [direction, status, q, toast])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const currencies = useMemo(() => {
    const set = new Set<string>()
    invoices.forEach((i) => i.currency && set.add(i.currency))
    return Array.from(set).sort()
  }, [invoices])

  const visible = useMemo(
    () => (currency === "all" ? invoices : invoices.filter((i) => i.currency === currency)),
    [invoices, currency],
  )

  // ── Pagination (client-side) ──
  const PAGE_SIZE = 25
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  // Keep the current page in range whenever filters shrink the result set.
  useEffect(() => {
    setPage(1)
  }, [direction, status, currency, q])
  const paged = useMemo(
    () => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visible, page],
  )

  // Totals per currency for the filtered set (no cross-currency summing).
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, { total: number; remaining: number }>()
    for (const inv of visible) {
      const cur = map.get(inv.currency) ?? { total: 0, remaining: 0 }
      cur.total += inv.totalWithTax || 0
      cur.remaining += inv.remainingAmount || 0
      map.set(inv.currency, cur)
    }
    return Array.from(map.entries())
  }, [visible])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Invoices</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading…" : `${visible.length} invoice${visible.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInvoices} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowImport(true)}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Import Payments
          </Button>
        </div>
      </header>

      {/* Totals per currency */}
      {totalsByCurrency.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {totalsByCurrency.map(([cur, t]) => (
            <Card key={cur} className="min-w-[180px] flex-1">
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {cur} total
                </span>
                <span className="text-lg font-semibold text-foreground">{fmtMoney(t.total, cur)}</span>
                <span className="text-xs text-muted-foreground">
                  Outstanding: {fmtMoney(t.remaining, cur)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
        <div className="relative flex-1 md:max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice number…"
            className="pl-9"
            aria-label="Search invoices"
          />
        </div>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-full md:w-44" aria-label="Direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outgoing">Outgoing (sales)</SelectItem>
            <SelectItem value="incoming">Incoming (purchases)</SelectItem>
            <SelectItem value="all">All directions</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full md:w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partially_paid">Partially paid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        {currencies.length > 1 && (
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-full md:w-32" aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All currencies</SelectItem>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No invoices match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Issued</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{inv.invoiceNumber ?? "—"}</div>
                        {inv.orderReference && (
                          <div className="text-xs text-muted-foreground">{inv.orderReference}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">{inv.partnerName ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.issueDate)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {fmtMoney(inv.totalWithTax, inv.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            inv.remainingAmount > 0.01 ? "font-medium text-foreground" : "text-muted-foreground"
                          }
                        >
                          {fmtMoney(inv.remainingAmount, inv.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[inv.status] ?? "bg-muted text-muted-foreground"}
                        >
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.orderId && (
                          <Link
                            href={`/admin/tms/orders/${inv.orderId}`}
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            aria-label="Open order"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && visible.length > PAGE_SIZE && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visible.length)} of{" "}
            {visible.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ReceiptImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        adminId={getAdminId()}
        onImported={fetchInvoices}
      />
    </div>
  )
}
