import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/lib/encryption";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Fetch user's email settings (passwords returned masked)
export async function GET(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("user_email_settings")
      .select("*")
      .eq("admin_id", adminId)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ settings: null });
    }

    // Return settings with masked passwords
    return NextResponse.json({
      settings: {
        id: data.id,
        email_address: data.email_address,
        display_name: data.display_name,
        imap_host: data.imap_host,
        imap_port: data.imap_port,
        imap_secure: data.imap_secure,
        imap_user: data.imap_user,
        imap_password: data.imap_password_encrypted ? "••••••••" : "",
        smtp_host: data.smtp_host,
        smtp_port: data.smtp_port,
        smtp_secure: data.smtp_secure,
        smtp_user: data.smtp_user,
        smtp_password: data.smtp_password_encrypted ? "••••••••" : "",
        signature_html: data.signature_html,
        is_active: data.is_active,
        last_sync_at: data.last_sync_at,
        sync_error: data.sync_error,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Save / update email settings
export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Check for existing settings
    const { data: existing } = await supabase
      .from("user_email_settings")
      .select("id, imap_password_encrypted, smtp_password_encrypted")
      .eq("admin_id", adminId)
      .single();

    const record: any = {
      admin_id: adminId,
      email_address: body.email_address,
      display_name: body.display_name || null,
      imap_host: body.imap_host,
      imap_port: body.imap_port || 993,
      imap_secure: body.imap_secure !== false,
      imap_user: body.imap_user,
      smtp_host: body.smtp_host,
      smtp_port: body.smtp_port || 587,
      smtp_secure: body.smtp_secure !== false,
      smtp_user: body.smtp_user,
      signature_html: body.signature_html || null,
      is_active: body.is_active !== false,
    };

    // Only update passwords if they are not the masked placeholder
    if (body.imap_password && body.imap_password !== "••••••••") {
      record.imap_password_encrypted = encrypt(body.imap_password);
    } else if (existing?.imap_password_encrypted) {
      record.imap_password_encrypted = existing.imap_password_encrypted;
    }

    if (body.smtp_password && body.smtp_password !== "••••••••") {
      record.smtp_password_encrypted = encrypt(body.smtp_password);
    } else if (existing?.smtp_password_encrypted) {
      record.smtp_password_encrypted = existing.smtp_password_encrypted;
    }

    let result;
    if (existing) {
      result = await supabase
        .from("user_email_settings")
        .update(record)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("user_email_settings")
        .insert(record)
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: result.data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
