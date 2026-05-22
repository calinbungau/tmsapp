"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, FileText, Trash2, Edit2,
  Type, Hash, ListChecks, CheckSquare, Calendar, Clock, Camera,
  PenTool, Upload, ToggleRight, Star, AlignLeft,
} from "lucide-react";

interface AdminSession { id: string; email: string; company_name: string | null; }

interface FormField {
  id: string;
  field_type: string;
  label: string;
  sort_order: number;
}

interface TaskForm {
  id: string;
  name: string;
  description: string | null;
  scope: "task" | "stop";
  filled_by: "driver" | "dispatcher";
  is_active: boolean;
  created_at: string;
  fields?: FormField[];
}

const FIELD_TYPES: Record<string, { label: string; icon: React.ElementType }> = {
  text: { label: "Text", icon: Type },
  textarea: { label: "Text Area", icon: AlignLeft },
  number: { label: "Number", icon: Hash },
  select: { label: "Dropdown", icon: ListChecks },
  checkbox: { label: "Checkbox", icon: CheckSquare },
  date: { label: "Date", icon: Calendar },
  time: { label: "Time", icon: Clock },
  photo: { label: "Photo", icon: Camera },
  signature: { label: "Signature", icon: PenTool },
  file: { label: "File", icon: Upload },
  toggle: { label: "Toggle", icon: ToggleRight },
  rating: { label: "Rating", icon: Star },
};

function getFieldIcon(type: string) {
  return FIELD_TYPES[type]?.icon || Type;
}

export default function FormsListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [forms, setForms] = useState<TaskForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<TaskForm | null>(null);
  const [formMeta, setFormMeta] = useState({ name: "", description: "", scope: "task" as "task" | "stop", filled_by: "driver" as "driver" | "dispatcher", is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("task_forms")
      .select("*, fields:task_form_fields(*)")
      .eq("admin_id", adminSession.id)
      .order("created_at", { ascending: false });
    const sorted = (data || []).map(f => ({
      ...f,
      fields: (f.fields || []).sort((a: FormField, b: FormField) => a.sort_order - b.sort_order),
    }));
    setForms(sorted);
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveFormMeta = async () => {
    if (!adminSession?.id || !formMeta.name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    if (editingForm) {
      await supabase.from("task_forms").update({
        name: formMeta.name.trim(), description: formMeta.description || null,
        scope: formMeta.scope, filled_by: formMeta.filled_by, is_active: formMeta.is_active,
      }).eq("id", editingForm.id);
      toast({ title: "Form updated" });
    } else {
      const { data } = await supabase.from("task_forms").insert({
        admin_id: adminSession.id, name: formMeta.name.trim(),
        description: formMeta.description || null, scope: formMeta.scope, filled_by: formMeta.filled_by, is_active: formMeta.is_active,
      }).select("id").single();
      toast({ title: "Form created" });
      if (data) {
        setSaving(false);
        setFormDialogOpen(false);
        router.push(`/admin/fsm/forms/${data.id}/edit`);
        return;
      }
    }
    setSaving(false);
    setFormDialogOpen(false);
    setEditingForm(null);
    setFormMeta({ name: "", description: "", scope: "task", filled_by: "driver", is_active: true });
    fetchData();
  };

  const handleDeleteForm = async (id: string) => {
    if (!confirm("Delete this form and all its fields?")) return;
    const supabase = createClient();
    await supabase.from("task_forms").delete().eq("id", id);
    toast({ title: "Form deleted" });
    fetchData();
  };

  const filtered = forms.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Forms</h1>
          <p className="text-muted-foreground">Build forms for tasks and stops with drag-and-drop field ordering</p>
        </div>
        <Button onClick={() => { setEditingForm(null); setFormMeta({ name: "", description: "", scope: "task", filled_by: "driver", is_active: true }); setFormDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />New Form
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search forms..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium mb-1">No custom forms yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create forms to collect data at task or stop level.</p>
            <Button onClick={() => { setFormMeta({ name: "", description: "", scope: "task", filled_by: "driver", is_active: true }); setFormDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Create First Form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((form) => (
            <Card key={form.id} className={!form.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{form.name}</CardTitle>
                    {form.description && <p className="text-xs text-muted-foreground mt-1">{form.description}</p>}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant={form.scope === "task" ? "default" : "secondary"}>{form.scope === "task" ? "Task" : "Stop"}</Badge>
                    <Badge variant={form.filled_by === "dispatcher" ? "outline" : "secondary"} className={form.filled_by === "dispatcher" ? "border-orange-500/30 text-orange-500" : ""}>{form.filled_by === "dispatcher" ? "Dispatcher" : "Driver"}</Badge>
                    {!form.is_active && <Badge variant="outline">Inactive</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-sm text-muted-foreground mb-3">{form.fields?.length || 0} field{(form.fields?.length || 0) !== 1 ? "s" : ""}</p>
                {(form.fields?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {form.fields?.slice(0, 5).map((f) => {
                      const Icon = getFieldIcon(f.field_type);
                      return <Badge key={f.id} variant="outline" className="text-xs gap-1"><Icon className="h-3 w-3" />{f.label}</Badge>;
                    })}
                    {(form.fields?.length || 0) > 5 && <Badge variant="outline" className="text-xs">+{(form.fields?.length || 0) - 5} more</Badge>}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => router.push(`/admin/fsm/forms/${form.id}/edit`)}>
                    <Edit2 className="h-3 w-3 mr-1" />Edit Fields
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingForm(form);
                    setFormMeta({ name: form.name, description: form.description || "", scope: form.scope, filled_by: form.filled_by || "driver", is_active: form.is_active });
                    setFormDialogOpen(true);
                  }}>Settings</Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive bg-transparent" onClick={() => handleDeleteForm(form.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Metadata Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingForm ? "Edit Form Settings" : "New Custom Form"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-name">Form Name</Label>
              <Input id="form-name" value={formMeta.name} onChange={(e) => setFormMeta(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Delivery Confirmation" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-desc">Description</Label>
              <Textarea id="form-desc" value={formMeta.description} onChange={(e) => setFormMeta(p => ({ ...p, description: e.target.value }))} placeholder="What is this form for?" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={formMeta.scope} onValueChange={(v) => setFormMeta(p => ({ ...p, scope: v as "task" | "stop" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task Level</SelectItem>
                    <SelectItem value="stop">Stop Level</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Filled By</Label>
                <Select value={formMeta.filled_by} onValueChange={(v) => setFormMeta(p => ({ ...p, filled_by: v as "driver" | "dispatcher" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">Driver</SelectItem>
                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={formMeta.is_active} onCheckedChange={(c) => setFormMeta(p => ({ ...p, is_active: c }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFormMeta} disabled={saving || !formMeta.name.trim()}>
              {saving ? "Saving..." : editingForm ? "Update" : "Create & Edit Fields"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
