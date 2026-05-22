import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const now = new Date();
  const logs: string[] = [];

  // Reminder intervals in minutes
  const reminderIntervals = [120, 60, 30]; // 2 hours, 1 hour, 30 minutes

  for (const minutes of reminderIntervals) {
    const reminderTime = new Date(now.getTime() + minutes * 60 * 1000);
    const reminderWindowStart = new Date(reminderTime.getTime() - 5 * 60 * 1000); // 5 min buffer
    const reminderWindowEnd = new Date(reminderTime.getTime() + 5 * 60 * 1000);

    // Find appointments that need reminders
    const { data: appointments } = await supabase
      .from("maintenance_records")
      .select(`
        id,
        assigned_driver_id,
        scheduled_start_time,
        appointment_location,
        reminder_2h_sent,
        reminder_1h_sent,
        reminder_30m_sent,
        vehicle:vehicles(plate_number, model),
        maintenance_type:maintenance_types(name)
      `)
      .not("assigned_driver_id", "is", null)
      .not("scheduled_start_time", "is", null)
      .gte("scheduled_start_time", reminderWindowStart.toISOString())
      .lt("scheduled_start_time", reminderWindowEnd.toISOString())
      .neq("status", "completed");

    if (!appointments) continue;

    for (const appt of appointments) {
      // Determine which reminder to send
      let shouldSend = false;
      let reminderType = "";
      let updateField = "";

      if (minutes === 120 && !appt.reminder_2h_sent) {
        shouldSend = true;
        reminderType = "2 hours";
        updateField = "reminder_2h_sent";
      } else if (minutes === 60 && !appt.reminder_1h_sent) {
        shouldSend = true;
        reminderType = "1 hour";
        updateField = "reminder_1h_sent";
      } else if (minutes === 30 && !appt.reminder_30m_sent) {
        shouldSend = true;
        reminderType = "30 minutes";
        updateField = "reminder_30m_sent";
      }

      if (shouldSend && appt.assigned_driver_id) {
        const startTime = new Date(appt.scheduled_start_time!);
        const vehicle = appt.vehicle as any;
        const maintenanceType = appt.maintenance_type as any;

        // Create notification
        await supabase.from("driver_notifications").insert({
          driver_id: appt.assigned_driver_id,
          maintenance_record_id: appt.id,
          type: "appointment_reminder",
          title: `Reminder: ${reminderType} until appointment`,
          message: `${maintenanceType?.name || "Maintenance"} for ${vehicle?.plate_number || "vehicle"} starts at ${startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}${appt.appointment_location ? ` at ${appt.appointment_location}` : ""}`,
          scheduled_for: appt.scheduled_start_time,
        });

        // Mark reminder as sent
        await supabase
          .from("maintenance_records")
          .update({ [updateField]: true })
          .eq("id", appt.id);

        logs.push(`Sent ${reminderType} reminder for appointment ${appt.id}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Processed appointment reminders`,
    logs,
    timestamp: now.toISOString(),
  });
}
