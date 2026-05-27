/**
 * Action Center notifier with reminder ladder support.
 *
 * Responsibilities:
 *   - After detectors run, dispatch notifications according to the
 *     reminder schedule configured on each rule.
 *   - Support offset-based reminders: e.g. "30, 14, 7, 3, 1, 0 days before due"
 *   - Support daily reminders after due date until resolved or max days
 *   - Respect business hours / quiet hours per rule
 *   - Handle digest mode (batched daily email vs per-item)
 *   - Auto-escalate when escalation_after_hours elapses
 *   - Record every attempt in `action_center_events` for audit
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendSystemEmail } from "@/lib/system-email";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface NotifyResult {
  itemsConsidered: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  inAppLogged: number;
  pushSkipped: number;
  escalated: number;
  digestQueued: number;
}

interface ScheduleConfig {
  reminder_offsets_before: number[];
  reminder_daily_after_due: boolean;
  reminder_daily_max_days: number;
  send_window: "immediate" | "business_hours";
  business_hours_start: string;
  business_hours_end: string;
  skip_weekends: boolean;
  timezone: string;
  digest_mode: boolean;
  escalation_role: string | null;
  escalation_after_hours: number | null;
  min_hours_between_emails: number;
}

/**
 * Calculate days until due (negative = overdue).
 */
function daysUntilDue(dueAt: string | null, timezone: string): number | null {
  if (!dueAt) return null;
  
  const now = new Date();
  const due = new Date(dueAt);
  
  // Get dates in the admin's timezone for accurate day comparison
  const nowDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const dueDate = new Date(due.toLocaleString("en-US", { timeZone: timezone }));
  
  // Reset to start of day for accurate day diff
  nowDate.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  
  const diffMs = dueDate.getTime() - nowDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if we're within business hours for this rule.
 */
function isWithinBusinessHours(config: ScheduleConfig): boolean {
  if (config.send_window === "immediate") return true;
  
  const now = new Date();
  // Get current time in admin's timezone
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: config.timezone }));
  
  // Check weekend
  const dayOfWeek = localTime.getDay();
  if (config.skip_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return false;
  }
  
  // Check hours
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  const [startH, startM] = config.business_hours_start.split(":").map(Number);
  const [endH, endM] = config.business_hours_end.split(":").map(Number);
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);
  
  return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
}

/**
 * Determine if we should send an email based on the reminder ladder.
 */
function shouldSendReminder(
  daysUntil: number | null,
  notifiedOffsets: number[],
  config: ScheduleConfig,
  lastEmailAt: string | null
): { send: boolean; offset: number | null; reason: string } {
  // If no due date, we only send once on creation (handled separately)
  if (daysUntil === null) {
    return { send: false, offset: null, reason: "No due date; no ladder reminders" };
  }
  
  // Check cooldown - don't re-email within min_hours_between_emails
  if (lastEmailAt) {
    const hoursSinceLastEmail = (Date.now() - new Date(lastEmailAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastEmail < config.min_hours_between_emails) {
      return { send: false, offset: null, reason: `Cooldown: last email ${Math.round(hoursSinceLastEmail)}h ago, min ${config.min_hours_between_emails}h` };
    }
  }
  
  // Check "before due" offsets
  const offsets = Array.isArray(config.reminder_offsets_before) 
    ? config.reminder_offsets_before.sort((a, b) => b - a) // descending: 30, 14, 7...
    : [30, 14, 7, 3, 1, 0];
  
  for (const offset of offsets) {
    if (daysUntil <= offset && !notifiedOffsets.includes(offset)) {
      // We've hit or passed this offset day and haven't notified yet
      return { send: true, offset, reason: `${offset} days before due` };
    }
  }
  
  // Check overdue daily reminders
  if (daysUntil < 0 && config.reminder_daily_after_due) {
    const daysOverdue = Math.abs(daysUntil);
    
    // Check if we're past the max overdue days
    if (daysOverdue > config.reminder_daily_max_days) {
      return { send: false, offset: null, reason: `Overdue ${daysOverdue} days, past max ${config.reminder_daily_max_days}` };
    }
    
    // For daily reminders, we use negative offsets to track: -1 = 1 day overdue, -2 = 2 days overdue
    const overdueOffset = -daysOverdue;
    if (!notifiedOffsets.includes(overdueOffset)) {
      return { send: true, offset: overdueOffset, reason: `Daily overdue reminder (${daysOverdue} days overdue)` };
    }
  }
  
  return { send: false, offset: null, reason: "No reminder due today" };
}

/**
 * Dispatch notifications for all items the detectors recently
 * created/updated for `adminId`.
 */
export async function dispatchActionCenterNotifications(
  adminId: string,
  windowMinutes = 10
): Promise<NotifyResult> {
  const result: NotifyResult = {
    itemsConsidered: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    inAppLogged: 0,
    pushSkipped: 0,
    escalated: 0,
    digestQueued: 0,
  };

  const supabase = service();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  // Pull recent open items with their rule definition
  const { data: items, error } = await supabase
    .from("action_center_items")
    .select(`
      id, admin_id, definition_id, code, category, title, body,
      severity, status, assignee_role, assignee_user_id, due_at,
      resolution_url, first_seen_at, last_seen_at, created_at,
      notified_offsets, escalated_at, last_email_at,
      definition:definition_id ( 
        id, code, title, notify_channels, email_recipients, default_assignee_role, is_enabled,
        reminder_offsets_before, reminder_daily_after_due, reminder_daily_max_days,
        send_window, business_hours_start, business_hours_end, skip_weekends, timezone,
        digest_mode, escalation_role, escalation_after_hours, min_hours_between_emails
      )
    `)
    .eq("admin_id", adminId)
    .eq("status", "open")
    .gte("last_seen_at", since);

  if (error) {
    console.error("[AC Notifier] fetch items error:", error.message);
    return result;
  }
  if (!items || items.length === 0) return result;

  result.itemsConsidered = items.length;

  // Items queued for digest
  const digestItems: any[] = [];

  for (const raw of items) {
    const item = raw as any;
    const def = item.definition as any;
    if (!def || def.is_enabled === false) continue;

    const channels: string[] = Array.isArray(def.notify_channels) ? def.notify_channels : [];
    const customRecipients: string[] = Array.isArray(def.email_recipients) ? def.email_recipients : [];
    const notifiedOffsets: number[] = Array.isArray(item.notified_offsets) ? item.notified_offsets : [];
    
    const config: ScheduleConfig = {
      reminder_offsets_before: def.reminder_offsets_before || [30, 14, 7, 3, 1, 0],
      reminder_daily_after_due: def.reminder_daily_after_due ?? true,
      reminder_daily_max_days: def.reminder_daily_max_days ?? 14,
      send_window: def.send_window || "business_hours",
      business_hours_start: def.business_hours_start || "08:00",
      business_hours_end: def.business_hours_end || "18:00",
      skip_weekends: def.skip_weekends ?? true,
      timezone: def.timezone || "Europe/Bucharest",
      digest_mode: def.digest_mode ?? false,
      escalation_role: def.escalation_role,
      escalation_after_hours: def.escalation_after_hours,
      min_hours_between_emails: def.min_hours_between_emails ?? 20,
    };

    // ------------------------------------------------------------------
    // In-App: log once per item lifetime.
    // ------------------------------------------------------------------
    if (channels.includes("in_app")) {
      const { count: existingInApp } = await supabase
        .from("action_center_events")
        .select("id", { count: "exact", head: true })
        .eq("item_id", item.id)
        .eq("event_type", "notification.sent")
        .eq("channel", "in_app");

      if (!existingInApp || existingInApp === 0) {
        await supabase.from("action_center_events").insert({
          admin_id: adminId,
          item_id: item.id,
          event_type: "notification.sent",
          channel: "in_app",
          status: "success",
          actor_label: "system",
          actor_type: "system",
          message: "Surfaced in Action Center inbox and sidebar badge.",
          metadata: { severity: item.severity },
        });
        result.inAppLogged += 1;
      }
    }

    // ------------------------------------------------------------------
    // Check escalation
    // ------------------------------------------------------------------
    if (config.escalation_role && config.escalation_after_hours && !item.escalated_at) {
      const hoursSinceCreated = (Date.now() - new Date(item.first_seen_at || item.created_at).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceCreated >= config.escalation_after_hours) {
        // Mark as escalated
        await supabase
          .from("action_center_items")
          .update({ escalated_at: new Date().toISOString() })
          .eq("id", item.id);
        
        await supabase.from("action_center_events").insert({
          admin_id: adminId,
          item_id: item.id,
          event_type: "escalated",
          status: "success",
          actor_label: "system",
          actor_type: "system",
          message: `Escalated after ${config.escalation_after_hours}h unresolved. Now also notifying: ${config.escalation_role}`,
          metadata: { escalation_role: config.escalation_role, hours_elapsed: Math.round(hoursSinceCreated) },
        });
        result.escalated += 1;
        
        // Update item reference for email sending below
        item.escalated_at = new Date().toISOString();
      }
    }

    // ------------------------------------------------------------------
    // Email: use reminder ladder
    // ------------------------------------------------------------------
    if (channels.includes("email")) {
      const daysUntil = daysUntilDue(item.due_at, config.timezone);
      const reminder = shouldSendReminder(daysUntil, notifiedOffsets, config, item.last_email_at);
      
      // Check business hours
      const withinHours = isWithinBusinessHours(config);
      
      if (!withinHours && reminder.send) {
        await supabase.from("action_center_events").insert({
          admin_id: adminId,
          item_id: item.id,
          event_type: "notification.skipped",
          channel: "email",
          status: "skipped",
          actor_label: "system",
          actor_type: "system",
          message: `Outside business hours (${config.business_hours_start}-${config.business_hours_end} ${config.timezone}). Will send next business day.`,
          metadata: { reason: "business_hours", daysUntil },
        });
        result.emailsSkipped += 1;
        continue;
      }
      
      if (!reminder.send) {
        // Log why we didn't send (but only if we have recent activity)
        if (item.last_seen_at && (Date.now() - new Date(item.last_seen_at).getTime()) < 10 * 60 * 1000) {
          await supabase.from("action_center_events").insert({
            admin_id: adminId,
            item_id: item.id,
            event_type: "notification.skipped",
            channel: "email",
            status: "skipped",
            actor_label: "system",
            actor_type: "system",
            message: reminder.reason,
            metadata: { daysUntil, notifiedOffsets },
          });
        }
        result.emailsSkipped += 1;
        continue;
      }
      
      // Digest mode: queue for batch send
      if (config.digest_mode) {
        digestItems.push({ item, config, daysUntil, offset: reminder.offset });
        result.digestQueued += 1;
        continue;
      }
      
      // Build recipient list = role-based users + custom recipients + escalation role if escalated
      const roles = [item.assignee_role || def.default_assignee_role];
      if (item.escalated_at && config.escalation_role) {
        roles.push(config.escalation_role);
      }
      
      const recipients = await resolveEmailRecipients(
        supabase,
        adminId,
        roles.filter(Boolean),
        customRecipients
      );

      if (recipients.length === 0) {
        await supabase.from("action_center_events").insert({
          admin_id: adminId,
          item_id: item.id,
          event_type: "notification.skipped",
          channel: "email",
          status: "skipped",
          actor_label: "system",
          actor_type: "system",
          message: "No recipients resolved (assignee role has no users and no custom recipients configured).",
        });
        result.emailsSkipped += 1;
        continue;
      }
      
      const reminderContext = daysUntil !== null
        ? daysUntil > 0 ? `${daysUntil} days until due` : daysUntil === 0 ? "Due today" : `${Math.abs(daysUntil)} days overdue`
        : null;
      
      const { subject, html, text } = renderEmail(item, reminderContext, item.escalated_at ? config.escalation_role : null);

      // Send to each recipient
      for (const rcpt of recipients) {
        const send = await sendSystemEmail({
          adminId,
          to: rcpt.email,
          subject,
          html,
          text,
        });

        if (send.success) {
          await supabase.from("action_center_events").insert({
            admin_id: adminId,
            item_id: item.id,
            event_type: "notification.sent",
            channel: "email",
            recipient: rcpt.email,
            status: "success",
            actor_label: "system",
            actor_type: "system",
            message: `Email delivered to ${rcpt.email}${rcpt.label ? ` (${rcpt.label})` : ""}.`,
            metadata: { messageId: send.messageId, source: rcpt.source, offset: reminder.offset, daysUntil },
          });
          result.emailsSent += 1;
        } else {
          await supabase.from("action_center_events").insert({
            admin_id: adminId,
            item_id: item.id,
            event_type: "notification.failed",
            channel: "email",
            recipient: rcpt.email,
            status: "error",
            actor_label: "system",
            actor_type: "system",
            error: send.error,
            message: `Failed to email ${rcpt.email}: ${send.error}`,
            metadata: { source: rcpt.source, offset: reminder.offset },
          });
          result.emailsFailed += 1;
        }
      }
      
      // Update item: record notified offset and last_email_at
      const newOffsets = [...notifiedOffsets, reminder.offset].filter((v, i, a) => a.indexOf(v) === i);
      await supabase
        .from("action_center_items")
        .update({ 
          notified_offsets: newOffsets,
          last_email_at: new Date().toISOString()
        })
        .eq("id", item.id);
    }

    // ------------------------------------------------------------------
    // Push: not yet wired up.
    // ------------------------------------------------------------------
    if (channels.includes("push") && (item.severity === "critical" || item.severity === "high")) {
      const { count: alreadyLogged } = await supabase
        .from("action_center_events")
        .select("id", { count: "exact", head: true })
        .eq("item_id", item.id)
        .eq("channel", "push");

      if (!alreadyLogged || alreadyLogged === 0) {
        await supabase.from("action_center_events").insert({
          admin_id: adminId,
          item_id: item.id,
          event_type: "notification.skipped",
          channel: "push",
          status: "skipped",
          actor_label: "system",
          actor_type: "system",
          message: "Push channel enabled but the push worker is not yet wired up; preference recorded.",
        });
        result.pushSkipped += 1;
      }
    }
  }

  // Handle digest items (we'll send these in a separate daily cron, but mark them as queued)
  // For now, just log that they were queued
  for (const { item, offset } of digestItems) {
    await supabase.from("action_center_events").insert({
      admin_id: adminId,
      item_id: item.id,
      event_type: "notification.queued",
      channel: "email",
      status: "queued",
      actor_label: "system",
      actor_type: "system",
      message: "Queued for daily digest email.",
      metadata: { offset, digest: true },
    });
  }

  return result;
}

interface ResolvedRecipient {
  email: string;
  label?: string;
  source: "role" | "custom" | "escalation";
}

async function resolveEmailRecipients(
  supabase: ReturnType<typeof service>,
  adminId: string,
  roles: (string | null)[],
  customRecipients: string[]
): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = [];
  const seen = new Set<string>();

  // Custom recipients first
  for (const email of customRecipients) {
    if (typeof email !== "string") continue;
    const e = email.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push({ email: email.trim(), source: "custom" });
  }

  const validRoles = roles.filter(Boolean) as string[];
  if (validRoles.length === 0) return out;

  // Get all roles for this admin
  const { data: dbRoles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("admin_id", adminId)
    .eq("is_active", true);

  if (!dbRoles || dbRoles.length === 0) return out;

  // Match role names
  const matchingRoleIds: string[] = [];
  for (const roleKey of validRoles) {
    const k = roleKey.toLowerCase();
    for (const r of dbRoles as any[]) {
      const n = String(r.name || "").toLowerCase();
      if (n === k || n.includes(k) || k.includes(n)) {
        if (!matchingRoleIds.includes(r.id)) {
          matchingRoleIds.push(r.id);
        }
      }
    }
  }

  if (matchingRoleIds.length === 0) return out;

  const { data: users } = await supabase
    .from("users")
    .select("id, email, role_id, status, employee:employee_id(first_name, last_name)")
    .eq("admin_id", adminId)
    .eq("status", "active")
    .in("role_id", matchingRoleIds);

  if (users) {
    for (const u of users as any[]) {
      const email = (u.email || "").trim();
      if (!email) continue;
      const k = email.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const name = [u.employee?.first_name, u.employee?.last_name].filter(Boolean).join(" ");
      out.push({ email, label: name || undefined, source: "role" });
    }
  }

  return out;
}

function renderEmail(
  item: any, 
  reminderContext: string | null,
  escalatedTo: string | null
): { subject: string; html: string; text: string } {
  const sevLabel = SEVERITY_LABEL[item.severity] || item.severity;
  const subject = `[${sevLabel}] ${item.title}${reminderContext ? ` - ${reminderContext}` : ""}`;
  
  const due = item.due_at
    ? new Date(item.due_at).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
    
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bngtracking.ro").replace(/\/+$/, "");
  const inboxUrl = `${appBase}/admin/action-center`;

  // Always render links against the configured public host. If detectors
  // stored a full URL using the deployment hostname (e.g. a vercel preview
  // URL), strip it and keep only the path so emails always point at
  // app.bngtracking.ro.
  let url = inboxUrl;
  if (item.resolution_url) {
    let path = String(item.resolution_url).trim();
    if (/^https?:\/\//i.test(path)) {
      try {
        const u = new URL(path);
        path = `${u.pathname}${u.search}${u.hash}`;
      } catch {
        path = "";
      }
    }
    if (path) {
      if (!path.startsWith("/")) path = `/${path}`;
      url = `${appBase}${path}`;
    }
  }

  const escalationBanner = escalatedTo 
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;padding:12px;border-radius:6px;margin-bottom:16px">
        <strong style="color:#92400e">Escalated</strong>
        <p style="margin:4px 0 0;font-size:13px;color:#78350f">This item has been escalated to ${escalatedTo} due to no resolution within the expected timeframe.</p>
       </div>`
    : "";

  const reminderBadge = reminderContext
    ? `<span style="display:inline-block;background:#dbeafe;color:#1e40af;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:8px">${reminderContext}</span>`
    : "";

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      ${escalationBanner}
      <div style="border-left:4px solid ${severityColor(item.severity)};padding:8px 16px;background:#f8fafc;border-radius:4px;margin-bottom:16px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">${sevLabel} — ${item.category}${reminderBadge}</div>
        <h1 style="margin:4px 0 0;font-size:20px;line-height:1.3">${escapeHtml(item.title)}</h1>
      </div>
      ${item.body ? `<p style="font-size:14px;line-height:1.5;color:#334155">${escapeHtml(item.body)}</p>` : ""}
      ${due ? `<p style="font-size:13px;color:#64748b"><strong>Due:</strong> ${due}</p>` : ""}
      <p style="margin-top:24px"><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">Open in Action Center</a></p>
      <p style="font-size:12px;color:#64748b;margin-top:8px">Or paste this URL into your browser: <a href="${url}" style="color:#0f172a">${url}</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
      <p style="font-size:12px;color:#94a3b8">You are receiving this because your account is configured to receive Action Center notifications for <strong>${escapeHtml(item.code)}</strong>. Update your preferences in Settings &gt; Action Center.</p>
    </div>
  `;

  const text = [
    `[${sevLabel}] ${item.title}`,
    reminderContext ? `Status: ${reminderContext}` : "",
    escalatedTo ? `ESCALATED to ${escalatedTo}` : "",
    item.body || "",
    due ? `Due: ${due}` : "",
    `Open: ${url}`,
    "",
    "Update preferences in Settings > Action Center.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function severityColor(sev: string): string {
  switch (sev) {
    case "critical": return "#dc2626";
    case "high": return "#ea580c";
    case "medium": return "#ca8a04";
    default: return "#2563eb";
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Helper for the cron route: walk every admin and dispatch.
 */
export async function dispatchAllAdmins(windowMinutes = 10): Promise<{
  admins: number;
  totals: NotifyResult;
}> {
  const supabase = service();
  const { data: admins } = await supabase.from("admins").select("id").eq("is_active", true);

  const totals: NotifyResult = {
    itemsConsidered: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    inAppLogged: 0,
    pushSkipped: 0,
    escalated: 0,
    digestQueued: 0,
  };

  if (!admins) return { admins: 0, totals };

  for (const a of admins) {
    const r = await dispatchActionCenterNotifications((a as any).id, windowMinutes);
    totals.itemsConsidered += r.itemsConsidered;
    totals.emailsSent += r.emailsSent;
    totals.emailsFailed += r.emailsFailed;
    totals.emailsSkipped += r.emailsSkipped;
    totals.inAppLogged += r.inAppLogged;
    totals.pushSkipped += r.pushSkipped;
    totals.escalated += r.escalated;
    totals.digestQueued += r.digestQueued;
  }

  return { admins: admins.length, totals };
}

/**
 * Send daily digest emails for rules with digest_mode=true.
 * Call this from a separate daily cron at 09:00 local time.
 */
export async function sendDailyDigests(): Promise<{
  admins: number;
  emailsSent: number;
  emailsFailed: number;
}> {
  const supabase = service();
  const result = { admins: 0, emailsSent: 0, emailsFailed: 0 };
  
  const { data: admins } = await supabase.from("admins").select("id").eq("is_active", true);
  if (!admins) return result;
  
  for (const admin of admins) {
    const adminId = (admin as any).id;
    
    // Get open items with digest_mode rules
    const { data: items } = await supabase
      .from("action_center_items")
      .select(`
        id, admin_id, code, category, title, body, severity, status, due_at,
        definition:definition_id ( id, digest_mode, default_assignee_role, email_recipients, notify_channels )
      `)
      .eq("admin_id", adminId)
      .eq("status", "open");
    
    if (!items || items.length === 0) continue;
    
    // Filter to digest-mode items
    const digestItems = items.filter((i: any) => i.definition?.digest_mode && i.definition?.notify_channels?.includes("email"));
    if (digestItems.length === 0) continue;
    
    // Group by category
    const byCategory: Record<string, any[]> = {};
    for (const item of digestItems) {
      const cat = (item as any).category || "Other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }
    
    // Gather recipients from all digest rules
    const allRecipients = new Set<string>();
    for (const item of digestItems) {
      const def = (item as any).definition;
      const custom = Array.isArray(def.email_recipients) ? def.email_recipients : [];
      for (const e of custom) {
        if (typeof e === "string" && e.trim()) allRecipients.add(e.trim().toLowerCase());
      }
      
      const role = def.default_assignee_role;
      if (role) {
        const recipients = await resolveEmailRecipients(supabase, adminId, [role], []);
        for (const r of recipients) allRecipients.add(r.email.toLowerCase());
      }
    }
    
    if (allRecipients.size === 0) continue;
    
    // Render digest email
    const { subject, html, text } = renderDigestEmail(digestItems, byCategory);
    
    for (const email of allRecipients) {
      const send = await sendSystemEmail({ adminId, to: email, subject, html, text });
      
      if (send.success) {
        result.emailsSent += 1;
        // Log for each item included
        for (const item of digestItems) {
          await supabase.from("action_center_events").insert({
            admin_id: adminId,
            item_id: (item as any).id,
            event_type: "notification.sent",
            channel: "email",
            recipient: email,
            status: "success",
            actor_label: "system",
            actor_type: "system",
            message: `Included in daily digest to ${email}.`,
            metadata: { digest: true },
          });
        }
      } else {
        result.emailsFailed += 1;
      }
    }
    
    result.admins += 1;
  }
  
  return result;
}

function renderDigestEmail(
  items: any[],
  byCategory: Record<string, any[]>
): { subject: string; html: string; text: string } {
  const criticalCount = items.filter(i => i.severity === "critical").length;
  const highCount = items.filter(i => i.severity === "high").length;
  
  const subject = `Action Center Daily Summary: ${items.length} open items${criticalCount > 0 ? ` (${criticalCount} critical)` : ""}`;
  
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bngtracking.ro").replace(/\/+$/, "");
  const inboxUrl = `${appBase}/admin/action-center`;
  
  let categoryHtml = "";
  let categoryText = "";
  
  for (const [cat, catItems] of Object.entries(byCategory)) {
    categoryHtml += `<h3 style="margin:16px 0 8px;font-size:14px;color:#475569">${escapeHtml(cat)} (${catItems.length})</h3><ul style="margin:0;padding-left:20px">`;
    categoryText += `\n${cat} (${catItems.length}):\n`;
    
    for (const item of catItems) {
      const sev = SEVERITY_LABEL[item.severity] || item.severity;
      const dueStr = item.due_at ? ` - Due ${new Date(item.due_at).toLocaleDateString()}` : "";
      categoryHtml += `<li style="margin:4px 0;font-size:13px"><span style="color:${severityColor(item.severity)}">[${sev}]</span> ${escapeHtml(item.title)}${dueStr}</li>`;
      categoryText += `  - [${sev}] ${item.title}${dueStr}\n`;
    }
    
    categoryHtml += "</ul>";
  }
  
  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 8px">Action Center Daily Summary</h1>
      <p style="color:#64748b;margin:0 0 16px">You have <strong>${items.length} open items</strong> requiring attention.</p>
      
      <div style="display:flex;gap:12px;margin-bottom:20px">
        ${criticalCount > 0 ? `<div style="background:#fef2f2;border:1px solid #fecaca;padding:8px 12px;border-radius:6px"><span style="font-size:20px;font-weight:bold;color:#dc2626">${criticalCount}</span><span style="font-size:12px;color:#991b1b;margin-left:4px">Critical</span></div>` : ""}
        ${highCount > 0 ? `<div style="background:#fff7ed;border:1px solid #fed7aa;padding:8px 12px;border-radius:6px"><span style="font-size:20px;font-weight:bold;color:#ea580c">${highCount}</span><span style="font-size:12px;color:#9a3412;margin-left:4px">High</span></div>` : ""}
      </div>
      
      ${categoryHtml}
      
      <p style="margin-top:24px"><a href="${inboxUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">Open Action Center</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
      <p style="font-size:12px;color:#94a3b8">This is your daily digest of Action Center items. Update your preferences in Settings &gt; Action Center.</p>
    </div>
  `;
  
  const text = [
    "Action Center Daily Summary",
    `You have ${items.length} open items requiring attention.`,
    criticalCount > 0 ? `${criticalCount} Critical` : "",
    highCount > 0 ? `${highCount} High` : "",
    categoryText,
    `Open Action Center: ${inboxUrl}`,
  ].filter(Boolean).join("\n");
  
  return { subject, html, text };
}
