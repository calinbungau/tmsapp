import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getAuthHeader(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

// GET: Fetch groups from Traccar
export async function GET(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = getAuthHeader(admin.traccar_email, admin.traccar_password);

  try {
    const res = await fetch(`${admin.traccar_server_url}/api/groups`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar ${res.status}`);
    const groups = await res.json();
    return NextResponse.json({ groups });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed", groups: [] }, { status: 502 });
  }
}

// PUT: Create or update a group in Traccar
export async function PUT(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = getAuthHeader(admin.traccar_email, admin.traccar_password);
  const body = await request.json();

  try {
    const isUpdate = !!body.id;
    const url = isUpdate
      ? `${admin.traccar_server_url}/api/groups/${body.id}`
      : `${admin.traccar_server_url}/api/groups`;

    const res = await fetch(url, {
      method: isUpdate ? "PUT" : "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar ${res.status}`);
    const group = await res.json();
    return NextResponse.json({ group });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}

// DELETE: Remove a group from Traccar
export async function DELETE(request: NextRequest) {
  const adminId = request.nextUrl.searchParams.get("adminId");
  const groupId = request.nextUrl.searchParams.get("groupId");
  if (!adminId || !groupId) return NextResponse.json({ error: "adminId and groupId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("traccar_server_url, traccar_email, traccar_password")
    .eq("id", adminId)
    .single();

  if (!admin?.traccar_server_url || !admin?.traccar_email || !admin?.traccar_password) {
    return NextResponse.json({ error: "Traccar not configured" }, { status: 400 });
  }

  const authHeader = getAuthHeader(admin.traccar_email, admin.traccar_password);

  try {
    const res = await fetch(`${admin.traccar_server_url}/api/groups/${groupId}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Traccar ${res.status}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
