import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/lib/encryption";
import nodemailer from "nodemailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MASKED = "••••••••";

export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get("adminId");
  if (!adminId) {
    return NextResponse.json({ error: "Missing adminId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("system_email_settings")
    .select("*")
    .eq("admin_id", adminId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data) {
    return NextResponse.json({
      ...data,
      smtp_password: data.smtp_password_encrypted ? MASKED : "",
      // Map database column names to frontend field names for backwards compat
      from_email: data.email_address,
      from_name: data.display_name,
    });
  }

  return NextResponse.json(null);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { adminId, ...settings } = body;

  if (!adminId) {
    return NextResponse.json({ error: "Missing adminId" }, { status: 400 });
  }

  // Check if settings already exist
  const { data: existing } = await supabase
    .from("system_email_settings")
    .select("id, smtp_password_encrypted")
    .eq("admin_id", adminId)
    .maybeSingle();

  // Handle password - encrypt if new, keep existing if masked
  let passwordEncrypted = existing?.smtp_password_encrypted || null;
  if (settings.smtp_password && settings.smtp_password !== MASKED) {
    passwordEncrypted = encrypt(settings.smtp_password);
  }

  const settingsData = {
    admin_id: adminId,
    smtp_host: settings.smtp_host,
    smtp_port: settings.smtp_port,
    smtp_secure: settings.smtp_secure ?? true,
    smtp_user: settings.smtp_user,
    smtp_password_encrypted: passwordEncrypted,
    email_address: settings.from_email || settings.email_address,
    display_name: settings.from_name || settings.display_name,
    is_active: settings.is_active ?? true,
  };

  let result;
  if (existing) {
    result = await supabase
      .from("system_email_settings")
      .update(settingsData)
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from("system_email_settings")
      .insert(settingsData)
      .select()
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      ...result.data,
      smtp_password: MASKED,
    },
  });
}

// Test SMTP connection - follows same pattern as /api/email/test-connection
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminId, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password } = body;

    if (!adminId) {
      return NextResponse.json({ error: "Missing adminId" }, { status: 400 });
    }

    // If password is masked, get the actual password from DB
    let actualPassword = smtp_password;
    if (smtp_password === MASKED) {
      const { data: saved } = await supabase
        .from("system_email_settings")
        .select("smtp_password_encrypted")
        .eq("admin_id", adminId)
        .maybeSingle();

      if (saved?.smtp_password_encrypted) {
        actualPassword = decrypt(saved.smtp_password_encrypted);
      } else {
        return NextResponse.json({ success: false, error: "No saved password found. Please enter your password." });
      }
    }

    // Validate required fields
    if (!smtp_host || !smtp_user || !actualPassword) {
      return NextResponse.json({ success: false, error: "Host, username and password are required" });
    }

    // Test SMTP connection - exact same pattern as working /api/email/test-connection
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: smtp_port || 587,
      secure: smtp_secure === true,
      auth: { user: smtp_user, pass: actualPassword },
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });

    await transporter.verify();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "SMTP connection failed";
    return NextResponse.json({ success: false, error: message });
  }
}
