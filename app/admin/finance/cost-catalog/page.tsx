"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  BookOpen,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Cost group colors for visual distinction
const GROUP_COLORS: Record<string, string> = {
  A: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  B: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  C: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  D: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  E: "bg-rose-500/20 text-rose-400 border-rose-500/40",
  F: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
  G: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  H: "bg-teal-500/20 text-teal-400 border-teal-500/40",
};

interface CostGroup {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

interface CostCategory {
  id: string;
  group_id: string;
  code: string;
  name: string;
  display_order: number;
}

interface CostCatalogItem {
  id: string;
  cost_code: string;
  category_id: string | null;
  cost_line: string;
  description: string | null;
  unit: string | null;
  nature: string | null;
  behavior: string | null;
  is_active: boolean;
  is_system: boolean;
  driver_allowed: boolean;
  maintenance_allowed: boolean;
  manual_allowed: boolean;
  display_order: number;
}

export default function CostCatalogPage() {
  const { session: adminSession } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CostGroup[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [catalog, setCatalog] = useState<CostCatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CostCatalogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    cost_code: "",
    cost_line: "",
    description: "",
    unit: "EUR",
    nature: "variable",
    behavior: "direct",
    is_active: true,
    driver_allowed: false,
    maintenance_allowed: false,
    manual_allowed: true,
    group_id: "",
    category_id: "",
  });

  useEffect(() => {
    if (adminSession?.id) {
      fetchAll();
    }
  }, [adminSession?.id]);

  const fetchAll = async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();

    const [groupsRes, categoriesRes, catalogRes] = await Promise.all([
      supabase
        .from("cost_catalog_groups")
        .select("*")
        .eq("admin_id", adminSession.id)
        .order("display_order"),
      supabase
        .from("cost_catalog_categories")
        .select("*")
        .eq("admin_id", adminSession.id)
        .order("display_order"),
      supabase
        .from("cost_catalog")
        .select("*")
        .eq("admin_id", adminSession.id)
        .order("cost_code"),
    ]);

    if (groupsRes.error) {
      console.error("[v0] Groups fetch error:", groupsRes.error);
    }
    if (categoriesRes.error) {
      console.error("[v0] Categories fetch error:", categoriesRes.error);
    }
    if (catalogRes.error) {
      console.error("[v0] Catalog fetch error:", catalogRes.error);
    }

    setGroups(groupsRes.data || []);
    setCategories(categoriesRes.data || []);
    setCatalog(catalogRes.data || []);

    // Expand first group by default
    if (groupsRes.data && groupsRes.data.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([groupsRes.data[0].code]));
    }

    setLoading(false);
  };

  // Build lookup maps
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Build hierarchy: Group -> Categories -> Items
  const tree = useMemo(() => {
    let filtered = catalog;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.cost_code.toLowerCase().includes(q) ||
          item.cost_line.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }

    if (!showInactive) {
      filtered = filtered.filter((item) => item.is_active);
    }

    return groups
      .filter((g) => groupFilter === "all" || g.code === groupFilter)
      .map((group) => {
        const groupCategories = categories
          .filter((c) => c.group_id === group.id)
          .map((cat) => ({
            ...cat,
            items: filtered
              .filter((item) => item.category_id === cat.id)
              .sort((a, b) => a.cost_code.localeCompare(b.cost_code)),
          }))
          .filter((cat) => cat.items.length > 0);

        const totalItems = groupCategories.reduce((sum, c) => sum + c.items.length, 0);

        return {
          ...group,
          categories: groupCategories,
          totalItems,
        };
      })
      .filter((g) => g.totalItems > 0);
  }, [catalog, groups, categories, searchQuery, groupFilter, showInactive]);

  const toggleGroup = (groupCode: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupCode)) next.delete(groupCode);
      else next.add(groupCode);
      return next;
    });
  };

  // Categories filtered by selected group in dialog
  const dialogCategories = useMemo(() => {
    if (!formData.group_id) return [];
    return categories.filter((c) => c.group_id === formData.group_id);
  }, [categories, formData.group_id]);

  // Auto-generate next cost code when group/category selected
  const generateNextCode = (categoryCode: string) => {
    const existingCodes = catalog
      .filter((c) => c.cost_code.startsWith(categoryCode + "-"))
      .map((c) => {
        const m = c.cost_code.match(/-(\d+)$/);
        return m ? parseInt(m[1]) : 0;
      });
    const max = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${categoryCode}-${String(max + 1).padStart(3, "0")}`;
  };

  const openEditDialog = (item?: CostCatalogItem) => {
    if (item) {
      const cat = item.category_id ? categoryById.get(item.category_id) : null;
      setEditItem(item);
      setFormData({
        cost_code: item.cost_code,
        cost_line: item.cost_line,
        description: item.description || "",
        unit: item.unit || "EUR",
        nature: item.nature || "variable",
        behavior: item.behavior || "direct",
        is_active: item.is_active,
        driver_allowed: item.driver_allowed ?? false,
        maintenance_allowed: item.maintenance_allowed ?? false,
        manual_allowed: item.manual_allowed ?? true,
        group_id: cat?.group_id || "",
        category_id: item.category_id || "",
      });
    } else {
      setEditItem(null);
      setFormData({
        cost_code: "",
        cost_line: "",
        description: "",
        unit: "EUR",
        nature: "variable",
        behavior: "direct",
        is_active: true,
        driver_allowed: false,
        maintenance_allowed: false,
        manual_allowed: true,
        group_id: "",
        category_id: "",
      });
    }
    setEditDialogOpen(true);
  };

  const handleCategoryChange = (categoryId: string) => {
    const cat = categoryById.get(categoryId);
    if (!cat) return;
    setFormData((prev) => ({
      ...prev,
      category_id: categoryId,
      cost_code: editItem ? prev.cost_code : generateNextCode(cat.code),
    }));
  };

  const handleSave = async () => {
    if (!adminSession?.id) return;
    if (!formData.cost_code || !formData.cost_line) {
      toast({
        title: "Validation Error",
        description: "Cost code and name are required",
        variant: "destructive",
      });
      return;
    }
    if (!formData.category_id) {
      toast({
        title: "Validation Error",
        description: "Please select a group and category",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const payload = {
      admin_id: adminSession.id,
      cost_code: formData.cost_code,
      category_id: formData.category_id,
      cost_line: formData.cost_line,
      description: formData.description || null,
      unit: formData.unit || null,
      nature: formData.nature,
      behavior: formData.behavior,
      is_active: formData.is_active,
      driver_allowed: formData.driver_allowed,
      maintenance_allowed: formData.maintenance_allowed,
      manual_allowed: formData.manual_allowed,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("cost_catalog").update(payload).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("cost_catalog").insert(payload));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: editItem ? "Cost code updated" : "Cost code created" });
      fetchAll();
      setEditDialogOpen(false);
    }

    setSaving(false);
  };

  const handleDelete = async (item: CostCatalogItem) => {
    if (item.is_system) {
      toast({
        title: "Cannot Delete",
        description: "System cost codes cannot be deleted. You can deactivate them instead.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Delete "${item.cost_line}"? This cannot be undone.`)) return;

    const supabase = createClient();
    const { error } = await supabase.from("cost_catalog").delete().eq("id", item.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Cost code deleted" });
      fetchAll();
    }
  };

  const handleSeedDefaultCatalog = async () => {
    if (!adminSession?.id) {
      toast({ title: "Error", description: "No admin session found.", variant: "destructive" });
      return;
    }
    if (!confirm("This will load the default cost catalog. Continue?")) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/finance/seed-cost-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: adminSession.id }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Catalog Loaded",
          description: `Added ${data.groupsAdded || 0} groups, ${
            data.categoriesAdded || 0
          } categories, ${data.count} cost codes.`,
        });
        fetchAll();
      } else {
        const err = await response.json();
        throw new Error(err.error || "Failed to seed catalog");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Cost Catalog
          </h1>
          <p className="text-muted-foreground">
            {catalog.length} cost codes across {groups.length} groups, {categories.length}{" "}
            categories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSeedDefaultCatalog} disabled={saving}>
            <Upload className="h-4 w-4 mr-2" />
            {saving ? "Loading..." : "Load Default Catalog"}
          </Button>
          <Button onClick={() => openEditDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Cost Code
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cost codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter by group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.code}>
                    {g.code}. {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="show-inactive"
                checked={showInactive}
                onCheckedChange={setShowInactive}
              />
              <Label htmlFor="show-inactive">Show Inactive</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Catalog Tree */}
      <Card>
        <CardContent className="p-0">
          {tree.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Cost Codes Found</h3>
              <p className="text-muted-foreground mb-4">
                Start by loading the default cost catalog or adding your own cost codes.
              </p>
              <Button onClick={handleSeedDefaultCatalog} disabled={saving}>
                <Upload className="h-4 w-4 mr-2" />
                Load Default Catalog
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tree.map((group) => (
                <Collapsible
                  key={group.id}
                  open={expandedGroups.has(group.code)}
                  onOpenChange={() => toggleGroup(group.code)}
                >
                  <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {expandedGroups.has(group.code) ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <Badge variant="outline" className={GROUP_COLORS[group.code] || ""}>
                        {group.code}
                      </Badge>
                      <span className="font-semibold">{group.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{group.totalItems} codes</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {group.categories.map((category) => (
                      <div key={category.id} className="border-t border-border/50">
                        <div className="px-8 py-2 bg-muted/30 text-sm font-medium text-muted-foreground">
                          {category.code}. {category.name}{" "}
                          <span className="text-xs">({category.items.length})</span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-32 pl-12">Code</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead className="w-24">Unit</TableHead>
                              <TableHead className="w-24">Nature</TableHead>
                              <TableHead className="w-24">Status</TableHead>
                              <TableHead className="w-20 text-right pr-4">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {category.items.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono pl-12">{item.cost_code}</TableCell>
                                <TableCell>
                                  <span className="font-medium">{item.cost_line}</span>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {item.unit || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    {item.nature || "variable"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {item.is_active ? (
                                    <Badge className="bg-emerald-500/20 text-emerald-400">
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">Inactive</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right pr-4">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openEditDialog(item)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {!item.is_system && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => handleDelete(item)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Cost Code" : "Add Cost Code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Group / Category selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="group">Group *</Label>
                <Select
                  value={formData.group_id}
                  onValueChange={(v) =>
                    setFormData({ ...formData, group_id: v, category_id: "" })
                  }
                >
                  <SelectTrigger id="group">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.code}. {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={handleCategoryChange}
                  disabled={!formData.group_id}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {dialogCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code}. {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost_code">Cost Code *</Label>
                <Input
                  id="cost_code"
                  value={formData.cost_code}
                  onChange={(e) =>
                    setFormData({ ...formData, cost_code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g., A1-001"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Auto-generated from category</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="EUR, liter, km..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost_line">Name *</Label>
              <Input
                id="cost_line"
                value={formData.cost_line}
                onChange={(e) => setFormData({ ...formData, cost_line: e.target.value })}
                placeholder="e.g., Diesel Fuel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nature">Nature</Label>
                <Select
                  value={formData.nature}
                  onValueChange={(v) => setFormData({ ...formData, nature: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="variable">Variable</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="semi_variable">Semi-Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="behavior">Behavior</Label>
                <Select
                  value={formData.behavior}
                  onValueChange={(v) => setFormData({ ...formData, behavior: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="indirect">Indirect</SelectItem>
                    <SelectItem value="pass_through">Pass-Through</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="driver_allowed"
                  checked={formData.driver_allowed}
                  onCheckedChange={(v) => setFormData({ ...formData, driver_allowed: v })}
                />
                <Label htmlFor="driver_allowed" className="text-sm">Driver app</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="maintenance_allowed"
                  checked={formData.maintenance_allowed}
                  onCheckedChange={(v) => setFormData({ ...formData, maintenance_allowed: v })}
                />
                <Label htmlFor="maintenance_allowed" className="text-sm">Maintenance</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="manual_allowed"
                  checked={formData.manual_allowed}
                  onCheckedChange={(v) => setFormData({ ...formData, manual_allowed: v })}
                />
                <Label htmlFor="manual_allowed" className="text-sm">Manual entry</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
