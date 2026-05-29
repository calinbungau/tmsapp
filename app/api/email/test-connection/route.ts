import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";

function getSupabase() { return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); }

const MASKED = "••••••••";

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    const body = await request.json();

    // If passwords are masked, look up the real ones from DB
    let imapPass = body.imap_password;
    let smtpPass = body.smtp_password;

    if ((imapPass === MASKED || smtpPass === MASKED) && adminId) {
      // Prefer the per-user row; fall back to a tenant-scoped legacy row.
      let saved: any = null;
      if (userId) {
        const { data } = await supabase
          .from("user_email_settings")
          .select("imap_password_encrypted, smtp_password_encrypted")
          .eq("admin_id", adminId)
          .eq("user_id", userId)
          .maybeSingle();
        saved = data ?? null;
      }
      if (!saved) {
        const { data } = await supabase
          .from("user_email_settings")
          .select("imap_password_encrypted, smtp_password_encrypted")
          .eq("admin_id", adminId)
          .is("user_id", null)
          .maybeSingle();
        saved = data ?? null;
      }

      if (saved) {
        if (imapPass === MASKED && saved.imap_password_encrypted) {
          imapPass = decrypt(saved.imap_password_encrypted);
        }
        if (smtpPass === MASKED && saved.smtp_password_encrypted) {
          smtpPass = decrypt(saved.smtp_password_encrypted);
        }
      }
    }

    const results: { imap: boolean; smtp: boolean; imapError?: string; smtpError?: string } = {
      imap: false,
      smtp: false,
    };

    // Test IMAP
    try {
      const client = new ImapFlow({
        host: body.imap_host,
        port: body.imap_port || 993,
        secure: body.imap_secure !== false,
        auth: { user: body.imap_user, pass: imapPass },
        logger: false,
        greetTimeout: 10000,
        socketTimeout: 10000,
      });
      await client.connect();
      await client.logout();
      results.imap = true;
    } catch (err: any) {
      results.imapError = err.message || "IMAP connection failed";
    }

    // Test SMTP
    try {
      const transporter = nodemailer.createTransport({
        host: body.smtp_host,
        port: body.smtp_port || 587,
        secure: body.smtp_secure === true,
        auth: { user: body.smtp_user, pass: smtpPass },
        connectionTimeout: 10000,
        socketTimeout: 10000,
      });
      await transporter.verify();
      results.smtp = true;
    } catch (err: any) {
      results.smtpError = err.message || "SMTP connection failed";
    }

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
