"use client"

/**
 * Finance Review Queue
 *
 * Lists every trip_expense in `pending_review` and lets the admin approve or
 * reject them, individually or in bulk. The selected expense is shown in a
 * preview pane on the right with the receipt image and key fields. Approving
 * promotes the row through the existing trigger chain to a `posted` cost_entry.
 *
 * Data flow:
 *   GET  /api/admin/finance/expenses/pending     -> { expenses, count }
 *   POST /api/admin/finance/expenses/bulk        { ids, action, reason? }
 *   PATCH /api/admin/tms/trips/[id]/expenses/[expenseId]   <- field edits
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Check,
  X,
  ExternalLink,
  Truck,
  Receipt,
  AlertCircle,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react"
import { CatalogPicker, type CatalogItem } from "@/components/finance/catalog-picker"
import { CostImportDialog } from "@/components/finance/cost-import-dialog"

interface PendingExpense {
  id: string
  trip_id: string
  leg_id: string | null
  category: string
  cost_catalog_id: string | null
  vendor: string | null
  description: string | null
  amount: number
  currency: string
  amount_eur: number | null
  tax_rate: number | null
  tax_amount: number | null
  amount_excl_vat: number | null
  amount_incl_vat: number | null
  amount_eur_excl_vat: number | null
  amount_eur_incl_vat: number | null
  occurred_at: string | null
  country: string | null
  location_label: string | null
  latitude: number | null
  longitude: number | null
  receipt_url: string | null
  quantity: number | null
  unit: string | null
  extracted_data: Record<string, unknown> | null
  /**
   * Stored as a 0-100 percentage (NOT 0-1). Render as `value%` directly —
   * multiplying by 100 produced the "9200%" bug in earlier versions.
   */
  extraction_confidence: number | null
  /** "admin" | "ai" | "driver" — who/what put this in pending_review. */
  source: string | null
  driver_id: string | null
  recorded_by: string | null
  created_at: string
  cost_catalog: CatalogItem | null
  trip: { id: string; reference_number: string; vehicle_id: string | null; driver_id: string | null } | null
  driver: { id: string; name: string | null; email: string | null } | null
}

function formatCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null) return "—"
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function ReviewQueuePage() {
  const { toast } = useToast()
  const [expenses, setExpenses] = useState<PendingExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  // Filter by cost catalog item. `null` means "All cost codes". We filter
  // by cost_catalog_id rather than the legacy free-text `category` enum so
  // the filter dropdown can mirror the picker used elsewhere in the app.
  const [filterItem, setFilterItem] = useState<CatalogItem | null>(null)
  // Import-from-file dialog (supplier Excel/CSV imports)
  const [showImport, setShowImport] = useState(false)

  /**
   * Resolve the calling admin's id from the localStorage session bag the
   * login flow writes to (`admin_session.id`). The Review Queue API requires
   * this to scope results to the caller's trips — without it the server
   * returns an empty list (fail-closed). Read lazily because the page is a
   * client component and `localStorage` is not available during SSR.
   */
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

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const adminId = getAdminId()
      const url = adminId
        ? `/api/admin/finance/expenses/pending?admin_id=${encodeURIComponent(adminId)}`
        : "/api/admin/finance/expenses/pending"
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      setExpenses(json.expenses ?? [])
      // Keep the active selection if it's still in the list, else pick the first row.
      setActiveId((prev) => {
        if (prev && json.expenses?.some((e: PendingExpense) => e.id === prev)) return prev
        return json.expenses?.[0]?.id ?? null
      })
    } catch (e) {
      toast({
        title: "Couldn't load review queue",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const filtered = useMemo(() => {
    if (!filterItem) return expenses
    return expenses.filter((e) => e.cost_catalog_id === filterItem.id)
  }, [expenses, filterItem])

  const active = useMemo(
    () => expenses.find((e) => e.id === activeId) ?? null,
    [expenses, activeId],
  )

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id))

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        filtered.forEach((e) => next.delete(e.id))
      } else {
        filtered.forEach((e) => next.add(e.id))
      }
      return next
    })
  }

  /**
   * Single-row PATCH. We intentionally route through the trip-scoped endpoint
   * (not the bulk one) so admins can correct fields BEFORE approving — bulk
   * approval implies "trust the AI extraction as-is".
   */
  async function patchActive(updates: Partial<PendingExpense>, status?: string) {
    if (!active) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/tms/trips/${active.trip_id}/expenses/${active.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...updates, ...(status ? { status } : {}) }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Update failed")
      toast({
        title: status === "approved"
          ? "Expense approved"
          : status === "rejected"
            ? "Expense rejected"
            : "Saved",
      })
      // Re-fetch — easier than splicing in place since the row may have left the queue.
      fetchPending()
      setRejectReason("")
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function bulkAction(action: "approve" | "reject") {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/finance/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          action,
          reason: action === "reject" ? rejectReason || null : null,
          admin_id: getAdminId(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Bulk update failed")
      toast({
        title: `${json.updated} expense${json.updated === 1 ? "" : "s"} ${action === "approve" ? "approved" : "rejected"}`,
      })
      setSelectedIds(new Set())
      setRejectReason("")
      fetchPending()
    } catch (e) {
      toast({
        title: "Bulk action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      <header className="flex items-center justify-between gap-4 border-b bg-card/40 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/10">
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Review Queue</h1>
            <p className="text-xs text-muted-foreground">
              AI-extracted expenses awaiting your approval before they post to the ledger.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowImport(true)}
            className="gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import from file
          </Button>
          <Badge variant="outline" className="font-mono">
            {expenses.length} pending
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <CostImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        adminId={getAdminId()}
        onImported={fetchPending}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] flex-1 min-h-0 overflow-hidden">
        {/* LEFT: queue list */}
        <aside className="flex flex-col border-r bg-background min-h-0">
          <div className="flex items-center gap-2 p-3 border-b">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleAllVisible}
              aria-label="Select all visible"
              disabled={!filtered.length}
            />
            <CatalogPicker
              value={filterItem?.id ?? null}
              initialItem={filterItem}
              onChange={setFilterItem}
              placeholder="All cost codes"
              className="h-8 w-[260px] text-xs"
            />
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {selectedIds.size > 0 && `${selectedIds.size} selected`}
            </span>
          </div>

          {/* Bulk action bar — only visible when something is selected */}
          {selectedIds.size > 0 && (
            <div className="flex flex-col gap-2 border-b bg-muted/30 p-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => bulkAction("approve")}
                  disabled={busy}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve {selectedIds.size}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => bulkAction("reject")}
                  disabled={busy}
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject {selectedIds.size}
                </Button>
              </div>
              <Input
                placeholder="Reason (optional, used on reject)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                <Check className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">Inbox zero</p>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  No expenses are waiting for review. New AI-extracted receipts will appear here.
                </p>
              </div>
            )}
            <ul className="divide-y">
              {filtered.map((e) => (
                <QueueRow
                  key={e.id}
                  expense={e}
                  active={e.id === activeId}
                  selected={selectedIds.has(e.id)}
                  onSelect={() => setActiveId(e.id)}
                  onToggle={() => toggle(e.id)}
                />
              ))}
            </ul>
          </div>
        </aside>

        {/* RIGHT: preview + edit */}
        <main className="flex flex-col min-h-0 overflow-hidden bg-muted/10">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div className="max-w-sm space-y-2">
                <Receipt className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Select an expense from the queue to review it.
                </p>
              </div>
            </div>
          ) : (
            <ReviewPanel
              key={active.id}
              expense={active}
              busy={busy}
              onPatch={patchActive}
            />
          )}
        </main>
      </div>
    </div>
  )
}

/* ---------------- Queue row ---------------- */

function QueueRow({
  expense: e,
  active,
  selected,
  onSelect,
  onToggle,
}: {
  expense: PendingExpense
  active: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  // High-confidence rows (>=0.85) get a subtle green dot to suggest they
  // are good candidates for bulk approval.
  const hi = (e.extraction_confidence ?? 0) >= 0.85
  const lo = (e.extraction_confidence ?? 0) > 0 && (e.extraction_confidence ?? 0) < 0.6

  return (
    <li
      className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
        active ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onSelect}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        onClick={(ev) => ev.stopPropagation()}
        aria-label={`Select ${e.vendor ?? e.category}`}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">
            {e.vendor || e.cost_catalog?.cost_line || e.category}
          </span>
          {hi && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              title="High extraction confidence"
            />
          )}
          {lo && (
            <AlertCircle
              className="h-3 w-3 text-amber-500"
              aria-label="Low extraction confidence"
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
          <span className="capitalize">
            {e.cost_catalog?.cost_code
              ? e.cost_catalog.cost_code
              : e.category.replace(/_/g, " ")}
          </span>
          <span>·</span>
          <span>{formatDate(e.occurred_at ?? e.created_at)}</span>
          {e.trip && (
            <>
              <span>·</span>
              <Truck className="h-3 w-3" />
              <span className="font-mono truncate">{e.trip.reference_number}</span>
            </>
          )}
          {/* Provenance hint so reviewers can see at a glance whether the
              row came from the AI ingest, from a driver upload, or from
              an admin manual entry. */}
          <span>·</span>
          <span className="capitalize">
            {e.source === "ai"
              ? "AI"
              : e.source === "driver" || (!e.source && e.driver_id)
                ? `driver${e.driver?.name ? ` · ${e.driver.name}` : ""}`
                : "admin"}
          </span>
        </div>
        <div className="flex items-baseline gap-1 mt-1 tabular-nums">
          <span className="text-sm font-semibold">{formatCurrency(e.amount, e.currency)}</span>
          {e.currency !== "EUR" && e.amount_eur != null && (
            <span className="text-[11px] text-muted-foreground">
              {"\u2248 "}
              {formatCurrency(e.amount_eur, "EUR")}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/* ---------------- Review panel ---------------- */

function ReviewPanel({
  expense,
  busy,
  onPatch,
}: {
  expense: PendingExpense
  busy: boolean
  onPatch: (updates: Partial<PendingExpense>, status?: string) => void
}) {
  // Local form state so users can correct OCR mistakes before approving.
  // Numeric fields are kept as strings so empty inputs don't coerce to 0
  // and so we can detect "user cleared the field" vs "field unchanged".
  const initial = {
    cost_catalog_id: expense.cost_catalog_id ?? null,
    cost_catalog_item: expense.cost_catalog ?? null,
    vendor: expense.vendor ?? "",
    category: expense.category,
    amount: expense.amount != null ? String(expense.amount) : "",
    amount_excl_vat: expense.amount_excl_vat != null ? String(expense.amount_excl_vat) : "",
    tax_rate: expense.tax_rate != null ? String(expense.tax_rate) : "",
    tax_amount: expense.tax_amount != null ? String(expense.tax_amount) : "",
    currency: expense.currency ?? "EUR",
    occurred_at: expense.occurred_at?.slice(0, 10) ?? "",
    description: expense.description ?? "",
    country: expense.country ?? "",
    location_label: expense.location_label ?? "",
    quantity: expense.quantity != null ? String(expense.quantity) : "",
    unit: expense.unit ?? "",
  }
  const [form, setForm] = useState(initial)

  // Reset when the active expense changes.
  useEffect(() => {
    setForm({
      cost_catalog_id: expense.cost_catalog_id ?? null,
      cost_catalog_item: expense.cost_catalog ?? null,
      vendor: expense.vendor ?? "",
      category: expense.category,
      amount: expense.amount != null ? String(expense.amount) : "",
      amount_excl_vat: expense.amount_excl_vat != null ? String(expense.amount_excl_vat) : "",
      tax_rate: expense.tax_rate != null ? String(expense.tax_rate) : "",
      tax_amount: expense.tax_amount != null ? String(expense.tax_amount) : "",
      currency: expense.currency ?? "EUR",
      occurred_at: expense.occurred_at?.slice(0, 10) ?? "",
      description: expense.description ?? "",
      country: expense.country ?? "",
      location_label: expense.location_label ?? "",
      quantity: expense.quantity != null ? String(expense.quantity) : "",
      unit: expense.unit ?? "",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense.id])

  /**
   * VAT auto-derivation, mirrored from the trip Expenses dialog so users
   * see consistent behavior. The DB BEFORE-trigger does the same math
   * server-side, but doing it here gives instant feedback while editing.
   */
  function setVatField(patch: Partial<typeof form>) {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      const gross = Number(next.amount)
      const net = Number(next.amount_excl_vat)
      const rate = Number(next.tax_rate)
      const explicitVat = Number(next.tax_amount)

      if (
        !isNaN(gross) &&
        !isNaN(rate) &&
        rate > 0 &&
        (patch.amount !== undefined || patch.tax_rate !== undefined)
      ) {
        const derivedNet = gross / (1 + rate / 100)
        next.amount_excl_vat = derivedNet.toFixed(2)
        next.tax_amount = (gross - derivedNet).toFixed(2)
      } else if (
        !isNaN(net) &&
        !isNaN(rate) &&
        rate > 0 &&
        patch.amount_excl_vat !== undefined
      ) {
        const derivedGross = net * (1 + rate / 100)
        next.amount = derivedGross.toFixed(2)
        next.tax_amount = (derivedGross - net).toFixed(2)
      } else if (
        !isNaN(gross) &&
        !isNaN(explicitVat) &&
        patch.tax_amount !== undefined
      ) {
        const derivedNet = gross - explicitVat
        next.amount_excl_vat = derivedNet.toFixed(2)
        if (derivedNet > 0)
          next.tax_rate = ((explicitVat / derivedNet) * 100).toFixed(2)
      }
      return next
    })
  }

  const dirty =
    form.cost_catalog_id !== (expense.cost_catalog_id ?? null) ||
    form.vendor !== (expense.vendor ?? "") ||
    form.category !== expense.category ||
    form.amount !== (expense.amount != null ? String(expense.amount) : "") ||
    form.amount_excl_vat !== (expense.amount_excl_vat != null ? String(expense.amount_excl_vat) : "") ||
    form.tax_rate !== (expense.tax_rate != null ? String(expense.tax_rate) : "") ||
    form.tax_amount !== (expense.tax_amount != null ? String(expense.tax_amount) : "") ||
    form.currency !== (expense.currency ?? "EUR") ||
    form.occurred_at !== (expense.occurred_at?.slice(0, 10) ?? "") ||
    form.description !== (expense.description ?? "") ||
    form.country !== (expense.country ?? "") ||
    form.location_label !== (expense.location_label ?? "") ||
    form.quantity !== (expense.quantity != null ? String(expense.quantity) : "") ||
    form.unit !== (expense.unit ?? "")

  function buildUpdates() {
    // Only include fields the user actually changed. Numeric fields convert
    // empty → null (clearing) and non-empty → number; throw on garbage so
    // we don't ship NaN to the database.
    const u: Record<string, unknown> = {}
    const numOrNull = (s: string, label: string) => {
      if (s === "") return null
      const n = Number(s)
      if (!Number.isFinite(n)) throw new Error(`${label} must be a number`)
      return n
    }

    if (form.cost_catalog_id !== (expense.cost_catalog_id ?? null))
      u.cost_catalog_id = form.cost_catalog_id
    if (form.vendor !== (expense.vendor ?? "")) u.vendor = form.vendor || null
    if (form.category !== expense.category) u.category = form.category
    if (form.amount !== (expense.amount != null ? String(expense.amount) : "")) {
      u.amount = numOrNull(form.amount, "Amount")
    }
    if (
      form.amount_excl_vat !==
      (expense.amount_excl_vat != null ? String(expense.amount_excl_vat) : "")
    )
      u.amount_excl_vat = numOrNull(form.amount_excl_vat, "Net (excl. VAT)")
    if (form.tax_rate !== (expense.tax_rate != null ? String(expense.tax_rate) : ""))
      u.tax_rate = numOrNull(form.tax_rate, "VAT %")
    if (form.tax_amount !== (expense.tax_amount != null ? String(expense.tax_amount) : ""))
      u.tax_amount = numOrNull(form.tax_amount, "VAT amount")
    if (form.currency !== (expense.currency ?? "EUR")) u.currency = form.currency
    if (form.occurred_at !== (expense.occurred_at?.slice(0, 10) ?? "")) {
      u.occurred_at = form.occurred_at ? new Date(form.occurred_at).toISOString() : null
    }
    if (form.description !== (expense.description ?? ""))
      u.description = form.description || null
    if (form.country !== (expense.country ?? ""))
      u.country = form.country || null
    if (form.location_label !== (expense.location_label ?? ""))
      u.location_label = form.location_label || null
    if (form.quantity !== (expense.quantity != null ? String(expense.quantity) : ""))
      u.quantity = numOrNull(form.quantity, "Quantity")
    if (form.unit !== (expense.unit ?? ""))
      u.unit = form.unit || null
    return u as Partial<PendingExpense>
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-0 flex-1 min-h-0">
      {/* Receipt preview */}
      <div className="flex items-center justify-center bg-muted/30 p-6 overflow-auto min-h-[280px]">
        {expense.receipt_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={expense.receipt_url}
            alt={`Receipt from ${expense.vendor ?? expense.category}`}
            className="max-w-full max-h-[80vh] rounded shadow-md ring-1 ring-border bg-background"
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No receipt attached</p>
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="flex flex-col border-l bg-background min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">
              {expense.cost_catalog?.cost_code
                ? `${expense.cost_catalog.cost_code} · ${expense.cost_catalog.cost_line}`
                : "Pending review"}
            </span>
          </div>
          {expense.trip && (
            <Link
              href={`/admin/tms/trips/${expense.trip.id}/edit`}
              target="_blank"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              {expense.trip.reference_number}
            </Link>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {expense.extraction_confidence != null && (
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 p-3">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium">AI extraction</p>
                  <p className="text-[11px] text-muted-foreground">
                    Confidence {Math.round(expense.extraction_confidence)}%
                    {expense.extraction_confidence < 60 && " — please double-check the values below"}
                  </p>
                </div>
                <span
                  className={`tabular-nums text-xs font-medium ${
                    expense.extraction_confidence >= 85
                      ? "text-emerald-500"
                      : expense.extraction_confidence >= 60
                        ? "text-amber-500"
                        : "text-destructive"
                  }`}
                >
                  {Math.round(expense.extraction_confidence)}%
                </span>
              </CardContent>
            </Card>
          )}

          {/* Cost catalog (drives both cost_catalog_id AND category nature). */}
          <div>
            <Label className="text-xs">Cost code</Label>
            <CatalogPicker
              value={form.cost_catalog_id}
              initialItem={form.cost_catalog_item}
              className="h-9 text-sm"
              placeholder="Pick a cost code..."
              onChange={(item) =>
                setForm((p) => ({
                  ...p,
                  cost_catalog_id: item?.id ?? null,
                  cost_catalog_item: item,
                  // Mirror the catalog's nature back into the legacy `category`
                  // column so the trip Expenses tab and old reports keep working.
                  category: item?.nature ?? p.category,
                  // Adopt the catalog's default unit if the receipt didn't have one.
                  unit: p.unit || item?.unit || "",
                }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Vendor</Label>
              <Input
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="e.g. OMV Petrom"
              />
            </div>

            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                placeholder="RO, DE, FR..."
                maxLength={3}
                className="uppercase"
              />
            </div>

            {/* Gross / Currency */}
            <div>
              <Label className="text-xs">Amount (gross)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setVatField({ amount: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["EUR", "RON", "USD", "GBP", "PLN", "HUF", "CZK", "BGN"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* VAT trio. Editing any one auto-derives the other two so the
                user can match the receipt without doing the math. */}
            <div>
              <Label className="text-xs">VAT %</Label>
              <Input
                type="number"
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => setVatField({ tax_rate: e.target.value })}
                placeholder="e.g. 19"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label className="text-xs">VAT amount</Label>
              <Input
                type="number"
                step="0.01"
                value={form.tax_amount}
                onChange={(e) => setVatField({ tax_amount: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Net (excl. VAT)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount_excl_vat}
                onChange={(e) => setVatField({ amount_excl_vat: e.target.value })}
                inputMode="decimal"
              />
            </div>

            {/* Quantity / unit / payment method */}
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                step="0.001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="21.80"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="L, h, km, pcs..."
              />
            </div>

            <div className="col-span-2">
              <Label className="text-xs">Location</Label>
              <Input
                value={form.location_label}
                onChange={(e) => setForm({ ...form, location_label: e.target.value })}
                placeholder="Station / address"
              />
            </div>

            <div className="col-span-2">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Optional notes"
              />
            </div>
          </div>

          {/* Display-only computed/AI metadata */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-2 border-t">
            <dt className="text-muted-foreground">Submitted</dt>
            <dd className="tabular-nums">{formatDate(expense.created_at)}</dd>
            {form.currency !== "EUR" && expense.amount_eur != null && (
              <>
                <dt className="text-muted-foreground">In EUR</dt>
                <dd className="tabular-nums">{formatCurrency(expense.amount_eur, "EUR")}</dd>
              </>
            )}
          </dl>
        </div>

        {/* Sticky action bar */}
        <div className="flex flex-col gap-2 border-t p-4 bg-card/30">
          {dirty && (
            <Button
              variant="outline"
              onClick={() => onPatch(buildUpdates())}
              disabled={busy}
              className="w-full"
            >
              Save changes
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => onPatch(buildUpdates(), "rejected")}
              disabled={busy}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              className="flex-1"
              onClick={() => onPatch(buildUpdates(), "approved")}
              disabled={busy}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve {dirty ? "with edits" : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
