"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft,
  User,
  Car,
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  Calendar,
  AlertTriangle,
  Plus,
  Pencil,
  ExternalLink,
  Gauge,
  Fuel,
  Wrench,
} from "lucide-react";
import type { Vehicle, Driver } from "@/lib/types";

interface DocumentType {
  id: string;
  name: string;
  requires_expiry: boolean;
  applies_to: string;
}

interface Document {
  id: string;
  document_type_id: string;
  document_type: DocumentType;
  file_url: string;
  file_name: string;
  expiry_date: string | null;
  issued_date: string | null;
  document_number: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export default function VehicleDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [vehicle, setVehicle] = useState<(Vehicle & { assigned_driver?: Driver }) | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [maintenanceCount, setMaintenanceCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);

  const [uploadData, setUploadData] = useState({
    document_type_id: "",
    file: null as File | null,
    expiry_date: "",
    issued_date: "",
    document_number: "",
    notes: "",
  });

  useEffect(() => {
    if (sessionLoading) return;
    
    if (adminSession?.id && id) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [sessionLoading, adminSession?.id, id]);

  const fetchData = async () => {
    const supabase = createClient();

    // Fetch vehicle
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("admin_id", adminSession!.id)
      .single();

    if (vehicleData) {
      // Fetch assigned driver separately if exists
      if (vehicleData.assigned_driver_id) {
        const { data: driverData } = await supabase
          .from("drivers")
          .select("*")
          .eq("id", vehicleData.assigned_driver_id)
          .single();
        
        setVehicle({ ...vehicleData, assigned_driver: driverData || undefined });
      } else {
        setVehicle(vehicleData);
      }
    }

    // Fetch document types for vehicles
    const { data: typesData } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .eq("is_active", true)
      .in("applies_to", ["vehicle", "both", "all"])
      .order("name");

    if (typesData) {
      setDocumentTypes(typesData);
    }

    // Fetch documents for this vehicle
    const { data: docsData } = await supabase
      .from("documents")
      .select("*, document_type:document_types(*)")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false });

    if (docsData) {
      setDocuments(docsData as Document[]);
    }

    // Fetch maintenance count
    const { count } = await supabase
      .from("maintenance_records")
      .select("*", { count: "exact", head: true })
      .eq("vehicle_id", id);

    setMaintenanceCount(count || 0);

    setLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadData.document_type_id || !uploadData.file || !vehicle) return;

    setUploading(true);
    const supabase = createClient();

    // Upload file
    const fileName = `vehicles/${vehicle.id}/${Date.now()}-${uploadData.file.name}`;
    const { data: fileData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, uploadData.file);

    if (uploadError) {
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(fileName);

    // Create document record
    await supabase.from("documents").insert({
      admin_id: adminSession!.id,
      document_type_id: uploadData.document_type_id,
      vehicle_id: vehicle.id,
      file_url: urlData.publicUrl,
      file_name: uploadData.file.name,
      expiry_date: uploadData.expiry_date || null,
      notes: uploadData.notes || null,
      uploaded_by_type: "admin",
      uploaded_by_admin_id: adminSession!.id,
    });

    setUploadDialogOpen(false);
    setUploadData({
      document_type_id: "",
      file: null,
      expiry_date: "",
      issued_date: "",
      document_number: "",
      notes: "",
    });
    setUploading(false);
    fetchData();
  };

  const handleUpdateExpiry = async () => {
    if (!selectedDocument) return;

    const supabase = createClient();
    await supabase
      .from("documents")
      .update({
        expiry_date: uploadData.expiry_date || null,
        document_number: uploadData.document_number || null,
        notes: uploadData.notes || null,
      })
      .eq("id", selectedDocument.id);

    setEditDialogOpen(false);
    setSelectedDocument(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!selectedDocument) return;

    const supabase = createClient();
    
    // Delete from storage
    const filePath = selectedDocument.file_url.split("/documents/")[1];
    if (filePath) {
      await supabase.storage.from("documents").remove([filePath]);
    }

    // Delete record
    await supabase.from("documents").delete().eq("id", selectedDocument.id);

    setDeleteDialogOpen(false);
    setSelectedDocument(null);
    fetchData();
  };

  const getDocumentStatus = (doc: Document) => {
    if (!doc.document_type?.requires_expiry || !doc.expiry_date) {
      return { status: "valid", label: "Valid", color: "bg-green-500/20 text-green-400" };
    }

    const today = new Date();
    const expiry = new Date(doc.expiry_date);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: "expired", label: "Expired", color: "bg-red-500/20 text-red-400" };
    } else if (daysUntilExpiry <= 30) {
      return { status: "expiring", label: `Expires in ${daysUntilExpiry} days`, color: "bg-yellow-500/20 text-yellow-400" };
    }
    return { status: "valid", label: "Valid", color: "bg-green-500/20 text-green-400" };
  };

  if (sessionLoading || loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Car className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Vehicle not found</h3>
            <Link href="/admin/vehicles">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Vehicles
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/vehicles">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{vehicle.plate_number}</h1>
            <p className="text-muted-foreground">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            vehicle.status === "active"
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : vehicle.status === "maintenance"
              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
              : "bg-muted text-muted-foreground"
          }
        >
          {vehicle.status}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Vehicle Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vehicle.vin && (
              <div className="text-sm">
                <span className="text-muted-foreground">VIN:</span>{" "}
                <span className="font-mono">{vehicle.vin}</span>
              </div>
            )}
            {vehicle.fuel_type && (
              <div className="flex items-center gap-2 text-sm">
                <Fuel className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{vehicle.fuel_type}</span>
              </div>
            )}
            {vehicle.current_mileage && (
              <div className="flex items-center gap-2 text-sm">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span>{vehicle.current_mileage.toLocaleString()} km</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assigned Driver */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Assigned Driver
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vehicle.assigned_driver ? (
              <Link
                href={`/admin/drivers/${vehicle.assigned_driver.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="p-2 rounded-full bg-muted">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{vehicle.assigned_driver.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {vehicle.assigned_driver.phone || vehicle.assigned_driver.email}
                  </p>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">No driver assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Maintenance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{maintenanceCount}</div>
            <p className="text-sm text-muted-foreground">Total records</p>
            <Link href={`/admin/maintenance?vehicle=${vehicle.id}`} className="mt-2 block">
              <Button variant="outline" size="sm" className="w-full bg-transparent">
                View Maintenance
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Documents Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">{documents.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-400">Valid</span>
                <span className="font-medium">
                  {documents.filter((d) => getDocumentStatus(d).status === "valid").length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-yellow-400">Expiring</span>
                <span className="font-medium">
                  {documents.filter((d) => getDocumentStatus(d).status === "expiring").length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-400">Expired</span>
                <span className="font-medium">
                  {documents.filter((d) => getDocumentStatus(d).status === "expired").length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents
          </CardTitle>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No documents uploaded yet</p>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload First Document
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const docStatus = getDocumentStatus(doc);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {doc.document_type?.name || "Unknown Type"}
                          </span>
                          <Badge className={docStatus.color}>{docStatus.label}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {doc.file_name}
                          {doc.document_number && ` • ${doc.document_number}`}
                        </div>
                        {doc.expiry_date && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedDocument(doc);
                          setPreviewDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <a href={doc.file_url} download={doc.file_name}>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedDocument(doc);
                          setUploadData({
                            document_type_id: doc.document_type_id,
                            file: null,
                            expiry_date: doc.expiry_date || "",
                            issued_date: doc.issued_date || "",
                            document_number: doc.document_number || "",
                            notes: doc.notes || "",
                          });
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          setSelectedDocument(doc);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Document Type *</Label>
              <Select
                value={uploadData.document_type_id}
                onValueChange={(v) =>
                  setUploadData({ ...uploadData, document_type_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File *</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) =>
                  setUploadData({
                    ...uploadData,
                    file: e.target.files?.[0] || null,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Supported: PDF, JPG, PNG, DOC, DOCX
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Issued Date</Label>
                <Input
                  type="date"
                  value={uploadData.issued_date}
                  onChange={(e) =>
                    setUploadData({ ...uploadData, issued_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={uploadData.expiry_date}
                  onChange={(e) =>
                    setUploadData({ ...uploadData, expiry_date: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Document Number</Label>
              <Input
                value={uploadData.document_number}
                onChange={(e) =>
                  setUploadData({ ...uploadData, document_number: e.target.value })
                }
                placeholder="e.g., Registration number, policy number"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={uploadData.notes}
                onChange={(e) =>
                  setUploadData({ ...uploadData, notes: e.target.value })
                }
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadData.document_type_id || !uploadData.file || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={uploadData.expiry_date}
                onChange={(e) =>
                  setUploadData({ ...uploadData, expiry_date: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Document Number</Label>
              <Input
                value={uploadData.document_number}
                onChange={(e) =>
                  setUploadData({ ...uploadData, document_number: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={uploadData.notes}
                onChange={(e) =>
                  setUploadData({ ...uploadData, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateExpiry}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedDocument?.document_type?.name}</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              {selectedDocument.file_url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                <img
                  src={selectedDocument.file_url || "/placeholder.svg"}
                  alt={selectedDocument.file_name}
                  className="w-full max-h-[60vh] object-contain rounded-lg"
                />
              ) : selectedDocument.file_url.match(/\.pdf$/i) ? (
                <iframe
                  src={selectedDocument.file_url}
                  className="w-full h-[60vh] rounded-lg"
                  title={selectedDocument.file_name}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Preview not available for this file type
                  </p>
                  <a href={selectedDocument.file_url} target="_blank" rel="noopener noreferrer">
                    <Button>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                  </a>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <a href={selectedDocument.file_url} download={selectedDocument.file_name}>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Document
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be
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
