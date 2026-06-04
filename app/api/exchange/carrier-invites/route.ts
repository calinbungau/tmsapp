import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { decrypt } from "@/lib/encryption";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";
import { APP_LINKS, APP_NAME } from "@/lib/exchange/app-links";

const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bngtracking.ro").replace(/\/+$/, "");
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/exchange/carrier-invites?partnerId=...
 * Returns the portal connection status for a carrier business partner:
 * whether an account is already linked, or an invite is pending.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerId = request.nextUrl.searchParams.get("partnerId");
  if (!partnerId) return NextResponse.json({ error: "partnerId required" }, { status: 400 });

  // Already connected? (an account is linked to this tenant's partner)
  const { data: link } = await supabase
    .from("carrier_account_partners")
    .select("carrier_account_id, carrier_accounts(email, contact_name, last_login_at)")
    .eq("admin_id", adminId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (link) {
    const acct = (link as { carrier_accounts: { email: string; contact_name: string | null; last_login_at: string | null } | null }).carrier_accounts;
    return NextResponse.json({
      status: "connected",
      account: acct ? { email: acct.email, contactName: acct.contact_name, lastLoginAt: acct.last_login_at } : null,
    });
  }

  // Pending invite?
  const { data: invite } = await supabase
    .from("carrier_invites")
    .select("token, email, status, invited_at")
    .eq("admin_id", adminId)
    .eq("partner_id", partnerId)
    .neq("status", "revoked")
    .order("invited_at", { ascending: false })
    .maybeSingle();

  if (invite && invite.status === "pending") {
    return NextResponse.json({
      status: "invited",
      invite: {
        url: `${APP_BASE}/carrier?invite=${invite.token}`,
        email: invite.email,
        invitedAt: invite.invited_at,
      },
    });
  }

  return NextResponse.json({ status: "not_invited" });
}

/**
 * POST /api/exchange/carrier-invites
 * Body: { partnerId, sendEmail?: boolean }
 * Creates (or reuses) a portal invite for a carrier business partner and
 * returns a shareable link. Optionally emails the invite via tenant SMTP.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const adminId = request.headers.get("x-admin-id");
  const userId = request.headers.get("x-user-id");
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const partnerId: string | undefined = body.partnerId;
    const sendEmail: boolean = body.sendEmail !== false;
    if (!partnerId) return NextResponse.json({ error: "partnerId required" }, { status: 400 });

    // Load the partner (scoped to tenant) for name + email.
    const { data: partner } = await supabase
      .from("business_partners")
      .select("id, name, email, types")
      .eq("id", partnerId)
      .eq("admin_id", adminId)
      .maybeSingle();
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    // If already connected, short-circuit.
    const { data: link } = await supabase
      .from("carrier_account_partners")
      .select("carrier_account_id")
      .eq("admin_id", adminId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (link) {
      return NextResponse.json({ status: "connected", message: "This carrier already has a connected account." });
    }

    // Reuse an existing pending invite token, else create one.
    let token: string;
    const { data: existing } = await supabase
      .from("carrier_invites")
      .select("id, token")
      .eq("admin_id", adminId)
      .eq("partner_id", partnerId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      token = existing.token;
      await supabase
        .from("carrier_invites")
        .update({ email: partner.email, invited_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      token = randomBytes(24).toString("base64url");
      const { error: insErr } = await supabase.from("carrier_invites").insert({
        admin_id: adminId,
        partner_id: partnerId,
        token,
        email: partner.email,
        status: "pending",
      });
      if (insErr) {
        console.error("[carrier-invites] insert failed", insErr);
        return NextResponse.json({ error: "Could not create invite" }, { status: 500 });
      }
    }

    const inviteUrl = `${APP_BASE}/carrier?invite=${token}`;

    // Optionally email the invite using the tenant's SMTP settings.
    let emailed = false;
    if (sendEmail && partner.email && emailRe.test(partner.email.trim())) {
      try {
        const settings = await getUserEmailSettingsRow(supabase, adminId, userId);
        if (settings && settings.smtp_password_encrypted) {
          const smtpPass = decrypt(settings.smtp_password_encrypted);
          const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: settings.smtp_port,
            secure: settings.smtp_secure,
            auth: { user: settings.smtp_user, pass: smtpPass },
            connectionTimeout: 15000,
            socketTimeout: 15000,
          });
          const fromAddress = settings.display_name
            ? `"${settings.display_name}" <${settings.email_address}>`
            : settings.email_address;
          const companyName = settings.display_name || "Echipa noastră";
          await transporter.sendMail({
            from: fromAddress,
            to: partner.email.trim(),
            subject: `${companyName} vă invită pe portalul de transport`,
            html: buildInviteEmailHtml({
              carrierName: partner.name || "Partener",
              companyName,
              inviteUrl,
              signature: settings.signature_html || null,
            }),
          });
          emailed = true;
        }
      } catch (e) {
        console.error("[carrier-invites] email failed", e);
      }
    }

    return NextResponse.json({ status: "invited", url: inviteUrl, emailed });
  } catch (e) {
    console.error("[carrier-invites] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function buildInviteEmailHtml(opts: {
  carrierName: string;
  companyName: string;
  inviteUrl: string;
  signature: string | null;
}): string {
  const { carrierName, companyName, inviteUrl, signature } = opts;
  return `<!DOCTYPE html>
  <html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="padding:24px;">
          <p style="margin:0 0 16px;color:#0f172a;font-size:14px;">Bună ziua <strong>${esc(carrierName)}</strong>,</p>
          <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.5;">
            ${esc(companyName)} vă invită să vă conectați pe portalul de transport. Creați-vă contul gratuit pentru a vedea ofertele, a trimite prețuri și a comunica direct cu dispecerul.
          </p>
          <div style="text-align:center;margin:4px 0 20px;">
            <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Creați contul</a>
          </div>
          <div style="margin-top:8px;padding:16px;background:#0f172a;border-radius:12px;text-align:center;">
            <p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:600;">Aplicația ${esc(APP_NAME)} pentru transportatori</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:12px;line-height:1.5;">Gestionați toate ofertele direct din telefon.</p>
            <a href="${APP_LINKS.appStore}" style="display:inline-block;margin:0 4px;background:#ffffff;color:#0f172a;text-decoration:none;font-size:12px;font-weight:600;padding:9px 16px;border-radius:8px;">App Store</a>
            <a href="${APP_LINKS.googlePlay}" style="display:inline-block;margin:0 4px;background:#ffffff;color:#0f172a;text-decoration:none;font-size:12px;font-weight:600;padding:9px 16px;border-radius:8px;">Google Play</a>
          </div>
          ${signature ? `<div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:16px;">${signature}</div>` : ""}
        </div>
        <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">Trimis de ${esc(companyName)} prin BNG Tracking</p>
        </div>
      </div>
    </div>
  </body></html>`;
}
