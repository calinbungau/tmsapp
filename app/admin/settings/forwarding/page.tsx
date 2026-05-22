"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, ArrowLeftRight, Bell, Check, DollarSign, FileText,
  Globe, Percent, Save, Settings, Truck, AlertTriangle, Building2,
  Palette, Eye, Loader2,
} from "lucide-react";

interface ForwarderSettings {
  profit_display_currency: string;
  default_carrier_currency: string;
  default_payment_terms_days: number;
  order_prefix: string;
  margin_warning_threshold: number;
  margin_danger_threshold: number;
  default_carrier_id: string | null;
  email_notifications: {
    on_carrier_assign: boolean;
    on_status_change: boolean;
    on_delivery_complete: boolean;
  };
  order_template: {
    show_company_logo: boolean;
    show_cargo_details: boolean;
    show_payment_terms: boolean;
    footer_text: string;
    language: string;
  };
}

const DEFAULT_SETTINGS: ForwarderSettings = {
  profit_display_currency: "EUR",
  default_carrier_currency: "EUR",
  default_payment_terms_days: 30,
  order_prefix: "FWD",
  margin_warning_threshold: 10,
  margin_danger_threshold: 5,
  default_carrier_id: null,
  email_notifications: { on_carrier_assign: true, on_status_change: true, on_delivery_complete: true },
  order_template: { show_company_logo: true, show_cargo_details: true, show_payment_terms: true, footer_text: "", language: "en" },
};

const CURRENCIES = [
  { value: "EUR", label: "EUR - Euro" },
  { value: "RON", label: "RON - Romanian Leu" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "CHF", label: "CHF - Swiss Franc" },
  { value: "PLN", label: "PLN - Polish Zloty" },
  { value: "CZK", label: "CZK - Czech Koruna" },
  { value: "HUF", label: "HUF - Hungarian Forint" },
  { value: "SEK", label: "SEK - Swedish Krona" },
  { value: "NOK", label: "NOK - Norwegian Krone" },
  { value: "DKK", label: "DKK - Danish Krone" },
  { value: "BGN", label: "BGN - Bulgarian Lev" },
  { value: "HRK", label: "HRK - Croatian Kuna" },
  { value: "RSD", label: "RSD - Serbian Dinar" },
  { value: "TRY", label: "TRY - Turkish Lira" },
  { value: "UAH", label: "UAH - Ukrainian Hryvnia" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ro", label: "Romanian" },
  { value: "de", label: "German" },
  { value: "hu", label: "Hungarian" },
  { value: "pl", label: "Polish" },
  { value: "cs", label: "Czech" },
  { value: "sk", label: "Slovak" },
  { value: "bg", label: "Bulgarian" },
  { value: "hr", label: "Croatian" },
  { value: "sr", label: "Serbian" },
  { value: "tr", label: "Turkish" },
  { value: "fr", label: "French" },
  { value: "it", label: "Italian" },
  { value: "es", label: "Spanish" },
];

export default function ForwarderSettingsPage() {
  const { session: adminSession } = useAdminSession();
  const [settings, setSettings] = useState<ForwarderSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [carriers, setCarriers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!adminSession?.id) return;
    const s = createClient();
    Promise.all([
      s.from("admins").select("forwarder_settings").eq("id", adminSession.id).single(),
      s.from("business_partners").select("id, name").eq("admin_id", adminSession.id).contains("partner_type", ["carrier"]),
    ]).then(([settingsRes, carriersRes]) => {
      if (settingsRes.data?.forwarder_settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...settingsRes.data.forwarder_settings });
      }
      if (carriersRes.data) setCarriers(carriersRes.data);
      setLoading(false);
    });
  }, [adminSession?.id]);

  const handleSave = async () => {
    if (!adminSession?.id) return;
    setSaving(true);
    const s = createClient();
    await s.from("admins").update({ forwarder_settings: settings }).eq("id", adminSession.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  function update<K extends keyof ForwarderSettings>(key: K, value: ForwarderSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function updateNotif(key: keyof ForwarderSettings["email_notifications"], value: boolean) {
    setSettings(prev => ({
      ...prev,
      email_notifications: { ...prev.email_notifications, [key]: value },
    }));
  }

  function updateTemplate(key: keyof ForwarderSettings["order_template"], value: any) {
    setSettings(prev => ({
      ...prev,
      order_template: { ...prev.order_template, [key]: value },
    }));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/settings">
              <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                Forwarder Configurator
              </h1>
              <p className="text-xs text-muted-foreground">Configure forwarding order settings, profit display, and templates</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ─── General Settings ──────────────────────────────── */}
        <SettingsCard
          icon={<DollarSign className="h-4 w-4 text-emerald-400" />}
          title="General Settings"
          description="Core configuration for your forwarding operations"
        >
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Profit Display Currency</Label>
              <p className="text-[10px] text-muted-foreground/60">All profit/margin values on the Forwarder Board will be shown in this currency</p>
              <Select value={settings.profit_display_currency} onValueChange={v => update("profit_display_currency", v)}>
                <SelectTrigger className="h-9 text-sm bg-card/50 border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Default Carrier Currency</Label>
              <p className="text-[10px] text-muted-foreground/60">Pre-filled currency when adding carrier costs to orders</p>
              <Select value={settings.default_carrier_currency} onValueChange={v => update("default_carrier_currency", v)}>
                <SelectTrigger className="h-9 text-sm bg-card/50 border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Default Payment Terms (days)</Label>
              <p className="text-[10px] text-muted-foreground/60">Standard payment terms applied to new forwarding orders</p>
              <Input
                type="number" min={0} max={365}
                value={settings.default_payment_terms_days}
                onChange={e => update("default_payment_terms_days", parseInt(e.target.value) || 30)}
                className="h-9 text-sm bg-card/50 border-border/50 w-32"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Order Auto-Numbering Prefix</Label>
              <p className="text-[10px] text-muted-foreground/60">Prefix for forwarding order reference numbers (e.g., FWD-20260001)</p>
              <Input
                value={settings.order_prefix}
                onChange={e => update("order_prefix", e.target.value.toUpperCase())}
                maxLength={6}
                className="h-9 text-sm bg-card/50 border-border/50 w-32 font-mono"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label className="text-xs font-medium">Default Carrier</Label>
              <p className="text-[10px] text-muted-foreground/60">Pre-select a carrier when creating new forwarding orders</p>
              <Select value={settings.default_carrier_id || "none"} onValueChange={v => update("default_carrier_id", v === "none" ? null : v)}>
                <SelectTrigger className="h-9 text-sm bg-card/50 border-border/50 max-w-sm"><SelectValue placeholder="None (select manually)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (select manually)</SelectItem>
                  {carriers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SettingsCard>

        {/* ─── Margin Thresholds ─────────────────────────────── */}
        <SettingsCard
          icon={<Percent className="h-4 w-4 text-amber-400" />}
          title="Margin Thresholds"
          description="Configure how profit margins are color-coded on the board"
        >
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-2">
                Warning Threshold
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              </Label>
              <p className="text-[10px] text-muted-foreground/60">Orders below this margin % are shown in amber</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step={1}
                  value={settings.margin_warning_threshold}
                  onChange={e => update("margin_warning_threshold", parseInt(e.target.value) || 10)}
                  className="h-9 text-sm bg-card/50 border-border/50 w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-2">
                Danger Threshold
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              </Label>
              <p className="text-[10px] text-muted-foreground/60">Orders below this margin % are shown in red</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step={1}
                  value={settings.margin_danger_threshold}
                  onChange={e => update("margin_danger_threshold", parseInt(e.target.value) || 5)}
                  className="h-9 text-sm bg-card/50 border-border/50 w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          {/* Visual preview */}
          <div className="mt-6 p-4 rounded-lg border border-border/30 bg-background/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Preview</p>
            <div className="flex items-center gap-4">
              <MarginPreviewItem label="Healthy" example={`>${settings.margin_warning_threshold}%`} color="text-emerald-400" bgColor="bg-emerald-500" value={25} />
              <MarginPreviewItem label="Warning" example={`${settings.margin_danger_threshold}-${settings.margin_warning_threshold}%`} color="text-amber-400" bgColor="bg-amber-500" value={Math.max(settings.margin_danger_threshold, 3)} />
              <MarginPreviewItem label="Danger" example={`<${settings.margin_danger_threshold}%`} color="text-red-400" bgColor="bg-red-500" value={Math.max(settings.margin_danger_threshold - 2, 1)} />
            </div>
          </div>
        </SettingsCard>

        {/* ─── Email Notifications ───────────────────────────── */}
        <SettingsCard
          icon={<Bell className="h-4 w-4 text-blue-400" />}
          title="Email Notifications"
          description="Automated email alerts for forwarding order events"
        >
          <div className="space-y-4">
            <NotificationToggle
              label="Carrier Assignment"
              description="Send notification when a carrier is assigned to a forwarding order"
              checked={settings.email_notifications.on_carrier_assign}
              onChange={v => updateNotif("on_carrier_assign", v)}
            />
            <NotificationToggle
              label="Status Change"
              description="Send notification when a forwarding order status changes"
              checked={settings.email_notifications.on_status_change}
              onChange={v => updateNotif("on_status_change", v)}
            />
            <NotificationToggle
              label="Delivery Complete"
              description="Send notification when a forwarding order is delivered"
              checked={settings.email_notifications.on_delivery_complete}
              onChange={v => updateNotif("on_delivery_complete", v)}
            />
          </div>
        </SettingsCard>

        {/* ─── Order Template Builder ────────────────────────── */}
        <SettingsCard
          icon={<FileText className="h-4 w-4 text-violet-400" />}
          title="Order Template"
          description="Design your forwarding order document with the visual builder"
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Use the drag-and-drop template builder to design your carrier order document. Add blocks like company header, route info, stops table, financials, signatures, and more. The document auto-paginates when stops overflow.
            </p>
            <Link href="/admin/settings/forwarding/template">
              <Button variant="outline" className="gap-2 h-9 text-xs border-primary/30 text-primary hover:bg-primary/5">
                <Palette className="h-3.5 w-3.5" />
                Open Template Builder
              </Button>
            </Link>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────
function SettingsCard({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function NotificationToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-muted-foreground/60">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TemplateToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className={`rounded-lg border p-3 cursor-pointer transition-all ${checked ? "border-primary/40 bg-primary/5" : "border-border/30 bg-card/20"}`} onClick={() => onChange(!checked)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
      </div>
      <p className="text-[10px] text-muted-foreground/60">{description}</p>
    </div>
  );
}

function MarginPreviewItem({ label, example, color, bgColor, value }: {
  label: string; example: string; color: string; bgColor: string; value: number;
}) {
  return (
    <div className="flex-1 rounded-lg border border-border/20 bg-card/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium">{label}</span>
        <span className={`text-xs font-bold ${color}`}>{example}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted-foreground/10 overflow-hidden">
        <div className={`h-full rounded-full ${bgColor}`} style={{ width: `${Math.min(value * 4, 100)}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground/40">Sample order</span>
        <span className={`text-[10px] font-semibold ${color}`}>+{value}% margin</span>
      </div>
    </div>
  );
}
