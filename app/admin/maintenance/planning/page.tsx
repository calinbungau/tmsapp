"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Car,
  Container,
  Clock,
  Wrench,
  User,
  Calendar as CalendarIcon,
  ArrowLeft,
  MapPin,
  Trash2,
} from "lucide-react";
import Link from "next/link";

interface MaintenanceEvent {
  id: string;
  vehicle_id: string | null;
  trailer_id: string | null;
  maintenance_type_id: string | null;
  status: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  assigned_driver_id: string | null;
  appointment_location: string | null;
  notes: string | null;
  request_description: string | null;
  vehicle?: {
    plate_number: string;
    model: string | null;
  } | null;
  trailer?: {
    plate_number: string;
    trailer_type: string | null;
  } | null;
  maintenance_type?: {
    name: string;
  } | null;
  driver?: {
    name: string;
  } | null;
}

interface Vehicle {
  id: string;
  plate_number: string;
  model: string | null;
}

interface Driver {
  id: string;
  name: string;
}

interface MaintenanceType {
  id: string;
  name: string;
}

export default function MaintenancePlanningPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MaintenanceEvent | null>(null);
  const [formData, setFormData] = useState({
    maintenance_record_id: "",
    assigned_driver_id: "",
    scheduled_start_time: "",
    scheduled_end_time: "",
    appointment_location: "",
    notes: "",
  });
  const [unscheduledRecords, setUnscheduledRecords] = useState<MaintenanceEvent[]>([]);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  const fetchData = async () => {
    const adminSession = localStorage.getItem("admin_session");
    if (!adminSession) return;
    const admin = JSON.parse(adminSession);

    const supabase = createClient();

    // Get week start and end
    const weekStart = getWeekStart(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Fetch maintenance events with scheduled times (both vehicles and trailers)
    const { data: eventsData, error: eventsError } = await supabase
      .from("maintenance_records")
      .select(`
        id,
        vehicle_id,
        trailer_id,
        maintenance_type_id,
        status,
        scheduled_start_time,
        scheduled_end_time,
        assigned_driver_id,
        appointment_location,
        notes,
        request_description,
        vehicle:vehicles(plate_number, model),
        trailer:trailers(plate_number, trailer_type),
        maintenance_type:maintenance_types(name)
      `)
      .eq("admin_id", admin.id)
      .not("scheduled_start_time", "is", null)
      .gte("scheduled_start_time", weekStart.toISOString())
      .lt("scheduled_start_time", weekEnd.toISOString())
      .order("scheduled_start_time");
    
    

    // Fetch unscheduled maintenance records (needs planning) - both vehicles and trailers
    const { data: unscheduledData } = await supabase
      .from("maintenance_records")
      .select(`
        id,
        vehicle_id,
        trailer_id,
        maintenance_type_id,
        status,
        scheduled_start_time,
        scheduled_end_time,
        assigned_driver_id,
        notes,
        request_description,
        vehicle:vehicles(plate_number, model),
        trailer:trailers(plate_number, trailer_type),
        maintenance_type:maintenance_types(name)
      `)
      .eq("admin_id", admin.id)
      .is("scheduled_start_time", null)
      .neq("status", "completed")
      .order("created_at", { ascending: false });

    setUnscheduledRecords((unscheduledData as any) || []);

    // Fetch vehicles
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("id, plate_number, model")
      .eq("admin_id", admin.id)
      .order("plate_number");

    // Fetch drivers
    const { data: driversData } = await supabase
      .from("drivers")
      .select("id, name")
      .eq("admin_id", admin.id)
      .order("name");

    // Fetch maintenance types
    const { data: typesData } = await supabase
      .from("maintenance_types")
      .select("id, name")
      .eq("admin_id", admin.id)
      .order("name");

    
    setEvents((eventsData as any) || []);
    setVehicles(vehiclesData || []);
    setDrivers(driversData || []);
    setMaintenanceTypes(typesData || []);
    setLoading(false);
  };

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(d.setDate(diff));
  };

  const getWeekDays = () => {
    const weekStart = getWeekStart(currentDate);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const navigateWeek = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction * 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const getEventsForDay = (date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return events.filter((event) => {
      if (!event.scheduled_start_time) return false;
      const eventDate = new Date(event.scheduled_start_time);
      return eventDate >= dayStart && eventDate <= dayEnd;
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const openScheduleDialog = (date: Date, event?: MaintenanceEvent) => {
    setSelectedDate(date);
    if (event) {
      // Editing existing appointment
      setSelectedEvent(event);
      setFormData({
        maintenance_record_id: event.id,
        assigned_driver_id: event.assigned_driver_id || "",
        scheduled_start_time: event.scheduled_start_time ? new Date(event.scheduled_start_time).toISOString().slice(0, 16) : "",
        scheduled_end_time: event.scheduled_end_time ? new Date(event.scheduled_end_time).toISOString().slice(0, 16) : "",
        appointment_location: event.appointment_location || "",
        notes: event.notes || "",
      });
    } else {
      // Adding new appointment - must select from existing maintenance records
      setSelectedEvent(null);
      const defaultStart = new Date(date);
      defaultStart.setHours(9, 0, 0, 0);
      const defaultEnd = new Date(date);
      defaultEnd.setHours(10, 0, 0, 0);
      setFormData({
        maintenance_record_id: "",
        assigned_driver_id: "",
        scheduled_start_time: defaultStart.toISOString().slice(0, 16),
        scheduled_end_time: defaultEnd.toISOString().slice(0, 16),
        appointment_location: "",
        notes: "",
      });
    }
    setScheduleDialogOpen(true);
  };

  const handleScheduleSubmit = async () => {
    const supabase = createClient();

    // Both add and edit update an existing maintenance record
    const recordId = selectedEvent ? selectedEvent.id : formData.maintenance_record_id;
    if (!recordId) return;

    const driverId = formData.assigned_driver_id && formData.assigned_driver_id !== "none" ? formData.assigned_driver_id : null;

    await supabase
      .from("maintenance_records")
      .update({
        assigned_driver_id: driverId,
        scheduled_start_time: formData.scheduled_start_time,
        scheduled_end_time: formData.scheduled_end_time || null,
        appointment_location: formData.appointment_location || null,
        notes: formData.notes || null,
      })
      .eq("id", recordId);

    // Create notification for assigned driver
    if (driverId && formData.scheduled_start_time) {
      await createDriverNotification(recordId, driverId, formData.scheduled_start_time, formData.appointment_location || undefined);
    }

    setScheduleDialogOpen(false);
    fetchData();
  };

  const handleRemoveAppointment = async () => {
    if (!selectedEvent) return;
    if (!confirm("Are you sure you want to remove this appointment? The maintenance record will still exist but won't be scheduled.")) return;

    const supabase = createClient();

    await supabase
      .from("maintenance_records")
      .update({
        scheduled_start_time: null,
        scheduled_end_time: null,
        assigned_driver_id: null,
        appointment_location: null,
      })
      .eq("id", selectedEvent.id);

    // Remove any pending notifications
    await supabase
      .from("notifications")
      .delete()
      .eq("related_id", selectedEvent.id)
      .eq("related_type", "maintenance_appointment");

    setScheduleDialogOpen(false);
    fetchData();
  };

  const createDriverNotification = async (recordId: string, driverId: string, startTime: string, location?: string) => {
    const adminSession = localStorage.getItem("admin_session");
    if (!adminSession) return;
    const admin = JSON.parse(adminSession);
    
    const notificationBody = location 
      ? `You have been assigned to bring a vehicle for maintenance on ${new Date(startTime).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${new Date(startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}. Location: ${location}`
      : `You have been assigned to bring a vehicle for maintenance on ${new Date(startTime).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${new Date(startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

    // Send push notification and create in-app notification via API
    try {
      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: admin.id,
          driver_id: driverId,
          title: "You are planned for Maintenance",
          body: notificationBody,
          data: { type: "maintenance_appointment", recordId, scheduled_for: startTime },
        }),
      });
    } catch (e) {
      console.error("Failed to send notification:", e);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "request":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "diagnose":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "scheduled":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "due":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const weekDays = getWeekDays();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/maintenance">
            <Button variant="outline" size="icon" className="bg-transparent">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Maintenance Planning</h1>
            <p className="text-muted-foreground">Schedule and manage vehicle maintenance appointments</p>
          </div>
        </div>
      </div>

      {/* Calendar Navigation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{formatMonthYear(currentDate)}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday} className="bg-transparent">
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)} className="bg-transparent">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigateWeek(1)} className="bg-transparent">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Week Grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dayEvents = getEventsForDay(day);
              const today = isToday(day);

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[200px] border rounded-lg p-2 ${
                    today ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-sm font-medium ${
                        today ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {formatDate(day)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => openScheduleDialog(day)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className={`p-2 rounded text-xs cursor-pointer border ${getStatusColor(event.status)}`}
                        onClick={() => openScheduleDialog(day, event)}
                      >
                        <div className="flex items-center gap-1 font-medium">
                          <Clock className="h-3 w-3" />
                          {event.scheduled_start_time && formatTime(event.scheduled_start_time)}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {event.trailer_id ? <Container className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                          {event.vehicle?.plate_number || event.trailer?.plate_number}
                        </div>
                        {event.maintenance_type && (
                          <div className="flex items-center gap-1 mt-0.5 opacity-80">
                            <Wrench className="h-3 w-3" />
                            {event.maintenance_type.name}
                          </div>
                        )}
                        {event.driver && (
                          <div className="flex items-center gap-1 mt-0.5 opacity-80">
                            <User className="h-3 w-3" />
                            {event.driver.name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Unscheduled Maintenance */}
      <UnscheduledMaintenance
        onSchedule={(event) => openScheduleDialog(new Date(), event)}
      />

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedEvent ? "Edit Appointment" : "Schedule Maintenance"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Show maintenance record selector when adding new appointment */}
            {!selectedEvent && (
              <div className="space-y-2">
                <Label>Select Maintenance Record *</Label>
                {unscheduledRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    No maintenance records available for scheduling. Create maintenance records first.
                  </p>
                ) : (
                  <Select
                    value={formData.maintenance_record_id}
                    onValueChange={(v) => setFormData({ ...formData, maintenance_record_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select maintenance record" />
                    </SelectTrigger>
                    <SelectContent>
                      {unscheduledRecords.map((record) => (
                        <SelectItem key={record.id} value={record.id}>
                          {record.vehicle?.plate_number || record.trailer?.plate_number} - {record.maintenance_type?.name || "Unknown"} ({record.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Show maintenance info when editing */}
            {selectedEvent && (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-sm">
                  {selectedEvent.trailer_id ? <Container className="h-4 w-4 text-muted-foreground" /> : <Car className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium">{selectedEvent.vehicle?.plate_number || selectedEvent.trailer?.plate_number}</span>
                  {(selectedEvent.vehicle?.model || selectedEvent.trailer?.trailer_type) && (
                    <span className="text-muted-foreground">- {selectedEvent.vehicle?.model || selectedEvent.trailer?.trailer_type}</span>
                  )}
                </div>
                {selectedEvent.maintenance_type && (
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvent.maintenance_type.name}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Assign Driver (optional)</Label>
              <Select
                value={formData.assigned_driver_id}
                onValueChange={(v) => setFormData({ ...formData, assigned_driver_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No driver assigned</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input
                  type="datetime-local"
                  value={formData.scheduled_start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_start_time: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.scheduled_end_time}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduled_end_time: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Input
                value={formData.appointment_location}
                onChange={(e) => setFormData({ ...formData, appointment_location: e.target.value })}
                placeholder="e.g., Main Workshop, 123 Service Road"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedEvent && (
              <Button
                variant="destructive"
                onClick={handleRemoveAppointment}
                className="sm:mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove Appointment
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
              className="bg-transparent"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleScheduleSubmit} 
              disabled={!selectedEvent && !formData.maintenance_record_id}
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {selectedEvent ? "Update Appointment" : "Schedule Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component to show unscheduled maintenance that needs planning
function UnscheduledMaintenance({
  onSchedule,
}: {
  onSchedule: (event: MaintenanceEvent) => void;
}) {
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);

  useEffect(() => {
    fetchUnscheduled();
  }, []);

  const fetchUnscheduled = async () => {
    const adminSession = localStorage.getItem("admin_session");
    if (!adminSession) return;
    const admin = JSON.parse(adminSession);

    const supabase = createClient();
    const { data } = await supabase
      .from("maintenance_records")
      .select(`
        id,
        vehicle_id,
        trailer_id,
        maintenance_type_id,
        status,
        scheduled_start_time,
        scheduled_end_time,
        assigned_driver_id,
        notes,
        request_description,
        vehicle:vehicles(plate_number, model),
        trailer:trailers(plate_number, trailer_type),
        maintenance_type:maintenance_types(name)
      `)
      .eq("admin_id", admin.id)
      .is("scheduled_start_time", null)
      .in("status", ["request", "diagnose", "due"])
      .order("created_at", { ascending: false })
      .limit(10);

    setEvents((data as any) || []);
  };

  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Needs Scheduling ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => onSchedule(event)}
            >
              <div className="flex items-center gap-2">
                {event.trailer_id ? <Container className="h-4 w-4 text-muted-foreground" /> : <Car className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium">{event.vehicle?.plate_number || event.trailer?.plate_number}</span>
                <Badge
                  variant="outline"
                  className={
                    event.status === "request"
                      ? "bg-orange-500/20 text-orange-400"
                      : event.status === "diagnose"
                      ? "bg-purple-500/20 text-purple-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }
                >
                  {event.status}
                </Badge>
              </div>
              {event.maintenance_type && (
                <p className="text-sm text-muted-foreground mt-1">
                  {event.maintenance_type.name}
                </p>
              )}
              {event.request_description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {event.request_description}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
