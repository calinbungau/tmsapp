"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Users,
  Truck,
  Container,
  MoreVertical,
  Edit2,
  Trash2,
  Search,
  Loader2,
  FolderOpen,
  Building2,
  MapPin,
  Briefcase,
  Settings,
  X,
  Check,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

interface FleetGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  group_type: string;
  is_active: boolean;
  created_at: string;
  member_count?: {
    drivers: number;
    vehicles: number;
    trailers: number;
  };
}

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  fleet_group_id: string | null;
  is_subcontractor: boolean;
}

interface Vehicle {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  fleet_group_id: string | null;
  is_subcontractor: boolean;
}

interface Trailer {
  id: string;
  plate_number: string;
  trailer_type: string | null;
  fleet_group_id: string | null;
  is_subcontractor: boolean;
}

const GROUP_TYPES = [
  { value: "operational", label: "Operational", icon: Settings, description: "Night shift, Express, etc." },
  { value: "regional", label: "Regional", icon: MapPin, description: "Berlin depot, Romania fleet, etc." },
  { value: "client", label: "Client-Specific", icon: Briefcase, description: "Dedicated fleets for clients" },
  { value: "custom", label: "Custom", icon: FolderOpen, description: "Any other grouping" },
];

const GROUP_COLORS = [
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "green", label: "Green", class: "bg-green-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
  { value: "purple", label: "Purple", class: "bg-purple-500" },
  { value: "red", label: "Red", class: "bg-red-500" },
  { value: "yellow", label: "Yellow", class: "bg-yellow-500" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
  { value: "pink", label: "Pink", class: "bg-pink-500" },
];

const GROUP_ICONS = [
  { value: "folder", label: "Folder", Icon: FolderOpen },
  { value: "users", label: "Team", Icon: Users },
  { value: "truck", label: "Truck", Icon: Truck },
  { value: "building", label: "Building", Icon: Building2 },
  { value: "map", label: "Location", Icon: MapPin },
  { value: "briefcase", label: "Business", Icon: Briefcase },
];

export default function FleetGroupsPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [groups, setGroups] = useState<FleetGroup[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FleetGroup | null>(null);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<FleetGroup | null>(null);
  const [memberTab, setMemberTab] = useState<"drivers" | "vehicles" | "trailers">("drivers");
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "blue",
    icon: "folder",
    group_type: "operational",
  });
  
  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const fetchGroups = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();
    
    // Fetch groups
    const { data: groupsData, error: groupsError } = await supabase
      .from("fleet_groups")
      .select("*")
      .eq("admin_id", adminSession.id)
      .order("name");
    
    if (groupsData && groupsData.length > 0) {
      // Get member counts for each group
      const groupsWithCounts = await Promise.all(
        groupsData.map(async (group) => {
          const [driversRes, vehiclesRes, trailersRes] = await Promise.all([
            supabase.from("drivers").select("id", { count: "exact", head: true }).eq("fleet_group_id", group.id),
            supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("fleet_group_id", group.id),
            supabase.from("trailers").select("id", { count: "exact", head: true }).eq("fleet_group_id", group.id),
          ]);
          return {
            ...group,
            member_count: {
              drivers: driversRes.count || 0,
              vehicles: vehiclesRes.count || 0,
              trailers: trailersRes.count || 0,
            },
          };
        })
      );
      setGroups(groupsWithCounts);
    } else {
      // No groups or error, set empty array
      setGroups(groupsData || []);
    }
    
    setLoading(false);
  }, [adminSession?.id]);

  const fetchAssets = useCallback(async () => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    
    const [driversRes, vehiclesRes, trailersRes] = await Promise.all([
      supabase.from("drivers").select("id, name, phone, fleet_group_id, is_subcontractor").eq("admin_id", adminSession.id).order("name"),
      supabase.from("vehicles").select("id, plate_number, make, model, fleet_group_id, is_subcontractor").eq("admin_id", adminSession.id).order("plate_number"),
      supabase.from("trailers").select("id, plate_number, trailer_type, fleet_group_id, is_subcontractor").eq("admin_id", adminSession.id).order("plate_number"),
    ]);
    
    setDrivers(driversRes.data || []);
    setVehicles(vehiclesRes.data || []);
    setTrailers(trailersRes.data || []);
  }, [adminSession?.id]);

  useEffect(() => {
    if (adminSession?.id) {
      fetchGroups();
      fetchAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSession?.id]);

  const resetForm = () => {
    setFormData({ name: "", description: "", color: "blue", icon: "folder", group_type: "operational" });
    setEditingGroup(null);
  };

  const handleOpenDialog = (group?: FleetGroup) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        name: group.name,
        description: group.description || "",
        color: group.color,
        icon: group.icon,
        group_type: group.group_type,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formData.name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      color: formData.color,
      icon: formData.icon,
      group_type: formData.group_type,
      admin_id: adminSession.id,
    };

    if (editingGroup) {
      const { error } = await supabase.from("fleet_groups").update(payload).eq("id", editingGroup.id);
      if (error) {
        toast.error("Failed to update group");
      } else {
        toast.success("Group updated");
      }
    } else {
      const { error } = await supabase.from("fleet_groups").insert(payload);
      if (error) {
        toast.error("Failed to create group");
      } else {
        toast.success("Group created");
      }
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchGroups();
  };

  const handleDelete = async (group: FleetGroup) => {
    if (!confirm(`Delete group "${group.name}"? Members will be unassigned.`)) return;
    const supabase = createClient();
    
    // Unassign all members first
    await Promise.all([
      supabase.from("drivers").update({ fleet_group_id: null }).eq("fleet_group_id", group.id),
      supabase.from("vehicles").update({ fleet_group_id: null }).eq("fleet_group_id", group.id),
      supabase.from("trailers").update({ fleet_group_id: null }).eq("fleet_group_id", group.id),
    ]);
    
    const { error } = await supabase.from("fleet_groups").delete().eq("id", group.id);
    if (error) {
      toast.error("Failed to delete group");
    } else {
      toast.success("Group deleted");
      fetchGroups();
    }
  };

  const handleOpenMembers = (group: FleetGroup) => {
    setSelectedGroup(group);
    setMembersDialogOpen(true);
    setMemberSearch("");
  };

  const toggleMember = async (type: "drivers" | "vehicles" | "trailers", id: string, currentGroupId: string | null) => {
    if (!selectedGroup) return;
    const supabase = createClient();
    const newGroupId = currentGroupId === selectedGroup.id ? null : selectedGroup.id;
    
    const { error } = await supabase.from(type).update({ fleet_group_id: newGroupId }).eq("id", id);
    
    if (error) {
      toast.error("Failed to update member");
    } else {
      // Update local state
      if (type === "drivers") {
        setDrivers(drivers.map(d => d.id === id ? { ...d, fleet_group_id: newGroupId } : d));
      } else if (type === "vehicles") {
        setVehicles(vehicles.map(v => v.id === id ? { ...v, fleet_group_id: newGroupId } : v));
      } else {
        setTrailers(trailers.map(t => t.id === id ? { ...t, fleet_group_id: newGroupId } : t));
      }
      fetchGroups(); // Refresh counts
    }
  };

  const getColorClass = (color: string) => {
    return GROUP_COLORS.find(c => c.value === color)?.class || "bg-blue-500";
  };

  const getIconComponent = (icon: string) => {
    const IconData = GROUP_ICONS.find(i => i.value === icon);
    return IconData?.Icon || FolderOpen;
  };

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFilteredMembers = () => {
    const search = memberSearch.toLowerCase();
    if (memberTab === "drivers") {
      return drivers.filter(d => d.name.toLowerCase().includes(search));
    } else if (memberTab === "vehicles") {
      return vehicles.filter(v => v.plate_number.toLowerCase().includes(search));
    } else {
      return trailers.filter(t => t.plate_number.toLowerCase().includes(search));
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fleet Groups</h1>
          <p className="text-sm text-muted-foreground">Organize drivers, vehicles, and trailers into groups</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          New Group
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Groups Grid */}
      {filteredGroups.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No groups yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create groups to organize your fleet assets</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Group
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((group) => {
            const IconComponent = getIconComponent(group.icon);
            const totalMembers = (group.member_count?.drivers || 0) + (group.member_count?.vehicles || 0) + (group.member_count?.trailers || 0);
            
            return (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getColorClass(group.color)} text-white`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{group.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {GROUP_TYPES.find(t => t.value === group.group_type)?.label || group.group_type}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDialog(group)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenMembers(group)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Manage Members
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(group)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  {group.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{group.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{group.member_count?.drivers || 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Truck className="h-4 w-4" />
                      <span>{group.member_count?.vehicles || 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Container className="h-4 w-4" />
                      <span>{group.member_count?.trailers || 0}</span>
                    </div>
                    <div className="ml-auto">
                      <Badge variant="secondary" className="text-xs">
                        {totalMembers} total
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => handleOpenMembers(group)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Manage Members
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Group Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Create Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Berlin Depot"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.group_type}
                onValueChange={(value) => setFormData(p => ({ ...p, group_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Color</Label>
                <Select
                  value={formData.color}
                  onValueChange={(value) => setFormData(p => ({ ...p, color: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_COLORS.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${color.class}`} />
                          <span>{color.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select
                  value={formData.icon}
                  onValueChange={(value) => setFormData(p => ({ ...p, icon: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_ICONS.map((icon) => (
                      <SelectItem key={icon.value} value={icon.value}>
                        <div className="flex items-center gap-2">
                          <icon.Icon className="h-4 w-4" />
                          <span>{icon.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingGroup ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedGroup && (
                <>
                  <div className={`p-1.5 rounded ${getColorClass(selectedGroup.color)} text-white`}>
                    {(() => {
                      const IconComponent = getIconComponent(selectedGroup.icon);
                      return <IconComponent className="h-4 w-4" />;
                    })()}
                  </div>
                  {selectedGroup.name} - Members
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={memberTab} onValueChange={(v) => setMemberTab(v as typeof memberTab)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="drivers" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Drivers ({drivers.filter(d => d.fleet_group_id === selectedGroup?.id).length})
              </TabsTrigger>
              <TabsTrigger value="vehicles" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Vehicles ({vehicles.filter(v => v.fleet_group_id === selectedGroup?.id).length})
              </TabsTrigger>
              <TabsTrigger value="trailers" className="flex items-center gap-2">
                <Container className="h-4 w-4" />
                Trailers ({trailers.filter(t => t.fleet_group_id === selectedGroup?.id).length})
              </TabsTrigger>
            </TabsList>
            
            <div className="relative my-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${memberTab}...`}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex-1 overflow-auto border rounded-lg">
              <TabsContent value="drivers" className="m-0">
                <div className="divide-y">
                  {getFilteredMembers().map((driver) => {
                    const d = driver as Driver;
                    const isInGroup = d.fleet_group_id === selectedGroup?.id;
                    return (
                      <div
                        key={d.id}
                        className={`flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer ${isInGroup ? "bg-primary/5" : ""}`}
                        onClick={() => toggleMember("drivers", d.id, d.fleet_group_id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox checked={isInGroup} />
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {d.name}
                              {d.is_subcontractor && (
                                <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500">SUB</Badge>
                              )}
                            </div>
                            {d.phone && <div className="text-xs text-muted-foreground">{d.phone}</div>}
                          </div>
                        </div>
                        {isInGroup && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    );
                  })}
                  {getFilteredMembers().length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">No drivers found</div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="vehicles" className="m-0">
                <div className="divide-y">
                  {getFilteredMembers().map((vehicle) => {
                    const v = vehicle as Vehicle;
                    const isInGroup = v.fleet_group_id === selectedGroup?.id;
                    return (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer ${isInGroup ? "bg-primary/5" : ""}`}
                        onClick={() => toggleMember("vehicles", v.id, v.fleet_group_id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox checked={isInGroup} />
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {v.plate_number}
                              {v.is_subcontractor && (
                                <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500">SUB</Badge>
                              )}
                            </div>
                            {(v.make || v.model) && (
                              <div className="text-xs text-muted-foreground">{[v.make, v.model].filter(Boolean).join(" ")}</div>
                            )}
                          </div>
                        </div>
                        {isInGroup && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    );
                  })}
                  {getFilteredMembers().length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">No vehicles found</div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="trailers" className="m-0">
                <div className="divide-y">
                  {getFilteredMembers().map((trailer) => {
                    const t = trailer as Trailer;
                    const isInGroup = t.fleet_group_id === selectedGroup?.id;
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer ${isInGroup ? "bg-primary/5" : ""}`}
                        onClick={() => toggleMember("trailers", t.id, t.fleet_group_id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox checked={isInGroup} />
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {t.plate_number}
                              {t.is_subcontractor && (
                                <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-500">SUB</Badge>
                              )}
                            </div>
                            {t.trailer_type && (
                              <div className="text-xs text-muted-foreground">{t.trailer_type.replace(/_/g, " ")}</div>
                            )}
                          </div>
                        </div>
                        {isInGroup && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    );
                  })}
                  {getFilteredMembers().length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">No trailers found</div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
          
          <DialogFooter className="mt-4">
            <Button onClick={() => setMembersDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
