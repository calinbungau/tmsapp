"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Link2, CheckCircle2, XCircle, Loader2, Save, Plus, Trash2,
  Eye, EyeOff, RefreshCw, FileText, CreditCard, Building2, ExternalLink,
  AlertTriangle, Check, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { CostProvidersTab } from "@/components/finance/cost-providers-tab";
import { SagaIntegrationTab } from "@/components/finance/saga-integration-tab";

interface BillingIntegration {
  id: string;
  admin_id: string;
  provider: string;
  is_active: boolean;
  smartbill_email: string;
  smartbill_cif: string;
  smartbill_token: string | null;
  smartbill_default_series: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  created_at: string;
}

interface SmartbillSeries {
  id: string;
  admin_id: string;
  integration_id: string;
  series_name: string;
  series_type: string;
  is_default: boolean;
  smartbill_series_name: string;
  next_number: number | null;
  is_active: boolean;
}

export default function IntegrationsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { session: adminSession } = useAdminSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Smartbill state
  const [integration, setIntegration] = useState<BillingIntegration | null>(null);
  const [series, setSeries] = useState<SmartbillSeries[]>([]);
  const [showApiToken, setShowApiToken] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    api_username: "",
    api_token: "",
    company_vat_code: "",
    is_active: false,
  });

  // New series form
  const [newSeries, setNewSeries] = useState({
    series_name: "",
    series_type: "invoice" as string,
    smartbill_series_name: "",
    is_default: false,
  });
  const [showNewSeriesForm, setShowNewSeriesForm] = useState(false);

  // Fetch data
  useEffect(() => {
    if (adminSession?.id) {
      fetchData();
    }
  }, [adminSession?.id]);

  const fetchData = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    try {
      // Get Smartbill integration
      const { data: integrationData } = await supabase
        .from("billing_integrations")
        .select("*")
        .eq("admin_id", adminSession.id)
        .eq("provider", "smartbill")
        .single();

      if (integrationData) {
        setIntegration(integrationData);
        setFormData({
          api_username: integrationData.smartbill_email || "",
          api_token: "", // Never show stored token
          company_vat_code: integrationData.smartbill_cif || "",
          is_active: integrationData.is_active,
        });

        // Fetch series for this integration
        const { data: seriesData } = await supabase
          .from("smartbill_series")
          .select("*")
          .eq("integration_id", integrationData.id)
          .order("series_type", { ascending: true });

        setSeries(seriesData || []);
      }
    } catch (err) {
      console.error("Error fetching integrations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIntegration = async () => {
    if (!adminSession?.id) {
      toast({ title: "Not authenticated", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        admin_id: adminSession.id,
        provider: "smartbill",
        smartbill_email: formData.api_username,
        smartbill_cif: formData.company_vat_code,
        is_active: formData.is_active,
      };

      // Only update token if provided
      if (formData.api_token) {
        payload.smartbill_token = formData.api_token;
      }

      if (integration) {
        // Update existing
        const { error } = await supabase
          .from("billing_integrations")
          .update(payload)
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        // Insert new
        if (!formData.api_token) {
          toast({ title: "API Token is required", variant: "destructive" });
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("billing_integrations")
          .insert(payload);
        if (error) throw error;
      }

      toast({ title: "Smartbill settings saved" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!integration) {
      toast({ title: "Save settings first", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const response = await fetch("/api/smartbill/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: integration.id }),
      });
      const result = await response.json();

      if (result.success) {
        toast({ title: "Connection successful", description: `Connected to Smartbill for ${result.companyName}` });
        // Update sync status
        await supabase
          .from("billing_integrations")
          .update({ last_sync_status: "connected", last_sync_at: new Date().toISOString() })
          .eq("id", integration.id);
        fetchData();
      } else {
        toast({ title: "Connection failed", description: result.error, variant: "destructive" });
        await supabase
          .from("billing_integrations")
          .update({ last_sync_status: "error" })
          .eq("id", integration.id);
      }
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleFetchSeries = async () => {
    if (!integration || !adminSession?.id) return;
    setTesting(true);
    try {
      const response = await fetch("/api/smartbill/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: integration.id }),
      });
      const result = await response.json();

      if (result.success && result.series && result.series.length > 0) {
        let importedCount = 0;
        for (const s of result.series) {
          const { data: existing } = await supabase
            .from("smartbill_series")
            .select("id")
            .eq("integration_id", integration.id)
            .eq("series_name", s.name)
            .single();

          if (!existing) {
            let seriesType = "invoice";
            const nameLower = s.name.toLowerCase();
            if (s.type === "p" || nameLower.includes("proforma") || nameLower.includes("pf")) {
              seriesType = "proforma";
            } else if (s.type === "c" || nameLower.includes("storno")) {
              seriesType = "credit_note";
            } else if (nameLower.includes("aviz")) {
              seriesType = "aviz";
            } else if (nameLower.includes("chitanta") || nameLower.includes("receipt")) {
              seriesType = "receipt";
            }

            const { error } = await supabase.from("smartbill_series").insert({
              admin_id: adminSession.id,
              integration_id: integration.id,
              series_name: s.name,
              series_type: seriesType,
              next_number: s.nextNumber || 1,
              is_default: importedCount === 0 && seriesType === "invoice",
            });
            
            if (!error) importedCount++;
          }
        }

        toast({ 
          title: "Series imported", 
          description: `Imported ${importedCount} new series (${result.series.length} total found)` 
        });
        fetchData();
      } else if (result.success && (!result.series || result.series.length === 0)) {
        toast({ title: "No series found", description: "No invoice series found in Smartbill", variant: "destructive" });
      } else {
        toast({ title: "Fetch failed", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Fetch failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleAddSeries = async () => {
    if (!integration || !newSeries.series_name || !newSeries.smartbill_series_name) {
      toast({ title: "Fill all required fields", variant: "destructive" });
      return;
    }

    try {
      // If setting as default, unset other defaults of same type
      if (newSeries.is_default) {
        await supabase
          .from("smartbill_series")
          .update({ is_default: false })
          .eq("integration_id", integration.id)
          .eq("series_type", newSeries.series_type);
      }

      const { error } = await supabase.from("smartbill_series").insert({
        admin_id: adminSession?.id,
        integration_id: integration.id,
        series_name: newSeries.series_name,
        series_type: newSeries.series_type,
        smartbill_series_name: newSeries.smartbill_series_name,
        is_default: newSeries.is_default,
        is_active: true,
      });

      if (error) throw error;

      toast({ title: "Series added" });
      setNewSeries({ series_name: "", series_type: "invoice", smartbill_series_name: "", is_default: false });
      setShowNewSeriesForm(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Add failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteSeries = async (seriesId: string) => {
    if (!confirm("Delete this series?")) return;
    try {
      await supabase.from("smartbill_series").delete().eq("id", seriesId);
      toast({ title: "Series deleted" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSetDefaultSeries = async (seriesId: string, seriesType: string) => {
    if (!integration) return;
    try {
      // Unset all defaults of same type
      await supabase
        .from("smartbill_series")
        .update({ is_default: false })
        .eq("integration_id", integration.id)
        .eq("series_type", seriesType);

      // Set new default
      await supabase
        .from("smartbill_series")
        .update({ is_default: true })
        .eq("id", seriesId);

      toast({ title: "Default series updated" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect external services to your TMS</p>
        </div>
      </div>

      {/* Integration Categories */}
      <Tabs defaultValue="billing" className="space-y-4">
        <TabsList className="bg-muted/30 p-1">
          <TabsTrigger value="billing" className="text-xs md:text-sm gap-1.5">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="cost-providers" className="text-xs md:text-sm gap-1.5">
            <FileSpreadsheet className="h-4 w-4" />
            Cost Providers
          </TabsTrigger>
          <TabsTrigger value="saga" className="text-xs md:text-sm gap-1.5">
            <Building2 className="h-4 w-4" />
            Saga &amp; API
          </TabsTrigger>
          <TabsTrigger value="other" className="text-xs md:text-sm gap-1.5" disabled>
            <Link2 className="h-4 w-4" />
            Other
            <Badge variant="outline" className="text-[9px] ml-1">Soon</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cost-providers" className="space-y-4">
          <CostProvidersTab adminId={adminSession?.id ?? null} />
        </TabsContent>

        <TabsContent value="saga" className="space-y-4">
          <SagaIntegrationTab adminId={adminSession?.id ?? null} />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          {/* Smartbill Card */}
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Smartbill Header */}
            <div className="bg-muted/20 px-4 py-3 flex items-center justify-between border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                  SB
                </div>
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    Smartbill
                    {integration?.is_active && (
                      <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        Active
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground">Romanian e-invoicing & accounting</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {integration?.last_sync_status === "connected" && (
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </div>
                )}
                {integration?.last_sync_status === "error" && (
                  <div className="flex items-center gap-1.5 text-red-400 text-xs">
                    <XCircle className="h-3.5 w-3.5" />
                    Error
                  </div>
                )}
                <a
                  href="https://api.smartbill.ro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  API Docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Smartbill Form */}
            <div className="p-4 space-y-4">
              {/* Credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">API Username (Email)</Label>
                  <Input
                    type="email"
                    value={formData.api_username}
                    onChange={(e) => setFormData({ ...formData, api_username: e.target.value })}
                    placeholder="your@email.com"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">API Token</Label>
                  <div className="relative">
                    <Input
                      type={showApiToken ? "text" : "password"}
                      value={formData.api_token}
                      onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
                      placeholder={integration ? "•••••••••••���" : "Your API token"}
                      className="h-9 text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiToken(!showApiToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {integration && (
                    <p className="text-[10px] text-muted-foreground">Leave empty to keep existing token</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Company VAT Code (CIF)</Label>
                  <Input
                    value={formData.company_vat_code}
                    onChange={(e) => setFormData({ ...formData, company_vat_code: e.target.value })}
                    placeholder="RO12345678"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/10">
                  <div>
                    <p className="text-xs font-medium">Enable Integration</p>
                    <p className="text-[10px] text-muted-foreground">Auto-sync invoices to Smartbill</p>
                  </div>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                <Button
                  onClick={handleSaveIntegration}
                  disabled={saving || !formData.api_username || !formData.company_vat_code}
                  className="gap-1.5"
                  size="sm"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Settings
                </Button>
                {integration && (
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="gap-1.5"
                    size="sm"
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Test Connection
                  </Button>
                )}
              </div>
            </div>

            {/* Series Configuration */}
            {integration && (
              <div className="border-t border-border/50">
                <div className="px-4 py-3 bg-muted/10 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Invoice Series</h4>
                    <p className="text-xs text-muted-foreground">Configure invoice numbering series from Smartbill</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetchSeries}
                      disabled={testing}
                      className="gap-1.5 text-xs h-8"
                    >
                      <RefreshCw className={`h-3 w-3 ${testing ? "animate-spin" : ""}`} />
                      Fetch from Smartbill
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewSeriesForm(true)}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Plus className="h-3 w-3" />
                      Add Series
                    </Button>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  {/* New Series Form */}
                  {showNewSeriesForm && (
                    <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Display Name</Label>
                          <Input
                            value={newSeries.series_name}
                            onChange={(e) => setNewSeries({ ...newSeries, series_name: e.target.value })}
                            placeholder="Invoice Romania"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Type</Label>
                          <Select
                            value={newSeries.series_type}
                            onValueChange={(v) => setNewSeries({ ...newSeries, series_type: v })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="invoice">Invoice</SelectItem>
                              <SelectItem value="proforma">Proforma</SelectItem>
                              <SelectItem value="receipt">Receipt</SelectItem>
                              <SelectItem value="credit_note">Credit Note</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Smartbill Series Name</Label>
                          <Input
                            value={newSeries.smartbill_series_name}
                            onChange={(e) => setNewSeries({ ...newSeries, smartbill_series_name: e.target.value })}
                            placeholder="FCT"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newSeries.is_default}
                              onChange={(e) => setNewSeries({ ...newSeries, is_default: e.target.checked })}
                              className="rounded border-border"
                            />
                            Default
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleAddSeries} className="h-7 text-xs gap-1">
                          <Check className="h-3 w-3" />
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowNewSeriesForm(false)}
                          className="h-7 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Series List */}
                  {series.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No series configured yet</p>
                      <p className="text-xs">Add a series or fetch from Smartbill</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {series.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-medium ${
                              s.series_type === "invoice" ? "bg-blue-500/10 text-blue-400" :
                              s.series_type === "proforma" ? "bg-amber-500/10 text-amber-400" :
                              s.series_type === "credit_note" ? "bg-red-500/10 text-red-400" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {s.smartbill_series_name}
                            </div>
                            <div>
                              <p className="text-xs font-medium flex items-center gap-1.5">
                                {s.series_name}
                                {s.is_default && (
                                  <Badge variant="outline" className="text-[8px] px-1 py-0 bg-primary/10 text-primary border-primary/30">
                                    Default
                                  </Badge>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize">{s.series_type.replace("_", " ")}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!s.is_default && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSetDefaultSeries(s.id, s.series_type)}
                                className="h-7 text-[10px] px-2"
                              >
                                Set Default
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSeries(s.id)}
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Info Banner */}
            {!integration && (
              <div className="mx-4 mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-400">Setup Required</p>
                    <p className="text-muted-foreground mt-0.5">
                      Enter your Smartbill API credentials to enable automatic invoice generation and sync.
                      Get your API token from{" "}
                      <a
                        href="https://cloud.smartbill.ro/core/integrari/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400 hover:underline"
                      >
                        Smartbill Settings → Integrations
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Future Integrations Placeholder */}
          <div className="border border-dashed border-border/50 rounded-xl p-6 text-center">
            <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">More billing integrations coming soon</p>
            <p className="text-xs text-muted-foreground/60 mt-1">FGO, Saga, Oblio, and more</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
