import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Register (or refresh) a carrier device FCM token.
 *
 * The BNG Tracking carrier app passes its FCM token here once the carrier is
 * logged in. We key devices by carrier_account_id and store at most one row per
 * physical device: a given token is re-pointed to the current account so the
 * same handset never receives another carrier's notifications.
 *
 * Body: { carrier_account_id, fcm_token, platform? }
 */
export async function POST(request: NextRequest) {
  try {
    const { carrier_account_id, fcm_token, platform } = await request.json();

    if (!carrier_account_id || !fcm_token) {
      return NextResponse.json(
        { error: "carrier_account_id and fcm_token are required" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Make sure the account exists and is active before storing a device.
    const { data: account } = await supabase
      .from("carrier_accounts")
      .select("id, status")
      .eq("id", carrier_account_id)
      .maybeSingle();

    if (!account || account.status !== "active") {
      return NextResponse.json({ error: "Invalid carrier account" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    // A token identifies a single physical device — clear any prior rows for it
    // (possibly under another account) so it is only ever bound to one carrier.
    await supabase.from("carrier_devices").delete().eq("fcm_token", fcm_token);

    const { error: insertError } = await supabase.from("carrier_devices").insert({
      carrier_account_id,
      fcm_token,
      platform: platform || null,
      last_seen_at: nowIso,
    });

    if (insertError) {
      console.error("[carrier/register-device] insert failed", insertError);
      return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[carrier/register-device] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
