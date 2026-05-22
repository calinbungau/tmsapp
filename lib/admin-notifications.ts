import { createClient } from "@/lib/supabase/server";

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

interface CreateNotificationOptions {
  adminId: string;
  targetType: "user" | "role" | "department" | "all";
  targetId?: string;
  notificationType: string;
  priority?: "low" | "normal" | "high" | "urgent";
  payload: NotificationPayload;
}

interface SendNotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
  webPushSent?: number;
  fcmSent?: number;
}

// Get Firebase access token using service account
async function getFirebaseAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  
  if (!clientEmail || !privateKey) {
    console.error("Firebase credentials not configured");
    return null;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const crypto = await import("crypto");
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signature = sign.sign(privateKey, "base64url");

    const jwt = `${signatureInput}.${signature}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (error) {
    console.error("Error getting Firebase access token:", error);
    return null;
  }
}

// Send FCM push notification
async function sendFcmNotification(
  fcmToken: string,
  notification: NotificationPayload
): Promise<boolean> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return false;

  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return false;

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: {
              ...notification.data,
              actionUrl: notification.actionUrl || "",
            },
            android: {
              priority: "high",
              notification: {
                sound: "default",
                click_action: notification.actionUrl || "OPEN_APP",
              },
            },
            webpush: {
              fcm_options: {
                link: notification.actionUrl || "/admin",
              },
            },
          },
        }),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create and send a notification to admin users.
 */
export async function createAdminNotification(
  options: CreateNotificationOptions
): Promise<SendNotificationResult> {
  const supabase = await createClient();
  const { adminId, targetType, targetId, notificationType, priority, payload } = options;

  // Create the notification record
  const { data: notification, error: createError } = await supabase
    .from("notifications")
    .insert({
      admin_id: adminId,
      target_type: targetType,
      target_id: targetId || null,
      title: payload.title,
      body: payload.body,
      icon: payload.icon || null,
      action_url: payload.actionUrl || null,
      data: payload.data || null,
      notification_type: notificationType,
      priority: priority || "normal",
      channels_sent: [],
    })
    .select("id")
    .single();

  if (createError || !notification) {
    return { success: false, error: createError?.message || "Failed to create notification" };
  }

  // Get target users based on target type
  let targetUsers: { id: string; fcm_token: string | null }[] = [];

  if (targetType === "all") {
    const { data } = await supabase
      .from("user_sessions")
      .select("user_id, fcm_token")
      .eq("user_id", supabase.rpc("get_users_by_admin", { admin_id: adminId }));
    
    // Fallback: get all users for this admin
    const { data: users } = await supabase
      .from("users")
      .select("id")
      .eq("admin_id", adminId)
      .eq("status", "active");
    
    if (users) {
      for (const user of users) {
        const { data: sessions } = await supabase
          .from("user_sessions")
          .select("fcm_token")
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString());
        
        targetUsers.push({
          id: user.id,
          fcm_token: sessions?.[0]?.fcm_token || null,
        });
      }
    }
  } else if (targetType === "user" && targetId) {
    const { data: sessions } = await supabase
      .from("user_sessions")
      .select("user_id, fcm_token")
      .eq("user_id", targetId)
      .gt("expires_at", new Date().toISOString());
    
    if (sessions && sessions.length > 0) {
      targetUsers = sessions.map((s) => ({
        id: s.user_id,
        fcm_token: s.fcm_token,
      }));
    }
  } else if (targetType === "role" && targetId) {
    const { data: users } = await supabase
      .from("users")
      .select("id")
      .eq("admin_id", adminId)
      .eq("role_id", targetId)
      .eq("status", "active");
    
    if (users) {
      for (const user of users) {
        const { data: sessions } = await supabase
          .from("user_sessions")
          .select("fcm_token")
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString());
        
        targetUsers.push({
          id: user.id,
          fcm_token: sessions?.[0]?.fcm_token || null,
        });
      }
    }
  } else if (targetType === "department" && targetId) {
    const { data: employees } = await supabase
      .from("employees")
      .select("id")
      .eq("department_id", targetId)
      .eq("status", "active");
    
    if (employees) {
      for (const emp of employees) {
        const { data: users } = await supabase
          .from("users")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("status", "active");
        
        if (users) {
          for (const user of users) {
            const { data: sessions } = await supabase
              .from("user_sessions")
              .select("fcm_token")
              .eq("user_id", user.id)
              .gt("expires_at", new Date().toISOString());
            
            targetUsers.push({
              id: user.id,
              fcm_token: sessions?.[0]?.fcm_token || null,
            });
          }
        }
      }
    }
  }

  // Create user_notifications entries for each target user
  const userNotifications = targetUsers.map((user) => ({
    notification_id: notification.id,
    user_id: user.id,
    delivered_channels: [] as string[],
  }));

  if (userNotifications.length > 0) {
    await supabase.from("user_notifications").insert(userNotifications);
  }

  // Send FCM notifications
  let fcmSent = 0;
  const fcmTokens = new Set<string>();

  for (const user of targetUsers) {
    if (user.fcm_token && !fcmTokens.has(user.fcm_token)) {
      fcmTokens.add(user.fcm_token);
      const sent = await sendFcmNotification(user.fcm_token, payload);
      if (sent) {
        fcmSent++;
        // Update delivered channels
        await supabase
          .from("user_notifications")
          .update({ delivered_channels: ["fcm"] })
          .eq("notification_id", notification.id)
          .eq("user_id", user.id);
      }
    }
  }

  // Update notification with channels sent
  const channelsSent: string[] = [];
  if (fcmSent > 0) channelsSent.push("fcm");

  await supabase
    .from("notifications")
    .update({ channels_sent: channelsSent })
    .eq("id", notification.id);

  return {
    success: true,
    notificationId: notification.id,
    fcmSent,
  };
}

/**
 * Get unread notifications for a user.
 */
export async function getUserNotifications(
  userId: string,
  limit = 50
): Promise<{
  notifications: Array<{
    id: string;
    notification_id: string;
    title: string;
    body: string;
    icon: string | null;
    action_url: string | null;
    notification_type: string;
    priority: string;
    read_at: string | null;
    created_at: string;
  }>;
  unreadCount: number;
}> {
  const supabase = await createClient();

  const { data: userNotifs } = await supabase
    .from("user_notifications")
    .select(`
      id,
      notification_id,
      read_at,
      created_at,
      notification:notifications(
        title,
        body,
        icon,
        action_url,
        notification_type,
        priority,
        created_at
      )
    `)
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { count } = await supabase
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("dismissed_at", null);

  const notifications = (userNotifs || []).map((un) => {
    const notif = un.notification as {
      title: string;
      body: string;
      icon: string | null;
      action_url: string | null;
      notification_type: string;
      priority: string;
      created_at: string;
    };
    return {
      id: un.id,
      notification_id: un.notification_id,
      title: notif.title,
      body: notif.body,
      icon: notif.icon,
      action_url: notif.action_url,
      notification_type: notif.notification_type,
      priority: notif.priority,
      read_at: un.read_at,
      created_at: notif.created_at,
    };
  });

  return {
    notifications,
    unreadCount: count || 0,
  };
}

/**
 * Mark notifications as read.
 */
export async function markNotificationsAsRead(
  userId: string,
  notificationIds?: string[]
): Promise<void> {
  const supabase = await createClient();

  if (notificationIds && notificationIds.length > 0) {
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", notificationIds);
  } else {
    // Mark all as read
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
  }
}

/**
 * Dismiss a notification.
 */
export async function dismissNotification(
  userId: string,
  userNotificationId: string
): Promise<void> {
  const supabase = await createClient();
  
  await supabase
    .from("user_notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", userNotificationId);
}

// Notification templates for admin events
export const AdminNotificationTemplates = {
  documentExpiring: (documentName: string, daysUntil: number, entityName: string) => ({
    title: "Document Expiring Soon",
    body: `${documentName} for ${entityName} expires in ${daysUntil} days`,
    icon: "file-warning",
    notificationType: "document_expiring",
    priority: daysUntil <= 7 ? "high" : "normal",
  }),

  documentExpired: (documentName: string, entityName: string) => ({
    title: "Document Expired",
    body: `${documentName} for ${entityName} has expired`,
    icon: "file-x",
    notificationType: "document_expired",
    priority: "urgent",
  }),

  maintenanceDue: (maintenanceType: string, vehiclePlate: string) => ({
    title: "Maintenance Due",
    body: `${maintenanceType} is due for ${vehiclePlate}`,
    icon: "wrench",
    notificationType: "maintenance_due",
    priority: "high",
  }),

  maintenanceReported: (vehiclePlate: string, driverName: string, issue: string) => ({
    title: "Issue Reported by Driver",
    body: `${driverName} reported: ${issue} on ${vehiclePlate}`,
    icon: "alert-triangle",
    notificationType: "maintenance_reported",
    priority: "high",
  }),

  formSubmitted: (formType: string, driverName: string) => ({
    title: "New Form Submission",
    body: `${driverName} submitted a ${formType}`,
    icon: "clipboard-check",
    notificationType: "form_submitted",
    priority: "normal",
  }),

  driverCheckIn: (driverName: string, vehiclePlate: string) => ({
    title: "Driver Check-In",
    body: `${driverName} checked in with ${vehiclePlate}`,
    icon: "user-check",
    notificationType: "driver_checkin",
    priority: "low",
  }),

  systemAlert: (message: string) => ({
    title: "System Alert",
    body: message,
    icon: "bell",
    notificationType: "system_alert",
    priority: "high",
  }),
} as const;
