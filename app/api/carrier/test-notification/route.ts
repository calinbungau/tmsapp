import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendNotificationToCarrierAccounts } from "@/lib/notifications";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Send a test push to every device a carrier has registered. This mirrors,
 * 1-1, the way a real freight-offer dispatch push is sent (same
 * sendNotificationToCarrierAccounts → sendPushNotification → FCM v1 path), so a
 * carrier can confirm push works on their phone exactly like a driver confirms
 * a dispatch notification.
 *
 * Body: { carrier_account_id }
 */
export async function POST(request: NextRequest) {
  try {
    const { carrier_account_id } = await request.json();
    if (!carrier_account_id) {
      return NextResponse.json(
        { error: "carrier_account_id is required" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { data: account } = await supabase
      .from("carrier_accounts")
      .select("id, status, company_name")
      .eq("id", carrier_account_id)
      .maybeSingle();

    if (!account || account.status !== "active") {
      return NextResponse.json({ error: "Invalid carrier account" }, { status: 401 });
    }

    // How many devices are registered (so the UI can explain a 0-device result).
    const { count: deviceCount } = await supabase
      .from("carrier_devices")
      .select("id", { count: "exact", head: true })
      .eq("carrier_account_id", carrier_account_id)
      .not("fcm_token", "is", null);

    if (!deviceCount) {
      return NextResponse.json({
        success: false,
        sent: 0,
        failed: 0,
        devices: 0,
        message:
          "No device is registered yet. Open the carrier portal inside the BNG Tracking mobile app so it can register this phone for push notifications.",
      });
    }

    const { sent, failed } = await sendNotificationToCarrierAccounts(
      [carrier_account_id],
      {
        title: "Test notification",
        body: "Push notifications are working. You'll be alerted about new freight offers here.",
        data: { type: "test" },
      }
    );

    return NextResponse.json({
      success: sent > 0,
      sent,
      failed,
      devices: deviceCount,
      message:
        sent > 0
          ? `Sent to ${sent} device${sent === 1 ? "" : "s"}.`
          : "Delivery failed for all registered devices. The token may be stale — reopen the app to re-register.",
    });
  } catch (error) {
    console.error("[carrier/test-notification] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
