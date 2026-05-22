import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// GET - List all admin tenants (only for super admins)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adminId = searchParams.get("adminId");

  if (!adminId) {
    return NextResponse.json({ error: "Missing adminId" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check if requester is super admin
  const { data: requester } = await supabase
    .from("admins")
    .select("is_super_admin")
    .eq("id", adminId)
    .single();

  if (!requester?.is_super_admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Fetch all admins with user count
  const { data: admins, error } = await supabase
    .from("admins")
    .select(`
      id, company_name, email, phone, address, status,
      is_super_admin, subscription_plan, 
      max_users, max_vehicles, created_at, updated_at
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get user counts for each admin
  const adminIds = admins?.map(a => a.id) || [];
  const { data: userCounts } = await supabase
    .from("users")
    .select("admin_id")
    .in("admin_id", adminIds);

  const countMap: Record<string, number> = {};
  userCounts?.forEach(u => {
    countMap[u.admin_id] = (countMap[u.admin_id] || 0) + 1;
  });

  const adminsWithCounts = admins?.map(a => ({
    ...a,
    user_count: countMap[a.id] || 0,
  }));

  return NextResponse.json({ admins: adminsWithCounts });
}

// POST - Create new admin tenant (only for super admins)
export async function POST(request: Request) {
  const body = await request.json();
  const { 
    requesterId, 
    company_name, 
    email, 
    password,
    phone, 
    address,
    subscription_plan = "basic",
    max_users = 5,
    max_vehicles = 10,
  } = body;

  if (!requesterId || !company_name || !email || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check if requester is super admin
  const { data: requester } = await supabase
    .from("admins")
    .select("is_super_admin")
    .eq("id", requesterId)
    .single();

  if (!requester?.is_super_admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check if email already exists in admins
  const { data: existingAdmins } = await supabase
    .from("admins")
    .select("id")
    .eq("email", email.toLowerCase());

  if (existingAdmins && existingAdmins.length > 0) {
    return NextResponse.json({ error: "An admin with this email already exists" }, { status: 400 });
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, 12);

  // Create the admin account
  const { data: newAdmin, error: adminError } = await supabase
    .from("admins")
    .insert({
      name: company_name, // Required field
      company_name,
      email: email.toLowerCase(),
      password_hash,
      phone: phone || null,
      address: address || null,
      is_super_admin: false,
      subscription_plan,
      status: "active",
      max_users,
      max_vehicles,
    })
    .select()
    .single();

  if (adminError) {
    return NextResponse.json({ error: adminError.message }, { status: 500 });
  }

  // Create default owner user for this admin
  const ownerPasswordHash = await bcrypt.hash(password, 12);
  const { error: userError } = await supabase
    .from("users")
    .insert({
      admin_id: newAdmin.id,
      email: email.toLowerCase(),
      password_hash: ownerPasswordHash,
      is_owner: true,
      status: "active",
    });

  if (userError) {
    console.error("Failed to create owner user:", userError);
  }

  // Create default notification preferences for the user
  // notification_preferences uses user_id not admin_id
  
  // Create default company profile
  await supabase.from("company_profiles").insert({
    admin_id: newAdmin.id,
    company_name,
    default_currency: "EUR",
  });

  return NextResponse.json({ 
    success: true, 
    admin: newAdmin,
    message: "Admin tenant created successfully with default owner user"
  });
}

// PATCH - Update admin tenant
export async function PATCH(request: Request) {
  const body = await request.json();
  const { requesterId, adminId, ...updates } = body;

  if (!requesterId || !adminId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check if requester is super admin
  const { data: requester } = await supabase
    .from("admins")
    .select("is_super_admin")
    .eq("id", requesterId)
    .single();

  if (!requester?.is_super_admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Don't allow updating super admin status through this endpoint
  delete updates.is_super_admin;
  delete updates.password_hash;

  const { data, error } = await supabase
    .from("admins")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", adminId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, admin: data });
}

// DELETE - Deactivate admin tenant (soft delete)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const requesterId = searchParams.get("requesterId");
  const adminId = searchParams.get("adminId");

  if (!requesterId || !adminId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check if requester is super admin
  const { data: requester } = await supabase
    .from("admins")
    .select("is_super_admin")
    .eq("id", requesterId)
    .single();

  if (!requester?.is_super_admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Cannot delete yourself
  if (requesterId === adminId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Soft delete by setting status to cancelled
  const { error } = await supabase
    .from("admins")
    .update({ 
      status: "cancelled",
      updated_at: new Date().toISOString()
    })
    .eq("id", adminId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
