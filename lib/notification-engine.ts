/**
 * Scalable Notification Engine
 * 
 * Supports multiple channels: in-app (web), push (FCM), email (future)
 * Triggered by: user actions, system events, scheduled background jobs
 * Respects: user preferences, module access (HR-only users don't get maintenance alerts), custom rules
 * 
 * Architecture:
 *   1. Event occurs (task dispatched, task late, maintenance due, etc.)
 *   2. Engine resolves recipients based on rules (creator, subscribers, role-based)
 *   3. For each recipient, checks preferences + access
 *   4. Dispatches to enabled channels (in-app, push, email)
 *   5. Logs everything in notification_queue for audit
 */

import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type NotificationChannel = "in_app" | "push" | "email";

export type NotificationEvent =
  // FSM Events
  | "task.created"
  | "task.dispatched"
  | "task.accepted"
  | "task.declined"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "task.cancelled"
  | "task.late"
  | "task.driver_reminder"
  | "stop.completed"
  | "stop.skipped"
  | "stop.failed"
  | "form.submitted"
  // Maintenance Events
  | "maintenance.due"
  | "maintenance.overdue"
  | "maintenance.reported"
  | "maintenance.completed"
  // Document Events
  | "document.expiring"
  | "document.expired"
  // Driver Events
  | "driver.checkin"
  | "driver.checkout"
  | "driver.offline"
  // HR Events
  | "leave.requested"
  | "leave.approved"
  | "leave.rejected"
  // TMS Events
  | "trip.dispatched"
  | "trip.accepted"
  | "trip.started"
  | "trip.completed"
  | "trip.cancelled"
  | "order.dispatched"
  | "shipment.created"
  | "shipment.delayed"
  | "shipment.delivered"
  // Custom
  | "custom";

export interface NotificationPayload {
  event: NotificationEvent;
  title: string;
  body: string;
  icon?: string;
  actionUrl?: string;
  data?: Record<string, any>;
  // Context for resolving recipients
  adminId: string;
  module?: "fsm" | "tms" | "hr" | "fleet" | "system";
  entityType?: string;   // "task", "vehicle", "driver", "employee", etc.
  entityId?: string;      // The specific entity ID
  triggeredBy?: string;   // User ID who triggered the event
  // Optional: explicit recipients (skip rule resolution)
  recipientUserIds?: string[];
  recipientDriverIds?: string[];
  // Priority
  priority?: "low" | "normal" | "high" | "urgent";
}

interface ResolvedRecipient {
  userId?: string;
  driverId?: string;
  channels: NotificationChannel[];
  fcmToken?: string | null;
  email?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Firebase Access Token (cached)
// ═══════════════════════════════════════════════════════════════════════════

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getFirebaseAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  try {
    const { SignJWT, importPKCS8 } = await import("jose");
    const key = await importPKCS8(privateKey, "RS256");
    const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const data = await res.json();
    if (data.access_token) {
      cachedToken = { token: data.access_token, expiresAt: Date.now() + 3500000 };
      return data.access_token;
    }
    return null;
  } catch (err) {
    console.error("Firebase token error:", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Channel Dispatchers
// ═══════════════════════════════════════════════════════════════════════════

async function sendFcmPush(token: string, title: string, body: string, data?: Record<string, string>, actionUrl?: string): Promise<boolean> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return false;
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return false;

  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { ...data, actionUrl: actionUrl || "" },
          android: { priority: "high", notification: { sound: "default" } },
          webpush: { fcm_options: { link: actionUrl || "/admin" } },
        },
      }),
    });
    return res.ok;
  } catch { return false; }
}

async function sendInAppToUser(
  supabase: any,
  adminId: string,
  userId: string,
  payload: NotificationPayload
): Promise<string | null> {
  // Create notification record
  const { data: notif, error: notifError } = await supabase.from("notifications").insert({
    admin_id: adminId,
    target_type: "user",
    target_id: userId,
    title: payload.title,
    body: payload.body,
    icon: payload.icon || null,
    action_url: payload.actionUrl || null,
    data: payload.data || null,
    notification_type: payload.event,
    priority: payload.priority || "normal",
    channels_sent: ["in_app"],
  }).select("id").single();

  if (notifError) {
    console.error("[NotifEngine] notifications insert error:", notifError.message, { adminId, userId, event: payload.event });
    return null;
  }
  if (!notif) return null;

  // Create user_notification entry (links notification to recipient)
  const { error: userNotifError } = await supabase.from("user_notifications").insert({
    notification_id: notif.id,
    user_id: userId,
    delivered_channels: ["in_app"],
  });

  if (userNotifError) {
    console.error("[NotifEngine] user_notifications insert error:", userNotifError.message, { notifId: notif.id, userId });
  }

  return notif.id;
}

async function sendInAppToDriver(
  supabase: any,
  adminId: string,
  driverId: string,
  payload: NotificationPayload
): Promise<void> {
  await supabase.from("driver_notifications").insert({
    admin_id: adminId,
    driver_id: driverId,
    title: payload.title,
    message: payload.body,
    type: payload.event,
    read: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Recipient Resolution
// ═══════════════════════════════════════════════════════════════════════════

// Module-to-permissions mapping for access checks
const MODULE_PERMISSIONS: Record<string, string[]> = {
  fsm: ["fsm", "admin"],
  tms: ["tms", "admin"],
  hr: ["hr", "admin"],
  fleet: ["fleet", "admin"],
  system: ["admin"],
};

/**
 * Look up FCM token for any user type: checks users table, then user_sessions, then admins.
 * This handles all cases: admin owner (users.is_owner=true), sub-users, legacy admins.
 */
async function lookupFcmToken(supabase: any, userId: string): Promise<string | null> {
  // 1. Check users table first (admin owners + sub-users login here, FCM saved here)
  const { data: user } = await supabase
    .from("users")
    .select("fcm_token")
    .eq("id", userId)
    .maybeSingle();
  if (user?.fcm_token) return user.fcm_token;

  // 2. Check user_sessions (legacy session-based tokens)
  const { data: sessions } = await supabase
    .from("user_sessions")
    .select("fcm_token")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (sessions?.[0]?.fcm_token) return sessions[0].fcm_token;

  // 3. Check admins table (direct admin ID lookup)
  const { data: admin } = await supabase
    .from("admins")
    .select("fcm_token")
    .eq("id", userId)
    .maybeSingle();
  if (admin?.fcm_token) return admin.fcm_token;

  // 4. If userId is an admin_id, find the owner user record
  const { data: ownerUser } = await supabase
    .from("users")
    .select("fcm_token")
    .eq("admin_id", userId)
    .eq("is_owner", true)
    .maybeSingle();
  if (ownerUser?.fcm_token) return ownerUser.fcm_token;

  return null;
}

async function resolveRecipients(
  supabase: any,
  payload: NotificationPayload
): Promise<ResolvedRecipient[]> {
  const recipients: ResolvedRecipient[] = [];
  const seenUserIds = new Set<string>();
  const seenDriverIds = new Set<string>();

  // 1. Explicit recipients
  if (payload.recipientUserIds?.length) {
    for (const uid of payload.recipientUserIds) {
      if (seenUserIds.has(uid)) continue;
      seenUserIds.add(uid);

      const { data: sessions } = await supabase
        .from("user_sessions")
        .select("fcm_token")
        .eq("user_id", uid)
        .gt("expires_at", new Date().toISOString())
        .limit(1);

      recipients.push({
        userId: uid,
        channels: ["in_app", "push"],
        fcmToken: sessions?.[0]?.fcm_token || null,
      });
    }
  }

  if (payload.recipientDriverIds?.length) {
    for (const did of payload.recipientDriverIds) {
      if (seenDriverIds.has(did)) continue;
      seenDriverIds.add(did);

      const { data: driver } = await supabase
        .from("drivers")
        .select("fcm_token")
        .eq("id", did)
        .maybeSingle();

      recipients.push({
        driverId: did,
        channels: ["in_app", "push"],
        fcmToken: driver?.fcm_token || null,
      });
    }
  }

  // 2. Task-specific subscribers
  if (payload.entityType === "task" && payload.entityId) {
    const { data: subs } = await supabase
      .from("task_notification_subscribers")
      .select("user_id, notify_on_status_change, notify_on_completion, notify_on_delay, notify_on_driver_action, channels")
      .eq("task_id", payload.entityId);

    if (subs) {
      for (const sub of subs) {
        if (seenUserIds.has(sub.user_id)) continue;
        // Check if this event matches subscriber preferences
        const shouldNotify = shouldNotifySubscriber(payload.event, sub);
        if (!shouldNotify) continue;

        seenUserIds.add(sub.user_id);
        const fcmToken = await lookupFcmToken(supabase, sub.user_id);
        recipients.push({
          userId: sub.user_id,
          channels: sub.channels || ["in_app", "push"],
          fcmToken,
        });
      }
    }
  }

  // 2b. Always notify the admin (task owner) for driver-triggered events
  if (payload.entityType === "task" && payload.entityId && payload.triggeredBy) {
    // Check if admin is already a recipient
    if (!seenUserIds.has(payload.adminId)) {
      // Check if the event was triggered by a driver (not the admin themselves)
      const isDriverTriggered = payload.triggeredBy !== payload.adminId;
      if (isDriverTriggered) {
        seenUserIds.add(payload.adminId);
        const fcmToken = await lookupFcmToken(supabase, payload.adminId);
        recipients.push({
          userId: payload.adminId,
          channels: ["in_app", "push"],
          fcmToken,
        });
      }
    }
  }

  // 3. Global notification rules
  const { data: rules } = await supabase
    .from("notification_rules")
    .select("*")
    .eq("admin_id", payload.adminId)
    .eq("is_active", true)
    .eq("trigger_event", payload.event);

  if (rules) {
    for (const rule of rules) {
      // Module filter
      if (rule.required_module && rule.required_module !== payload.module) continue;

      const targetUserIds: string[] = [];

      if (rule.recipient_type === "creator" && payload.triggeredBy) {
        // Don't notify the person who triggered the action
        continue;
      } else if (rule.recipient_type === "role" && rule.recipient_filter?.role_id) {
        const { data: users } = await supabase
          .from("users")
          .select("id")
          .eq("admin_id", payload.adminId)
          .eq("role_id", rule.recipient_filter.role_id)
          .eq("status", "active");
        if (users) targetUserIds.push(...users.map((u: any) => u.id));
      } else if (rule.recipient_type === "all_admins") {
        const { data: users } = await supabase
          .from("users")
          .select("id")
          .eq("admin_id", payload.adminId)
          .eq("status", "active");
        if (users) targetUserIds.push(...users.map((u: any) => u.id));
      }

      for (const uid of targetUserIds) {
        if (seenUserIds.has(uid)) continue;
        // Module access check
        if (payload.module) {
          const hasAccess = await checkUserModuleAccess(supabase, uid, payload.module);
          if (!hasAccess) continue;
        }
        seenUserIds.add(uid);
        const fcmToken = await lookupFcmToken(supabase, uid);
        // Build channels from boolean columns
        const ruleChannels: NotificationChannel[] = [];
        if (rule.channel_web !== false) ruleChannels.push("in_app");
        if (rule.channel_push !== false) ruleChannels.push("push");
        if (rule.channel_email) ruleChannels.push("email");
        recipients.push({
          userId: uid,
          channels: ruleChannels.length > 0 ? ruleChannels : ["in_app", "push"],
          fcmToken,
        });
      }
    }
  }

  return recipients;
}

function shouldNotifySubscriber(event: NotificationEvent, sub: any): boolean {
  if (event.startsWith("task.completed") || event.startsWith("task.failed")) return !!sub.notify_on_completion;
  if (event === "task.late") return !!sub.notify_on_delay;
  if (event === "task.accepted" || event === "task.declined" || event === "task.started") return !!sub.notify_on_driver_action;
  if (event.startsWith("task.") || event.startsWith("stop.")) return !!sub.notify_on_status_change;
  return true;
}

async function checkUserModuleAccess(supabase: any, userId: string, module: string): Promise<boolean> {
  // Get user's role permissions
  const { data: user } = await supabase
    .from("users")
    .select("role_id, role:roles(permissions)")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.role?.permissions) return true; // No restrictions = full access

  const perms = user.role.permissions;
  const requiredPerms = MODULE_PERMISSIONS[module] || [];

  // Check if user has any of the required module permissions
  if (Array.isArray(perms)) {
    return requiredPerms.some(p => perms.includes(p));
  }
  if (typeof perms === "object") {
    return requiredPerms.some(p => perms[p]);
  }
  return true; // Default allow
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Engine: dispatch()
// ═══════════════════════════════════════════════════════════════════════════

export async function dispatch(payload: NotificationPayload): Promise<{
  sent: number;
  failed: number;
  recipients: { userId?: string; driverId?: string; channels: string[] }[];
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let sent = 0;
  let failed = 0;
  const deliveredTo: { userId?: string; driverId?: string; channels: string[] }[] = [];

  try {
    // Resolve recipients
    const recipients = await resolveRecipients(supabase, payload);

    for (const recipient of recipients) {
      const deliveredChannels: string[] = [];

      // In-App
      if (recipient.channels.includes("in_app")) {
        try {
          if (recipient.userId) {
            await sendInAppToUser(supabase, payload.adminId, recipient.userId, payload);
            deliveredChannels.push("in_app");
          }
          if (recipient.driverId) {
            await sendInAppToDriver(supabase, payload.adminId, recipient.driverId, payload);
            deliveredChannels.push("in_app");
          }
        } catch (err) {
          console.error("In-app notification failed:", err);
        }
      }

      // Push (FCM)
      if (recipient.channels.includes("push") && recipient.fcmToken) {
        try {
          const pushData: Record<string, string> = {};
          if (payload.data) {
            for (const [k, v] of Object.entries(payload.data)) {
              pushData[k] = String(v);
            }
          }
          const ok = await sendFcmPush(recipient.fcmToken, payload.title, payload.body, pushData, payload.actionUrl);
          if (ok) deliveredChannels.push("push");
        } catch (err) {
          console.error("Push notification failed:", err);
        }
      }

      // Email (future - placeholder)
      if (recipient.channels.includes("email") && recipient.email) {
        // TODO: Integrate with email service (Resend, SendGrid, etc.)
        // deliveredChannels.push("email");
      }

      if (deliveredChannels.length > 0) {
        sent++;
        deliveredTo.push({
          userId: recipient.userId,
          driverId: recipient.driverId,
          channels: deliveredChannels,
        });
      } else {
        failed++;
      }

      // Log to notification_queue
      await supabase.from("notification_queue").insert({
        admin_id: payload.adminId,
        notification_type: payload.event,
        title: payload.title,
        body: payload.body,
        icon: payload.icon || null,
        action_url: payload.actionUrl || null,
        data: payload.data || null,
        user_id: recipient.userId || null,
        driver_id: recipient.driverId || null,
        source_type: payload.entityType || null,
        source_id: payload.entityId || null,
        channel_web: recipient.channels.includes("in_app"),
        channel_push: recipient.channels.includes("push"),
        channel_email: recipient.channels.includes("email"),
        priority: payload.priority || "normal",
        status: deliveredChannels.length > 0 ? "sent" : "failed",
        processed_at: new Date().toISOString(),
      }).then(() => {}).catch(() => {}); // Non-blocking
    }
  } catch (err) {
    console.error("Notification engine error:", err);
  }

  return { sent, failed, recipients: deliveredTo };
}

// ═══════════════════════════════════════════════════════════════════════════
// Convenience helpers for common events
// ═══════════════════════════════════════════════════════════════════════════

export async function notifyTaskDispatched(
  adminId: string,
  taskId: string,
  taskTitle: string,
  taskRef: string,
  driverIds: string[],
  createdBy: string,
  subscriberUserIds: string[]
) {
  return dispatch({
    event: "task.dispatched",
    title: "New Task Assigned",
    body: `Task ${taskRef}: ${taskTitle}`,
    icon: "route",
    actionUrl: `/admin/fsm/tasks`,
    data: { type: "task_dispatched", task_id: taskId },
    adminId,
    module: "fsm",
    entityType: "task",
    entityId: taskId,
    triggeredBy: createdBy,
    recipientDriverIds: driverIds,
    recipientUserIds: subscriberUserIds,
    priority: "high",
  });
}

export async function notifyTaskStatusChanged(
  adminId: string,
  taskId: string,
  taskTitle: string,
  taskRef: string,
  fromStatus: string,
  toStatus: string,
  triggeredBy: string
) {
  const eventMap: Record<string, NotificationEvent> = {
    accepted: "task.accepted",
    confirmed: "task.accepted",
    declined: "task.declined",
    in_progress: "task.started",
    completed: "task.completed",
    failed: "task.failed",
    cancelled: "task.cancelled",
  };

  const event = eventMap[toStatus] || "task.created";
  const statusLabels: Record<string, string> = {
    confirmed: "accepted",
    in_progress: "started",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
    declined: "declined",
  };

  return dispatch({
    event,
    title: `Task ${statusLabels[toStatus] || toStatus}`,
    body: `${taskRef}: ${taskTitle} is now ${statusLabels[toStatus] || toStatus}`,
    icon: toStatus === "completed" ? "check-circle" : toStatus === "failed" ? "x-circle" : "route",
    actionUrl: `/admin/fsm/tasks`,
    data: { type: `task_${toStatus}`, task_id: taskId, from_status: fromStatus, to_status: toStatus },
    adminId,
    module: "fsm",
    entityType: "task",
    entityId: taskId,
    triggeredBy,
    priority: toStatus === "failed" ? "urgent" : "normal",
  });
}

export async function notifyTaskLate(
  adminId: string,
  taskId: string,
  taskTitle: string,
  taskRef: string,
  driverIds: string[]
) {
  return dispatch({
    event: "task.late",
    title: "Task Running Late",
    body: `${taskRef}: ${taskTitle} is past its scheduled time`,
    icon: "clock",
    actionUrl: `/admin/fsm/tasks`,
    data: { type: "task_late", task_id: taskId },
    adminId,
    module: "fsm",
    entityType: "task",
    entityId: taskId,
    recipientDriverIds: driverIds,
    priority: "high",
  });
}

export async function notifyDriverReminder(
  adminId: string,
  taskId: string,
  taskTitle: string,
  taskRef: string,
  driverId: string,
  hoursUntil: number
) {
  return dispatch({
    event: "task.driver_reminder",
    title: "Upcoming Task Reminder",
    body: `${taskRef}: ${taskTitle} starts in ${hoursUntil}h`,
    icon: "clock",
    data: { type: "task_reminder", task_id: taskId },
    adminId,
    module: "fsm",
    entityType: "task",
    entityId: taskId,
    recipientDriverIds: [driverId],
    priority: "normal",
  });
}

export async function notifyMaintenanceDue(
  adminId: string,
  vehiclePlate: string,
  maintenanceType: string,
  entityId?: string
) {
  return dispatch({
    event: "maintenance.due",
    title: "Maintenance Due",
    body: `${maintenanceType} is due for ${vehiclePlate}`,
    icon: "wrench",
    actionUrl: `/admin/fleet/maintenance`,
    data: { type: "maintenance_due", vehicle: vehiclePlate },
    adminId,
    module: "fleet",
    entityType: "vehicle",
    entityId,
    priority: "high",
  });
}

export async function notifyFormSubmitted(
  adminId: string,
  formTitle: string,
  driverName: string,
  taskId?: string,
  subscriberUserIds?: string[]
) {
  return dispatch({
    event: "form.submitted",
    title: "Form Submitted",
    body: `${driverName} submitted: ${formTitle}`,
    icon: "clipboard-check",
    actionUrl: taskId ? `/admin/fsm/tasks` : undefined,
    data: { type: "form_submitted", task_id: taskId },
    adminId,
    module: "fsm",
    entityType: "task",
    entityId: taskId,
    recipientUserIds: subscriberUserIds,
    priority: "normal",
  });
}
