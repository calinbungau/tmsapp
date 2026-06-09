"use client";

import React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
  UserCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Building,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Car,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";

interface Department {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  employee_number: string | null;
  employee_type: "driver" | "office" | "field" | "contractor";
  department_id: string | null;
  department?: Department | null;
  job_title: string | null;
  hire_date: string | null;
  status: "active" | "inactive" | "suspended" | "terminated";
  address: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
}

const EMPLOYEE_TYPES = [
  { value: "driver", labelKey: "typeDriver", icon: Car },
  { value: "office", labelKey: "typeOffice", icon: Briefcase },
  { value: "field", labelKey: "typeField", icon: MapPin },
  { value: "contractor", labelKey: "typeContractor", icon: FileText },
];

export default function EmployeesPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmployeeNumber, setFormEmployeeNumber] = useState("");
  const [formEmployeeType, setFormEmployeeType] = useState<string>("office");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formJobTitle, setFormJobTitle] = useState("");
  const [formHireDate, setFormHireDate] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive" | "suspended" | "terminated">("active");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formCountry, setFormCountry] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    if (adminSession?.id) {
      fetchData();
    }
  }, [sessionLoading, adminSession?.id]);

  const fetchData = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    
    const supabase = createClient();
    
    // Fetch all employees with departments
    const { data: employeesData } = await supabase
      .from("employees")
      .select(`
        *,
        department:departments!employees_department_id_fkey(id, name)
      `)
      .eq("admin_id", adminSession.id)
      .order("first_name", { ascending: true });
    
    // Fetch departments
    const { data: deptsData } = await supabase
      .from("departments")
      .select("id, name")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name", { ascending: true });
    
    if (employeesData) setEmployees(employeesData);
    if (deptsData) setDepartments(deptsData);
    
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingEmployee(null);
    setFormFirstName("");
    setFormLastName("");
    setFormEmail("");
    setFormPhone("");
    setFormEmployeeNumber("");
    setFormEmployeeType("office");
    setFormDepartmentId("");
    setFormJobTitle("");
    setFormHireDate("");
    setFormStatus("active");
    setFormAddress("");
    setFormCity("");
    setFormCountry("");
    setDialogOpen(true);
  };

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormFirstName(employee.first_name);
    setFormLastName(employee.last_name);
    setFormEmail(employee.email || "");
    setFormPhone(employee.phone || "");
    setFormEmployeeNumber(employee.employee_number || "");
    setFormEmployeeType(employee.employee_type);
    setFormDepartmentId(employee.department_id || "");
    setFormJobTitle(employee.job_title || "");
    setFormHireDate(employee.hire_date || "");
    setFormStatus(employee.status);
    setFormAddress(employee.address || "");
    setFormCity(employee.city || "");
    setFormCountry(employee.country || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formFirstName || !formLastName) return;
    setSaving(true);
    
    const supabase = createClient();
    
    const employeeData = {
      admin_id: adminSession.id,
      first_name: formFirstName,
      last_name: formLastName,
      email: formEmail || null,
      phone: formPhone || null,
      employee_number: formEmployeeNumber || null,
      employee_type: formEmployeeType,
      department_id: formDepartmentId || null,
      job_title: formJobTitle || null,
      hire_date: formHireDate || null,
      status: formStatus,
      address: formAddress || null,
      city: formCity || null,
      country: formCountry || null,
    };
    
    if (editingEmployee) {
      await supabase
        .from("employees")
        .update(employeeData)
        .eq("id", editingEmployee.id);
    } else {
      await supabase.from("employees").insert(employeeData);
    }
    
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (employee: Employee) => {
    if (!confirm(t("employeesPage.deleteConfirm").replace("{name}", `${employee.first_name} ${employee.last_name}`))) return;
    
    const supabase = createClient();
    await supabase.from("employees").delete().eq("id", employee.id);
    fetchData();
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus]);

  const filteredEmployees = employees.filter((emp) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
      const matchesSearch = 
        fullName.includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.employee_number?.toLowerCase().includes(query) ||
        emp.job_title?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Type filter
    if (filterType !== "all" && emp.employee_type !== filterType) return false;
    
    // Status filter
    if (filterStatus !== "all" && emp.status !== filterStatus) return false;
    
    return true;
  });
  
  // Pagination
  const totalCount = filteredEmployees.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />{t("employeesPage.active")}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{t("employeesPage.inactive")}</Badge>;
      case "suspended":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t("employeesPage.suspended")}</Badge>;
      case "terminated":
        return <Badge variant="outline" className="text-muted-foreground">{t("employeesPage.terminated")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const typeInfo = EMPLOYEE_TYPES.find((t) => t.value === type);
    if (!typeInfo) return <Badge variant="outline">{type}</Badge>;
    const Icon = typeInfo.icon;
    return (
      <Badge variant="outline">
        <Icon className="h-3 w-3 mr-1" />
        {t(`employeesPage.${typeInfo.labelKey}`)}
      </Badge>
    );
  };

  if (loading && employees.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/admin/settings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("employeesPage.backToSettings")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("employeesPage.title")}</h1>
          <p className="text-muted-foreground">
            {t("employeesPage.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/departments">
            <Button variant="outline" className="bg-transparent">
              <Building className="h-4 w-4 mr-2" />
              {t("employeesPage.departments")}
            </Button>
          </Link>
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["employees:create"]) && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("employeesPage.addEmployee")}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? t("employeesPage.editEmployee") : t("employeesPage.addNewEmployee")}</DialogTitle>
                <DialogDescription>
                  {editingEmployee ? t("employeesPage.updateInfo") : t("employeesPage.addToOrg")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Personal Information */}
                <div>
                  <h4 className="font-medium mb-3">{t("employeesPage.personalInformation")}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t("employeesPage.firstName")}</Label>
                      <Input
                        id="firstName"
                        value={formFirstName}
                        onChange={(e) => setFormFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t("employeesPage.lastName")}</Label>
                      <Input
                        id="lastName"
                        value={formLastName}
                        onChange={(e) => setFormLastName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("employeesPage.email")}</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("employeesPage.phone")}</Label>
                      <Input
                        id="phone"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Employment Information */}
                <div>
                  <h4 className="font-medium mb-3">{t("employeesPage.employmentInformation")}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="employeeNumber">{t("employeesPage.employeeNumber")}</Label>
                      <Input
                        id="employeeNumber"
                        placeholder={t("employeesPage.employeeNumberPlaceholder")}
                        value={formEmployeeNumber}
                        onChange={(e) => setFormEmployeeNumber(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">{t("employeesPage.employeeType")}</Label>
                      <Select value={formEmployeeType} onValueChange={setFormEmployeeType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYEE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {t(`employeesPage.${type.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">{t("employeesPage.department")}</Label>
                      <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("employeesPage.selectDepartment")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("employeesPage.noDepartment")}</SelectItem>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">{t("employeesPage.jobTitle")}</Label>
                      <Input
                        id="jobTitle"
                        placeholder={t("employeesPage.jobTitlePlaceholder")}
                        value={formJobTitle}
                        onChange={(e) => setFormJobTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hireDate">{t("employeesPage.hireDate")}</Label>
                      <Input
                        id="hireDate"
                        type="date"
                        value={formHireDate}
                        onChange={(e) => setFormHireDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">{t("employeesPage.status")}</Label>
                      <Select value={formStatus} onValueChange={(v) => setFormStatus(v as typeof formStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t("employeesPage.active")}</SelectItem>
                          <SelectItem value="inactive">{t("employeesPage.inactive")}</SelectItem>
                          <SelectItem value="suspended">{t("employeesPage.suspended")}</SelectItem>
                          <SelectItem value="terminated">{t("employeesPage.terminated")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h4 className="font-medium mb-3">{t("employeesPage.address")}</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-3 space-y-2">
                      <Label htmlFor="address">{t("employeesPage.streetAddress")}</Label>
                      <Input
                        id="address"
                        value={formAddress}
                        onChange={(e) => setFormAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("employeesPage.city")}</Label>
                      <Input
                        id="city"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="country">{t("employeesPage.country")}</Label>
                      <Input
                        id="country"
                        value={formCountry}
                        onChange={(e) => setFormCountry(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-transparent">
                  {t("employeesPage.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={saving || !formFirstName || !formLastName}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingEmployee ? t("employeesPage.saveChanges") : t("employeesPage.addEmployee")}
                </Button>
              </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("employeesPage.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("employeesPage.type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("employeesPage.allTypes")}</SelectItem>
                {EMPLOYEE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {t(`employeesPage.${type.labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("employeesPage.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("employeesPage.allStatus")}</SelectItem>
                <SelectItem value="active">{t("employeesPage.active")}</SelectItem>
                <SelectItem value="inactive">{t("employeesPage.inactive")}</SelectItem>
                <SelectItem value="suspended">{t("employeesPage.suspended")}</SelectItem>
                <SelectItem value="terminated">{t("employeesPage.terminated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("employeesPage.allEmployees")} ({filteredEmployees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("employeesPage.employee")}</TableHead>
                <TableHead>{t("employeesPage.type")}</TableHead>
                <TableHead>{t("employeesPage.department")}</TableHead>
                <TableHead>{t("employeesPage.contact")}</TableHead>
                <TableHead>{t("employeesPage.status")}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("employeesPage.noEmployeesFound")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEmployees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <Link href={`/admin/employees/${emp.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium hover:underline">
                            {emp.first_name} {emp.last_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {emp.job_title || emp.employee_number || "No title"}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>{getTypeBadge(emp.employee_type)}</TableCell>
                    <TableCell>
                      {emp.department ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Building className="h-3 w-3" />
                          {emp.department.name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        {emp.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {emp.email}
                          </div>
                        )}
                        {emp.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {emp.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(emp.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/employees/${emp.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(emp)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(emp)}
                            className="text-destructive"
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
              {totalCount > 0 ? `${startIndex + 1}-${endIndex} of ${totalCount} employees` : "No employees"}
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
        </CardContent>
      </Card>
    </div>
  );
}
