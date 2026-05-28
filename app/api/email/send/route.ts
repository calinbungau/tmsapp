import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import nodemailer from "nodemailer";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { to, cc, bcc, subject, html, text, inReplyTo, references, attachments } = body;

    if (!to || !subject) {
      return NextResponse.json({ error: "To and Subject are required" }, { status: 400 });
    }

    // Get SMTP settings for the acting user
    const settings = await getUserEmailSettingsRow(supabase, adminId, userId);

    if (!settings || !settings.smtp_password_encrypted) {
      return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });
    }

    const smtpPass = decrypt(settings.smtp_password_encrypted);

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: { user: settings.smtp_user, pass: smtpPass },
      connectionTimeout: 15000,
      socketTimeout: 15000,
    });

    const fromAddress = settings.display_name
      ? `"${settings.display_name}" <${settings.email_address}>`
      : settings.email_address;

    // Build signature
    const fullHtml = settings.signature_html
      ? `${html || ""}<br/><br/>${settings.signature_html}`
      : html || text || "";

    const mailOptions: any = {
      from: fromAddress,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html: fullHtml,
      text: text || undefined,
    };

    if (cc) mailOptions.cc = Array.isArray(cc) ? cc.join(", ") : cc;
    if (bcc) mailOptions.bcc = Array.isArray(bcc) ? bcc.join(", ") : bcc;
    if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
    if (references) mailOptions.references = references;

    // Handle attachments (base64 encoded)
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att: any) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      }));
    }

    const info = await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
