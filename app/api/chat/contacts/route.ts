import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/chat/contacts - List contactable users and drivers
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const adminId = searchParams.get("adminId");
  const search = searchParams.get("search") || "";

  if (!adminId) {
    return NextResponse.json({ error: "adminId required" }, { status: 400 });
  }

  try {
    // Fetch admin owner first (canonical admin identity)
    const { data: admin } = await supabase
      .from("admins")
      .select("id, name, email")
      .eq("id", adminId)
      .single();

    // Fetch sub-admin users (not the owner)
    const usersQuery = supabase
      .from("users")
      .select("id, email, admin_id, is_owner, status, employee:employees(first_name, last_name)")
      .eq("admin_id", adminId)
      .eq("status", "active");

    // Fetch drivers
    const driversQuery = supabase
      .from("drivers")
      .select("id, name, phone, status")
      .eq("admin_id", adminId)
      .eq("status", "active");

    if (search) {
      driversQuery.ilike("name", `%${search}%`);
    }

    const [{ data: users }, { data: drivers }] = await Promise.all([
      usersQuery,
      driversQuery,
    ]);

    const contacts: {
      user_id: string;
      user_type: string;
      display_name: string;
      subtitle: string;
    }[] = [];

    // Add the owner admin first (use admin table ID as canonical)
    if (admin) {
      if (!search || (admin.name || "").toLowerCase().includes(search.toLowerCase())) {
        contacts.push({
          user_id: admin.id,
          user_type: "admin",
          display_name: admin.name || "Admin",
          subtitle: admin.email || "",
        });
      }
    }

    // Track which emails we've already added to avoid duplicates
    const addedEmails = new Set<string>();
    if (admin?.email) addedEmails.add(admin.email.toLowerCase());

    // Map sub-admin users (skip the owner since we already added them above)
    for (const u of users || []) {
      // Skip if this is the owner user (avoid duplicate with admin entry above)
      if (u.is_owner) continue;
      // Skip if we already have this email
      if (addedEmails.has(u.email.toLowerCase())) continue;

      const emp = Array.isArray(u.employee) ? u.employee[0] : u.employee;
      const name = emp ? `${emp.first_name} ${emp.last_name}` : u.email;
      if (search && !name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) continue;
      addedEmails.add(u.email.toLowerCase());
      contacts.push({
        user_id: u.id,
        user_type: "admin",
        display_name: name,
        subtitle: u.email,
      });
    }

    // Map drivers
    for (const d of drivers || []) {
      contacts.push({
        user_id: d.id,
        user_type: "driver",
        display_name: d.name || "Driver",
        subtitle: d.phone || "Driver",
      });
    }

    return NextResponse.json({ contacts });
  } catch (err: any) {
    console.error("Chat contacts error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
