import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// This endpoint should be called by a cron job every 30 minutes
// You can set this up in Vercel Cron or use an external service

export async function GET(request: Request) {
  const startTime = Date.now();
  const supabase = await createClient();
  
  // Verify cron secret - Vercel sends it in x-vercel-cron-secret header
  // Also support Authorization header for manual testing
  const vercelCronSecret = request.headers.get("x-vercel-cron-secret");
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow if: no secret configured, or Vercel cron header matches, or Bearer token matches
  const isAuthorized = !cronSecret || 
    vercelCronSecret === cronSecret || 
    authHeader === `Bearer ${cronSecret}`;
  
  if (!isAuthorized) {
    console.log("[v0] Cron unauthorized - vercelCronSecret:", vercelCronSecret ? "present" : "missing", "authHeader:", authHeader ? "present" : "missing");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs: string[] = [];
  const errors: string[] = [];
  let vehiclesProcessed = 0;
  let maintenanceUpdated = 0;

  try {
    logs.push("Starting maintenance check job...");

    // Get all active admins
    const { data: admins } = await supabase
      .from("admins")
      .select("id, traccar_server_url, traccar_email, traccar_password, traccar_token");

    if (!admins || admins.length === 0) {
      logs.push("No admins found");
      await saveLog(supabase, "maintenance_check", "success", logs, errors, 0, 0, startTime);
      return NextResponse.json({ success: true, message: "No admins to process" });
    }

    for (const admin of admins) {
      const traccarUrl = admin.traccar_server_url;
      
      if (!traccarUrl || (!admin.traccar_token && (!admin.traccar_email || !admin.traccar_password))) {
        logs.push(`Admin ${admin.id}: No Traccar credentials, skipping`);
        continue;
      }

      logs.push(`Processing admin ${admin.id}...`);

      // Get all vehicles for this admin with traccar_device_id
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, traccar_device_id, plate_number")
        .eq("admin_id", admin.id)
        .not("traccar_device_id", "is", null);

      if (!vehicles || vehicles.length === 0) {
        logs.push(`Admin ${admin.id}: No vehicles with Traccar devices`);
        continue;
      }

      // Build authorization headers for Traccar
      let traccarHeaders: HeadersInit = {};
      if (admin.traccar_token) {
        traccarHeaders = {
          Authorization: `Bearer ${admin.traccar_token}`,
        };
      } else if (admin.traccar_email && admin.traccar_password) {
        const basicAuth = Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64");
        traccarHeaders = {
          Authorization: `Basic ${basicAuth}`,
        };
      }

      // Fetch positions from Traccar for all devices (10s timeout to avoid hanging)
      try {
        const abortCtl = new AbortController();
        const fetchTimeout = setTimeout(() => abortCtl.abort(), 10000);
        const traccarResponse = await fetch(
          `${traccarUrl}/api/positions`,
          {
            headers: traccarHeaders,
            signal: abortCtl.signal,
          }
        );
        clearTimeout(fetchTimeout);

        if (!traccarResponse.ok) {
          errors.push(`Admin ${admin.id}: Failed to fetch Traccar positions - ${traccarResponse.status}`);
          continue;
        }

        const positions = await traccarResponse.json();
        
        // Create a map of device positions (using string keys for comparison)
        const positionMap = new Map();
        for (const pos of positions) {
          positionMap.set(String(pos.deviceId), pos);
        }

        // Update each vehicle's maintenance records
        for (const vehicle of vehicles) {
          const position = positionMap.get(String(vehicle.traccar_device_id));
          
          if (!position) {
            logs.push(`Vehicle ${vehicle.plate_number}: No position data`);
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
            continue;
          }

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
                logs.push(`  Maintenance ${record.id}: EXPIRED (odometer ${currentOdometer} >= due ${record.due_mileage_km})`);
              } else if (record.remind_mileage_km !== null && currentOdometer >= record.remind_mileage_km) {
                if (newStatus !== "expired") {
                  newStatus = "due";
                  logs.push(`  Maintenance ${record.id}: DUE (odometer ${currentOdometer} >= remind ${record.remind_mileage_km})`);
                }
              }
            }

            // Check by engine hours
            if (record.due_engine_hours && currentEngineHours !== null) {
              if (currentEngineHours >= record.due_engine_hours) {
                newStatus = "expired";
                logs.push(`  Maintenance ${record.id}: EXPIRED (engine hours ${currentEngineHours} >= due ${record.due_engine_hours})`);
              } else if (record.remind_engine_hours !== null && currentEngineHours >= record.remind_engine_hours) {
                if (newStatus !== "expired") {
                  newStatus = "due";
                  logs.push(`  Maintenance ${record.id}: DUE (engine hours ${currentEngineHours} >= remind ${record.remind_engine_hours})`);
                }
              }
            }

            // Check by date
            if (record.due_date) {
              const dueDate = new Date(record.due_date);
              if (now >= dueDate) {
                newStatus = "expired";
                logs.push(`  Maintenance ${record.id}: EXPIRED (date ${now.toISOString()} >= due ${record.due_date})`);
              } else if (record.remind_date) {
                const remindDate = new Date(record.remind_date);
                if (now >= remindDate && newStatus !== "expired") {
                  newStatus = "due";
                  logs.push(`  Maintenance ${record.id}: DUE (date ${now.toISOString()} >= remind ${record.remind_date})`);
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
              
              await supabase
                .from("maintenance_records")
                .update(updates)
                .eq("id", record.id);
              
              maintenanceUpdated++;
              
              if (newStatus !== record.status) {
                logs.push(`  Maintenance ${record.id}: Status changed from ${record.status} to ${newStatus}`);
              }
            }
          }
        }
      } catch (traccarError: any) {
        errors.push(`Admin ${admin.id}: Traccar error - ${traccarError.message}`);
      }
    }

    logs.push(`Completed. Vehicles processed: ${vehiclesProcessed}, Maintenance updated: ${maintenanceUpdated}`);
    
    await saveLog(supabase, "maintenance_check", errors.length > 0 ? "partial" : "success", logs, errors, vehiclesProcessed, maintenanceUpdated, startTime);

    return NextResponse.json({
      success: true,
      vehiclesProcessed,
      maintenanceUpdated,
      logs,
      errors,
    });

  } catch (error: any) {
    errors.push(`Fatal error: ${error.message}`);
    await saveLog(supabase, "maintenance_check", "error", logs, errors, vehiclesProcessed, maintenanceUpdated, startTime);
    
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
