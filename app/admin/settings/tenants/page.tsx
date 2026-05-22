"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Building2, Plus, Users, Car, Loader2, Search, MoreHorizontal, 
  Mail, Phone, Calendar, Shield, AlertTriangle, Check, X, Eye, EyeOff,
  ArrowLeft
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

interface AdminTenant {
  id: string;
  company_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  is_super_admin: boolean;
  subscription_plan: string;
  status: string | null;
  max_users: number;
  max_vehicles: number;
  created_at: string;
  updated_at: string;
  user_count: number;
}

export default function TenantsManagementPage() {
  const { session: adminSession } = useAdminSession();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newTenant, setNewTenant] = useState({
    company_name: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    subscription_plan: "basic",
    max_users: 5,
    max_vehicles: 10,
  });

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<AdminTenant | null>(null);
  const [updating, setUpdating] = useState(false);

  // Check if current user is super admin
  useEffect(() => {
    const checkSuperAdmin = async () => {
      if (!adminSession?.id) return;
      
      const supabase = createClient();
      const { data } = await supabase
        .from("admins")
        .select("is_super_admin")
        .eq("id", adminSession.id)
        .single();
      
      setIsSuperAdmin(data?.is_super_admin || false);
    };
    
    checkSuperAdmin();
  }, [adminSession?.id]);

  // Fetch tenants
  const fetchTenants = useCallback(async () => {
    if (!adminSession?.id || !isSuperAdmin) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/tenants?adminId=${adminSession.id}`);
      const data = await res.json();
      
      if (res.ok) {
        setTenants(data.admins || []);
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to fetch tenants", variant: "destructive" });
    }
    setLoading(false);
  }, [adminSession?.id, isSuperAdmin, toast]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    }
  }, [isSuperAdmin, fetchTenants]);

  // Create tenant
  const handleCreateTenant = async () => {
    console.log("[v0] handleCreateTenant called with:", newTenant);
    console.log("[v0] adminSession:", adminSession);
    
    if (!newTenant.company_name || !newTenant.email || !newTenant.password) {
      console.log("[v0] Validation failed - missing required fields");
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    if (newTenant.password.length < 8) {
      console.log("[v0] Validation failed - password too short");
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    setCreating(true);
    console.log("[v0] Starting API call...");
    try {
      const res = await fetch("/api/super-admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: adminSession?.id,
          ...newTenant,
        }),
      });

      console.log("[v0] API response status:", res.status);
      const data = await res.json();
      console.log("[v0] API response data:", data);

      if (res.ok) {
        toast({ title: "Success", description: "Tenant created successfully" });
        setShowCreateDialog(false);
        setNewTenant({
          company_name: "",
          email: "",
          password: "",
          phone: "",
          address: "",
          subscription_plan: "basic",
          max_users: 5,
          max_vehicles: 10,
        });
        fetchTenants();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      console.log("[v0] API call failed with error:", err);
      toast({ title: "Error", description: "Failed to create tenant", variant: "destructive" });
    }
    setCreating(false);
  };

  // Update tenant
  const handleUpdateTenant = async () => {
    if (!editingTenant) return;

    setUpdating(true);
    try {
      const res = await fetch("/api/super-admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: adminSession?.id,
          adminId: editingTenant.id,
          company_name: editingTenant.company_name,
          phone: editingTenant.phone,
          address: editingTenant.address,
          subscription_plan: editingTenant.subscription_plan,
          status: editingTenant.status,
          max_users: editingTenant.max_users,
          max_vehicles: editingTenant.max_vehicles,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({ title: "Success", description: "Tenant updated successfully" });
        setShowEditDialog(false);
        setEditingTenant(null);
        fetchTenants();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update tenant", variant: "destructive" });
    }
    setUpdating(false);
  };

  // Deactivate tenant
  const handleDeactivateTenant = async (tenantId: string) => {
    if (!confirm("Are you sure you want to deactivate this tenant? They will no longer be able to log in.")) {
      return;
    }

    try {
      const res = await fetch(`/api/super-admin/tenants?requesterId=${adminSession?.id}&adminId=${tenantId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({ title: "Success", description: "Tenant deactivated" });
        fetchTenants();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to deactivate tenant", variant: "destructive" });
    }
  };

  // Filter tenants
  const filteredTenants = tenants.filter(t => 
    t.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Not super admin - show access denied
  if (!loading && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access this page. Only super administrators can manage tenants.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/admin/settings">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/settings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Settings
            </Link>
          </Button>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Tenant Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage admin accounts and their subscriptions
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Tenant
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{tenants.length}</p>
                  <p className="text-xs text-muted-foreground">Total Tenants</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Check className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{tenants.filter(t => t.status === "active").length}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{tenants.reduce((sum, t) => sum + t.user_count, 0)}</p>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Shield className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{tenants.filter(t => t.is_super_admin).length}</p>
                  <p className="text-xs text-muted-foreground">Super Admins</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No tenants found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                              {tenant.logo_url ? (
                                <img src={tenant.logo_url} alt="" className="w-8 h-8 object-contain" />
                              ) : (
                                <Building2 className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium flex items-center gap-2">
                                {tenant.company_name}
                                {tenant.is_super_admin && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    Super Admin
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{tenant.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {tenant.phone && (
                              <p className="text-xs flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {tenant.phone}
                              </p>
                            )}
                            <p className="text-xs flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {tenant.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {tenant.subscription_plan}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            <p className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {tenant.user_count} / {tenant.max_users} users
                            </p>
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Car className="h-3 w-3" />
                              {tenant.max_vehicles} vehicles
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={tenant.status === "active" ? "default" : "destructive"}
                            className="capitalize"
                          >
                            {tenant.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(tenant.created_at).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setEditingTenant(tenant);
                                setShowEditDialog(true);
                              }}>
                                Edit Details
                              </DropdownMenuItem>
                              {!tenant.is_super_admin && tenant.status === "active" && (
                                <DropdownMenuItem 
                                  onClick={() => handleDeactivateTenant(tenant.id)}
                                  className="text-destructive"
                                >
                                  Deactivate
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Tenant Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>
              Add a new admin account. They will receive login credentials via email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={newTenant.company_name}
                onChange={(e) => setNewTenant(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="Acme Transport SRL"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newTenant.email}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="admin@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newTenant.password}
                    onChange={(e) => setNewTenant(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 8 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={newTenant.phone}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+40 123 456 789"
                />
              </div>
              <div className="space-y-2">
                <Label>Subscription Plan</Label>
                <Select
                  value={newTenant.subscription_plan}
                  onValueChange={(v) => setNewTenant(prev => ({ ...prev, subscription_plan: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={newTenant.address}
                onChange={(e) => setNewTenant(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Street, City, Country"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Users</Label>
                <Input
                  type="number"
                  value={newTenant.max_users}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, max_users: parseInt(e.target.value) || 5 }))}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Vehicles</Label>
                <Input
                  type="number"
                  value={newTenant.max_vehicles}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, max_vehicles: parseInt(e.target.value) || 10 }))}
                  min={1}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTenant} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Update tenant details and subscription settings.
            </DialogDescription>
          </DialogHeader>

          {editingTenant && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  value={editingTenant.company_name}
                  onChange={(e) => setEditingTenant(prev => prev ? { ...prev, company_name: e.target.value } : null)}
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingTenant.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editingTenant.phone || ""}
                    onChange={(e) => setEditingTenant(prev => prev ? { ...prev, phone: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editingTenant.status}
                    onValueChange={(v) => setEditingTenant(prev => prev ? { ...prev, status: v } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={editingTenant.address || ""}
                  onChange={(e) => setEditingTenant(prev => prev ? { ...prev, address: e.target.value } : null)}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select
                    value={editingTenant.subscription_plan}
                    onValueChange={(v) => setEditingTenant(prev => prev ? { ...prev, subscription_plan: v } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Max Users</Label>
                  <Input
                    type="number"
                    value={editingTenant.max_users}
                    onChange={(e) => setEditingTenant(prev => prev ? { ...prev, max_users: parseInt(e.target.value) || 5 } : null)}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Vehicles</Label>
                  <Input
                    type="number"
                    value={editingTenant.max_vehicles}
                    onChange={(e) => setEditingTenant(prev => prev ? { ...prev, max_vehicles: parseInt(e.target.value) || 10 } : null)}
                    min={1}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTenant} disabled={updating}>
              {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
