import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) {
      return NextResponse.json({ count: 0 });
    }

    // Resolve the acting user's mailbox so the badge reflects ONLY
    // their own unread emails — not every user's on the tenant.
    const settings = await getUserEmailSettingsRow(supabase, adminId, userId);
    if (!settings) {
      return NextResponse.json({ count: 0 });
    }

    const { count, error } = await supabase
      .from("user_emails")
      .select("*", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .eq("user_email_setting_id", settings.id)
      .eq("mailbox", "INBOX")
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
