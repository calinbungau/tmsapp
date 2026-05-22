"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Copy, Sparkles, FileText, Star } from "lucide-react";
import Link from "next/link";

interface AIInstruction {
  id: string;
  name: string;
  description: string | null;
  document_type: string;
  instructions: string;
  field_mappings: Record<string, any> | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_TYPES = [
  { value: "laadlijst", label: "Laadlijst / Loslijst" },
  { value: "cmr", label: "CMR Document" },
  { value: "transport_order", label: "Transport Order" },
  { value: "delivery_note", label: "Delivery Note" },
  { value: "invoice", label: "Invoice / Factura" },
  { value: "customs", label: "Customs Document" },
  { value: "generic", label: "Generic / Other" },
];

export default function AIInstructionsPage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const supabase = createClient();

  const [instructions, setInstructions] = useState<AIInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<AIInstruction | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    document_type: "generic",
    instructions: "",
    is_default: false,
    is_active: true,
  });

  useEffect(() => {
    if (adminSession?.id) {
      loadInstructions();
    }
  }, [adminSession?.id]);

  const loadInstructions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_extraction_instructions")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name");

    if (error) {
      toast({ title: "Error loading instructions", description: error.message, variant: "destructive" });
    } else {
      setInstructions(data || []);
    }
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingInstruction(null);
    setForm({
      name: "",
      description: "",
      document_type: "generic",
      instructions: "",
      is_default: false,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (instruction: AIInstruction) => {
    setEditingInstruction(instruction);
    setForm({
      name: instruction.name,
      description: instruction.description || "",
      document_type: instruction.document_type,
      instructions: instruction.instructions,
      is_default: instruction.is_default,
      is_active: instruction.is_active,
    });
    setDialogOpen(true);
  };

  const duplicateInstruction = (instruction: AIInstruction) => {
    setEditingInstruction(null);
    setForm({
      name: `${instruction.name} (Copy)`,
      description: instruction.description || "",
      document_type: instruction.document_type,
      instructions: instruction.instructions,
      is_default: false,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.instructions.trim()) {
      toast({ title: "Name and instructions are required", variant: "destructive" });
      return;
    }

    setSaving(true);

    // If setting as default, unset other defaults for same document type
    if (form.is_default) {
      await supabase
        .from("ai_extraction_instructions")
        .update({ is_default: false })
        .eq("document_type", form.document_type)
        .neq("id", editingInstruction?.id || "");
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      document_type: form.document_type,
      instructions: form.instructions.trim(),
      is_default: form.is_default,
      is_active: form.is_active,
    };

    let error;
    if (editingInstruction) {
      const res = await supabase
        .from("ai_extraction_instructions")
        .update(payload)
        .eq("id", editingInstruction.id);
      error = res.error;
    } else {
      const res = await supabase
        .from("ai_extraction_instructions")
        .insert(payload);
      error = res.error;
    }

    if (error) {
      toast({ title: "Error saving instruction", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingInstruction ? "Instruction updated" : "Instruction created" });
      setDialogOpen(false);
      loadInstructions();
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this instruction?")) return;

    const { error } = await supabase
      .from("ai_extraction_instructions")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error deleting instruction", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Instruction deleted" });
      loadInstructions();
    }
  };

  const toggleActive = async (instruction: AIInstruction) => {
    const { error } = await supabase
      .from("ai_extraction_instructions")
      .update({ is_active: !instruction.is_active })
      .eq("id", instruction.id);

    if (error) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    } else {
      loadInstructions();
    }
  };

  const getDocTypeLabel = (type: string) => {
    return DOCUMENT_TYPES.find(d => d.value === type)?.label || type;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">AI Extraction Instructions</h1>
          <p className="text-muted-foreground">
            Configure how AI extracts data from different document types
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Instruction Set
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : instructions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No instruction sets yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create custom instructions to guide AI extraction for different document types
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Instruction Set
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {instructions.map((instruction) => (
            <Card key={instruction.id} className={!instruction.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {instruction.name}
                        {instruction.is_default && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            Default
                          </Badge>
                        )}
                        {!instruction.is_active && (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {getDocTypeLabel(instruction.document_type)}
                        {instruction.description && ` - ${instruction.description}`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => duplicateInstruction(instruction)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(instruction)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(instruction.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                    {instruction.instructions.substring(0, 500)}
                    {instruction.instructions.length > 500 && "..."}
                  </pre>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    Updated {new Date(instruction.updated_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${instruction.id}`} className="text-sm">
                      Active
                    </Label>
                    <Switch
                      id={`active-${instruction.id}`}
                      checked={instruction.is_active}
                      onCheckedChange={() => toggleActive(instruction)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingInstruction ? "Edit Instruction Set" : "New Instruction Set"}
            </DialogTitle>
            <DialogDescription>
              Define how AI should extract data from this type of document
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Laadlijst Netherlands"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document_type">Document Type</Label>
                <Select
                  value={form.document_type}
                  onValueChange={(v) => setForm({ ...form, document_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of when to use this instruction set"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">AI Instructions *</Label>
              <Textarea
                id="instructions"
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Enter detailed instructions for the AI on how to extract data from this document type..."
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use clear, specific instructions. You can reference field names like customer_reference, 
                cargo_description, loading_address, etc. The AI will follow these instructions when 
                extracting data from uploaded documents.
              </p>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_default"
                  checked={form.is_default}
                  onCheckedChange={(c) => setForm({ ...form, is_default: c })}
                />
                <Label htmlFor="is_default">Set as default for this document type</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm({ ...form, is_active: c })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingInstruction ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
