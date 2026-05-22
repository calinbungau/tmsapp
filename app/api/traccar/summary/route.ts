import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const adminId = searchParams.get("adminId");
  const deviceId = searchParams.get("deviceId");

  if (!adminId || !deviceId) {
    return NextResponse.json({ error: "adminId and deviceId required" }, { status: 400 });
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  try {
    // Today's range in UTC
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const url = `${admin.traccar_server_url}/api/reports/summary?from=${from.toISOString()}&to=${to.toISOString()}&daily=false&deviceId=${deviceId}`;
    const auth = Buffer.from(`${admin.traccar_email}:${admin.traccar_password}`).toString("base64");

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Traccar API error" }, { status: res.status });
    }

    const data = await res.json();
    // API returns array, take first item
    const summary = Array.isArray(data) && data.length > 0 ? data[0] : null;

    if (!summary) {
      return NextResponse.json({ summary: null });
    }

    return NextResponse.json({
      summary: {
        distance: Math.round((summary.distance || 0) / 1000), // meters -> km
        averageSpeed: Math.round(summary.averageSpeed * 1.852), // knots -> km/h
        maxSpeed: Math.round(summary.maxSpeed * 1.852), // knots -> km/h
        spentFuel: summary.spentFuel || 0,
        engineHours: summary.engineHours ? Math.round(summary.engineHours / (1000 * 60)) : 0, // ms -> minutes
        startTime: summary.startTime,
        endTime: summary.endTime,
      },
    });
  } catch (error) {
    console.error("Traccar summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
