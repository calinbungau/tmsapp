"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  Clock,
  MapPin,
  Navigation,
  AlertCircle,
  PlayCircle,
  XCircle,
  Truck,
  Phone,
  Camera,
  PenTool,
  Star,
  ArrowLeft,
  Map,
  List,
  ThumbsDown,
  SkipForward,
  MapPinOff,
  Crosshair,
  FileText,
  MessageSquare,
} from "lucide-react";
import dynamic from "next/dynamic";
import { TaskChat } from "@/components/chat/task-chat";

const RouteMap = dynamic(
  () => import("@/components/driver/route-map").then((m) => m.RouteMap),
  { ssr: false, loading: () => <div className="h-[250px] bg-muted animate-pulse rounded-lg" /> }
);

import { SignaturePad } from "@/components/driver/signature-pad";
import { PhotoCapture } from "@/components/driver/photo-capture";

interface DriverSession {
  id: string;
  name: string;
  pin_code: string;
  admin_id: string;
}

interface Task {
  id: string;
  reference_number: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  confirmed_at: string | null;
  notes: string | null;
  task_type: { name: string; color: string } | null;
  vehicle: { plate_number: string } | null;
  customer: { name: string } | null;
  stops: TaskStop[];
  task_form: { id: string; name: string } | null;
}

interface TaskStop {
  id: string;
  sequence_order: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geofence_id: string | null;
  geofence_radius: number | null;
  auto_checkin: boolean;
  auto_checkout: boolean;
  status: string;
  planned_arrival: string | null;
  planned_departure: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  time_window_start: string | null;
  time_window_end: string | null;
  estimated_duration_minutes: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  stop_form_id: string | null;
}

interface FormField {
  id: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  is_visible_to_driver: boolean;
  is_editable_by_driver: boolean;
  options: any;
  default_value: string | null;
  sort_order: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  dispatched: { label: "New", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
  confirmed: { label: "Confirmed", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
  in_progress: { label: "In Progress", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const STOP_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground" },
  en_route: { label: "En Route", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  arrived: { label: "Arrived", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  in_progress: { label: "Working", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  completed: { label: "Done", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  skipped: { label: "Skipped", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const PRIORITY_ICON: Record<string, string> = {
  urgent: "text-red-600",
  high: "text-orange-500",
  normal: "",
  low: "text-muted-foreground",
};

// Calculate distance between two lat/lng points in meters (Haversine formula)
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverTasksPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [driverSession, setDriverSession] = useState<DriverSession | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [listTab, setListTab] = useState<"active" | "completed">("active");
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list" | "chat">("map");
  const [formOpen, setFormOpen] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formContext, setFormContext] = useState<{
    type: "task" | "stop";
    formId: string;
    stopId?: string;
  } | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const geofenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);

  // Decline dialog
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineTaskId, setDeclineTaskId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);

  // Skip dialog
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipStopId, setSkipStopId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("driver_session");
    if (!stored) {
      router.push("/driver");
      return;
    }
    setDriverSession(JSON.parse(stored));
  }, [router]);

  const fetchTasks = useCallback(async () => {
    if (!driverSession?.id) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("tasks")
      .select(
        `
        *,
        task_type:task_types!tasks_task_type_id_fkey(name, color),
        vehicle:vehicles!tasks_vehicle_id_fkey(plate_number),
        customer:business_partners!tasks_customer_id_fkey(name),
        stops:task_stops(*),
        task_form:task_forms!tasks_task_form_id_fkey(id, name)
      `
      )
      .eq("driver_id", driverSession.id)
      .in("status", ["dispatched", "confirmed", "in_progress", "scheduled"])
      .order("planned_start", { ascending: true });

    const STATUS_PRIORITY: Record<string, number> = { in_progress: 0, dispatched: 1, scheduled: 1, confirmed: 2 };
    const mapped = (data || []).map((t: any) => ({
      ...t,
      stops: (t.stops || []).sort(
        (a: any, b: any) => a.sequence_order - b.sequence_order
      ),
    }));
    mapped.sort((a: any, b: any) => {
      const pa = STATUS_PRIORITY[a.status] ?? 3;
      const pb = STATUS_PRIORITY[b.status] ?? 3;
      if (pa !== pb) return pa - pb;
      // Within same priority, sort by closest planned_start
      const da = a.planned_start ? new Date(a.planned_start).getTime() : Infinity;
      const db = b.planned_start ? new Date(b.planned_start).getTime() : Infinity;
      return da - db;
    });
    setTasks(mapped);
    setCompletedTasks([]); // Reset so completed tab re-fetches
    setLoading(false);
  }, [driverSession?.id]);

  const fetchCompletedTasks = useCallback(async () => {
    if (!driverSession?.id) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("tasks")
      .select(`
        *,
        task_type:task_types!tasks_task_type_id_fkey(name, color),
        vehicle:vehicles!tasks_vehicle_id_fkey(plate_number),
        customer:business_partners!tasks_customer_id_fkey(name),
        stops:task_stops(*),
        task_form:task_forms!tasks_task_form_id_fkey(id, name)
      `)
      .eq("driver_id", driverSession.id)
      .in("status", ["completed", "failed", "cancelled"])
      .order("actual_end", { ascending: false })
      .limit(50);

    const sorted = (data || []).map((t: any) => ({
      ...t,
      stops: (t.stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
    }));
    setCompletedTasks(sorted);
  }, [driverSession?.id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (listTab === "completed" && completedTasks.length === 0) {
      fetchCompletedTasks();
    }
  }, [listTab, completedTasks.length, fetchCompletedTasks]);

  // Realtime: listen for task changes + layout jobsUpdated events
  useEffect(() => {
    if (!driverSession?.id) return;
    const supabase = createClient();

    const channel = supabase
      .channel('driver-jobs-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `driver_id=eq.${driverSession.id}`,
      }, () => {
        fetchTasks();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_stops',
      }, () => {
        // Refresh active task if viewing one
        if (activeTask) fetchTasks();
      })
      .subscribe();

    const handleJobsUpdated = () => fetchTasks();
    window.addEventListener("jobsUpdated", handleJobsUpdated);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("jobsUpdated", handleJobsUpdated);
    };
  }, [driverSession?.id, fetchTasks, activeTask]);

  // GPS position tracking (every 30s when task is in_progress)
  useEffect(() => {
    if (
      !driverSession?.id ||
      !activeTask ||
      activeTask.status !== "in_progress"
    ) {
      if (positionIntervalRef.current)
        clearInterval(positionIntervalRef.current);
      return;
    }

    const trackPosition = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setDriverLat(pos.coords.latitude);
          setDriverLng(pos.coords.longitude);
          const supabase = createClient();
          await supabase.from("driver_positions").insert({
            driver_id: driverSession!.id,
            task_id: activeTask.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          });
          // Also update driver's last known position
          await supabase
            .from("drivers")
            .update({
              last_lat: pos.coords.latitude,
              last_lng: pos.coords.longitude,
              last_seen_at: new Date().toISOString(),
            })
            .eq("id", driverSession!.id);
        },
        undefined,
        { enableHighAccuracy: true }
      );
    };

    trackPosition();
    positionIntervalRef.current = setInterval(trackPosition, 30000);

    return () => {
      if (positionIntervalRef.current)
        clearInterval(positionIntervalRef.current);
    };
  }, [driverSession, activeTask]);

  // Geofence auto-checkin/checkout monitoring
  useEffect(() => {
    if (
      !driverSession?.id ||
      !activeTask ||
      activeTask.status !== "in_progress"
    ) {
      if (geofenceIntervalRef.current)
        clearInterval(geofenceIntervalRef.current);
      return;
    }

    const checkGeofence = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const supabase = createClient();

          for (const stop of activeTask.stops) {
            if (!stop.lat || !stop.lng) continue;
            const radius = stop.geofence_radius || 200;
            const dist = distanceMeters(lat, lng, stop.lat, stop.lng);

            // Auto-checkin: driver enters geofence of en_route stop
            if (
              stop.auto_checkin &&
              (stop.status === "en_route" || stop.status === "pending") &&
              dist <= radius
            ) {
              await supabase
                .from("task_stops")
                .update({
                  status: "arrived",
                  actual_arrival: new Date().toISOString(),
                })
                .eq("id", stop.id);
              await supabase.from("stop_status_history").insert({
                task_id: activeTask.id,
                stop_id: stop.id,
                from_status: stop.status,
                to_status: "arrived",
                changed_by: driverSession!.id,
                changed_by_type: "auto_geofence",
                lat,
                lng,
                notes: `Auto check-in (${Math.round(dist)}m from stop)`,
              });
              toast({
                title: `Auto check-in: ${stop.name}`,
                description: "You entered the geofence area",
              });
              fetchTasks();
            }

            // Auto-checkout: driver leaves geofence of in_progress/arrived stop
            if (
              stop.auto_checkout &&
              (stop.status === "arrived" || stop.status === "in_progress") &&
              dist > radius * 1.2
            ) {
              // Check if form needs to be filled first
              if (stop.stop_form_id) {
                const { data: existing } = await supabase
                  .from("stop_form_submissions")
                  .select("id")
                  .eq("stop_id", stop.id)
                  .limit(1);
                if (!existing || existing.length === 0) continue;
              }

              await supabase
                .from("task_stops")
                .update({
                  status: "completed",
                  actual_departure: new Date().toISOString(),
                })
                .eq("id", stop.id);
              await supabase.from("stop_status_history").insert({
                task_id: activeTask.id,
                stop_id: stop.id,
                from_status: stop.status,
                to_status: "completed",
                changed_by: driverSession!.id,
                changed_by_type: "auto_geofence",
                lat,
                lng,
                notes: `Auto check-out (${Math.round(dist)}m from stop)`,
              });

              // Move next stop to en_route
              const nextStop = activeTask.stops.find(
                (s) =>
                  s.sequence_order > stop.sequence_order &&
                  s.status === "pending"
              );
              if (nextStop) {
                await supabase
                  .from("task_stops")
                  .update({ status: "en_route" })
                  .eq("id", nextStop.id);
              }

              // Check if all done
              const allCompleted = activeTask.stops.every((s) =>
                s.id === stop.id
                  ? true
                  : s.status === "completed" || s.status === "skipped"
              );
              if (allCompleted) {
                await supabase
                  .from("tasks")
                  .update({
                    status: "completed",
                    actual_end: new Date().toISOString(),
                  })
                  .eq("id", activeTask.id);
                toast({
                  title: "Task completed!",
                  description: "All stops done.",
                });
                setActiveTask(null);
              } else {
                toast({
                  title: `Auto check-out: ${stop.name}`,
                  description: "You left the geofence area",
                });
              }
              fetchTasks();
            }
          }
        },
        undefined,
        { enableHighAccuracy: true }
      );
    };

    checkGeofence();
    geofenceIntervalRef.current = setInterval(checkGeofence, 15000);

    return () => {
      if (geofenceIntervalRef.current)
        clearInterval(geofenceIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverSession, activeTask]);

  // Get current location on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverLat(pos.coords.latitude);
        setDriverLng(pos.coords.longitude);
      },
      undefined,
      { enableHighAccuracy: true }
    );
  }, []);

  // --- Notification Helper ---
  const notifyEngine = async (task: any, event: string, title: string, body: string) => {
    try {
      await fetch("/api/notifications/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          title,
          body,
          icon: event.includes("completed") ? "check-circle" : event.includes("failed") ? "x-circle" : "route",
          actionUrl: "/admin/fsm/tasks",
          data: { type: event.replace(".", "_"), task_id: task.id },
          adminId: task.admin_id,
          module: "fsm",
          entityType: "task",
          entityId: task.id,
          triggeredBy: driverSession?.id,
          priority: event.includes("failed") || event.includes("declined") ? "high" : "normal",
        }),
      });
    } catch { /* non-blocking */ }
  };

  // --- Actions ---

  const confirmTask = async (taskId: string) => {
    const supabase = createClient();
    const task = tasks.find((t) => t.id === taskId);
    await supabase
      .from("tasks")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", taskId);
    // Also update task_assignments
    await supabase
      .from("task_assignments")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("task_id", taskId)
      .eq("driver_id", driverSession?.id);
    await supabase.from("task_status_history").insert({
      task_id: taskId,
      from_status: task?.status || "dispatched",
      to_status: "confirmed",
      changed_by: driverSession?.id,
      changed_by_type: "driver",
      notes: "Driver confirmed reception",
    });
    await notifyEngine(task, "task.accepted", "Task Accepted", `${task?.reference_number}: ${task?.title} was accepted by the driver`);
    toast({ title: "Task confirmed" });
    fetchTasks();
  };

  const declineTask = async () => {
    if (!declineTaskId || !declineReason.trim()) return;
    setDeclining(true);
    const supabase = createClient();
    const task = tasks.find((t) => t.id === declineTaskId);

    // Update task_assignments to declined
    await supabase
      .from("task_assignments")
      .update({ status: "declined" })
      .eq("task_id", declineTaskId)
      .eq("driver_id", driverSession?.id);

    // Set task back to not_assigned so dispatcher can reassign
    await supabase
      .from("tasks")
      .update({ status: "not_assigned", driver_id: null })
      .eq("id", declineTaskId);

    await supabase.from("task_status_history").insert({
      task_id: declineTaskId,
      from_status: task?.status || "dispatched",
      to_status: "not_assigned",
      changed_by: driverSession?.id,
      changed_by_type: "driver",
      notes: `Driver declined: ${declineReason}`,
    });

    await notifyEngine(task, "task.declined", "Task Declined", `${task?.reference_number}: ${task?.title} was declined. Reason: ${declineReason}`);
    toast({ title: "Task declined", description: "Dispatcher will be notified" });
    setDeclining(false);
    setDeclineOpen(false);
    setDeclineReason("");
    setDeclineTaskId(null);
    if (activeTask?.id === declineTaskId) setActiveTask(null);
    fetchTasks();
  };

  const startTask = async (taskId: string) => {
    const supabase = createClient();
    const task = tasks.find((t) => t.id === taskId);
    await supabase
      .from("tasks")
      .update({ status: "in_progress", actual_start: new Date().toISOString() })
      .eq("id", taskId);
    if (task?.stops?.[0]) {
      await supabase
        .from("task_stops")
        .update({ status: "en_route" })
        .eq("id", task.stops[0].id);
      await supabase.from("stop_status_history").insert({
        task_id: taskId,
        stop_id: task.stops[0].id,
        from_status: "pending",
        to_status: "en_route",
        changed_by: driverSession?.id,
        changed_by_type: "driver",
      });
    }
    await supabase.from("task_status_history").insert({
      task_id: taskId,
      from_status: task?.status || "confirmed",
      to_status: "in_progress",
      changed_by: driverSession?.id,
      changed_by_type: "driver",
      notes: "Driver started task",
    });
    await notifyEngine(task, "task.started", "Task Started", `${task?.reference_number}: ${task?.title} has been started by the driver`);
    toast({ title: "Task started" });
    fetchTasks();
  };

  const arriveAtStop = async (taskId: string, stop: TaskStop) => {
    const supabase = createClient();
    await supabase
      .from("task_stops")
      .update({ status: "arrived", actual_arrival: new Date().toISOString() })
      .eq("id", stop.id);
    await supabase.from("stop_status_history").insert({
      task_id: taskId,
      stop_id: stop.id,
      from_status: stop.status,
      to_status: "arrived",
      changed_by: driverSession?.id,
      changed_by_type: "driver",
      lat: driverLat,
      lng: driverLng,
    });
    toast({ title: `Arrived at ${stop.name}` });
    fetchTasks();
  };

  const startStopWork = async (taskId: string, stop: TaskStop) => {
    const supabase = createClient();
    await supabase
      .from("task_stops")
      .update({ status: "in_progress" })
      .eq("id", stop.id);
    await supabase.from("stop_status_history").insert({
      task_id: taskId,
      stop_id: stop.id,
      from_status: "arrived",
      to_status: "in_progress",
      changed_by: driverSession?.id,
      changed_by_type: "driver",
    });
    toast({ title: "Work started" });
    fetchTasks();
  };

  const completeStop = async (taskId: string, stop: TaskStop) => {
    try {
      if (stop.stop_form_id) {
        const supabase = createClient();
        const { data: existing, error: checkErr } = await supabase
          .from("stop_form_submissions")
          .select("id")
          .eq("stop_id", stop.id)
          .limit(1);

        if (!existing || existing.length === 0) {
          openForm("stop", stop.stop_form_id, stop.id);
          return;
        }
      }

      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from("task_stops")
        .update({ status: "completed", actual_departure: new Date().toISOString() })
        .eq("id", stop.id);



      if (updateErr) {
        toast({ title: "Error completing stop", description: updateErr.message, variant: "destructive" });
        return;
      }

      await supabase.from("stop_status_history").insert({
        task_id: taskId,
        stop_id: stop.id,
        from_status: stop.status,
        to_status: "completed",
        changed_by: driverSession?.id,
        changed_by_type: "driver",
        lat: driverLat,
        lng: driverLng,
      });

      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        const nextStop = task.stops.find(
          (s) => s.sequence_order > stop.sequence_order && s.status === "pending"
        );
        if (nextStop) {
          await supabase
            .from("task_stops")
            .update({ status: "en_route" })
            .eq("id", nextStop.id);

        }

        const allCompleted = task.stops.every((s) =>
          s.id === stop.id
            ? true
            : s.status === "completed" || s.status === "skipped"
        );
        if (allCompleted) {
          await supabase
            .from("tasks")
            .update({ status: "completed", actual_end: new Date().toISOString() })
            .eq("id", taskId);
          await supabase.from("task_status_history").insert({
            task_id: taskId,
            from_status: "in_progress",
            to_status: "completed",
            changed_by: driverSession?.id,
            changed_by_type: "driver",
            notes: "All stops completed",
          });
          const t = tasks.find((x) => x.id === taskId);
          if (t) await notifyEngine(t, "task.completed", "Task Completed", `${t.reference_number}: ${t.title} - all stops completed`);
          toast({ title: "Task completed", description: "All stops are done!" });
          setActiveTask(null);
          fetchTasks();
          return;
        }
      }
      const t = tasks.find((x) => x.id === taskId);
      if (t) await notifyEngine(t, "stop.completed", "Stop Completed", `${t.reference_number}: Stop ${stop.sequence_order} at ${stop.address || "location"} completed`);
      toast({ title: "Stop completed" });
      fetchTasks();
    } catch (err: any) {
      console.error("[v0] completeStop error:", err);
      toast({ title: "Error", description: err?.message || "Failed to complete stop", variant: "destructive" });
    }
  };

  const openSkipDialog = (stopId: string) => {
    setSkipStopId(stopId);
    setSkipReason("");
    setSkipOpen(true);
  };

  const skipStop = async () => {
    if (!skipStopId || !skipReason.trim() || !activeTask) return;
    setSkipping(true);
    const supabase = createClient();
    const stop = activeTask.stops.find((s) => s.id === skipStopId);

    await supabase
      .from("task_stops")
      .update({ status: "skipped", actual_departure: new Date().toISOString() })
      .eq("id", skipStopId);
    await supabase.from("stop_status_history").insert({
      task_id: activeTask.id,
      stop_id: skipStopId,
      from_status: stop?.status || "pending",
      to_status: "skipped",
      changed_by: driverSession?.id,
      changed_by_type: "driver",
      notes: `Skipped: ${skipReason}`,
      lat: driverLat,
      lng: driverLng,
    });

    // Move next stop to en_route
    if (stop) {
      const nextStop = activeTask.stops.find(
        (s) => s.sequence_order > stop.sequence_order && s.status === "pending"
      );
      if (nextStop) {
        await supabase
          .from("task_stops")
          .update({ status: "en_route" })
          .eq("id", nextStop.id);
      }

      const allCompleted = activeTask.stops.every((s) =>
        s.id === skipStopId
          ? true
          : s.status === "completed" || s.status === "skipped"
      );
      if (allCompleted) {
        await supabase
          .from("tasks")
          .update({ status: "completed", actual_end: new Date().toISOString() })
          .eq("id", activeTask.id);
        toast({ title: "Task completed" });
        setActiveTask(null);
      }
    }

    toast({ title: "Stop skipped" });
    setSkipping(false);
    setSkipOpen(false);
    setSkipReason("");
    setSkipStopId(null);
    fetchTasks();
  };

  // Form functions
  const openForm = async (
    type: "task" | "stop",
    formId: string,
    stopId?: string
  ) => {
    const supabase = createClient();
    const { data: fields } = await supabase
      .from("task_form_fields")
      .select("*")
      .eq("form_id", formId)
      .order("sort_order");

    const visibleFields = (fields || []).filter(
      (f: FormField) => f.is_visible_to_driver
    );
    setFormFields(visibleFields);

    const defaults: Record<string, any> = {};
    for (const field of visibleFields) {
      defaults[field.id] = field.default_value || "";
    }
    setFormValues(defaults);
    setFormContext({ type, formId, stopId });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!formContext || !activeTask) return;

    for (const field of formFields) {
      if (field.is_required && !formValues[field.id]) {
        toast({ title: `${field.label} is required`, variant: "destructive" });
        return;
      }
    }

    setSubmittingForm(true);
    const supabase = createClient();

    if (formContext.type === "task") {
      await supabase.from("task_form_submissions").insert({
        task_id: activeTask.id,
        form_id: formContext.formId,
        submitted_by: driverSession?.id,
        submitted_by_type: "driver",
        data: formValues,
      });
    } else if (formContext.type === "stop" && formContext.stopId) {
      await supabase.from("stop_form_submissions").insert({
        stop_id: formContext.stopId,
        task_id: activeTask.id,
        form_id: formContext.formId,
        submitted_by: driverSession?.id,
        submitted_by_type: "driver",
        data: formValues,
      });

      await supabase
        .from("task_stops")
        .update({ status: "completed", actual_departure: new Date().toISOString() })
        .eq("id", formContext.stopId);
      await supabase.from("stop_status_history").insert({
        task_id: activeTask.id,
        stop_id: formContext.stopId,
        from_status: "in_progress",
        to_status: "completed",
        changed_by: driverSession?.id,
        changed_by_type: "driver",
        notes: "Completed after form submission",
      });

      const stop = activeTask.stops.find((s) => s.id === formContext.stopId);
      if (stop) {
        const nextStop = activeTask.stops.find(
          (s) =>
            s.sequence_order > stop.sequence_order && s.status === "pending"
        );
        if (nextStop) {
          await supabase
            .from("task_stops")
            .update({ status: "en_route" })
            .eq("id", nextStop.id);
        }

        const allCompleted = activeTask.stops.every((s) =>
          s.id === formContext.stopId
            ? true
            : s.status === "completed" || s.status === "skipped"
        );
        if (allCompleted) {
          await supabase
            .from("tasks")
            .update({ status: "completed", actual_end: new Date().toISOString() })
            .eq("id", activeTask.id);
          toast({ title: "Task completed!" });
          setActiveTask(null);
        }
      }
    }

    toast({ title: "Form submitted" });
    setSubmittingForm(false);
    setFormOpen(false);
    fetchTasks();
  };

  const navigateToStop = (stop: TaskStop) => {
    if (stop.lat && stop.lng) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`,
        "_blank"
      );
    } else if (stop.address) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`,
        "_blank"
      );
    }
  };

  // Update active task when tasks refresh
  useEffect(() => {
    if (activeTask) {
      const updated = tasks.find((t) => t.id === activeTask.id);
      if (updated) setActiveTask(updated);
    }
  }, [tasks]); // eslint-disable-next-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // ============= FORM FULL-SCREEN VIEW =============
  if (formOpen && formFields.length > 0) {
    const uploadSignature = async (fieldId: string, dataUrl: string | null) => {
      if (!dataUrl) {
        setFormValues((p) => ({ ...p, [fieldId]: "" }));
        return;
      }
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `signature-${Date.now()}.png`, { type: "image/png" });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", `signatures/${activeTask?.id || "general"}`);
        const uploadRes = await fetch("/api/upload/form-attachment", { method: "POST", body: fd });
        if (!uploadRes.ok) {
          console.error("Signature upload failed:", await uploadRes.text());
          return;
        }
        const data = await uploadRes.json();
        if (data.url) {
          setFormValues((p) => ({ ...p, [fieldId]: data.url }));
        }
      } catch (err) {
        console.error("Signature upload failed:", err);
      }
    };

    return (
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Fill Form</h1>
            <p className="text-xs text-muted-foreground">
              {formContext?.type === "task" ? "Task Form" : "Stop Form"}
              {activeTask && ` - ${activeTask.title}`}
            </p>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {formFields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label className="text-sm font-medium">
                {field.label}
                {field.is_required && <span className="text-destructive ml-0.5">*</span>}
              </Label>

              {field.field_type === "text" && (
                <Input
                  value={formValues[field.id] || ""}
                  onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                  placeholder={field.placeholder || ""}
                  disabled={!field.is_editable_by_driver}
                />
              )}
              {field.field_type === "textarea" && (
                <Textarea
                  value={formValues[field.id] || ""}
                  onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                  placeholder={field.placeholder || ""}
                  disabled={!field.is_editable_by_driver}
                  rows={3}
                />
              )}
              {field.field_type === "number" && (
                <Input
                  type="number"
                  value={formValues[field.id] || ""}
                  onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                  placeholder={field.placeholder || ""}
                  disabled={!field.is_editable_by_driver}
                />
              )}
              {field.field_type === "select" && (
                <Select
                  value={formValues[field.id] || ""}
                  onValueChange={(v) => setFormValues((p) => ({ ...p, [field.id]: v }))}
                  disabled={!field.is_editable_by_driver}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(field.options) && field.options.map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {field.field_type === "date" && (
                <Input
                  type="date"
                  value={formValues[field.id] || ""}
                  onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                  disabled={!field.is_editable_by_driver}
                />
              )}
              {field.field_type === "time" && (
                <Input
                  type="time"
                  value={formValues[field.id] || ""}
                  onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                  disabled={!field.is_editable_by_driver}
                />
              )}
              {field.field_type === "toggle" && (
                <Switch
                  checked={!!formValues[field.id]}
                  onCheckedChange={(c) => setFormValues((p) => ({ ...p, [field.id]: c }))}
                  disabled={!field.is_editable_by_driver}
                />
              )}
              {field.field_type === "rating" && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFormValues((p) => ({ ...p, [field.id]: s }))}
                      className="p-0.5"
                      disabled={!field.is_editable_by_driver}
                      type="button"
                    >
                      <Star className={`h-6 w-6 ${(formValues[field.id] || 0) >= s ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
              )}
              {(field.field_type === "photo" || field.field_type === "file") && (
                <PhotoCapture
                  value={formValues[field.id] || ""}
                  onUpload={(url) => setFormValues((p) => ({ ...p, [field.id]: url }))}
                  folder={`forms/${activeTask?.id || "general"}`}
                  disabled={!field.is_editable_by_driver}
                  accept={field.field_type === "photo" ? "image/*" : "*/*"}
                  label={field.field_type === "photo" ? "photo" : "file"}
                />
              )}
              {field.field_type === "signature" && (
                <SignaturePad
                  value={formValues[field.id] || ""}
                  onSave={(dataUrl) => uploadSignature(field.id, dataUrl)}
                  disabled={!field.is_editable_by_driver}
                />
              )}
              {field.help_text && (
                <p className="text-xs text-muted-foreground">{field.help_text}</p>
              )}
            </div>
          ))}
        </div>

        {/* Sticky Submit Bar */}
        <div className="sticky bottom-0 bg-background border-t pt-3 pb-4 -mx-4 px-4 flex gap-2">
          <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button className="flex-1 h-11" onClick={submitForm} disabled={submittingForm}>
            {submittingForm ? "Submitting..." : "Submit Form"}
          </Button>
        </div>
      </div>
    );
  }

  // ============= TASK DETAIL VIEW =============
  if (activeTask) {
    const sc = STATUS_CONFIG[activeTask.status] || {
      label: activeTask.status,
      color: "",
    };
    const currentStop = activeTask.stops.find(
      (s) => s.status !== "completed" && s.status !== "skipped"
    );
    const completedStops = activeTask.stops.filter(
      (s) => s.status === "completed"
    ).length;
    const hasGeoStops = activeTask.stops.some((s) => s.lat && s.lng);

    return (
      <div className="space-y-4 max-w-lg mx-auto px-4 py-4">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTask(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-muted-foreground">
              {activeTask.reference_number}
            </p>
            <h2 className="font-bold truncate">{activeTask.title}</h2>
          </div>
          <Badge className={sc.color}>{sc.label}</Badge>
        </div>

        {/* Map/List Toggle + Map */}
        {hasGeoStops && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {([
                  { key: "map", label: "Map", icon: Map },
                  { key: "list", label: "List", icon: List },
                  { key: "chat", label: "Chat", icon: MessageSquare },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setViewMode(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      viewMode === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 inline mr-1" />
                    {label}
                  </button>
                ))}
              </div>
              {activeTask.status === "in_progress" && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Crosshair className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-muted-foreground">GPS Active</span>
                </div>
              )}
            </div>
            {viewMode === "map" && (
              <div className="rounded-lg overflow-hidden border">
                <RouteMap
                  stops={activeTask.stops}
                  driverLat={driverLat}
                  driverLng={driverLng}
                  className="h-[250px]"
                />
              </div>
            )}
            {viewMode === "chat" && (
              <div className="rounded-lg border overflow-hidden bg-card" style={{ height: 320 }}>
                <TaskChat
                  taskId={activeTask.id}
                  taskReference={activeTask.reference_number}
                  currentUserId={driverSession!.id}
                  currentUserType="driver"
                  currentUserName={driverSession!.name}
                />
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>Progress</span>
            <span className="font-medium">
              {completedStops}/{activeTask.stops.length} stops
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{
                width: `${
                  activeTask.stops.length > 0
                    ? (completedStops / activeTask.stops.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Task Info */}
        {activeTask.description && (
          <p className="text-sm text-muted-foreground">
            {activeTask.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-sm">
          {activeTask.vehicle && (
            <span className="flex items-center gap-1">
              <Truck className="h-4 w-4" />
              {activeTask.vehicle.plate_number}
            </span>
          )}
          {activeTask.customer && (
            <span className="flex items-center gap-1 text-muted-foreground">
              {activeTask.customer.name}
            </span>
          )}
        </div>

        {/* === PROMINENT ACTION BAR === */}
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          {activeTask.status === "dispatched" && (
            <>
              <div className="text-center">
                <p className="text-sm font-semibold">New Task Assigned</p>
                <p className="text-xs text-muted-foreground">Accept to confirm or decline to send back</p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 h-12 text-base" onClick={() => confirmTask(activeTask.id)}>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Accept Task
                </Button>
                <Button variant="outline" className="h-12 bg-transparent text-destructive hover:text-destructive" onClick={() => { setDeclineTaskId(activeTask.id); setDeclineReason(""); setDeclineOpen(true); }}>
                  <ThumbsDown className="h-5 w-5 mr-1" />
                  Decline
                </Button>
              </div>
            </>
          )}

          {activeTask.status === "scheduled" && (
            <>
              <div className="text-center">
                <p className="text-sm font-semibold">Scheduled Task</p>
                <p className="text-xs text-muted-foreground">This task is scheduled. Accept to confirm you received it.</p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 h-12 text-base" onClick={() => confirmTask(activeTask.id)}>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Accept Task
                </Button>
                <Button variant="outline" className="h-12 bg-transparent text-destructive hover:text-destructive" onClick={() => { setDeclineTaskId(activeTask.id); setDeclineReason(""); setDeclineOpen(true); }}>
                  <ThumbsDown className="h-5 w-5 mr-1" />
                  Decline
                </Button>
              </div>
            </>
          )}

          {activeTask.status === "confirmed" && (
            <>
              <div className="text-center">
                <p className="text-sm font-semibold">Ready to Start</p>
                <p className="text-xs text-muted-foreground">Begin driving to the first stop</p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 h-12 text-base" onClick={() => startTask(activeTask.id)}>
                  <PlayCircle className="h-5 w-5 mr-2" />
                  Start Route
                </Button>
                <Button variant="outline" className="h-12 bg-transparent text-destructive hover:text-destructive" onClick={() => { setDeclineTaskId(activeTask.id); setDeclineReason(""); setDeclineOpen(true); }}>
                  <ThumbsDown className="h-5 w-5 mr-1" />
                  Decline
                </Button>
              </div>
            </>
          )}

          {activeTask.status === "in_progress" && currentStop && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shrink-0">
                  {activeTask.stops.indexOf(currentStop) + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{currentStop.name || `Stop ${activeTask.stops.indexOf(currentStop) + 1}`}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentStop.address}</p>
                </div>
                <Badge className={`text-xs ${(STOP_STATUS_CONFIG[currentStop.status] || STOP_STATUS_CONFIG.pending).color}`}>
                  {(STOP_STATUS_CONFIG[currentStop.status] || STOP_STATUS_CONFIG.pending).label}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {(currentStop.status === "en_route" || currentStop.status === "pending") && (
                  <>
                    {currentStop.lat && currentStop.lng && (
                      <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => navigateToStop(currentStop)}>
                        <Navigation className="h-4 w-4 mr-2" />
                        Navigate
                      </Button>
                    )}
                    {!currentStop.auto_checkin ? (
                      <Button className="flex-1 h-11" onClick={() => arriveAtStop(activeTask.id, currentStop)}>
                        <MapPin className="h-4 w-4 mr-2" />
                        I Arrived
                      </Button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 h-11">
                        <Crosshair className="h-3.5 w-3.5" />
                        Auto check-in via GPS
                      </div>
                    )}
                  </>
                )}
                {currentStop.status === "arrived" && (
                  <Button className="flex-1 h-11" onClick={() => startStopWork(activeTask.id, currentStop)}>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Start Work
                  </Button>
                )}
                {(currentStop.status === "in_progress" || currentStop.status === "arrived") && (
                  <>
                    {!currentStop.auto_checkout ? (
                      <Button className="flex-1 h-11" onClick={() => completeStop(activeTask.id, currentStop)}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Complete Stop
                      </Button>
                    ) : currentStop.status === "in_progress" ? (
                      <div className="flex-1 flex items-center justify-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 h-11">
                        <Crosshair className="h-3.5 w-3.5" />
                        Auto check-out when leaving
                      </div>
                    ) : null}
                    <Button variant="outline" className="h-11 text-orange-600 bg-transparent" onClick={() => openSkipDialog(currentStop.id)}>
                      <SkipForward className="h-4 w-4 mr-1" />
                      Skip
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {activeTask.status === "in_progress" && !currentStop && (
            <div className="text-center py-2">
              <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-1" />
              <p className="text-sm font-semibold text-green-600">All Stops Completed!</p>
            </div>
          )}

          {activeTask.status === "completed" && (
            <div className="text-center py-2">
              <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-1" />
              <p className="text-sm font-semibold text-green-600">Task Completed</p>
            </div>
          )}

          {activeTask.status === "failed" && (
            <div className="text-center py-2">
              <XCircle className="h-8 w-8 mx-auto text-red-500 mb-1" />
              <p className="text-sm font-semibold text-red-600">Task Failed</p>
            </div>
          )}
        </div>

        {/* Task Form */}
        {activeTask.task_form && activeTask.status === "in_progress" && (
          <Button variant="outline" className="w-full bg-transparent" onClick={() => openForm("task", activeTask.task_form!.id)}>
            <FileText className="h-4 w-4 mr-2" />
            Task Form: {activeTask.task_form.name}
          </Button>
        )}

        {/* Chat for non-geo tasks */}
        {!hasGeoStops && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === "chat" ? "list" : "chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === "chat"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {viewMode === "chat" ? "Close Chat" : "Task Chat"}
            </button>
          </div>
        )}
        {!hasGeoStops && viewMode === "chat" && (
          <div className="rounded-lg border overflow-hidden bg-card" style={{ height: 320 }}>
            <TaskChat
              taskId={activeTask.id}
              taskReference={activeTask.reference_number}
              currentUserId={driverSession!.id}
              currentUserType="driver"
              currentUserName={driverSession!.name}
            />
          </div>
        )}

        {/* Stops */}
        {((!hasGeoStops && viewMode !== "chat") || (hasGeoStops && viewMode === "list")) && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Route Stops</h3>
            {activeTask.stops.map((stop, i) => {
              const isCurrent = currentStop?.id === stop.id;
              const isDone =
                stop.status === "completed" || stop.status === "skipped";
              const ssc =
                STOP_STATUS_CONFIG[stop.status] || STOP_STATUS_CONFIG.pending;
              return (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  index={i}
                  isCurrent={isCurrent}
                  isDone={isDone}
                  ssc={ssc}
                  taskStatus={activeTask.status}
                  taskId={activeTask.id}
                  onNavigate={navigateToStop}
                  onArrive={arriveAtStop}
                  onStartWork={startStopWork}
                  onComplete={completeStop}
                  onSkip={openSkipDialog}
                />
              );
            })}
          </div>
        )}

        {/* Show stops below map when map or list is visible (not chat) */}
        {hasGeoStops && viewMode !== "chat" && viewMode === "map" && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Route Stops</h3>
            {activeTask.stops.map((stop, i) => {
              const isCurrent = currentStop?.id === stop.id;
              const isDone =
                stop.status === "completed" || stop.status === "skipped";
              const ssc =
                STOP_STATUS_CONFIG[stop.status] || STOP_STATUS_CONFIG.pending;
              return (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  index={i}
                  isCurrent={isCurrent}
                  isDone={isDone}
                  ssc={ssc}
                  taskStatus={activeTask.status}
                  taskId={activeTask.id}
                  onNavigate={navigateToStop}
                  onArrive={arriveAtStop}
                  onStartWork={startStopWork}
                  onComplete={completeStop}
                  onSkip={openSkipDialog}
                />
              );
            })}
          </div>
        )}

        {/* Fail Task */}
        {activeTask.status === "in_progress" && (
          <Button
            variant="outline"
            className="w-full text-destructive bg-transparent"
            onClick={async () => {
              const supabase = createClient();
              await supabase
                .from("tasks")
                .update({
                  status: "failed",
                  actual_end: new Date().toISOString(),
                })
                .eq("id", activeTask.id);
              await supabase.from("task_status_history").insert({
                task_id: activeTask.id,
                from_status: "in_progress",
                to_status: "failed",
                changed_by: driverSession?.id,
                changed_by_type: "driver",
                notes: "Driver reported failure",
              });
              toast({ title: "Task marked as failed" });
              setActiveTask(null);
              fetchTasks();
            }}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Report Task Failed
          </Button>
        )}

        {/* Decline Dialog */}
        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline Task</DialogTitle>
              <DialogDescription>
                The task will be sent back to the dispatcher for reassignment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Reason (required)</Label>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Why are you declining this task?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={declineTask}
                disabled={declining || !declineReason.trim()}
              >
                {declining ? "Declining..." : "Decline Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Skip Dialog */}
        <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Skip Stop</DialogTitle>
              <DialogDescription>
                Please provide a reason for skipping this stop.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Reason (required)</Label>
                <Textarea
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="Why are you skipping this stop?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkipOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={skipStop}
                disabled={skipping || !skipReason.trim()}
              >
                {skipping ? "Skipping..." : "Skip Stop"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    );
  }

  // ============= TASK LIST VIEW =============
  const renderTaskCard = (task: Task, isHistory = false) => {
    const sc = STATUS_CONFIG[task.status] || { label: task.status, color: "" };
    const completedStops = task.stops.filter((s) => s.status === "completed").length;
    const needsAction = task.status === "dispatched" || task.status === "scheduled";
    return (
      <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTask(task)}>
        <CardContent className="py-3 px-4">
          <div className="flex items-start justify-between mb-1">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono text-muted-foreground">{task.reference_number}</p>
              <p className="font-medium truncate">{task.title}</p>
            </div>
            <div className="flex items-center gap-2 ml-2">
              {task.priority !== "normal" && <AlertCircle className={`h-4 w-4 ${PRIORITY_ICON[task.priority]}`} />}
              <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            {task.vehicle && (
              <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{task.vehicle.plate_number}</span>
            )}
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{completedStops}/{task.stops.length} stops</span>
            {task.planned_start && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(task.planned_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {isHistory && task.actual_end && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(task.actual_end).toLocaleDateString()}
              </span>
            )}
          </div>

          {task.stops.length > 0 && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all ${
                  task.status === "completed" ? "bg-green-500" : task.status === "failed" ? "bg-red-500" : "bg-primary"
                }`}
                style={{ width: `${(completedStops / task.stops.length) * 100}%` }}
              />
            </div>
          )}

          {needsAction && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="flex-1 h-9" onClick={(e) => { e.stopPropagation(); confirmTask(task.id); }}>
                <CheckCircle className="h-3.5 w-3.5 mr-1" />Accept
              </Button>
              <Button size="sm" variant="outline" className="h-9 text-destructive bg-transparent" onClick={(e) => { e.stopPropagation(); setDeclineTaskId(task.id); setDeclineReason(""); setDeclineOpen(true); }}>
                <ThumbsDown className="h-3.5 w-3.5 mr-1" />Decline
              </Button>
            </div>
          )}

          {task.status === "confirmed" && (
            <div className="mt-3">
              <Button size="sm" className="w-full h-9" onClick={(e) => { e.stopPropagation(); startTask(task.id); }}>
                <PlayCircle className="h-3.5 w-3.5 mr-1" />Start Route
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto px-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My Jobs</h1>
        <Badge variant="secondary">
          {listTab === "active" ? `${tasks.length} active` : `${completedTasks.length} past`}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
        <button
          onClick={() => setListTab("active")}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            listTab === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Active
          {tasks.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-primary text-primary-foreground">
              {tasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setListTab("completed")}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            listTab === "completed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Completed
        </button>
      </div>

      {/* Active Tasks */}
      {listTab === "active" && (
        <>
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">No active jobs</p>
                <p className="text-xs text-muted-foreground mt-1">New tasks will appear here when dispatched</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => renderTaskCard(task))}
            </div>
          )}
        </>
      )}

      {/* Completed Tasks */}
      {listTab === "completed" && (
        <>
          {completedTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">No completed jobs yet</p>
                <p className="text-xs text-muted-foreground mt-1">Finished tasks will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {completedTasks.map((task) => renderTaskCard(task, true))}
            </div>
          )}
        </>
      )}

      {/* Decline Dialog (list view) */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Task</DialogTitle>
            <DialogDescription>
              The task will be sent back to the dispatcher for reassignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason (required)</Label>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Why are you declining this task?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={declineTask}
              disabled={declining || !declineReason.trim()}
            >
              {declining ? "Declining..." : "Decline Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============= STOP CARD COMPONENT =============
function StopCard({
  stop,
  index,
  isCurrent,
  isDone,
  ssc,
  taskStatus,
  taskId,
  onNavigate,
  onArrive,
  onStartWork,
  onComplete,
  onSkip,
}: {
  stop: TaskStop;
  index: number;
  isCurrent: boolean;
  isDone: boolean;
  ssc: { label: string; color: string };
  taskStatus: string;
  taskId: string;
  onNavigate: (stop: TaskStop) => void;
  onArrive: (taskId: string, stop: TaskStop) => void;
  onStartWork: (taskId: string, stop: TaskStop) => void;
  onComplete: (taskId: string, stop: TaskStop) => void;
  onSkip: (stopId: string) => void;
}) {
  return (
    <Card
      className={`${isCurrent ? "ring-2 ring-primary" : ""} ${isDone ? "opacity-60" : ""}`}
    >
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge
            variant={isDone ? "default" : isCurrent ? "default" : "outline"}
            className="text-xs w-6 h-6 p-0 flex items-center justify-center rounded-full shrink-0"
          >
            {isDone ? <CheckCircle className="h-3 w-3" /> : index + 1}
          </Badge>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${isDone ? "line-through" : ""}`}
            >
              {stop.name}
            </p>
            {stop.address && (
              <p className="text-xs text-muted-foreground truncate">
                {stop.address}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(stop.auto_checkin || stop.auto_checkout) && (
              <Crosshair className="h-3.5 w-3.5 text-blue-500" title="Auto geofence" />
            )}
            <Badge className={`text-xs ${ssc.color}`}>{ssc.label}</Badge>
          </div>
        </div>

        {/* Time info */}
        {(stop.time_window_start || stop.estimated_duration_minutes) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {stop.time_window_start && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(stop.time_window_start).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {stop.time_window_end &&
                  ` - ${new Date(stop.time_window_end).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`}
              </span>
            )}
            {stop.estimated_duration_minutes && (
              <span>{stop.estimated_duration_minutes} min</span>
            )}
          </div>
        )}

        {/* Contact */}
        {stop.contact_name && (
          <div className="flex items-center gap-2 text-xs">
            <span>{stop.contact_name}</span>
            {stop.contact_phone && (
              <a
                href={`tel:${stop.contact_phone}`}
                className="flex items-center gap-1 text-primary"
              >
                <Phone className="h-3 w-3" />
                {stop.contact_phone}
              </a>
            )}
          </div>
        )}

        {stop.notes && (
          <p className="text-xs text-muted-foreground">{stop.notes}</p>
        )}

        {/* Stop Actions */}
        {isCurrent && taskStatus === "in_progress" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(stop.status === "en_route" || stop.status === "pending") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(stop)}
                >
                  <Navigation className="h-3.5 w-3.5 mr-1" />
                  Navigate
                </Button>
                {!stop.auto_checkin && (
                  <Button
                    size="sm"
                    onClick={() => onArrive(taskId, stop)}
                  >
                    <MapPin className="h-3.5 w-3.5 mr-1" />I Arrived
                  </Button>
                )}
                {stop.auto_checkin && (
                  <span className="flex items-center text-xs text-blue-600">
                    <Crosshair className="h-3 w-3 mr-1" />
                    Auto check-in enabled
                  </span>
                )}
              </>
            )}
            {stop.status === "arrived" && (
              <Button
                size="sm"
                onClick={() => onStartWork(taskId, stop)}
              >
                <PlayCircle className="h-3.5 w-3.5 mr-1" />
                Start Work
              </Button>
            )}
            {(stop.status === "in_progress" || stop.status === "arrived") && (
              <>
                {!stop.auto_checkout && (
                  <Button
                    size="sm"
                    onClick={() => onComplete(taskId, stop)}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Complete
                  </Button>
                )}
                {stop.auto_checkout && stop.status === "in_progress" && (
                  <span className="flex items-center text-xs text-blue-600">
                    <Crosshair className="h-3 w-3 mr-1" />
                    Auto check-out when leaving
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-orange-600 bg-transparent"
                  onClick={() => onSkip(stop.id)}
                >
                  <SkipForward className="h-3.5 w-3.5 mr-1" />
                  Skip
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
