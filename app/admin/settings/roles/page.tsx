"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Shield,
  Loader2,
  Users,
  Lock,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";

interface PermissionDefinition {
  id: string;
  permission_key: string;
  name: string;
  description: string | null;
  module: string;
  sub_module: string | null;
  display_order: number;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_system_role: boolean;
  permissions: Record<string, boolean>;
  hierarchy_level: number;
  is_active: boolean;
  created_at: string;
  user_count?: number;
}

const ROLE_COLORS = [
  "#6b7280", // gray
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
];

export default function RolesPage() {
  const router = useRouter();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState(ROLE_COLORS[0]);
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({});

  // Check if current user is owner (only owners can manage roles)
  const isOwner = adminSession?.isOwner || !adminSession?.user_id;

  useEffect(() => {
    if (sessionLoading) return;
    if (adminSession?.id) {
      // Redirect non-owners
      if (!isOwner) {
        router.push("/admin");
        return;
      }
      fetchData();
    }
  }, [sessionLoading, adminSession?.id, isOwner, router]);

  const fetchData = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    
    const supabase = createClient();
    
    // Fetch roles with user counts
    const { data: rolesData } = await supabase
      .from("roles")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("hierarchy_level", { ascending: true });
    
    // Fetch user counts per role
    const { data: userCounts } = await supabase
      .from("users")
      .select("role_id")
      .eq("admin_id", adminSession.id);
    
    // Fetch permission definitions
    const { data: permsData } = await supabase
      .from("permission_definitions")
      .select("*")
      .order("module", { ascending: true })
      .order("display_order", { ascending: true });
    
    if (rolesData) {
      const countMap = new Map<string, number>();
      userCounts?.forEach((u) => {
        if (u.role_id) {
          countMap.set(u.role_id, (countMap.get(u.role_id) || 0) + 1);
        }
      });
      
      setRoles(rolesData.map((r) => ({
        ...r,
        user_count: countMap.get(r.id) || 0,
      })));
    }
    
    if (permsData) setPermissions(permsData);
    
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName("");
    setFormDescription("");
    setFormColor(ROLE_COLORS[0]);
    setFormPermissions({});
    setDialogOpen(true);
  };

  const openEditDialog = (role: Role) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description || "");
    setFormColor(role.color);
    setFormPermissions(role.permissions || {});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formName) return;
    setSaving(true);
    
    const supabase = createClient();
    
    const roleData = {
      admin_id: adminSession.id,
      name: formName,
      description: formDescription || null,
      color: formColor,
      permissions: formPermissions,
    };
    
    if (editingRole) {
      await supabase
        .from("roles")
        .update(roleData)
        .eq("id", editingRole.id);
    } else {
      await supabase.from("roles").insert(roleData);
    }
    
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (role: Role) => {
    if (role.is_system_role) return;
    if (role.user_count && role.user_count > 0) {
      alert("Cannot delete a role that is assigned to users. Please reassign users first.");
      return;
    }
    if (!confirm("Are you sure you want to delete this role?")) return;
    
    const supabase = createClient();
    await supabase.from("roles").delete().eq("id", role.id);
    fetchData();
  };

  const togglePermission = (key: string) => {
    setFormPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleModulePermissions = (module: string, enabled: boolean) => {
    const modulePerms = permissions.filter((p) => p.module === module);
    const newPerms = { ...formPermissions };
    modulePerms.forEach((p) => {
      newPerms[p.permission_key] = enabled;
    });
    setFormPermissions(newPerms);
  };

  // Group permissions by module
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, PermissionDefinition[]>);

  const getModulePermissionCount = (module: string) => {
    const modulePerms = permissions.filter((p) => p.module === module);
    const enabledCount = modulePerms.filter((p) => formPermissions[p.permission_key]).length;
    return { enabled: enabledCount, total: modulePerms.length };
  };

  if (loading && roles.length === 0) {
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
        href="/admin/settings/users"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Users
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground">
            Define roles and configure what each role can access
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? "Edit Role" : "Create New Role"}</DialogTitle>
              <DialogDescription>
                Configure role details and permissions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Role Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Fleet Manager"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {ROLE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`h-8 w-8 rounded-full border-2 transition-all ${
                          formColor === color ? "border-foreground scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormColor(color)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this role is for..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Permissions */}
              <div className="space-y-2">
                <Label>Permissions</Label>
                <Accordion type="multiple" className="w-full">
                  {Object.entries(groupedPermissions).map(([module, perms]) => {
                    const counts = getModulePermissionCount(module);
                    return (
                      <AccordionItem key={module} value={module}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-4">
                            <span className="font-medium">{module}</span>
                            <Badge variant="secondary" className="ml-2">
                              {counts.enabled}/{counts.total}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            <div className="flex gap-2 mb-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => toggleModulePermissions(module, true)}
                                className="bg-transparent"
                              >
                                Select All
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => toggleModulePermissions(module, false)}
                                className="bg-transparent"
                              >
                                Deselect All
                              </Button>
                            </div>
                            {perms.map((perm) => (
                              <div key={perm.id} className="flex items-start space-x-3">
                                <Checkbox
                                  id={perm.permission_key}
                                  checked={formPermissions[perm.permission_key] || false}
                                  onCheckedChange={() => togglePermission(perm.permission_key)}
                                />
                                <div className="grid gap-1 leading-none">
                                  <label
                                    htmlFor={perm.permission_key}
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    {perm.name}
                                  </label>
                                  {perm.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {perm.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-transparent">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !formName}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRole ? "Save Changes" : "Create Role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Roles Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => {
          const permCount = Object.values(role.permissions || {}).filter(Boolean).length;
          return (
            <Card key={role.id} className="relative">
              {role.is_system_role && (
                <div className="absolute top-3 right-3">
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    System
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div 
                    className="h-10 w-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${role.color}20` }}
                  >
                    <Shield className="h-5 w-5" style={{ color: role.color }} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{role.name}</CardTitle>
                    {role.description && (
                      <CardDescription className="line-clamp-1">
                        {role.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {role.user_count || 0} users
                  </div>
                  <div>
                    {permCount} permissions
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-transparent"
                    onClick={() => openEditDialog(role)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  {!role.is_system_role && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent text-destructive hover:text-destructive"
                      onClick={() => handleDelete(role)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {roles.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-1">No Roles Created</h3>
              <p className="text-muted-foreground mb-4">
                Create roles to manage user permissions
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Role
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
