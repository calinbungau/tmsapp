"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Car,
  User,
  Calendar,
  AlertTriangle,
} from "lucide-react";

interface DocumentType {
  id: string;
  admin_id: string;
  name: string;
  description: string | null;
  applies_to: "driver" | "vehicle" | "employee" | "both" | "all";
  requires_expiry: boolean;
  expiry_remind_days: number | null;
  is_active: boolean;
  created_at: string;
}

function DocumentTypesContent() {
  const searchParams = useSearchParams();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [typeToDelete, setTypeToDelete] = useState<DocumentType | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    applies_to: "all" as "driver" | "vehicle" | "employee" | "both" | "all",
    requires_expiry: true,
    expiry_remind_days: "30",
    is_active: true,
  });

  useEffect(() => {
    if (adminSession?.id) {
      fetchDocumentTypes();
    }
  }, [adminSession?.id]);

  useEffect(() => {
    if (searchParams.get("new") === "true" && !dialogOpen) {
      setDialogOpen(true);
    }
  }, [searchParams]);

  const fetchDocumentTypes = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .order("name");

    if (data) {
      setDocumentTypes(data);
    }
    setLoading(false);
  };

  const openNewDialog = () => {
    setEditingType(null);
    setFormData({
      name: "",
      description: "",
      applies_to: "all",
      requires_expiry: true,
      expiry_remind_days: "30",
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (type: DocumentType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || "",
      applies_to: type.applies_to,
      requires_expiry: type.requires_expiry,
      expiry_remind_days: type.expiry_remind_days?.toString() || "30",
      is_active: type.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!adminSession?.id || !formData.name.trim()) return;

    const supabase = createClient();
    const payload = {
      admin_id: adminSession.id,
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      applies_to: formData.applies_to,
      requires_expiry: formData.requires_expiry,
      expiry_remind_days: formData.requires_expiry ? parseInt(formData.expiry_remind_days) || 30 : null,
      is_active: formData.is_active,
    };

    if (editingType) {
      await supabase
        .from("document_types")
        .update(payload)
        .eq("id", editingType.id);
    } else {
      await supabase.from("document_types").insert(payload);
    }

    setDialogOpen(false);
    fetchDocumentTypes();
  };

  const handleDelete = async () => {
    if (!typeToDelete) return;

    const supabase = createClient();
    await supabase.from("document_types").delete().eq("id", typeToDelete.id);

    setDeleteDialogOpen(false);
    setTypeToDelete(null);
    fetchDocumentTypes();
  };

  const getEntityBadge = (entityType: string) => {
    switch (entityType) {
      case "driver":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            <User className="h-3 w-3 mr-1" />
            Driver
          </Badge>
        );
      case "vehicle":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
            <Car className="h-3 w-3 mr-1" />
            Vehicle
          </Badge>
        );
      case "employee":
        return (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">
            <User className="h-3 w-3 mr-1" />
            Employee
          </Badge>
        );
      case "both":
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
            <FileText className="h-3 w-3 mr-1" />
            Drivers & Vehicles
          </Badge>
        );
      case "all":
      default:
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
            <FileText className="h-3 w-3 mr-1" />
            All
          </Badge>
        );
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Types</h1>
          <p className="text-muted-foreground">
            Define document types for drivers and vehicles
          </p>
        </div>
        <Button onClick={openNewDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Document Type
        </Button>
      </div>

      {documentTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Document Types</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create document types like Driver License, Vehicle Registration, Insurance, etc.
            </p>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document Type
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documentTypes.map((type) => (
            <Card key={type.id} className={!type.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{type.name}</h3>
                      {getEntityBadge(type.applies_to)}
                      {!type.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {type.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {type.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {type.requires_expiry ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Expires • Remind {type.expiry_remind_days} days before
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          No expiry
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(type)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        setTypeToDelete(type);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit Document Type" : "New Document Type"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Driver License, Vehicle Insurance"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Applies To</Label>
              <Select
                value={formData.applies_to}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    applies_to: v as "driver" | "vehicle" | "employee" | "both" | "all",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      All (Drivers, Vehicles & Employees)
                    </span>
                  </SelectItem>
                  <SelectItem value="driver">
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Drivers Only
                    </span>
                  </SelectItem>
                  <SelectItem value="vehicle">
                    <span className="flex items-center gap-2">
                      <Car className="h-4 w-4" />
                      Vehicles Only
                    </span>
                  </SelectItem>
                  <SelectItem value="employee">
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Employees Only
                    </span>
                  </SelectItem>
                  <SelectItem value="both">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Drivers & Vehicles
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Has Expiry Date</Label>
                <p className="text-xs text-muted-foreground">
                  Track expiration and get reminders
                </p>
              </div>
              <Switch
                checked={formData.requires_expiry}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, requires_expiry: checked })
                }
              />
            </div>

            {formData.requires_expiry && (
              <div className="space-y-2">
                <Label>Remind Days Before Expiry</Label>
                <Input
                  type="number"
                  value={formData.expiry_remind_days}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      expiry_remind_days: e.target.value,
                    })
                  }
                  min="1"
                  max="365"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive types won't appear in forms
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
              {editingType ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Document Type
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{typeToDelete?.name}"? This will
              also delete all documents of this type. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function DocumentTypesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      }
    >
      <DocumentTypesContent />
    </Suspense>
  );
}
