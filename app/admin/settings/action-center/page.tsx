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
  Check,
  Clock,
  Loader2,
  Mail,
  Package,
  Receipt,
  Route,
  Settings,
  Truck,
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
  escalation_after_hours: number | null;
  created_at: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Package; color: string }> = {
  orders: { label: "Orders", icon: Package, color: "bg-blue-500/20 text-blue-400" },
  trips: { label: "Trips", icon: Route, color: "bg-green-500/20 text-green-400" },
  finance: { label: "Finance", icon: Receipt, color: "bg-purple-500/20 text-purple-400" },
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
];

export default function ActionCenterSettingsPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [definitions, setDefinitions] = useState<ActionCenterDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
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
        <div>
          <h1 className="text-2xl font-bold">Action Center Settings</h1>
          <p className="text-muted-foreground">
            Configure detection rules, thresholds, and notification preferences
          </p>
        </div>
      </div>

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
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              Push
                            </Button>
                          </div>
                        </div>

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
                        </div>
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
