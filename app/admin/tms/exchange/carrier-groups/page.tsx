"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAdminSession } from "@/hooks/use-admin-session"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Plus,
  Users,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  FolderOpen,
  UserPlus,
  X,
  Search,
  Building2,
  Truck,
  Globe,
  AlertTriangle,
} from "lucide-react"

interface CarrierGroup {
  id: string
  admin_id: string
  name: string
  description: string | null
  color: string
  group_type: "static" | "dynamic"
  match_mode: "all" | "any"
  is_active: boolean
  created_at: string
  member_count?: number
  rules?: GroupRule[]
}

interface GroupRule {
  id: string
  group_id: string
  field: string
  operator: string
  value: string | null
}

interface BusinessPartner {
  id: string
  name: string
  country: string | null
  city: string | null
  types: string[] | null
}

const COLORS = [
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "green", label: "Green", class: "bg-green-500" },
  { value: "yellow", label: "Yellow", class: "bg-yellow-500" },
  { value: "red", label: "Red", class: "bg-red-500" },
  { value: "purple", label: "Purple", class: "bg-purple-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
  { value: "pink", label: "Pink", class: "bg-pink-500" },
]

const RULE_FIELDS = [
  { value: "country", label: "Country", icon: Globe },
  { value: "has_trucks", label: "Has Trucks", icon: Truck },
  { value: "has_trailers", label: "Has Trailers", icon: Truck },
  { value: "name_contains", label: "Name Contains", icon: Building2 },
]

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  country: [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Not Equals" },
    { value: "in", label: "In List" },
  ],
  has_trucks: [
    { value: "is_true", label: "Yes" },
    { value: "is_false", label: "No" },
  ],
  has_trailers: [
    { value: "is_true", label: "Yes" },
    { value: "is_false", label: "No" },
  ],
  name_contains: [
    { value: "contains", label: "Contains" },
  ],
}

export default function CarrierGroupsPage() {
  const { session, loading: sessionLoading } = useAdminSession()
  const adminId = session?.id
  const supabase = createClient()

  const [groups, setGroups] = useState<CarrierGroup[]>([])
  const [carriers, setCarriers] = useState<BusinessPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<CarrierGroup | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "blue",
    group_type: "static" as "static" | "dynamic",
    match_mode: "all" as "all" | "any",
  })
  const [rules, setRules] = useState<Omit<GroupRule, "id" | "group_id">[]>([])

  // Member management
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [carrierSearch, setCarrierSearch] = useState("")

  const fetchGroups = useCallback(async () => {
    if (!adminId) return

    setLoading(true)
    try {
      // Fetch groups
      const { data: groupsData, error: groupsError } = await supabase
        .from("carrier_groups")
        .select("*")
        .eq("admin_id", adminId)
        .order("display_order", { ascending: true })

      if (groupsError) throw groupsError

      // Fetch member counts for static groups
      const { data: membersData } = await supabase
        .from("carrier_group_members")
        .select("group_id")

      const memberCounts: Record<string, number> = {}
      membersData?.forEach((m: { group_id: string }) => {
        memberCounts[m.group_id] = (memberCounts[m.group_id] || 0) + 1
      })

      // Fetch rules for dynamic groups
      const { data: rulesData } = await supabase
        .from("carrier_group_rules")
        .select("*")

      const rulesByGroup: Record<string, GroupRule[]> = {}
      rulesData?.forEach((r: GroupRule & { group_id: string }) => {
        if (!rulesByGroup[r.group_id]) rulesByGroup[r.group_id] = []
        rulesByGroup[r.group_id].push(r)
      })

      const enrichedGroups = (groupsData || []).map((g: CarrierGroup) => ({
        ...g,
        member_count: memberCounts[g.id] || 0,
        rules: rulesByGroup[g.id] || [],
      }))

      setGroups(enrichedGroups)
    } catch (error) {
      console.error("Error fetching groups:", error)
      toast.error("Failed to load carrier groups")
    } finally {
      setLoading(false)
    }
  }, [adminId, supabase])

  const fetchCarriers = useCallback(async () => {
    if (!adminId) return

    try {
      const { data, error } = await supabase
        .from("business_partners")
        .select("id, name, country, city, types")
        .eq("admin_id", adminId)
        .contains("types", ["carrier"])
        .order("name")

      if (error) throw error
      setCarriers(data || [])
    } catch (error) {
      console.error("Error fetching carriers:", error)
    }
  }, [adminId, supabase])

  useEffect(() => {
    if (adminId) {
      fetchGroups()
      fetchCarriers()
    }
  }, [adminId, fetchGroups, fetchCarriers])

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      color: "blue",
      group_type: "static",
      match_mode: "all",
    })
    setRules([])
  }

  const handleCreateGroup = async () => {
    if (!adminId || !formData.name.trim()) {
      toast.error("Please enter a group name")
      return
    }

    setSaving(true)
    try {
      // Create the group
      const { data: newGroup, error: groupError } = await supabase
        .from("carrier_groups")
        .insert({
          admin_id: adminId,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          color: formData.color,
          group_type: formData.group_type,
          match_mode: formData.match_mode,
        })
        .select()
        .single()

      if (groupError) throw groupError

      // If dynamic group, create rules
      if (formData.group_type === "dynamic" && rules.length > 0) {
        const rulesWithGroupId = rules.map((r) => ({
          ...r,
          group_id: newGroup.id,
        }))

        const { error: rulesError } = await supabase
          .from("carrier_group_rules")
          .insert(rulesWithGroupId)

        if (rulesError) throw rulesError
      }

      toast.success("Carrier group created")
      setShowCreateDialog(false)
      resetForm()
      fetchGroups()
    } catch (error) {
      console.error("Error creating group:", error)
      toast.error("Failed to create group")
    } finally {
      setSaving(false)
    }
  }

  const handleEditGroup = async () => {
    if (!selectedGroup || !formData.name.trim()) {
      toast.error("Please enter a group name")
      return
    }

    setSaving(true)
    try {
      // Update the group
      const { error: groupError } = await supabase
        .from("carrier_groups")
        .update({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          color: formData.color,
          match_mode: formData.match_mode,
        })
        .eq("id", selectedGroup.id)

      if (groupError) throw groupError

      // If dynamic group, update rules
      if (selectedGroup.group_type === "dynamic") {
        // Delete existing rules
        await supabase
          .from("carrier_group_rules")
          .delete()
          .eq("group_id", selectedGroup.id)

        // Insert new rules
        if (rules.length > 0) {
          const rulesWithGroupId = rules.map((r) => ({
            ...r,
            group_id: selectedGroup.id,
          }))

          const { error: rulesError } = await supabase
            .from("carrier_group_rules")
            .insert(rulesWithGroupId)

          if (rulesError) throw rulesError
        }
      }

      toast.success("Carrier group updated")
      setShowEditDialog(false)
      setSelectedGroup(null)
      resetForm()
      fetchGroups()
    } catch (error) {
      console.error("Error updating group:", error)
      toast.error("Failed to update group")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from("carrier_groups")
        .delete()
        .eq("id", selectedGroup.id)

      if (error) throw error

      toast.success("Carrier group deleted")
      setShowDeleteDialog(false)
      setSelectedGroup(null)
      fetchGroups()
    } catch (error) {
      console.error("Error deleting group:", error)
      toast.error("Failed to delete group")
    } finally {
      setSaving(false)
    }
  }

  const openEditDialog = (group: CarrierGroup) => {
    setSelectedGroup(group)
    setFormData({
      name: group.name,
      description: group.description || "",
      color: group.color,
      group_type: group.group_type,
      match_mode: group.match_mode,
    })
    setRules(
      (group.rules || []).map((r) => ({
        field: r.field,
        operator: r.operator,
        value: r.value,
      }))
    )
    setShowEditDialog(true)
  }

  const openMembersDialog = async (group: CarrierGroup) => {
    setSelectedGroup(group)
    setCarrierSearch("")

    // Fetch current members
    const { data } = await supabase
      .from("carrier_group_members")
      .select("business_partner_id")
      .eq("group_id", group.id)

    setGroupMembers((data || []).map((m: { business_partner_id: string }) => m.business_partner_id))
    setShowMembersDialog(true)
  }

  const toggleMember = async (carrierId: string) => {
    if (!selectedGroup) return

    const isMember = groupMembers.includes(carrierId)

    try {
      if (isMember) {
        // Remove member
        const { error } = await supabase
          .from("carrier_group_members")
          .delete()
          .eq("group_id", selectedGroup.id)
          .eq("business_partner_id", carrierId)

        if (error) throw error
        setGroupMembers((prev) => prev.filter((id) => id !== carrierId))
      } else {
        // Add member
        const { error } = await supabase.from("carrier_group_members").insert({
          group_id: selectedGroup.id,
          business_partner_id: carrierId,
        })

        if (error) throw error
        setGroupMembers((prev) => [...prev, carrierId])
      }
    } catch (error) {
      console.error("Error toggling member:", error)
      toast.error("Failed to update member")
    }
  }

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { field: "country", operator: "eq", value: "" },
    ])
  }

  const updateRule = (
    index: number,
    updates: Partial<Omit<GroupRule, "id" | "group_id">>
  ) => {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r
        const updated = { ...r, ...updates }
        // Reset operator when field changes
        if (updates.field && updates.field !== r.field) {
          const ops = OPERATORS[updates.field]
          updated.operator = ops?.[0]?.value || "eq"
          updated.value = ""
        }
        return updated
      })
    )
  }

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  const getColorClass = (color: string) => {
    return COLORS.find((c) => c.value === color)?.class || "bg-gray-500"
  }

  const filteredCarriers = carriers.filter(
    (c) =>
      c.name.toLowerCase().includes(carrierSearch.toLowerCase()) ||
      c.country?.toLowerCase().includes(carrierSearch.toLowerCase()) ||
      c.city?.toLowerCase().includes(carrierSearch.toLowerCase())
  )

  if (sessionLoading || loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Carrier Groups
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize carriers into groups for targeted offer distribution
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Group
        </Button>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No carrier groups yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first group to organize carriers for offer
              distribution
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${getColorClass(group.color)}`}
                    />
                    <div>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {group.group_type === "static" ? (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {group.member_count} carrier
                            {group.member_count !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Filter className="h-3 w-3" />
                            Dynamic ({group.rules?.length || 0} rule
                            {(group.rules?.length || 0) !== 1 ? "s" : ""})
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(group)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {group.group_type === "static" && (
                        <DropdownMenuItem
                          onClick={() => openMembersDialog(group)}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Manage Members
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setSelectedGroup(group)
                          setShowDeleteDialog(true)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {group.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {group.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      group.group_type === "static" ? "secondary" : "outline"
                    }
                  >
                    {group.group_type === "static" ? "Static" : "Dynamic"}
                  </Badge>
                  {group.group_type === "dynamic" && (
                    <Badge variant="outline" className="text-xs">
                      Match {group.match_mode}
                    </Badge>
                  )}
                  {!group.is_active && (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Carrier Group</DialogTitle>
            <DialogDescription>
              Create a new group to organize carriers for offer distribution
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. German Carriers"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe this group..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Color</Label>
                  <Select
                    value={formData.color}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, color: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLORS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-3 w-3 rounded-full ${c.class}`}
                            />
                            {c.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.group_type}
                    onValueChange={(v: "static" | "dynamic") =>
                      setFormData((prev) => ({ ...prev, group_type: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="static">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Static
                        </div>
                      </SelectItem>
                      <SelectItem value="dynamic">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4" />
                          Dynamic
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dynamic rules */}
              {formData.group_type === "dynamic" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label>Rules</Label>
                    <Select
                      value={formData.match_mode}
                      onValueChange={(v: "all" | "any") =>
                        setFormData((prev) => ({ ...prev, match_mode: v }))
                      }
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Match ALL</SelectItem>
                        <SelectItem value="any">Match ANY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {rules.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                      No rules defined. Add a rule to filter carriers
                      dynamically.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rules.map((rule, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 border rounded-md bg-muted/50"
                        >
                          <Select
                            value={rule.field}
                            onValueChange={(v) =>
                              updateRule(index, { field: v })
                            }
                          >
                            <SelectTrigger className="w-36 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RULE_FIELDS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={rule.operator}
                            onValueChange={(v) =>
                              updateRule(index, { operator: v })
                            }
                          >
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(OPERATORS[rule.field] || []).map((op) => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!["is_true", "is_false"].includes(rule.operator) && (
                            <Input
                              className="flex-1 h-8"
                              placeholder="Value"
                              value={rule.value || ""}
                              onChange={(e) =>
                                updateRule(index, { value: e.target.value })
                              }
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeRule(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRule}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Rule
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Carrier Group</DialogTitle>
            <DialogDescription>Update the group settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description (optional)</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Color</Label>
                <Select
                  value={formData.color}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, color: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${c.class}`} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dynamic rules for edit */}
              {selectedGroup?.group_type === "dynamic" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label>Rules</Label>
                    <Select
                      value={formData.match_mode}
                      onValueChange={(v: "all" | "any") =>
                        setFormData((prev) => ({ ...prev, match_mode: v }))
                      }
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Match ALL</SelectItem>
                        <SelectItem value="any">Match ANY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {rules.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                      No rules defined.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rules.map((rule, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 border rounded-md bg-muted/50"
                        >
                          <Select
                            value={rule.field}
                            onValueChange={(v) =>
                              updateRule(index, { field: v })
                            }
                          >
                            <SelectTrigger className="w-36 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RULE_FIELDS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={rule.operator}
                            onValueChange={(v) =>
                              updateRule(index, { operator: v })
                            }
                          >
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(OPERATORS[rule.field] || []).map((op) => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!["is_true", "is_false"].includes(rule.operator) && (
                            <Input
                              className="flex-1 h-8"
                              placeholder="Value"
                              value={rule.value || ""}
                              onChange={(e) =>
                                updateRule(index, { value: e.target.value })
                              }
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeRule(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRule}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Rule
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false)
                setSelectedGroup(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditGroup} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog (for static groups) */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Members</DialogTitle>
            <DialogDescription>
              Add or remove carriers from {selectedGroup?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search carriers..."
                className="pl-9"
                value={carrierSearch}
                onChange={(e) => setCarrierSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="h-[300px] pr-4">
              {filteredCarriers.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No carriers found
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredCarriers.map((carrier) => (
                    <div
                      key={carrier.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                      onClick={() => toggleMember(carrier.id)}
                    >
                      <Checkbox
                        checked={groupMembers.includes(carrier.id)}
                        onCheckedChange={() => toggleMember(carrier.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {carrier.name}
                        </p>
                        {(carrier.city || carrier.country) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {[carrier.city, carrier.country]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMembersDialog(false)
                setSelectedGroup(null)
                fetchGroups() // Refresh counts
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Group
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedGroup?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false)
                setSelectedGroup(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteGroup}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
