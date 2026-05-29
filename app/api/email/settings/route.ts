import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/encryption";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

// GET: Fetch the current user's email settings (passwords returned masked).
// Falls back to a legacy admin-scoped row (user_id IS NULL) so tenants
// upgrading from the previous single-mailbox-per-tenant model still see
// their existing config until the owner saves it under their own user.
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let row: any = null;

    if (userId) {
      const { data } = await supabase
        .from("user_email_settings")
        .select("*")
        .eq("admin_id", adminId)
        .eq("user_id", userId)
        .maybeSingle();
      row = data ?? null;
    }

    let isLegacyFallback = false;
    if (!row) {
      const { data: legacy } = await supabase
        .from("user_email_settings")
        .select("*")
        .eq("admin_id", adminId)
        .is("user_id", null)
        .maybeSingle();
      if (legacy) {
        row = legacy;
        isLegacyFallback = true;
      }
    }

    if (!row) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({
      settings: {
        id: row.id,
        email_address: row.email_address,
        display_name: row.display_name,
        imap_host: row.imap_host,
        imap_port: row.imap_port,
        imap_secure: row.imap_secure,
        imap_user: row.imap_user,
        imap_password: row.imap_password_encrypted ? "••••••••" : "",
        smtp_host: row.smtp_host,
        smtp_port: row.smtp_port,
        smtp_secure: row.smtp_secure,
        smtp_user: row.smtp_user,
        smtp_password: row.smtp_password_encrypted ? "••••••••" : "",
        signature_html: row.signature_html,
        is_active: row.is_active,
        last_sync_at: row.last_sync_at,
        sync_error: row.sync_error,
        is_legacy_fallback: isLegacyFallback,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Save / update email settings for the current user.
// If a legacy (user_id IS NULL) row exists for this admin and the caller
// has no per-user row yet, we promote that legacy row to belong to this
// user instead of creating a duplicate — this preserves SMTP/IMAP creds
// for the first owner who saves after the migration.
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!userId) {
      return NextResponse.json(
        { error: "Missing user identity. Please sign in again." },
        { status: 400 },
      );
    }

    const body = await request.json();

    // 1. Look for an existing per-user row.
    const { data: existingOwn } = await supabase
      .from("user_email_settings")
      .select("id, imap_password_encrypted, smtp_password_encrypted")
      .eq("admin_id", adminId)
      .eq("user_id", userId)
      .maybeSingle();

    // 2. If none, look for a legacy tenant-scoped row to migrate over.
    let existing = existingOwn;
    if (!existing) {
      const { data: legacy } = await supabase
        .from("user_email_settings")
        .select("id, imap_password_encrypted, smtp_password_encrypted")
        .eq("admin_id", adminId)
        .is("user_id", null)
        .maybeSingle();
      if (legacy) existing = legacy;
    }

    const record: any = {
      admin_id: adminId,
      user_id: userId,
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
