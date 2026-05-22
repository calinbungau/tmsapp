"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FolderKanban, Plus, Pencil, Trash2, Loader2, Save, X, Palette,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

interface TraccarGroup {
  id: number;
  name: string;
  attributes: { iconColor?: string; [key: string]: unknown };
  groupId: number;
}

export default function TelematicGroupsPage() {
  const router = useRouter();
  const [adminSession, setAdminSession] = useState<{ id: string } | null>(null);
  const [groups, setGroups] = useState<TraccarGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#22c55e");
  const [newMode, setNewMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#22c55e");

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchGroups = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/traccar/groups?adminId=${adminSession.id}`);
      const data = await res.json();
      if (data.groups) setGroups(data.groups);
    } catch { /* silent */ }
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleSave = async (group: TraccarGroup) => {
    if (!adminSession?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/traccar/groups?adminId=${adminSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...group,
          name: editName,
          attributes: { ...group.attributes, iconColor: editColor },
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchGroups();
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!adminSession?.id || !newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/traccar/groups?adminId=${adminSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          groupId: 0,
          attributes: { iconColor: newColor },
        }),
      });
      if (res.ok) {
        setNewMode(false);
        setNewName("");
        setNewColor("#22c55e");
        fetchGroups();
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async (groupId: number) => {
    if (!adminSession?.id) return;
    if (!confirm("Are you sure you want to delete this group?")) return;
    try {
      await fetch(`/api/traccar/groups?adminId=${adminSession.id}&groupId=${groupId}`, {
        method: "DELETE",
      });
      fetchGroups();
    } catch { /* silent */ }
  };

  const startEdit = (group: TraccarGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditColor(group.attributes?.iconColor || "#22c55e");
  };

  const PRESET_COLORS = [
    "#e22400", "#f59e0b", "#22c55e", "#3b82f6", "#7a219e",
    "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
    "#ef4444", "#84cc16",
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Device Groups</h1>
            <p className="text-sm text-muted-foreground">
              Manage Traccar device groups and their colors
            </p>
          </div>
        </div>
        {!newMode && (
          <Button onClick={() => setNewMode(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Group
          </Button>
        )}
      </div>

      {/* New group form */}
      {newMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create New Group</CardTitle>
            <CardDescription>Add a new device group with a custom color</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Group Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Trucks, Vans, Equipment"
                className="max-w-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Icon Color
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-7 h-7 rounded-md border-2 transition-all ${
                      newColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleCreate} size="sm" disabled={saving || !newName.trim()} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setNewMode(false); setNewName(""); }} className="gap-1.5">
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No groups configured yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a group to organize your devices</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const isEditing = editingId === group.id;
            return (
              <Card key={group.id} className={isEditing ? "ring-1 ring-primary/30" : ""}>
                <CardContent className="py-3 px-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-sm"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-6 h-6 rounded border-2 transition-all ${
                              editColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleSave(group)} disabled={saving} className="gap-1.5">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-5 h-5 rounded-md flex-shrink-0"
                          style={{ backgroundColor: group.attributes?.iconColor || "#3b82f6" }}
                        />
                        <div>
                          <p className="text-sm font-medium">{group.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            ID: {group.id} {group.groupId > 0 ? `| Parent: ${group.groupId}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(group)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(group.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
