"use client"

/**
 * Cost Providers tab — listed inside Admin → Settings → Integrations.
 *
 * Shows configured suppliers (Shell, T4E, DKV…) as cards with their last
 * import status, file format, and a quick "Add provider" picker that lets
 * the user clone a pre-built template in one click.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Settings as SettingsIcon,
  Sparkles,
  ChevronRight,
  Loader2,
} from "lucide-react"

interface Provider {
  id: string
  name: string
  code: string | null
  provider_type: string | null
  file_format: string | null
  default_currency: string | null
  is_active: boolean | null
  last_import_at: string | null
  last_import_status: string | null
  rule_count: number
}

interface PrebuiltOption {
  code: string
  name: string
  provider_type: string
  file_format: string
  default_currency: string
  default_cost_code?: string
  rules_count: number
  field_count: number
  notes: string | null
}

export function CostProvidersTab({ adminId }: { adminId: string | null }) {
  const { toast } = useToast()
  const [providers, setProviders] = useState<Provider[]>([])
  const [prebuilt, setPrebuilt] = useState<PrebuiltOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customForm, setCustomForm] = useState({
    name: "",
    code: "",
    file_format: "xlsx",
    default_currency: "EUR",
  })

  async function load() {
    if (!adminId) return
    setLoading(true)
    try {
      const [pRes, tRes] = await Promise.all([
        fetch(`/api/admin/finance/cost-providers?admin_id=${adminId}`, { cache: "no-store" }),
        fetch("/api/admin/finance/cost-providers/prebuilt", { cache: "no-store" }),
      ])
      const pJson = await pRes.json()
      const tJson = await tRes.json()
      setProviders(pJson.providers ?? [])
      setPrebuilt(tJson.templates ?? [])
    } catch (e) {
      toast({
        title: "Failed to load providers",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId])

  async function clonePrebuilt(code: string) {
    if (!adminId) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/finance/cost-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_id: adminId, prebuilt_code: code }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Create failed")
      toast({ title: "Provider added", description: `${json.provider.name} is ready to use.` })
      setShowAdd(false)
      load()
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  async function createCustom() {
    if (!adminId || !customForm.name) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/finance/cost-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: adminId,
          name: customForm.name,
          code: customForm.code || customForm.name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
          file_format: customForm.file_format,
          default_currency: customForm.default_currency,
          has_header_row: true,
          file_encoding: "utf-8",
          import_method: customForm.file_format === "csv" ? "csv" : "excel",
          provider_type: "fuel",
          is_active: true,
          mapping_template: { fields: {}, version: 1 },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Create failed")
      toast({ title: "Provider added" })
      setShowCustom(false)
      setShowAdd(false)
      setCustomForm({ name: "", code: "", file_format: "xlsx", default_currency: "EUR" })
      load()
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cost Provider Imports</h3>
          <p className="text-xs text-muted-foreground">
            Map supplier Excel/CSV exports (Shell, Toll4Europe, DKV, OMV…) to your cost catalog
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">No providers yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Add a supplier to define how their Excel export maps to your cost catalog. Use a
            pre-built template for the big EU fleet card networks, or build your own from scratch.
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add your first provider
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.map((p) => (
            <Link
              key={p.id}
              href={`/admin/settings/integrations/cost-providers/${p.id}`}
              className="group border border-border/60 rounded-xl p-4 hover:border-border hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shrink-0">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {p.name}
                      {p.is_active === false && (
                        <Badge variant="outline" className="text-[9px]">
                          Disabled
                        </Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.code} · {p.file_format?.toUpperCase() || "Any"} · {p.default_currency || "EUR"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between border border-border/40 rounded-md px-2 py-1.5">
                  <span className="text-muted-foreground">Mapping rules</span>
                  <span className="font-mono font-medium">{p.rule_count}</span>
                </div>
                <div className="flex items-center justify-between border border-border/40 rounded-md px-2 py-1.5">
                  <span className="text-muted-foreground">Last import</span>
                  <LastImportBadge status={p.last_import_status} at={p.last_import_at} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add provider dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Add a cost provider
            </DialogTitle>
          </DialogHeader>
          {showCustom ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Build a provider from scratch. You'll define column mappings and rules in the editor.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={customForm.name}
                    onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                    placeholder="e.g. UTA Edenred"
                  />
                </div>
                <div>
                  <Label className="text-xs">Code</Label>
                  <Input
                    value={customForm.code}
                    onChange={(e) => setCustomForm({ ...customForm, code: e.target.value })}
                    placeholder="UTA"
                  />
                </div>
                <div>
                  <Label className="text-xs">File format</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={customForm.file_format}
                    onChange={(e) => setCustomForm({ ...customForm, file_format: e.target.value })}
                  >
                    <option value="xlsx">XLSX</option>
                    <option value="xls">XLS</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Default currency</Label>
                  <Input
                    value={customForm.default_currency}
                    onChange={(e) =>
                      setCustomForm({ ...customForm, default_currency: e.target.value.toUpperCase() })
                    }
                    maxLength={3}
                  />
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCustom(false)}>
                  Back to templates
                </Button>
                <Button size="sm" onClick={createCustom} disabled={creating || !customForm.name}>
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Create provider
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Start with a pre-built template — all column mappings and cost-code rules are
                pre-configured for the most common EU fleet suppliers.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
                {prebuilt.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => clonePrebuilt(t.code)}
                    disabled={creating}
                    className="text-left border border-border/60 rounded-lg p-3 hover:border-foreground/40 hover:bg-muted/20 transition-colors disabled:opacity-50"
                  >
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t.file_format.toUpperCase()} · {t.default_currency} · {t.field_count} fields
                      mapped · {t.rules_count} cost rules
                    </p>
                    {t.notes && (
                      <p className="text-[10px] text-muted-foreground/80 mt-1.5 line-clamp-2">
                        {t.notes}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setShowCustom(true)}>
                  Or create from scratch
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LastImportBadge({ status, at }: { status: string | null; at: string | null }) {
  if (!at) return <span className="text-muted-foreground/60">Never</span>
  const date = new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  if (status === "completed") {
    return (
      <span className="flex items-center gap-1 text-emerald-500 font-medium">
        <CheckCircle2 className="h-3 w-3" />
        {date}
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-destructive font-medium">
        <XCircle className="h-3 w-3" />
        {date}
      </span>
    )
  }
  if (status === "partial") {
    return (
      <span className="flex items-center gap-1 text-amber-500 font-medium">
        <AlertTriangle className="h-3 w-3" />
        {date}
      </span>
    )
  }
  return <span className="text-muted-foreground">{date}</span>
}
