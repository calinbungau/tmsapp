"use client";

import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Clock, User, MapPin,
  CheckCircle, XCircle, PlayCircle, PauseCircle,
  AlertCircle, Calendar, Send,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────
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

interface TaskCalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  selectedTaskId?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; bgColor: string; icon: any }> = {
  draft:        { label: "Draft",        dotColor: "bg-gray-400",   bgColor: "bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700",       icon: PauseCircle },
  not_assigned: { label: "Not Assigned", dotColor: "bg-amber-400",  bgColor: "bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", icon: AlertCircle },
  scheduled:    { label: "Scheduled",    dotColor: "bg-blue-400",   bgColor: "bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",     icon: Calendar },
  dispatched:   { label: "Dispatched",   dotColor: "bg-indigo-400", bgColor: "bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800", icon: Send },
  confirmed:    { label: "Confirmed",    dotColor: "bg-cyan-400",   bgColor: "bg-cyan-50/60 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800",     icon: CheckCircle },
  in_progress:  { label: "In Progress",  dotColor: "bg-purple-400", bgColor: "bg-purple-50/60 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800", icon: PlayCircle },
  completed:    { label: "Completed",    dotColor: "bg-green-400",  bgColor: "bg-green-50/60 dark:bg-green-950/30 border-green-200 dark:border-green-800", icon: CheckCircle },
  failed:       { label: "Failed",       dotColor: "bg-red-400",    bgColor: "bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-800",         icon: XCircle },
  cancelled:    { label: "Cancelled",    dotColor: "bg-gray-300",   bgColor: "bg-gray-50/60 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700",     icon: XCircle },
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  normal: "bg-foreground/20",
  low: "bg-muted-foreground/30",
};

// ─── Helpers ────────────────────────────────────────
function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateHeader(d: Date): { day: string; weekday: string; month: string } {
  return {
    day: d.getDate().toString(),
    weekday: d.toLocaleDateString([], { weekday: "short" }),
    month: d.toLocaleDateString([], { month: "short" }),
  };
}

function getTaskDate(task: Task): Date | null {
  const dateStr = task.planned_start || task.actual_start || task.created_at;
  if (!dateStr) return null;
  return new Date(dateStr);
}

// ─── Hours scale ────────────────────────────────────
const HOUR_START = 5;  // 05:00
const HOUR_END = 23;   // 23:00
const TOTAL_HOURS = HOUR_END - HOUR_START;
const HOUR_HEIGHT = 64; // px per hour

function getTopPosition(dateStr: string): number {
  const d = new Date(dateStr);
  const hours = d.getHours() + d.getMinutes() / 60;
  const clamped = Math.max(HOUR_START, Math.min(HOUR_END, hours));
  return (clamped - HOUR_START) * HOUR_HEIGHT;
}

function getTaskHeight(task: Task): number {
  const start = task.planned_start || task.actual_start;
  const end = task.planned_end || task.actual_end;
  if (!start || !end) return HOUR_HEIGHT * 0.75; // default 45min block
  const startD = new Date(start);
  const endD = new Date(end);
  const durationHours = (endD.getTime() - startD.getTime()) / (1000 * 60 * 60);
  return Math.max(32, Math.min(durationHours * HOUR_HEIGHT, TOTAL_HOURS * HOUR_HEIGHT));
}

// ─── Component ──────────────────────────────────────
export default function TaskCalendarView({ tasks, onTaskClick, selectedTaskId }: TaskCalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const today = new Date();

  // Group tasks by day
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const day of weekDays) {
      map.set(day.toDateString(), []);
    }
    for (const task of tasks) {
      const d = getTaskDate(task);
      if (!d) continue;
      // Check if task spans multiple days
      const taskEnd = task.planned_end ? new Date(task.planned_end) : d;
      for (const day of weekDays) {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);
        if (d <= dayEnd && taskEnd >= dayStart) {
          const key = day.toDateString();
          const existing = map.get(key) || [];
          existing.push(task);
          map.set(key, existing);
        }
      }
    }
    return map;
  }, [tasks, weekDays]);

  // "Unscheduled" tasks (no planned_start)
  const unscheduledTasks = useMemo(() => {
    return tasks.filter(t => !t.planned_start && !t.actual_start);
  }, [tasks]);

  const goToday = () => setWeekStart(getMonday(new Date()));
  const goPrev = () => setWeekStart(addDays(weekStart, -7));
  const goNext = () => setWeekStart(addDays(weekStart, 7));

  // Week label
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.toLocaleDateString([], { month: "long", day: "numeric" })} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    : `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString([], { month: "short", day: "numeric" })}, ${weekEnd.getFullYear()}`;

  return (
    <div className="flex flex-col h-full">
      {/* ─── Week navigation ─── */}
      <div className="flex items-center justify-between px-1 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday} className="text-xs h-7 bg-transparent">
            Today
          </Button>
          <div className="flex items-center border rounded-md">
            <Button variant="ghost" size="sm" onClick={goPrev} className="h-7 w-7 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goNext} className="h-7 w-7 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-sm font-semibold">{weekLabel}</span>
        </div>
        {unscheduledTasks.length > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <AlertCircle className="h-3 w-3" />
            {unscheduledTasks.length} unscheduled
          </Badge>
        )}
      </div>

      {/* ─── Calendar grid ─── */}
      <div className="flex-1 overflow-auto rounded-lg border border-border/60 bg-card/30">
        <div className="flex min-w-[800px]">
          {/* Time gutter */}
          <div className="w-12 flex-shrink-0 border-r border-border/40">
            {/* Header spacer */}
            <div className="h-16 border-b border-border/40" />
            {/* Hour labels */}
            <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-2 text-[9px] text-muted-foreground/60 -translate-y-1/2"
                  style={{ top: i * HOUR_HEIGHT }}
                >
                  {String(HOUR_START + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const isToday = isSameDay(day, today);
            const dateInfo = formatDateHeader(day);
            const dayTasks = tasksByDay.get(day.toDateString()) || [];
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div
                key={day.toDateString()}
                className={`flex-1 min-w-[110px] ${dayIdx < 6 ? "border-r border-border/30" : ""} ${
                  isWeekend ? "bg-muted/10" : ""
                }`}
              >
                {/* Day header */}
                <div className={`h-16 flex flex-col items-center justify-center border-b border-border/40 sticky top-0 z-10 ${
                  isToday
                    ? "bg-primary/10 dark:bg-primary/5"
                    : "bg-card/80 backdrop-blur-sm"
                }`}>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {dateInfo.weekday}
                  </span>
                  <span className={`text-lg font-bold leading-tight ${
                    isToday ? "text-primary" : ""
                  }`}>
                    {dateInfo.day}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">{dateInfo.month}</span>
                </div>

                {/* Time grid + task blocks */}
                <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                  {/* Hour gridlines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-border/15"
                      style={{ top: i * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (() => {
                    const now = new Date();
                    const h = now.getHours() + now.getMinutes() / 60;
                    if (h >= HOUR_START && h <= HOUR_END) {
                      const top = (h - HOUR_START) * HOUR_HEIGHT;
                      return (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
                          <div className="h-0.5 bg-red-500 w-full relative">
                            <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Task blocks */}
                  {dayTasks.map((task, tIdx) => {
                    const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
                    const startStr = task.planned_start || task.actual_start || task.created_at;
                    const top = startStr ? getTopPosition(startStr) : 0;
                    const height = getTaskHeight(task);
                    const isSelected = selectedTaskId === task.id;

                    // Stack overlapping tasks
                    const leftOffset = tIdx > 0 ? Math.min(tIdx * 4, 16) : 0;

                    return (
                      <button
                        key={task.id}
                        type="button"
                        className={`absolute right-1 rounded-md border text-left overflow-hidden cursor-pointer transition-all hover:shadow-md hover:z-30 ${sc.bgColor} ${
                          isSelected ? "ring-2 ring-primary ring-offset-1 z-30 shadow-lg" : "z-10"
                        }`}
                        style={{
                          top: top + 1,
                          height: Math.max(28, height - 2),
                          left: 4 + leftOffset,
                        }}
                        onClick={() => onTaskClick(task)}
                      >
                        <div className="flex flex-col h-full px-1.5 py-1 gap-0.5">
                          {/* Status dot + time */}
                          <div className="flex items-center gap-1">
                            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${sc.dotColor}`} />
                            {startStr && (
                              <span className="text-[8px] text-muted-foreground truncate">
                                {formatTime(startStr)}
                              </span>
                            )}
                            {task.priority === "urgent" || task.priority === "high" ? (
                              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ml-auto ${PRIORITY_DOT[task.priority]}`} />
                            ) : null}
                          </div>
                          {/* Title */}
                          <span className="text-[10px] font-medium leading-tight line-clamp-2">
                            {task.title}
                          </span>
                          {/* Driver (if room) */}
                          {height > 48 && task.driver && (
                            <span className="text-[8px] text-muted-foreground truncate flex items-center gap-0.5 mt-auto">
                              <User className="h-2.5 w-2.5 flex-shrink-0" />
                              {task.driver.name}
                            </span>
                          )}
                          {/* Stops count */}
                          {height > 60 && task.stops.length > 0 && (
                            <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                              {task.stops.filter(s => s.status === "completed").length}/{task.stops.length}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Unscheduled tasks strip ─── */}
      {unscheduledTasks.length > 0 && (
        <div className="mt-2 flex-shrink-0">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1 px-1">
            Unscheduled
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 px-1" style={{ scrollbarWidth: "thin" }}>
            {unscheduledTasks.map(task => {
              const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
              const isSelected = selectedTaskId === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className={`flex-shrink-0 rounded-md border px-2.5 py-1.5 text-left transition-all hover:shadow-sm ${sc.bgColor} ${
                    isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${sc.dotColor}`} />
                    <span className="text-[10px] font-medium max-w-[120px] truncate">{task.title}</span>
                  </div>
                  {task.driver && (
                    <span className="text-[8px] text-muted-foreground mt-0.5 block truncate max-w-[120px]">
                      {task.driver.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
