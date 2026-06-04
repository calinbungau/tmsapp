import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Best-effort classification of a stored platform/userAgent string so the UI
// can show whether the registered device is the mobile app or a web browser.
function classify(platform: string | null): "mobile" | "browser" | "unknown" {
  if (!platform) return "unknown";
  const p = platform.toLowerCase();
  if (
    p.includes("iphone") ||
    p.includes("ipad") ||
    p.includes("android") ||
    p.includes("ios") ||
    p.includes("dart") ||
    p.includes("okhttp") ||
    p.includes("bng") ||
    p.includes("capacitor") ||
    p.includes("wv)") // Android WebView marker
  ) {
    return "mobile";
  }
  if (p.includes("mozilla") || p.includes("chrome") || p.includes("safari") || p.includes("win") || p.includes("mac")) {
    return "browser";
  }
  return "unknown";
}

/**
 * List the devices a carrier has registered for push, with a coarse
 * mobile/browser classification. Used by the account page so a carrier can see
 * whether their phone is registered.
 *
 * Query: ?carrier_account_id=...
 */
export async function GET(request: NextRequest) {
  try {
    const carrierAccountId = request.nextUrl.searchParams.get("carrier_account_id");
    if (!carrierAccountId) {
      return NextResponse.json({ error: "carrier_account_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("carrier_devices")
      .select("id, platform, last_seen_at, created_at")
      .eq("carrier_account_id", carrierAccountId)
      .not("fcm_token", "is", null)
      .order("last_seen_at", { ascending: false });

    if (error) {
      console.error("[carrier/devices] query failed", error);
      return NextResponse.json({ error: "Failed to load devices" }, { status: 500 });
    }

    const devices = (data || []).map((d) => ({
      id: d.id,
      kind: classify(d.platform),
      platform: d.platform,
      last_seen_at: d.last_seen_at,
      created_at: d.created_at,
    }));

    return NextResponse.json({
      devices,
      hasMobile: devices.some((d) => d.kind === "mobile"),
    });
  } catch (error) {
    console.error("[carrier/devices] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
