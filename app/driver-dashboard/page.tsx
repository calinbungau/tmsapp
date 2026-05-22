"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, ChevronRight, ClipboardList, RefreshCw, Wrench, Calendar, MapPin, Bell, Navigation, Car } from "lucide-react";
import type { FormTemplate } from "@/lib/types";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface FormWithStatus extends FormTemplate {
  isCompleted: boolean;
  submissionId?: string;
  vehiclePlate?: string;
  completedAt?: string;
}

interface MaintenanceTask {
  id: string;
  status: string;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  appointment_location: string | null;
  notes: string | null;
  vehicle?: {
    plate_number: string;
    model: string | null;
  };
  maintenance_type?: {
    name: string;
  } | null;
}

interface DriverNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function DriverTasksPage() {
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [forms, setForms] = useState<FormWithStatus[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      router.replace("/driver-dashboard");
      setTimeout(() => setShowSuccess(false), 3000);
    }
  }, [searchParams, router]);

  useEffect(() => {
    const session = localStorage.getItem("driver_session");
    if (!session) {
      router.push("/driver");
      return;
    }
    const driverData = JSON.parse(session);
    setDriver(driverData);
    fetchFormsWithStatus(driverData);
    fetchMaintenanceTasks(driverData);
    fetchNotifications(driverData);

    // Set up real-time subscription for maintenance appointments and notifications
    const supabase = createClient();
    
    // Subscribe to maintenance_records changes - just refetch when anything changes
    // This is simpler and more reliable than trying to filter
    const maintenanceChannel = supabase
      .channel('driver-maintenance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'maintenance_records',
        },
        () => {
          // Just refetch - the query will filter to only this driver's tasks
          fetchMaintenanceTasks(driverData);
        }
      )
      .subscribe();

    // Subscribe to notifications for this driver
    const notificationsChannel = supabase
      .channel('driver-notifications-dash')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_notifications',
          filter: `driver_id=eq.${driverData.id}`,
        },
        () => {
          fetchNotifications(driverData);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(maintenanceChannel);
      supabase.removeChannel(notificationsChannel);
    };
  }, [router]);

  const fetchNotifications = async (driverData: DriverSession) => {
    const supabase = createClient();
    
    const { data } = await supabase
      .from("driver_notifications")
      .select("id, type, title, message, read, created_at")
      .eq("driver_id", driverData.id)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(5);

    const mapped = (data || []).map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      is_read: n.read,
      created_at: n.created_at,
    }));
    setNotifications(mapped as DriverNotification[]);
  };

  const markNotificationRead = async (id: string) => {
    const supabase = createClient();
    await supabase
      .from("driver_notifications")
      .update({ read: true })
      .eq("id", id);
    
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const fetchMaintenanceTasks = async (driverData: DriverSession) => {
    const supabase = createClient();
    
    // Get ALL maintenance tasks assigned to this driver with a scheduled time
    // Don't filter by date too strictly - show all upcoming
    const { data, error } = await supabase
      .from("maintenance_records")
      .select(`
        id,
        status,
        scheduled_start_time,
        scheduled_end_time,
        appointment_location,
        notes,
        vehicle:vehicles(plate_number, model),
        maintenance_type:maintenance_types(name)
      `)
      .eq("assigned_driver_id", driverData.id)
      .not("scheduled_start_time", "is", null)
      .neq("status", "completed")
      .order("scheduled_start_time");

    
    setMaintenanceTasks((data as MaintenanceTask[]) || []);
  };

  const fetchFormsWithStatus = async (driverData: DriverSession) => {
    const supabase = createClient();
    
    // Fetch daily forms for this admin (tasks = daily required forms)
    const { data: formsData, error: formsError } = await supabase
      .from("form_templates")
      .select("*, questions:form_questions(*)")
      .eq("admin_id", driverData.admin_id)
      .eq("is_active", true)
      .eq("frequency", "daily")
      .order("name");

    if (formsError || !formsData) {
      setLoading(false);
      return;
    }

    // Fetch today's submissions for this driver
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: submissions } = await supabase
      .from("form_submissions")
      .select("id, form_template_id, status, created_at, vehicle_id, vehicles:vehicle_id(plate_number)")
      .eq("driver_id", driverData.id)
      .eq("status", "completed")
      .gte("created_at", today.toISOString());

    // Map forms with completion status
    const formsWithStatus: FormWithStatus[] = formsData.map((form) => {
      const todaySubmission = submissions?.find((s) => s.form_template_id === form.id);
      
      return {
        ...form,
        isCompleted: !!todaySubmission,
        submissionId: todaySubmission?.id,
        vehiclePlate: (todaySubmission?.vehicles as { plate_number?: string })?.plate_number,
        completedAt: todaySubmission?.created_at,
      };
    });

    setForms(formsWithStatus);
    setLoading(false);
  };

  const handleSelectForm = (form: FormWithStatus, isRedo: boolean = false) => {
    localStorage.setItem("selected_form", JSON.stringify({
      id: form.id,
      name: form.name,
      frequency: form.frequency,
      isRedo,
    }));
    router.push("/select-vehicle");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const pendingForms = forms.filter((f) => !f.isCompleted);
  const completedForms = forms.filter((f) => f.isCompleted);

  return (
    <div className="p-4 space-y-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-400" />
          <p className="text-green-400 font-medium">Form submitted successfully!</p>
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-3"
            >
              <Bell className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-orange-400">{notification.title}</p>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => markNotificationRead(notification.id)}
              >
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Status Summary */}
      <div className="flex items-center gap-4">
        <div className="flex-1 p-4 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-2xl font-bold text-primary">{pendingForms.length}</p>
          <p className="text-sm text-muted-foreground">Pending</p>
        </div>
        <div className="flex-1 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-2xl font-bold text-green-400">{completedForms.length}</p>
          <p className="text-sm text-muted-foreground">Completed</p>
        </div>
      </div>

      {/* Scheduled Maintenance */}
      {maintenanceTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Scheduled Maintenance
          </h2>
          <div className="space-y-2">
            {maintenanceTasks.map((task) => {
              const startTime = new Date(task.scheduled_start_time);
              const isToday = startTime.toDateString() === new Date().toDateString();
              
              return (
                <Card key={task.id} className="border-purple-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                        <Wrench className="h-5 w-5 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {task.maintenance_type?.name || "Maintenance"}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Car className="h-3 w-3" />
                          <span>{task.vehicle?.plate_number}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {isToday ? "Today" : startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            {" at "}
                            {startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {task.appointment_location && (
                          <div className="flex items-center gap-2 text-sm mt-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">{task.appointment_location}</span>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(task.appointment_location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline ml-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Navigation className="h-3 w-3" />
                              <span>Directions</span>
                            </a>
                          </div>
                        )}
                      </div>
                      <Badge className={isToday ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}>
                        {isToday ? "Today" : "Upcoming"}
                      </Badge>
                    </div>
                    {task.notes && (
                      <p className="text-sm text-muted-foreground mt-2 ml-13">
                        {task.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Tasks */}
      {pendingForms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Today's Tasks
          </h2>
          <div className="space-y-2">
            {pendingForms.map((form) => (
              <Card 
                key={form.id}
                className="cursor-pointer transition-all hover:ring-2 hover:ring-primary"
                onClick={() => handleSelectForm(form)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                      <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{form.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {form.questions?.length || 0} questions
                      </p>
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-400">
                      Pending
                    </Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed Tasks */}
      {completedForms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Completed Today
          </h2>
          <div className="space-y-2">
            {completedForms.map((form) => (
              <Card key={form.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{form.name}</p>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-400" />
                        <span>Completed</span>
                        {form.vehiclePlate && (
                          <>
                            <span>-</span>
                            <Car className="h-3 w-3" />
                            <span>{form.vehiclePlate}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectForm(form, true);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Redo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {forms.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-3" />
            <p className="font-medium">No tasks for today</p>
            <p className="text-sm text-muted-foreground">Check the Forms tab for additional forms</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
