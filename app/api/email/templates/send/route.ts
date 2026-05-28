import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST: Render a template with variables and send the email
export async function POST(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  const userId = request.headers.get("x-user-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { templateId, languageCode, to, cc, variables, attachments } = body;

  if (!templateId || !languageCode || !to) {
    return NextResponse.json({ error: "templateId, languageCode, and to are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Get the template translation
  const { data: translation, error: transErr } = await supabase
    .from("email_template_translations")
    .select("subject, body_html, body_text")
    .eq("template_id", templateId)
    .eq("language_code", languageCode)
    .single();

  if (transErr || !translation) {
    return NextResponse.json({ error: `No translation found for language: ${languageCode}` }, { status: 404 });
  }

  // Replace {{variable}} placeholders
  const vars = variables || {};
  const renderTemplate = (text: string) => {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
    });
  };

  const renderedSubject = renderTemplate(translation.subject);
  const renderedHtml = renderTemplate(translation.body_html);
  const renderedText = renderTemplate(translation.body_text || "");

  // Send via the existing send endpoint logic.
  // Per-user mailbox first, then fall back to a legacy tenant-scoped row.
  let settings: any = null;
  if (userId) {
    const { data } = await supabase
      .from("user_email_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_pass, email_address, display_name")
      .eq("admin_id", adminId)
      .eq("user_id", userId)
      .maybeSingle();
    settings = data ?? null;
  }
  if (!settings) {
    const { data } = await supabase
      .from("user_email_settings")
      .select("smtp_host, smtp_port, smtp_user, smtp_pass, email_address, display_name")
      .eq("admin_id", adminId)
      .is("user_id", null)
      .maybeSingle();
    settings = data ?? null;
  }

  if (!settings?.smtp_host) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });
  }

  // Use nodemailer to send
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port || 587,
    secure: settings.smtp_port === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
  });

  const mailOptions: any = {
    from: settings.display_name
      ? `"${settings.display_name}" <${settings.email_address}>`
      : settings.email_address,
    to,
    cc: cc || undefined,
    subject: renderedSubject,
    html: `<div style="font-family:sans-serif;font-size:14px">${renderedHtml}</div>`,
    text: renderedText,
  };

  if (attachments && Array.isArray(attachments)) {
    mailOptions.attachments = attachments.map((a: any) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      contentType: a.contentType,
    }));
  }

  try {
    const info = await transporter.sendMail(mailOptions);

    // Save to sent folder in DB
    await supabase.from("user_emails").insert({
      admin_id: adminId,
      message_id: info.messageId,
      folder: "sent",
      from_address: settings.email_address,
      from_name: settings.display_name || null,
      to_address: to,
      subject: renderedSubject,
      body_text: renderedText,
      body_html: renderedHtml,
      is_read: true,
      date: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to send: " + err.message }, { status: 500 });
  }
}
