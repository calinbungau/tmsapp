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
import {
  ArrowLeft,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
  Mail,
  UserCircle,
  Key,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useAdminSession } from "@/hooks/use-admin-session";

interface Role {
  id: string;
  name: string;
  color: string;
  is_system_role: boolean;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface User {
  id: string;
  email: string;
  status: "active" | "inactive" | "suspended";
  is_owner: boolean;
  last_login_at: string | null;
  created_at: string;
  role_id: string | null;
  employee_id: string | null;
  role?: Role | null;
  employee?: Employee | null;
}

export default function UsersPage() {
  const router = useRouter();
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoleId, setFormRoleId] = useState<string>("none");
  const [formEmployeeId, setFormEmployeeId] = useState<string>("none");
  const [formStatus, setFormStatus] = useState<"active" | "inactive" | "suspended">("active");

  // Check if current user is owner (only owners can manage users)
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
    
    // Fetch users with roles and employees
    const { data: usersData } = await supabase
      .from("users")
      .select(`
        *,
        role:roles(id, name, color, is_system_role),
        employee:employees(id, first_name, last_name, email)
      `)
      .eq("admin_id", adminSession.id)
      .order("created_at", { ascending: false });
    
    // Fetch all roles
    const { data: rolesData } = await supabase
      .from("roles")
      .select("id, name, color, is_system_role")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("hierarchy_level", { ascending: true });
    
    // Fetch employees without user accounts
    const { data: employeesData } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email")
      .eq("admin_id", adminSession.id)
      .eq("status", "active")
      .order("first_name", { ascending: true });
    
    if (usersData) setUsers(usersData);
    if (rolesData) setRoles(rolesData);
    if (employeesData) setEmployees(employeesData);
    
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingUser(null);
    setFormEmail("");
    setFormPassword("");
    setFormRoleId("none");
    setFormEmployeeId("none");
    setFormStatus("active");
    setDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormPassword("");
    setFormRoleId(user.role_id || "none");
    setFormEmployeeId(user.employee_id || "none");
    setFormStatus(user.status);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formEmail) return;
    setSaving(true);
    
    try {
      if (editingUser) {
        // Update existing user via API
        const response = await fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingUser.id,
            email: formEmail,
            password: formPassword || undefined,
            role_id: formRoleId,
            employee_id: formEmployeeId,
            status: formStatus,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          alert(error.error || "Failed to update user");
          setSaving(false);
          return;
        }
      } else {
        // Create new user via API (with bcrypt hashing)
        const response = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_id: adminSession.id,
            email: formEmail,
            password: formPassword || undefined,
            role_id: formRoleId,
            employee_id: formEmployeeId,
            status: formStatus,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          alert(error.error || "Failed to create user");
          setSaving(false);
          return;
        }
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Save error:", error);
      alert("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (user.is_owner) return;
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    await fetch(`/api/users?id=${user.id}`, { method: "DELETE" });
    fetchData();
  };

  const handleToggleStatus = async (user: User) => {
    if (user.is_owner) return;
    
    const newStatus = user.status === "active" ? "suspended" : "active";
    await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        status: newStatus,
        role_id: user.role_id,
        employee_id: user.employee_id,
      }),
    });
    fetchData();
  };

  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const employeeName = user.employee 
      ? `${user.employee.first_name} ${user.employee.last_name}`.toLowerCase()
      : "";
    return (
      user.email.toLowerCase().includes(query) ||
      employeeName.includes(query) ||
      user.role?.name.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case "inactive":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Inactive</Badge>;
      case "suspended":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading && users.length === 0) {
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
        Back to Settings
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts and access permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/settings/roles">
            <Button variant="outline" className="bg-transparent">
              <Shield className="h-4 w-4 mr-2" />
              Manage Roles
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit User" : "Add New User"}</DialogTitle>
                <DialogDescription>
                  {editingUser ? "Update user account details" : "Create a new user account with login credentials"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@company.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {editingUser ? "New Password (leave blank to keep)" : "Password"}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={editingUser ? "Leave blank to keep current" : "Enter password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={formRoleId} onValueChange={setFormRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Role</SelectItem>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: role.color }}
                            />
                            {role.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee">Link to Employee</Label>
                  <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an employee (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Employee Link</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.first_name} {emp.last_name}
                          {emp.email && <span className="text-muted-foreground ml-2">({emp.email})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive" | "suspended")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-transparent">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving || !formEmail}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingUser ? "Save Changes" : "Create User"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by email, name, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          <CardDescription>
            Users can log in to the admin panel with their credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {user.email}
                            {user.is_owner && (
                              <Badge variant="outline" className="text-xs">Owner</Badge>
                            )}
                          </div>
                          {user.employee && (
                            <div className="text-sm text-muted-foreground">
                              {user.employee.first_name} {user.employee.last_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role ? (
                        <Badge 
                          variant="outline" 
                          style={{ 
                            borderColor: user.role.color,
                            color: user.role.color,
                          }}
                        >
                          {user.role.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">No role</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(user.last_login_at)}
                    </TableCell>
                    <TableCell>
                      {!user.is_owner && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(user)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                              {user.status === "active" ? (
                                <>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Suspend
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
                              onClick={() => handleDelete(user)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
