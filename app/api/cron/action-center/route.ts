import { createClient } from "@/lib/supabase/server";
import { dispatchAllAdmins } from "@/lib/action-center-notifier";
import { NextResponse } from "next/server";

// Called by Vercel Cron every 5 minutes to run all Action Center detectors
export async function GET(request: Request) {
  const startTime = Date.now();
  const supabase = await createClient();

  // Verify cron secret
  const vercelCronSecret = request.headers.get("x-vercel-cron-secret");
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    !cronSecret ||
    vercelCronSecret === cronSecret ||
    authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call the orchestrator function that runs all detectors
    const { data, error } = await supabase.rpc("_ac_run_all_detectors");

    if (error) {
      console.error("[ActionCenter Cron] Detector error:", error);
      await saveLog(supabase, "action_center_detectors", "error", startTime, null, error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // data is a jsonb object with counts per detector
    const totalUpserted = Object.values(data || {}).reduce(
      (sum: number, n) => sum + (typeof n === "number" ? n : 0),
      0
    );

    // After detectors mutate the items table, fan out notifications
    // (in-app log + email + push placeholder). We only consider items
    // detected/refreshed in the last 10 minutes so a backfill or
    // schema change doesn't accidentally email everyone the entire
    // backlog. Each delivery is recorded as an event row, so admins
    // see a per-item timeline like "Email delivered to ops@x.com".
    let notify: Awaited<ReturnType<typeof dispatchAllAdmins>> | null = null;
    try {
      notify = await dispatchAllAdmins(10);
    } catch (e: any) {
      console.error("[ActionCenter Cron] Notifier error:", e?.message || e);
    }

    await saveLog(supabase, "action_center_detectors", "success", startTime, totalUpserted, null, {
      detectors: data,
      notifications: notify,
    });

    return NextResponse.json({
      success: true,
      detectors: data,
      totalUpserted,
      notifications: notify,
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[ActionCenter Cron] Fatal error:", err);
    await saveLog(supabase, "action_center_detectors", "error", startTime, null, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function saveLog(
  supabase: any,
  jobName: string,
  status: string,
  startTime: number,
  recordsProcessed: number | null,
  errorMessage: string | null,
  details?: any
) {
  const duration = Date.now() - startTime;
  await supabase.from("cron_logs").insert({
    job_name: jobName,
    job_type: "action_center",
    status,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: duration,
    records_processed: recordsProcessed,
    error_message: errorMessage,
    details: details ? { detectors: details } : null,
  });
}
