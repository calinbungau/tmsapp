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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  Eye,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Car,
  MapPin,
  Gauge,
  Clock,
  Download,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import type { Vehicle } from "@/lib/types";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Building2, ChevronsUpDown, Users, Fuel } from "lucide-react";

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

interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  model: string | null;
  lastUpdate: string | null;
  category: string | null;
}

interface VehicleWithOdometer extends Vehicle {
  traccar_device_id?: number;
  current_mileage?: number;
  current_engine_hours?: number;
  is_subcontractor?: boolean;
  business_partner_id?: string;
  fleet_group_id?: string;
  business_partner?: { id: string; name: string } | null;
  fleet_group?: { id: string; name: string; color: string } | null;
}

export default function AdminVehiclesPage() {
  const router = useRouter();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [vehicles, setVehicles] = useState<VehicleWithOdometer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleWithOdometer | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterGPS, setFilterGPS] = useState<"all" | "gps" | "no-gps">("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  const [formData, setFormData] = useState({
    plate_number: "",
    make: "",
    model: "",
    year: "",
    color: "",
    traccar_device_id: "",
    isSubcontractor: false,
    business_partner_id: "",
    fleet_group_id: "",
    // Fuel master data — drives the Fuel tab's "Actual L/100km vs Normative" KPI
    // and the per-trip tank-capacity warnings. All four are optional.
    fuel_type: "",
    fuel_consumption_l_per_100km: "",
    tank_capacity_liters: "",
    adblue_capacity_liters: "",
  });
  
  // Business partners for subcontractor selection
  const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
  const [partnerPopoverOpen, setPartnerPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  
  // Fleet groups
  const [fleetGroups, setFleetGroups] = useState<FleetGroup[]>([]);

  // Traccar
  const [traccarDevices, setTraccarDevices] = useState<TraccarDevice[]>([]);
  const [traccarConfigured, setTraccarConfigured] = useState(false);
  const [vehicleOdometers, setVehicleOdometers] = useState<Record<string, { mileage: number | null; hours: number | null }>>({});

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

  const fetchTraccarDevices = async () => {
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
  };

  const fetchVehicleOdometers = async (vehiclesList: VehicleWithOdometer[]) => {
    if (!adminSession?.id) return;
    const vehiclesWithDevices = vehiclesList.filter((v) => v.traccar_device_id);
    if (vehiclesWithDevices.length === 0) return;

    const odometers: Record<string, { mileage: number | null; hours: number | null }> = {};
    for (const vehicle of vehiclesWithDevices) {
      try {
        const response = await fetch(
          `/api/traccar?action=vehicle-data&adminId=${adminSession.id}&deviceId=${vehicle.traccar_device_id}`
        );
        const data = await response.json();
        if (response.ok) {
          odometers[vehicle.id] = {
            mileage: data.totalDistance,
            hours: data.engineHours,
          };
        }
      } catch {
        // Ignore individual errors
      }
    }
    setVehicleOdometers(odometers);
  };

  const fetchVehicles = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        *,
        business_partner:business_partner_id(id, name),
        fleet_group:fleet_group_id(id, name, color)
      `)
      .eq("admin_id", adminSession.id)
      .order("plate_number");

    if (!error && data) {
      setVehicles(data);
      fetchVehicleOdometers(data);
    }
    setLoading(false);
  };

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

  useEffect(() => {
    if (adminSession?.id) {
      fetchVehicles();
      fetchTraccarDevices();
      fetchBusinessPartners();
      fetchFleetGroups();
    }
  }, [adminSession?.id]);

  const resetForm = () => {
    setFormData({ plate_number: "", make: "", model: "", year: "", color: "", traccar_device_id: "", isSubcontractor: false, business_partner_id: "", fleet_group_id: "", fuel_type: "", fuel_consumption_l_per_100km: "", tank_capacity_liters: "", adblue_capacity_liters: "" });
    setEditingVehicle(null);
  };

  const handleOpenDialog = (vehicle?: VehicleWithOdometer) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      const vehicleWithExtras = vehicle as VehicleWithOdometer & { is_subcontractor?: boolean; business_partner_id?: string; fleet_group_id?: string };
      setFormData({
        plate_number: vehicle.plate_number,
        make: vehicle.make || "",
        model: vehicle.model || "",
        year: vehicle.year?.toString() || "",
        color: vehicle.color || "",
        traccar_device_id: vehicle.traccar_device_id?.toString() || "",
        isSubcontractor: !!vehicleWithExtras.is_subcontractor,
        business_partner_id: vehicleWithExtras.business_partner_id || "",
        fleet_group_id: vehicleWithExtras.fleet_group_id || "",
        fuel_type: (vehicle as any).fuel_type ?? "",
        fuel_consumption_l_per_100km: (vehicle as any).fuel_consumption_l_per_100km != null
          ? String((vehicle as any).fuel_consumption_l_per_100km)
          : "",
        tank_capacity_liters: (vehicle as any).tank_capacity_liters != null
          ? String((vehicle as any).tank_capacity_liters)
          : "",
        adblue_capacity_liters: (vehicle as any).adblue_capacity_liters != null
          ? String((vehicle as any).adblue_capacity_liters)
          : "",
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

    const vehicleData = {
      plate_number: formData.plate_number,
      make: formData.make || null,
      model: formData.model || null,
      year: formData.year ? parseInt(formData.year) : null,
      color: formData.color || null,
      traccar_device_id: formData.traccar_device_id ? parseInt(formData.traccar_device_id) : null,
      is_subcontractor: formData.isSubcontractor,
      business_partner_id: formData.isSubcontractor ? formData.business_partner_id || null : null,
      fleet_group_id: formData.fleet_group_id || null,
      fuel_type: formData.fuel_type || null,
      fuel_consumption_l_per_100km: formData.fuel_consumption_l_per_100km
        ? parseFloat(formData.fuel_consumption_l_per_100km)
        : null,
      tank_capacity_liters: formData.tank_capacity_liters
        ? parseFloat(formData.tank_capacity_liters)
        : null,
      adblue_capacity_liters: formData.adblue_capacity_liters
        ? parseFloat(formData.adblue_capacity_liters)
        : null,
    };

    if (editingVehicle) {
      const { error } = await supabase
        .from("vehicles")
        .update({ ...vehicleData, updated_at: new Date().toISOString() })
        .eq("id", editingVehicle.id);

      if (error) {
        alert("Failed to update vehicle: " + error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("vehicles").insert({
        ...vehicleData,
        admin_id: adminSession?.id,
      });

      if (error) {
        alert("Failed to create vehicle: " + error.message);
        setSaving(false);
        return;
      }
    }

    setDialogOpen(false);
    resetForm();
    fetchVehicles();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this vehicle?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) {
      alert("Failed to delete vehicle: " + error.message);
      return;
    }
    fetchVehicles();
  };

  const toggleActive = async (vehicle: Vehicle) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("vehicles")
      .update({ is_active: !vehicle.is_active })
      .eq("id", vehicle.id);
    if (!error) {
      fetchVehicles();
    }
  };

  // Import from GPS functions
  const openImportDialog = async () => {
    if (!adminSession?.id) return;
    setImportDialogOpen(true);
    setImportLoading(true);
    setSelectedImportIds(new Set());
    setImportedIds(new Set());
    setImportSearch("");

    try {
      const devRes = await fetch(`/api/traccar?action=devices&adminId=${adminSession.id}`);
      const devData = await devRes.json();
      if (devRes.ok && devData.devices) {
        setImportDevices(devData.devices);
      }

      const supabase = createClient();
      const { data: existingVehicles } = await supabase
        .from("vehicles")
        .select("traccar_device_id, plate_number")
        .eq("admin_id", adminSession.id);

      const devIdSet = new Set<string>();
      const plateSet = new Set<string>();
      for (const v of existingVehicles || []) {
        if (v.traccar_device_id) devIdSet.add(String(v.traccar_device_id));
        if (v.plate_number) plateSet.add(v.plate_number.toUpperCase().replace(/[\s-]/g, ""));
      }
      setExistingDeviceIds(devIdSet);
      setExistingPlates(plateSet);
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
        const { error } = await supabase.from("vehicles").insert({
          admin_id: adminSession.id,
          plate_number: device.name,
          traccar_device_id: String(device.id),
          model: device.model || null,
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
    fetchVehicles();
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterGPS]);

  // Filtering
  const filteredVehicles = vehicles.filter((v) => {
    if (filterStatus === "active" && !v.is_active) return false;
    if (filterStatus === "inactive" && v.is_active) return false;
    if (filterGPS === "gps" && !v.traccar_device_id) return false;
    if (filterGPS === "no-gps" && v.traccar_device_id) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return v.plate_number.toLowerCase().includes(q) ||
        v.make?.toLowerCase().includes(q) ||
        v.model?.toLowerCase().includes(q);
    }
    return true;
  });
  
  // Pagination
  const totalCount = filteredVehicles.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const paginatedVehicles = filteredVehicles.slice(startIndex, endIndex);

  // Stats
  const stats = {
    total: vehicles.length,
    active: vehicles.filter((v) => v.is_active).length,
    gpsTracked: vehicles.filter((v) => v.traccar_device_id).length,
    inactive: vehicles.filter((v) => !v.is_active).length,
  };

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
          <h1 className="text-2xl font-bold">Vehicles</h1>
          <p className="text-muted-foreground">
            Manage your fleet of vehicles with GPS tracking support
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["vehicles:usage:view"]) && (
            <Link href="/admin/vehicle-usage">
              <Button variant="outline" className="bg-transparent">
                <Clock className="h-4 w-4 mr-2" />
                Vehicle Usage
              </Button>
            </Link>
          )}
          {traccarConfigured && (adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["vehicles:create"]) && (
            <Button variant="outline" onClick={openImportDialog} className="bg-transparent">
              <Download className="h-4 w-4 mr-2" />
              Import from GPS
            </Button>
          )}
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["vehicles:create"]) && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
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
                <Car className="h-5 w-5" />
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
              <div className="p-2 rounded-lg bg-muted">
                <XCircle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.inactive}</p>
                <p className="text-xs text-muted-foreground">Inactive</p>
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
                placeholder="Search by plate, make, model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
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
            <Select value={filterGPS} onValueChange={(v) => setFilterGPS(v as typeof filterGPS)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="GPS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="gps">GPS Tracked</SelectItem>
                <SelectItem value="no-gps">No GPS</SelectItem>
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
              <TableHead>Vehicle</TableHead>
              <TableHead>Make / Model</TableHead>
              <TableHead>Business Partner</TableHead>
              <TableHead>Fleet Group</TableHead>
              <TableHead className="text-center">GPS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedVehicles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {searchQuery || filterStatus !== "all" || filterGPS !== "all"
                    ? "No vehicles match your filters"
                    : "No vehicles yet. Add your first vehicle."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedVehicles.map((vehicle) => (
                <TableRow 
                  key={vehicle.id} 
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${!vehicle.is_active ? "opacity-50" : ""}`}
                  onClick={() => router.push(`/admin/vehicles/${vehicle.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Car className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-medium">{vehicle.plate_number}</span>
                        {vehicle.color && (
                          <p className="text-xs text-muted-foreground">{vehicle.color}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {vehicle.business_partner ? (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{vehicle.business_partner.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {vehicle.fleet_group ? (
                      <Badge variant="outline" className="text-xs gap-1.5">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: `var(--${vehicle.fleet_group.color}-500, #888)` }}
                        />
                        {vehicle.fleet_group.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {vehicle.traccar_device_id ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                          <MapPin className="h-3 w-3 mr-1" />
                          GPS
                        </Badge>
                        {vehicleOdometers[vehicle.id] && (
                          <div className="flex gap-2 text-[10px] text-muted-foreground">
                            {vehicleOdometers[vehicle.id].mileage !== null && (
                              <span className="flex items-center gap-0.5">
                                <Gauge className="h-2.5 w-2.5" />
                                {vehicleOdometers[vehicle.id].mileage?.toLocaleString()}km
                              </span>
                            )}
                            {vehicleOdometers[vehicle.id].hours !== null && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {vehicleOdometers[vehicle.id].hours?.toLocaleString()}h
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
                    <Badge variant={vehicle.is_active ? "default" : "secondary"}>
                      {vehicle.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/vehicles/${vehicle.id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDialog(vehicle)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(vehicle)}>
                          {vehicle.is_active ? (
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
                          onClick={() => handleDelete(vehicle.id)}
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
            {totalCount > 0 ? `${startIndex + 1}-${endIndex} of ${totalCount} vehicles` : "No vehicles"}
          </p>
          <div className="flex items-center gap-4">
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => p === "..." ? (
                    <span key={`dots-${i}`} className="text-sm text-muted-foreground px-1">...</span>
                  ) : (
                    <Button key={p} variant={currentPage === p ? "default" : "ghost"} size="icon" className={`h-8 w-8 text-sm ${currentPage === p ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setCurrentPage(p)}>
                      {p}
                    </Button>
                  ))}
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
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
  <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
  <DialogHeader className="flex-shrink-0">
  <DialogTitle>{editingVehicle ? "Edit Vehicle" : "Add New Vehicle"}</DialogTitle>
  <DialogDescription>
  {editingVehicle ? "Update vehicle information" : "Add a new vehicle to your fleet"}
  </DialogDescription>
  </DialogHeader>
  <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="plate">Plate Number *</Label>
              <Input
                id="plate"
                value={formData.plate_number}
                onChange={(e) => setFormData((p) => ({ ...p, plate_number: e.target.value }))}
                placeholder="ABC-123"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={formData.make}
                  onChange={(e) => setFormData((p) => ({ ...p, make: e.target.value }))}
                  placeholder="Toyota"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))}
                  placeholder="Camry"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData((p) => ({ ...p, year: e.target.value }))}
                  placeholder="2023"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={formData.color}
                  onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
                  placeholder="White"
                />
              </div>
            </div>

            {traccarConfigured && (
              <div className="space-y-2">
                <Label htmlFor="traccar">GPS Device (Traccar)</Label>
                <Select
                  value={formData.traccar_device_id}
                  onValueChange={(value) => setFormData((p) => ({ ...p, traccar_device_id: value === "none" ? "" : value }))}
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
                  Link to a GPS device to track mileage and engine hours
                </p>
              </div>
            )}

            {/* Fuel & Tank — drives Trip > Fuel tab consumption analytics */}
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Fuel className="h-4 w-4" />
                  Fuel &amp; Tank
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used to compute Actual L/100km vs Normative and tank-capacity warnings on each trip.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fuel_type">Fuel Type</Label>
                  <Select
                    value={formData.fuel_type || "none"}
                    onValueChange={(value) =>
                      setFormData((p) => ({ ...p, fuel_type: value === "none" ? "" : value }))
                    }
                  >
                    <SelectTrigger id="fuel_type">
                      <SelectValue placeholder="Select fuel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="petrol">Petrol</SelectItem>
                      <SelectItem value="lng">LNG</SelectItem>
                      <SelectItem value="cng">CNG</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fuel_normative">Normative (L/100km)</Label>
                  <Input
                    id="fuel_normative"
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={formData.fuel_consumption_l_per_100km}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, fuel_consumption_l_per_100km: e.target.value }))
                    }
                    placeholder="e.g. 28.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tank_capacity">Tank Capacity (L)</Label>
                  <Input
                    id="tank_capacity"
                    type="number"
                    step="1"
                    inputMode="numeric"
                    value={formData.tank_capacity_liters}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, tank_capacity_liters: e.target.value }))
                    }
                    placeholder="e.g. 600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adblue_capacity">AdBlue Tank (L)</Label>
                  <Input
                    id="adblue_capacity"
                    type="number"
                    step="1"
                    inputMode="numeric"
                    value={formData.adblue_capacity_liters}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, adblue_capacity_liters: e.target.value }))
                    }
                    placeholder="e.g. 75"
                  />
                </div>
              </div>
            </div>

            {/* Subcontractor Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Subcontractor Vehicle
                  </Label>
                  <p className="text-xs text-muted-foreground">This vehicle belongs to an external partner</p>
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
                <p className="text-xs text-muted-foreground">Organize vehicles into groups for easier management</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.plate_number.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingVehicle ? "Save Changes" : "Add Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from GPS Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Vehicles from GPS</DialogTitle>
            <DialogDescription>
              Select GPS devices to import as vehicles. Already linked devices are marked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search devices..."
                value={importSearch}
                onChange={(e) => setImportSearch(e.target.value)}
                className="pl-9"
              />
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
                        if (!importSearch) return true;
                        const q = importSearch.toLowerCase();
                        return d.name.toLowerCase().includes(q) || d.uniqueId.toLowerCase().includes(q);
                      })
                      .map((device) => {
                        const existing = isDeviceExisting(device);
                        const imported = importedIds.has(device.id);
                        const importing = importingIds.has(device.id);
                        return (
                          <TableRow key={device.id} className={existing ? "opacity-50" : ""}>
                            <TableCell>
                              {existing ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : imported ? (
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
                              {existing ? (
                                <Badge variant="secondary" className="text-xs">Already Linked</Badge>
                              ) : imported ? (
                                <Badge className="text-xs bg-green-500">Imported</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">{device.status || "Unknown"}</Badge>
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
