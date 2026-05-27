import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { ImapFlow } from "imapflow";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_FETCH = 50; // Fetch latest 50 per sync

export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    const body = await request.json();
    const folder = body.folder || "INBOX";

    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get user email settings (per-user with legacy fallback)
    const settings = await getUserEmailSettingsRow(supabase, adminId, userId);

    if (!settings) {
      return NextResponse.json({ error: "Email not configured" }, { status: 400 });
    }

    if (!settings.imap_password_encrypted) {
      return NextResponse.json({ error: "IMAP password not set" }, { status: 400 });
    }

    const imapPass = decrypt(settings.imap_password_encrypted);

    const client = new ImapFlow({
      host: settings.imap_host,
      port: settings.imap_port,
      secure: settings.imap_secure,
      auth: { user: settings.imap_user, pass: imapPass },
      logger: false,
      greetTimeout: 15000,
      socketTimeout: 15000,
    });

    let synced = 0;

    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);

      try {
        // Get existing message_ids so we skip duplicates. Scope to the
        // *mailbox* (user_email_setting_id) so each user's inbox is
        // isolated even when multiple users share a tenant.
        const { data: existing } = await supabase
          .from("user_emails")
          .select("message_id")
          .eq("user_email_setting_id", settings.id)
          .eq("mailbox", folder);
        const existingIds = new Set((existing || []).map((e: any) => e.message_id));

        // Fetch latest messages
        const status = client.mailbox;
        if (!status || !status.exists || status.exists === 0) {
          await lock.release();
          await client.logout();
          await supabase.from("user_email_settings").update({ last_sync_at: new Date().toISOString(), sync_error: null }).eq("id", settings.id);
          return NextResponse.json({ synced: 0, folder });
        }

        const total = status.exists;
        const from = Math.max(1, total - MAX_FETCH + 1);
        const range = `${from}:${total}`;

        const messages: any[] = [];

        for await (const msg of client.fetch(range, {
          envelope: true,
          flags: true,
          bodyStructure: true,
          uid: true,
        })) {
          const env = msg.envelope;
          if (!env?.messageId) continue;
          if (existingIds.has(env.messageId)) continue;

          const fromAddr = env.from?.[0];
          const toAddrs = env.to || [];
          const ccAddrs = env.cc || [];

          // Check if has attachments from bodyStructure
          let hasAttachments = false;
          if (msg.bodyStructure) {
            const checkParts = (part: any): boolean => {
              if (part.disposition === "attachment" || part.disposition === "inline") return true;
              if (part.childNodes) return part.childNodes.some(checkParts);
              return false;
            };
            hasAttachments = checkParts(msg.bodyStructure);
          }

          messages.push({
            admin_id: adminId,
            user_email_setting_id: settings.id,
            message_id: env.messageId,
            uid: msg.uid,
            mailbox: folder,
            subject: env.subject || "(No subject)",
            from_address: fromAddr ? (fromAddr.address || "") : "",
            from_name: fromAddr ? (fromAddr.name || fromAddr.address || "") : "",
            to_addresses: toAddrs.map((a: any) => a.address).filter(Boolean),
            cc_addresses: ccAddrs.map((a: any) => a.address).filter(Boolean),
            date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
            snippet: "",
            is_read: msg.flags?.has("\\Seen") || false,
            is_starred: msg.flags?.has("\\Flagged") || false,
            has_attachments: hasAttachments,
            flags: Array.from(msg.flags || []),
          });
        }

        // Insert in batches
        if (messages.length > 0) {
          const { error: insErr } = await supabase.from("user_emails").upsert(messages, {
            onConflict: "user_email_setting_id,mailbox,uid",
            ignoreDuplicates: true,
          });
          if (insErr) console.error("Insert error:", insErr);
          synced = messages.length;

          // Create in-app notifications for new unread inbox emails
          const newUnread = messages.filter((m) => !m.is_read && m.mailbox === "INBOX");
          if (newUnread.length > 0) {
            // Get admin's user_id from users table (for user_notifications FK)
            const { data: adminUser } = await supabase
              .from("users")
              .select("id")
              .eq("admin_id", adminId)
              .eq("role", "admin")
              .limit(1)
              .maybeSingle();
            const notifUserId = adminUser?.id || adminId;

            for (const email of newUnread.slice(0, 10)) { // Cap at 10 to avoid spam
              try {
                const { data: notif } = await supabase
                  .from("notifications")
                  .insert({
                    admin_id: adminId,
                    target_type: "user",
                    target_id: notifUserId,
                    title: `New email from ${email.from_name || email.from_address}`,
                    body: email.subject || "(No subject)",
                    icon: "mail",
                    action_url: "/admin/email",
                    notification_type: "email_received",
                    priority: "normal",
                    channels_sent: ["in_app"],
                  })
                  .select("id")
                  .single();

                if (notif) {
                  await supabase.from("user_notifications").insert({
                    notification_id: notif.id,
                    user_id: notifUserId,
                  });
                }
              } catch { /* non-critical */ }
            }
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (connErr: any) {
      // Save sync error
      await supabase.from("user_email_settings").update({ sync_error: connErr.message }).eq("id", settings.id);
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    // Update last sync time
    await supabase.from("user_email_settings").update({
      last_sync_at: new Date().toISOString(),
      sync_error: null,
    }).eq("id", settings.id);

    return NextResponse.json({ synced, folder });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
