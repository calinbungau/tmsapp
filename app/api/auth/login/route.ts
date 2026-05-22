import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // First, try to find user in the new users table
    const { data: user } = await supabase
      .from("users")
      .select(`
        id,
        email,
        password_hash,
        status,
        admin_id,
        employee_id,
        role_id,
        is_owner,
        admin:admins(id, email, company_name),
        employee:employees(id, first_name, last_name),
        role:roles(id, name, permissions)
      `)
      .eq("email", email.toLowerCase())
      .eq("status", "active")
      .single();

    if (user && user.password_hash) {
      // Verify password with bcrypt
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (isValidPassword) {
        const admin = user.admin as { id: string; email: string; company_name: string } | null;
        const employee = user.employee as { id: string; first_name: string; last_name: string } | null;
        const role = user.role as { id: string; name: string; permissions: Record<string, string[]> } | null;

        return NextResponse.json({
          success: true,
          session: {
            id: admin?.id || user.admin_id,
            user_id: user.id,
            email: user.email,
            company_name: admin?.company_name || "",
            employee_name: employee ? `${employee.first_name} ${employee.last_name}`.trim() : null,
            role: role?.name || null,
            permissions: role?.permissions || {},
            isOwner: user.is_owner || false,
          },
        });
      }
    }

    // Fallback: Try legacy admins table (plain text password for backward compatibility)
    const { data: admin } = await supabase
      .from("admins")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("is_active", true)
      .single();

    if (admin) {
      // Check plain text password (legacy) or bcrypt hash
      let isValidPassword = false;
      
      if (admin.password_hash) {
        // Try bcrypt first
        if (admin.password_hash.startsWith("$2")) {
          isValidPassword = await bcrypt.compare(password, admin.password_hash);
        } else {
          // Plain text comparison (legacy)
          isValidPassword = admin.password_hash === password;
        }
      }

      if (isValidPassword) {
        return NextResponse.json({
          success: true,
          session: {
            id: admin.id,
            email: admin.email,
            company_name: admin.company_name,
            role: "Fleet Manager",
            permissions: {}, // Full access for legacy admins
            isOwner: true, // Legacy admins always have full access
          },
        });
      }
    }

    return NextResponse.json(
      { success: false, error: "Invalid email or password" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
