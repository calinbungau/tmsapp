"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  Clock,
  FileWarning,
  Globe,
  Info,
  Loader2,
  Mail,
  Package,
  Play,
  Plus,
  Receipt,
  Route,
  Settings,
  ShieldAlert,
  Smartphone,
  Truck,
  Wrench,
  X,
} from "lucide-react";

interface ActionCenterDefinition {
  id: string;
  admin_id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  is_enabled: boolean;
  default_assignee_role: string | null;
  severity_matrix: Record<string, any> | null;
  thresholds: Record<string, any> | null;
  notify_channels: string[];
  email_recipients: string[];
  escalation_after_hours: number | null;
  // Reminder schedule fields
  reminder_offsets_before: number[];
  reminder_daily_after_due: boolean;
  reminder_daily_max_days: number;
  send_window: "immediate" | "business_hours";
  business_hours_start: string;
  business_hours_end: string;
  skip_weekends: boolean;
  timezone: string;
  digest_mode: boolean;
  escalation_role: string | null;
  min_hours_between_emails: number;
  created_at: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Package; color: string }> = {
  orders: { label: "Orders", icon: Package, color: "bg-blue-500/20 text-blue-400" },
  trips: { label: "Trips", icon: Route, color: "bg-green-500/20 text-green-400" },
  finance: { label: "Finance", icon: Receipt, color: "bg-purple-500/20 text-purple-400" },
  fleet: { label: "Fleet", icon: Truck, color: "bg-cyan-500/20 text-cyan-400" },
  compliance: { label: "Compliance", icon: ShieldAlert, color: "bg-amber-500/20 text-amber-400" },
};

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-500/20 text-red-400" },
  high: { label: "High", color: "bg-orange-500/20 text-orange-400" },
  medium: { label: "Medium", color: "bg-yellow-500/20 text-yellow-400" },
  low: { label: "Low", color: "bg-blue-500/20 text-blue-400" },
};

const ROLE_OPTIONS = [
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "manager", label: "Manager" },
  { value: "fleet", label: "Fleet" },
  { value: "compliance", label: "Compliance" },
];

const TIMEZONE_OPTIONS = [
  { value: "Europe/Bucharest", label: "Bucharest (EET/EEST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "UTC", label: "UTC" },
];

const DEFAULT_OFFSETS = [30, 14, 7, 3, 1, 0];

export default function ActionCenterSettingsPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [definitions, setDefinitions] = useState<ActionCenterDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ totalUpserted: number; durationMs: number } | null>(
    null
  );
  // Local state for the per-rule email-input fields. Keyed by definition id
  // so multiple rules can be edited independently without one rule's pending
  // text leaking into another.
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  // Local state for the offset-day input per rule
  const [offsetInputs, setOffsetInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchDefinitions = useCallback(async () => {
    if (!adminSession?.id) return;

    const res = await fetch(`/api/admin/action-center/definitions?admin_id=${adminSession.id}`);
    const data = await res.json();
    setDefinitions(data.definitions || []);
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => {
    if (adminSession?.id) {
      fetchDefinitions();
    }
  }, [adminSession?.id, fetchDefinitions]);

  const handleUpdate = async (defId: string, updates: Partial<ActionCenterDefinition>) => {
    if (!adminSession?.id) return;

    setSaving(defId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/action-center/definitions?admin_id=${adminSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition_id: defId, ...updates }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      // Update local state
      setDefinitions((prev) =>
        prev.map((d) => (d.id === defId ? { ...d, ...updates } : d))
      );

      setMessage({ type: "success", text: "Settings saved" });
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = async (def: ActionCenterDefinition) => {
    await handleUpdate(def.id, { is_enabled: !def.is_enabled });
  };

  const handleThresholdChange = async (def: ActionCenterDefinition, key: string, value: number) => {
    const newThresholds = { ...(def.thresholds || {}), [key]: value };
    await handleUpdate(def.id, { thresholds: newThresholds });
  };

  const handleRoleChange = async (def: ActionCenterDefinition, role: string) => {
    await handleUpdate(def.id, { default_assignee_role: role || null });
  };

  const channelsOf = (def: ActionCenterDefinition): string[] => {
    const c = def.notify_channels as any;
    if (Array.isArray(c)) return c;
    if (c && typeof c === "object") return Object.keys(c).filter((k) => c[k]);
    return [];
  };

  const handleChannelToggle = async (def: ActionCenterDefinition, channel: string) => {
    const currentChannels = channelsOf(def);
    const newChannels = currentChannels.includes(channel)
      ? currentChannels.filter((c) => c !== channel)
      : [...currentChannels, channel];
    await handleUpdate(def.id, { notify_channels: newChannels });
  };

  // ----- Custom email recipients ----------------------------------
  // Stored as a JSONB array on the definition. Backend column was
  // added in scripts/200_action_center_email_recipients.sql.
  const recipientsOf = (def: ActionCenterDefinition): string[] => {
    const r = def.email_recipients as any;
    if (Array.isArray(r)) return r.filter((e) => typeof e === "string" && e);
    return [];
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleAddRecipient = async (def: ActionCenterDefinition) => {
    const raw = (emailInputs[def.id] || "").trim();
    if (!raw) return;
    // Allow comma- or semicolon-separated bulk paste so users can drop
    // a contact list straight in.
    const incoming = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const existing = recipientsOf(def);
    const existingLower = new Set(existing.map((e) => e.toLowerCase()));
    const additions: string[] = [];
    const invalid: string[] = [];
    for (const email of incoming) {
      if (!isValidEmail(email)) {
        invalid.push(email);
        continue;
      }
      if (existingLower.has(email.toLowerCase())) continue;
      additions.push(email);
      existingLower.add(email.toLowerCase());
    }

    if (invalid.length > 0) {
      setMessage({ type: "error", text: `Invalid email${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}` });
      setTimeout(() => setMessage(null), 3500);
    }
    if (additions.length === 0) {
      // Still clear the input if everything was duplicate.
      if (invalid.length === 0) setEmailInputs((prev) => ({ ...prev, [def.id]: "" }));
      return;
    }

    const next = [...existing, ...additions];
    setEmailInputs((prev) => ({ ...prev, [def.id]: "" }));
    await handleUpdate(def.id, { email_recipients: next });
  };

  const handleRemoveRecipient = async (def: ActionCenterDefinition, email: string) => {
    const next = recipientsOf(def).filter((e) => e.toLowerCase() !== email.toLowerCase());
    await handleUpdate(def.id, { email_recipients: next });
  };

  // ----- Manual run ------------------------------------------------
  // Vercel's cron schedule only kicks in for production deployments and
  // tasks tick once every 5 minutes. The "Run now" button triggers the
  // same orchestrator immediately so admins can verify a brand-new
  // expired document, overdue maintenance, etc. surfaces without
  // waiting for the next tick.
  const handleRunDetectors = async () => {
    if (!adminSession?.id || running) return;
    setRunning(true);
    setRunResult(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/action-center/run-detectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_id: adminSession.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to run detectors");
      setRunResult({
        totalUpserted: data.totalUpserted ?? 0,
        durationMs: data.durationMs ?? 0,
      });
      setMessage({
        type: "success",
        text: `Detectors finished in ${Math.max(1, Math.round((data.durationMs ?? 0) / 100) / 10)}s — ${data.totalUpserted ?? 0} item(s) created/updated.`,
      });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to run detectors" });
    } finally {
      setRunning(false);
    }
  };

  // ----- Reminder offset helpers -----------------------------------
  const offsetsOf = (def: ActionCenterDefinition): number[] => {
    const r = def.reminder_offsets_before as any;
    if (Array.isArray(r)) return r.filter((n) => typeof n === "number").sort((a, b) => b - a);
    return DEFAULT_OFFSETS;
  };

  const handleAddOffset = async (def: ActionCenterDefinition) => {
    const raw = (offsetInputs[def.id] || "").trim();
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 0 || num > 365) {
      setMessage({ type: "error", text: "Enter a valid number of days (0-365)" });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    const existing = offsetsOf(def);
    if (existing.includes(num)) {
      setOffsetInputs((prev) => ({ ...prev, [def.id]: "" }));
      return;
    }
    const next = [...existing, num].sort((a, b) => b - a);
    setOffsetInputs((prev) => ({ ...prev, [def.id]: "" }));
    await handleUpdate(def.id, { reminder_offsets_before: next });
  };

  const handleRemoveOffset = async (def: ActionCenterDefinition, offset: number) => {
    const next = offsetsOf(def).filter((n) => n !== offset);
    await handleUpdate(def.id, { reminder_offsets_before: next });
  };

  const handleResetOffsets = async (def: ActionCenterDefinition) => {
    await handleUpdate(def.id, { reminder_offsets_before: DEFAULT_OFFSETS });
  };

  // Group definitions by category
  const defsByCategory = definitions.reduce((acc, def) => {
    const cat = def.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(def);
    return acc;
  }, {} as Record<string, ActionCenterDefinition[]>);

  if (sessionLoading || loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/action-center">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Action Center Settings</h1>
          <p className="text-muted-foreground">
            Configure detection rules, thresholds, and notification preferences
          </p>
        </div>
        <Button onClick={handleRunDetectors} disabled={running} variant="outline">
          {running ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {running ? "Running..." : "Run detectors now"}
        </Button>
      </div>

      {/* Notification timing explainer */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="p-2 rounded-lg bg-primary/15 h-fit">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 space-y-2 text-sm">
              <p className="font-medium text-foreground">When are notifications sent?</p>
              <ul className="space-y-1 text-muted-foreground list-disc pl-4">
                <li>
                  Detectors run every <span className="font-medium text-foreground">5 minutes</span>{" "}
                  on production deployments via Vercel Cron. New items are created or updated
                  automatically. Use <span className="font-medium text-foreground">&ldquo;Run detectors now&rdquo;</span>{" "}
                  above to trigger them immediately for testing.
                </li>
                <li>
                  <span className="font-medium text-foreground">In-App</span>: shown immediately in
                  the sidebar badge and Action Center inbox the moment a detector fires.
                </li>
                <li>
                  <span className="font-medium text-foreground">Email</span>: when enabled, sent to
                  users with the assignee role <em>plus</em> any custom recipients you list per
                  rule. Snoozed/dismissed items don&apos;t re-trigger emails. (Email worker is being
                  rolled out — channel preferences and recipients are stored now and will be used
                  as soon as it ships.)
                </li>
                <li>
                  <span className="font-medium text-foreground">Push</span>: sent for{" "}
                  <span className="font-medium text-foreground">critical</span> &{" "}
                  <span className="font-medium text-foreground">high</span> severity items only,
                  delivered to devices where the user has push enabled.
                </li>
                <li>
                  <span className="font-medium text-foreground">Escalation</span>: if an item stays
                  open past the configured hours, it escalates (assignee role widens, severity may
                  increase, and a follow-up notification is sent).
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Success/Error Message */}
      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            message.type === "success"
              ? "bg-green-500/20 text-green-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Rules by Category */}
      {Object.entries(defsByCategory).map(([category, defs]) => {
        const catConfig = CATEGORY_CONFIG[category] || {
          label: category,
          icon: AlertCircle,
          color: "bg-muted text-muted-foreground",
        };
        const CatIcon = catConfig.icon;

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${catConfig.color.split(" ")[0]}`}>
                  <CatIcon className={`h-4 w-4 ${catConfig.color.split(" ")[1]}`} />
                </div>
                {catConfig.label} Rules
              </CardTitle>
              <CardDescription>
                Configure alerts related to {catConfig.label.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="space-y-2">
                {defs.map((def) => (
                  <AccordionItem
                    key={def.id}
                    value={def.id}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center gap-4 flex-1 text-left">
                        <Switch
                          checked={def.is_enabled}
                          onCheckedChange={() => handleToggle(def)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{def.title}</p>
                          {def.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {def.description}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {def.code}
                        </Badge>
                        {saving === def.id && (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-4">
                      <div className="space-y-6 pl-12">
                        {/* Thresholds */}
                        {def.code === "STALE_ORDER" && (
                          <div className="space-y-3">
                            <Label>Days without update threshold</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.days_stale || 3]}
                                min={1}
                                max={14}
                                step={1}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "days_stale", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-16 text-right">
                                {def.thresholds?.days_stale || 3} days
                              </span>
                            </div>
                          </div>
                        )}

                        {def.code === "TRIP_NO_DRIVER" && (
                          <div className="space-y-3">
                            <Label>Hours before departure threshold</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.hours_before || 24]}
                                min={1}
                                max={72}
                                step={1}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "hours_before", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-20 text-right">
                                {def.thresholds?.hours_before || 24} hours
                              </span>
                            </div>
                          </div>
                        )}

                        {def.code === "TRIP_NO_VEHICLE" && (
                          <div className="space-y-3">
                            <Label>Hours before departure threshold</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.hours_before || 24]}
                                min={1}
                                max={72}
                                step={1}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "hours_before", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-20 text-right">
                                {def.thresholds?.hours_before || 24} hours
                              </span>
                            </div>
                          </div>
                        )}

                        {def.code === "MISSING_POD" && (
                          <div className="space-y-3">
                            <Label>Hours after delivery threshold</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.hours_after || 48]}
                                min={12}
                                max={168}
                                step={12}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "hours_after", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-20 text-right">
                                {def.thresholds?.hours_after || 48} hours
                              </span>
                            </div>
                          </div>
                        )}

                        {def.code === "UNINVOICED_TRIP" && (
                          <div className="space-y-3">
                            <Label>Days after completion threshold</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.days_after || 7]}
                                min={1}
                                max={30}
                                step={1}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "days_after", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-16 text-right">
                                {def.thresholds?.days_after || 7} days
                              </span>
                            </div>
                          </div>
                        )}

                        {def.code === "UNPAID_INVOICE" && (
                          <div className="space-y-3">
                            <Label>Days overdue threshold</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.days_overdue || 7]}
                                min={1}
                                max={60}
                                step={1}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "days_overdue", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-16 text-right">
                                {def.thresholds?.days_overdue || 7} days
                              </span>
                            </div>
                          </div>
                        )}

                        {def.code === "document.expiring" && (
                          <div className="space-y-3">
                            <Label>Look-ahead window</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[def.thresholds?.window_days || 60]}
                                min={7}
                                max={180}
                                step={1}
                                onValueCommit={(v) =>
                                  handleThresholdChange(def, "window_days", v[0])
                                }
                                className="flex-1"
                                disabled={!def.is_enabled}
                              />
                              <span className="text-sm font-medium w-20 text-right">
                                {def.thresholds?.window_days || 60} days
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Severity: <span className="text-red-400">Critical</span> when expired,{" "}
                              <span className="text-orange-400">High</span> within 7 days,{" "}
                              <span className="text-yellow-400">Medium</span> within 30 days.
                            </p>
                          </div>
                        )}

                        {def.code === "maintenance.due_or_overdue" && (
                          <div className="space-y-4">
                            <div className="space-y-3">
                              <Label>Date look-ahead window</Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[def.thresholds?.date_window_days || 30]}
                                  min={3}
                                  max={90}
                                  step={1}
                                  onValueCommit={(v) =>
                                    handleThresholdChange(def, "date_window_days", v[0])
                                  }
                                  className="flex-1"
                                  disabled={!def.is_enabled}
                                />
                                <span className="text-sm font-medium w-20 text-right">
                                  {def.thresholds?.date_window_days || 30} days
                                </span>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <Label>Mileage look-ahead window</Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[def.thresholds?.km_window || 1000]}
                                  min={100}
                                  max={5000}
                                  step={100}
                                  onValueCommit={(v) =>
                                    handleThresholdChange(def, "km_window", v[0])
                                  }
                                  className="flex-1"
                                  disabled={!def.is_enabled}
                                />
                                <span className="text-sm font-medium w-20 text-right">
                                  {def.thresholds?.km_window || 1000} km
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Severity: <span className="text-red-400">Critical</span> when overdue,{" "}
                              <span className="text-orange-400">High</span> within 3 days or 500 km,{" "}
                              <span className="text-yellow-400">Medium</span> within 14 days.
                            </p>
                          </div>
                        )}

                        {/* Default Assignee Role */}
                        <div className="space-y-3">
                          <Label>Default Assignee Role</Label>
                          <Select
                            value={def.default_assignee_role || "__none__"}
                            onValueChange={(v) => handleRoleChange(def, v === "__none__" ? "" : v)}
                            disabled={!def.is_enabled}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="No default role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No default role</SelectItem>
                              {ROLE_OPTIONS.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            New items will be assigned to users with this role
                          </p>
                        </div>

                        {/* Notification Channels */}
                        <div className="space-y-3">
                          <Label>Notification Channels</Label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={
                                channelsOf(def).includes("in_app") ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => handleChannelToggle(def, "in_app")}
                              disabled={!def.is_enabled}
                            >
                              <Bell className="h-4 w-4 mr-1" />
                              In-App
                            </Button>
                            <Button
                              variant={
                                channelsOf(def).includes("email") ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => handleChannelToggle(def, "email")}
                              disabled={!def.is_enabled}
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              Email
                            </Button>
                            <Button
                              variant={
                                channelsOf(def).includes("push") ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => handleChannelToggle(def, "push")}
                              disabled={!def.is_enabled}
                            >
                              <Smartphone className="h-4 w-4 mr-1" />
                              Push
                            </Button>
                          </div>
                        </div>

                        {/* Custom Email Recipients */}
                        {channelsOf(def).includes("email") && (
                          <div className="space-y-3">
                            <Label>Custom email recipients</Label>
                            <p className="text-xs text-muted-foreground">
                              Extra addresses notified for this rule, in addition to users with the
                              assignee role above. Useful for routing e.g. expiring documents to a
                              compliance officer or external accountant.
                            </p>
                            {recipientsOf(def).length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {recipientsOf(def).map((email) => (
                                  <Badge
                                    key={email}
                                    variant="secondary"
                                    className="gap-1 pl-2 pr-1 py-1"
                                  >
                                    <Mail className="h-3 w-3 opacity-70" />
                                    <span className="text-xs">{email}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRecipient(def, email)}
                                      disabled={!def.is_enabled || saving === def.id}
                                      className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 disabled:opacity-50"
                                      aria-label={`Remove ${email}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 max-w-md">
                              <Input
                                type="email"
                                placeholder="name@company.com"
                                value={emailInputs[def.id] || ""}
                                onChange={(e) =>
                                  setEmailInputs((prev) => ({
                                    ...prev,
                                    [def.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddRecipient(def);
                                  }
                                }}
                                disabled={!def.is_enabled || saving === def.id}
                                className="h-9"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddRecipient(def)}
                                disabled={
                                  !def.is_enabled ||
                                  saving === def.id ||
                                  !(emailInputs[def.id] || "").trim()
                                }
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Tip: paste multiple addresses separated by commas to add at once.
                            </p>
                          </div>
                        )}

                        {/* Escalation */}
                        <div className="space-y-3">
                          <Label>Escalate if unresolved after</Label>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[def.escalation_after_hours || 0]}
                              min={0}
                              max={72}
                              step={4}
                              onValueCommit={(v) =>
                                handleUpdate(def.id, { escalation_after_hours: v[0] || null })
                              }
                              className="flex-1 max-w-[200px]"
                              disabled={!def.is_enabled}
                            />
                            <span className="text-sm font-medium w-24 text-right">
                              {def.escalation_after_hours
                                ? `${def.escalation_after_hours} hours`
                                : "Disabled"}
                            </span>
                          </div>
                          {def.escalation_after_hours && def.escalation_after_hours > 0 && (
                            <div className="space-y-2">
                              <Label className="text-xs">Escalation role (CC&apos;d after timeout)</Label>
                              <Select
                                value={def.escalation_role || "__none__"}
                                onValueChange={(v) =>
                                  handleUpdate(def.id, { escalation_role: v === "__none__" ? null : v })
                                }
                                disabled={!def.is_enabled}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No escalation role</SelectItem>
                                  {ROLE_OPTIONS.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                      {role.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Reminder Schedule */}
                        {channelsOf(def).includes("email") && (
                          <div className="space-y-4 pt-4 border-t">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-base font-medium">Reminder Schedule</Label>
                            </div>
                            
                            {/* Reminder offsets */}
                            <div className="space-y-3">
                              <Label className="text-sm">Days before due to send reminders</Label>
                              <div className="flex flex-wrap gap-2">
                                {offsetsOf(def).map((offset) => (
                                  <Badge
                                    key={offset}
                                    variant="secondary"
                                    className="gap-1 pl-2 pr-1 py-1"
                                  >
                                    <span className="text-xs">
                                      {offset === 0 ? "On due day" : `${offset}d before`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOffset(def, offset)}
                                      disabled={!def.is_enabled || saving === def.id}
                                      className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 disabled:opacity-50"
                                      aria-label={`Remove ${offset} day offset`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={365}
                                  placeholder="Days"
                                  value={offsetInputs[def.id] || ""}
                                  onChange={(e) =>
                                    setOffsetInputs((prev) => ({ ...prev, [def.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddOffset(def);
                                    }
                                  }}
                                  disabled={!def.is_enabled || saving === def.id}
                                  className="h-9 w-20"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddOffset(def)}
                                  disabled={!def.is_enabled || saving === def.id || !(offsetInputs[def.id] || "").trim()}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleResetOffsets(def)}
                                  disabled={!def.is_enabled || saving === def.id}
                                >
                                  Reset
                                </Button>
                              </div>
                            </div>

                            {/* Daily overdue reminders */}
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-sm">Daily reminders after overdue</Label>
                                <p className="text-xs text-muted-foreground">
                                  Send daily emails once item is past due
                                </p>
                              </div>
                              <Switch
                                checked={def.reminder_daily_after_due ?? true}
                                onCheckedChange={(checked) =>
                                  handleUpdate(def.id, { reminder_daily_after_due: checked })
                                }
                                disabled={!def.is_enabled}
                              />
                            </div>

                            {(def.reminder_daily_after_due ?? true) && (
                              <div className="space-y-2 pl-4 border-l-2 border-muted">
                                <Label className="text-xs">Stop daily reminders after</Label>
                                <div className="flex items-center gap-4">
                                  <Slider
                                    value={[def.reminder_daily_max_days ?? 14]}
                                    min={1}
                                    max={30}
                                    step={1}
                                    onValueCommit={(v) =>
                                      handleUpdate(def.id, { reminder_daily_max_days: v[0] })
                                    }
                                    className="flex-1 max-w-[150px]"
                                    disabled={!def.is_enabled}
                                  />
                                  <span className="text-sm w-20">
                                    {def.reminder_daily_max_days ?? 14} days
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Business hours */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <Label className="text-sm">Respect business hours</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Only send emails during work hours
                                  </p>
                                </div>
                                <Switch
                                  checked={def.send_window === "business_hours"}
                                  onCheckedChange={(checked) =>
                                    handleUpdate(def.id, { send_window: checked ? "business_hours" : "immediate" })
                                  }
                                  disabled={!def.is_enabled}
                                />
                              </div>

                              {def.send_window === "business_hours" && (
                                <div className="space-y-3 pl-4 border-l-2 border-muted">
                                  <div className="flex items-center gap-3">
                                    <div className="space-y-1">
                                      <Label className="text-xs">Start</Label>
                                      <Input
                                        type="time"
                                        value={def.business_hours_start || "08:00"}
                                        onChange={(e) =>
                                          handleUpdate(def.id, { business_hours_start: e.target.value })
                                        }
                                        disabled={!def.is_enabled}
                                        className="w-28 h-8"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">End</Label>
                                      <Input
                                        type="time"
                                        value={def.business_hours_end || "18:00"}
                                        onChange={(e) =>
                                          handleUpdate(def.id, { business_hours_end: e.target.value })
                                        }
                                        disabled={!def.is_enabled}
                                        className="w-28 h-8"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Skip weekends</Label>
                                    <Switch
                                      checked={def.skip_weekends ?? true}
                                      onCheckedChange={(checked) =>
                                        handleUpdate(def.id, { skip_weekends: checked })
                                      }
                                      disabled={!def.is_enabled}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs flex items-center gap-1">
                                      <Globe className="h-3 w-3" /> Timezone
                                    </Label>
                                    <Select
                                      value={def.timezone || "Europe/Bucharest"}
                                      onValueChange={(v) => handleUpdate(def.id, { timezone: v })}
                                      disabled={!def.is_enabled}
                                    >
                                      <SelectTrigger className="w-[200px] h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {TIMEZONE_OPTIONS.map((tz) => (
                                          <SelectItem key={tz.value} value={tz.value}>
                                            {tz.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Email cooldown */}
                            <div className="space-y-2">
                              <Label className="text-sm">Minimum hours between emails</Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[def.min_hours_between_emails ?? 20]}
                                  min={1}
                                  max={48}
                                  step={1}
                                  onValueCommit={(v) =>
                                    handleUpdate(def.id, { min_hours_between_emails: v[0] })
                                  }
                                  className="flex-1 max-w-[150px]"
                                  disabled={!def.is_enabled}
                                />
                                <span className="text-sm w-20">
                                  {def.min_hours_between_emails ?? 20}h
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Prevents multiple emails on the same day for the same item
                              </p>
                            </div>

                            {/* Digest mode */}
                            <div className="flex items-center justify-between pt-2 border-t">
                              <div>
                                <Label className="text-sm">Daily digest mode</Label>
                                <p className="text-xs text-muted-foreground">
                                  Batch all items into one daily summary at 09:00
                                </p>
                              </div>
                              <Switch
                                checked={def.digest_mode ?? false}
                                onCheckedChange={(checked) =>
                                  handleUpdate(def.id, { digest_mode: checked })
                                }
                                disabled={!def.is_enabled}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        );
      })}

      {definitions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No rules configured</p>
            <p className="text-muted-foreground">
              Rules will appear here after the first detector run
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
