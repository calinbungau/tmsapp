import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = parseInt(searchParams.get("limit") || "30");

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Query user_notifications joined with notifications
    let query = supabase
      .from("user_notifications")
      .select(`
        id,
        notification_id,
        read_at,
        dismissed_at,
        created_at,
        notification:notifications!inner(
          title,
          body,
          icon,
          action_url,
          notification_type,
          priority,
          created_at
        )
      `)
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }

    const { data: userNotifs, error } = await query;

    if (error) {
      console.error("Notification fetch error:", error);
      // Fallback: try direct notifications query
      return await fallbackFetch(supabase, userId, unreadOnly, limit);
    }

    const notifications = (userNotifs || []).map((un: any) => {
      const n = Array.isArray(un.notification) ? un.notification[0] : un.notification;
      return {
        id: un.id,
        notification_id: un.notification_id,
        title: n?.title || "Notification",
        body: n?.body || "",
        icon: n?.icon || null,
        action_url: n?.action_url || null,
        notification_type: n?.notification_type || "system",
        priority: n?.priority || "normal",
        read_at: un.read_at,
        created_at: n?.created_at || un.created_at,
      };
    });

    // Get unread count
    const { count } = await supabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
      .is("dismissed_at", null);

    return NextResponse.json({
      notifications,
      unreadCount: count || 0,
      total: notifications.length,
    });
  } catch (err: any) {
    console.error("Notification route error:", err);
    // Return empty result on infrastructure errors (Supabase/Cloudflare outages)
    // so the UI still loads gracefully
    return NextResponse.json({
      notifications: [],
      unreadCount: 0,
      total: 0,
      _error: "Service temporarily unavailable",
    });
  }
}

// Fallback: query notifications table directly (legacy support)
async function fallbackFetch(supabase: any, userId: string, unreadOnly: boolean, limit: number) {
  try {
  // Get user's admin_id
  const { data: user } = await supabase
    .from("users")
    .select("admin_id, role_id, employee_id")
    .eq("id", userId)
    .single();

  let adminId = user?.admin_id;
  if (!adminId) {
    const { data: admin } = await supabase
      .from("admins")
      .select("id")
      .eq("id", userId)
      .single();
    adminId = admin?.id;
  }

  if (!adminId) {
    return NextResponse.json({ notifications: [], unreadCount: 0, total: 0 });
  }

  const targetFilters = [`target_type.eq.all`];
  targetFilters.push(`and(target_type.eq.user,target_id.eq.${userId})`);

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("admin_id", adminId)
    .or(targetFilters.join(","))
    .order("created_at", { ascending: false })
    .limit(limit);

  const mapped = (notifications || []).map((n: any) => ({
    id: n.id,
    notification_id: n.id,
    title: n.title,
    body: n.body,
    icon: n.icon || null,
    action_url: n.action_url || null,
    notification_type: n.notification_type,
    priority: n.priority,
    read_at: null,
    created_at: n.created_at,
  }));

  return NextResponse.json({
    notifications: mapped,
    unreadCount: mapped.length,
    total: mapped.length,
  });
  } catch (err) {
    console.error("Fallback notification fetch error:", err);
    return NextResponse.json({ notifications: [], unreadCount: 0, total: 0 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, notificationId, action } = body;

  if (!userId || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (action === "read" && notificationId) {
      await supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", userId);
    } else if (action === "dismiss" && notificationId) {
      await supabase
        .from("user_notifications")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", userId);
    } else if (action === "read_all") {
      await supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
