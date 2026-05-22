"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import TaskDetailPanel from "@/components/fsm/task-detail-panel";
import TaskCalendarView from "@/components/fsm/task-calendar-view";

import {
  Plus, Search, Filter, Clock, User, Car, MapPin, ChevronRight,
  AlertCircle, CheckCircle, XCircle, PlayCircle, PauseCircle,
  Send, MoreHorizontal, Eye, BarChart3, Calendar, Truck, PanelRightClose,
} from "lucide-react";

interface AdminSession { id: string; email: string; company_name: string | null; }

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
  is_draft: boolean;
  created_at: string;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate_number: string } | null;
  customer: { id: string; name: string } | null;
  task_type: { id: string; name: string; color: string } | null;
  stops: { id: string; name: string; status: string; sequence_order: number }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: PauseCircle },
  not_assigned: { label: "Not Assigned", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: AlertCircle },
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: Calendar },
  dispatched: { label: "Dispatched", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", icon: Send },
  confirmed: { label: "Confirmed", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", icon: CheckCircle },
  in_progress: { label: "In Progress", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", icon: PlayCircle },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400", icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600",
  high: "text-orange-500",
  normal: "text-foreground",
  low: "text-muted-foreground",
};

export default function TasksListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "board" | "calendar">("table");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [panelWidth, setPanelWidth] = useState<number>(typeof window !== "undefined" ? Math.round(window.innerWidth * 0.45) : 680);

  // Sync selected task to URL for deep-linking
  const selectTask = useCallback((task: Task | null) => {
    setSelectedTask(task);
    const url = new URL(window.location.href);
    if (task) {
      url.searchParams.set("task", task.id);
    } else {
      url.searchParams.delete("task");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;
    setLoading(true);
    const supabase = createClient();

    const [tasksRes, driversRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(`
          *,
          driver:drivers!tasks_driver_id_fkey(id, name),
          vehicle:vehicles!tasks_vehicle_id_fkey(id, plate_number),
          customer:business_partners!tasks_customer_id_fkey(id, name),
          task_type:task_types!tasks_task_type_id_fkey(id, name, color),
          stops:task_stops(id, name, status, sequence_order)
        `)
        .eq("admin_id", adminSession.id)
        .order("created_at", { ascending: false }),
      supabase.from("drivers").select("id, name").eq("admin_id", adminSession.id).eq("is_active", true).order("name"),
    ]);

    const data = (tasksRes.data || []).map((t: any) => ({
      ...t,
      stops: (t.stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
    }));
    setTasks(data);
    setDrivers(driversRes.data || []);
    setLoading(false);
  }, [adminSession?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Restore selected task from URL ?task=<id> on initial load
  useEffect(() => {
    if (tasks.length === 0) return;
    const url = new URL(window.location.href);
    const taskId = url.searchParams.get("task");
    if (taskId && !selectedTask) {
      const found = tasks.find(t => t.id === taskId);
      if (found) setSelectedTask(found);
    }
  }, [tasks, selectedTask]);

  useEffect(() => {
    if (!adminSession?.id) return;
    const supabase = createClient();

    const channel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `admin_id=eq.${adminSession.id}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const n = payload.new as any;
            const patch = {
              status: n.status,
              is_draft: n.is_draft,
              actual_start: n.actual_start,
              actual_end: n.actual_end,
              planned_start: n.planned_start,
              planned_end: n.planned_end,
              priority: n.priority,
              title: n.title,
              description: n.description,
              notes: n.notes,
              driver_id: n.driver_id,
            };
            setTasks(prev => prev.map(t =>
              t.id === n.id ? { ...t, ...patch } : t
            ));
            setSelectedTask(prev =>
              prev?.id === n.id ? { ...prev, ...patch } : prev
            );
          } else if (payload.eventType === "INSERT" || payload.eventType === "DELETE") {
            fetchData();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_stops",
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            // Update stop status inline in the tasks list (for stop count badge)
            const updatedStop = payload.new as any;
            setTasks(prev => prev.map(t => ({
              ...t,
              stops: t.stops?.map((s: any) =>
                s.id === updatedStop.id
                  ? { ...s, status: updatedStop.status, actual_arrival: updatedStop.actual_arrival, actual_departure: updatedStop.actual_departure }
                  : s
              ) || [],
            })));
          } else {
            // INSERT or DELETE - full refresh needed
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminSession?.id, fetchData]);

  const changeStatus = async (taskId: string, newStatus: string) => {
    const supabase = createClient();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    await supabase.from("tasks").update({
      status: newStatus,
      is_draft: newStatus === "draft",
      ...(newStatus === "in_progress" && !task.actual_start ? { actual_start: new Date().toISOString() } : {}),
      ...(newStatus === "completed" || newStatus === "failed" || newStatus === "cancelled" ? { actual_end: new Date().toISOString() } : {}),
    }).eq("id", taskId);

    await supabase.from("task_status_history").insert({
      task_id: taskId,
      from_status: task.status,
      to_status: newStatus,
      changed_by: adminSession?.id,
      changed_by_type: "admin",
    });

    try {
      const statusLabels: Record<string, string> = {
        dispatched: "dispatched", scheduled: "scheduled", confirmed: "accepted",
        in_progress: "started", completed: "completed", failed: "failed", cancelled: "cancelled",
      };
      const eventMap: Record<string, string> = {
        dispatched: "task.dispatched", scheduled: "task.dispatched",
        confirmed: "task.accepted", in_progress: "task.started",
        completed: "task.completed", failed: "task.failed", cancelled: "task.cancelled",
      };
      await fetch("/api/notifications/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventMap[newStatus] || "task.created",
          title: `Task ${statusLabels[newStatus] || newStatus}`,
          body: `${task.reference_number}: ${task.title} is now ${statusLabels[newStatus] || newStatus}`,
          icon: newStatus === "completed" ? "check-circle" : newStatus === "failed" ? "x-circle" : "route",
          actionUrl: "/admin/fsm/tasks",
          data: { type: `task_${newStatus}`, task_id: taskId, from_status: task.status, to_status: newStatus },
          adminId: adminSession?.id,
          module: "fsm",
          entityType: "task",
          entityId: taskId,
          triggeredBy: adminSession?.id,
          recipientDriverIds: task.driver?.id ? [task.driver.id] : [],
          priority: newStatus === "failed" ? "urgent" : "normal",
        }),
      });
    } catch { /* non-blocking */ }

    toast({ title: `Status changed to ${STATUS_CONFIG[newStatus]?.label || newStatus}` });
    fetchData();
  };

  const filtered = tasks.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (driverFilter !== "all" && t.driver?.id !== driverFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) ||
        t.reference_number?.toLowerCase().includes(q) ||
        t.driver?.name?.toLowerCase().includes(q) ||
        t.vehicle?.plate_number?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedTasks = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, driverFilter]);

  const stats = {
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    scheduled: tasks.filter(t => t.status === "scheduled" || t.status === "dispatched" || t.status === "confirmed").length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed: tasks.filter(t => t.status === "failed").length,
  };

  const boardColumns = [
    { key: "not_assigned", statuses: ["draft", "not_assigned"] },
    { key: "scheduled", statuses: ["scheduled", "dispatched", "confirmed"] },
    { key: "in_progress", statuses: ["in_progress"] },
    { key: "done", statuses: ["completed", "failed", "cancelled"] },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const handleStatusChange = (taskId: string, newStatus: string) => {
    // Optimistic update: immediately update local state so UI stays responsive
    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      status: newStatus,
      is_draft: newStatus === "draft",
    };
    const task = tasks.find(t => t.id === taskId);
    if (newStatus === "in_progress" && !task?.actual_start) patch.actual_start = now;
    if (["completed", "failed", "cancelled"].includes(newStatus)) patch.actual_end = now;

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
    setSelectedTask(prev => prev?.id === taskId ? { ...prev, ...patch } : prev);

    // Then persist to DB (realtime will reconcile if needed)
    changeStatus(taskId, newStatus);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden -m-6">
      <div className={`flex-1 min-w-0 overflow-y-auto transition-all duration-300 ease-in-out ${
        selectedTask ? "border-r border-border/50" : ""
      }`}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
              <p className="text-muted-foreground text-sm">{filtered.length === stats.total ? `${stats.total} tasks total` : `${filtered.length} of ${stats.total} tasks`}</p>
            </div>
            <Link href="/admin/fsm/tasks/new">
              <Button><Plus className="h-4 w-4 mr-2" />New Task</Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("all")}>
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("scheduled")}>
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">{stats.scheduled}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("in_progress")}>
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-purple-600">{stats.inProgress}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("completed")}>
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("failed")}>
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Driver" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button size="sm" variant={viewMode === "table" ? "secondary" : "ghost"} onClick={() => setViewMode("table")} title="List view">
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={viewMode === "board" ? "secondary" : "ghost"} onClick={() => setViewMode("board")} title="Board view">
                <Filter className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={viewMode === "calendar" ? "secondary" : "ghost"} onClick={() => setViewMode("calendar")} title="Calendar view">
                <Calendar className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {viewMode === "table" ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Stops</TableHead>
                    <TableHead>Planned</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No tasks found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTasks.map((task) => {
                      const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
                      const StatusIcon = sc.icon;
                      const stopsCompleted = task.stops.filter(s => s.status === "completed").length;
                      return (
                        <TableRow key={task.id} className={`cursor-pointer transition-colors ${selectedTask?.id === task.id ? "bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"}`} onClick={() => selectTask(task)}>
                          <TableCell className="font-mono text-xs">{task.reference_number}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{task.title}</p>
                              {task.task_type && (
                                <Badge variant="outline" className="text-xs mt-0.5" style={{ borderColor: task.task_type.color, color: task.task_type.color }}>
                                  {task.task_type.name}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs gap-1 ${sc.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium capitalize ${PRIORITY_COLORS[task.priority]}`}>
                              {task.priority}
                            </span>
                          </TableCell>
                          <TableCell>
                            {task.driver ? (
                              <span className="flex items-center gap-1 text-sm">
                                <User className="h-3.5 w-3.5" />{task.driver.name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.vehicle ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Car className="h-3.5 w-3.5" />{task.vehicle.plate_number}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {stopsCompleted}/{task.stops.length}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {task.planned_start ? new Date(task.planned_start).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              {task.status === "draft" && (
                                <Button size="sm" variant="outline" onClick={() => changeStatus(task.id, "not_assigned")}>
                                  Publish
                                </Button>
                              )}
                              {task.status === "not_assigned" && task.driver && (
                                <Button size="sm" variant="outline" onClick={() => changeStatus(task.id, "dispatched")}>
                                  <Send className="h-3 w-3 mr-1" />Dispatch
                                </Button>
                              )}
                              {task.status === "scheduled" && (
                                <Button size="sm" variant="outline" onClick={() => changeStatus(task.id, "dispatched")}>
                                  <Send className="h-3 w-3 mr-1" />Dispatch
                                </Button>
                              )}
                              {(task.status === "in_progress") && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => changeStatus(task.id, "completed")} className="text-green-600">
                                    <CheckCircle className="h-3 w-3 mr-1" />Complete
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => changeStatus(task.id, "failed")} className="text-red-600">
                                    <XCircle className="h-3 w-3 mr-1" />Fail
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} tasks
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(1)}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      Prev
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .reduce((acc: (number | string)[], p, idx, arr) => {
                        if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                          acc.push("...");
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        typeof p === "string" ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
                        ) : (
                          <Button
                            key={p}
                            variant={currentPage === p ? "default" : "outline"}
                            size="sm"
                            className="h-7 w-7 p-0 text-xs"
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ) : viewMode === "board" ? (
            <div className="grid grid-cols-4 gap-4">
              {boardColumns.map((col) => {
                const colTasks = filtered.filter(t => col.statuses.includes(t.status));
                return (
                  <div key={col.key} className="space-y-2">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-sm font-medium capitalize">{col.key.replace("_", " ")}</h3>
                      <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                    </div>
                    <div className="space-y-2 min-h-[200px]">
                      {colTasks.map((task) => {
                        const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
                        return (
                          <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => selectTask(task)}>
                            <CardContent className="py-3 px-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <p className="text-xs font-mono text-muted-foreground">{task.reference_number}</p>
                                <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                              </div>
                              <p className="text-sm font-medium line-clamp-2">{task.title}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {task.driver && (
                                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{task.driver.name}</span>
                                )}
                                {task.stops.length > 0 && (
                                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{task.stops.length}</span>
                                )}
                              </div>
                              <span className={`text-xs font-medium capitalize ${PRIORITY_COLORS[task.priority]}`}>
                                {task.priority}
                              </span>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1">
              <TaskCalendarView
                tasks={filtered}
                onTaskClick={selectTask}
                selectedTaskId={selectedTask?.id}
              />
            </div>
          )}
        </div>
      </div>

      {selectedTask && (
        <div
          className="flex-shrink-0 transition-all duration-300 ease-in-out border-l border-border/40 relative"
          style={{ width: panelWidth }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/30 active:bg-primary/50 transition-colors group"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = panelWidth;
              const onMouseMove = (ev: MouseEvent) => {
                const delta = startX - ev.clientX;
                const maxW = Math.round(window.innerWidth * 0.65);
                const newW = Math.max(420, Math.min(maxW, startWidth + delta));
                setPanelWidth(newW);
              };
              const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
              };
              document.addEventListener("mousemove", onMouseMove);
              document.addEventListener("mouseup", onMouseUp);
            }}
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
          </div>

          <div className="h-full shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]">
            <TaskDetailPanel
              key={selectedTask.id}
              task={selectedTask}
              adminId={adminSession?.id || ""}
              onClose={() => selectTask(null)}
              onStatusChange={handleStatusChange}
              onRefresh={fetchData}
            />
          </div>
        </div>
      )}
    </div>
  );
}
