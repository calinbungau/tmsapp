"use client"

/**
 * Cost Provider editor — full-page configurator for one cost_provider.
 *
 * Sections:
 *   1. General (name, code, status, default currency / cost code)
 *   2. File format (xlsx/csv, sheet name, header row, delimiter…)
 *   3. Column Mapping — for each of OUR target fields the user picks the
 *      matching SOURCE column. "Suggest from sample" auto-fills it.
 *   4. Cost Code Rules — translate "Diesel AGO" / "Road tax" / "Vignette"
 *      into our cost_codes. Used by the resolver during import.
 */

import { use, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAdminSession } from "@/hooks/use-admin-session"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Save,
  Trash2,
  Upload,
  Sparkles,
  Plus,
  Loader2,
  FileSpreadsheet,
  Wand2,
  AlertTriangle,
} from "lucide-react"
import { TARGET_FIELDS, type TargetField, type MappingTemplate } from "@/lib/cost-imports/types"
import { CatalogPicker, type CatalogItem } from "@/components/finance/catalog-picker"

interface Provider {
  id: string
  admin_id: string
  name: string
  code: string | null
  provider_type: string | null
  file_format: string | null
  file_delimiter: string | null
  file_encoding: string | null
  has_header_row: boolean | null
  default_currency: string | null
  default_cost_code: string | null
  mapping_template: MappingTemplate | null
  is_active: boolean | null
  notes: string | null
  contact_name: string | null
  contact_email: string | null
}

interface Rule {
  id: string
  external_code: string | null
  external_name: string | null
  cost_code: string | null
  cost_catalog_id: string | null
  is_active: boolean
  match_count: number | null
}

export default function ProviderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { session } = useAdminSession()
  const { toast } = useToast()

  const [provider, setProvider] = useState<Provider | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // File-based "Suggest mapping from sample" state
  const [sampleHeaders, setSampleHeaders] = useState<string[] | null>(null)
  const [sampleSheets, setSampleSheets] = useState<string[]>([])
  const [inspecting, setInspecting] = useState(false)

  const load = useCallback(async () => {
    if (!session?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/finance/cost-providers/${id}?admin_id=${session.id}`, {
        cache: "no-store",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      setProvider(json.provider)
      setRules(json.rules ?? [])
    } catch (e) {
      toast({
        title: "Failed to load provider",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [id, session?.id, toast])

  useEffect(() => {
    load()
  }, [load])

  async function saveProvider() {
    if (!provider || !session?.id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/finance/cost-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: session.id,
          name: provider.name,
          code: provider.code,
          provider_type: provider.provider_type,
          file_format: provider.file_format,
          file_delimiter: provider.file_delimiter,
          file_encoding: provider.file_encoding,
          has_header_row: provider.has_header_row,
          default_currency: provider.default_currency,
          default_cost_code: provider.default_cost_code,
          mapping_template: provider.mapping_template,
          is_active: provider.is_active,
          notes: provider.notes,
          contact_name: provider.contact_name,
          contact_email: provider.contact_email,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Save failed")
      toast({ title: "Saved" })
      setProvider(json.provider)
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  async function deleteProvider() {
    if (!session?.id) return
    if (!confirm(`Delete provider "${provider?.name}"? This will also remove all its mapping rules.`))
      return
    const res = await fetch(`/api/admin/finance/cost-providers/${id}?admin_id=${session.id}`, {
      method: "DELETE",
    })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: "Delete failed", description: json.error, variant: "destructive" })
      return
    }
    toast({ title: "Provider deleted" })
    router.push("/admin/settings/integrations")
  }

  async function inspectSample(file: File, suggest: boolean) {
    if (!provider) return
    setInspecting(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (provider.file_format) fd.append("format", provider.file_format)
      if (provider.file_delimiter && provider.file_delimiter !== "auto")
        fd.append("delimiter", provider.file_delimiter)
      const tplFields = provider.mapping_template?.fields || {}
      const headerRow = String(provider.mapping_template?.header_row_index ?? 0)
      fd.append("header_row_index", headerRow)
      fd.append("has_header_row", String(provider.has_header_row !== false))
      if (suggest) fd.append("suggest", "true")

      const res = await fetch("/api/admin/finance/cost-providers/inspect-file", {
        method: "POST",
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Inspect failed")
      setSampleHeaders(json.headers ?? [])
      setSampleSheets(json.sheets ?? [])

      if (suggest && json.suggestions) {
        const merged: MappingTemplate["fields"] = { ...tplFields }
        for (const [k, v] of Object.entries(json.suggestions)) {
          if (!merged[k as TargetField]) merged[k as TargetField] = v as string
        }
        setProvider({
          ...provider,
          mapping_template: { ...(provider.mapping_template || { fields: {} }), fields: merged },
        })
        toast({
          title: "Mapping suggested",
          description: `Auto-filled ${Object.keys(json.suggestions).length} fields from your sample.`,
        })
      } else {
        toast({ title: "Sample loaded", description: `${json.headers?.length || 0} columns detected.` })
      }
    } catch (e) {
      toast({
        title: "Inspect failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setInspecting(false)
    }
  }

  function setField(target: TargetField, sourceColumn: string | null) {
    if (!provider) return
    const tpl = provider.mapping_template || { fields: {}, version: 1 }
    const fields = { ...(tpl.fields || {}) }
    if (!sourceColumn) delete fields[target]
    else fields[target] = sourceColumn
    setProvider({ ...provider, mapping_template: { ...tpl, fields } })
  }

  function setTplProp<K extends keyof MappingTemplate>(key: K, value: MappingTemplate[K]) {
    if (!provider) return
    const tpl = provider.mapping_template || { fields: {}, version: 1 }
    setProvider({ ...provider, mapping_template: { ...tpl, [key]: value } })
  }

  // ---- Rules ----
  async function addRule() {
    if (!session?.id) return
    const res = await fetch(`/api/admin/finance/cost-providers/${id}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_id: session.id,
        external_name: "",
        cost_code: null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: "Add failed", description: json.error, variant: "destructive" })
      return
    }
    setRules([...rules, json.rule])
  }

  async function patchRule(rule_id: string, patch: Partial<Rule> & { cost_catalog_id?: string | null }) {
    if (!session?.id) return
    const res = await fetch(`/api/admin/finance/cost-providers/${id}/rules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: session.id, rule_id, ...patch }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: "Save failed", description: json.error, variant: "destructive" })
      return
    }
    setRules(rules.map((r) => (r.id === rule_id ? { ...r, ...json.rule } : r)))
  }

  async function deleteRule(rule_id: string) {
    if (!session?.id) return
    await fetch(
      `/api/admin/finance/cost-providers/${id}/rules?admin_id=${session.id}&rule_id=${rule_id}`,
      { method: "DELETE" },
    )
    setRules(rules.filter((r) => r.id !== rule_id))
  }

  if (loading || !provider) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tpl = provider.mapping_template || { fields: {}, version: 1 }
  const mappedCount = Object.keys(tpl.fields || {}).length

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/settings/integrations" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shrink-0">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold truncate">{provider.name}</h1>
            <p className="text-xs text-muted-foreground">
              {mappedCount} fields mapped · {rules.length} cost rules
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={deleteProvider} className="gap-1.5 text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <Button size="sm" onClick={saveProvider} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general" className="text-xs">
            General
          </TabsTrigger>
          <TabsTrigger value="format" className="text-xs">
            File Format
          </TabsTrigger>
          <TabsTrigger value="mapping" className="text-xs">
            Column Mapping
            <Badge variant="outline" className="ml-1.5 text-[9px]">
              {mappedCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-xs">
            Cost Rules
            <Badge variant="outline" className="ml-1.5 text-[9px]">
              {rules.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-xl p-4">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={provider.name} onChange={(e) => setProvider({ ...provider, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={provider.code || ""}
                onChange={(e) => setProvider({ ...provider, code: e.target.value })}
                placeholder="SHELL, T4E, DKV…"
              />
            </div>
            <div>
              <Label className="text-xs">Provider type</Label>
              <Select
                value={provider.provider_type || "fuel_card"}
                onValueChange={(v) => setProvider({ ...provider, provider_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel_card">Fuel card</SelectItem>
                  <SelectItem value="toll">Toll provider</SelectItem>
                  <SelectItem value="vignette">Vignette</SelectItem>
                  <SelectItem value="lease">Lease / rental</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Default currency</Label>
              <Input
                value={provider.default_currency || "EUR"}
                onChange={(e) =>
                  setProvider({ ...provider, default_currency: e.target.value.toUpperCase() })
                }
                maxLength={3}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Fallback cost code</Label>
              <Input
                value={provider.default_cost_code || ""}
                onChange={(e) => setProvider({ ...provider, default_cost_code: e.target.value })}
                placeholder="e.g. OTHER_FLEET — used when no rule matches"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                If a row's product can't be matched against any rule below, it lands on this cost code.
              </p>
            </div>
            <div className="md:col-span-2 flex items-center justify-between p-3 rounded-md border">
              <div>
                <p className="text-xs font-medium">Active</p>
                <p className="text-[10px] text-muted-foreground">Inactive providers don't appear in the import dialog.</p>
              </div>
              <Switch
                checked={provider.is_active !== false}
                onCheckedChange={(v) => setProvider({ ...provider, is_active: v })}
              />
            </div>
          </div>
        </TabsContent>

        {/* FILE FORMAT */}
        <TabsContent value="format" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-xl p-4">
            <div>
              <Label className="text-xs">File format</Label>
              <Select
                value={provider.file_format || "xlsx"}
                onValueChange={(v) => setProvider({ ...provider, file_format: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                  <SelectItem value="xls">XLS</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sheet name (xlsx)</Label>
              <Input
                value={tpl.sheet_name || ""}
                placeholder={sampleSheets.length ? sampleSheets.join(", ") : "First sheet"}
                onChange={(e) => setTplProp("sheet_name", e.target.value || undefined)}
              />
            </div>
            <div>
              <Label className="text-xs">Header row index (0-based)</Label>
              <Input
                type="number"
                min={0}
                value={tpl.header_row_index ?? 0}
                onChange={(e) => setTplProp("header_row_index", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">CSV delimiter</Label>
              <Input
                value={provider.file_delimiter || "auto"}
                onChange={(e) => setProvider({ ...provider, file_delimiter: e.target.value })}
                placeholder="auto, ',', ';', '\t'"
              />
            </div>
            <div>
              <Label className="text-xs">File encoding</Label>
              <Input
                value={provider.file_encoding || "utf-8"}
                onChange={(e) => setProvider({ ...provider, file_encoding: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border">
              <div>
                <p className="text-xs font-medium">Has header row</p>
                <p className="text-[10px] text-muted-foreground">Disable for raw data exports.</p>
              </div>
              <Switch
                checked={provider.has_header_row !== false}
                onCheckedChange={(v) => setProvider({ ...provider, has_header_row: v })}
              />
            </div>
          </div>
        </TabsContent>

        {/* COLUMN MAPPING */}
        <TabsContent value="mapping" className="space-y-3">
          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold">Column mapping</p>
                <p className="text-xs text-muted-foreground">
                  Map each of OUR target fields to the matching column in the supplier's file.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="sample-suggest"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && inspectSample(e.target.files[0], true)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => document.getElementById("sample-suggest")?.click()}
                  disabled={inspecting}
                >
                  {inspecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Suggest from sample
                </Button>
                <input
                  type="file"
                  id="sample-load"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && inspectSample(e.target.files[0], false)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => document.getElementById("sample-load")?.click()}
                  disabled={inspecting}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Load headers only
                </Button>
              </div>
            </div>

            {sampleHeaders === null && mappedCount === 0 && (
              <div className="rounded-lg border border-dashed p-4 flex items-start gap-3 bg-muted/20">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium">Tip — upload a sample file first</p>
                  <p className="text-muted-foreground">
                    "Suggest from sample" reads the file's header row and auto-maps as many fields
                    as it can. You can correct anything afterwards.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {TARGET_FIELDS.map((f) => {
                const current = tpl.fields?.[f.key]
                const value = typeof current === "string" ? current : current?.column ?? ""
                return (
                  <div
                    key={f.key}
                    className="grid grid-cols-1 md:grid-cols-[200px_1fr] items-center gap-2 border-b border-border/40 last:border-b-0 pb-2 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        {f.label}
                        {f.required && <span className="text-destructive">*</span>}
                      </p>
                      {f.hint && <p className="text-[10px] text-muted-foreground">{f.hint}</p>}
                    </div>
                    {sampleHeaders ? (
                      <Select
                        value={value || "__none__"}
                        onValueChange={(v) => setField(f.key, v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="(unmapped)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">(unmapped)</SelectItem>
                          {sampleHeaders.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={value}
                        placeholder="Source column header in the file"
                        onChange={(e) => setField(f.key, e.target.value || null)}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* COST RULES */}
        <TabsContent value="rules" className="space-y-3">
          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Cost code rules</p>
                <p className="text-xs text-muted-foreground">
                  Map values from the file's "product" column (e.g. "Diesel AGO", "Road tax",
                  "Vignette") to your internal cost catalog codes.
                </p>
              </div>
              <Button size="sm" onClick={addRule} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add rule
              </Button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg">
                <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-medium">No rules defined</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                  Without rules, all imported rows will fall back to "{provider.default_cost_code || "—"}".
                  Add at least one rule per product type so costs land on the right account.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onChange={(patch) => patchRule(rule.id, patch)}
                    onDelete={() => deleteRule(rule.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: Rule
  onChange: (patch: Partial<Rule>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(rule.external_name || "")
  const [catalogItem, setCatalogItem] = useState<CatalogItem | null>(
    rule.cost_catalog_id && rule.cost_code
      ? ({
          id: rule.cost_catalog_id,
          cost_code: rule.cost_code,
          cost_line: rule.cost_code,
          unit: null,
          nature: null,
          behavior: null,
          is_system: false,
          driver_allowed: false,
          manual_allowed: true,
        } as CatalogItem)
      : null,
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center border border-border/40 rounded-lg p-2">
      <div>
        <Label className="text-[10px] text-muted-foreground">If product contains</Label>
        <Input
          value={name}
          placeholder="e.g. Diesel, Road tax, Vignette"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (rule.external_name || "") && onChange({ external_name: name })}
          className="h-8 text-xs"
        />
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground">→ post to cost code</Label>
        <CatalogPicker
          value={catalogItem?.id ?? null}
          initialItem={catalogItem}
          onChange={(item) => {
            setCatalogItem(item)
            onChange({ cost_code: item?.cost_code ?? null, cost_catalog_id: item?.id ?? null })
          }}
          className="h-8 text-xs"
          placeholder="Pick a cost code…"
        />
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
        {rule.match_count ? `${rule.match_count} hits` : "Unused"}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
