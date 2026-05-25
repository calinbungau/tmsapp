"use client"

/**
 * Cost Provider Import Dialog — used from Finance / Review.
 *
 * Steps:
 *   1. Select provider (saved cost_provider with mapping template).
 *   2. Upload supplier file (.xlsx/.xls/.csv).
 *   3. Preview — shows resolution status per row (ready / needs attention /
 *      duplicate). Reviewer toggles auto-approve, then clicks Import.
 *   4. Done — shows the import summary and links to the audit row.
 */

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  AlertTriangle,
  Copy as CopyIcon,
  Upload,
  FileSpreadsheet,
  Loader2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Building2,
} from "lucide-react"
import type { ParsedRow } from "@/lib/cost-imports/types"

interface Provider {
  id: string
  name: string
  code: string | null
  file_format: string | null
  default_currency: string | null
  is_active: boolean | null
  rule_count: number
}

interface PreviewResult {
  headers: string[]
  rows: ParsedRow[]
  summary: { total: number; ready: number; needs_attention: number; duplicate: number; error: number }
  file_name: string
  file_size_bytes: number
  provider: { id: string; name: string; code: string | null; default_currency: string | null }
}

interface CommitResult {
  inserted: number
  skipped: number
  duplicates: number
  errors: string[]
  status: string
  import_id: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  adminId: string | null
  /** Called after a successful commit so callers can refresh their lists. */
  onImported?: () => void
}

export function CostImportDialog({ open, onOpenChange, adminId, onImported }: Props) {
  const { toast } = useToast()
  const [step, setStep] = useState<"provider" | "upload" | "preview" | "done">("provider")
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerId, setProviderId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [autoApprove, setAutoApprove] = useState(true)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Load providers when the dialog opens.
  useEffect(() => {
    if (!open || !adminId) return
    setStep("provider")
    setFile(null)
    setPreview(null)
    setCommitResult(null)
    fetch(`/api/admin/finance/cost-providers?admin_id=${adminId}`)
      .then((r) => r.json())
      .then((j) => setProviders((j.providers ?? []).filter((p: Provider) => p.is_active !== false)))
      .catch(() => setProviders([]))
  }, [open, adminId])

  const selectedProvider = providers.find((p) => p.id === providerId)

  async function runPreview() {
    if (!file || !providerId || !adminId) return
    setPreviewing(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("admin_id", adminId)
      fd.append("provider_id", providerId)
      const res = await fetch("/api/admin/finance/cost-imports/preview", {
        method: "POST",
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Preview failed")
      setPreview(json)
      setStep("preview")
    } catch (e) {
      toast({
        title: "Preview failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setPreviewing(false)
    }
  }

  async function commit() {
    if (!preview || !providerId || !adminId) return
    setCommitting(true)
    try {
      const res = await fetch("/api/admin/finance/cost-imports/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: adminId,
          provider_id: providerId,
          file_name: preview.file_name,
          file_size_bytes: preview.file_size_bytes,
          rows: preview.rows,
          auto_approve: autoApprove,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Import failed")
      setCommitResult(json)
      setStep("done")
      onImported?.()
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] xl:!max-w-7xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Import costs from supplier file
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 px-1 py-2 text-xs">
          <Step label="1. Provider" active={step === "provider"} done={step !== "provider"} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Step label="2. Upload" active={step === "upload"} done={step === "preview" || step === "done"} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Step label="3. Preview" active={step === "preview"} done={step === "done"} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Step label="4. Done" active={step === "done"} done={false} />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {step === "provider" && (
            <ProviderStep
              providers={providers}
              providerId={providerId}
              onPick={(id) => {
                setProviderId(id)
                setStep("upload")
              }}
            />
          )}

          {step === "upload" && selectedProvider && (
            <UploadStep
              provider={selectedProvider}
              file={file}
              onFile={setFile}
              previewing={previewing}
              onContinue={runPreview}
              onBack={() => setStep("provider")}
            />
          )}

          {step === "preview" && preview && (
            <PreviewStep preview={preview} autoApprove={autoApprove} onAutoApproveChange={setAutoApprove} />
          )}

          {step === "done" && commitResult && (
            <DoneStep result={commitResult} fileName={preview?.file_name} />
          )}
        </div>

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={committing}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={commit} disabled={committing || !preview}>
                {committing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Import {preview?.summary.ready && preview.summary.ready + preview.summary.needs_attention} rows
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Step({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`px-2 py-1 rounded ${
        active ? "bg-primary text-primary-foreground font-medium" : done ? "bg-muted text-muted-foreground" : "text-muted-foreground"
      }`}
    >
      {label}
    </span>
  )
}

function ProviderStep({
  providers,
  providerId,
  onPick,
}: {
  providers: Provider[]
  providerId: string | null
  onPick: (id: string) => void
}) {
  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium">No cost providers configured</p>
        <p className="text-xs text-muted-foreground mt-1">
          Set one up in <span className="font-mono">Settings → Integrations → Cost Providers</span> first.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2 py-2">
      <p className="text-xs text-muted-foreground">
        Choose the supplier whose file you're uploading. Each provider has its own column mapping
        and cost-code rules.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className={`text-left border rounded-lg p-3 transition-colors ${
              providerId === p.id ? "border-primary bg-primary/5" : "border-border/60 hover:border-foreground/40 hover:bg-muted/20"
            }`}
          >
            <p className="font-medium text-sm">{p.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {p.code} · {p.file_format?.toUpperCase() || "any"} · {p.default_currency || "EUR"} ·{" "}
              {p.rule_count} rules
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

function UploadStep({
  provider,
  file,
  onFile,
  previewing,
  onContinue,
  onBack,
}: {
  provider: Provider
  file: File | null
  onFile: (f: File | null) => void
  previewing: boolean
  onContinue: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="rounded-lg border bg-muted/20 p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Provider</p>
          <p className="font-medium text-sm">{provider.name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Change
        </Button>
      </div>

      <label
        htmlFor="cost-import-file"
        className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/20 transition-colors"
      >
        <Upload className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {file ? file.name : `Drop or click to upload your ${provider.file_format?.toUpperCase() || "supplier"} file`}
        </p>
        <p className="text-xs text-muted-foreground">.xlsx / .xls / .csv</p>
        <input
          id="cost-import-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={!file || previewing}>
          {previewing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Preview
        </Button>
      </div>
    </div>
  )
}

function PreviewStep({
  preview,
  autoApprove,
  onAutoApproveChange,
}: {
  preview: PreviewResult
  autoApprove: boolean
  onAutoApproveChange: (v: boolean) => void
}) {
  const { summary, rows, file_name } = preview
  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Ready" value={summary.ready} icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} />
        <Stat label="Need attention" value={summary.needs_attention} icon={<AlertTriangle className="h-3 w-3 text-amber-500" />} />
        <Stat label="Duplicate" value={summary.duplicate} icon={<CopyIcon className="h-3 w-3 text-muted-foreground" />} />
        <Stat label="Errors" value={summary.error} icon={<AlertCircle className="h-3 w-3 text-destructive" />} />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/10">
        <div>
          <Label className="text-xs">Auto-approve to ledger</Label>
          <p className="text-[11px] text-muted-foreground">
            ON: ready rows post directly to the books. OFF: all rows land in pending review.
          </p>
        </div>
        <Switch checked={autoApprove} onCheckedChange={onAutoApproveChange} />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 text-xs flex items-center justify-between">
          <span className="font-medium">{file_name}</span>
          <span className="text-muted-foreground tabular-nums">{rows.length} rows</span>
        </div>
        <div className="max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1.5 w-10">#</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Date</th>
                <th className="px-2 py-1.5">Vehicle</th>
                <th className="px-2 py-1.5">Country</th>
                <th className="px-2 py-1.5">Product</th>
                <th className="px-2 py-1.5">Cost code</th>
                <th className="px-2 py-1.5 text-right">Local</th>
                <th className="px-2 py-1.5 text-right">EUR</th>
                <th className="px-2 py-1.5">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, 200).map((r) => (
                <tr key={r.rowIndex} className="hover:bg-muted/20">
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowIndex}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-2 py-1.5">{(r.mapped.entry_date as string) || "—"}</td>
                  <td className="px-2 py-1.5">
                    {r.mapped.vehicle_plate ? (
                      <span className={r.resolved.vehicle_id ? "" : "text-amber-500"}>
                        {String(r.mapped.vehicle_plate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px]">
                    {(r.mapped.country_code as string) || <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-2 py-1.5 max-w-[140px] truncate">
                    {(r.mapped.product_code as string) || "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.resolved.cost_code || <span className="text-amber-500">unresolved</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.mapped.amount_incl_vat || r.mapped.amount_excl_vat ? (
                      <span>
                        {Number(r.mapped.amount_incl_vat ?? r.mapped.amount_excl_vat).toFixed(2)}{" "}
                        <span className="text-muted-foreground">{(r.mapped.currency as string) || ""}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.mapped.amount_eur ? (
                      <span className="font-medium">
                        {Number(r.mapped.amount_eur).toFixed(2)}{" "}
                        <span className="text-muted-foreground">EUR</span>
                      </span>
                    ) : (r.mapped.currency as string) === "EUR" && r.mapped.amount_incl_vat ? (
                      <span className="font-medium">
                        {Number(r.mapped.amount_incl_vat).toFixed(2)}{" "}
                        <span className="text-muted-foreground">EUR</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-amber-500 max-w-[200px] truncate" title={r.issues.join(", ")}>
                    {r.issues.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
              Showing first 200 of {rows.length} rows
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ParsedRow["status"] }) {
  const map = {
    ready: { label: "Ready", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    needs_attention: { label: "Attention", cls: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
    duplicate: { label: "Duplicate", cls: "bg-muted text-muted-foreground" },
    error: { label: "Error", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  } as const
  const m = map[status]
  return (
    <Badge variant="outline" className={`text-[10px] ${m.cls}`}>
      {m.label}
    </Badge>
  )
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

function DoneStep({ result, fileName }: { result: CommitResult; fileName?: string }) {
  return (
    <div className="py-8 flex flex-col items-center text-center gap-3">
      <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
      </div>
      <div>
        <h3 className="font-semibold">Import {result.status === "completed" ? "complete" : result.status}</h3>
        <p className="text-xs text-muted-foreground">{fileName}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-md">
        <div className="border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Inserted</p>
          <p className="text-lg font-bold tabular-nums">{result.inserted}</p>
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Skipped</p>
          <p className="text-lg font-bold tabular-nums">{result.skipped}</p>
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Duplicates</p>
          <p className="text-lg font-bold tabular-nums">{result.duplicates}</p>
        </div>
      </div>
      {result.errors.length > 0 && (
        <div className="w-full text-left border border-destructive/30 bg-destructive/5 rounded-lg p-3">
          <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {result.errors.length} batch error(s)
          </p>
          <ul className="text-[11px] text-destructive/80 mt-1 list-disc pl-4">
            {result.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
