"use client";

import { useEffect, useState } from "react";
import { useDriverSession } from "@/hooks/use-driver-session";
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
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  ExternalLink,
  X,
  Pencil,
} from "lucide-react";

interface DocumentType {
  id: string;
  name: string;
  requires_expiry: boolean;
  applies_to: string;
  description: string | null;
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

export default function DriverDocumentsPage() {
  const { driver, isLoading: sessionLoading } = useDriverSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [editExpiryDialogOpen, setEditExpiryDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newExpiryDate, setNewExpiryDate] = useState("");

  const [uploadData, setUploadData] = useState({
    document_type_id: "",
    file: null as File | null,
    expiry_date: "",
    issued_date: "",
    document_number: "",
    notes: "",
  });

  useEffect(() => {
    if (driver?.id) {
      fetchData();
    }
  }, [driver?.id]);

  const fetchData = async () => {
    if (!driver) return;

    const supabase = createClient();

    // Fetch document types for drivers
    const { data: typesData } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", driver.admin_id)
      .eq("is_active", true)
      .in("applies_to", ["driver", "both"])
      .order("name");

    if (typesData) {
      setDocumentTypes(typesData);
    }

    // Fetch documents for this driver
    const { data: docsData } = await supabase
      .from("documents")
      .select("*, document_type:document_types(*)")
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false });

    if (docsData) {
      setDocuments(docsData as Document[]);
    }

    setLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadData.document_type_id || !uploadData.file || !driver) return;

    setUploading(true);
    const supabase = createClient();

    // Upload file
    const fileName = `drivers/${driver.id}/${Date.now()}-${uploadData.file.name}`;
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
      admin_id: driver.admin_id,
      document_type_id: uploadData.document_type_id,
      driver_id: driver.id,
      file_url: urlData.publicUrl,
      file_name: uploadData.file.name,
      expiry_date: uploadData.expiry_date || null,
      notes: uploadData.notes || null,
      uploaded_by_type: "driver",
      uploaded_by_driver_id: driver.id,
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

  const handleUpdateExpiry = async () => {
    if (!selectedDocument) return;

    const supabase = createClient();
    await supabase
      .from("documents")
      .update({ expiry_date: newExpiryDate || null })
      .eq("id", selectedDocument.id);

    setEditExpiryDialogOpen(false);
    setSelectedDocument(null);
    setNewExpiryDate("");
    fetchData();
  };

  const getDocumentStatus = (doc: Document) => {
    if (!doc.document_type?.requires_expiry || !doc.expiry_date) {
      return { status: "valid", label: "Valid", color: "bg-green-500/20 text-green-400", icon: CheckCircle };
    }

    const today = new Date();
    const expiry = new Date(doc.expiry_date);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: "expired", label: "Expired", color: "bg-red-500/20 text-red-400", icon: AlertTriangle };
    } else if (daysUntilExpiry <= 30) {
      return { status: "expiring", label: `Expires in ${daysUntilExpiry} days`, color: "bg-yellow-500/20 text-yellow-400", icon: Clock };
    }
    return { status: "valid", label: "Valid", color: "bg-green-500/20 text-green-400", icon: CheckCircle };
  };

  // Get missing documents (documents that don't have any uploaded file yet)
  const missingDocuments = documentTypes.filter(
    (type) => !documents.some((doc) => doc.document_type_id === type.id)
  );

  const expiredDocs = documents.filter((d) => getDocumentStatus(d).status === "expired");
  const expiringDocs = documents.filter((d) => getDocumentStatus(d).status === "expiring");

  if (sessionLoading || loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Please log in to view your documents</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Documents</h1>
          <p className="text-sm text-muted-foreground">
            Manage your documents and certifications
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </div>

      {/* Alerts */}
      {(missingDocuments.length > 0 || expiredDocs.length > 0 || expiringDocs.length > 0) && (
        <div className="space-y-3">
          {/* Missing Required */}
          {missingDocuments.length > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                  <div>
<p className="font-medium text-red-400">Missing Documents</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        You can upload: {missingDocuments.map((t) => t.name).join(", ")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expired */}
          {expiredDocs.length > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-400">Expired Documents</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {expiredDocs.map((d) => d.document_type?.name).join(", ")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expiring Soon */}
          {expiringDocs.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-yellow-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-400">Expiring Soon</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {expiringDocs.map((d) => d.document_type?.name).join(", ")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Documents List */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Documents</h3>
            <p className="text-muted-foreground text-center mb-4">
              Upload your documents like driver license, certifications, etc.
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const status = getDocumentStatus(doc);
            const StatusIcon = status.icon;
            return (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{doc.document_type?.name}</span>
                          <Badge className={status.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {doc.file_name}
                        </p>
                        {doc.document_number && (
                          <p className="text-sm text-muted-foreground">
                            #{doc.document_number}
                          </p>
                        )}
                        {doc.expiry_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setPreviewDialogOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <a href={doc.file_url} download={doc.file_name} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full bg-transparent">
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setNewExpiryDate(doc.expiry_date || "");
                        setEditExpiryDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
                placeholder="e.g., License number"
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

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
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

      {/* Edit Expiry Dialog */}
      <Dialog open={editExpiryDialogOpen} onOpenChange={setEditExpiryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Expiry Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Document</Label>
              <p className="text-sm text-muted-foreground">
                {selectedDocument?.document_type?.name}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExpiryDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateExpiry}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
