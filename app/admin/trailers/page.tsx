"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Container,
  MapPin,
  Weight,
  Layers,
  AlertTriangle,
  Download,
  Check,
  Gauge,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Building2,
  ChevronsUpDown,
  Users,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";

interface BusinessPartner {
  id: string;
  name: string;
  types?: string[];
}

interface FleetGroup {
  id: string;
  name: string;
  color: string;
}

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
  lastUpdate: string | null;
  category: string | null;
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
  is_subcontractor?: boolean;
  business_partner_id?: string;
  fleet_group_id?: string;
  business_partner?: { id: string; name: string } | null;
  fleet_group?: { id: string; name: string; color: string } | null;
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
  isSubcontractor: boolean;
  business_partner_id: string;
  fleet_group_id: string;
}

const EMPTY_FORM: FormData = {
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
  isSubcontractor: false,
  business_partner_id: "",
  fleet_group_id: "",
};

export default function TrailersPage() {
  const router = useRouter();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<Trailer | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  // Traccar GPS
  const [traccarDevices, setTraccarDevices] = useState<TraccarDevice[]>([]);
  const [traccarConfigured, setTraccarConfigured] = useState(false);
  const [trailerOdometers, setTrailerOdometers] = useState<Record<string, { mileage: number | null; hours: number | null }>>({});

  // Import from GPS state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDevices, setImportDevices] = useState<TraccarDevice[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const [selectedImportIds, setSelectedImportIds] = useState<Set<number>>(new Set());
  const [importingIds, setImportingIds] = useState<Set<number>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());
  const [existingDeviceIds, setExistingDeviceIds] = useState<Set<string>>(new Set());
  const [existingPlates, setExistingPlates] = useState<Set<string>>(new Set());
  const [importFilter, setImportFilter] = useState<"all" | "not_imported" | "in_vehicles" | "in_trailers">("all");
  // Track which devices are in vehicles vs trailers
  const [vehicleDeviceIds, setVehicleDeviceIds] = useState<Set<string>>(new Set());
  const [trailerDeviceIds, setTrailerDeviceIds] = useState<Set<string>>(new Set());
  
  // Business partners for subcontractor selection
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [partnerPopoverOpen, setPartnerPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  
  // Fleet groups
  const [fleetGroups, setFleetGroups] = useState<FleetGroup[]>([]);

  const fetchBusinessPartners = async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("business_partners")
      .select("id, name, types")
      .eq("admin_id", adminSession.id)
      .order("name");
    if (data) setBusinessPartners(data);
  };

  const fetchFleetGroups = async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("fleet_groups")
      .select("id, name, color")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name");
    if (data) setFleetGroups(data);
  };

  const fetchTraccarDevices = async () => {
    if (!adminSession?.id) return;
    try {
      const response = await fetch(`/api/traccar?action=devices&adminId=${adminSession.id}`);
      const data = await response.json();
      if (response.ok && data.devices) {
        // Filter for trailers (category = 'trailer' or name contains trailer-like patterns)
        const allDevices = data.devices;
        setTraccarDevices(allDevices);
        setTraccarConfigured(true);
      }
    } catch {
      setTraccarConfigured(false);
    }
  };

  const fetchTrailerOdometers = async (trailersList: Trailer[]) => {
    if (!adminSession?.id) return;
    const trailersWithDevices = trailersList.filter((t) => t.traccar_device_id);
    if (trailersWithDevices.length === 0) return;

    const odometers: Record<string, { mileage: number | null; hours: number | null }> = {};
    for (const trailer of trailersWithDevices) {
      try {
        const response = await fetch(
          `/api/traccar?action=vehicle-data&adminId=${adminSession.id}&deviceId=${trailer.traccar_device_id}`
        );
        const data = await response.json();
        if (response.ok) {
          odometers[trailer.id] = {
            mileage: data.totalDistance,
            hours: data.engineHours,
          };
        }
      } catch {
        // Ignore individual errors
      }
    }
    setTrailerOdometers(odometers);
  };

  const fetchTrailers = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("trailers")
      .select(`
        *,
        business_partner:business_partner_id(id, name),
        fleet_group:fleet_group_id(id, name, color)
      `)
      .eq("admin_id", adminSession.id)
      .order("plate_number");
    if (data) {
      setTrailers(data);
      fetchTrailerOdometers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (adminSession?.id) {
      fetchTrailers();
      fetchTraccarDevices();
      fetchBusinessPartners();
      fetchFleetGroups();
    }
  }, [adminSession?.id]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingTrailer(null);
  };

  const handleOpenDialog = (trailer?: Trailer) => {
    if (trailer) {
      setEditingTrailer(trailer);
      const trailerWithExtras = trailer as Trailer & { is_subcontractor?: boolean; business_partner_id?: string; fleet_group_id?: string };
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
        isSubcontractor: !!trailerWithExtras.is_subcontractor,
        business_partner_id: trailerWithExtras.business_partner_id || "",
        fleet_group_id: trailerWithExtras.fleet_group_id || "",
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.plate_number.trim()) return;
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
      is_subcontractor: formData.isSubcontractor,
      business_partner_id: formData.isSubcontractor ? formData.business_partner_id || null : null,
      fleet_group_id: formData.fleet_group_id || null,
    };

    if (editingTrailer) {
      const { error } = await supabase
        .from("trailers")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingTrailer.id);
      if (error) { alert("Failed to update: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from("trailers")
        .insert({ ...payload, admin_id: adminSession?.id });
      if (error) { alert("Failed to create: " + error.message); setSaving(false); return; }
    }

    setDialogOpen(false);
    resetForm();
    fetchTrailers();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trailer?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("trailers").delete().eq("id", id);
    if (error) { alert("Failed to delete: " + error.message); return; }
    fetchTrailers();
  };

  const toggleActive = async (trailer: Trailer) => {
    const supabase = createClient();
    await supabase.from("trailers").update({ is_active: !trailer.is_active }).eq("id", trailer.id);
    fetchTrailers();
  };

  // Import from GPS functions
  const openImportDialog = async () => {
    if (!adminSession?.id) return;
    setImportDialogOpen(true);
    setImportLoading(true);
    setSelectedImportIds(new Set());
    setImportedIds(new Set());
    setImportSearch("");
    setImportFilter("all");

    try {
      const devRes = await fetch(`/api/traccar?action=devices&adminId=${adminSession.id}`);
      const devData = await devRes.json();
      if (devRes.ok && devData.devices) {
        setImportDevices(devData.devices);
      }

      const supabase = createClient();
      
      // Fetch existing trailers
      const { data: existingTrailers } = await supabase
        .from("trailers")
        .select("traccar_device_id, plate_number")
        .eq("admin_id", adminSession.id);
      
      // Also fetch existing vehicles to check cross-table
      const { data: existingVehicles } = await supabase
        .from("vehicles")
        .select("traccar_device_id, plate_number")
        .eq("admin_id", adminSession.id);

      // Build sets for trailers
      const trailerDevSet = new Set<string>();
      const trailerPlateSet = new Set<string>();
      for (const t of existingTrailers || []) {
        if (t.traccar_device_id) trailerDevSet.add(String(t.traccar_device_id));
        if (t.plate_number) trailerPlateSet.add(t.plate_number.toUpperCase().replace(/[\s-]/g, ""));
      }
      setTrailerDeviceIds(trailerDevSet);
      
      // Build sets for vehicles
      const vehicleDevSet = new Set<string>();
      const vehiclePlateSet = new Set<string>();
      for (const v of existingVehicles || []) {
        if (v.traccar_device_id) vehicleDevSet.add(String(v.traccar_device_id));
        if (v.plate_number) vehiclePlateSet.add(v.plate_number.toUpperCase().replace(/[\s-]/g, ""));
      }
      setVehicleDeviceIds(vehicleDevSet);
      
      // Combined sets for overall "existing" check
      const allDevIds = new Set([...trailerDevSet, ...vehicleDevSet]);
      const allPlates = new Set([...trailerPlateSet, ...vehiclePlateSet]);
      setExistingDeviceIds(allDevIds);
      setExistingPlates(allPlates);
    } catch {
      // silent
    }
    setImportLoading(false);
  };

  const isDeviceExisting = (device: TraccarDevice): boolean => {
    if (existingDeviceIds.has(String(device.id))) return true;
    const normalized = device.name.toUpperCase().replace(/[\s-]/g, "");
    return existingPlates.has(normalized);
  };
  
  // Get where device is imported: "vehicle", "trailer", or null
  const getDeviceLocation = (device: TraccarDevice): "vehicle" | "trailer" | null => {
    const devId = String(device.id);
    const normalized = device.name.toUpperCase().replace(/[\s-]/g, "");
    if (vehicleDeviceIds.has(devId)) return "vehicle";
    if (trailerDeviceIds.has(devId)) return "trailer";
    // Check by plate name as fallback
    // Note: we can't reliably distinguish by plate, so only check device IDs
    return null;
  };

  const toggleImportSelection = (deviceId: number) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const toggleSelectAllImportable = () => {
    const importable = importDevices.filter((d) => !isDeviceExisting(d) && !importedIds.has(d.id));
    const filtered = importable.filter((d) => {
      if (!importSearch) return true;
      const q = importSearch.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.uniqueId.toLowerCase().includes(q);
    });
    const allSelected = filtered.every((d) => selectedImportIds.has(d.id));
    if (allSelected) {
      setSelectedImportIds((prev) => {
        const next = new Set(prev);
        for (const d of filtered) next.delete(d.id);
        return next;
      });
    } else {
      setSelectedImportIds((prev) => {
        const next = new Set(prev);
        for (const d of filtered) next.add(d.id);
        return next;
      });
    }
  };

  const handleImportSelected = async () => {
    if (!adminSession?.id || selectedImportIds.size === 0) return;
    const supabase = createClient();
    const toImport = importDevices.filter((d) => selectedImportIds.has(d.id));

    for (const device of toImport) {
      setImportingIds((prev) => new Set(prev).add(device.id));
      try {
        const { error } = await supabase.from("trailers").insert({
          admin_id: adminSession.id,
          plate_number: device.name,
          traccar_device_id: device.id,
          model: device.model || null,
          trailer_type: "curtain_side",
          is_active: true,
        });
        if (!error) {
          setImportedIds((prev) => new Set(prev).add(device.id));
          setExistingDeviceIds((prev) => new Set(prev).add(String(device.id)));
          setExistingPlates((prev) => new Set(prev).add(device.name.toUpperCase().replace(/[\s-]/g, "")));
        }
      } catch {
        // silent
      }
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
    setSelectedImportIds(new Set());
    fetchTrailers();
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus]);

  // Filtering
  const filteredTrailers = trailers.filter((t) => {
    if (filterType !== "all" && t.trailer_type !== filterType) return false;
    if (filterStatus === "active" && !t.is_active) return false;
    if (filterStatus === "inactive" && t.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.plate_number.toLowerCase().includes(q) ||
        t.make?.toLowerCase().includes(q) ||
        t.model?.toLowerCase().includes(q) ||
        t.vin_number?.toLowerCase().includes(q);
    }
    return true;
  });
  
  // Pagination calculations
  const totalCount = filteredTrailers.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const paginatedTrailers = filteredTrailers.slice(startIndex, endIndex);

  const typeLabel = (type: string) => TRAILER_TYPES.find((t) => t.value === type)?.label || type;

  // Stats
  const stats = {
    total: trailers.length,
    active: trailers.filter((t) => t.is_active).length,
    gpsTracked: trailers.filter((t) => t.traccar_device_id).length,
    adr: trailers.filter((t) => t.adr_certified).length,
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  };
  
  const isExpired = (date: string | null) => date ? new Date(date) < new Date() : false;

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trailers</h1>
          <p className="text-muted-foreground">
            Manage your trailer fleet with GPS tracking support
          </p>
        </div>
        <div className="flex items-center gap-2">
          {traccarConfigured && (adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["trailers:create"]) && (
            <Button variant="outline" onClick={openImportDialog} className="bg-transparent">
              <Download className="h-4 w-4 mr-2" />
              Import from GPS
            </Button>
          )}
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["trailers:create"]) && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Trailer
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Container className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <MapPin className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.gpsTracked}</p>
                <p className="text-xs text-muted-foreground">GPS Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.adr}</p>
                <p className="text-xs text-muted-foreground">ADR Certified</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by plate, make, model, VIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TRAILER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
<TableHeader>
  <TableRow>
  <TableHead>Plate / Type</TableHead>
  <TableHead>Make / Model</TableHead>
  <TableHead>Business Partner</TableHead>
  <TableHead>Fleet Group</TableHead>
  <TableHead className="text-center">Capacity</TableHead>
  <TableHead className="text-center">GPS</TableHead>
  <TableHead>Status</TableHead>
  <TableHead className="text-right">Actions</TableHead>
  </TableRow>
  </TableHeader>
          <TableBody>
{paginatedTrailers.length === 0 ? (
  <TableRow>
  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
  {searchQuery || filterType !== "all" || filterStatus !== "all"
  ? "No trailers match your filters"
  : "No trailers yet. Add your first trailer."}
  </TableCell>
  </TableRow>
  ) : (
              paginatedTrailers.map((trailer) => (
                <TableRow 
                  key={trailer.id} 
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${!trailer.is_active ? "opacity-50" : ""}`}
                  onClick={() => router.push(`/admin/trailers/${trailer.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Container className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{trailer.plate_number}</span>
                          {trailer.adr_certified && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-500">ADR</Badge>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-[10px] mt-0.5">{typeLabel(trailer.trailer_type)}</Badge>
                      </div>
                    </div>
                  </TableCell>
<TableCell>
  <span className="text-sm text-muted-foreground">
  {[trailer.make, trailer.model, trailer.year].filter(Boolean).join(" ") || "-"}
  </span>
  </TableCell>
  <TableCell>
  {trailer.business_partner ? (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{trailer.business_partner.name}</span>
    </div>
  ) : (
    <span className="text-xs text-muted-foreground">-</span>
  )}
  </TableCell>
  <TableCell>
  {trailer.fleet_group ? (
    <Badge variant="outline" className="text-xs gap-1.5">
      <div 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: `var(--${trailer.fleet_group.color}-500, #888)` }}
      />
      {trailer.fleet_group.name}
    </Badge>
  ) : (
    <span className="text-xs text-muted-foreground">-</span>
  )}
  </TableCell>
  <TableCell>
  <div className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground">
  {trailer.max_pallets && (
  <span className="flex items-center gap-1">
  <Layers className="h-3 w-3" />
  {trailer.max_pallets} pallets
  </span>
  )}
                      {trailer.loading_meters && (
                        <span>{trailer.loading_meters}m</span>
                      )}
                      {trailer.max_weight_kg && (
                        <span className="flex items-center gap-1">
                          <Weight className="h-3 w-3" />
                          {(trailer.max_weight_kg / 1000).toFixed(1)}t
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {trailer.traccar_device_id ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                          <MapPin className="h-3 w-3 mr-1" />
                          GPS
                        </Badge>
                        {trailerOdometers[trailer.id] && (
                          <div className="flex gap-2 text-[10px] text-muted-foreground">
                            {trailerOdometers[trailer.id].mileage !== null && (
                              <span className="flex items-center gap-0.5">
                                <Gauge className="h-2.5 w-2.5" />
                                {trailerOdometers[trailer.id].mileage?.toLocaleString()}km
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={trailer.is_active ? "default" : "secondary"} className="text-[10px] w-fit">
                        {trailer.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {isExpired(trailer.insurance_expiry) && (
                        <Badge variant="destructive" className="text-[10px] w-fit">Insurance Expired</Badge>
                      )}
                      {isExpiringSoon(trailer.insurance_expiry) && !isExpired(trailer.insurance_expiry) && (
                        <Badge variant="outline" className="text-[10px] w-fit border-amber-500 text-amber-500">Ins. Expiring</Badge>
                      )}
                      {isExpired(trailer.next_inspection_date) && (
                        <Badge variant="destructive" className="text-[10px] w-fit">Inspection Due</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/trailers/${trailer.id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDialog(trailer)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(trailer)}>
                          {trailer.is_active ? (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(trailer.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-3 border-t">
          <p className="text-sm text-muted-foreground">
            {totalCount > 0
              ? `${startIndex + 1}-${endIndex} of ${totalCount} trailers`
              : "No trailers"
            }
          </p>
          <div className="flex items-center gap-4">
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8" 
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => 
                    p === "..." ? (
                      <span key={`dots-${i}`} className="text-sm text-muted-foreground px-1">...</span>
                    ) : (
                      <Button
                        key={p}
                        variant={currentPage === p ? "default" : "ghost"}
                        size="icon"
                        className={`h-8 w-8 text-sm ${currentPage === p ? "bg-primary text-primary-foreground" : ""}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8" 
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingTrailer ? "Edit Trailer" : "Add New Trailer"}</DialogTitle>
            <DialogDescription>
              {editingTrailer ? "Update trailer information" : "Add a new trailer to your fleet"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2 overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plate Number *</Label>
                <Input value={formData.plate_number} onChange={(e) => setFormData((p) => ({ ...p, plate_number: e.target.value }))} placeholder="AB-12-CDE" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRAILER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Make</Label>
                <Input value={formData.make} onChange={(e) => setFormData((p) => ({ ...p, make: e.target.value }))} placeholder="Schmitz" />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={formData.model} onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))} placeholder="S.CS" />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input type="number" value={formData.year} onChange={(e) => setFormData((p) => ({ ...p, year: e.target.value }))} placeholder="2023" />
              </div>
            </div>

            {/* Capacity */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">Capacity</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Weight (kg)</Label>
                  <Input type="number" value={formData.max_weight_kg} onChange={(e) => setFormData((p) => ({ ...p, max_weight_kg: e.target.value }))} placeholder="24000" />
                </div>
                <div className="space-y-2">
                  <Label>Max Pallets</Label>
                  <Input type="number" value={formData.max_pallets} onChange={(e) => setFormData((p) => ({ ...p, max_pallets: e.target.value }))} placeholder="33" />
                </div>
                <div className="space-y-2">
                  <Label>Loading Meters</Label>
                  <Input type="number" step="0.1" value={formData.loading_meters} onChange={(e) => setFormData((p) => ({ ...p, loading_meters: e.target.value }))} placeholder="13.6" />
                </div>
                <div className="space-y-2">
                  <Label>Volume (m3)</Label>
                  <Input type="number" step="0.1" value={formData.volume_m3} onChange={(e) => setFormData((p) => ({ ...p, volume_m3: e.target.value }))} placeholder="90" />
                </div>
              </div>
            </div>

            {/* GPS Device */}
            {traccarConfigured && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-3">GPS Tracking</p>
                <div className="space-y-2">
                  <Label>GPS Device (Traccar)</Label>
                  <Select
                    value={formData.traccar_device_id}
                    onValueChange={(v) => setFormData((p) => ({ ...p, traccar_device_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select GPS device (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No device</SelectItem>
                      {traccarDevices.map((device) => (
                        <SelectItem key={device.id} value={device.id.toString()}>
                          {device.name} ({device.uniqueId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Link to a GPS device to track location and mileage
                  </p>
                </div>
              </div>
            )}

            {/* Registration */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">Registration</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>VIN Number</Label>
                  <Input value={formData.vin_number} onChange={(e) => setFormData((p) => ({ ...p, vin_number: e.target.value }))} placeholder="WKESDZ271LB123456" />
                </div>
                <div className="space-y-2">
                  <Label>Registration Country</Label>
                  <Input value={formData.registration_country} onChange={(e) => setFormData((p) => ({ ...p, registration_country: e.target.value }))} placeholder="RO" />
                </div>
              </div>
            </div>

            {/* Compliance */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">Compliance & Dates</p>
              <div className="flex items-center gap-3 mb-4">
                <Switch checked={formData.adr_certified} onCheckedChange={(v) => setFormData((p) => ({ ...p, adr_certified: v }))} id="adr" />
                <Label htmlFor="adr" className="cursor-pointer">ADR Certified (Dangerous Goods)</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Next Inspection</Label>
                  <Input type="date" value={formData.next_inspection_date} onChange={(e) => setFormData((p) => ({ ...p, next_inspection_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Insurance Expiry</Label>
                  <Input type="date" value={formData.insurance_expiry} onChange={(e) => setFormData((p) => ({ ...p, insurance_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Subcontractor Section */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Subcontractor Trailer
                  </Label>
                  <p className="text-xs text-muted-foreground">This trailer belongs to an external partner</p>
                </div>
                <Switch
                  checked={formData.isSubcontractor}
                  onCheckedChange={(checked) => setFormData((p) => ({ ...p, isSubcontractor: checked, business_partner_id: checked ? p.business_partner_id : "" }))}
                />
              </div>
              
              {formData.isSubcontractor && (
                <div className="space-y-2 pl-6 border-l-2 border-orange-500/30">
                  <Label>Business Partner</Label>
                  <Popover open={partnerPopoverOpen} onOpenChange={setPartnerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={partnerPopoverOpen}
                        className="w-full justify-between bg-transparent font-normal"
                      >
                        {formData.business_partner_id
                          ? businessPartners.find((p) => p.id === formData.business_partner_id)?.name
                          : "Select business partner..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search partners..." />
                        <CommandList>
                          <CommandEmpty>No partner found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setFormData((p) => ({ ...p, business_partner_id: "" }));
                                setPartnerPopoverOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${!formData.business_partner_id ? "opacity-100" : "opacity-0"}`} />
                              No partner selected
                            </CommandItem>
                            {businessPartners.map((partner) => (
                              <CommandItem
                                key={partner.id}
                                value={partner.name}
                                onSelect={() => {
                                  setFormData((p) => ({ ...p, business_partner_id: partner.id }));
                                  setPartnerPopoverOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${formData.business_partner_id === partner.id ? "opacity-100" : "opacity-0"}`} />
                                <div className="flex flex-col">
                                  <span>{partner.name}</span>
                                  {partner.types && partner.types.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{partner.types.join(", ")}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

{/* Fleet Group */}
  {fleetGroups.length > 0 && (
  <div className="space-y-2 border-t pt-4">
  <Label>Fleet Group</Label>
  <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={groupPopoverOpen}
        className="w-full justify-between bg-transparent font-normal"
      >
        {formData.fleet_group_id
          ? fleetGroups.find((g) => g.id === formData.fleet_group_id)?.name
          : "Select fleet group (optional)"}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[300px] p-0" align="start">
      <Command>
        <CommandInput placeholder="Search groups..." />
        <CommandList>
          <CommandEmpty>No group found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              value="none"
              onSelect={() => {
                setFormData((p) => ({ ...p, fleet_group_id: "" }));
                setGroupPopoverOpen(false);
              }}
            >
              <Check className={`mr-2 h-4 w-4 ${!formData.fleet_group_id ? "opacity-100" : "opacity-0"}`} />
              No group
            </CommandItem>
            {fleetGroups.map((group) => (
              <CommandItem
                key={group.id}
                value={group.name}
                onSelect={() => {
                  setFormData((p) => ({ ...p, fleet_group_id: group.id }));
                  setGroupPopoverOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${formData.fleet_group_id === group.id ? "opacity-100" : "opacity-0"}`} />
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: `var(--${group.color}-500, #888)` }}
                  />
                  {group.name}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
  <p className="text-xs text-muted-foreground">Organize trailers into groups for easier management</p>
  </div>
  )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="bg-transparent">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formData.plate_number.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTrailer ? "Save Changes" : "Add Trailer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from GPS Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Trailers from GPS</DialogTitle>
            <DialogDescription>
              Select GPS devices to import as trailers. Already linked devices are marked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search devices..."
                  value={importSearch}
                  onChange={(e) => setImportSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={importFilter} onValueChange={(v) => setImportFilter(v as typeof importFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  <SelectItem value="not_imported">Not Imported</SelectItem>
                  <SelectItem value="in_vehicles">In Vehicles</SelectItem>
                  <SelectItem value="in_trailers">In Trailers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-lg">
              {importLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={importDevices.filter((d) => !isDeviceExisting(d) && !importedIds.has(d.id)).length > 0 &&
                            importDevices
                              .filter((d) => !isDeviceExisting(d) && !importedIds.has(d.id))
                              .filter((d) => !importSearch || d.name.toLowerCase().includes(importSearch.toLowerCase()))
                              .every((d) => selectedImportIds.has(d.id))}
                          onCheckedChange={toggleSelectAllImportable}
                        />
                      </TableHead>
                      <TableHead>Device Name</TableHead>
                      <TableHead>Unique ID</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importDevices
                      .filter((d) => {
                        // Search filter
                        if (importSearch) {
                          const q = importSearch.toLowerCase();
                          if (!d.name.toLowerCase().includes(q) && !d.uniqueId.toLowerCase().includes(q)) return false;
                        }
                        // Import status filter
                        const location = getDeviceLocation(d);
                        if (importFilter === "not_imported" && location !== null) return false;
                        if (importFilter === "in_vehicles" && location !== "vehicle") return false;
                        if (importFilter === "in_trailers" && location !== "trailer") return false;
                        return true;
                      })
                      .map((device) => {
                        const location = getDeviceLocation(device);
                        const existing = isDeviceExisting(device);
                        const imported = importedIds.has(device.id);
                        const importing = importingIds.has(device.id);
                        return (
                          <TableRow key={device.id} className={existing && !imported ? "opacity-60" : ""}>
                            <TableCell>
                              {imported ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : importing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Checkbox
                                  checked={selectedImportIds.has(device.id)}
                                  onCheckedChange={() => toggleImportSelection(device.id)}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{device.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{device.uniqueId}</TableCell>
                            <TableCell>
                              {imported ? (
                                <Badge className="text-xs bg-green-500">Imported</Badge>
                              ) : location === "vehicle" ? (
                                <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">In Vehicles</Badge>
                              ) : location === "trailer" ? (
                                <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">In Trailers</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">{device.status || "Available"}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="bg-transparent">Close</Button>
            <Button onClick={handleImportSelected} disabled={selectedImportIds.size === 0}>
              Import {selectedImportIds.size > 0 ? `(${selectedImportIds.size})` : "Selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
