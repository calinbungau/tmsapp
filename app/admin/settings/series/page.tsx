"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Star, Hash, Calendar, ArrowLeft, Loader2, Check,
  FileText, Truck, Receipt, CreditCard, FileCheck, Settings2,
} from "lucide-react";
import Link from "next/link";

// Entity types that can have series
const ENTITY_TYPES = [
  { value: "internal_order", label: "Internal Order", icon: Truck, description: "Own fleet transport orders", defaultPrefix: "INT" },
  { value: "forwarding_order", label: "Forwarding Order", icon: FileText, description: "Forwarded/brokered orders", defaultPrefix: "FWD" },
  { value: "invoice", label: "Invoice", icon: Receipt, description: "Customer invoices", defaultPrefix: "INV" },
  { value: "credit_note", label: "Credit Note", icon: CreditCard, description: "Credit notes/refunds", defaultPrefix: "CN" },
  { value: "cmr", label: "CMR", icon: FileCheck, description: "CMR consignment notes", defaultPrefix: "CMR" },
] as const;

type EntityType = typeof ENTITY_TYPES[number]["value"];

// Separator options
const SEPARATORS = [
  { value: "-", label: "Dash (-)", example: "INT-2026-0001" },
  { value: "/", label: "Slash (/)", example: "INT/2026/0001" },
  { value: ".", label: "Dot (.)", example: "INT.2026.0001" },
  { value: "none", label: "None", example: "INT20260001" },
];

// Year format options
const YEAR_FORMATS = [
  { value: "none", label: "No Year", example: "INT-0001" },
  { value: "YYYY", label: "Full Year (2026)", example: "INT-2026-0001" },
  { value: "YY", label: "Short Year (26)", example: "INT-26-0001" },
];

interface NumberSeries {
  id: string;
  entity_type: EntityType;
  name: string;
  prefix: string;
  year_separator: string;
  number_separator: string;
  include_year: boolean;
  year_format: string;
  number_padding: number;
  start_number: number;
  current_numbers: Record<string, number>;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export default function SeriesConfiguratorPage() {
  const { session: adminSession } = useAdminSession();
  const [series, setSeries] = useState<NumberSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType | null>(null);
  const [editingSeries, setEditingSeries] = useState<NumberSeries | null>(null);
  const { toast } = useToast();

  // Form state for create/edit
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    year_separator: "-",
    number_separator: "",
    include_year: true,
    year_format: "YYYY",
    number_padding: 4,
    start_number: 1,
  });

  const loadSeries = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("number_series")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("entity_type")
      .order("is_default", { ascending: false })
      .order("name");

    if (!error && data) {
      setSeries(data);
    }
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

const generatePreview = (data: typeof formData, currentNumber?: number) => {
  const year = new Date().getFullYear();
  const yearStr = data.year_format === "YYYY" ? year.toString() : year.toString().slice(-2);
  const num = (currentNumber || data.start_number).toString().padStart(data.number_padding, "0");
  const ySep = data.year_separator === "none" ? "" : data.year_separator;
  const nSep = data.number_separator === "none" ? "" : data.number_separator;
  
  if (!data.include_year || data.year_format === "none") {
    return `${data.prefix}${nSep}${num}`;
  }
  
  // Format: PREFIX-YEAR-NUMBER (e.g., INT-2026-0001)
  return `${data.prefix}${ySep}${yearStr}${nSep}${num}`;
};

const openCreateDialog = (entityType: EntityType) => {
    setSelectedEntityType(entityType);
    setEditingSeries(null);
    const defaultPrefix = ENTITY_TYPES.find(e => e.value === entityType)?.defaultPrefix || "DOC";
    setFormData({
      name: "Main Series",
      prefix: defaultPrefix,
      year_separator: "-",
      number_separator: "-",
      include_year: true,
      year_format: "YYYY",
      number_padding: 4,
      start_number: 1,
    });
    setShowCreateDialog(true);
  };

  const openEditDialog = (s: NumberSeries) => {
    setSelectedEntityType(s.entity_type);
    setEditingSeries(s);
    setFormData({
      name: s.name,
      prefix: s.prefix,
      year_separator: s.year_separator === "" ? "none" : s.year_separator,
      number_separator: s.number_separator === "" ? "none" : s.number_separator,
      include_year: s.include_year,
      year_format: s.year_format,
      number_padding: s.number_padding,
      start_number: s.start_number,
    });
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!selectedEntityType || !adminSession?.id) return;
    
    setSaving(true);
    const supabase = createClient();

const payload = {
  admin_id: adminSession.id,
  entity_type: selectedEntityType,
  name: formData.name,
  prefix: formData.prefix.toUpperCase(),
  year_separator: formData.year_separator === "none" ? "" : formData.year_separator,
  number_separator: formData.number_separator === "none" ? "" : formData.number_separator,
  include_year: formData.include_year && formData.year_format !== "none",
  year_format: formData.year_format === "none" ? "YYYY" : formData.year_format,
  number_padding: formData.number_padding,
  start_number: formData.start_number,
  current_numbers: {},
  is_active: true,
};

    if (editingSeries) {
      const { error } = await supabase
        .from("number_series")
        .update(payload)
        .eq("id", editingSeries.id);

      if (error) {
        toast({ title: "Error", description: "Failed to update series", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Series updated successfully" });
        loadSeries();
        setShowCreateDialog(false);
      }
    } else {
      // Check if this is the first series for this entity type - make it default
      const existingSeries = series.filter(s => s.entity_type === selectedEntityType);
      const isFirstSeries = existingSeries.length === 0;

      const { error } = await supabase
        .from("number_series")
        .insert({ ...payload, is_default: isFirstSeries });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Series created successfully" });
        loadSeries();
        setShowCreateDialog(false);
      }
    }
    setSaving(false);
  };

  const setAsDefault = async (s: NumberSeries) => {
    const supabase = createClient();
    
    // First, unset default for all series of this entity type
    await supabase
      .from("number_series")
      .update({ is_default: false })
      .eq("entity_type", s.entity_type);

    // Then set this one as default
    const { error } = await supabase
      .from("number_series")
      .update({ is_default: true })
      .eq("id", s.id);

    if (!error) {
      toast({ title: "Success", description: `${s.prefix} is now the default series` });
      loadSeries();
    }
  };

  const toggleActive = async (s: NumberSeries) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("number_series")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);

    if (!error) {
      loadSeries();
    }
  };

  const deleteSeries = async (s: NumberSeries) => {
    if (s.is_default) {
      toast({ title: "Cannot delete", description: "Cannot delete the default series. Set another as default first.", variant: "destructive" });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("number_series")
      .delete()
      .eq("id", s.id);

    if (!error) {
      toast({ title: "Deleted", description: "Series deleted successfully" });
      loadSeries();
    }
  };

  // Group series by entity type
  const groupedSeries = ENTITY_TYPES.map(entityType => ({
    ...entityType,
    series: series.filter(s => s.entity_type === entityType.value),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/settings">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Series Configurator</h1>
          <p className="text-sm text-muted-foreground">
            Configure document numbering series for orders, invoices, and other documents
          </p>
        </div>
      </div>

      {/* Entity Type Cards */}
      <div className="grid gap-6">
        {groupedSeries.map(({ value, label, icon: Icon, description, series: entitySeries }) => (
          <Card key={value} className="bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{label}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                </div>
                <Button size="sm" onClick={() => openCreateDialog(value)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Series
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {entitySeries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                  <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No series configured yet</p>
                  <p className="text-xs">Click &quot;Add Series&quot; to create one</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {entitySeries.map(s => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        s.is_active ? "bg-background" : "bg-muted/30 opacity-60"
                      }`}
                    >
                        <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {s.is_default && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                          <span className="font-mono font-semibold text-lg">{s.prefix}</span>
                          <span className="text-xs text-muted-foreground">({s.name})</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Preview: <span className="font-mono text-foreground">{generatePreview({
                            name: s.name,
                            prefix: s.prefix,
                            year_separator: s.year_separator === "" ? "none" : s.year_separator,
                            number_separator: s.number_separator === "" ? "none" : s.number_separator,
                            include_year: s.include_year,
                            year_format: s.year_format,
                            number_padding: s.number_padding,
                            start_number: s.start_number,
                          }, s.current_numbers?.[new Date().getFullYear().toString()] || s.start_number)}</span>
                        </div>
                        <Badge variant={s.is_active ? "default" : "secondary"} className="text-xs">
                          {s.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {s.include_year && (
                          <Badge variant="outline" className="text-xs">
                            <Calendar className="h-3 w-3 mr-1" /> Yearly
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!s.is_default && s.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAsDefault(s)}
                            title="Set as default"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(s)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={s.is_active}
                          onCheckedChange={() => toggleActive(s)}
                        />
                        {!s.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteSeries(s)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSeries ? "Edit Series" : "Create New Series"}
            </DialogTitle>
            <DialogDescription>
              Configure the numbering format for {ENTITY_TYPES.find(e => e.value === selectedEntityType)?.label}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Preview */}
            <div className="p-4 rounded-lg bg-muted/50 border">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="font-mono text-2xl font-bold text-primary mt-1">
                {generatePreview(formData)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Series Name */}
              <div className="space-y-2">
                <Label>Series Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Main Series, Budapest"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">Display name for this series</p>
              </div>

              {/* Prefix */}
              <div className="space-y-2">
                <Label>Prefix</Label>
                <Input
                  value={formData.prefix}
                  onChange={(e) => setFormData({ ...formData, prefix: e.target.value.toUpperCase() })}
                  placeholder="e.g., INT, FWD"
                  maxLength={10}
                />
                <p className="text-xs text-muted-foreground">Appears at start of number</p>
              </div>
            </div>

            {/* Separators */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Year Separator</Label>
                <Select value={formData.year_separator} onValueChange={(v) => setFormData({ ...formData, year_separator: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEPARATORS.map(sep => (
                      <SelectItem key={sep.value} value={sep.value}>{sep.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Number Separator</Label>
                <Select value={formData.number_separator} onValueChange={(v) => setFormData({ ...formData, number_separator: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEPARATORS.map(sep => (
                      <SelectItem key={sep.value} value={sep.value}>{sep.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Year Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Include Year</Label>
                  <p className="text-xs text-muted-foreground">Add year to the document number</p>
                </div>
                <Switch
                  checked={formData.include_year}
                  onCheckedChange={(v) => setFormData({ ...formData, include_year: v })}
                />
              </div>

              {formData.include_year && (
                <div className="pl-4 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label>Year Format</Label>
                    <Select value={formData.year_format} onValueChange={(v) => setFormData({ ...formData, year_format: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_FORMATS.filter(y => y.value !== "none").map(yf => (
                          <SelectItem key={yf.value} value={yf.value}>{yf.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Number Options */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starting Number</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.start_number}
                  onChange={(e) => setFormData({ ...formData, start_number: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-muted-foreground">Number to start counting from</p>
              </div>

              <div className="space-y-2">
                <Label>Number Padding</Label>
                <Select value={formData.number_padding.toString()} onValueChange={(v) => setFormData({ ...formData, number_padding: parseInt(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 digits (001)</SelectItem>
                    <SelectItem value="4">4 digits (0001)</SelectItem>
                    <SelectItem value="5">5 digits (00001)</SelectItem>
                    <SelectItem value="6">6 digits (000001)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name || !formData.prefix}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {editingSeries ? "Update Series" : "Create Series"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
