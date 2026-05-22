"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowLeft,
  Wrench,
  Calendar,
  Gauge,
  Clock,
  Mail,
  X,
  RefreshCw,
} from "lucide-react";
import type { MaintenanceType, MaintenanceNotificationEmail } from "@/lib/types";

export default function MaintenanceTypesPage() {
  const { session: adminSession } = useAdminSession();
  const [maintenanceTypes, setMaintenanceTypes] = useState<(MaintenanceType & { notification_emails: MaintenanceNotificationEmail[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<MaintenanceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state - matches actual database columns
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    interval_by_date: false,
    interval_by_mileage: false,
    interval_by_engine_hours: false,
    date_interval_months: "",
    date_remind_days: "7",
    mileage_interval_km: "",
    mileage_remind_km: "500",
    engine_hours_interval: "",
    engine_hours_remind: "50",
    auto_repeat: true,
    notification_emails: [] as string[],
  });
  const [newEmail, setNewEmail] = useState("");

  const fetchMaintenanceTypes = async () => {
    if (!adminSession?.id) return;

    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("maintenance_types")
      .select("*, notification_emails:maintenance_notification_emails(*)")
      .eq("admin_id", adminSession.id)
      .order("name");

    if (!error && data) {
      setMaintenanceTypes(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMaintenanceTypes();
  }, [adminSession?.id]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      interval_by_date: false,
      interval_by_mileage: false,
      interval_by_engine_hours: false,
      date_interval_months: "",
      date_remind_days: "7",
      mileage_interval_km: "",
      mileage_remind_km: "500",
      engine_hours_interval: "",
      engine_hours_remind: "50",
      auto_repeat: true,
      notification_emails: [],
    });
    setNewEmail("");
  };

  const handleEdit = (type: any) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || "",
      interval_by_date: type.interval_by_date || false,
      interval_by_mileage: type.interval_by_mileage || false,
      interval_by_engine_hours: type.interval_by_engine_hours || false,
      date_interval_months: type.date_interval_months?.toString() || "",
      date_remind_days: type.date_remind_days?.toString() || "7",
      mileage_interval_km: type.mileage_interval_km?.toString() || "",
      mileage_remind_km: type.mileage_remind_km?.toString() || "500",
      engine_hours_interval: type.engine_hours_interval?.toString() || "",
      engine_hours_remind: type.engine_hours_remind?.toString() || "50",
      auto_repeat: type.auto_repeat,
      notification_emails: type.notification_emails?.map((e: any) => e.email) || [],
    });
    setDialogOpen(true);
  };

  const handleAddEmail = () => {
    if (newEmail && !formData.notification_emails.includes(newEmail)) {
      setFormData({ ...formData, notification_emails: [...formData.notification_emails, newEmail] });
      setNewEmail("");
    }
  };

  const handleRemoveEmail = (email: string) => {
    setFormData({
      ...formData,
      notification_emails: formData.notification_emails.filter((e) => e !== email),
    });
  };

  const handleSave = async () => {
    if (!adminSession?.id || !formData.name) return;

    const supabase = createClient();

    // Use the actual database column names
    const maintenanceTypeData = {
      admin_id: adminSession.id,
      name: formData.name,
      description: formData.description || null,
      interval_by_date: formData.interval_by_date,
      interval_by_mileage: formData.interval_by_mileage,
      interval_by_engine_hours: formData.interval_by_engine_hours,
      date_interval_months: formData.date_interval_months ? parseInt(formData.date_interval_months) : null,
      date_remind_days: formData.date_remind_days ? parseInt(formData.date_remind_days) : null,
      mileage_interval_km: formData.mileage_interval_km ? parseInt(formData.mileage_interval_km) : null,
      mileage_remind_km: formData.mileage_remind_km ? parseInt(formData.mileage_remind_km) : null,
      engine_hours_interval: formData.engine_hours_interval ? parseInt(formData.engine_hours_interval) : null,
      engine_hours_remind: formData.engine_hours_remind ? parseInt(formData.engine_hours_remind) : null,
      auto_repeat: formData.auto_repeat,
    };

    let typeId: string;

    if (editingType) {
      await supabase
        .from("maintenance_types")
        .update(maintenanceTypeData)
        .eq("id", editingType.id);
      typeId = editingType.id;

      // Delete existing emails
      await supabase
        .from("maintenance_notification_emails")
        .delete()
        .eq("maintenance_type_id", editingType.id);
    } else {
      const { data } = await supabase
        .from("maintenance_types")
        .insert(maintenanceTypeData)
        .select()
        .single();
      if (!data) return;
      typeId = data.id;
    }

    // Insert notification emails
    if (formData.notification_emails.length > 0) {
      await supabase.from("maintenance_notification_emails").insert(
        formData.notification_emails.map((email) => ({
          maintenance_type_id: typeId,
          email,
        }))
      );
    }

    setDialogOpen(false);
    setEditingType(null);
    resetForm();
    fetchMaintenanceTypes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this maintenance type?")) return;

    const supabase = createClient();
    await supabase.from("maintenance_types").delete().eq("id", id);
    fetchMaintenanceTypes();
  };

  const toggleActive = async (type: MaintenanceType) => {
    const supabase = createClient();
    await supabase
      .from("maintenance_types")
      .update({ is_active: !type.is_active })
      .eq("id", type.id);
    fetchMaintenanceTypes();
  };

  const filteredTypes = maintenanceTypes.filter((type) =>
    type.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/admin/maintenance" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Maintenance
          </Link>
          <h1 className="text-2xl font-bold">Maintenance Types</h1>
          <p className="text-muted-foreground">Define service intervals and notification settings</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingType(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Maintenance Type
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search maintenance types..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : filteredTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {maintenanceTypes.length === 0
                ? "No maintenance types defined. Add your first one to get started."
                : "No maintenance types match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTypes.map((type) => (
            <Card key={type.id} className={!type.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{type.name}</span>
                        {type.auto_repeat && (
                          <Badge variant="outline" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Auto-repeat
                          </Badge>
                        )}
                        <Badge variant={type.is_active ? "default" : "secondary"}>
                          {type.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {type.description && (
                        <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {type.interval_by_date && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                            <Calendar className="h-3 w-3 mr-1" />
                            Every {type.date_interval_months} month(s)
                          </Badge>
                        )}
                        {type.interval_by_mileage && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                            <Gauge className="h-3 w-3 mr-1" />
                            Every {type.mileage_interval_km?.toLocaleString()} km
                          </Badge>
                        )}
                        {type.interval_by_engine_hours && (
                          <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30">
                            <Clock className="h-3 w-3 mr-1" />
                            Every {type.engine_hours_interval} hours
                          </Badge>
                        )}
                      </div>
                      {type.notification_emails && type.notification_emails.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {type.notification_emails.length} notification email(s)
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={type.is_active}
                      onCheckedChange={() => toggleActive(type)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(type)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => handleDelete(type.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingType(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit" : "Add"} Maintenance Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Oil Change, Brake Pads Replacement"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                />
              </div>
            </div>

            {/* Service Interval Types */}
            <div className="space-y-4">
              <Label>Service Interval Types (select one or more)</Label>
              <div className="grid gap-4">
                {/* By Date */}
                <Card className={formData.interval_by_date ? "ring-2 ring-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={formData.interval_by_date}
                        onCheckedChange={(checked) => setFormData({ ...formData, interval_by_date: !!checked })}
                      />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-400" />
                          <span className="font-medium">By Date</span>
                        </div>
                        {formData.interval_by_date && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm">Execute every (months)</Label>
                              <Input
                                type="number"
                                value={formData.date_interval_months}
                                onChange={(e) => setFormData({ ...formData, date_interval_months: e.target.value })}
                                placeholder="e.g., 12"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Remind before (days)</Label>
                              <Input
                                type="number"
                                value={formData.date_remind_days}
                                onChange={(e) => setFormData({ ...formData, date_remind_days: e.target.value })}
                                placeholder="e.g., 7"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* By Mileage */}
                <Card className={formData.interval_by_mileage ? "ring-2 ring-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={formData.interval_by_mileage}
                        onCheckedChange={(checked) => setFormData({ ...formData, interval_by_mileage: !!checked })}
                      />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-green-400" />
                          <span className="font-medium">By Mileage</span>
                        </div>
                        {formData.interval_by_mileage && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm">Execute every (km)</Label>
                              <Input
                                type="number"
                                value={formData.mileage_interval_km}
                                onChange={(e) => setFormData({ ...formData, mileage_interval_km: e.target.value })}
                                placeholder="e.g., 10000"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Remind before (km)</Label>
                              <Input
                                type="number"
                                value={formData.mileage_remind_km}
                                onChange={(e) => setFormData({ ...formData, mileage_remind_km: e.target.value })}
                                placeholder="e.g., 500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* By Engine Hours */}
                <Card className={formData.interval_by_engine_hours ? "ring-2 ring-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={formData.interval_by_engine_hours}
                        onCheckedChange={(checked) => setFormData({ ...formData, interval_by_engine_hours: !!checked })}
                      />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-400" />
                          <span className="font-medium">By Engine Hours</span>
                        </div>
                        {formData.interval_by_engine_hours && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm">Execute every (hours)</Label>
                              <Input
                                type="number"
                                value={formData.engine_hours_interval}
                                onChange={(e) => setFormData({ ...formData, engine_hours_interval: e.target.value })}
                                placeholder="e.g., 250"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Remind before (hours)</Label>
                              <Input
                                type="number"
                                value={formData.engine_hours_remind}
                                onChange={(e) => setFormData({ ...formData, engine_hours_remind: e.target.value })}
                                placeholder="e.g., 50"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Auto Repeat */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-repeat when completed</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically create a new scheduled maintenance when completed
                </p>
              </div>
              <Switch
                checked={formData.auto_repeat}
                onCheckedChange={(checked) => setFormData({ ...formData, auto_repeat: checked })}
              />
            </div>

            {/* Notification Emails */}
            <div className="space-y-4">
              <Label>Notification Emails</Label>
              <p className="text-sm text-muted-foreground">
                Add email addresses to receive notifications when maintenance is due
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddEmail())}
                />
                <Button type="button" variant="outline" onClick={handleAddEmail} className="bg-transparent">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.notification_emails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.notification_emails.map((email) => (
                    <Badge key={email} variant="secondary" className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || (!formData.interval_by_date && !formData.interval_by_mileage && !formData.interval_by_engine_hours)}>
              {editingType ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
