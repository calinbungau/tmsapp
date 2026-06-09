"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Edit,
  Container,
  MapPin,
  Weight,
  Layers,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  Shield,
  FileText,
  Gauge,
  Clock,
  Trash2,
  Plus,
  Upload,
  Download,
  Eye,
  Pencil,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";

const TRAILER_TYPES = [
  { value: "curtain_side", label: "Curtain Side" },
  { value: "box", label: "Box" },
  { value: "flatbed", label: "Flatbed" },
  { value: "reefer", label: "Reefer" },
  { value: "tanker", label: "Tanker" },
  { value: "lowbed", label: "Lowbed" },
  { value: "mega", label: "Mega" },
  { value: "other", label: "Other" },
];

interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  model: string | null;
}

interface Trailer {
  id: string;
  admin_id: string;
  plate_number: string;
  trailer_type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  max_weight_kg: number | null;
  max_pallets: number | null;
  loading_meters: number | null;
  volume_m3: number | null;
  vin_number: string | null;
  registration_country: string | null;
  adr_certified: boolean;
  is_active: boolean;
  traccar_device_id: number | null;
  next_inspection_date: string | null;
  insurance_expiry: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

interface FormData {
  plate_number: string;
  type: string;
  make: string;
  model: string;
  year: string;
  max_weight_kg: string;
  max_pallets: string;
  loading_meters: string;
  volume_m3: string;
  vin_number: string;
  registration_country: string;
  adr_certified: boolean;
  next_inspection_date: string;
  insurance_expiry: string;
  notes: string;
  traccar_device_id: string;
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

export default function TrailerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const { t } = useTranslation();
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    plate_number: "",
    type: "curtain_side",
    make: "",
    model: "",
    year: "",
    max_weight_kg: "",
    max_pallets: "",
    loading_meters: "",
    volume_m3: "",
    vin_number: "",
    registration_country: "",
    adr_certified: false,
    next_inspection_date: "",
    insurance_expiry: "",
    notes: "",
    traccar_device_id: "",
  });

  // GPS data
  const [traccarDevices, setTraccarDevices] = useState<TraccarDevice[]>([]);
  const [traccarConfigured, setTraccarConfigured] = useState(false);
  const [gpsData, setGpsData] = useState<{ mileage: number | null; hours: number | null; lastUpdate: string | null } | null>(null);
  
  // Documents
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [maintenanceCount, setMaintenanceCount] = useState(0);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [docEditDialogOpen, setDocEditDialogOpen] = useState(false);
  const [docDeleteDialogOpen, setDocDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadData, setUploadData] = useState({
    document_type_id: "",
    file: null as File | null,
    expiry_date: "",
    notes: "",
  });

  const fetchTrailer = useCallback(async () => {
    if (!adminSession?.id || !params.id) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trailers")
      .select("*")
      .eq("id", params.id)
      .eq("admin_id", adminSession.id)
      .single();

    if (error || !data) {
      router.push("/admin/trailers");
      return;
    }
    setTrailer(data);
    setLoading(false);
  }, [adminSession?.id, params.id, router]);

  const fetchTraccarDevices = useCallback(async () => {
    if (!adminSession?.id) return;
    try {
      const response = await fetch(`/api/traccar?action=devices&adminId=${adminSession.id}`);
      const data = await response.json();
      if (response.ok && data.devices) {
        setTraccarDevices(data.devices);
        setTraccarConfigured(true);
      }
    } catch {
      setTraccarConfigured(false);
    }
  }, [adminSession?.id]);

  const fetchGpsData = useCallback(async () => {
    if (!adminSession?.id || !trailer?.traccar_device_id) return;
    try {
      const response = await fetch(
        `/api/traccar?action=vehicle-data&adminId=${adminSession.id}&deviceId=${trailer.traccar_device_id}`
      );
      const data = await response.json();
      if (response.ok) {
        setGpsData({
          mileage: data.totalDistance,
          hours: data.engineHours,
          lastUpdate: data.lastUpdate,
        });
      }
    } catch {
      // silent
    }
  }, [adminSession?.id, trailer?.traccar_device_id]);

  const fetchDocuments = useCallback(async () => {
    if (!adminSession?.id || !params.id) return;
    const supabase = createClient();
    
    // Fetch document types for trailers - first get all to see what applies_to values exist
    const { data: allTypes, error: typesError } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name");
    
    // Filter client-side to be more flexible with applies_to matching
    const trailerTypes = allTypes?.filter(t => 
      !t.applies_to || // null or undefined - allow all
      t.applies_to === "trailer" || 
      t.applies_to === "vehicle" || 
      t.applies_to === "both" || 
      t.applies_to === "all" ||
      t.applies_to?.includes("trailer")
    );
    if (trailerTypes) setDocumentTypes(trailerTypes);
    
    // Fetch documents for this trailer
    const { data: docsData } = await supabase
      .from("documents")
      .select("*, document_type:document_types(*)")
      .eq("trailer_id", params.id)
      .order("created_at", { ascending: false });
    if (docsData) setDocuments(docsData as Document[]);
    
    // Fetch maintenance count
    const { count } = await supabase
      .from("maintenance_records")
      .select("*", { count: "exact", head: true })
      .eq("trailer_id", params.id);
    setMaintenanceCount(count || 0);
  }, [adminSession?.id, params.id]);

  useEffect(() => {
    if (adminSession?.id) {
      fetchTrailer();
      fetchTraccarDevices();
      fetchDocuments();
    }
  }, [adminSession?.id, fetchTrailer, fetchTraccarDevices, fetchDocuments]);

  useEffect(() => {
    if (trailer?.traccar_device_id) {
      fetchGpsData();
    }
  }, [trailer?.traccar_device_id, fetchGpsData]);

  const openEditDialog = () => {
    if (!trailer) return;
    setFormData({
      plate_number: trailer.plate_number,
      type: trailer.trailer_type || "curtain_side",
      make: trailer.make || "",
      model: trailer.model || "",
      year: trailer.year?.toString() || "",
      max_weight_kg: trailer.max_weight_kg?.toString() || "",
      max_pallets: trailer.max_pallets?.toString() || "",
      loading_meters: trailer.loading_meters?.toString() || "",
      volume_m3: trailer.volume_m3?.toString() || "",
      vin_number: trailer.vin_number || "",
      registration_country: trailer.registration_country || "",
      adr_certified: trailer.adr_certified || false,
      next_inspection_date: trailer.next_inspection_date || "",
      insurance_expiry: trailer.insurance_expiry || "",
      notes: trailer.notes || "",
      traccar_device_id: trailer.traccar_device_id?.toString() || "",
    });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.plate_number.trim() || !trailer) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      plate_number: formData.plate_number.trim(),
      trailer_type: formData.type,
      make: formData.make || null,
      model: formData.model || null,
      year: formData.year ? parseInt(formData.year) : null,
      max_weight_kg: formData.max_weight_kg ? parseFloat(formData.max_weight_kg) : null,
      max_pallets: formData.max_pallets ? parseInt(formData.max_pallets) : null,
      loading_meters: formData.loading_meters ? parseFloat(formData.loading_meters) : null,
      volume_m3: formData.volume_m3 ? parseFloat(formData.volume_m3) : null,
      vin_number: formData.vin_number || null,
      registration_country: formData.registration_country || null,
      adr_certified: formData.adr_certified,
      next_inspection_date: formData.next_inspection_date || null,
      insurance_expiry: formData.insurance_expiry || null,
      notes: formData.notes || null,
      traccar_device_id: formData.traccar_device_id ? parseInt(formData.traccar_device_id) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("trailers")
      .update(payload)
      .eq("id", trailer.id);

    if (error) {
      alert(t("trailers.failUpdate") + error.message);
      setSaving(false);
      return;
    }

    setEditDialogOpen(false);
    fetchTrailer();
    setSaving(false);
  };

  const toggleActive = async () => {
    if (!trailer) return;
    const supabase = createClient();
    await supabase.from("trailers").update({ is_active: !trailer.is_active }).eq("id", trailer.id);
    fetchTrailer();
  };

  const handleDelete = async () => {
    if (!trailer || !confirm(t("trailers.confirmDeleteTrailer"))) return;
    const supabase = createClient();
    const { error } = await supabase.from("trailers").delete().eq("id", trailer.id);
    if (error) {
      alert(t("trailers.failDelete") + error.message);
      return;
    }
    router.push("/admin/trailers");
  };

  const typeLabel = (type: string) => t(`trailers.type_${type}`, TRAILER_TYPES.find((tp) => tp.value === type)?.label || type);

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  };

  const isExpired = (date: string | null) => date ? new Date(date) < new Date() : false;
  
  // Document handlers
  const handleUploadDocument = async () => {
    if (!uploadData.document_type_id || !uploadData.file || !trailer) return;
    
    setUploading(true);
    const supabase = createClient();
    
    const fileName = `trailers/${trailer.id}/${Date.now()}-${uploadData.file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, uploadData.file);
    
    if (uploadError) {
      alert(t("trailers.failCreate") + uploadError.message);
      setUploading(false);
      return;
    }
    
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
    
    const { error: insertError } = await supabase.from("documents").insert({
      admin_id: adminSession!.id,
      document_type_id: uploadData.document_type_id,
      trailer_id: trailer.id,
      file_url: urlData.publicUrl,
      file_name: uploadData.file.name,
      expiry_date: uploadData.expiry_date || null,
      notes: uploadData.notes || null,
      uploaded_by_type: "admin",
      uploaded_by_admin_id: adminSession!.id,
    });
    
    if (insertError) {
      alert(t("trailers.failCreate") + insertError.message);
      setUploading(false);
      return;
    }
    
    setUploadDialogOpen(false);
    setUploadData({ document_type_id: "", file: null, expiry_date: "", notes: "" });
    setUploading(false);
    fetchDocuments();
  };
  
  const handleUpdateDocument = async () => {
    if (!selectedDocument) return;
    const supabase = createClient();
    await supabase.from("documents").update({
      expiry_date: uploadData.expiry_date || null,
      notes: uploadData.notes || null,
    }).eq("id", selectedDocument.id);
    
    setDocEditDialogOpen(false);
    setSelectedDocument(null);
    fetchDocuments();
  };
  
  const handleDeleteDocument = async () => {
    if (!selectedDocument) return;
    const supabase = createClient();
    
    const filePath = selectedDocument.file_url.split("/documents/")[1];
    if (filePath) {
      await supabase.storage.from("documents").remove([filePath]);
    }
    await supabase.from("documents").delete().eq("id", selectedDocument.id);
    
    setDocDeleteDialogOpen(false);
    setSelectedDocument(null);
    fetchDocuments();
  };
  
  const getDocumentStatus = (doc: Document) => {
    if (!doc.document_type?.requires_expiry || !doc.expiry_date) {
      return { status: "valid", label: t("trailers.valid"), color: "bg-green-500/20 text-green-400" };
    }
    const today = new Date();
    const expiry = new Date(doc.expiry_date);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return { status: "expired", label: t("trailers.expired"), color: "bg-red-500/20 text-red-400" };
    if (daysUntilExpiry <= 30) return { status: "expiring", label: `${t("trailers.expiresIn")} ${daysUntilExpiry} ${t("trailers.days")}`, color: "bg-yellow-500/20 text-yellow-400" };
    return { status: "valid", label: t("trailers.valid"), color: "bg-green-500/20 text-green-400" };
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trailer) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">{t("trailers.trailerNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/trailers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{trailer.plate_number}</h1>
              <Badge variant={trailer.is_active ? "default" : "secondary"}>
                {trailer.is_active ? t("trailers.active") : t("trailers.inactive")}
              </Badge>
              {trailer.adr_certified && (
                <Badge variant="outline" className="border-amber-500 text-amber-500">ADR</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {typeLabel(trailer.trailer_type)} {trailer.make && `- ${trailer.make}`} {trailer.model && trailer.model}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={toggleActive} className="bg-transparent">
            {trailer.is_active ? (
              <><XCircle className="h-4 w-4 mr-2" /> {t("trailers.deactivate")}</>
            ) : (
              <><CheckCircle className="h-4 w-4 mr-2" /> {t("trailers.activate")}</>
            )}
          </Button>
          <Button onClick={openEditDialog}>
            <Edit className="h-4 w-4 mr-2" />
            {t("trailers.edit")}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t("trailers.overview")}</TabsTrigger>
          <TabsTrigger value="documents">{t("trailers.documentsTab")} ({documents.length})</TabsTrigger>
          <TabsTrigger value="maintenance">{t("trailers.maintenanceTab")} ({maintenanceCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Basic Info Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Container className="h-5 w-5" />
                  {t("trailers.trailerInformation")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{t("trailers.plateNumber").replace(" *", "")}</p>
                  <p className="font-medium">{trailer.plate_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("trailers.type")}</p>
                  <p className="font-medium">{typeLabel(trailer.trailer_type)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("trailers.makeModel")}</p>
                  <p className="font-medium">
                    {[trailer.make, trailer.model].filter(Boolean).join(" ") || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("trailers.year")}</p>
                  <p className="font-medium">{trailer.year || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("trailers.vinNumber")}</p>
                  <p className="font-medium font-mono text-sm">{trailer.vin_number || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("trailers.registrationCountry")}</p>
                  <p className="font-medium">{trailer.registration_country || "-"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Capacity Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Weight className="h-5 w-5" />
                  {t("trailers.capacity")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("trailers.maxWeight").replace(" (kg)", "")}</span>
                  <span className="font-medium">
                    {trailer.max_weight_kg ? `${(trailer.max_weight_kg / 1000).toFixed(1)} t` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("trailers.maxPallets")}</span>
                  <span className="font-medium flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {trailer.max_pallets || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("trailers.loadingMeters")}</span>
                  <span className="font-medium">{trailer.loading_meters ? `${trailer.loading_meters} m` : "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("trailers.volume").replace(" (m3)", "")}</span>
                  <span className="font-medium">{trailer.volume_m3 ? `${trailer.volume_m3} m³` : "-"}</span>
                </div>
              </CardContent>
            </Card>

            {/* GPS Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {t("trailers.gpsTracking")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trailer.traccar_device_id ? (
                  <div className="space-y-3">
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      <MapPin className="h-3 w-3 mr-1" />
                      {t("trailers.gpsConnected")}
                    </Badge>
                    {gpsData && (
                      <>
                        {gpsData.mileage !== null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Gauge className="h-3 w-3" />
                              {t("trailers.mileage")}
                            </span>
                            <span className="font-medium">{gpsData.mileage.toLocaleString()} km</span>
                          </div>
                        )}
                        {gpsData.hours !== null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {t("trailers.hours")}
                            </span>
                            <span className="font-medium">{gpsData.hours.toLocaleString()} h</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("trailers.noGpsLinked")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Compliance & Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t("trailers.complianceImportantDates")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={`p-2 rounded-lg ${trailer.adr_certified ? "bg-amber-500/10" : "bg-muted"}`}>
                    <AlertTriangle className={`h-5 w-5 ${trailer.adr_certified ? "text-amber-500" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("trailers.adrCertified")}</p>
                    <p className="font-medium">{trailer.adr_certified ? t("trailers.yes") : t("trailers.no")}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-lg ${isExpired(trailer.next_inspection_date) ? "bg-destructive/10" : isExpiringSoon(trailer.next_inspection_date) ? "bg-amber-500/10" : "bg-muted/50"}`}>
                  <div className="p-2 rounded-lg bg-muted">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("trailers.nextInspection")}</p>
                    <p className={`font-medium ${isExpired(trailer.next_inspection_date) ? "text-destructive" : isExpiringSoon(trailer.next_inspection_date) ? "text-amber-500" : ""}`}>
                      {formatDate(trailer.next_inspection_date)}
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-lg ${isExpired(trailer.insurance_expiry) ? "bg-destructive/10" : isExpiringSoon(trailer.insurance_expiry) ? "bg-amber-500/10" : "bg-muted/50"}`}>
                  <div className="p-2 rounded-lg bg-muted">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("trailers.insuranceExpiry")}</p>
                    <p className={`font-medium ${isExpired(trailer.insurance_expiry) ? "text-destructive" : isExpiringSoon(trailer.insurance_expiry) ? "text-amber-500" : ""}`}>
                      {formatDate(trailer.insurance_expiry)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-lg bg-muted">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("trailers.created")}</p>
                    <p className="font-medium">{formatDate(trailer.created_at)}</p>
                  </div>
                </div>
              </div>
              {trailer.notes && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-1">{t("trailers.notes")}</p>
                  <p className="text-sm">{trailer.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-lg text-destructive">{t("trailers.dangerZone")}</CardTitle>
              <CardDescription>{t("trailers.irreversibleActions")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t("trailers.deleteTrailer")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("trailers.documentsTab")}
                </CardTitle>
                <CardDescription>{t("trailers.trailerDocuments")}</CardDescription>
              </div>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("trailers.uploadDocument")}
              </Button>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t("trailers.noDocsYet")}</p>
                  <Button onClick={() => setUploadDialogOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    {t("trailers.uploadFirstDoc")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => {
                    const docStatus = getDocumentStatus(doc);
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-muted">
                            <FileText className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{doc.document_type?.name || t("trailers.unknownType")}</span>
                              <Badge className={docStatus.color}>{docStatus.label}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {doc.file_name}{doc.document_number && ` • ${doc.document_number}`}
                            </div>
                            {doc.expiry_date && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Calendar className="h-3 w-3" />
                                {t("trailers.expires")} {new Date(doc.expiry_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedDocument(doc); setPreviewDialogOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <a href={doc.file_url} download={doc.file_name}>
                            <Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button>
                          </a>
                          <Button variant="ghost" size="icon" onClick={() => {
                            setSelectedDocument(doc);
                            setUploadData({ document_type_id: doc.document_type_id, file: null, expiry_date: doc.expiry_date || "", notes: doc.notes || "" });
                            setDocEditDialogOpen(true);
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedDocument(doc); setDocDeleteDialogOpen(true); }}>
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
        </TabsContent>

        <TabsContent value="maintenance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  {t("trailers.maintenanceTab")}
                </CardTitle>
                <CardDescription>{t("trailers.maintenanceRecords")}</CardDescription>
              </div>
              <Link href={`/admin/maintenance?trailer=${trailer.id}`}>
                <Button variant="outline" className="bg-transparent">
                  {t("trailers.viewAllMaintenance")}
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8">
                <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
                <div className="text-3xl font-bold mb-2">{maintenanceCount}</div>
                <p className="text-muted-foreground mb-4">{t("trailers.totalMaintenanceRecords")}</p>
                <Link href={`/admin/maintenance?trailer=${trailer.id}`}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("trailers.addMaintenanceRecord")}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("trailers.editTrailer")}</DialogTitle>
            <DialogDescription>{t("trailers.updateInfo")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("trailers.plateNumber")}</Label>
                <Input value={formData.plate_number} onChange={(e) => setFormData((p) => ({ ...p, plate_number: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("trailers.type")}</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAILER_TYPES.map((tp) => <SelectItem key={tp.value} value={tp.value}>{typeLabel(tp.value)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("trailers.make")}</Label>
                <Input value={formData.make} onChange={(e) => setFormData((p) => ({ ...p, make: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("trailers.model")}</Label>
                <Input value={formData.model} onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("trailers.year")}</Label>
                <Input type="number" value={formData.year} onChange={(e) => setFormData((p) => ({ ...p, year: e.target.value }))} />
              </div>
            </div>

            {/* Capacity */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">{t("trailers.capacity")}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("trailers.maxWeight")}</Label>
                  <Input type="number" value={formData.max_weight_kg} onChange={(e) => setFormData((p) => ({ ...p, max_weight_kg: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("trailers.maxPallets")}</Label>
                  <Input type="number" value={formData.max_pallets} onChange={(e) => setFormData((p) => ({ ...p, max_pallets: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("trailers.loadingMeters")}</Label>
                  <Input type="number" step="0.1" value={formData.loading_meters} onChange={(e) => setFormData((p) => ({ ...p, loading_meters: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("trailers.volume")}</Label>
                  <Input type="number" step="0.1" value={formData.volume_m3} onChange={(e) => setFormData((p) => ({ ...p, volume_m3: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* GPS Device */}
            {traccarConfigured && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-3">{t("trailers.gpsTracking")}</p>
                <div className="space-y-2">
                  <Label>{t("trailers.gpsDevice")}</Label>
                  <Select
                    value={formData.traccar_device_id}
                    onValueChange={(v) => setFormData((p) => ({ ...p, traccar_device_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("trailers.selectGpsDevice")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("trailers.noDevice")}</SelectItem>
                      {traccarDevices.map((device) => (
                        <SelectItem key={device.id} value={device.id.toString()}>
                          {device.name} ({device.uniqueId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Registration */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">{t("trailers.registration")}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("trailers.vinNumber")}</Label>
                  <Input value={formData.vin_number} onChange={(e) => setFormData((p) => ({ ...p, vin_number: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("trailers.registrationCountry")}</Label>
                  <Input value={formData.registration_country} onChange={(e) => setFormData((p) => ({ ...p, registration_country: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Compliance */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">{t("trailers.complianceDates")}</p>
              <div className="flex items-center gap-3 mb-4">
                <Switch checked={formData.adr_certified} onCheckedChange={(v) => setFormData((p) => ({ ...p, adr_certified: v }))} id="adr" />
                <Label htmlFor="adr" className="cursor-pointer">{t("trailers.adrCertifiedDanger")}</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("trailers.nextInspection")}</Label>
                  <Input type="date" value={formData.next_inspection_date} onChange={(e) => setFormData((p) => ({ ...p, next_inspection_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("trailers.insuranceExpiry")}</Label>
                  <Input type="date" value={formData.insurance_expiry} onChange={(e) => setFormData((p) => ({ ...p, insurance_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t("trailers.notes")}</Label>
              <Input value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="bg-transparent">{t("trailers.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !formData.plate_number.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("trailers.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trailers.uploadDocument")}</DialogTitle>
            <DialogDescription>{t("trailers.uploadDocDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("trailers.documentTypeLabel")}</Label>
              <Select value={uploadData.document_type_id} onValueChange={(v) => setUploadData((p) => ({ ...p, document_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("trailers.selectTypePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("trailers.fileLabel")}</Label>
              <Input type="file" onChange={(e) => setUploadData((p) => ({ ...p, file: e.target.files?.[0] || null }))} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            </div>
            <div className="space-y-2">
              <Label>{t("trailers.expiryDate")}</Label>
              <Input type="date" value={uploadData.expiry_date} onChange={(e) => setUploadData((p) => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("trailers.notes")}</Label>
              <Input value={uploadData.notes} onChange={(e) => setUploadData((p) => ({ ...p, notes: e.target.value }))} placeholder={t("trailers.optionalNotes")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)} className="bg-transparent">{t("trailers.cancel")}</Button>
            <Button onClick={handleUploadDocument} disabled={uploading || !uploadData.document_type_id || !uploadData.file}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("trailers.upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={docEditDialogOpen} onOpenChange={setDocEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trailers.editDocument")}</DialogTitle>
            <DialogDescription>{t("trailers.updateDocDetails")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("trailers.expiryDate")}</Label>
              <Input type="date" value={uploadData.expiry_date} onChange={(e) => setUploadData((p) => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("trailers.notes")}</Label>
              <Input value={uploadData.notes} onChange={(e) => setUploadData((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocEditDialogOpen(false)} className="bg-transparent">{t("trailers.cancel")}</Button>
            <Button onClick={handleUpdateDocument}>{t("trailers.saveChanges")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Document Confirmation */}
      <Dialog open={docDeleteDialogOpen} onOpenChange={setDocDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trailers.deleteDocument")}</DialogTitle>
            <DialogDescription>{t("trailers.deleteDocConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDeleteDialogOpen(false)} className="bg-transparent">{t("trailers.cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteDocument}>{t("trailers.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Document Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedDocument?.document_type?.name || t("trailers.document")}</DialogTitle>
            <DialogDescription>{selectedDocument?.file_name}</DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="flex-1 overflow-auto">
              {selectedDocument.file_url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                <img src={selectedDocument.file_url} alt={selectedDocument.file_name} className="max-w-full h-auto" />
              ) : selectedDocument.file_url.match(/\.pdf$/i) ? (
                <iframe src={selectedDocument.file_url} className="w-full h-[70vh]" title={selectedDocument.file_name} />
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t("trailers.previewNotAvailable")}</p>
                  <a href={selectedDocument.file_url} download={selectedDocument.file_name}>
                    <Button><Download className="h-4 w-4 mr-2" />{t("trailers.downloadFile")}</Button>
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
