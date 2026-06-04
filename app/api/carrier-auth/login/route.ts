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
    const { data: account } = await supabase
      .from("carrier_accounts")
      .select("id, email, password_hash, company_name, contact_name, phone, vat_number, status")
      .eq("email", email.toLowerCase().trim())
      .eq("status", "active")
      .single();

    if (!account || !account.password_hash) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    await supabase
      .from("carrier_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", account.id);

    return NextResponse.json({
      success: true,
      session: {
        id: account.id,
        email: account.email,
        company_name: account.company_name,
        contact_name: account.contact_name,
        phone: account.phone,
        vat_number: account.vat_number,
      },
    });
  } catch (error) {
    console.error("[carrier-auth/login] error", error);
    return NextResponse.json(
      { success: false, error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
