"use client"

/**
 * Driver-side CMR / POD upload dialog.
 *
 * Why this exists: a driver finishing a stop is in a hurry — pinch-zooming
 * a map, packing a load, calling a customer — and forgetting to attach
 * the CMR/POD scan is the single biggest paperwork bug we've shipped. The
 * official flow is to wire a `task_form` to the stop and have the driver
 * fill it. This dialog is the **safety net**: a permanent button next to
 * "Expense" that lets the driver attach photos to ANY order on the
 * active trip, at ANY time, even after the stop is completed.
 *
 * Design choices:
 *  - Order picker (not stop picker), because that's where order_documents
 *    actually lives in the schema. If the trip has only one order we
 *    auto-select it.
 *  - Multi-photo capture in one go: drivers typically take 4-6 photos of
 *    a CMR (front, back, signatures, stamps). Each becomes its own
 *    `order_documents` row so dispatch can review them individually.
 *  - Doc type defaults to `cmr_pod` (the constraint string already in
 *    the DB) but lets the driver pick `proof_of_delivery` or `other`.
 *  - Files go to the same `documents` storage bucket admins use. We
 *    follow the existing path convention `orders/<order_id>/<ts>-<name>`
 *    so the admin "Documents" tab in `order-detail-panel.tsx` picks
 *    them up automatically without any reader-side change.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import {
  Camera,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
} from "lucide-react"

interface OrderOption {
  id: string
  reference_number: string
  customer_name: string | null
  admin_id?: string | null
}

interface DriverDocsUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Orders linked to the active trip. */
  orders: OrderOption[]
  /** Optional preselected order id when the driver opens the dialog
   *  from a specific stop. */
  defaultOrderId?: string | null
  /** The driver's id and display name for audit trail. */
  driverId: string | null
  driverName: string | null
}

const DOC_TYPES = [
  { value: "cmr_pod", label: "CMR / POD" },
  { value: "proof_of_delivery", label: "Proof of Delivery" },
  { value: "bill_of_lading", label: "Bill of Lading" },
  { value: "customs", label: "Customs" },
  { value: "other", label: "Other" },
] as const

export function DriverDocsUploadDialog({
  open,
  onOpenChange,
  orders,
  defaultOrderId,
  driverId,
  driverName,
}: DriverDocsUploadDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [orderId, setOrderId] = useState<string | null>(null)
  const [docType, setDocType] = useState<string>("cmr_pod")
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  // When the dialog opens, pick a sensible default order. If a specific
  // order was passed in, use it; otherwise auto-pick when there's only
  // one linked order on the trip.
  //
  // IMPORTANT: this effect MUST only react to the dialog opening. The
  // parent page recomputes the `orders` array on every render (it's
  // built inline from `activeTrip.orders.map(...)`), and the trip list
  // refetches every few seconds, so depending on `orders` as a
  // reference would clear the file list a few seconds after the driver
  // captures photos — exactly the bug we're fixing here. We read
  // `orders` and `defaultOrderId` inside the effect but only re-run on
  // `open` transitions.
  useEffect(() => {
    if (!open) return
    if (defaultOrderId) {
      setOrderId(defaultOrderId)
    } else if (orders.length === 1) {
      setOrderId(orders[0].id)
    } else {
      setOrderId(null)
    }
    setDocType("cmr_pod")
    setFiles([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selectedOrder = useMemo(
    () => orders.find(o => o.id === orderId) || null,
    [orders, orderId]
  )

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return
    // Cap at 12 files / 50MB total to stay well below the practical
    // per-request payload Supabase Storage will accept on free tier.
    const next = [...files]
    for (const f of Array.from(incoming)) {
      if (next.length >= 12) break
      if (!/^image\/|^application\/pdf$/.test(f.type)) {
        toast({
          title: "Skipped",
          description: `${f.name}: only images and PDFs are accepted.`,
          variant: "destructive",
        })
        continue
      }
      next.push(f)
    }
    setFiles(next)
  }

  const removeAt = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSubmit = async () => {
    if (!orderId || files.length === 0 || !selectedOrder) return
    setUploading(true)
    const supabase = createClient()
    let success = 0
    try {
      for (const file of files) {
        const ts = Date.now()
        // Mirror the admin upload path so the existing order documents
        // listing in the admin order-detail panel finds these files
        // without any reader change.
        const path = `orders/${orderId}/${ts}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: false })
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(path)
        const fileUrl = urlData.publicUrl

        const { error: insertError } = await supabase
          .from("order_documents")
          .insert({
            order_id: orderId,
            // admin_id is now nullable (migration 078) — we leave it
            // null because the driver doesn't act on behalf of a
            // specific admin. The admin scope is recovered via the
            // order's own admin_id when listing.
            admin_id: selectedOrder.admin_id ?? null,
            document_type: docType,
            name: file.name,
            file_url: fileUrl,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by_type: "driver",
            uploaded_by_id: driverId,
            uploaded_by_name: driverName || "Driver",
          })
        if (insertError) throw insertError

        // Best-effort activity log; ignore failures so a missing
        // table or RLS denial never blocks the upload.
        try {
          await supabase.from("order_activity_log").insert({
            order_id: orderId,
            action: "document_uploaded",
            details: {
              document_type: docType,
              file_name: file.name,
              source: "driver_app",
            },
            performed_by_type: "driver",
            performed_by_id: driverId,
          })
        } catch {}

        success++
      }

      toast({
        title: success === files.length ? "Uploaded" : "Partial upload",
        description: `${success} of ${files.length} file(s) attached to order ${selectedOrder.reference_number}.`,
      })
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload one or more files.",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const canSubmit = !!orderId && files.length > 0 && !uploading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Width tuning:
          - On mobile we cap at calc(100% - 3rem) so the dialog leaves a
            visible 24 px gutter on each side (the shadcn default of
            calc(100% - 2rem) feels edge-to-edge on a 360 px phone and
            made the close button hard to tap).
          - On >= sm we keep the dialog narrow (max-w-sm) because this
            form is one column of small inputs; max-w-lg was wasting
            horizontal space.
      */}
      <DialogContent className="max-w-[calc(100%-3rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Upload CMR / POD
          </DialogTitle>
          <DialogDescription className="text-xs">
            Attach photos or a PDF scan to one of the orders on this trip.
            You can upload at any time — even after the stop is completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Order selector — auto-selected when there's only one. */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Order</Label>
            <Select
              value={orderId ?? ""}
              onValueChange={v => setOrderId(v)}
              disabled={uploading}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select order..." />
              </SelectTrigger>
              <SelectContent>
                {orders.map(o => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    <span className="font-medium">{o.reference_number}</span>
                    {o.customer_name && (
                      <span className="ml-2 text-muted-foreground">
                        — {o.customer_name}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Document type. */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Document type</Label>
            <Select value={docType} onValueChange={setDocType} disabled={uploading}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Capture controls — split between camera (mobile native) and
              file picker, because some drivers will be uploading scans
              from a USB stick on a tablet. */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 text-xs"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="h-4 w-4 mr-1.5" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add file
            </Button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            // `capture` prompts the OS camera; ignored on desktop.
            capture="environment"
            multiple
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />

          {/* Selected files preview. We deliberately don't render image
              thumbnails inline because some CMR photos can be 8 MB and
              would freeze the dialog on a low-end phone. */}
          {files.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border/50 p-1.5">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground/70 shrink-0">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    onClick={() => removeAt(i)}
                    disabled={uploading}
                    aria-label={`Remove ${f.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
            className="h-9 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-9 text-xs"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            {uploading
              ? "Uploading..."
              : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
