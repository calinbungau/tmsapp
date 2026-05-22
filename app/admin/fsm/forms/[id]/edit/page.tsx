"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { use } from "react"; // Import the use hook
import {
  ArrowLeft, FileText, GripVertical, Trash2, Copy, Plus, Save, Loader2,
  Type, Hash, ListChecks, CheckSquare, Calendar, Clock, Camera,
  PenTool, Upload, ToggleRight, Star, AlignLeft, Eye, EyeOff, Lock,
  ChevronDown, ChevronRight, Edit2,
} from "lucide-react";

interface FormField {
  id: string;
  form_id: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  is_visible_to_driver: boolean;
  is_editable_by_driver: boolean;
  options: any;
  default_value: string | null;
  validation_rules: any;
  sort_order: number;
}

interface TaskForm {
  id: string;
  name: string;
  description: string | null;
  scope: "task" | "stop";
  filled_by: "driver" | "dispatcher";
  is_active: boolean;
}

const FIELD_TYPES = [
  { type: "text", label: "Text", icon: Type, description: "Single line text input" },
  { type: "textarea", label: "Text Area", icon: AlignLeft, description: "Multi-line text block" },
  { type: "number", label: "Number", icon: Hash, description: "Numeric value input" },
  { type: "select", label: "Dropdown", icon: ListChecks, description: "Select from options" },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, description: "Multiple choice options" },
  { type: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { type: "time", label: "Time", icon: Clock, description: "Time picker" },
  { type: "photo", label: "Photo", icon: Camera, description: "Camera capture" },
  { type: "signature", label: "Signature", icon: PenTool, description: "Digital signature" },
  { type: "file", label: "File Upload", icon: Upload, description: "File attachment" },
  { type: "toggle", label: "Toggle", icon: ToggleRight, description: "Yes / No switch" },
  { type: "rating", label: "Rating", icon: Star, description: "Star rating" },
];

function getFieldIcon(type: string) {
  const ft = FIELD_TYPES.find(f => f.type === type);
  return ft ? ft.icon : Type;
}

export default function FormEditorPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = params instanceof Promise ? React.use(params) : params;
  const formId = resolvedParams.id;
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<TaskForm | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: formData } = await supabase.from("task_forms").select("*").eq("id", formId).single();
    if (!formData) { router.push("/admin/fsm/forms"); return; }
    setForm(formData);
    const { data: fieldsData } = await supabase.from("task_form_fields").select("*").eq("form_id", formId).order("sort_order", { ascending: true });
    setFields(fieldsData || []);
    setLoading(false);
  }, [formId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addField = (fieldType: string) => {
    const newField: FormField = {
      id: `temp-${Date.now()}`,
      form_id: formId,
      field_type: fieldType,
      label: FIELD_TYPES.find(f => f.type === fieldType)?.label || fieldType,
      placeholder: null,
      help_text: null,
      is_required: false,
      is_visible_to_driver: true,
      is_editable_by_driver: true,
      options: fieldType === "select" || fieldType === "checkbox" ? ["Option 1", "Option 2"] : null,
      default_value: null,
      validation_rules: null,
      sort_order: fields.length,
    };
    setFields(prev => [...prev, newField]);
    setEditingFieldIndex(fields.length);
    setShowPalette(false);
    setHasChanges(true);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
    setHasChanges(true);
  };

  const removeField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
    if (editingFieldIndex === index) setEditingFieldIndex(null);
    else if (editingFieldIndex !== null && editingFieldIndex > index) setEditingFieldIndex(editingFieldIndex - 1);
    setHasChanges(true);
  };

  const duplicateField = (index: number) => {
    const copy = { ...fields[index], id: `temp-${Date.now()}`, label: `${fields[index].label} (copy)` };
    const newFields = [...fields];
    newFields.splice(index + 1, 0, copy);
    setFields(newFields);
    setHasChanges(true);
  };

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index); };
  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const newFields = [...fields];
    const [removed] = newFields.splice(draggedIndex, 1);
    newFields.splice(index, 0, removed);
    setFields(newFields);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setHasChanges(true);
  };
  const handleDragEnd = () => { setDraggedIndex(null); setDragOverIndex(null); };

  const saveFields = async () => {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("task_form_fields").delete().eq("form_id", formId);
    if (fields.length > 0) {
      const inserts = fields.map((f, i) => ({
        form_id: formId,
        field_type: f.field_type,
        label: f.label,
        placeholder: f.placeholder,
        help_text: f.help_text,
        is_required: f.is_required,
        is_visible_to_driver: f.is_visible_to_driver,
        is_editable_by_driver: f.is_editable_by_driver,
        options: f.options,
        default_value: f.default_value,
        validation_rules: f.validation_rules,
        sort_order: i,
      }));
      const { error } = await supabase.from("task_form_fields").insert(inserts);
      if (error) {
        toast({ title: "Error saving fields", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }
    toast({ title: "Fields saved", description: `${fields.length} fields saved.` });
    setSaving(false);
    setHasChanges(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!form) return null;

  const visibleCount = fields.filter(f => f.is_visible_to_driver).length;

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/fsm/forms" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">{form.name}</h1>
              <Badge variant={form.scope === "task" ? "default" : "secondary"} className="text-[10px]">{form.scope}</Badge>
              <Badge variant="outline" className={`text-[10px] ${form.filled_by === "dispatcher" ? "border-orange-500/30 text-orange-500" : ""}`}>{form.filled_by === "dispatcher" ? "Dispatcher" : "Driver"}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {fields.length} field{fields.length !== 1 ? "s" : ""} &middot; {visibleCount} visible to driver
          </span>
          {hasChanges && <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-[10px]">Unsaved</Badge>}
          <Button size="sm" onClick={saveFields} disabled={saving || !hasChanges}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Main content: fields left, preview right */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: Fields */}
        <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "thin" }}>
          <div className="max-w-2xl mx-auto space-y-2">
            {fields.length === 0 && !showPalette && (
              <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="mb-1 font-medium">No fields yet</p>
                <p className="text-sm mb-4">Add fields to build your form</p>
                <Button variant="outline" onClick={() => setShowPalette(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add First Field
                </Button>
              </div>
            )}

            {fields.map((field, index) => {
              const Icon = getFieldIcon(field.field_type);
              const isEditing = editingFieldIndex === index;
              return (
                <div
                  key={field.id + "-" + index}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  className={`border rounded-lg transition-all bg-card ${
                    dragOverIndex === index ? "border-primary border-2 shadow-md" : "border-border"
                  } ${draggedIndex === index ? "opacity-30 scale-95" : ""} ${isEditing ? "ring-1 ring-primary/30" : ""}`}
                >
                  {/* Field header */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 cursor-pointer"
                    onClick={() => setEditingFieldIndex(isEditing ? null : index)}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab flex-shrink-0" />
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{field.label}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {field.is_required && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Required</Badge>}
                      {!field.is_visible_to_driver && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5"><EyeOff className="h-2.5 w-2.5" />Hidden</Badge>
                      )}
                      {!field.is_editable_by_driver && field.is_visible_to_driver && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5"><Lock className="h-2.5 w-2.5" />Read-only</Badge>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); duplicateField(index); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeField(index); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isEditing ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded settings */}
                  {isEditing && (
                    <div className="px-4 pb-4 space-y-4 border-t bg-muted/20">
                      <div className="grid grid-cols-3 gap-4 pt-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Label</Label>
                          <Input value={field.label} onChange={(e) => updateField(index, { label: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Placeholder</Label>
                          <Input value={field.placeholder || ""} onChange={(e) => updateField(index, { placeholder: e.target.value || null })} placeholder="Optional..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Default Value</Label>
                          <Input value={field.default_value || ""} onChange={(e) => updateField(index, { default_value: e.target.value || null })} placeholder="Pre-filled..." />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Help Text</Label>
                        <Input value={field.help_text || ""} onChange={(e) => updateField(index, { help_text: e.target.value || null })} placeholder="Instructions for the driver..." />
                      </div>

                      {(field.field_type === "select" || field.field_type === "checkbox") && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Options (one per line)</Label>
                          <Textarea
                            value={Array.isArray(field.options) ? field.options.join("\n") : ""}
                            onChange={(e) => updateField(index, { options: e.target.value.split("\n").filter(Boolean) })}
                            rows={3}
                            placeholder={"Option 1\nOption 2\nOption 3"}
                          />
                        </div>
                      )}

                      <Separator />

                      <div className="flex items-center gap-8">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={field.is_required} onCheckedChange={(c) => updateField(index, { is_required: !!c })} />
                          Required
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={field.is_visible_to_driver} onCheckedChange={(c) => updateField(index, { is_visible_to_driver: !!c })} />
                          <Eye className="h-3.5 w-3.5" /> Visible to driver
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={field.is_editable_by_driver} onCheckedChange={(c) => updateField(index, { is_editable_by_driver: !!c })} />
                          <Edit2 className="h-3.5 w-3.5" /> Editable by driver
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add field palette */}
            <div className="pt-2">
              {showPalette ? (
                <div className="border rounded-xl p-5 bg-card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Add a Field</h3>
                    <Button size="sm" variant="ghost" onClick={() => setShowPalette(false)}>Close</Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {FIELD_TYPES.map((ft) => (
                      <button
                        key={ft.type}
                        onClick={() => addField(ft.type)}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-accent hover:border-primary/30 transition-all text-left group"
                      >
                        <ft.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ft.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{ft.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : fields.length > 0 ? (
                <Button variant="outline" className="w-full border-dashed bg-transparent" onClick={() => setShowPalette(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add Field
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right: Driver Preview */}
        <div className="w-[340px] border-l bg-muted/20 overflow-y-auto p-6 flex-shrink-0" style={{ scrollbarWidth: "thin" }}>
          <h3 className="text-sm font-semibold mb-1">Driver Preview</h3>
          <p className="text-xs text-muted-foreground mb-4">How drivers will see this form</p>

          <div className="bg-card border rounded-xl p-4 space-y-4 shadow-sm">
            {fields.filter(f => f.is_visible_to_driver).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Eye className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No visible fields</p>
              </div>
            ) : fields.filter(f => f.is_visible_to_driver).map((field, i) => {
              const Icon = getFieldIcon(field.field_type);
              return (
                <div key={i} className="space-y-1.5">
                  <label className="text-xs font-medium flex items-center gap-1.5">
                    {field.label}
                    {field.is_required && <span className="text-destructive">*</span>}
                    {!field.is_editable_by_driver && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </label>
                  {field.field_type === "text" && <Input disabled={!field.is_editable_by_driver} className="h-9 text-sm" placeholder={field.placeholder || ""} />}
                  {field.field_type === "textarea" && <Textarea disabled={!field.is_editable_by_driver} className="text-sm" rows={2} placeholder={field.placeholder || ""} />}
                  {field.field_type === "number" && <Input disabled={!field.is_editable_by_driver} type="number" className="h-9 text-sm" placeholder={field.placeholder || ""} />}
                  {field.field_type === "select" && (
                    <Select disabled={!field.is_editable_by_driver}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {Array.isArray(field.options) && field.options.map((opt: string, oi: number) => <SelectItem key={oi} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {field.field_type === "checkbox" && Array.isArray(field.options) && (
                    <div className="space-y-1.5">
                      {field.options.map((opt: string, oi: number) => (
                        <label key={oi} className="flex items-center gap-2 text-sm"><Checkbox disabled={!field.is_editable_by_driver} />{opt}</label>
                      ))}
                    </div>
                  )}
                  {field.field_type === "date" && <Input disabled={!field.is_editable_by_driver} type="date" className="h-9 text-sm" />}
                  {field.field_type === "time" && <Input disabled={!field.is_editable_by_driver} type="time" className="h-9 text-sm" />}
                  {field.field_type === "toggle" && <Switch disabled={!field.is_editable_by_driver} />}
                  {(field.field_type === "photo" || field.field_type === "file") && (
                    <div className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                      <Icon className="h-5 w-5 mx-auto mb-1" />
                      {field.field_type === "photo" ? "Tap to take photo" : "Tap to upload file"}
                    </div>
                  )}
                  {field.field_type === "signature" && (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
                      <PenTool className="h-5 w-5 mx-auto mb-1" />Sign here
                    </div>
                  )}
                  {field.field_type === "rating" && (
                    <div className="flex gap-1">{[1,2,3,4,5].map(s => <Star key={s} className="h-5 w-5 text-muted-foreground/40" />)}</div>
                  )}
                  {field.help_text && <p className="text-[10px] text-muted-foreground">{field.help_text}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
