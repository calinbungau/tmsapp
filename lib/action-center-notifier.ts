/**
 * Action Center notifier.
 *
 * Responsibility:
 *   After detectors run and items are inserted/updated, dispatch
 *   notifications according to each rule's configured channels and
 *   record every attempt in `action_center_events` so admins have a
 *   per-item audit trail ("created", "notification.sent to X@y.com",
 *   "notification.failed", etc.).
 *
 * Invariants we care about:
 *   - We only notify for items that are "fresh" — created within the
 *     window we were asked to consider (so a 5-minute cron run only
 *     emails about items detected in the last ~6 minutes, not the
 *     whole backlog every tick).
 *   - We only email per-item once. If `action_center_events` already
 *     has a `notification.sent` row with channel='email' for the
 *     item, we skip and log a `notification.skipped` event.
 *   - Push is logged as `skipped` for now — the worker is not yet
 *     wired up. The admin still sees in the timeline that we *would*
 *     have sent it, which is what they're asking for.
 *   - In-App is implicitly delivered the moment the row exists in
 *     `action_center_items`, so we log a single `notification.sent`
 *     with channel='in_app' on first creation.
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
}

/**
 * Dispatch notifications for all items the detectors recently
 * created/updated for `adminId`.
 *
 * "Recent" = items whose `last_seen_at` is within the last
 * `windowMinutes` (default 10). We use last_seen_at instead of
 * created_at so that a freshly-detected item that was previously
 * resolved and re-opened still gets a notification.
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
  };

  const supabase = service();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  // Pull recent open items for this admin together with their rule
  // definition (notify_channels, custom recipients, default role).
  const { data: items, error } = await supabase
    .from("action_center_items")
    .select(`
      id, admin_id, definition_id, code, category, title, body,
      severity, status, assignee_role, assignee_user_id, due_at,
      resolution_url, first_seen_at, last_seen_at, created_at,
      definition:definition_id ( id, code, title, notify_channels, email_recipients, default_assignee_role, is_enabled )
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

  for (const raw of items) {
    const item = raw as any;
    const def = item.definition as any;
    if (!def || def.is_enabled === false) continue;

    const channels: string[] = Array.isArray(def.notify_channels) ? def.notify_channels : [];
    const customRecipients: string[] = Array.isArray(def.email_recipients) ? def.email_recipients : [];

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
    // Email: only once per item.
    // ------------------------------------------------------------------
    if (channels.includes("email")) {
      const { count: alreadyEmailed } = await supabase
        .from("action_center_events")
        .select("id", { count: "exact", head: true })
        .eq("item_id", item.id)
        .eq("event_type", "notification.sent")
        .eq("channel", "email");

      if (alreadyEmailed && alreadyEmailed > 0) {
        // Don't spam — but record that we considered it so the
        // admin sees we *did* run on this tick.
        await supabase.from("action_center_events").insert({
          admin_id: adminId,
          item_id: item.id,
          event_type: "notification.skipped",
          channel: "email",
          status: "skipped",
          actor_label: "system",
          actor_type: "system",
          message: "Email already sent for this item; skipping duplicate.",
        });
        result.emailsSkipped += 1;
      } else {
        // Build recipient list = role-based users + custom recipients
        const recipients = await resolveEmailRecipients(
          supabase,
          adminId,
          item.assignee_role || def.default_assignee_role,
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
        } else {
          const { subject, html, text } = renderEmail(item);

          // Send one mail per recipient so each entry in the timeline
          // is auditable on its own (paid SMTP providers also tend to
          // dedupe better with single-recipient messages).
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
                metadata: { messageId: send.messageId, source: rcpt.source },
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
                metadata: { source: rcpt.source },
              });
              result.emailsFailed += 1;
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Push: not yet wired up. Log a skipped event so the timeline
    // honestly shows why it didn't happen.
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

  return result;
}

interface ResolvedRecipient {
  email: string;
  label?: string;
  source: "role" | "custom";
}

async function resolveEmailRecipients(
  supabase: ReturnType<typeof service>,
  adminId: string,
  role: string | null,
  customRecipients: string[]
): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = [];
  const seen = new Set<string>();

  // Custom recipients first — these are the addresses the admin
  // explicitly opted in for this rule.
  for (const email of customRecipients) {
    if (typeof email !== "string") continue;
    const e = email.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push({ email: email.trim(), source: "custom" });
  }

  if (!role) return out;

  // Role-based recipients.
  //
  // The TMS schema stores roles in two places that are *not* the same:
  //   - `action_center_definitions.default_assignee_role` is a free-text
  //     identifier like "fleet", "finance", "dispatcher" (set during
  //     seeding).
  //   - `roles.name` is the human label like "Fleet Manager", "Finance",
  //     "Dispatcher", and that's what `users.role_id` actually points to.
  //
  // We do a forgiving case-insensitive match: any role under the admin
  // whose name *contains* the assignee key counts. Then we look up
  // active users (status='active') with that role_id and join their
  // employee record for the display name.
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("admin_id", adminId)
    .eq("is_active", true);

  const matchingRoleIds = (roles || [])
    .filter((r: any) => {
      const n = String(r.name || "").toLowerCase();
      const k = role.toLowerCase();
      return n === k || n.includes(k) || k.includes(n);
    })
    .map((r: any) => r.id);

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

function renderEmail(item: any): { subject: string; html: string; text: string } {
  const sevLabel = SEVERITY_LABEL[item.severity] || item.severity;
  const subject = `[${sevLabel}] ${item.title}`;
  const due = item.due_at
    ? new Date(item.due_at).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const url = item.resolution_url
    ? item.resolution_url.startsWith("http")
      ? item.resolution_url
      : `https://app.example.com${item.resolution_url}` // placeholder; SMTP clients handle relative just fine
    : null;

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <div style="border-left:4px solid ${severityColor(item.severity)};padding:8px 16px;background:#f8fafc;border-radius:4px;margin-bottom:16px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b">${sevLabel} — ${item.category}</div>
        <h1 style="margin:4px 0 0;font-size:20px;line-height:1.3">${escapeHtml(item.title)}</h1>
      </div>
      ${item.body ? `<p style="font-size:14px;line-height:1.5;color:#334155">${escapeHtml(item.body)}</p>` : ""}
      ${due ? `<p style="font-size:13px;color:#64748b"><strong>Due:</strong> ${due}</p>` : ""}
      ${url ? `<p style="margin-top:24px"><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">Open in Action Center</a></p>` : ""}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
      <p style="font-size:12px;color:#94a3b8">You are receiving this because your account is configured to receive Action Center notifications for <strong>${escapeHtml(item.code)}</strong>. Update your preferences in Settings &gt; Action Center.</p>
    </div>
  `;

  const text = [
    `[${sevLabel}] ${item.title}`,
    item.body || "",
    due ? `Due: ${due}` : "",
    url ? `Open: ${url}` : "",
    "",
    "Update preferences in Settings > Action Center.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function severityColor(sev: string): string {
  switch (sev) {
    case "critical":
      return "#dc2626";
    case "high":
      return "#ea580c";
    case "medium":
      return "#ca8a04";
    default:
      return "#2563eb";
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
 *
 * We deliberately keep this in app code (not in SQL) because emails
 * need the SMTP creds + nodemailer and we want one consistent log
 * trail in `action_center_events` regardless of who triggered it
 * (cron, manual run, future webhook, etc.).
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
  }

  return { admins: admins.length, totals };
}
