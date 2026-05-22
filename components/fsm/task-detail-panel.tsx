"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  X, User, Car, MapPin, Clock, Send, CheckCircle, XCircle,
  PlayCircle, PauseCircle, AlertCircle, Calendar, ChevronRight,
  MessageSquare,
  MessagesSquare, History, Route, Building2, Phone, Mail,
  Navigation, Timer, FileText, Paperclip, Plus, Maximize2, Minimize2,
  Copy, Pencil, MoreHorizontal, Users, ImageIcon, PenTool, ChevronDown, ExternalLink,
} from "lucide-react";
import { RouteMap } from "@/components/driver/route-map";
import { TaskChat } from "@/components/chat/task-chat";
import { useRouter } from "next/navigation";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────
interface TaskStop {
  id: string;
  sequence_order: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
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

interface StatusHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by_type: string;
  notes: string | null;
  created_at: string;
}

interface Comment {
  id: string;
  author_type: string;
  message: string;
  created_at: string;
}

interface FormField {
  id: string;
  field_type: string;
  label: string;
  sort_order: number;
}

interface FormSubmission {
  id: string;
  form_id: string;
  stop_id: string;
  data: Record<string, any>;
  submitted_at: string;
  submitted_by_type: string;
  form?: { name: string } | null;
  fields?: FormField[];
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
  notes: string | null;
  is_draft: boolean;
  created_at: string;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate_number: string } | null;
  customer: { id: string; name: string } | null;
  task_type: { id: string; name: string; color: string } | null;
  stops: { id: string; name: string; status: string; sequence_order: number }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; bgClass: string }> = {
  draft:        { label: "Draft",        color: "bg-gray-500/10 text-gray-400 border-gray-500/20",    icon: PauseCircle,  bgClass: "bg-gray-500" },
  not_assigned: { label: "Unassigned",   color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: AlertCircle,  bgClass: "bg-amber-500" },
  scheduled:    { label: "Scheduled",    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",    icon: Calendar,     bgClass: "bg-blue-500" },
  dispatched:   { label: "Dispatched",   color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", icon: Send,      bgClass: "bg-indigo-500" },
  confirmed:    { label: "Confirmed",    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",    icon: CheckCircle,  bgClass: "bg-cyan-500" },
  in_progress:  { label: "In Progress",  color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: PlayCircle, bgClass: "bg-purple-500" },
  completed:    { label: "Completed",    color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle,  bgClass: "bg-green-500" },
  failed:       { label: "Failed",       color: "bg-red-500/10 text-red-400 border-red-500/20",       icon: XCircle,      bgClass: "bg-red-500" },
  cancelled:    { label: "Cancelled",    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",    icon: XCircle,      bgClass: "bg-gray-500" },
};

const STOP_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "text-gray-400" },
  en_route:    { label: "En Route",    color: "text-blue-400" },
  arrived:     { label: "Arrived",     color: "text-cyan-400" },
  in_progress: { label: "In Progress", color: "text-purple-400" },
  completed:   { label: "Completed",   color: "text-green-400" },
  skipped:     { label: "Skipped",     color: "text-gray-500" },
  failed:      { label: "Failed",      color: "text-red-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  urgent: { label: "Urgent", color: "text-red-400",            dot: "bg-red-500" },
  high:   { label: "High",   color: "text-orange-400",         dot: "bg-orange-500" },
  normal: { label: "Normal", color: "text-foreground/70",      dot: "bg-foreground/40" },
  low:    { label: "Low",    color: "text-muted-foreground/60", dot: "bg-muted-foreground/40" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function computeDelay(planned: string | null, actual: string | null): { minutes: number; label: string; isLate: boolean } | null {
  if (!planned || !actual) return null;
  const diff = new Date(actual).getTime() - new Date(planned).getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 2) return { minutes: 0, label: "On time", isLate: false };
  if (mins > 0) {
    return { minutes: mins, label: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m late` : `${mins}m late`, isLate: true };
  }
  const abs = Math.abs(mins);
  return { minutes: abs, label: abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m early` : `${abs}m early`, isLate: false };
}

function formatActivityDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return { date: `${day} ${month} ${year}`, time: `${hours}:${minutes}` };
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────
interface Props {
  task: Task;
  adminId: string;
  onClose: () => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onRefresh: () => void;
}

type TabKey = "overview" | "stops" | "activity" | "comments" | "chat";

export default function TaskDetailPanel({ task, adminId, onClose, onStatusChange, onRefresh }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [stops, setStops] = useState<TaskStop[]>([]);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [formSubs, setFormSubs] = useState<FormSubmission[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(true);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [duplicating, setDuplicating] = useState(false);
  // Live driver location + ETA
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [driverSpeed, setDriverSpeed] = useState<number | null>(null);
  const [driverLastSeen, setDriverLastSeen] = useState<string | null>(null);
  const [eta, setEta] = useState<{ minutes: number; distance: number; toStopName: string } | null>(null);
  const [routeHistory, setRouteHistory] = useState<{ lat: number; lng: number; speed?: number | null; recorded_at: string }[]>([]);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);

  const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
  const StatusIcon = sc.icon;
  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
  const stopsCompleted = task.stops.filter(s => s.status === "completed").length;

  const fetchDetails = useCallback(async () => {
    setLoadingDetail(true);
    const supabase = createClient();
    const [stopsRes, historyRes, commentsRes, formsRes, positionsRes] = await Promise.all([
      supabase.from("task_stops").select("*").eq("task_id", task.id).order("sequence_order"),
      supabase.from("task_status_history").select("*").eq("task_id", task.id).order("created_at", { ascending: false }),
      supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at", { ascending: false }),
      supabase.from("stop_form_submissions").select("*, form:task_forms(name)").eq("task_id", task.id).order("submitted_at", { ascending: false }),
      // Fetch route history: GPS breadcrumbs for this task (sampled - every 5th point to keep it light)
      task.driver?.id
        ? supabase.from("driver_positions")
            .select("lat, lng, speed, recorded_at")
            .eq("task_id", task.id)
            .order("recorded_at", { ascending: true })
            .limit(500)
        : Promise.resolve({ data: null }),
    ]);
    setStops(stopsRes.data || []);
    setHistory(historyRes.data || []);

    // Downsample route history to ~100 points max for performance
    const rawPositions = positionsRes.data || [];
    if (rawPositions.length > 100) {
      const step = Math.ceil(rawPositions.length / 100);
      setRouteHistory(rawPositions.filter((_: any, i: number) => i % step === 0 || i === rawPositions.length - 1));
    } else {
      setRouteHistory(rawPositions);
    }
    setComments(commentsRes.data || []);

    // Enrich form submissions with field definitions (labels, types)
    const rawSubs: FormSubmission[] = formsRes.data || [];
    if (rawSubs.length > 0) {
      const formIds = [...new Set(rawSubs.map(s => s.form_id))];
      const { data: fields } = await supabase
        .from("task_form_fields")
        .select("id, form_id, field_type, label, sort_order")
        .in("form_id", formIds)
        .order("sort_order");
      const fieldsByForm: Record<string, FormField[]> = {};
      for (const f of (fields || [])) {
        if (!fieldsByForm[f.form_id]) fieldsByForm[f.form_id] = [];
        fieldsByForm[f.form_id].push(f);
      }
      for (const sub of rawSubs) {
        sub.fields = fieldsByForm[sub.form_id] || [];
      }
    }
    setFormSubs(rawSubs);
    setLoadingDetail(false);
  }, [task.id]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  // ─── Realtime: task data changes (stops, status history, comments, form submissions) ───
  useEffect(() => {
    const supabase = createClient();
    const taskId = task.id;

    const channel = supabase
      .channel(`task-detail-${taskId}`)
      // Stop status changes (driver arrives, completes, etc.)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "task_stops",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setStops(prev => prev.map(s =>
            s.id === updated.id
              ? {
                  ...s,
                  status: updated.status,
                  actual_arrival: updated.actual_arrival,
                  actual_departure: updated.actual_departure,
                }
              : s
          ));
        }
      )
      // New stop added
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_stops",
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          // Full refetch for new stops (need all fields)
          supabase.from("task_stops").select("*").eq("task_id", taskId).order("sequence_order")
            .then(({ data }) => { if (data) setStops(data); });
        }
      )
      // New activity/status history entry
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_status_history",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const entry = payload.new as StatusHistoryEntry;
          setHistory(prev => [entry, ...prev]);
        }
      )
      // New comments
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const comment = payload.new as Comment;
          setComments(prev => [comment, ...prev]);
        }
      )
      // New form submissions
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stop_form_submissions",
          filter: `task_id=eq.${taskId}`,
        },
        async (payload) => {
          // Need to enrich with form name and field definitions
          const sub = payload.new as any;
          const [{ data: formData }, { data: fields }] = await Promise.all([
            supabase.from("task_forms").select("name").eq("id", sub.form_id).single(),
            supabase.from("task_form_fields").select("id, form_id, field_type, label, sort_order").eq("form_id", sub.form_id).order("sort_order"),
          ]);
          const enriched: FormSubmission = {
            ...sub,
            form: formData,
            fields: fields || [],
          };
          setFormSubs(prev => [enriched, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [task.id]);

  // ─── Live driver location: Realtime + polling fallback (same as Live Map) ───
  useEffect(() => {
    const isActive = task.status === "in_progress" || task.status === "confirmed" || task.status === "scheduled";
    if (!task.driver?.id || !isActive) return;

    const supabase = createClient();
    const driverId = task.driver.id;

    // Shared fetch function - used for initial load AND polling
    const fetchDriverPosition = async () => {
      const [{ data: driver }, { data: positions }] = await Promise.all([
        supabase.from("drivers")
          .select("last_lat, last_lng, last_seen_at")
          .eq("id", driverId)
          .single(),
        supabase.from("driver_positions")
          .select("speed")
          .eq("driver_id", driverId)
          .order("recorded_at", { ascending: false })
          .limit(1),
      ]);

      if (driver?.last_lat && driver?.last_lng) {
        setDriverLat(driver.last_lat);
        setDriverLng(driver.last_lng);
        setDriverLastSeen(driver.last_seen_at);
      }
      if (positions?.[0]?.speed != null) {
        setDriverSpeed(positions[0].speed);
      }
    };

    // Initial fetch
    fetchDriverPosition();

    // Polling every 15s (proven reliable, same as Live Map)
    const interval = setInterval(fetchDriverPosition, 15000);

    // Realtime for instant updates (when available)
    const channel = supabase
      .channel(`driver-pos-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drivers",
          filter: `id=eq.${driverId}`,
        },
        (payload) => {
          const d = payload.new as any;
          if (d.last_lat && d.last_lng) {
            setDriverLat(d.last_lat);
            setDriverLng(d.last_lng);
            setDriverLastSeen(d.last_seen_at);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [task.driver?.id, task.status]);

  // ─── ETA Calculation (Haversine - no API calls) ───
  useEffect(() => {
    if (driverLat == null || driverLng == null || stops.length === 0) {
      setEta(null);
      return;
    }

    // Find the next incomplete stop
    const nextStop = stops.find(s =>
      s.status === "pending" || s.status === "en_route" || s.status === "arrived"
    );
    if (!nextStop || !nextStop.lat || !nextStop.lng) {
      setEta(null);
      return;
    }

    // Haversine formula for straight-line distance in km
    const R = 6371;
    const dLat = ((nextStop.lat - driverLat) * Math.PI) / 180;
    const dLng = ((nextStop.lng - driverLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((driverLat * Math.PI) / 180) * Math.cos((nextStop.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDist = R * c;

    // Road distance is roughly 1.3x straight-line distance
    const roadDist = straightDist * 1.3;

    // Speed: use driver's reported speed (m/s -> km/h), fallback to 40 km/h
    const speedKmh = driverSpeed && driverSpeed > 1 ? driverSpeed * 3.6 : 40;
    const minutes = Math.round((roadDist / speedKmh) * 60);

    setEta({
      minutes: Math.max(1, minutes),
      distance: Math.round(roadDist * 10) / 10,
      toStopName: nextStop.name || `Stop ${nextStop.sequence_order}`,
    });
  }, [driverLat, driverLng, driverSpeed, stops]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    const supabase = createClient();
    await supabase.from("task_comments").insert({
      task_id: task.id,
      author_id: adminId,
      author_type: "admin",
      message: newComment.trim(),
    });
    setNewComment("");
    setSendingComment(false);
    fetchDetails();
    toast({ title: "Comment added" });
  };

  // Navigate to edit page (reuse task/new page with task ID)
  const handleEdit = () => {
    router.push(`/admin/fsm/tasks/new?edit=${task.id}`);
  };

  // Duplicate: create a new draft copying all data
  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const supabase = createClient();
      // Copy task (without id, status becomes draft)
      const { data: newTask, error } = await supabase.from("tasks").insert({
        admin_id: adminId,
        title: `${task.title} (copy)`,
        description: task.description,
        priority: task.priority,
        status: "draft",
        is_draft: true,
        planned_start: task.planned_start,
        planned_end: task.planned_end,
        notes: task.notes,
      }).select("id").single();

      if (error || !newTask) throw error;

      // Copy stops
      if (stops.length > 0) {
        await supabase.from("task_stops").insert(
          stops.map((s) => ({
            task_id: newTask.id,
            sequence_order: s.sequence_order,
            name: s.name,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            estimated_duration_minutes: s.estimated_duration_minutes,
            contact_name: s.contact_name,
            contact_phone: s.contact_phone,
            notes: s.notes,
            stop_form_id: s.stop_form_id,
            time_window_start: s.time_window_start,
            time_window_end: s.time_window_end,
          }))
        );
      }

      toast({ title: "Task duplicated", description: "Opening the copy as a draft..." });
      router.push(`/admin/fsm/tasks/new?edit=${newTask.id}`);
    } catch {
      toast({ title: "Error duplicating task", variant: "destructive" });
    }
    setDuplicating(false);
  };

  // Bulk assign: open dialog to select multiple drivers, duplicate task for each
  const openBulkAssign = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("drivers").select("id, name").eq("admin_id", adminId).eq("status", "active").order("name");
    setDrivers(data || []);
    setSelectedDriverIds([]);
    setBulkDialog(true);
  };

  const handleBulkDuplicate = async () => {
    if (selectedDriverIds.length === 0) return;
    setDuplicating(true);
    try {
      const supabase = createClient();
      for (const driverId of selectedDriverIds) {
        const driverName = drivers.find(d => d.id === driverId)?.name || "";
        const { data: newTask } = await supabase.from("tasks").insert({
          admin_id: adminId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "scheduled",
          is_draft: false,
          driver_id: driverId,
          planned_start: task.planned_start,
          planned_end: task.planned_end,
          notes: task.notes,
        }).select("id").single();

        if (newTask && stops.length > 0) {
          await supabase.from("task_stops").insert(
            stops.map((s) => ({
              task_id: newTask.id,
              sequence_order: s.sequence_order,
              name: s.name,
              address: s.address,
              lat: s.lat,
              lng: s.lng,
              estimated_duration_minutes: s.estimated_duration_minutes,
              contact_name: s.contact_name,
              contact_phone: s.contact_phone,
              notes: s.notes,
              stop_form_id: s.stop_form_id,
              time_window_start: s.time_window_start,
              time_window_end: s.time_window_end,
            }))
          );
        }
      }
      toast({ title: `Assigned to ${selectedDriverIds.length} drivers`, description: "Tasks created and scheduled." });
      setBulkDialog(false);
      onRefresh();
    } catch {
      toast({ title: "Error creating tasks", variant: "destructive" });
    }
    setDuplicating(false);
  };

  const tabs: { key: TabKey; label: string; icon: any; count?: number }[] = [
    { key: "overview", label: "Overview", icon: Route },
    { key: "stops", label: "Stops", icon: MapPin, count: task.stops.length },
    { key: "activity", label: "Activity", icon: History, count: history.length },
    { key: "comments", label: "Comments", icon: MessageSquare, count: comments.length },
    { key: "chat", label: "Chat", icon: MessagesSquare },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ─── Header ─── */}
      <div className="flex-shrink-0 border-b border-border/50 bg-muted/20">
        <div className="flex items-start justify-between p-4 pb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted-foreground tracking-wider">
                {task.reference_number}
              </span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${sc.color}`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {sc.label}
              </Badge>
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${pc.dot}`} />
                <span className={`text-[10px] font-medium ${pc.color}`}>{pc.label}</span>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-foreground leading-tight text-pretty pr-8">
              {task.title}
            </h2>
            {task.task_type && (
              <Badge variant="outline" className="mt-1.5 text-[10px]" style={{ borderColor: task.task_type.color, color: task.task_type.color }}>
                {task.task_type.name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 -mt-1 -mr-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Edit Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openBulkAssign}>
                  <Users className="h-3.5 w-3.5 mr-2" />
                  Assign to Multiple Drivers
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Assignment row */}
        <div className="flex items-center gap-4 px-4 pb-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className={task.driver ? "text-foreground font-medium" : ""}>
              {task.driver?.name || "Unassigned"}
            </span>
          </div>
          {task.vehicle && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Car className="h-3.5 w-3.5" />
              <span className="text-foreground font-medium">{task.vehicle.plate_number}</span>
            </div>
          )}
          {task.customer && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span className="text-foreground font-medium">{task.customer.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground ml-auto">
            <MapPin className="h-3.5 w-3.5" />
            <span>{stopsCompleted}/{task.stops.length} stops</span>
          </div>
        </div>

        {/* Stops progress bar */}
        <div className="px-4 pb-3">
          <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-muted">
            {task.stops.map((s) => {
              const ssc = STOP_STATUS_CONFIG[s.status] || STOP_STATUS_CONFIG.pending;
              const bgMap: Record<string, string> = {
                pending: "bg-muted-foreground/20", en_route: "bg-blue-500", arrived: "bg-cyan-500",
                in_progress: "bg-purple-500", completed: "bg-green-500", skipped: "bg-gray-400", failed: "bg-red-500",
              };
              return <div key={s.id} className={`flex-1 rounded-full transition-all ${bgMap[s.status] || "bg-muted-foreground/20"}`} />;
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-2 border-t border-border/30">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-semibold ${
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Tab Content ─── */}
      <div className="flex-1 overflow-y-auto scroll-smooth">
        {loadingDetail ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Route Map - first thing visible */}
                {stops.filter(s => s.lat && s.lng).length > 0 && (
 <div className="relative group overflow-hidden rounded-none" style={{ isolation: "isolate" }}>
  <RouteMap
                      stops={stops}
                      driverLat={driverLat}
                      driverLng={driverLng}
                      routeHistory={routeHistory}
                      className={`transition-all duration-300 ${mapExpanded ? "h-[300px]" : "h-[160px]"}`}
                    />
                    {/* Map overlay controls - z-[1000] to sit above Leaflet's z-indexes */}
                    <div className="absolute top-2 right-2 flex gap-1 z-[1000]">
                      <button
                        type="button"
                        onClick={() => setMapExpanded(!mapExpanded)}
                        className="h-7 w-7 rounded-md bg-background/90 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-sm"
                        title={mapExpanded ? "Collapse map" : "Expand map"}
                      >
                        {mapExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {/* ETA badge (top-left) - only for active tasks */}
                    {eta && (task.status === "in_progress" || task.status === "confirmed") && (
                      <div className="absolute top-2 left-2 z-[1000] bg-background/95 backdrop-blur border border-primary/30 rounded-lg px-2.5 py-1.5 shadow-md">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-[11px] font-bold text-foreground">{eta.minutes < 60 ? `${eta.minutes} min` : `${Math.floor(eta.minutes / 60)}h ${eta.minutes % 60}m`}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {eta.distance} km to {eta.toStopName}
                        </p>
                      </div>
                    )}

                    {/* Bottom info bar on map */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 z-[1000] pointer-events-none">
                      <div className="bg-background/90 backdrop-blur border border-border/50 rounded-md px-2 py-1 shadow-sm">
                        <span className="text-[10px] font-medium text-foreground">
                          {stops.filter(s => s.lat && s.lng).length} stops
                        </span>
                      </div>
                      {driverLat && driverLastSeen && (
                        <div className="bg-background/90 backdrop-blur border border-border/50 rounded-md px-2 py-1 shadow-sm">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            Updated {timeAgo(driverLastSeen)}
                          </span>
                        </div>
                      )}

                      {/* Route history legend */}
                      {routeHistory && routeHistory.length > 1 && (
                        <div className="bg-background/90 backdrop-blur border border-border/50 rounded-md px-2 py-1 shadow-sm flex items-center gap-1.5">
                          <div className="h-0.5 w-3 bg-purple-500 rounded-full" />
                          <span className="text-[10px] text-muted-foreground">Route traveled</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Live driver status bar - below map for active tasks */}
                {driverLat && (task.status === "in_progress" || task.status === "confirmed") && (
                  <div className="mx-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="h-8 w-8 rounded-full bg-blue-500/15 flex items-center justify-center">
                            <Navigation className="h-4 w-4 text-blue-400" />
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {task.driver?.name || "Driver"} is live
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {driverSpeed && driverSpeed > 1 ? `${Math.round(driverSpeed * 3.6)} km/h` : "Stationary"}
                            {driverLastSeen && ` \u00B7 Updated ${timeAgo(driverLastSeen)}`}
                          </p>
                        </div>
                      </div>
                      {eta && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-400">
                            {eta.minutes < 60 ? `${eta.minutes} min` : `${Math.floor(eta.minutes / 60)}h ${eta.minutes % 60}m`}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{eta.distance} km away</p>
                        </div>
                      )}
                    </div>
                    {eta && (
                      <div className="mt-2 flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-blue-400 flex-shrink-0" />
                        <p className="text-[10px] text-muted-foreground">
                          Next: <span className="text-foreground font-medium">{eta.toStopName}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="px-4 pb-4 space-y-4">
                {/* Description */}
                {task.description && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Description</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{task.description}</p>
                  </div>
                )}

                {/* Time info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Planned</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-foreground">{formatDateTime(task.planned_start)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Timer className="h-3 w-3 text-muted-foreground" />
                        <span className="text-foreground">{formatDateTime(task.planned_end)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Actual</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Calendar className="h-3 w-3 text-green-500/70" />
                        <span className="text-foreground">{formatDateTime(task.actual_start)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Timer className="h-3 w-3 text-green-500/70" />
                        <span className="text-foreground">{formatDateTime(task.actual_end)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stop overview cards */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Route</p>
                  <div className="relative">
                    {stops.map((stop, i) => {
                      const ssc = STOP_STATUS_CONFIG[stop.status] || STOP_STATUS_CONFIG.pending;
                      const isLast = i === stops.length - 1;
                      const isCompleted = stop.status === "completed";
                      return (
                        <div key={stop.id} className="flex gap-3 relative">
                          {/* Timeline connector */}
                          <div className="flex flex-col items-center flex-shrink-0 w-6">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                              isCompleted
                                ? "bg-green-500/20 border-green-500 text-green-400"
                                : stop.status === "in_progress" || stop.status === "arrived" || stop.status === "en_route"
                                ? "bg-blue-500/20 border-blue-500 text-blue-400"
                                : "bg-muted border-border text-muted-foreground"
                            }`}>
                              {isCompleted ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                            {!isLast && (
                              <div className={`w-0.5 flex-1 my-1 ${isCompleted ? "bg-green-500/30" : "bg-border"}`} />
                            )}
                          </div>
                          {/* Stop card */}
                          <div className={`flex-1 rounded-lg border p-3 mb-2 transition-colors ${
                            stop.status === "in_progress" || stop.status === "arrived"
                              ? "border-blue-500/30 bg-blue-500/5"
                              : "border-border/50 bg-muted/10 hover:bg-muted/20"
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{stop.name}</p>
                                {stop.address && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stop.address}</p>
                                )}
                              </div>
                              <span className={`text-[10px] font-medium ${ssc.color}`}>{ssc.label}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                              {stop.planned_arrival && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatDateTime(stop.planned_arrival)}
                                </span>
                              )}
                              {stop.contact_name && (
                                <span className="flex items-center gap-1">
                                  <User className="h-2.5 w-2.5" />
                                  {stop.contact_name}
                                </span>
                              )}
                              {stop.estimated_duration_minutes && (
                                <span className="flex items-center gap-1">
                                  <Timer className="h-2.5 w-2.5" />
                                  {stop.estimated_duration_minutes}min
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                {task.notes && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Notes</p>
                    <p className="text-sm text-foreground/70 leading-relaxed bg-muted/20 rounded-lg p-3 border border-border/50">
                      {task.notes}
                    </p>
                  </div>
                )}

                {/* Form submissions */}
                {formSubs.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Form Submissions</p>
                    <div className="space-y-3">
                      {formSubs.map((fs) => {
                        // Build ordered field entries: match data keys to field definitions
                        const fieldMap = new Map((fs.fields || []).map(f => [f.id, f]));
                        const entries = Object.entries(fs.data)
                          .map(([key, value]) => {
                            const field = fieldMap.get(key);
                            return { key, value, field, sortOrder: field?.sort_order ?? 999, label: field?.label || key, type: field?.field_type || "text" };
                          })
                          .sort((a, b) => a.sortOrder - b.sortOrder);

                        const photoEntries = entries.filter(e => e.type === "photo" || e.type === "file" || (typeof e.value === "string" && /\.(jpg|jpeg|png|gif|webp)/i.test(e.value)));
                        const signatureEntries = entries.filter(e => e.type === "signature" || (typeof e.value === "string" && /signature/i.test(e.value)));
                        const textEntries = entries.filter(e => !photoEntries.includes(e) && !signatureEntries.includes(e));

                        return (
                          <div key={fs.id} className="rounded-lg border border-border/50 bg-muted/10 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20">
                              <span className="text-xs font-medium flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-primary" />
                                {fs.form?.name || "Form"}
                              </span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize border-border/40">
                                  {fs.submitted_by_type}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{timeAgo(fs.submitted_at)}</span>
                              </div>
                            </div>

                            <div className="p-3 space-y-3">
                              {/* Text/value fields */}
                              {textEntries.length > 0 && (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                  {textEntries.map(({ key, value, label, type }) => (
                                    <div key={key} className={type === "textarea" ? "col-span-2" : ""}>
                                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">{label}</p>
                                      {type === "checkbox" || type === "toggle" ? (
                                        <span className={`text-xs font-medium ${value ? "text-green-400" : "text-red-400"}`}>
                                          {value ? "Yes" : "No"}
                                        </span>
                                      ) : type === "rating" ? (
                                        <div className="flex gap-0.5">
                                          {[1,2,3,4,5].map(s => (
                                            <div key={s} className={`h-3 w-3 rounded-sm ${s <= Number(value) ? "bg-amber-400" : "bg-muted"}`} />
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-foreground leading-relaxed">{String(value || "--")}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Photos */}
                              {photoEntries.length > 0 && (
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 flex items-center gap-1">
                                    <ImageIcon className="h-3 w-3" /> Photos
                                  </p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {photoEntries.map(({ key, value, label }) => (
                                      <a key={key} href={String(value)} target="_blank" rel="noopener noreferrer" className="group relative block rounded-lg overflow-hidden border border-border/40 aspect-[4/3] bg-muted/30">
                                        <img src={String(value) || "/placeholder.svg"} alt={label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                          <span className="text-[10px] text-white font-medium flex items-center gap-1">
                                            <ExternalLink className="h-3 w-3" /> {label}
                                          </span>
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Signatures */}
                              {signatureEntries.length > 0 && (
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 flex items-center gap-1">
                                    <PenTool className="h-3 w-3" /> Signatures
                                  </p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {signatureEntries.map(({ key, value, label }) => (
                                      <div key={key} className="rounded-lg border border-border/40 bg-white/5 p-2">
                                        <img src={String(value) || "/placeholder.svg"} alt={label} className="w-full h-16 object-contain" />
                                        <p className="text-[9px] text-muted-foreground text-center mt-1">{label}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}

            {/* Stops Tab */}
            {activeTab === "stops" && (
              <div className="p-4 space-y-2">
                {stops.map((stop, i) => {
                  const ssc = STOP_STATUS_CONFIG[stop.status] || STOP_STATUS_CONFIG.pending;
                  const isCompleted = stop.status === "completed";
                  const isFailed = stop.status === "failed" || stop.status === "skipped";
                  const isActive = stop.status === "in_progress" || stop.status === "arrived" || stop.status === "en_route";
                  const isExpanded = expandedStopId === stop.id;
                  const arrivalDelay = computeDelay(stop.planned_arrival, stop.actual_arrival);
                  const departureDelay = computeDelay(stop.planned_departure, stop.actual_departure);
                  const stopForms = formSubs.filter(fs => fs.stop_id === stop.id);
                  const hasTimeWindow = stop.time_window_start && stop.time_window_end;

                  return (
                    <div
                      key={stop.id}
                      className={`rounded-xl border transition-all overflow-hidden cursor-pointer ${
                        isActive
                          ? "border-blue-500/30 bg-blue-500/5 shadow-sm shadow-blue-500/10"
                          : isCompleted
                          ? "border-green-500/20 bg-green-500/5"
                          : isFailed
                          ? "border-red-500/20 bg-red-500/5"
                          : "border-border/50 bg-muted/10 hover:bg-muted/20"
                      }`}
                      onClick={() => setExpandedStopId(isExpanded ? null : stop.id)}
                    >
                      {/* Stop header - always visible */}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            isCompleted
                              ? "bg-green-500/20 text-green-400"
                              : isFailed
                              ? "bg-red-500/20 text-red-400"
                              : isActive
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {isCompleted ? <CheckCircle className="h-4 w-4" /> : isFailed ? <XCircle className="h-4 w-4" /> : i + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">{stop.name}</p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Delay badge */}
                                {arrivalDelay && arrivalDelay.minutes > 0 && (
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    arrivalDelay.isLate
                                      ? "bg-red-500/15 text-red-400"
                                      : "bg-green-500/15 text-green-400"
                                  }`}>
                                    {arrivalDelay.label}
                                  </span>
                                )}
                                <Badge variant="outline" className={`text-[10px] ${ssc.color} border-current/20`}>{ssc.label}</Badge>
                                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </div>
                            </div>
                            {stop.address && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stop.address}</p>
                            )}

                            {/* Compact time comparison - always visible */}
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              {stop.planned_arrival && (
                                <div className="text-[10px] flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">Planned:</span>
                                  <span className="text-foreground font-medium">{formatDateTime(stop.planned_arrival)}</span>
                                </div>
                              )}
                              {stop.actual_arrival && (
                                <div className="text-[10px] flex items-center gap-1">
                                  <CheckCircle className="h-2.5 w-2.5 text-green-500/70" />
                                  <span className="text-muted-foreground">Actual:</span>
                                  <span className={`font-medium ${arrivalDelay?.isLate ? "text-red-400" : "text-green-400"}`}>
                                    {formatDateTime(stop.actual_arrival)}
                                  </span>
                                </div>
                              )}
                              {stop.estimated_duration_minutes && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Timer className="h-2.5 w-2.5" />{stop.estimated_duration_minutes}min
                                </span>
                              )}
                              {stopForms.length > 0 && (
                                <span className="text-[10px] text-primary flex items-center gap-1">
                                  <FileText className="h-2.5 w-2.5" />{stopForms.length} form{stopForms.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                          {/* Planned vs Actual comparison table */}
                          <div className="rounded-lg border border-border/40 overflow-hidden">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="bg-muted/20">
                                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground" />
                                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Planned</th>
                                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Actual</th>
                                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Diff</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t border-border/20">
                                  <td className="px-3 py-2 text-muted-foreground font-medium">Arrival</td>
                                  <td className="px-3 py-2 text-foreground">{stop.planned_arrival ? formatDateTime(stop.planned_arrival) : "--"}</td>
                                  <td className="px-3 py-2 text-foreground">{stop.actual_arrival ? formatDateTime(stop.actual_arrival) : "--"}</td>
                                  <td className="px-3 py-2">
                                    {arrivalDelay ? (
                                      <span className={`font-semibold ${
                                        arrivalDelay.minutes === 0 ? "text-green-400" :
                                        arrivalDelay.isLate ? "text-red-400" : "text-green-400"
                                      }`}>
                                        {arrivalDelay.label}
                                      </span>
                                    ) : <span className="text-muted-foreground/50">--</span>}
                                  </td>
                                </tr>
                                <tr className="border-t border-border/20">
                                  <td className="px-3 py-2 text-muted-foreground font-medium">Departure</td>
                                  <td className="px-3 py-2 text-foreground">{stop.planned_departure ? formatDateTime(stop.planned_departure) : "--"}</td>
                                  <td className="px-3 py-2 text-foreground">{stop.actual_departure ? formatDateTime(stop.actual_departure) : "--"}</td>
                                  <td className="px-3 py-2">
                                    {departureDelay ? (
                                      <span className={`font-semibold ${
                                        departureDelay.minutes === 0 ? "text-green-400" :
                                        departureDelay.isLate ? "text-red-400" : "text-green-400"
                                      }`}>
                                        {departureDelay.label}
                                      </span>
                                    ) : <span className="text-muted-foreground/50">--</span>}
                                  </td>
                                </tr>
                                {hasTimeWindow && (
                                  <tr className="border-t border-border/20">
                                    <td className="px-3 py-2 text-muted-foreground font-medium">Time Window</td>
                                    <td colSpan={3} className="px-3 py-2 text-foreground">
                                      {formatDateTime(stop.time_window_start)} - {formatDateTime(stop.time_window_end)}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Contact info */}
                          {(stop.contact_name || stop.contact_phone) && (
                            <div className="flex items-center gap-4 flex-wrap">
                              {stop.contact_name && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                  <User className="h-3 w-3" />{stop.contact_name}
                                </span>
                              )}
                              {stop.contact_phone && (
                                <a href={`tel:${stop.contact_phone}`} className="text-xs text-primary flex items-center gap-1.5 hover:underline">
                                  <Phone className="h-3 w-3" />{stop.contact_phone}
                                </a>
                              )}
                            </div>
                          )}

                          {stop.notes && (
                            <p className="text-xs text-muted-foreground/80 italic bg-muted/20 rounded-md px-3 py-2">{stop.notes}</p>
                          )}

                          {/* Form submissions for this stop */}
                          {stopForms.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                                <FileText className="h-3 w-3" /> Form Submissions ({stopForms.length})
                              </p>
                              <div className="space-y-2">
                                {stopForms.map((fs) => {
                                  const fieldMap = new Map((fs.fields || []).map(f => [f.id, f]));
                                  const entries = Object.entries(fs.data)
                                    .map(([key, value]) => {
                                      const field = fieldMap.get(key);
                                      return { key, value, field, sortOrder: field?.sort_order ?? 999, label: field?.label || key, type: field?.field_type || "text" };
                                    })
                                    .sort((a, b) => a.sortOrder - b.sortOrder);

                                  const photoEntries = entries.filter(e => e.type === "photo" || e.type === "file" || (typeof e.value === "string" && /\.(jpg|jpeg|png|gif|webp)/i.test(e.value)));
                                  const signatureEntries = entries.filter(e => e.type === "signature" || (typeof e.value === "string" && /signature/i.test(e.value)));
                                  const textEntries = entries.filter(e => !photoEntries.includes(e) && !signatureEntries.includes(e));

                                  return (
                                    <div key={fs.id} className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
                                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 bg-muted/15">
                                        <span className="text-[10px] font-medium flex items-center gap-1">
                                          <FileText className="h-3 w-3 text-primary" />
                                          {fs.form?.name || "Form"}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground">{timeAgo(fs.submitted_at)}</span>
                                      </div>
                                      <div className="p-3 space-y-2">
                                        {textEntries.length > 0 && (
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                            {textEntries.map(({ key, value, label, type }) => (
                                              <div key={key} className={type === "textarea" ? "col-span-2" : ""}>
                                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</p>
                                                {type === "checkbox" || type === "toggle" ? (
                                                  <span className={`text-[11px] font-medium ${value ? "text-green-400" : "text-red-400"}`}>
                                                    {value ? "Yes" : "No"}
                                                  </span>
                                                ) : type === "rating" ? (
                                                  <div className="flex gap-0.5">
                                                    {[1,2,3,4,5].map(s => (
                                                      <div key={s} className={`h-2.5 w-2.5 rounded-sm ${s <= Number(value) ? "bg-amber-400" : "bg-muted"}`} />
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-[11px] text-foreground">{String(value || "--")}</p>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {photoEntries.length > 0 && (
                                          <div className="grid grid-cols-3 gap-1.5">
                                            {photoEntries.map(({ key, value, label }) => (
                                              <a key={key} href={String(value)} target="_blank" rel="noopener noreferrer" className="group relative block rounded-md overflow-hidden border border-border/30 aspect-square bg-muted/30">
                                                <img src={String(value) || "/placeholder.svg"} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                        {signatureEntries.length > 0 && (
                                          <div className="flex gap-2">
                                            {signatureEntries.map(({ key, value, label }) => (
                                              <div key={key} className="rounded-md border border-border/30 bg-white/5 p-1.5 flex-1">
                                                <img src={String(value) || "/placeholder.svg"} alt={label} className="w-full h-12 object-contain" />
                                                <p className="text-[8px] text-muted-foreground text-center mt-0.5">{label}</p>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {stopForms.length === 0 && (isCompleted || isFailed) && (
                            <p className="text-xs text-muted-foreground/50 italic">No forms submitted for this stop</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {stops.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No stops configured for this task
                  </div>
                )}
              </div>
            )}

            {/* Activity Tab */}
            {activeTab === "activity" && (
              <div className="p-4">
                <div className="relative">
                  {history.map((entry, i) => {
                    const toSc = STATUS_CONFIG[entry.to_status] || STATUS_CONFIG.draft;
                    const fromSc = entry.from_status ? STATUS_CONFIG[entry.from_status] : null;
                    const isLast = i === history.length - 1;
                    const ts = formatActivityDate(entry.created_at);
                    const StatusIcon = toSc.icon;
                    return (
                      <div key={entry.id} className="flex gap-3 relative">
                        {/* Timeline dot + line */}
                        <div className="flex flex-col items-center flex-shrink-0 w-6">
                          <div className={`h-6 w-6 rounded-full mt-0.5 flex items-center justify-center ${toSc.bgClass}/20`}>
                            <StatusIcon className={`h-3 w-3 ${toSc.bgClass.replace('bg-', 'text-')}`} />
                          </div>
                          {!isLast && <div className="w-0.5 flex-1 bg-border/40 my-1" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-5 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-foreground leading-tight">
                                {entry.from_status ? (
                                  <>
                                    <span className={fromSc?.color?.split(' ')[1] || "text-muted-foreground"}>{fromSc?.label || entry.from_status}</span>
                                    <ChevronRight className="h-3 w-3 inline mx-0.5 text-muted-foreground/40" />
                                    <span className={toSc.color.split(' ')[1]}>{toSc.label}</span>
                                  </>
                                ) : (
                                  <>Task created as <span className={toSc.color.split(' ')[1]}>{toSc.label}</span></>
                                )}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-muted-foreground/70">by</span>
                                <span className="text-[10px] font-medium text-muted-foreground capitalize">{entry.changed_by_type}</span>
                              </div>
                            </div>

                            {/* Timestamp: date + time + relative */}
                            <div className="flex-shrink-0 text-right">
                              <p className="text-[11px] font-medium text-foreground/80">{ts.time}</p>
                              <p className="text-[10px] text-muted-foreground/60">{ts.date}</p>
                            </div>
                          </div>

                          {/* Relative time */}
                          <p className="text-[10px] text-muted-foreground/40 mt-0.5">{timeAgo(entry.created_at)}</p>

                          {entry.notes && (
                            <p className="text-xs text-muted-foreground mt-1.5 bg-muted/20 border border-border/30 rounded-md px-2.5 py-1.5 leading-relaxed">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {history.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      No activity recorded yet
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === "comments" && (
              <div className="p-4 space-y-3">
                {/* Comment input */}
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="min-h-[60px] bg-transparent border-0 p-0 text-sm resize-none focus-visible:ring-0 shadow-none"
                  />
                  <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/30">
                    <Button
                      size="sm"
                      disabled={!newComment.trim() || sendingComment}
                      onClick={addComment}
                      className="h-7 text-xs"
                    >
                      <Send className="h-3 w-3 mr-1" />
                      {sendingComment ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>

                {/* Comments list */}
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          c.author_type === "admin" ? "bg-primary/20 text-primary" : "bg-cyan-500/20 text-cyan-400"
                        }`}>
                          {c.author_type === "admin" ? "A" : "D"}
                        </div>
                        <span className="text-xs font-medium capitalize">{c.author_type}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{c.message}</p>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No comments yet. Start the conversation above.
                  </div>
                )}
              </div>
            )}
          </>
        )}

            {/* Chat Tab */}
            {activeTab === "chat" && (
              <div className="flex-1 min-h-0">
<TaskChat
  taskId={task.id}
  taskReference={task.reference_number}
  currentUserId={adminId}
  currentUserType="admin"
  currentUserName="Admin"
  driverId={task.driver?.id}
  driverName={task.driver?.name}
  />
              </div>
            )}
      </div>

      {/* ─── Footer Actions ─── */}
      <div className="flex-shrink-0 border-t border-border/50 bg-muted/20 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {task.status === "draft" && (
            <Button size="sm" variant="outline" className="text-xs bg-transparent" onClick={() => onStatusChange(task.id, "not_assigned")}>
              Publish
            </Button>
          )}
          {(task.status === "not_assigned" || task.status === "scheduled") && task.driver && (
            <Button size="sm" className="text-xs" onClick={() => onStatusChange(task.id, "dispatched")}>
              <Send className="h-3 w-3 mr-1" />Dispatch
            </Button>
          )}
          {task.status === "dispatched" && (
            <Button size="sm" variant="outline" className="text-xs bg-transparent" onClick={() => onStatusChange(task.id, "scheduled")}>
              <Calendar className="h-3 w-3 mr-1" />Schedule
            </Button>
          )}
          {task.status === "in_progress" && (
            <>
              <Button size="sm" variant="outline" className="text-xs text-green-500 border-green-500/30 hover:bg-green-500/10 bg-transparent" onClick={() => onStatusChange(task.id, "completed")}>
                <CheckCircle className="h-3 w-3 mr-1" />Complete
              </Button>
              <Button size="sm" variant="outline" className="text-xs text-red-500 border-red-500/30 hover:bg-red-500/10 bg-transparent" onClick={() => onStatusChange(task.id, "failed")}>
                <XCircle className="h-3 w-3 mr-1" />Failed
              </Button>
            </>
          )}
          {!["completed", "failed", "cancelled"].includes(task.status) && (
            <Button size="sm" variant="ghost" className="text-xs text-muted-foreground ml-auto" onClick={() => onStatusChange(task.id, "cancelled")}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {/* ─── Bulk Assign Dialog ─── */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Assign to Multiple Drivers
            </DialogTitle>
            <DialogDescription>
              Duplicate this task and assign each copy to the selected drivers. All stops and settings will be copied.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs text-muted-foreground">Select drivers to assign:</Label>
            <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/30">
              {drivers.map((d) => {
                const isSelected = selectedDriverIds.includes(d.id);
                const isCurrentDriver = d.id === task.driver?.id;
                return (
                  <label
                    key={d.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedDriverIds(prev =>
                          e.target.checked ? [...prev, d.id] : prev.filter(id => id !== d.id)
                        );
                      }}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                        {d.name[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm font-medium truncate">{d.name}</span>
                    </div>
                    {isCurrentDriver && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary flex-shrink-0">current</Badge>
                    )}
                  </label>
                );
              })}
              {drivers.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No active drivers found
                </div>
              )}
            </div>
            {selectedDriverIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedDriverIds.length} driver{selectedDriverIds.length !== 1 ? "s" : ""} selected - {selectedDriverIds.length} task{selectedDriverIds.length !== 1 ? "s" : ""} will be created
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(false)} className="bg-transparent">Cancel</Button>
            <Button
              disabled={selectedDriverIds.length === 0 || duplicating}
              onClick={handleBulkDuplicate}
            >
              {duplicating ? "Creating..." : `Assign to ${selectedDriverIds.length || 0} Drivers`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
