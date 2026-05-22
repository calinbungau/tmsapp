"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Car,
  Wrench,
  Calendar,
  Clock,
  User,
  MapPin,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  FileText,
  ImageIcon,
  Plus,
  History,
  ExternalLink,
} from "lucide-react";

interface MaintenanceRecord {
  id: string;
  maintenance_number: number | null;
  vehicle_id: string;
  maintenance_type_id: string | null;
  status: string;
  request_description: string | null;
  request_photos: string[] | null;
  notes: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  assigned_driver_id: string | null;
  appointment_location: string | null;
  completed_date: string | null;
  completion_photos: string[] | null;
  created_at: string;
  vehicle?: {
    plate_number: string;
    model: string | null;
    make: string | null;
  };
  maintenance_type?: {
    name: string;
  } | null;
  reported_by_driver?: {
    id: string;
    name: string;
  } | null;
  assigned_driver?: {
    id: string;
    name: string;
  } | null;
}

interface MaintenanceCost {
  id: string;
  description: string;
  amount: number;
  cost_type: string;
  invoice_url: string | null;
  photos: string[] | null;
  created_at: string;
}

interface ActivityLog {
  id: string;
  action: string;
  details: any;
  created_at: string;
  performed_by_type: string;
  admin?: { name: string } | null;
  driver?: { name: string } | null;
}

export default function MaintenanceDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const [record, setRecord] = useState<MaintenanceRecord | null>(null);
  const [costs, setCosts] = useState<MaintenanceCost[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCostOpen, setAddCostOpen] = useState(false);
  const [costForm, setCostForm] = useState({
    description: "",
    amount: "",
    cost_type: "labor",
    invoice_url: "",
  });
  const [adminSession, setAdminSession] = useState<any>(null);

  useEffect(() => {
    const session = localStorage.getItem("admin_session");
    if (!session) {
      router.push("/admin/login");
      return;
    }
    setAdminSession(JSON.parse(session));
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    const supabase = createClient();
    const id = params.id as string;

    // Fetch maintenance record
    const { data: recordData } = await supabase
      .from("maintenance_records")
      .select(`
        *,
        vehicle:vehicles(plate_number, model, make),
        maintenance_type:maintenance_types(name),
        reported_by_driver:drivers!requested_by_driver_id(id, name),
        assigned_driver:drivers!assigned_driver_id(id, name)
      `)
      .eq("id", id)
      .single();

    if (recordData) {
      setRecord(recordData as MaintenanceRecord);
    }

    // Fetch costs
    const { data: costsData } = await supabase
      .from("maintenance_costs")
      .select("*")
      .eq("maintenance_record_id", id)
      .order("created_at", { ascending: false });

    setCosts((costsData as MaintenanceCost[]) || []);

    // Fetch activity log
    const { data: logData } = await supabase
      .from("maintenance_activity_log")
      .select(`
        *,
        admin:admins(name),
        driver:drivers(name)
      `)
      .eq("maintenance_record_id", id)
      .order("created_at", { ascending: false });

    setActivityLog((logData as ActivityLog[]) || []);
    setLoading(false);
  };

  const handleAddCost = async () => {
    if (!record || !adminSession) return;
    const supabase = createClient();

    const { error } = await supabase.from("maintenance_costs").insert({
      maintenance_record_id: record.id,
      description: costForm.description,
      amount: parseFloat(costForm.amount),
      cost_type: costForm.cost_type,
      invoice_url: costForm.invoice_url || null,
    });

    if (!error) {
      // Log the activity
      await supabase.from("maintenance_activity_log").insert({
        maintenance_record_id: record.id,
        action: "cost_added",
        details: {
          description: costForm.description,
          amount: parseFloat(costForm.amount),
          cost_type: costForm.cost_type,
        },
        performed_by_type: "admin",
        performed_by_admin_id: adminSession.id,
      });

      setAddCostOpen(false);
      setCostForm({ description: "", amount: "", cost_type: "labor", invoice_url: "" });
      fetchData();
    }
  };

  const handleMarkComplete = async () => {
    if (!record || !adminSession) return;
    const supabase = createClient();

    const completedDate = new Date().toISOString();
    await supabase
      .from("maintenance_records")
      .update({
        status: "completed",
        completed_date: completedDate,
      })
      .eq("id", record.id);

    // Log the activity
    await supabase.from("maintenance_activity_log").insert({
      maintenance_record_id: record.id,
      action: "status_changed",
      details: {
        from: record.status,
        to: "completed",
      },
      performed_by_type: "admin",
      performed_by_admin_id: adminSession.id,
    });

    fetchData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "reported": return "bg-orange-500/20 text-orange-400";
      case "diagnose": return "bg-purple-500/20 text-purple-400";
      case "scheduled": return "bg-blue-500/20 text-blue-400";
      case "in_progress": return "bg-cyan-500/20 text-cyan-400";
      case "due": return "bg-yellow-500/20 text-yellow-400";
      case "completed": return "bg-green-500/20 text-green-400";
      case "expired": return "bg-red-500/20 text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "reported": return "Driver Reported";
      case "diagnose": return "Diagnosis";
      case "scheduled": return "Scheduled";
      case "in_progress": return "In Progress";
      case "due": return "Due";
      case "completed": return "Completed";
      case "expired": return "Expired";
      default: return status;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const totalCost = costs.reduce((sum, c) => sum + (c.cost || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-muted-foreground">Maintenance record not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
<div>
  <h1 className="text-xl font-semibold">
    Maintenance #{record.maintenance_number || "—"}
  </h1>
  <p className="text-sm text-muted-foreground">
  {record.vehicle?.plate_number} - {record.maintenance_type?.name || "Reported Issue"}
  </p>
  </div>
          </div>
          <Badge className={getStatusColor(record.status)}>
            {getStatusLabel(record.status)}
          </Badge>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Vehicle & Basic Info */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicle Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plate Number</span>
                <span className="font-medium">{record.vehicle?.plate_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle</span>
                <span className="font-medium">
                  {record.vehicle?.make} {record.vehicle?.model}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Maintenance Type</span>
                <span className="font-medium">{record.maintenance_type?.name || "Not assigned"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Schedule & Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {record.scheduled_start_time && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Appointment</span>
                  <span className="font-medium">
                    {new Date(record.scheduled_start_time).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              {record.appointment_location && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{record.appointment_location}</span>
                </div>
              )}
              {record.assigned_driver && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned Driver</span>
                  <span className="font-medium">{record.assigned_driver.name}</span>
                </div>
              )}
              {record.completed_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-medium text-green-400">
                    {new Date(record.completed_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Driver Reported Issue */}
        {record.request_description && (
          <Card className="border-orange-500/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                Driver Reported Issue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Reported by {record.reported_by_driver?.name || "Driver"}</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{new Date(record.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm">{record.request_description}</p>
              
              {/* Driver Photos */}
              {record.request_photos && record.request_photos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Photos Attached ({record.request_photos.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {record.request_photos.map((photo, i) => (
                      <a
                        key={i}
                        href={photo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg overflow-hidden bg-muted relative group"
                      >
                        <img
                          src={photo || "/placeholder.svg"}
                          alt={`Issue photo ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ExternalLink className="h-6 w-6 text-white" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Completion Photos (Mechanic) */}
        {record.completion_photos && record.completion_photos.length > 0 && (
          <Card className="border-green-500/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-green-400">
                <CheckCircle className="h-4 w-4" />
                Completion Photos (Mechanic Work)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {record.completion_photos.map((photo, i) => (
                  <a
                    key={i}
                    href={photo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-lg overflow-hidden bg-muted relative group"
                  >
                    <img
                      src={photo || "/placeholder.svg"}
                      alt={`Completion photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ExternalLink className="h-6 w-6 text-white" />
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {record.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{record.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Costs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Costs & Expenses
              </CardTitle>
              <Button size="sm" onClick={() => setAddCostOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Cost
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {costs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No costs recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {costs.map((cost) => (
                  <div
                    key={cost.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{cost.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {cost.cost_type}
                        </Badge>
                        <span>{new Date(cost.created_at).toLocaleDateString()}</span>
                        {cost.invoice_url && (
                          <a
                            href={cost.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            View Invoice
                          </a>
                        )}
                      </div>
                    </div>
                    <span className="font-semibold">
                      {cost.cost_currency === "EUR" ? "€" : cost.cost_currency === "RON" ? "RON " : cost.cost_currency === "GBP" ? "£" : "$"}
                      {cost.cost?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                ))}
<div className="flex items-center justify-between pt-3 border-t border-border">
  <span className="font-medium">Total</span>
  <span className="text-lg font-bold text-primary">
  €{totalCost.toFixed(2)}
  </span>
  </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No activity recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {activityLog.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">
                          {log.action === "status_changed" && `Status changed from "${log.details?.from}" to "${log.details?.to}"`}
                          {log.action === "cost_added" && `Cost added: ${log.details?.description} (${formatCurrency(log.details?.amount || 0)})`}
                          {log.action === "created" && "Maintenance record created"}
                          {log.action === "driver_assigned" && `Driver assigned: ${log.details?.driver_name}`}
                          {log.action === "appointment_scheduled" && "Appointment scheduled"}
                          {!["status_changed", "cost_added", "created", "driver_assigned", "appointment_scheduled"].includes(log.action) && log.action}
                        </span>
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>
                          {log.performed_by_type === "admin" && log.admin?.name}
                          {log.performed_by_type === "driver" && log.driver?.name}
                          {log.performed_by_type === "system" && "System"}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(log.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {record.status !== "completed" && (
          <div className="flex gap-3">
            <Button
              onClick={handleMarkComplete}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark as Completed
            </Button>
          </div>
        )}
      </main>

      {/* Add Cost Dialog */}
      <Dialog open={addCostOpen} onOpenChange={setAddCostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cost</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={costForm.description}
                onChange={(e) => setCostForm({ ...costForm, description: e.target.value })}
                placeholder="e.g., Oil change, Brake pads"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={costForm.amount}
                  onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={costForm.cost_type}
                  onValueChange={(v) => setCostForm({ ...costForm, cost_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="labor">Labor</SelectItem>
                    <SelectItem value="parts">Parts</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Invoice URL (optional)</Label>
              <Input
                value={costForm.invoice_url}
                onChange={(e) => setCostForm({ ...costForm, invoice_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCostOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCost} disabled={!costForm.description || !costForm.amount}>
              Add Cost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
