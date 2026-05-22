import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List emails from DB cache
export async function GET(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "INBOX";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "30");
    const search = searchParams.get("search") || "";
    const offset = (page - 1) * limit;

    let query = supabase
      .from("user_emails")
      .select("*", { count: "exact" })
      .eq("admin_id", adminId)
      .eq("mailbox", folder)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`subject.ilike.%${search}%,from_name.ilike.%${search}%,from_address.ilike.%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      emails: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Update flags (read/unread, star, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { emailIds, is_read, is_starred } = body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return NextResponse.json({ error: "emailIds required" }, { status: 400 });
    }

    const update: any = {};
    if (typeof is_read === "boolean") update.is_read = is_read;
    if (typeof is_starred === "boolean") update.is_starred = is_starred;

    const { error } = await supabase
      .from("user_emails")
      .update(update)
      .eq("admin_id", adminId)
      .in("id", emailIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
