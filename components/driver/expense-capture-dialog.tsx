"use client"

/**
 * Driver-side expense capture dialog.
 *
 * Flow:
 *  1. Driver picks "Scan receipt" or "Enter manually".
 *  2. "Scan receipt" uploads to /api/tms/extract-receipt (the same endpoint
 *     admins use); the AI returns category, amount, vendor, occurred_at,
 *     country, vat, geo, etc.
 *  3. The form then pre-fills with those values and the driver MUST review
 *     and confirm before pressing Submit. We surface confidence + warnings
 *     prominently so the driver knows what to double-check.
 *  4. Submit POSTs to /api/driver/trips/:id/expenses, which forces
 *     source='driver' and status='pending_review' — i.e. the row enters the
 *     finance Review Queue rather than going straight to the ledger.
 */

import { useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Camera,
  Loader2,
  Receipt,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"

const CATEGORIES = [
  "fuel",
  "toll",
  "parking",
  "ferry",
  "ad_blue",
  "wash",
  "repair",
  "driver_per_diem",
  "customs",
  "insurance",
  "penalty",
  "other",
] as const

type Category = (typeof CATEGORIES)[number]

const CURRENCIES = ["EUR", "RON", "HUF", "PLN", "GBP", "CHF", "USD", "CZK"] as const

interface ExpenseDraft {
  category: Category
  amount: string
  currency: string
  vendor: string
  occurred_at: string // datetime-local
  country: string
  description: string
  vat_amount: string
  quantity: string
  unit: string
  location_label: string
  receipt_url: string | null
  extracted_data: unknown | null
  extraction_confidence: number | null
  warnings: string[]
}

const emptyDraft: ExpenseDraft = {
  category: "fuel",
  amount: "",
  currency: "EUR",
  vendor: "",
  occurred_at: new Date().toISOString().slice(0, 16),
  country: "",
  description: "",
  vat_amount: "",
  quantity: "",
  unit: "",
  location_label: "",
  receipt_url: null,
  extracted_data: null,
  extraction_confidence: null,
  warnings: [],
}

export function ExpenseCaptureDialog({
  open,
  onOpenChange,
  tripId,
  driverId,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  tripId: string
  driverId: string
  /** Called after a successful submit so the parent can refresh badges/lists. */
  onSubmitted?: () => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  // mode === "choose": initial scan-or-manual picker
  // mode === "form":  full form (either pre-filled by AI or blank)
  const [mode, setMode] = useState<"choose" | "form">("choose")
  const [scanning, setScanning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft)

  function reset() {
    setMode("choose")
    setScanning(false)
    setSubmitting(false)
    setDraft(emptyDraft)
  }

  function close(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleScanFile(file: File) {
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("tripId", tripId)
      const res = await fetch("/api/tms/extract-receipt", {
        method: "POST",
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Extraction failed")
      }
      const ex = json.extraction as {
        category: Category
        amount: number | null
        currency: string | null
        vendor: string | null
        occurred_at: string | null
        country: string | null
        description: string | null
        vat_amount: number | null
        quantity: number | null
        unit: string | null
        city: string | null
        address: string | null
        confidence: number
        warnings: string[]
      }

      // Hydrate form. We deliberately keep "" instead of null/undefined so
      // controlled inputs stay controlled.
      setDraft({
        category: (CATEGORIES as readonly string[]).includes(ex.category)
          ? ex.category
          : "other",
        amount: ex.amount != null ? String(ex.amount) : "",
        currency: ex.currency || "EUR",
        vendor: ex.vendor || "",
        occurred_at: ex.occurred_at
          ? ex.occurred_at.slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        country: ex.country || "",
        description: ex.description || "",
        vat_amount: ex.vat_amount != null ? String(ex.vat_amount) : "",
        quantity: ex.quantity != null ? String(ex.quantity) : "",
        unit: ex.unit || "",
        location_label: [ex.address, ex.city, ex.country].filter(Boolean).join(", "),
        receipt_url: json.receipt_url ?? null,
        extracted_data: ex,
        extraction_confidence: ex.confidence ?? null,
        warnings: ex.warnings ?? [],
      })
      setMode("form")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not read receipt"
      toast({ title: "Scan failed", description: msg, variant: "destructive" })
    } finally {
      setScanning(false)
    }
  }

  async function handleSubmit() {
    if (!draft.amount || !draft.category) {
      toast({
        title: "Missing fields",
        description: "Amount and category are required.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/driver/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: driverId,
          category: draft.category,
          amount: Number(draft.amount),
          currency: draft.currency,
          vendor: draft.vendor || null,
          occurred_at: new Date(draft.occurred_at).toISOString(),
          country: draft.country || null,
          description: draft.description || null,
          vat_amount: draft.vat_amount ? Number(draft.vat_amount) : null,
          quantity: draft.quantity ? Number(draft.quantity) : null,
          unit: draft.unit || null,
          location_label: draft.location_label || null,
          receipt_url: draft.receipt_url,
          extracted_data: draft.extracted_data,
          extraction_confidence: draft.extraction_confidence,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Submit failed")
      toast({
        title: "Expense submitted",
        description: "Sent to the office for review.",
      })
      onSubmitted?.()
      close(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not submit expense"
      toast({ title: "Submit failed", description: msg, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      {/*
        Leaflet's map panes use z-index up to 700 and its zoom controls sit at
        z-1000, which would otherwise paint on top of the default shadcn Dialog
        (z-50). We bump the content above the Leaflet stack so the receipt
        capture flow renders on top and stays fully clickable on the driver
        map screen. Radix already locks pointer events outside the modal,
        so we only need to override z-index on the content layer.
      */}
      <DialogContent
        className="max-h-[85vh] overflow-y-auto !z-[1100]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Add expense
          </DialogTitle>
          <DialogDescription>
            {mode === "choose"
              ? "Scan a receipt with the camera or enter the details by hand. The office will review and approve before it posts."
              : "Review the details, fix anything that looks wrong, then submit for review."}
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" && (
          <div className="flex flex-col gap-3 py-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleScanFile(f)
                // Reset so picking the same file again still fires onChange.
                e.target.value = ""
              }}
            />
            <Button
              size="lg"
              className="h-14 justify-start gap-3"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">
                  {scanning ? "Reading receipt..." : "Scan receipt"}
                </span>
                <span className="text-[11px] opacity-80">
                  Take a photo or upload a PDF — we&apos;ll fill in the fields.
                </span>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 justify-start gap-3"
              onClick={() => setMode("form")}
            >
              <Receipt className="h-5 w-5" />
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">Enter manually</span>
                <span className="text-[11px] text-muted-foreground">
                  No receipt? Type the amount and category yourself.
                </span>
              </div>
            </Button>
          </div>
        )}

        {mode === "form" && (
          <div className="grid gap-3 py-2">
            {draft.extraction_confidence != null && (
              <div className="rounded-md border bg-muted/40 p-2 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">AI pre-filled this expense</span>
                    <Badge variant="outline" className="text-[10px]">
                      {Math.round(draft.extraction_confidence)}% confident
                    </Badge>
                  </div>
                  {draft.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {draft.warnings.map((w, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1 text-amber-600"
                        >
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-muted-foreground">
                    Please double-check before submitting.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="exp-category" className="text-xs">
                  Category *
                </Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) =>
                    setDraft({ ...draft, category: v as Category })
                  }
                >
                  <SelectTrigger id="exp-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="exp-occurred" className="text-xs">
                  When *
                </Label>
                <Input
                  id="exp-occurred"
                  type="datetime-local"
                  value={draft.occurred_at}
                  onChange={(e) =>
                    setDraft({ ...draft, occurred_at: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 grid gap-1">
                <Label htmlFor="exp-amount" className="text-xs">
                  Amount *
                </Label>
                <Input
                  id="exp-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="exp-currency" className="text-xs">
                  Currency
                </Label>
                <Select
                  value={draft.currency}
                  onValueChange={(v) => setDraft({ ...draft, currency: v })}
                >
                  <SelectTrigger id="exp-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="exp-vendor" className="text-xs">
                  Vendor
                </Label>
                <Input
                  id="exp-vendor"
                  value={draft.vendor}
                  onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                  placeholder="OMV, Shell, ASFINAG..."
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="exp-country" className="text-xs">
                  Country
                </Label>
                <Input
                  id="exp-country"
                  value={draft.country}
                  onChange={(e) =>
                    setDraft({ ...draft, country: e.target.value.toUpperCase() })
                  }
                  placeholder="DE, AT, RO..."
                  maxLength={2}
                />
              </div>
            </div>

            {(draft.category === "fuel" || draft.category === "ad_blue") && (
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 grid gap-1">
                  <Label htmlFor="exp-qty" className="text-xs">
                    Quantity
                  </Label>
                  <Input
                    id="exp-qty"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={draft.quantity}
                    onChange={(e) =>
                      setDraft({ ...draft, quantity: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="exp-unit" className="text-xs">
                    Unit
                  </Label>
                  <Input
                    id="exp-unit"
                    value={draft.unit || "L"}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-1">
              <Label htmlFor="exp-vat" className="text-xs">
                VAT amount
              </Label>
              <Input
                id="exp-vat"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={draft.vat_amount}
                onChange={(e) =>
                  setDraft({ ...draft, vat_amount: e.target.value })
                }
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="exp-loc" className="text-xs">
                Location
              </Label>
              <Input
                id="exp-loc"
                value={draft.location_label}
                onChange={(e) =>
                  setDraft({ ...draft, location_label: e.target.value })
                }
                placeholder="City / address as printed"
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="exp-desc" className="text-xs">
                Notes
              </Label>
              <Textarea
                id="exp-desc"
                rows={2}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </div>

            {draft.receipt_url && (
              <a
                href={draft.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-primary inline-flex items-center gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                Receipt uploaded — view
              </a>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {mode === "form" && (
            <Button
              variant="ghost"
              onClick={() => setMode("choose")}
              disabled={submitting}
            >
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>
            Cancel
          </Button>
          {mode === "form" && (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...
                </>
              ) : (
                "Submit for review"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
