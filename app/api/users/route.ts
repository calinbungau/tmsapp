import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// Create a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { admin_id, email, password, role_id, employee_id, status } = body;

    if (!admin_id || !email) {
      return NextResponse.json(
        { error: "Admin ID and email are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if email already exists for this admin
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("admin_id", admin_id)
      .eq("email", email.toLowerCase().trim())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password if provided
    let password_hash = null;
    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    // Create user
    const { data: user, error } = await supabase
      .from("users")
      .insert({
        admin_id,
        email: email.toLowerCase().trim(),
        password_hash,
        role_id: role_id === "none" ? null : role_id,
        employee_id: employee_id === "none" ? null : employee_id,
        status: status || "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating user:", error);
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    // Create default notification preferences
    await supabase.from("notification_preferences").insert({
      user_id: user.id,
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("User creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Update a user
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, email, password, role_id, employee_id, status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Build update object
    const updateData: Record<string, unknown> = {
      email: email?.toLowerCase().trim(),
      role_id: role_id === "none" ? null : role_id,
      employee_id: employee_id === "none" ? null : employee_id,
      status,
      updated_at: new Date().toISOString(),
    };

    // Only hash and update password if provided
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const { data: user, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating user:", error);
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Delete a user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting user:", error);
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("User deletion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
