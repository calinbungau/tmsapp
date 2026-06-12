"use client";

import React from "react"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  CheckCheck,
  FileText,
  Wrench,
  AlertTriangle,
  Info,
  Clock,
  Filter,
  Loader2,
  ExternalLink,
  Route,
  CheckCircle,
  XCircle,
  Play,
  UserCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "@/components/i18n/i18n-provider";

interface Notification {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  priority: string;
  action_url?: string;
  data?: Record<string, unknown>;
  created_at: string;
  read_at?: string;
  dismissed_at?: string;
}

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const typeIcons: Record<string, React.ReactNode> = {
  document_expiring: <FileText className="h-5 w-5 text-orange-500" />,
  document_expired: <FileText className="h-5 w-5 text-red-500" />,
  maintenance_due: <Wrench className="h-5 w-5 text-orange-500" />,
  maintenance_expired: <Wrench className="h-5 w-5 text-red-500" />,
  maintenance_reported: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  form_submitted: <FileText className="h-5 w-5 text-blue-500" />,
  system: <Info className="h-5 w-5 text-muted-foreground" />,
  // Task / FSM notifications
  task_dispatched: <Route className="h-5 w-5 text-indigo-500" />,
  task_accepted: <UserCheck className="h-5 w-5 text-emerald-500" />,
  task_declined: <XCircle className="h-5 w-5 text-red-500" />,
  task_started: <Play className="h-5 w-5 text-blue-500" />,
  task_completed: <CheckCircle className="h-5 w-5 text-green-500" />,
  task_failed: <XCircle className="h-5 w-5 text-red-500" />,
  task_late: <Clock className="h-5 w-5 text-amber-500" />,
  stop_completed: <CheckCircle className="h-5 w-5 text-teal-500" />,
  driver_action: <UserCheck className="h-5 w-5 text-purple-500" />,
};

export default function NotificationsPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const { t } = useTranslation();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    if (!adminSession?.id) return;
    
    try {
      const response = await fetch(
        `/api/user-notifications?userId=${adminSession.id}&unreadOnly=${activeTab === "unread"}`
      );
      const data = await response.json();
      
      if (data.notifications) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionLoading && adminSession?.id) {
      fetchNotifications();
    }
  }, [sessionLoading, adminSession?.id, activeTab]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!adminSession?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-notifs-page-${adminSession.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${adminSession.id}`,
        },
        () => { fetchNotifications(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [adminSession?.id]);

  const markAsRead = async (notificationId: string) => {
    if (!adminSession?.id) return;

    await fetch("/api/user-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: adminSession.id,
        notificationId,
        action: "read",
      }),
    });

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!adminSession?.id) return;

    await fetch("/api/user-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: adminSession.id,
        adminId: adminSession.id,
        action: "read_all",
      }),
    });

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  const dismissNotification = async (notificationId: string) => {
    if (!adminSession?.id) return;

    await fetch("/api/user-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: adminSession.id,
        notificationId,
        action: "dismiss",
      }),
    });

    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markAsRead(notification.id);
    }
    
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
          <p className="text-muted-foreground">
            {t("notifications.subtitle")}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" className="bg-transparent" onClick={markAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "unread")}>
        <TabsList>
          <TabsTrigger value="all">{t("notifications.all")}</TabsTrigger>
          <TabsTrigger value="unread" className="flex items-center gap-2">
            {t("notifications.unread")}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground font-medium">
                  {activeTab === "unread" ? t("notifications.noUnread") : t("notifications.noneYet")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "unread"
                    ? t("notifications.allCaughtUp")
                    : t("notifications.appearHere")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`transition-colors cursor-pointer hover:bg-muted/50 ${
                    !notification.read_at ? "border-l-4 border-l-primary" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        {typeIcons[notification.notification_type] || (
                          <Bell className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`font-medium ${!notification.read_at ? "text-foreground" : "text-muted-foreground"}`}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {notification.body}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={priorityColors[notification.priority]}>
                              {t(`notifications.priority${notification.priority.charAt(0).toUpperCase()}${notification.priority.slice(1)}`)}
                            </Badge>
                            {notification.action_url && (
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </span>
                          {!notification.read_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                            >
                              {t("notifications.markAsRead")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(notification.id);
                            }}
                          >
                            {t("notifications.dismiss")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
