import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSystemEmail } from "@/lib/system-email";

// Force Node.js runtime for nodemailer DNS lookup support
export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST: Send a report via email
 * Body: { adminId, recipients: string[], subject, reportData, reportType, locale, format, dateFrom, dateTo, title }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminId, recipients, subject, reportData, reportType, locale = "en", format = "xlsx", dateFrom, dateTo, title } = body;

    if (!adminId || !recipients || recipients.length === 0) {
      return NextResponse.json({ error: "adminId and recipients are required" }, { status: 400 });
    }

    // Get company profile for branding
    const { data: company } = await supabase
      .from("company_profiles")
      .select("company_name, email, logo_url")
      .eq("admin_id", adminId)
      .single();

    const isRo = locale === "ro";
    const emailSubject = subject || `${isRo ? "Raport" : "Report"}: ${title || reportType}`;

    const fromDate = dateFrom ? new Date(dateFrom).toLocaleDateString(isRo ? "ro-RO" : "en-US") : "";
    const toDate = dateTo ? new Date(dateTo).toLocaleDateString(isRo ? "ro-RO" : "en-US") : "";

    // Build email HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1f2e; margin: 0; padding: 0; background: #f5f7fa; }
          .wrapper { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%); color: white; padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .header p { margin: 8px 0 0; opacity: 0.85; font-size: 14px; }
          .content { padding: 32px 24px; }
          .info-box { background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
          .info-row:last-child { border-bottom: none; }
          .info-label { color: #64748b; font-size: 13px; }
          .info-value { color: #1a1f2e; font-weight: 500; font-size: 14px; }
          .btn { display: inline-block; padding: 14px 28px; background: #f59e0b; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 16px; }
          .btn:hover { background: #d97706; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 4px 0; color: #64748b; font-size: 12px; }
          .attachment-note { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .attachment-note p { margin: 0; font-size: 13px; color: #92400e; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>${company?.company_name || "Fleet Report"}</h1>
            <p>${isRo ? "Raport Telematic" : "Telematic Report"}</p>
          </div>
          <div class="content">
            <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1f2e;">${title || reportType}</h2>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">${isRo ? "Tip Raport" : "Report Type"}</span>
                <span class="info-value">${title || reportType}</span>
              </div>
              <div class="info-row">
                <span class="info-label">${isRo ? "Perioada" : "Period"}</span>
                <span class="info-value">${fromDate} - ${toDate}</span>
              </div>
              <div class="info-row">
                <span class="info-label">${isRo ? "Vehicule" : "Vehicles"}</span>
                <span class="info-value">${Array.isArray(reportData) ? reportData.length : 0}</span>
              </div>
              <div class="info-row">
                <span class="info-label">${isRo ? "Format" : "Format"}</span>
                <span class="info-value">${format.toUpperCase()}</span>
              </div>
            </div>

            ${format === "xlsx" ? `
            <div class="attachment-note">
              <p><strong>${isRo ? "Fisier atasat:" : "Attached file:"}</strong> ${isRo ? "Raportul Excel este atasat acestui email." : "The Excel report is attached to this email."}</p>
            </div>
            ` : ""}

            <p style="color: #475569; font-size: 14px;">
              ${isRo 
                ? "Puteti vizualiza raportul complet si interactiona cu datele online folosind butonul de mai jos." 
                : "You can view the full report and interact with the data online using the button below."}
            </p>

            <center>
              <a href="${process.env.NEXT_PUBLIC_URL || "https://app.example.com"}/admin/telematic/reports" class="btn">
                ${isRo ? "Deschide in Aplicatie" : "Open in Application"}
              </a>
            </center>
          </div>
          <div class="footer">
            <p><strong>${company?.company_name || "BNG Tracking"}</strong></p>
            <p>${isRo ? "Acest email a fost generat automat" : "This email was automatically generated"}</p>
            <p>${new Date().toLocaleDateString(isRo ? "ro-RO" : "en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Generate Excel attachment if format is xlsx
    let attachments: { filename: string; content: Buffer }[] = [];
    
    if (format === "xlsx" && reportData && Array.isArray(reportData) && reportData.length > 0) {
      try {
        const exportRes = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/reports/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: "xlsx",
            data: reportData,
            title: title || reportType,
            locale,
            dateFrom,
            dateTo,
            reportType,
          }),
        });

        if (exportRes.ok) {
          const buffer = await exportRes.arrayBuffer();
          const filename = `${(title || reportType).replace(/[^a-zA-Z0-9_-]/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
          attachments.push({
            filename,
            content: Buffer.from(buffer),
          });
        }
      } catch (exportErr) {
        console.error("Failed to generate Excel attachment:", exportErr);
      }
    }

    // Send email using System SMTP
    const emailResult = await sendSystemEmail({
      adminId,
      to: recipients,
      subject: emailSubject,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (!emailResult.success) {
      // If system email not configured, queue for later
      if (emailResult.error?.includes("not configured")) {
        for (const recipient of recipients) {
          await supabase.from("notification_queue").insert({
            admin_id: adminId,
            notification_type: "report_email",
            channel_email: true,
            channel_web: false,
            channel_push: false,
            title: emailSubject,
            body: html,
            data: {
              to: recipient,
              subject: emailSubject,
              html,
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
                encoding: "base64",
              })),
            },
            status: "pending",
            priority: "normal",
          });
        }

        return NextResponse.json({ 
          success: false, 
          error: "System email not configured. Please configure it in Settings > System Email.",
          queued: true,
          message: `Report queued for ${recipients.length} recipient(s) - will be sent once system email is configured.`,
        }, { status: 400 });
      }

      return NextResponse.json({ error: emailResult.error }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Report sent to ${recipients.length} recipient(s)`,
      recipients,
      messageId: emailResult.messageId,
    });
  } catch (err) {
    console.error("Send email error:", err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : "Failed to send email" 
    }, { status: 500 });
  }
}
