import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { pin_code, fcm_token, device_info } = await request.json();

    if (!pin_code || !fcm_token) {
      return NextResponse.json(
        { error: "PIN code and FCM token are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Find driver by PIN
    const { data: driver, error: findError } = await supabase
      .from("drivers")
      .select("id, name, admin_id")
      .eq("pin_code", pin_code)
      .single();

    if (findError || !driver) {
      return NextResponse.json(
        { error: "Invalid PIN code" },
        { status: 401 }
      );
    }

    // Update driver with FCM token
    const { error: updateError } = await supabase
      .from("drivers")
      .update({
        fcm_token: fcm_token,
        fcm_token_updated_at: new Date().toISOString(),
        device_info: device_info || null,
      })
      .eq("id", driver.id);

    if (updateError) {
      console.error("Error updating FCM token:", updateError);
      return NextResponse.json(
        { error: "Failed to register device" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Device registered successfully",
      driver: {
        id: driver.id,
        name: driver.name,
      },
    });
  } catch (error) {
    console.error("Error in register-device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Endpoint to refresh/update FCM token
export async function PUT(request: Request) {
  try {
    const { driver_id, fcm_token, device_info } = await request.json();

    if (!driver_id || !fcm_token) {
      return NextResponse.json(
        { error: "Driver ID and FCM token are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error: updateError } = await supabase
      .from("drivers")
      .update({
        fcm_token: fcm_token,
        fcm_token_updated_at: new Date().toISOString(),
        device_info: device_info || null,
      })
      .eq("id", driver_id);

    if (updateError) {
      console.error("Error updating FCM token:", updateError);
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
