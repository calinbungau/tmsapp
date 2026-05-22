"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Register or update a user session with FCM token
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, deviceType, fcmToken, browserInfo } = body;

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check if session exists for this user and device type
  const { data: existingSession } = await supabase
    .from("user_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("device_type", deviceType || "web")
    .maybeSingle();

  if (existingSession) {
    // Update existing session
    const { error } = await supabase
      .from("user_sessions")
      .update({
        fcm_token: fcmToken,
        browser_info: browserInfo,
        last_active: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      })
      .eq("id", existingSession.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: existingSession.id, updated: true });
  }

  // Create new session
  const { data: newSession, error } = await supabase
    .from("user_sessions")
    .insert({
      user_id: userId,
      device_type: deviceType || "web",
      fcm_token: fcmToken,
      browser_info: browserInfo,
      last_active: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessionId: newSession.id, created: true });
}

// Delete a session (logout from device)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const userId = searchParams.get("userId");

  if (!sessionId && !userId) {
    return NextResponse.json({ error: "Session ID or User ID required" }, { status: 400 });
  }

  const supabase = await createClient();

  if (sessionId) {
    const { error } = await supabase
      .from("user_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (userId) {
    // Delete all sessions for user
    const { error } = await supabase
      .from("user_sessions")
      .delete()
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// Get active sessions for a user
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: sessions, error } = await supabase
    .from("user_sessions")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("last_active", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions });
}
