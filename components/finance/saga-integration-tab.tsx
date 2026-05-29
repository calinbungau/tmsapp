"use client"

/**
 * Saga tab — listed inside Admin → Settings → Integrations → Billing.
 *
 * Two sections:
 *   1) Saga configuration (stored as a `billing_integrations` row, provider='saga')
 *      — default accounting accounts / VAT used when mapping invoices to SagaFactura.
 *   2) API Access — manage the server-to-server credentials the Saga agent uses
 *      to pull pending invoices and post back validated ones. Secrets are shown once.
 *
 * Saga is an alternative to Smartbill per tenant; activating it sets the
 * accounting provider used when new outgoing invoices are queued.
 */

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Plus,
  Trash2,
  Copy,
  KeyRound,
  CheckCircle2,
  Save,
  Loader2,
  ShieldCheck,
  Power,
  AlertTriangle,
} from "lucide-react"

interface SagaConfig {
  id: string
  is_active: boolean
  saga_default_cont: string | null
  saga_default_tip_o: string | null
  saga_client_account_prefix: string | null
  saga_default_vat_rate: number | null
}

interface ApiCredential {
  id: string
  name: string
  key_id: string
  username: string
  scopes: string[]
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

const SCOPES = [
  { value: "saga:read", label: "Read pending invoices" },
  { value: "saga:write", label: "Post validated invoices" },
  { value: "saga:import", label: "Import / reconcile (Phase 2)" },
]

export function SagaIntegrationTab({ adminId }: { adminId: string | null }) {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SagaConfig | null>(null)
  const [form, setForm] = useState({
    is_active: false,
    saga_default_cont: "704.1",
    saga_default_tip_o: "007",
    saga_client_account_prefix: "4111",
    saga_default_vat_rate: 19,
  })

  const [credentials, setCredentials] = useState<ApiCredential[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCred, setNewCred] = useState({
    name: "",
    username: "saga-agent",
    scopes: ["saga:read", "saga:write"] as string[],
  })
  const [issued, setIssued] = useState<{ keyId: string; username: string; secret: string } | null>(null)

  useEffect(() => {
    if (adminId) {
      void loadAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId])

  async function loadAll() {
    if (!adminId) return
    setLoading(true)
    try {
      const { data: cfg } = await supabase
        .from("billing_integrations")
        .select("id, is_active, saga_default_cont, saga_default_tip_o, saga_client_account_prefix, saga_default_vat_rate")
        .eq("admin_id", adminId)
        .eq("provider", "saga")
        .maybeSingle()

      if (cfg) {
        setConfig(cfg as SagaConfig)
        setForm({
          is_active: cfg.is_active,
          saga_default_cont: cfg.saga_default_cont || "704.1",
          saga_default_tip_o: cfg.saga_default_tip_o || "007",
          saga_client_account_prefix: cfg.saga_client_account_prefix || "4111",
          saga_default_vat_rate: cfg.saga_default_vat_rate ?? 19,
        })
      }

      const res = await fetch(`/api/admin/api-credentials?admin_id=${adminId}`)
      const json = await res.json()
      setCredentials(json.credentials || [])
    } catch (err) {
      console.error("[v0] Saga tab load error:", err)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    if (!adminId) {
      toast({ title: "Not authenticated", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        admin_id: adminId,
        provider: "saga",
        display_name: "Saga",
        is_active: form.is_active,
        saga_default_cont: form.saga_default_cont,
        saga_default_tip_o: form.saga_default_tip_o,
        saga_client_account_prefix: form.saga_client_account_prefix,
        saga_default_vat_rate: form.saga_default_vat_rate,
      }
      if (config) {
        const { error } = await supabase.from("billing_integrations").update(payload).eq("id", config.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("billing_integrations").insert(payload)
        if (error) throw error
      }
      // Saga is exclusive per tenant: when enabling Saga, deactivate Smartbill.
      if (form.is_active) {
        await supabase
          .from("billing_integrations")
          .update({ is_active: false })
          .eq("admin_id", adminId)
          .eq("provider", "smartbill")
      }
      toast({ title: "Saga settings saved" })
      void loadAll()
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function createCredential() {
    if (!adminId) return
    if (!newCred.name.trim() || !newCred.username.trim() || newCred.scopes.length === 0) {
      toast({ title: "Name, username and at least one scope are required", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/api-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: adminId,
          name: newCred.name,
          username: newCred.username,
          scopes: newCred.scopes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to create credential")
      setIssued({ keyId: json.keyId, username: json.username, secret: json.secret })
      setShowCreate(false)
      setNewCred({ name: "", username: "saga-agent", scopes: ["saga:read", "saga:write"] })
      void loadAll()
    } catch (err: any) {
      toast({ title: "Create failed", description: err.message, variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  async function toggleCredential(cred: ApiCredential) {
    if (!adminId) return
    await fetch("/api/admin/api-credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cred.id, admin_id: adminId, is_active: !cred.is_active }),
    })
    void loadAll()
  }

  async function deleteCredential(cred: ApiCredential) {
    if (!adminId) return
    if (!confirm(`Revoke API key "${cred.name}"? The Saga agent using it will stop working.`)) return
    await fetch(`/api/admin/api-credentials?id=${cred.id}&admin_id=${adminId}`, { method: "DELETE" })
    toast({ title: "API key revoked" })
    void loadAll()
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast({ title: `${label} copied` })
  }

  function toggleScope(scope: string) {
    setNewCred((p) => ({
      ...p,
      scopes: p.scopes.includes(scope) ? p.scopes.filter((s) => s !== scope) : [...p.scopes, scope],
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Saga config card */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/20 px-4 py-3 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-600 flex items-center justify-center text-primary-foreground font-bold text-sm">
              SG
            </div>
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                Saga
                {form.is_active && (
                  <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    Active
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">Romanian desktop accounting (offline agent sync)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="saga-active" className="text-xs text-muted-foreground">
              Use Saga
            </Label>
            <Switch
              id="saga-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
            />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {form.is_active && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Enabling Saga will deactivate Smartbill for this account. New outgoing invoices will be queued for Saga
                validation instead of being sent to Smartbill.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Default revenue account (cont)</Label>
              <Input
                value={form.saga_default_cont}
                onChange={(e) => setForm((p) => ({ ...p, saga_default_cont: e.target.value }))}
                placeholder="704.1"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Operation type (tipO)</Label>
              <Input
                value={form.saga_default_tip_o}
                onChange={(e) => setForm((p) => ({ ...p, saga_default_tip_o: e.target.value }))}
                placeholder="007"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client account prefix</Label>
              <Input
                value={form.saga_client_account_prefix}
                onChange={(e) => setForm((p) => ({ ...p, saga_client_account_prefix: e.target.value }))}
                placeholder="4111"
              />
              <p className="text-[10px] text-muted-foreground">Combined with the Saga client code, e.g. 4111.00002</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default VAT rate (%)</Label>
              <Input
                type="number"
                value={form.saga_default_vat_rate}
                onChange={(e) => setForm((p) => ({ ...p, saga_default_vat_rate: Number(e.target.value) }))}
                placeholder="19"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save settings
            </Button>
          </div>
        </div>
      </div>

      {/* API Access card */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/20 px-4 py-3 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <KeyRound className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">API Access</h3>
              <p className="text-xs text-muted-foreground">Credentials for the Saga agent and future integrations</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New API key
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {credentials.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No API keys yet. Create one for your Saga agent to connect.
            </p>
          )}

          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{cred.name}</span>
                  {cred.is_active ? (
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      Disabled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{cred.key_id}</code>
                  <span className="text-[10px] text-muted-foreground">user: {cred.username}</span>
                  {cred.scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[9px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={cred.is_active ? "Disable" : "Enable"}
                  onClick={() => toggleCredential(cred)}
                >
                  <Power className={`h-4 w-4 ${cred.is_active ? "text-emerald-400" : "text-muted-foreground"}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400"
                  title="Revoke"
                  onClick={() => deleteCredential(cred)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-[11px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> How the agent authenticates
            </p>
            <p>
              The Saga agent sends three headers on every request:{" "}
              <code className="bg-muted px-1 rounded">x-api-key</code>,{" "}
              <code className="bg-muted px-1 rounded">x-api-username</code> and{" "}
              <code className="bg-muted px-1 rounded">x-api-secret</code>.
            </p>
            <p>
              Endpoints: <code className="bg-muted px-1 rounded">GET /api/saga/invoices/pending</code> and{" "}
              <code className="bg-muted px-1 rounded">POST /api/saga/invoices/validated</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Create credential dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>Used by the Saga agent to authenticate with the TMS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={newCred.name}
                onChange={(e) => setNewCred((p) => ({ ...p, name: e.target.value }))}
                placeholder="Saga server agent"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input
                value={newCred.username}
                onChange={(e) => setNewCred((p) => ({ ...p, username: e.target.value }))}
                placeholder="saga-agent"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Scopes</Label>
              <div className="space-y-2">
                {SCOPES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCred.scopes.includes(s.value)}
                      onChange={() => toggleScope(s.value)}
                      className="rounded border-border"
                    />
                    <span>{s.label}</span>
                    <code className="text-[10px] text-muted-foreground">{s.value}</code>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={createCredential} disabled={creating} className="gap-1.5">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Generate key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Issued secret dialog (shown once) */}
      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" /> API key created
            </DialogTitle>
            <DialogDescription>
              Copy the secret now — it will not be shown again. Store it in your Saga agent configuration.
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="space-y-3 py-2">
              <CredentialField label="x-api-key" value={issued.keyId} onCopy={copy} />
              <CredentialField label="x-api-username" value={issued.username} onCopy={copy} />
              <CredentialField label="x-api-secret" value={issued.secret} onCopy={copy} highlight />
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CredentialField({
  label,
  value,
  onCopy,
  highlight,
}: {
  label: string
  value: string
  onCopy: (text: string, label: string) => void
  highlight?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code
          className={`flex-1 text-xs px-2 py-1.5 rounded border break-all ${
            highlight ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-muted border-border/50"
          }`}
        >
          {value}
        </code>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onCopy(value, label)}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
