import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Internal endpoint for admins to manually trigger maintenance check
// This validates admin session instead of cron secret

export async function POST(request: Request) {
  const startTime = Date.now();
  const supabase = await createClient();

  // Parse the request body to get admin_id
  let adminId: string;
  try {
    const body = await request.json();
    adminId = body.admin_id;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!adminId) {
    return NextResponse.json({ error: "Admin ID required" }, { status: 401 });
  }

  // Verify admin exists
  const { data: admin } = await supabase
    .from("admins")
    .select("id, traccar_server_url, traccar_email, traccar_password, traccar_token")
    .eq("id", adminId)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Invalid admin" }, { status: 401 });
  }

  const logs: string[] = [];
  const errors: string[] = [];
  let vehiclesProcessed = 0;
  let maintenanceUpdated = 0;

  try {
    logs.push("Starting maintenance check job (manual trigger)...");

    const traccarUrl = admin.traccar_server_url || admin.traccar_url;
    
    if (!traccarUrl || (!admin.traccar_token && (!admin.traccar_email || !admin.traccar_password))) {
      logs.push("No Traccar credentials configured");
      await saveLog(supabase, "maintenance_check_manual", "success", logs, errors, 0, 0, startTime);
      return NextResponse.json({ success: true, message: "No Traccar credentials", logs });
    }

    logs.push(`Processing admin ${admin.id}...`);

    // Get all vehicles for this admin with traccar_device_id
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, traccar_device_id, plate_number")
      .eq("admin_id", admin.id)
      .not("traccar_device_id", "is", null);

    if (!vehicles || vehicles.length === 0) {
      logs.push("No vehicles with Traccar devices found");
      await saveLog(supabase, "maintenance_check_manual", "success", logs, errors, 0, 0, startTime);
      return NextResponse.json({ success: true, message: "No vehicles to process", logs });
    }

    logs.push(`Found ${vehicles.length} vehicles with Traccar devices`);

    // Build authorization headers for Traccar
    let traccarHeaders: HeadersInit = {};
    if (admin.traccar_token) {
      traccarHeaders = {
        Authorization: `Bearer ${admin.traccar_token}`,
      };
      logs.push("Using token authentication");
    } else if (admin.traccar_email && admin.traccar_password) {
      const basicAuth = Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64");
      traccarHeaders = {
        Authorization: `Basic ${basicAuth}`,
      };
      logs.push("Using basic authentication");
    }

    // Fetch positions from Traccar for all devices
    try {
      const traccarResponse = await fetch(
        `${traccarUrl}/api/positions`,
        {
          headers: traccarHeaders,
        }
      );

      if (!traccarResponse.ok) {
        const errorText = await traccarResponse.text();
        errors.push(`Failed to fetch Traccar positions - ${traccarResponse.status}: ${errorText}`);
        await saveLog(supabase, "maintenance_check_manual", "error", logs, errors, 0, 0, startTime);
        return NextResponse.json({ success: false, error: "Traccar API error", logs, errors }, { status: 500 });
      }

      const positions = await traccarResponse.json();
      logs.push(`Received ${positions.length} positions from Traccar`);

      // Create a map of device positions (using string keys for comparison)
      const positionMap = new Map();
      for (const pos of positions) {
        positionMap.set(String(pos.deviceId), pos);
      }

      // Update each vehicle's maintenance records
      for (const vehicle of vehicles) {
        const position = positionMap.get(String(vehicle.traccar_device_id));

        if (!position) {
          logs.push(`Vehicle ${vehicle.plate_number}: No position data (device ID: ${vehicle.traccar_device_id})`);
          continue;
        }

        vehiclesProcessed++;

        const currentOdometer = position.attributes?.totalDistance
          ? Math.round(position.attributes.totalDistance / 1000)
          : null;
        const currentEngineHours = position.attributes?.hours
          ? Math.round(position.attributes.hours / 3600000)
          : null;

        logs.push(`Vehicle ${vehicle.plate_number}: Odometer=${currentOdometer}km, EngineHours=${currentEngineHours}h`);

        // Get scheduled/due maintenance records for this vehicle
        const { data: maintenanceRecords } = await supabase
          .from("maintenance_records")
          .select("*, maintenance_type:maintenance_types(*)")
          .eq("vehicle_id", vehicle.id)
          .in("status", ["scheduled", "due"]);

        if (!maintenanceRecords || maintenanceRecords.length === 0) {
          logs.push(`  No active maintenance records`);
          continue;
        }

        logs.push(`  Found ${maintenanceRecords.length} active maintenance record(s)`);

        for (const record of maintenanceRecords) {
          let newStatus = record.status;
          const updates: Record<string, any> = {
            current_odometer: currentOdometer,
            current_engine_hours: currentEngineHours,
            updated_at: new Date().toISOString(),
          };

          const now = new Date();

          // Check by mileage
          if (record.due_mileage_km && currentOdometer !== null) {
            if (currentOdometer >= record.due_mileage_km) {
              newStatus = "expired";
              logs.push(`  Record ${record.id}: EXPIRED (odometer ${currentOdometer} >= due ${record.due_mileage_km})`);
            } else if (record.remind_mileage_km !== null && currentOdometer >= record.remind_mileage_km) {
              if (newStatus !== "expired") {
                newStatus = "due";
                logs.push(`  Record ${record.id}: DUE (odometer ${currentOdometer} >= remind ${record.remind_mileage_km})`);
              }
            }
          }

          // Check by engine hours
          if (record.due_engine_hours && currentEngineHours !== null) {
            if (currentEngineHours >= record.due_engine_hours) {
              newStatus = "expired";
              logs.push(`  Record ${record.id}: EXPIRED (engine hours ${currentEngineHours} >= due ${record.due_engine_hours})`);
            } else if (record.remind_engine_hours !== null && currentEngineHours >= record.remind_engine_hours) {
              if (newStatus !== "expired") {
                newStatus = "due";
                logs.push(`  Record ${record.id}: DUE (engine hours ${currentEngineHours} >= remind ${record.remind_engine_hours})`);
              }
            }
          }

          // Check by date
          if (record.due_date) {
            const dueDate = new Date(record.due_date);
            if (now >= dueDate) {
              newStatus = "expired";
              logs.push(`  Record ${record.id}: EXPIRED (date ${now.toISOString()} >= due ${record.due_date})`);
            } else if (record.remind_date) {
              const remindDate = new Date(record.remind_date);
              if (now >= remindDate && newStatus !== "expired") {
                newStatus = "due";
                logs.push(`  Record ${record.id}: DUE (date ${now.toISOString()} >= remind ${record.remind_date})`);
              }
            }
          }

          // Update if status changed or odometer/engine hours updated
          if (newStatus !== record.status || currentOdometer !== record.current_odometer || currentEngineHours !== record.current_engine_hours) {
            updates.status = newStatus;
            
            // Set expired_at timestamp when changing to expired
            if (newStatus === "expired" && record.status !== "expired") {
              updates.expired_at = new Date().toISOString();
            }

            const { error: updateError } = await supabase
              .from("maintenance_records")
              .update(updates)
              .eq("id", record.id);

            if (updateError) {
              errors.push(`Failed to update record ${record.id}: ${updateError.message}`);
            } else {
              maintenanceUpdated++;
              if (newStatus !== record.status) {
                logs.push(`  Record ${record.id}: Status changed from ${record.status} to ${newStatus}`);
              } else {
                logs.push(`  Record ${record.id}: Updated odometer/engine hours`);
              }
            }
          }
        }
      }
    } catch (traccarError: any) {
      errors.push(`Traccar error: ${traccarError.message}`);
    }

    logs.push(`Completed. Vehicles processed: ${vehiclesProcessed}, Maintenance updated: ${maintenanceUpdated}`);

    await saveLog(supabase, "maintenance_check_manual", errors.length > 0 ? "partial" : "success", logs, errors, vehiclesProcessed, maintenanceUpdated, startTime);

    return NextResponse.json({
      success: true,
      vehiclesProcessed,
      maintenanceUpdated,
      logs,
      errors,
    });

  } catch (error: any) {
    errors.push(`Fatal error: ${error.message}`);
    await saveLog(supabase, "maintenance_check_manual", "error", logs, errors, vehiclesProcessed, maintenanceUpdated, startTime);

    return NextResponse.json(
      { error: error.message, logs, errors },
      { status: 500 }
    );
  }
}

async function saveLog(
  supabase: any,
  jobName: string,
  status: string,
  logs: string[],
  errors: string[],
  vehiclesProcessed: number,
  maintenanceUpdated: number,
  startTime: number
) {
  const duration = Date.now() - startTime;
  const now = new Date().toISOString();

  const { error } = await supabase.from("cron_logs").insert({
    job_name: jobName,
    job_type: "maintenance",
    status,
    started_at: new Date(startTime).toISOString(),
    completed_at: now,
    duration_ms: duration,
    records_processed: vehiclesProcessed,
    records_updated: maintenanceUpdated,
    error_message: errors.length > 0 ? errors.join("; ") : null,
    details: { logs, errors },
  });

  if (error) {
    console.log("[v0] Failed to save cron log:", error);
  }
}
