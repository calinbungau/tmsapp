import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

// GET: List report runs + configurations for an admin
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const sp = request.nextUrl.searchParams;
  const adminId = sp.get("adminId");
  const type = sp.get("type"); // "runs" | "configs" | "all"

  if (!adminId) {
    return NextResponse.json({ error: "adminId required" }, { status: 400 });
  }

  if (type === "configs") {
    const { data, error } = await supabase
      .from("report_configurations")
      .select("*")
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ configs: data });
  }

  // Default: runs
  const { data: runs, error: runsErr } = await supabase
    .from("report_runs")
    .select("*")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 });

  if (type === "all") {
    const { data: configs, error: configsErr } = await supabase
      .from("report_configurations")
      .select("*")
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });
    if (configsErr) return NextResponse.json({ error: configsErr.message }, { status: 500 });
    return NextResponse.json({ reports: runs, configs });
  }

  return NextResponse.json({ reports: runs });
}

// POST: Save a new report run OR configuration
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const body = await request.json();
  const { action } = body; // "save_run" | "save_config"

  if (action === "save_config") {
    const { admin_id, report_type, name, device_ids, all_devices, config,
      is_recurring, recurrence_cron, recurrence_range,
      email_recipients, email_subject, output_format, locale } = body;
    if (!admin_id || !report_type) {
      return NextResponse.json({ error: "admin_id and report_type required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("report_configurations")
      .insert({
        admin_id,
        report_type,
        name: name || `Scheduled ${report_type}`,
        device_ids: device_ids || [],
        all_devices: all_devices || false,
        config: config || {},
        is_recurring: is_recurring || false,
        recurrence_cron: recurrence_cron || null,
        recurrence_range: recurrence_range || null,
        email_recipients: email_recipients || [],
        email_subject: email_subject || null,
        output_format: output_format || "preview",
        locale: locale || "en",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ config: data });
  }

  // Default: save_run
  const { admin_id, report_type, title, config, report_data,
    date_from, date_to, device_ids, device_names,
    locale, output_format, configuration_id } = body;
  if (!admin_id || !report_type) {
    return NextResponse.json({ error: "admin_id and report_type required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("report_runs")
    .insert({
      admin_id,
      report_type,
      name: title || `Report ${new Date().toLocaleDateString()}`,
      date_from: date_from || new Date().toISOString(),
      date_to: date_to || new Date().toISOString(),
      device_ids: device_ids || [],
      device_names: device_names || {},
      config: config || {},
      report_data: report_data || {},
      locale: locale || "en",
      output_format: output_format || "preview",
      configuration_id: configuration_id || null,
      status: "completed",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data });
}

// DELETE: Delete a report run or config
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id");
  const table = sp.get("table") === "configs" ? "report_configurations" : "report_runs";

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
