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
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Edit,
  Trash2,
  Building,
  Loader2,
  Users,
  FolderTree,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useTranslation } from "@/components/i18n/i18n-provider";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  manager_employee_id: string | null;
  is_active: boolean;
  created_at: string;
  manager?: Employee | null;
  parent?: { id: string; name: string } | null;
  employee_count?: number;
  children?: Department[];
}

export default function DepartmentsPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formParentId, setFormParentId] = useState("none");
  const [formManagerId, setFormManagerId] = useState("none");

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
    
    // Fetch departments with managers only (handle parent lookup manually to avoid self-join issues)
    const { data: deptsData } = await supabase
      .from("departments")
      .select(`
        *,
        manager:employees!fk_departments_manager(id, first_name, last_name)
      `)
      .eq("admin_id", adminSession.id)
      .order("name", { ascending: true });
    
    // Fetch employee counts per department
    const { data: empCounts } = await supabase
      .from("employees")
      .select("department_id")
      .eq("admin_id", adminSession.id)
      .eq("status", "active");
    
    // Fetch all active employees for manager selection
    const { data: empsData } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("admin_id", adminSession.id)
      .eq("status", "active")
      .order("first_name", { ascending: true });
    
    if (deptsData) {
      const countMap = new Map<string, number>();
      empCounts?.forEach((e) => {
        if (e.department_id) {
          countMap.set(e.department_id, (countMap.get(e.department_id) || 0) + 1);
        }
      });
      
      // Build parent lookup map
      const deptMap = new Map(deptsData.map((d) => [d.id, d]));
      
      setDepartments(deptsData.map((d) => ({
        ...d,
        employee_count: countMap.get(d.id) || 0,
        parent: d.parent_department_id ? deptMap.get(d.parent_department_id) : null,
      })));
    }
    
    if (empsData) setEmployees(empsData);
    
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingDepartment(null);
    setFormName("");
    setFormDescription("");
    setFormParentId("none");
    setFormManagerId("none");
    setDialogOpen(true);
  };

  const openEditDialog = (dept: Department) => {
    setEditingDepartment(dept);
    setFormName(dept.name);
    setFormDescription(dept.description || "");
    setFormParentId(dept.parent_department_id || "none");
    setFormManagerId(dept.manager_employee_id || "none");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formName) return;
    setSaving(true);
    
    const supabase = createClient();
    
    const deptData = {
      admin_id: adminSession.id,
      name: formName,
      description: formDescription || null,
      parent_department_id: formParentId === "none" ? null : formParentId,
      manager_employee_id: formManagerId === "none" ? null : formManagerId,
    };
    
    if (editingDepartment) {
      await supabase
        .from("departments")
        .update(deptData)
        .eq("id", editingDepartment.id);
    } else {
      await supabase.from("departments").insert(deptData);
    }
    
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (dept: Department) => {
    if (dept.employee_count && dept.employee_count > 0) {
      alert(t("departments.cannotDelete"));
      return;
    }
    if (!confirm(t("departments.confirmDelete").replace("{name}", dept.name))) return;
    
    const supabase = createClient();
    await supabase.from("departments").delete().eq("id", dept.id);
    fetchData();
  };

  // Build department tree
  const buildTree = (depts: Department[]): Department[] => {
    const map = new Map<string, Department>();
    const roots: Department[] = [];
    
    depts.forEach((d) => {
      map.set(d.id, { ...d, children: [] });
    });
    
    depts.forEach((d) => {
      const node = map.get(d.id)!;
      if (d.parent_department_id && map.has(d.parent_department_id)) {
        map.get(d.parent_department_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });
    
    return roots;
  };

  const departmentTree = buildTree(departments);

  const renderDepartment = (dept: Department, level: number = 0) => (
    <div key={dept.id}>
      <div 
        className={`flex items-center justify-between p-4 border-b hover:bg-muted/50 ${
          level > 0 ? "ml-" + (level * 8) : ""
        }`}
        style={{ marginLeft: level * 32 }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium flex items-center gap-2">
              {dept.name}
              {!dept.is_active && (
                <Badge variant="secondary" className="text-xs">{t("departments.inactive")}</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-3">
              {dept.manager && (
                <span>{t("departments.manager")} {dept.manager.first_name} {dept.manager.last_name}</span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {t("departments.employeesCount").replace("{n}", String(dept.employee_count || 0))}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditDialog(dept)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(dept)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {dept.children && dept.children.length > 0 && (
        <div>
          {dept.children.map((child) => renderDepartment(child, level + 1))}
        </div>
      )}
    </div>
  );

  // Get available parent departments (exclude current and its children)
  const getAvailableParents = () => {
    if (!editingDepartment) return departments;
    
    const getChildIds = (deptId: string): string[] => {
      const children = departments.filter((d) => d.parent_department_id === deptId);
      return [deptId, ...children.flatMap((c) => getChildIds(c.id))];
    };
    
    const excludeIds = new Set(getChildIds(editingDepartment.id));
    return departments.filter((d) => !excludeIds.has(d.id));
  };

  if (loading && departments.length === 0) {
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
          <h1 className="text-2xl font-bold">{t("departments.title")}</h1>
          <p className="text-muted-foreground">
            {t("departments.subtitle")}
          </p>
        </div>
        {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["employees:create"]) && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                {t("departments.addDepartment")}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDepartment ? t("departments.editDepartment") : t("departments.addNewDepartment")}</DialogTitle>
              <DialogDescription>
                {editingDepartment ? t("departments.updateDetails") : t("departments.createDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("departments.departmentName")} *</Label>
                <Input
                  id="name"
                  placeholder={t("departments.namePlaceholder")}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("departments.description")}</Label>
                <Textarea
                  id="description"
                  placeholder={t("departments.descriptionPlaceholder")}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent">{t("departments.parentDepartment")}</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("departments.noneTopLevelPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("departments.noneTopLevel")}</SelectItem>
                    {getAvailableParents().map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager">{t("departments.departmentManager")}</Label>
                <Select value={formManagerId} onValueChange={setFormManagerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("departments.selectManager")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("departments.noManager")}</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-transparent">
                {t("departments.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving || !formName}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingDepartment ? t("departments.saveChanges") : t("departments.createDepartment")}
              </Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Departments Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            {t("departments.orgStructure")}
          </CardTitle>
          <CardDescription>
            {t("departments.orgStructureDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {departmentTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-1">{t("departments.noDepartments")}</h3>
              <p className="text-muted-foreground mb-4">
                {t("departments.noDepartmentsDesc")}
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                {t("departments.createFirst")}
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {departmentTree.map((dept) => renderDepartment(dept))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
