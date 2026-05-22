import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { admin_id, user_id, fcm_token, device_info } = await request.json();

    if (!fcm_token || (!admin_id && !user_id)) {
      return NextResponse.json(
        { error: "FCM token and either admin_id or user_id are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    if (user_id) {
      // Sub-user: save to users table
      const { error } = await supabase
        .from("users")
        .update({
          fcm_token,
          fcm_token_updated_at: new Date().toISOString(),
          device_info: device_info || null,
        })
        .eq("id", user_id);

      if (error) {
        console.error("Error updating user FCM token:", error);
        return NextResponse.json(
          { error: "Failed to register device" },
          { status: 500 }
        );
      }
    } else {
      // Admin owner: save to admins table
      const { error } = await supabase
        .from("admins")
        .update({
          fcm_token,
          fcm_token_updated_at: new Date().toISOString(),
          device_info: device_info || null,
        })
        .eq("id", admin_id);

      if (error) {
        console.error("Error updating admin FCM token:", error);
        return NextResponse.json(
          { error: "Failed to register device" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Device registered successfully",
    });
  } catch (error) {
    console.error("Error in admin register-device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Endpoint to refresh/update FCM token
export async function PUT(request: Request) {
  try {
    const { admin_id, user_id, fcm_token, device_info } = await request.json();

    if (!fcm_token || (!admin_id && !user_id)) {
      return NextResponse.json(
        { error: "FCM token and either admin_id or user_id are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const table = user_id ? "users" : "admins";
    const id = user_id || admin_id;

    const { error } = await supabase
      .from(table)
      .update({
        fcm_token,
        fcm_token_updated_at: new Date().toISOString(),
        device_info: device_info || null,
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating FCM token:", error);
      return NextResponse.json(
        { error: "Failed to update device token" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Device token updated successfully",
    });
  } catch (error) {
    console.error("Error in update-device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
