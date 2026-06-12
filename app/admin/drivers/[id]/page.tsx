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
  Phone,
  Mail,
  Car,
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
  ExternalLink,
  Wallet,
  Save,
  Loader2,
} from "lucide-react";
import type { Driver, Vehicle } from "@/lib/types";
import { useTranslation } from "@/components/i18n/i18n-provider";

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

export default function DriverDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const { t } = useTranslation();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
    issued_date: "",
    document_number: "",
    notes: "",
  });

  // Driver Pay (rate) state
  const [payForm, setPayForm] = useState<{
    rate_mode: "hourly" | "per_km";
    hourly_rate: string;
    rate_per_km: string;
  }>({ rate_mode: "hourly", hourly_rate: "", rate_per_km: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [paySavedAt, setPaySavedAt] = useState<number | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // Whenever the driver record loads/refreshes, hydrate the pay form from it.
  useEffect(() => {
    if (!driver) return;
    const d = driver as Driver & {
      hourly_rate?: number | null;
      rate_per_km?: number | null;
      rate_mode?: "hourly" | "per_km" | null;
    };
    setPayForm({
      rate_mode: (d.rate_mode as "hourly" | "per_km") || "hourly",
      hourly_rate: d.hourly_rate != null ? String(d.hourly_rate) : "",
      rate_per_km: d.rate_per_km != null ? String(d.rate_per_km) : "",
    });
  }, [driver]);

  const handleSavePay = async () => {
    if (!id) return;
    setPaySaving(true);
    setPayError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("drivers")
        .update({
          rate_mode: payForm.rate_mode,
          hourly_rate: payForm.hourly_rate === "" ? null : Number(payForm.hourly_rate),
          rate_per_km: payForm.rate_per_km === "" ? null : Number(payForm.rate_per_km),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      setPaySavedAt(Date.now());
      await fetchData();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("driverDetail.failedToSave"));
    } finally {
      setPaySaving(false);
    }
  };

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

    // Fetch driver
    const { data: driverData } = await supabase
      .from("drivers")
      .select("*")
      .eq("id", id)
      .eq("admin_id", adminSession!.id)
      .single();

    if (driverData) {
      setDriver(driverData);
    }

    // Fetch vehicles assigned to this driver
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .eq("assigned_driver_id", id);

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch document types for drivers
    const { data: typesData } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .eq("is_active", true)
      .in("applies_to", ["driver", "both", "all"])
      .order("name");

    if (typesData) {
      setDocumentTypes(typesData);
    }

    // Fetch documents for this driver
    const { data: docsData } = await supabase
      .from("documents")
      .select("*, document_type:document_types(*)")
      .eq("driver_id", id)
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
      admin_id: adminSession!.id,
      document_type_id: uploadData.document_type_id,
      driver_id: driver.id,
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
      return { status: "valid", label: t("driverDetail.valid"), color: "bg-green-500/20 text-green-400" };
    }

    const today = new Date();
    const expiry = new Date(doc.expiry_date);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: "expired", label: t("driverDetail.expired"), color: "bg-red-500/20 text-red-400" };
    } else if (daysUntilExpiry <= 30) {
      return { status: "expiring", label: t("driverDetail.expiresInDays").replace("{n}", String(daysUntilExpiry)), color: "bg-yellow-500/20 text-yellow-400" };
    }
    return { status: "valid", label: t("driverDetail.valid"), color: "bg-green-500/20 text-green-400" };
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

  if (!driver) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("driverDetail.driverNotFound")}</h3>
            <Link href="/admin/drivers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("driverDetail.backToDrivers")}
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
          <Link href="/admin/drivers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{driver.name}</h1>
            <p className="text-muted-foreground">{t("driverDetail.driverDetails")}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            driver.status === "active"
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-muted text-muted-foreground"
          }
        >
          {driver.status === "active" ? t("drivers.active") : driver.status === "inactive" ? t("drivers.inactive") : driver.status}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Driver Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("driverDetail.contactInformation")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {driver.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{driver.email}</span>
              </div>
            )}
            {driver.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{driver.phone}</span>
              </div>
            )}
            {driver.license_number && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>{t("driverDetail.license")} {driver.license_number}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Driver Pay */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {t("driverDetail.driverPay")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("driverDetail.rateMode")}</Label>
              <Select
                value={payForm.rate_mode}
                onValueChange={(v) =>
                  setPayForm((p) => ({ ...p, rate_mode: v as "hourly" | "per_km" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">{t("driverDetail.hourlyOption")}</SelectItem>
                  <SelectItem value="per_km">{t("driverDetail.perKmOption")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dp_hourly" className="text-xs text-muted-foreground">
                  {t("driverDetail.hourlyRate")}
                </Label>
                <Input
                  id="dp_hourly"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payForm.hourly_rate}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, hourly_rate: e.target.value }))
                  }
                  placeholder={t("driverDetail.hourlyPlaceholder")}
                  disabled={payForm.rate_mode !== "hourly"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dp_perkm" className="text-xs text-muted-foreground">
                  {t("driverDetail.ratePerKm")}
                </Label>
                <Input
                  id="dp_perkm"
                  type="number"
                  step="0.001"
                  min="0"
                  value={payForm.rate_per_km}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, rate_per_km: e.target.value }))
                  }
                  placeholder={t("driverDetail.perKmPlaceholder")}
                  disabled={payForm.rate_mode !== "per_km"}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("driverDetail.defaultRateNote")}
            </p>
            {payError && (
              <p className="text-[11px] text-destructive">{payError}</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {paySavedAt && Date.now() - paySavedAt < 4000 ? t("driverDetail.saved") : ""}
              </span>
              <Button size="sm" onClick={handleSavePay} disabled={paySaving}>
                {paySaving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("driverDetail.savePay")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Assigned Vehicles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4" />
              {t("driverDetail.assignedVehicles")} ({vehicles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("driverDetail.noVehiclesAssigned")}</p>
            ) : (
              <div className="space-y-2">
                {vehicles.map((vehicle) => (
                  <Link
                    key={vehicle.id}
                    href={`/admin/vehicles/${vehicle.id}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{vehicle.plate_number}</span>
                    <span className="text-sm text-muted-foreground">
                      {vehicle.make} {vehicle.model}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("driverDetail.documentsSummary")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("driverDetail.totalDocuments")}</span>
                <span className="font-medium">{documents.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-400">{t("driverDetail.valid")}</span>
                <span className="font-medium">
                  {documents.filter((d) => getDocumentStatus(d).status === "valid").length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-yellow-400">{t("driverDetail.expiringSoon")}</span>
                <span className="font-medium">
                  {documents.filter((d) => getDocumentStatus(d).status === "expiring").length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-400">{t("driverDetail.expired")}</span>
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
            {t("driverDetail.documents")}
          </CardTitle>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("driverDetail.uploadDocument")}
          </Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">{t("driverDetail.noDocsYet")}</p>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                {t("driverDetail.uploadFirstDoc")}
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
                            {doc.document_type?.name || t("driverDetail.unknownType")}
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
                            {t("driverDetail.expires")} {new Date(doc.expiry_date).toLocaleDateString()}
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
            <DialogTitle>{t("driverDetail.uploadDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("driverDetail.documentType")}</Label>
              <Select
                value={uploadData.document_type_id}
                onValueChange={(v) =>
                  setUploadData({ ...uploadData, document_type_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("driverDetail.selectType")} />
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
              <Label>{t("driverDetail.file")}</Label>
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
                {t("driverDetail.supportedFormats")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("driverDetail.issuedDate")}</Label>
                <Input
                  type="date"
                  value={uploadData.issued_date}
                  onChange={(e) =>
                    setUploadData({ ...uploadData, issued_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("driverDetail.expiryDate")}</Label>
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
              <Label>{t("driverDetail.documentNumber")}</Label>
              <Input
                value={uploadData.document_number}
                onChange={(e) =>
                  setUploadData({ ...uploadData, document_number: e.target.value })
                }
                placeholder={t("driverDetail.documentNumberPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("driverDetail.notes")}</Label>
              <Input
                value={uploadData.notes}
                onChange={(e) =>
                  setUploadData({ ...uploadData, notes: e.target.value })
                }
                placeholder={t("driverDetail.notesPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              {t("driverDetail.cancel")}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadData.document_type_id || !uploadData.file || uploading}
            >
              {uploading ? t("driverDetail.uploading") : t("driverDetail.upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("driverDetail.editDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("driverDetail.expiryDate")}</Label>
              <Input
                type="date"
                value={uploadData.expiry_date}
                onChange={(e) =>
                  setUploadData({ ...uploadData, expiry_date: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t("driverDetail.documentNumber")}</Label>
              <Input
                value={uploadData.document_number}
                onChange={(e) =>
                  setUploadData({ ...uploadData, document_number: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t("driverDetail.notes")}</Label>
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
              {t("driverDetail.cancel")}
            </Button>
            <Button onClick={handleUpdateExpiry}>{t("driverDetail.saveChanges")}</Button>
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
                    {t("driverDetail.previewNotAvailable")}
                  </p>
                  <a href={selectedDocument.file_url} target="_blank" rel="noopener noreferrer">
                    <Button>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t("driverDetail.openInNewTab")}
                    </Button>
                  </a>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <a href={selectedDocument.file_url} download={selectedDocument.file_name}>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    {t("driverDetail.download")}
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
              {t("driverDetail.deleteDocument")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("driverDetail.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("driverDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("driverDetail.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
