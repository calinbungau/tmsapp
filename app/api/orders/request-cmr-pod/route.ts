import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Request CMR / POD + Invoice from the carrier
// ─────────────────────────────────────────────────────────────────────────────
// Fires automatically when an FWD order moves into "Documents Pending" and
// can also be triggered manually from the order detail panel (resend with
// optional custom recipient email). One email covers BOTH carrier handoffs:
//
//   Step 1 — CMR / POD scans (right after delivery)
//   Step 2 — Carrier's freight invoice (often days later)
//
// The same link works for both visits until both are uploaded; see
// /api/carrier/confirm/[token] for the two-step server logic.
//
// Request body:
//   { orderId, forceResend?: boolean, recipientEmail?: string,
//     customMessage?: string }
//
//   • forceResend=true  reuses the existing token's URL (so any older
//                       emails still work) and bypasses the duplicate
//                       guard. Without it, a 409 is returned if a
//                       cmr_pod token is already outstanding.
//
//   • recipientEmail    overrides the carrier's stored email for this
//                       send only — does NOT mutate business_partners.
//                       Useful when the carrier asks you to CC dispatch
//                       or send to a different ops mailbox.
//
//   • customMessage     freeform paragraph injected above the upload
//                       button. Renders as plain text inside the
//                       branded card.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({} as any));
    const { orderId, forceResend, recipientEmail, customMessage } = body || {};
    if (!orderId) return NextResponse.json({ error: "Order ID is required" }, { status: 400 });

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, reference_number, status, admin_id, carrier_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Look up any existing outstanding cmr_pod token for this order.
    // We use it to reuse the same link on resends (so older emails
    // sent to the carrier still resolve to the same upload page) and
    // to enforce the no-duplicate guard on first send.
    const { data: existingToken } = await supabase
      .from("carrier_upload_tokens")
      .select("id, token, expires_at, cmr_pod_uploaded_at, invoice_uploaded_at")
      .eq("order_id", orderId)
      .eq("token_type", "cmr_pod")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If both halves are already uploaded, there's nothing useful left
    // to ask the carrier for. Block resend.
    if (existingToken?.cmr_pod_uploaded_at && existingToken?.invoice_uploaded_at) {
      return NextResponse.json({
        error: "Both CMR/POD and invoice have already been uploaded for this order.",
        alreadyComplete: true,
      }, { status: 409 });
    }

    if (existingToken && !forceResend) {
      return NextResponse.json({ error: "CMR/POD request already sent", alreadySent: true }, { status: 409 });
    }

    if (!order.carrier_id) {
      return NextResponse.json({ error: "No carrier assigned to this order" }, { status: 400 });
    }

    const { data: carrier } = await supabase
      .from("business_partners")
      .select("name, email")
      .eq("id", order.carrier_id)
      .single();

    // Resolve final destination. Custom recipient wins; otherwise fall
    // back to the carrier's stored email.
    const toEmail = (recipientEmail && typeof recipientEmail === "string" && recipientEmail.includes("@"))
      ? recipientEmail.trim()
      : carrier?.email || null;

    if (!toEmail) {
      return NextResponse.json({ error: "No recipient email available — provide a custom recipient or set one on the carrier." }, { status: 400 });
    }

    const settings = await getUserEmailSettingsRow(supabase, adminId, userId);

    if (!settings?.smtp_password_encrypted) {
      return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });
    }

    // Either reuse the live token or mint a fresh one.
    let tokenString: string;
    let isResend = false;

    if (existingToken && forceResend) {
      tokenString = existingToken.token;
      isResend = true;
      // Bump the token's expiry to give the carrier another 60 days
      // from "now". If they ignored the first email for a month, the
      // resend shouldn't expire in two weeks.
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 60);
      await supabase
        .from("carrier_upload_tokens")
        .update({
          expires_at: newExpiry.toISOString(),
          carrier_email: toEmail, // record the latest recipient
        })
        .eq("id", existingToken.id);
    } else {
      tokenString = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);
      const { error: tokenErr } = await supabase
        .from("carrier_upload_tokens")
        .insert({
          token: tokenString,
          order_id: orderId,
          carrier_email: toEmail,
          carrier_name: carrier?.name || null,
          admin_id: adminId,
          token_type: "cmr_pod",
          expires_at: expiresAt.toISOString(),
        });
      if (tokenErr) {
        return NextResponse.json({ error: "Failed to create upload token" }, { status: 500 });
      }
    }

    // Build upload link — pinned to the production domain. The env
    // var is ignored when it looks like a Vercel preview URL so
    // carrier-facing emails never leak v0/preview links.
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const isPreviewUrl = /vercel\.app|v0-|\.vusercontent\./.test(envUrl);
    const baseUrl = envUrl && !isPreviewUrl ? envUrl : "https://app.bngtracking.ro";
    const uploadLink = `${baseUrl}/carrier/confirm/${tokenString}`;
    const refNumber = order.reference_number || orderId.slice(0, 8);

    const emailHtml = buildTwoStepEmailHtml({
      carrierName: carrier?.name || "Carrier",
      refNumber,
      uploadLink,
      companyName: settings.display_name || "Our Company",
      isResend,
      customMessage: typeof customMessage === "string" ? customMessage.trim() : "",
      // Status badges in the email reflect what's already on file
      cmrDone: !!existingToken?.cmr_pod_uploaded_at,
      invoiceDone: !!existingToken?.invoice_uploaded_at,
    });

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

    const fullHtml = settings.signature_html
      ? `${emailHtml}<br/>${settings.signature_html}`
      : emailHtml;

    const subjectPrefix = isResend ? "Reminder: " : "";
    await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `${subjectPrefix}Order ${refNumber} — CMR/POD and Invoice required`,
      html: fullHtml,
    });

    // First-send only: nudge the order forward to documents-pending so
    // the operator's funnel reflects "we've asked the carrier".
    if (!isResend) {
      const fromStatus = order.status;
      if (fromStatus !== "fwd_documents_pending" && fromStatus !== "fwd_documents_received") {
        await supabase.from("orders").update({ status: "fwd_documents_pending" }).eq("id", orderId);
        await supabase.from("order_status_history").insert({
          order_id: orderId,
          from_status: fromStatus,
          to_status: "fwd_documents_pending",
          changed_by_type: "admin",
          changed_by: adminId,
          notes: `CMR/POD + invoice request sent to: ${toEmail}`,
        });
      }
    }

    await supabase.from("order_activity_log").insert({
      order_id: orderId,
      action: isResend ? "cmr_pod_request_resent" : "cmr_pod_requested",
      details: {
        carrier_name: carrier?.name,
        carrier_email_on_file: carrier?.email,
        sent_to: toEmail,
        is_custom_recipient: !!recipientEmail && recipientEmail !== carrier?.email,
        custom_message: customMessage || null,
        upload_link: uploadLink,
        upload_token: tokenString,
        sent_at: new Date().toISOString(),
      },
      performed_by_type: "admin",
      performed_by_id: adminId,
    });

    return NextResponse.json({
      success: true,
      uploadLink,
      token: tokenString,
      sentTo: toEmail,
      resent: isResend,
    });
  } catch (err: any) {
    console.error("[request-cmr-pod] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Email body ─────────────────────────────────────────────────────────────
function buildTwoStepEmailHtml(opts: {
  carrierName: string;
  refNumber: string;
  uploadLink: string;
  companyName: string;
  isResend: boolean;
  customMessage: string;
  cmrDone: boolean;
  invoiceDone: boolean;
}) {
  const stepRow = (
    n: number,
    label: string,
    done: boolean,
    description: string
  ) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="36" style="vertical-align: top;">
              <div style="width: 28px; height: 28px; border-radius: 999px; background: ${
                done ? "#10b981" : "#d4a843"
              }; color: #1a1a2e; font-weight: 700; font-size: 13px; text-align: center; line-height: 28px;">
                ${done ? "&#10003;" : n}
              </div>
            </td>
            <td style="vertical-align: top;">
              <div style="font-size: 14px; color: #1a1a2e; font-weight: 600;">
                ${label} ${done ? '<span style="color:#10b981;font-weight:500;font-size:12px;">(received)</span>' : ""}
              </div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${description}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const customBlock = opts.customMessage
    ? `
      <div style="margin: 0 0 16px; padding: 12px 14px; background: #fffbeb; border-left: 3px solid #d4a843; border-radius: 4px; font-size: 13px; line-height: 1.55; color: #1a1a2e; white-space: pre-wrap;">
        ${escapeHtml(opts.customMessage)}
      </div>
    `
    : "";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #1a1a2e; padding: 22px 30px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #d4a843; margin: 0; font-size: 18px;">
          ${opts.isResend ? "Reminder: Documents Still Needed" : "Post-Delivery Documents Required"}
        </h2>
        <p style="color: #a0a0b0; margin: 6px 0 0; font-size: 13px;">Reference: ${opts.refNumber}</p>
      </div>
      <div style="background: #ffffff; padding: 26px 30px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6;">
          Dear <strong>${opts.carrierName}</strong>,
        </p>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">
          ${opts.isResend
            ? `This is a friendly reminder that we still need documents for order <strong>${opts.refNumber}</strong>.`
            : `The delivery for order <strong>${opts.refNumber}</strong> has been completed. Please upload the following documents using the secure link below.`}
        </p>

        ${customBlock}

        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 8px 0 18px;">
          ${stepRow(1, "CMR &amp; Proof of Delivery", opts.cmrDone,
            "Scans of the signed CMR pages and/or POD. Multiple files allowed.")}
          ${stepRow(2, "Carrier Invoice", opts.invoiceDone,
            "Your freight invoice for this delivery. PDF preferred.")}
        </table>

        <p style="margin: 0 0 18px; font-size: 13px; line-height: 1.55; color: #4b5563;">
          You don&apos;t need to send both at once — use the same link whenever each
          document is ready. The link stays active until both have been uploaded.
        </p>

        <div style="text-align: center; margin: 22px 0 18px;">
          <a href="${opts.uploadLink}"
             style="display: inline-block; background: #d4a843; color: #1a1a2e; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">
            Open Upload Page
          </a>
        </div>
        <p style="margin: 0 0 6px; font-size: 12px; color: #6b7280; text-align: center;">
          Or copy this link:
        </p>
        <p style="margin: 0 0 0; font-size: 12px; text-align: center; word-break: break-all;">
          <a href="${opts.uploadLink}" style="color: #d4a843;">${opts.uploadLink}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 22px 0 14px;" />
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          This link expires in 60 days. If you have any questions, please reply to this email.
        </p>
      </div>
      <div style="background: #1a1a2e; padding: 14px 30px; border-radius: 0 0 8px 8px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #6b7280;">
          Sent by ${opts.companyName} via BNG Tracking
        </p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
