import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getAuthHeader(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

async function getAdminTraccar(adminId: string) {
  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return null;
  }
  return {
    serverUrl: admin.traccar_server_url,
    email: admin.traccar_email,
    password: admin.traccar_password,
    authHeader: getAuthHeader(admin.traccar_email, admin.traccar_password),
  };
}

// GET: Fetch all geofences from Traccar
export async function GET(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const admin = await getAdminTraccar(adminId);
  if (!admin) return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });

  try {
    const res = await fetch(`${admin.serverUrl}/api/geofences`, {
      headers: { Authorization: admin.authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar ${res.status}`);
    const geofences = await res.json();
    return NextResponse.json({ geofences });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed", geofences: [] },
      { status: 502 }
    );
  }
}

// POST: Create a new geofence
export async function POST(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const admin = await getAdminTraccar(adminId);
  if (!admin) return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });

  const body = await request.json();

  try {
    const res = await fetch(`${admin.serverUrl}/api/geofences`, {
      method: "POST",
      headers: {
        Authorization: admin.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Traccar ${res.status}: ${errText}`);
    }
    const geofence = await res.json();
    return NextResponse.json({ geofence });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}

// PUT: Update an existing geofence
export async function PUT(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const admin = await getAdminTraccar(adminId);
  if (!admin) return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "geofence id required" }, { status: 400 });

  try {
    const res = await fetch(`${admin.serverUrl}/api/geofences/${body.id}`, {
      method: "PUT",
      headers: {
        Authorization: admin.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Traccar ${res.status}: ${errText}`);
    }
    const geofence = await res.json();
    return NextResponse.json({ geofence });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}

// DELETE: Remove a geofence
export async function DELETE(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  const geofenceId = request.nextUrl.searchParams.get("geofenceId");
  if (!adminId || !geofenceId) {
    return NextResponse.json({ error: "adminId and geofenceId required" }, { status: 400 });
  }

  const admin = await getAdminTraccar(adminId);
  if (!admin) return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });

  try {
    const res = await fetch(`${admin.serverUrl}/api/geofences/${geofenceId}`, {
      method: "DELETE",
      headers: { Authorization: admin.authHeader },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar ${res.status}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
