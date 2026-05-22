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
import { Textarea } from "@/components/ui/textarea";
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
  UserCircle,
  Phone,
  Mail,
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
  Pencil,
  Building,
  Briefcase,
} from "lucide-react";

interface Employee {
  id: string;
  admin_id: string;
  department_id: string | null;
  employee_type: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  hire_date: string | null;
  status: string;
  department?: { id: string; name: string } | null;
}

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
  notes: string | null;
  created_at: string;
}

export default function EmployeeDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
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

    // Fetch employee
    const { data: employeeData } = await supabase
      .from("employees")
      .select(`
        *,
        department:departments!employees_department_id_fkey(id, name)
      `)
      .eq("id", id)
      .eq("admin_id", adminSession!.id)
      .single();

    if (employeeData) {
      // If this employee is a driver, redirect to driver detail page
      if (employeeData.employee_type === "driver") {
        // Find the associated driver record and redirect
        const { data: driverData } = await supabase
          .from("drivers")
          .select("id")
          .eq("employee_id", id)
          .single();
        
        if (driverData) {
          window.location.href = `/admin/drivers/${driverData.id}`;
          return;
        }
      }
      setEmployee(employeeData as Employee);
    }

    // Fetch document types for employees (non-drivers)
    const { data: typesData } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .eq("is_active", true)
      .in("applies_to", ["employee", "all"])
      .order("name");

    if (typesData) {
      setDocumentTypes(typesData);
    }

    // Fetch documents for this employee
    const { data: docsData } = await supabase
      .from("documents")
      .select("*, document_type:document_types(*)")
      .eq("employee_id", id)
      .order("created_at", { ascending: false });

    if (docsData) {
      setDocuments(docsData as Document[]);
    }

    setLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadData.document_type_id || !uploadData.file || !employee) return;

    setUploading(true);
    const supabase = createClient();

    // Upload file
    const fileName = `employees/${employee.id}/${Date.now()}-${uploadData.file.name}`;
    const { error: uploadError } = await supabase.storage
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
      employee_id: employee.id,
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
      notes: "",
    });
    setUploading(false);
    fetchData();
  };

  const handleUpdateDocument = async () => {
    if (!selectedDocument) return;

    const supabase = createClient();
    await supabase
      .from("documents")
      .update({
        expiry_date: uploadData.expiry_date || null,
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

  const openEditDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setUploadData({
      document_type_id: doc.document_type_id,
      file: null,
      expiry_date: doc.expiry_date || "",
      notes: doc.notes || "",
    });
    setEditDialogOpen(true);
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

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Employee not found</h3>
            <Link href="/admin/employees">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Employees
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const expiredDocs = documents.filter((d) => getDocumentStatus(d).status === "expired");
  const expiringDocs = documents.filter((d) => getDocumentStatus(d).status === "expiring");
  const validDocs = documents.filter((d) => getDocumentStatus(d).status === "valid");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/employees">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{employee.first_name} {employee.last_name}</h1>
            <p className="text-muted-foreground">Employee Details</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            employee.status === "active"
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-muted text-muted-foreground"
          }
        >
          {employee.status}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Employee Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {employee.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{employee.email}</span>
              </div>
            )}
            {employee.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{employee.phone}</span>
              </div>
            )}
            {employee.position && (
              <div className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>{employee.position}</span>
              </div>
            )}
            {employee.department && (
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>{employee.department.name}</span>
              </div>
            )}
            {employee.hire_date && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Hired: {new Date(employee.hire_date).toLocaleDateString()}</span>
              </div>
            )}
            <Badge variant="outline" className="mt-2">
              {employee.employee_type}
            </Badge>
          </CardContent>
        </Card>

        {/* Documents Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{validDocs.length}</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Clock className="h-4 w-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{expiringDocs.length}</p>
                  <p className="text-xs text-muted-foreground">Expiring</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{expiredDocs.length}</p>
                  <p className="text-xs text-muted-foreground">Expired</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents ({documents.length})
          </CardTitle>
          <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No documents uploaded yet</p>
              <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload First Document
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const status = getDocumentStatus(doc);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.document_type?.name}</p>
                        <p className="text-sm text-muted-foreground">{doc.file_name}</p>
                        {doc.expiry_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={status.color}>{status.label}</Badge>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                      >
                        <a href={doc.file_url} download target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(doc)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedDocument(doc);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
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
              <Label>Document Type</Label>
              <Select
                value={uploadData.document_type_id}
                onValueChange={(v) => setUploadData({ ...uploadData, document_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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
              <Label>File</Label>
              <Input
                type="file"
                onChange={(e) => setUploadData({ ...uploadData, file: e.target.files?.[0] || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date (optional)</Label>
              <Input
                type="date"
                value={uploadData.expiry_date}
                onChange={(e) => setUploadData({ ...uploadData, expiry_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={uploadData.notes}
                onChange={(e) => setUploadData({ ...uploadData, notes: e.target.value })}
                placeholder="Add any notes..."
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
                onChange={(e) => setUploadData({ ...uploadData, expiry_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={uploadData.notes}
                onChange={(e) => setUploadData({ ...uploadData, notes: e.target.value })}
                placeholder="Add any notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDocument}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedDocument?.document_type?.name}</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              {selectedDocument.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img
                  src={selectedDocument.file_url || "/placeholder.svg"}
                  alt={selectedDocument.file_name}
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
              ) : selectedDocument.file_url.match(/\.pdf$/i) ? (
                <iframe
                  src={selectedDocument.file_url}
                  className="w-full h-[70vh]"
                  title={selectedDocument.file_name}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Preview not available for this file type</p>
                  <Button asChild>
                    <a href={selectedDocument.file_url} download target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Download File
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
