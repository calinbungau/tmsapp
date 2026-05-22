"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TaskDetailPanel from "@/components/fsm/task-detail-panel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function TaskByIdPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adminSession, setAdminSession] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem("admin_session");
    if (!stored) { router.push("/admin/login"); return; }
    setAdminSession(JSON.parse(stored));
  }, [router]);

  const fetchTask = useCallback(async () => {
    if (!adminSession?.id || !taskId) return;
    const supabase = createClient();
    setLoading(true);

    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        driver:drivers(id, name),
        vehicle:vehicles(id, plate_number),
        customer:customers(id, name),
        task_type:task_types(id, name, color),
        stops:task_stops(id, name, status, sequence_order)
      `)
      .eq("id", taskId)
      .eq("admin_id", adminSession.id)
      .single();

    if (error || !data) {
      setLoading(false);
      return;
    }

    setTask({
      ...data,
      stops: (data.stops || []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
    });
    setLoading(false);
  }, [adminSession?.id, taskId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  // Realtime: update task prop when status/fields change
  useEffect(() => {
    if (!taskId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`task-page-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          setTask((prev: any) => prev ? {
            ...prev,
            status: payload.new.status,
            is_draft: payload.new.is_draft,
            actual_start: payload.new.actual_start,
            actual_end: payload.new.actual_end,
            planned_start: payload.new.planned_start,
            planned_end: payload.new.planned_end,
            priority: payload.new.priority,
          } : prev);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_stops",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTask((prev: any) => prev ? {
              ...prev,
              stops: prev.stops.map((s: any) =>
                s.id === payload.new.id ? { ...s, status: payload.new.status } : s
              ),
            } : prev);
          } else {
            fetchTask();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, fetchTask]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Task not found or you don't have access.</p>
        <Button variant="outline" className="bg-transparent" onClick={() => router.push("/admin/fsm/tasks")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-card/50 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/fsm/tasks")}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Tasks
        </Button>
        <span className="text-xs text-muted-foreground/50">|</span>
        <span className="text-xs text-muted-foreground font-mono">{task.reference_number}</span>
      </div>

      {/* Full-width detail panel */}
      <div className="flex-1 overflow-hidden max-w-3xl mx-auto w-full">
        <TaskDetailPanel
          key={task.id}
          task={task}
          adminId={adminSession?.id || ""}
          onClose={() => router.push("/admin/fsm/tasks")}
          onStatusChange={async () => { await fetchTask(); }}
          onRefresh={fetchTask}
        />
      </div>
    </div>
  );
}
