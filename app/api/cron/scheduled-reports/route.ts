import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSystemEmail } from "@/lib/system-email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Cron job to run scheduled reports and send via email
 * Should be triggered every hour via Vercel Cron or external scheduler
 * 
 * Recurrence ranges:
 * - "daily" = run every day for yesterday's data
 * - "weekly" = run every Monday for last week's data
 * - "monthly" = run on 1st of month for last month's data
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: { configId: string; status: string; error?: string }[] = [];

  try {
    // Get all active recurring report configurations
    const { data: configs, error: configsErr } = await supabase
      .from("report_configurations")
      .select("*")
      .eq("is_recurring", true);

    if (configsErr) {
      return NextResponse.json({ error: configsErr.message }, { status: 500 });
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ message: "No scheduled reports to run", results: [] });
    }

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday
    const currentDate = now.getUTCDate();

    for (const config of configs) {
      try {
        // Determine if this report should run now based on recurrence_range
        let shouldRun = false;
        let dateFrom: Date;
        let dateTo: Date;

        switch (config.recurrence_range) {
          case "daily":
            // Run every day at configured hour (default 6 AM UTC)
            const dailyHour = config.recurrence_cron ? parseInt(config.recurrence_cron) : 6;
            shouldRun = currentHour === dailyHour;
            // Yesterday's data
            dateTo = new Date(now);
            dateTo.setUTCHours(0, 0, 0, 0);
            dateFrom = new Date(dateTo);
            dateFrom.setUTCDate(dateFrom.getUTCDate() - 1);
            break;

          case "weekly":
            // Run every Monday at configured hour
            const weeklyHour = config.recurrence_cron ? parseInt(config.recurrence_cron) : 6;
            shouldRun = currentDay === 1 && currentHour === weeklyHour;
            // Last week's data (Monday to Sunday)
            dateTo = new Date(now);
            dateTo.setUTCHours(0, 0, 0, 0);
            dateTo.setUTCDate(dateTo.getUTCDate() - dateTo.getUTCDay()); // Go to last Sunday
            dateFrom = new Date(dateTo);
            dateFrom.setUTCDate(dateFrom.getUTCDate() - 7);
            dateTo.setUTCDate(dateTo.getUTCDate() + 1); // End of Sunday
            break;

          case "monthly":
            // Run on 1st of month at configured hour
            const monthlyHour = config.recurrence_cron ? parseInt(config.recurrence_cron) : 6;
            shouldRun = currentDate === 1 && currentHour === monthlyHour;
            // Last month's data
            dateTo = new Date(now);
            dateTo.setUTCDate(1);
            dateTo.setUTCHours(0, 0, 0, 0);
            dateFrom = new Date(dateTo);
            dateFrom.setUTCMonth(dateFrom.getUTCMonth() - 1);
            break;

          default:
            // Custom cron expression (not implemented yet)
            shouldRun = false;
            dateFrom = new Date();
            dateTo = new Date();
        }

        if (!shouldRun) {
          results.push({ configId: config.id, status: "skipped", error: "Not scheduled for this time" });
          continue;
        }

        // Generate the report
        const reportData = await generateReport(config, dateFrom, dateTo);

        // Save report run
        const { data: run, error: runErr } = await supabase
          .from("report_runs")
          .insert({
            admin_id: config.admin_id,
            configuration_id: config.id,
            report_type: config.report_type,
            name: `${config.name} - ${dateFrom.toISOString().split("T")[0]}`,
            date_from: dateFrom.toISOString(),
            date_to: dateTo.toISOString(),
            device_ids: config.device_ids,
            device_names: reportData.deviceNames || {},
            config: config.config,
            report_data: reportData.data,
            locale: config.locale,
            output_format: config.output_format,
            status: reportData.error ? "failed" : "completed",
            error_message: reportData.error || null,
          })
          .select()
          .single();

        if (runErr) {
          results.push({ configId: config.id, status: "error", error: runErr.message });
          continue;
        }

        // Send email if recipients configured
        if (config.email_recipients && config.email_recipients.length > 0 && !reportData.error) {
          await sendReportEmail(config, run, reportData, dateFrom, dateTo);
        }

        results.push({ configId: config.id, status: "success" });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        results.push({ configId: config.id, status: "error", error: errorMsg });
      }
    }

    // Log cron run
    await supabase.from("cron_logs").insert({
      job_name: "scheduled-reports",
      job_type: "report",
      status: "completed",
      records_processed: configs.length,
      records_updated: results.filter((r) => r.status === "success").length,
      duration_ms: Date.now() - startTime,
      details: { results },
    });

    return NextResponse.json({
      message: `Processed ${configs.length} report configurations`,
      results,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    
    await supabase.from("cron_logs").insert({
      job_name: "scheduled-reports",
      job_type: "report",
      status: "failed",
      error_message: errorMsg,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

// Generate report data by calling the appropriate Traccar API
async function generateReport(
  config: {
    admin_id: string;
    report_type: string;
    device_ids: string[];
    all_devices: boolean;
    locale: string;
  },
  dateFrom: Date,
  dateTo: Date
): Promise<{ data: unknown; deviceNames: Record<string, string>; error?: string }> {
  try {
    // Get admin's Traccar credentials
    const { data: admin } = await supabase
      .from("admins")
      .select("traccar_url, traccar_token")
      .eq("id", config.admin_id)
      .single();

    if (!admin?.traccar_url || !admin?.traccar_token) {
      return { data: null, deviceNames: {}, error: "Traccar not configured" };
    }

    // Get devices
    let deviceIds = config.device_ids;
    if (config.all_devices || !deviceIds?.length) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("traccar_device_id, plate_number")
        .eq("admin_id", config.admin_id)
        .eq("is_active", true)
        .not("traccar_device_id", "is", null);
      deviceIds = vehicles?.map((v) => v.traccar_device_id).filter(Boolean) || [];
    }

    if (deviceIds.length === 0) {
      return { data: [], deviceNames: {}, error: "No devices found" };
    }

    // Build API URL based on report type
    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    let apiPath = "";
    
    switch (config.report_type) {
      case "route_sheet":
        apiPath = "/api/traccar/reports/route-sheet";
        break;
      case "stops":
        apiPath = "/api/traccar/reports/stops";
        break;
      case "engine_hours":
        apiPath = "/api/traccar/reports/engine-hours";
        break;
      case "events":
      case "geofence_visits":
      case "vehicle_security":
        apiPath = "/api/traccar/reports/events";
        break;
      case "fuel_volume":
        apiPath = "/api/traccar/reports/fuel";
        break;
      case "summary":
        apiPath = "/api/traccar/reports/summary";
        break;
      default:
        return { data: null, deviceNames: {}, error: `Unknown report type: ${config.report_type}` };
    }

    const params = new URLSearchParams({
      adminId: config.admin_id,
      vehicleIds: deviceIds.join(","),
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    });

    const response = await fetch(`${baseUrl}${apiPath}?${params}`);
    const result = await response.json();

    if (!response.ok || result.error) {
      return { data: null, deviceNames: {}, error: result.error || "Report generation failed" };
    }

    // Build device names map
    const deviceNames: Record<string, string> = {};
    if (result.data) {
      for (const device of result.data) {
        if (device.plate) {
          deviceNames[device.traccarDeviceId || device.plate] = device.plate;
        }
      }
    }

    return { data: result.data, deviceNames };
  } catch (err) {
    return { data: null, deviceNames: {}, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Send report via email
async function sendReportEmail(
  config: {
    email_recipients: string[];
    email_subject: string | null;
    name: string;
    report_type: string;
    output_format: string;
    locale: string;
    admin_id: string;
  },
  run: { id: string; name: string },
  reportData: { data: unknown },
  dateFrom: Date,
  dateTo: Date
): Promise<void> {
  try {
    // Get company profile for branding
    const { data: company } = await supabase
      .from("company_profiles")
      .select("company_name, email")
      .eq("admin_id", config.admin_id)
      .single();

    const isRo = config.locale === "ro";
    const subject = config.email_subject || 
      `${isRo ? "Raport" : "Report"}: ${config.name} - ${dateFrom.toISOString().split("T")[0]}`;

    const fromDate = dateFrom.toLocaleDateString(config.locale === "ro" ? "ro-RO" : "en-US");
    const toDate = dateTo.toLocaleDateString(config.locale === "ro" ? "ro-RO" : "en-US");

    // Build email HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #1a1f2e; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          .btn { display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${company?.company_name || "Fleet Report"}</h1>
        </div>
        <div class="content">
          <h2>${isRo ? "Raport Generat" : "Report Generated"}</h2>
          <p><strong>${isRo ? "Tip Raport" : "Report Type"}:</strong> ${config.name}</p>
          <p><strong>${isRo ? "Perioada" : "Period"}:</strong> ${fromDate} - ${toDate}</p>
          <p><strong>${isRo ? "Vehicule" : "Vehicles"}:</strong> ${Array.isArray(reportData.data) ? reportData.data.length : 0}</p>
          <br>
          <p>${isRo ? "Raportul este atasat acestui email sau poate fi vizualizat online:" : "The report is attached to this email or can be viewed online:"}</p>
          <p><a href="${process.env.NEXT_PUBLIC_URL}/admin/telematic/reports?run=${run.id}" class="btn">${isRo ? "Vezi Raportul" : "View Report"}</a></p>
        </div>
        <div class="footer">
          <p>${isRo ? "Acest email a fost generat automat" : "This email was automatically generated"}</p>
          <p>${company?.company_name || "BNG Tracking"}</p>
        </div>
      </body>
      </html>
    `;

    // Generate Excel attachment if needed
    let attachments: { filename: string; content: string; encoding: string }[] = [];
    
    if (config.output_format === "xlsx" && reportData.data) {
      // Call export API to generate XLSX
      const exportRes = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/reports/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "xlsx",
          data: reportData.data,
          title: config.name,
          locale: config.locale,
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          reportType: config.report_type,
        }),
      });

      if (exportRes.ok) {
        const buffer = await exportRes.arrayBuffer();
        attachments.push({
          filename: `${config.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${dateFrom.toISOString().split("T")[0]}.xlsx`,
          content: Buffer.from(buffer).toString("base64"),
          encoding: "base64",
        });
      }
    }

    // Send email via system SMTP
    const emailResult = await sendSystemEmail({
      adminId: config.admin_id,
      to: config.email_recipients,
      subject,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
      })),
    });

    if (!emailResult.success) {
      // Queue for later if system email not configured
      for (const recipient of config.email_recipients) {
        await supabase.from("notification_queue").insert({
          admin_id: config.admin_id,
          notification_type: "scheduled_report",
          channel_email: true,
          channel_web: false,
          channel_push: false,
          title: subject,
          body: html,
          data: {
            to: recipient,
            subject,
            html,
            attachments: attachments.length > 0 ? attachments : undefined,
            report_run_id: run.id,
          },
          status: "pending",
          priority: "normal",
        });
      }
      console.log("Report email queued (system email not configured):", emailResult.error);
    } else {
      console.log("Report email sent successfully:", emailResult.messageId);
    }
  } catch (err) {
    console.error("Failed to send report email:", err);
  }
}
