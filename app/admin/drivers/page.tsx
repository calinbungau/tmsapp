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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  UserCircle,
  Bell,
  Send,
  FileText,
  Download,
  Calendar,
  Building2,
  Users,
  Truck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Driver, Language } from "@/lib/types";
import { LANGUAGE_OPTIONS } from "@/lib/types";
import { useAdminSession } from "@/hooks/use-admin-session";

interface Department {
  id: string;
  name: string;
}

interface BusinessPartner {
  id: string;
  name: string;
  types: string[];
}

interface FleetGroup {
  id: string;
  name: string;
  color: string;
}

export default function AdminDriversPage() {
  const router = useRouter();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterType, setFilterType] = useState<"all" | "employee" | "subcontractor">("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  const [formData, setFormData] = useState({
    name: "",
    pin_code: "",
    email: "",
    phone: "",
    language: "en" as Language,
    isSubcontractor: false,
    department_id: "",
    job_title: "",
    hire_date: "",
    business_partner_id: "",
    fleet_group_id: "",
  });

  const [departments, setDepartments] = useState<Department[]>([]);
  const [carrierPartners, setCarrierPartners] = useState<BusinessPartner[]>([]);
  const [fleetGroups, setFleetGroups] = useState<FleetGroup[]>([]);

  // Notification state
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [notificationDriver, setNotificationDriver] = useState<Driver | null>(null);
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);

  // Export state
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const fetchDrivers = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();

    const { data: driversData } = await supabase
      .from("drivers")
      .select(`
        *,
        business_partner:business_partner_id(id, name),
        fleet_group:fleet_group_id(id, name, color)
      `)
      .eq("admin_id", adminSession.id)
      .order("name");

    if (driversData) setDrivers(driversData);

    const { data: deptData } = await supabase
      .from("departments")
      .select("id, name")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name");

    if (deptData) setDepartments(deptData);

    const { data: partnersData } = await supabase
      .from("business_partners")
      .select("id, name, types")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .contains("types", ["carrier"])
      .order("name");

    if (partnersData) setCarrierPartners(partnersData);

    const { data: groupsData } = await supabase
      .from("fleet_groups")
      .select("id, name, color")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name");

    if (groupsData) setFleetGroups(groupsData);
    setLoading(false);
  };

  useEffect(() => {
    if (adminSession?.id) fetchDrivers();
  }, [adminSession?.id]);

  const resetForm = () => {
    setFormData({
      name: "",
      pin_code: "",
      email: "",
      phone: "",
      language: "en",
      isSubcontractor: false,
      department_id: "",
      job_title: "",
      hire_date: "",
      business_partner_id: "",
      fleet_group_id: "",
    });
    setEditingDriver(null);
  };

  const handleOpenDialog = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      const driverWithExtras = driver as Driver & {
        employee_id?: string;
        is_subcontractor?: boolean;
        business_partner_id?: string;
        fleet_group_id?: string;
      };
      setFormData({
        name: driver.name,
        pin_code: driver.pin_code,
        email: driver.email || "",
        phone: driver.phone || "",
        language: driver.language || "en",
        isSubcontractor: !!driverWithExtras.is_subcontractor,
        department_id: "",
        job_title: "",
        hire_date: "",
        business_partner_id: driverWithExtras.business_partner_id || "",
        fleet_group_id: driverWithExtras.fleet_group_id || "",
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.pin_code.trim()) return;
    setSaving(true);
    const supabase = createClient();

    const nameParts = formData.name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    if (editingDriver) {
      const { error } = await supabase
        .from("drivers")
        .update({
          name: formData.name,
          pin_code: formData.pin_code,
          email: formData.email || null,
          phone: formData.phone || null,
          language: formData.language,
          is_subcontractor: formData.isSubcontractor,
          business_partner_id: formData.isSubcontractor ? formData.business_partner_id || null : null,
          fleet_group_id: formData.fleet_group_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingDriver.id);

      if (error) {
        alert("Failed to update driver: " + error.message);
        setSaving(false);
        return;
      }
    } else {
      let employeeId: string | null = null;

      if (!formData.isSubcontractor) {
        let driverDeptId: string | null = null;
        const { data: deptData } = await supabase
          .from("departments")
          .select("id")
          .eq("admin_id", adminSession?.id)
          .ilike("name", "driver%")
          .limit(1)
          .single();

        if (deptData) {
          driverDeptId = deptData.id;
        } else {
          const { data: newDept } = await supabase
            .from("departments")
            .insert({ name: "Drivers", admin_id: adminSession?.id, is_active: true })
            .select()
            .single();
          if (newDept) driverDeptId = newDept.id;
        }

        const { data: newEmployee, error: empError } = await supabase
          .from("employees")
          .insert({
            first_name: firstName,
            last_name: lastName,
            email: formData.email || null,
            phone: formData.phone || null,
            employee_type: "driver",
            department_id: driverDeptId,
            job_title: "Driver",
            hire_date: formData.hire_date || null,
            status: "active",
            admin_id: adminSession?.id,
          })
          .select()
          .single();

        if (empError) {
          alert("Failed to create employee record: " + empError.message);
          setSaving(false);
          return;
        }
        employeeId = newEmployee.id;
      }

      const { error } = await supabase.from("drivers").insert({
        name: formData.name,
        pin_code: formData.pin_code,
        email: formData.email || null,
        phone: formData.phone || null,
        language: formData.language,
        admin_id: adminSession?.id,
        employee_id: employeeId,
        is_subcontractor: formData.isSubcontractor,
        business_partner_id: formData.isSubcontractor ? formData.business_partner_id || null : null,
        fleet_group_id: formData.fleet_group_id || null,
      });

      if (error) {
        alert("Failed to create driver: " + error.message);
        if (employeeId) {
          await supabase.from("employees").delete().eq("id", employeeId);
        }
        setSaving(false);
        return;
      }
    }

    setDialogOpen(false);
    resetForm();
    fetchDrivers();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this driver?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) {
      alert("Failed to delete driver: " + error.message);
      return;
    }
    fetchDrivers();
  };

  const toggleActive = async (driver: Driver) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("drivers")
      .update({ is_active: !driver.is_active })
      .eq("id", driver.id);
    if (!error) fetchDrivers();
  };

  const getLanguageName = (code: string) => {
    return LANGUAGE_OPTIONS.find((l) => l.code === code)?.name || code;
  };

  const openNotificationDialog = (driver: Driver) => {
    setNotificationDriver(driver);
    setNotificationTitle("");
    setNotificationBody("");
    setNotificationDialogOpen(true);
  };

  const handleSendNotification = async () => {
    if (!notificationDriver || !notificationTitle || !notificationBody) return;
    setSendingNotification(true);
    try {
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: adminSession?.id,
          driver_id: notificationDriver.id,
          title: notificationTitle,
          body: notificationBody,
          type: "general",
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`Notification sent successfully to ${notificationDriver.name}!`);
        setNotificationDialogOpen(false);
      } else {
        alert(`Failed to send notification: ${result.error || "Unknown error"}`);
      }
    } catch {
      alert("Failed to send notification. Please try again.");
    } finally {
      setSendingNotification(false);
    }
  };

  const handleExportExcel = async () => {
    if (!exportStartDate || !exportEndDate) {
      alert("Please select both start and end dates");
      return;
    }
    setExporting(true);
    try {
      const supabase = createClient();
      const startDate = new Date(exportStartDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(exportEndDate);
      endDate.setHours(23, 59, 59, 999);

      const { data: inspectionsData } = await supabase
        .from("inspections")
        .select("driver_id, created_at, status")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .eq("status", "completed");

      const dates: string[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split("T")[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const inspectionMap = new Map<string, Set<string>>();
      (inspectionsData || []).forEach((inspection) => {
        const driverId = inspection.driver_id;
        const date = new Date(inspection.created_at).toISOString().split("T")[0];
        if (!inspectionMap.has(driverId)) {
          inspectionMap.set(driverId, new Set());
        }
        inspectionMap.get(driverId)!.add(date);
      });

      const headers = ["Driver Name", "PIN", ...dates.map((d) => {
        const date = new Date(d);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      })];

      const rows = drivers.filter((d) => d.is_active).map((driver) => {
        const driverInspections = inspectionMap.get(driver.id) || new Set();
        const dateStatuses = dates.map((date) =>
          driverInspections.has(date) ? "OK" : "MISSING"
        );
        return [driver.name, driver.pin_code, ...dateStatuses];
      });

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `driver_inspections_${exportStartDate}_to_${exportEndDate}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterType]);

  // Filtering
  const filteredDrivers = drivers.filter((driver) => {
    if (filterStatus === "active" && !driver.is_active) return false;
    if (filterStatus === "inactive" && driver.is_active) return false;
    const driverExtras = driver as Driver & { is_subcontractor?: boolean; employee_id?: string };
    if (filterType === "employee" && !driverExtras.employee_id) return false;
    if (filterType === "subcontractor" && !driverExtras.is_subcontractor) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return driver.name.toLowerCase().includes(q) ||
        driver.pin_code.includes(q) ||
        driver.email?.toLowerCase().includes(q) ||
        driver.phone?.includes(q);
    }
    return true;
  });
  
  // Pagination
  const totalCount = filteredDrivers.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const paginatedDrivers = filteredDrivers.slice(startIndex, endIndex);

  // Stats
  const stats = {
    total: drivers.length,
    active: drivers.filter((d) => d.is_active).length,
    employees: drivers.filter((d) => (d as any).employee_id).length,
    subcontractors: drivers.filter((d) => (d as any).is_subcontractor).length,
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
          <h1 className="text-2xl font-bold">Drivers</h1>
          <p className="text-muted-foreground">
            Manage driver accounts, PIN codes, and view inspections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-transparent">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <h4 className="font-medium">Export Inspection Report</h4>
                <p className="text-sm text-muted-foreground">
                  Generate a CSV report showing daily inspection status for all drivers.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleExportExcel}
                  disabled={!exportStartDate || !exportEndDate || exporting}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {exporting ? "Exporting..." : "Download CSV"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["drivers:create"]) && (
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Driver
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
                <Users className="h-5 w-5" />
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
                <UserCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.employees}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.subcontractors}</p>
                <p className="text-xs text-muted-foreground">Subcontractors</p>
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
                placeholder="Search by name, PIN, email, phone..."
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
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="employee">Employees</SelectItem>
                <SelectItem value="subcontractor">Subcontractors</SelectItem>
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
  <TableHead>Driver</TableHead>
  <TableHead>PIN</TableHead>
  <TableHead>Contact</TableHead>
  <TableHead>Business Partner</TableHead>
  <TableHead>Fleet Group</TableHead>
  <TableHead>Type</TableHead>
  <TableHead>Status</TableHead>
  <TableHead className="text-right">Actions</TableHead>
  </TableRow>
  </TableHeader>
          <TableBody>
{paginatedDrivers.length === 0 ? (
  <TableRow>
  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
  {searchQuery || filterStatus !== "all" || filterType !== "all"
  ? "No drivers match your filters"
  : "No drivers yet. Add your first driver."}
  </TableCell>
  </TableRow>
  ) : (
paginatedDrivers.map((driver) => {
  const driverExtras = driver as Driver & {
  employee_id?: string;
  is_subcontractor?: boolean;
  business_partner?: { id: string; name: string } | null;
  fleet_group?: { id: string; name: string; color: string } | null;
  };
  return (
  <TableRow
  key={driver.id}
  className={`cursor-pointer hover:bg-muted/50 transition-colors ${!driver.is_active ? "opacity-50" : ""}`}
  onClick={() => router.push(`/admin/drivers/${driver.id}`)}
  >
  <TableCell>
  <div className="flex items-center gap-3">
  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
  driver.is_active ? "bg-primary/20" : "bg-muted"
  }`}>
  <span className="text-sm font-semibold">{driver.name.charAt(0).toUpperCase()}</span>
  </div>
  <div>
  <span className="font-medium">{driver.name}</span>
  <p className="text-xs text-muted-foreground">{getLanguageName(driver.language)}</p>
  </div>
  </div>
  </TableCell>
  <TableCell>
  <code className="text-sm bg-muted px-1.5 py-0.5 rounded">{driver.pin_code}</code>
  </TableCell>
  <TableCell>
  <div className="text-sm">
  {driver.email && <p className="text-muted-foreground">{driver.email}</p>}
  {driver.phone && <p className="text-muted-foreground">{driver.phone}</p>}
  {!driver.email && !driver.phone && <span className="text-muted-foreground">-</span>}
  </div>
  </TableCell>
  <TableCell>
  {driverExtras.business_partner ? (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{driverExtras.business_partner.name}</span>
    </div>
  ) : (
    <span className="text-xs text-muted-foreground">-</span>
  )}
  </TableCell>
  <TableCell>
  {driverExtras.fleet_group ? (
    <Badge variant="outline" className="text-xs gap-1.5">
      <div 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: `var(--${driverExtras.fleet_group.color}-500, #888)` }}
      />
      {driverExtras.fleet_group.name}
    </Badge>
  ) : (
    <span className="text-xs text-muted-foreground">-</span>
  )}
  </TableCell>
  <TableCell>
  {driverExtras.is_subcontractor ? (
  <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/30">
  Subcontractor
  </Badge>
  ) : driverExtras.employee_id ? (
  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
  Employee
  </Badge>
  ) : (
  <Badge variant="outline" className="text-xs">Driver</Badge>
  )}
  </TableCell>
  <TableCell>
  <Badge variant={driver.is_active ? "default" : "secondary"}>
  {driver.is_active ? "Active" : "Inactive"}
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
                          <DropdownMenuItem onClick={() => router.push(`/admin/drivers/${driver.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/admin/forms?driver=${driver.id}`)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Forms
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openNotificationDialog(driver)}>
                            <Bell className="h-4 w-4 mr-2" />
                            Send Notification
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenDialog(driver)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(driver)}>
                            {driver.is_active ? (
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
                            onClick={() => handleDelete(driver.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-3 border-t">
          <p className="text-sm text-muted-foreground">
            {totalCount > 0 ? `${startIndex + 1}-${endIndex} of ${totalCount} drivers` : "No drivers"}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDriver ? "Edit Driver" : "Add New Driver"}</DialogTitle>
            <DialogDescription>
              {editingDriver ? "Update driver information" : "Add a new driver to your team"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Driver name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN Code *</Label>
              <Input
                id="pin"
                value={formData.pin_code}
                onChange={(e) => setFormData((p) => ({ ...p, pin_code: e.target.value }))}
                placeholder="4-6 digit PIN"
                maxLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select
                value={formData.language}
                onValueChange={(value) => setFormData((p) => ({ ...p, language: value as Language }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="driver@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+1234567890"
                />
              </div>
            </div>

            {!editingDriver && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isSubcontractor"
                    checked={formData.isSubcontractor}
                    onCheckedChange={(checked) =>
                      setFormData((p) => ({ ...p, isSubcontractor: !!checked }))
                    }
                  />
                  <Label htmlFor="isSubcontractor" className="text-sm font-normal cursor-pointer">
                    This is a subcontractor (external driver)
                  </Label>
                </div>

                {formData.isSubcontractor && (
                  <div className="space-y-2">
                    <Label>Carrier / Partner Company</Label>
                    <Select
                      value={formData.business_partner_id}
                      onValueChange={(v) => setFormData((p) => ({ ...p, business_partner_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select carrier partner" />
                      </SelectTrigger>
                      <SelectContent>
                        {carrierPartners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              {partner.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Link to a carrier partner from Business Partners
                    </p>
                  </div>
                )}

                {!formData.isSubcontractor && (
                  <div className="space-y-2">
                    <Label>Hire Date</Label>
                    <Input
                      type="date"
                      value={formData.hire_date}
                      onChange={(e) => setFormData((p) => ({ ...p, hire_date: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Fleet Group */}
            {fleetGroups.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <Label>Fleet Group</Label>
                <Select
                  value={formData.fleet_group_id}
                  onValueChange={(value) => setFormData((p) => ({ ...p, fleet_group_id: value === "none" ? "" : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fleet group (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No group</SelectItem>
                    {fleetGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full bg-${group.color}-500`} />
                          {group.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Organize drivers into groups for easier management</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim() || !formData.pin_code.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingDriver ? "Save Changes" : "Add Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Notification Dialog */}
      <Dialog open={notificationDialogOpen} onOpenChange={setNotificationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Notification to {notificationDriver?.name}</DialogTitle>
            <DialogDescription>Send a push notification to this driver&apos;s mobile device</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notifTitle">Title</Label>
              <Input
                id="notifTitle"
                value={notificationTitle}
                onChange={(e) => setNotificationTitle(e.target.value)}
                placeholder="Notification title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notifBody">Message</Label>
              <Textarea
                id="notifBody"
                value={notificationBody}
                onChange={(e) => setNotificationBody(e.target.value)}
                placeholder="Enter your message here..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotificationDialogOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button
              onClick={handleSendNotification}
              disabled={!notificationTitle || !notificationBody || sendingNotification}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendingNotification ? "Sending..." : "Send Notification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
