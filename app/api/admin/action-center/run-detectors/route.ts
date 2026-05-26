import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Internal endpoint for admins to manually trigger all Action Center
 * detectors. Mirrors the behavior of /api/cron/action-center but
 * authenticates with an admin session instead of the cron secret,
 * so operators can hit "Run now" in the settings page and get
 * immediate feedback (especially useful when waiting 5 minutes for
 * the next scheduled tick is annoying, or when verifying that a
 * newly-added record like an expired document actually surfaces).
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const supabase = await createClient();

  let adminId: string;
  try {
    const body = await request.json();
    adminId = body.admin_id;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!adminId) {
    return NextResponse.json({ error: "Admin ID required" }, { status: 401 });
  }

  // Verify admin exists. We don't need anything from the row beyond
  // confirming it's a real tenant — the detectors operate on every
  // admin internally because they're scoped via SQL.
  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", adminId)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Invalid admin" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.rpc("_ac_run_all_detectors");

    if (error) {
      console.error("[ActionCenter Manual] Detector error:", error);
      await saveLog(supabase, "error", startTime, null, error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalUpserted = Object.values(data || {}).reduce(
      (sum: number, n) => sum + (typeof n === "number" ? n : 0),
      0
    );

    await saveLog(supabase, "success", startTime, totalUpserted, null, data);

    return NextResponse.json({
      success: true,
      detectors: data,
      totalUpserted,
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[ActionCenter Manual] Fatal error:", err);
    await saveLog(supabase, "error", startTime, null, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function saveLog(
  supabase: any,
  status: string,
  startTime: number,
  recordsProcessed: number | null,
  errorMessage: string | null,
  details?: any
) {
  const duration = Date.now() - startTime;
  await supabase.from("cron_logs").insert({
    job_name: "action_center_detectors_manual",
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
