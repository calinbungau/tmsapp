"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  FileText,
  Mail,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  UserCheck,
  FileWarning,
  FileX,
  Check,
  X,
  Route,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  action_url: string | null;
  notification_type: string;
  priority: string;
  read_at: string | null;
  created_at: string;
}

interface AdminNotificationsBellProps {
  userId: string | undefined;
}

export function AdminNotificationsBell({ userId }: AdminNotificationsBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch(`/api/user-notifications?userId=${userId}&limit=15`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.notifications) {
        setNotifications(
          data.notifications.map((n: any) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            icon: n.icon || null,
            action_url: n.action_url || null,
            notification_type: n.notification_type,
            priority: n.priority,
            read_at: n.read_at || null,
            created_at: n.created_at,
          }))
        );
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();

    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`admin-notifs-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          fetchNotifications();

          // Show in-app toast for the new notification
          try {
            const notifId = (payload.new as any)?.notification_id;
            if (notifId) {
              const { data: notif } = await supabase
                .from("notifications")
                .select("title, body, icon, action_url, notification_type")
                .eq("id", notifId)
                .single();
              if (notif) {
                const isEmail = notif.notification_type === "email_received";
                toast(notif.title, {
                  description: notif.body,
                  icon: isEmail ? "📧" : "🔔",
                  duration: 6000,
                  action: notif.action_url
                    ? {
                        label: isEmail ? "Open Email" : "View",
                        onClick: () => { window.location.href = notif.action_url!; },
                      }
                    : undefined,
                });
              }
            }
          } catch { /* non-critical */ }
        }
      )
      .subscribe();

    // Also listen for foreground FCM messages and manual refresh events
    const handleRefresh = () => fetchNotifications();
    window.addEventListener("notificationsUpdated", handleRefresh);

    const interval = setInterval(fetchNotifications, 60000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      window.removeEventListener("notificationsUpdated", handleRefresh);
    };
  }, [fetchNotifications, userId]);

  const markAsRead = async (notificationId: string) => {
    if (!userId) return;
    try {
      await fetch("/api/user-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId, action: "read" }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      await fetch("/api/user-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId: "all", action: "read_all", adminId: userId }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {}
  };

  const dismiss = async (notificationId: string) => {
    if (!userId) return;
    const notification = notifications.find((n) => n.id === notificationId);
    try {
      await fetch("/api/user-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId, action: "dismiss" }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (notification && !notification.read_at) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {}
  };

  const getIcon = (type: string, icon: string | null) => {
    const iconClass = "h-4 w-4 shrink-0";
    switch (icon || type) {
      case "mail":
      case "email_received":
        return <Mail className={`${iconClass} text-blue-400`} />;
      case "file-warning":
      case "document_expiring":
        return <FileWarning className={`${iconClass} text-amber-500`} />;
      case "file-x":
      case "document_expired":
        return <FileX className={`${iconClass} text-red-500`} />;
      case "wrench":
      case "maintenance_due":
        return <Wrench className={`${iconClass} text-blue-500`} />;
      case "alert-triangle":
      case "maintenance_reported":
        return <AlertTriangle className={`${iconClass} text-orange-500`} />;
      case "clipboard-check":
      case "form_submitted":
        return <ClipboardCheck className={`${iconClass} text-green-500`} />;
      case "user-check":
      case "driver_checkin":
      case "task_accepted":
        return <UserCheck className={`${iconClass} text-purple-500`} />;
      case "route":
      case "task_dispatched":
      case "task_assigned":
        return <Route className={`${iconClass} text-indigo-500`} />;
      case "check-circle":
      case "task_completed":
      case "stop_completed":
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case "x-circle":
      case "task_failed":
      case "task_declined":
        return <XCircle className={`${iconClass} text-red-500`} />;
      case "clock":
      case "task_late":
        return <Clock className={`${iconClass} text-amber-500`} />;
      case "play":
      case "task_started":
        return <Play className={`${iconClass} text-blue-500`} />;
      default:
        return <Bell className={`${iconClass} text-muted-foreground`} />;
    }
  };

  const getPriorityIndicator = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      default:
        return "bg-transparent";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-0 rounded-xl shadow-xl border border-border/60 bg-popover z-[1100] max-h-[min(500px,calc(100vh-80px))] flex flex-col overflow-hidden"
        side="bottom"
        sideOffset={8}
        align="end"
        alignOffset={-4}
        avoidCollisions={true}
        collisionPadding={16}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium rounded-full">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification List */}
        <ScrollArea className="flex-1 min-h-0 max-h-[380px] overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-3">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Inbox className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">All caught up</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">No new notifications</p>
            </div>
          ) : (
            <div>
              {notifications.map((notification, idx) => (
                <div
                  key={notification.id}
                  className={`group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40 cursor-pointer ${
                    !notification.read_at ? "bg-primary/[0.03]" : ""
                  } ${idx < notifications.length - 1 ? "border-b border-border/30" : ""}`}
                  onClick={() => {
                    if (!notification.read_at) markAsRead(notification.id);
                    if (notification.action_url) {
                      setOpen(false);
                      window.location.href = notification.action_url;
                    }
                  }}
                >
                  {/* Priority indicator dot */}
                  <div className={`absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${getPriorityIndicator(notification.priority)}`} />

                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">
                    <div className="h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center">
                      {getIcon(notification.notification_type, notification.icon)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[13px] leading-tight line-clamp-1 ${!notification.read_at ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                        {notification.title}
                      </p>
                      {/* Unread dot */}
                      {!notification.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {notification.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Dismiss button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground absolute right-2 top-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(notification.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border/50 p-1.5">
          <Link href="/admin/notifications" onClick={() => setOpen(false)}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs font-medium text-muted-foreground hover:text-foreground justify-center gap-1.5"
            >
              View All Notifications
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
