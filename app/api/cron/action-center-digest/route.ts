import { NextResponse } from "next/server";
import { sendDailyDigests } from "@/lib/action-center-notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily digest cron for Action Center.
 * Sends aggregated summary emails for rules with digest_mode=true.
 * 
 * Schedule: Every day at 09:00 Europe/Bucharest
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const result = await sendDailyDigests();

    return NextResponse.json({
      success: true,
      admins: result.admins,
      emailsSent: result.emailsSent,
      emailsFailed: result.emailsFailed,
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[ActionCenter Digest] Error:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
