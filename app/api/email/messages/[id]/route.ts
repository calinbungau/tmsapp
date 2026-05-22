import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Fetch full email body from IMAP by uid
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get the cached email record
    const { data: email, error: emailErr } = await supabase
      .from("user_emails")
      .select("*")
      .eq("id", id)
      .eq("admin_id", adminId)
      .single();

    if (emailErr || !email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Get IMAP settings
    const { data: settings } = await supabase
      .from("user_email_settings")
      .select("*")
      .eq("admin_id", adminId)
      .single();

    if (!settings || !settings.imap_password_encrypted) {
      return NextResponse.json({ error: "Email not configured" }, { status: 400 });
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

    let bodyHtml = "";
    let bodyText = "";
    const attachments: any[] = [];

    try {
      await client.connect();
        const lock = await client.getMailboxLock(email.mailbox || "INBOX");

      try {
        // Fetch full message source by UID
        const source = await client.download(email.uid.toString(), undefined, { uid: true });
        if (source?.content) {
          const chunks: Buffer[] = [];
          for await (const chunk of source.content) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const raw = Buffer.concat(chunks);
          const parsed = await simpleParser(raw);

          bodyHtml = parsed.html || "";
          bodyText = parsed.text || "";

          if (parsed.attachments && parsed.attachments.length > 0) {
            for (const att of parsed.attachments) {
              attachments.push({
                filename: att.filename || "attachment",
                contentType: att.contentType || "application/octet-stream",
                size: att.size || 0,
                contentId: att.contentId || null,
                // Return base64 content for download
                content: att.content.toString("base64"),
              });
            }
          }
        }

        // Mark as seen on IMAP
        await client.messageFlagsAdd(email.uid.toString(), ["\\Seen"], { uid: true });
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (connErr: any) {
      return NextResponse.json({ error: "Failed to fetch email: " + connErr.message }, { status: 500 });
    }

    // Mark as read in DB
    await supabase.from("user_emails").update({ is_read: true }).eq("id", email.id);

    return NextResponse.json({
      email: {
        ...email,
        is_read: true,
        body_html: bodyHtml,
        body_text: bodyText,
        attachments,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
