import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  sendNotificationToDriver,
  sendNotificationToDrivers,
  sendNotificationToAllDrivers,
  NotificationTemplates,
} from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const { 
      admin_id, 
      driver_id, 
      driver_ids, 
      send_to_all,
      title, 
      body, 
      template,
      template_data,
      data 
    } = await request.json();

    if (!admin_id) {
      return NextResponse.json(
        { error: "Admin ID is required" },
        { status: 400 }
      );
    }

    // Verify admin exists
    const supabase = await createClient();
    const { data: admin, error: adminError } = await supabase
      .from("admins")
      .select("id")
      .eq("id", admin_id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json(
        { error: "Invalid admin ID" },
        { status: 401 }
      );
    }

    // Build notification payload
    let notification: { title: string; body: string; data?: Record<string, string> };

    if (template && template_data) {
      // Use template
      switch (template) {
        case "maintenance_due":
          notification = NotificationTemplates.maintenanceDue(
            template_data.vehicle_plate,
            template_data.maintenance_type
          );
          break;
        case "maintenance_reminder":
          notification = NotificationTemplates.maintenanceReminder(
            template_data.vehicle_plate,
            template_data.maintenance_type,
            template_data.days_until
          );
          break;
        case "form_assigned":
          notification = NotificationTemplates.formAssigned(template_data.form_title);
          break;
        case "inspection_reminder":
          notification = NotificationTemplates.inspectionReminder(template_data.vehicle_plate);
          break;
        default:
          return NextResponse.json(
            { error: "Invalid template type" },
            { status: 400 }
          );
      }
    } else if (title && body) {
      // Custom notification
      notification = NotificationTemplates.custom(title, body, data);
    } else {
      return NextResponse.json(
        { error: "Either template or title/body are required" },
        { status: 400 }
      );
    }

    // Helper function to save notification to database
    const saveNotification = async (driverId: string, notif: typeof notification, pushSuccess: boolean) => {
      await supabase.from("notifications").insert({
        admin_id,
        target_type: "user",
        target_id: driverId,
        title: notif.title,
        body: notif.body,
        notification_type: template || "general",
        data: notif.data || data || null,
        channels_sent: pushSuccess ? ["fcm"] : [],
      });
    };

    // Send to appropriate recipients
    if (send_to_all) {
      // Send to all drivers of this admin
      const result = await sendNotificationToAllDrivers(admin_id, notification);
      
      // Save notifications to database for each driver
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id")
        .eq("admin_id", admin_id)
        .eq("is_active", true);
      
      if (drivers) {
        for (const driver of drivers) {
          const driverResult = result.results[driver.id];
          await saveNotification(driver.id, notification, driverResult?.success || false);
        }
      }
      
      return NextResponse.json({
        success: true,
        sent: result.sent,
        failed: result.failed,
        details: result.results,
      });
    } else if (driver_ids && Array.isArray(driver_ids) && driver_ids.length > 0) {
      // Send to multiple specific drivers
      const result = await sendNotificationToDrivers(driver_ids, notification);
      
      // Save notifications to database
      for (const dId of driver_ids) {
        const driverResult = result.results[dId];
        await saveNotification(dId, notification, driverResult?.success || false);
      }
      
      const sent = Object.values(result.results).filter((r) => r.success).length;
      const failed = Object.values(result.results).filter((r) => !r.success).length;
      return NextResponse.json({
        success: true,
        sent,
        failed,
        details: result.results,
      });
    } else if (driver_id) {
      // Send to single driver
      const result = await sendNotificationToDriver(driver_id, notification);
      
      // Save notification to database
      await saveNotification(driver_id, notification, result.success);
      
      return NextResponse.json({
        success: result.success,
        error: result.error,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        { error: "Specify driver_id, driver_ids, or send_to_all" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error sending notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
