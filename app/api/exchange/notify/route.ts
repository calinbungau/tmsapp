import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { decrypt } from "@/lib/encryption";
import { getUserEmailSettingsRow } from "@/lib/user-email-settings";
import { resolveCarriersForGroups, type ResolvedCarrier } from "@/lib/exchange/resolve-carriers";
import { createAdminNotification } from "@/lib/admin-notifications";
import { upsertRecipients } from "@/lib/exchange/recipients";
import { APP_LINKS, APP_NAME } from "@/lib/exchange/app-links";
import {
  resolveCarrierAccountIds,
  sendNotificationToCarrierAccounts,
  NotificationTemplates,
} from "@/lib/notifications";

const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://app.bngtracking.ro").replace(/\/+$/, "");

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Notify carriers that a freight offer has been distributed to their group(s).
 *
 * Resolves carriers for the offer's ACTIVE group distributions (optionally
 * limited to a subset of groupIds — used when releasing a single tier),
 * emails each carrier an offer summary, marks the distribution rows as
 * `notified`, and records an internal dispatcher notification with the reach.
 *
 * Carriers are external business partners (no login yet), so notification is
 * email-only at this stage. In-app push for carriers arrives with the Carrier
 * Portal phase; the distribution status written here is the hook for that.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const offerId: string | undefined = body.offerId;
    const onlyGroupIds: string[] | undefined = Array.isArray(body.groupIds)
      ? body.groupIds
      : undefined;
    if (!offerId) {
      return NextResponse.json({ error: "offerId is required" }, { status: 400 });
    }

    // Load the offer (scoped to the tenant). The long select string defeats
    // supabase-js's literal type parser, so we narrow the row to OfferLite
    // (the field shape the email/notification helpers below rely on).
    const { data: offerRow, error: offerErr } = await supabase
      .from("freight_offers")
      .select(
        "id, reference, title, admin_id, origin_city, origin_country, origin_postal_code, " +
          "dest_city, dest_country, dest_postal_code, load_date_from, load_date_to, " +
          "unload_date_from, unload_date_to, vehicle_type, body_type, weight_kg, ldm, " +
          "pallet_count, adr_class, goods_description, pricing_mode, price_amount, currency, " +
          "payment_terms_days, expires_at, status"
      )
      .eq("id", offerId)
      .eq("admin_id", adminId)
      .single();

    if (offerErr || !offerRow) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const offer = offerRow as unknown as OfferLite;

    // Which groups are actively distributed for this offer?
    let distQuery = supabase
      .from("freight_offer_distributions")
      .select("id, group_id, channel, tier, status")
      .eq("offer_id", offerId)
      .eq("channel", "group")
      .not("group_id", "is", null);
    const { data: distributions } = await distQuery;

    let groupIds = Array.from(
      new Set((distributions || []).map((d) => d.group_id).filter(Boolean))
    ) as string[];
    if (onlyGroupIds && onlyGroupIds.length > 0) {
      groupIds = groupIds.filter((g) => onlyGroupIds.includes(g));
    }

    if (groupIds.length === 0) {
      return NextResponse.json({
        success: true,
        notified: 0,
        skipped: 0,
        message: "No carrier groups to notify for this offer.",
      });
    }

    // Resolve carriers (static membership + dynamic rules), de-duplicated.
    const { carriers, byGroup } = await resolveCarriersForGroups(
      supabase,
      adminId,
      groupIds
    );

    const recipients = carriers.filter(
      (c) => c.email && emailRe.test(c.email.trim())
    );
    const withoutEmail = carriers.length - recipients.length;

    // Ensure each resolved carrier has a tokenized recipient row (with PIN).
    // Re-sending reuses the existing token so a previously shared link keeps
    // working. We build lookup maps so the email can embed the carrier's link.
    const recipientByPartner = new Map<string, { token: string; pin: string }>();
    const recipientByEmail = new Map<string, { token: string; pin: string }>();
    try {
      const upserted = await upsertRecipients(supabase, {
        offerId,
        adminId,
        offerExpiresAt: offer.expires_at,
        carriers,
      });
      for (const r of upserted) {
        if (r.partnerId) recipientByPartner.set(r.partnerId, { token: r.token, pin: r.pin });
        if (r.email) recipientByEmail.set(r.email.toLowerCase(), { token: r.token, pin: r.pin });
      }
    } catch (e) {
      console.error("[exchange/notify] failed to create recipient links", e);
    }

    // SMTP settings for the acting user (falls back to tenant mailbox).
    const settings = await getUserEmailSettingsRow(supabase, adminId, userId);
    if (!settings || !settings.smtp_password_encrypted) {
      return NextResponse.json(
        { error: "SMTP not configured. Please set up email settings first." },
        { status: 400 }
      );
    }

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

    const subject = `Ofertă transport ${offer.reference}: ${formatRoute(offer)}`;

    // Send emails. We send one message per carrier so each is addressed
    // personally (and one bad address can't block the rest).
    let sent = 0;
    let failed = 0;
    await Promise.all(
      recipients.map(async (carrier) => {
        try {
          const link =
            recipientByPartner.get(carrier.id) ||
            (carrier.email ? recipientByEmail.get(carrier.email.toLowerCase()) : undefined);
          const portalUrl = link ? `${APP_BASE}/exchange/o/${link.token}` : null;
          const html = buildOfferEmailHtml({
            carrierName: carrier.name || "Partener",
            offer,
            companyName,
            signature: settings.signature_html || null,
            portalUrl,
            pin: link?.pin || null,
          });
          await transporter.sendMail({
            from: fromAddress,
            to: carrier.email!.trim(),
            subject,
            html,
          });
          sent++;
        } catch (e) {
          console.error("[exchange/notify] email failed for", carrier.email, e);
          failed++;
        }
      })
    );

    // Push the offer to carriers who have the app installed (registered a
    // device). Carriers are matched to accounts via their business-partner id;
    // those without an account simply receive the email above. Best-effort.
    try {
      const partnerIds = Array.from(
        new Set(carriers.map((c) => c.id).filter(Boolean) as string[])
      );
      const accountIdSets = await Promise.all(
        partnerIds.map((pid) => resolveCarrierAccountIds({ partnerId: pid }))
      );
      const accountIds = Array.from(new Set(accountIdSets.flat()));
      if (accountIds.length) {
        await sendNotificationToCarrierAccounts(
          accountIds,
          NotificationTemplates.newFreightOffer(formatRoute(offer), offer.reference, offerId)
        );
      }
    } catch (e) {
      console.error("[exchange/notify] carrier push failed", e);
    }

    // Mark the distribution rows for these groups as notified, recording the
    // reach + timestamp in notes so the detail page can show release history.
    const nowIso = new Date().toISOString();
    for (const gid of groupIds) {
      const reach = (byGroup[gid] || []).filter(
        (c) => c.email && emailRe.test(c.email.trim())
      ).length;
      await supabase
        .from("freight_offer_distributions")
        .update({
          status: "notified",
          notes: `Notified ${reach} carrier${reach === 1 ? "" : "s"} by email at ${nowIso}`,
          updated_at: nowIso,
        })
        .eq("offer_id", offerId)
        .eq("group_id", gid);
    }

    // Internal dispatcher notification confirming the send. This goes through
    // createAdminNotification so it fans out to `user_notifications` (powering
    // the in-app bell + realtime toast) AND sends an FCM web-push to the
    // recipient's registered devices — i.e. both "in their interface" channels.
    // Target the acting user when known, otherwise the whole team.
    try {
      await createAdminNotification({
        adminId,
        targetType: userId ? "user" : "all",
        targetId: userId || undefined,
        notificationType: "freight_offer_distributed",
        priority: "normal",
        payload: {
          title: "Offer distributed to carriers",
          body: `${offer.reference} (${formatRoute(offer)}) emailed to ${sent} carrier${sent === 1 ? "" : "s"} across ${groupIds.length} group${groupIds.length === 1 ? "" : "s"}.`,
          icon: "route",
          actionUrl: `/admin/tms/exchange/${offerId}`,
          data: {
            offer_id: offerId,
            reference: offer.reference,
            sent,
            failed,
            without_email: withoutEmail,
            groups: groupIds.length,
          },
        },
      });
    } catch (e) {
      console.error("[exchange/notify] internal notification insert failed", e);
    }

    return NextResponse.json({
      success: true,
      notified: sent,
      failed,
      withoutEmail,
      groups: groupIds.length,
      totalCarriers: carriers.length,
    });
  } catch (err) {
    console.error("[exchange/notify] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// ─── Email helpers ──────────────────────────────────────────────────────
interface OfferLite {
  reference: string;
  title: string | null;
  origin_city: string | null;
  origin_country: string | null;
  origin_postal_code: string | null;
  dest_city: string | null;
  dest_country: string | null;
  dest_postal_code: string | null;
  load_date_from: string | null;
  load_date_to: string | null;
  unload_date_from: string | null;
  unload_date_to: string | null;
  vehicle_type: string | null;
  body_type: string | null;
  weight_kg: number | null;
  ldm: number | null;
  pallet_count: number | null;
  adr_class: string | null;
  goods_description: string | null;
  pricing_mode: string;
  price_amount: number | null;
  currency: string;
  payment_terms_days: number | null;
  expires_at: string | null;
}

function formatRoute(offer: OfferLite): string {
  const o = [offer.origin_city, offer.origin_country].filter(Boolean).join(", ") || "?";
  const d = [offer.dest_city, offer.dest_country].filter(Boolean).join(", ") || "?";
  return `${o} → ${d}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return "—";
  if (!to || from === to) return fmtDate(from);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function fmtPrice(offer: OfferLite): string {
  if (offer.pricing_mode === "open") return "Preț deschis (transmiteți oferta dvs.)";
  if (offer.price_amount == null) return "La cerere";
  const formatted = new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: offer.currency || "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(offer.price_amount);
  const label =
    offer.pricing_mode === "target"
      ? " (preț țintă)"
      : offer.pricing_mode === "fixed"
      ? " (preț fix)"
      : "";
  return `${formatted}${label}`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:500;">${value}</td>
  </tr>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildOfferEmailHtml(opts: {
  carrierName: string;
  offer: OfferLite;
  companyName: string;
  signature: string | null;
  portalUrl: string | null;
  pin: string | null;
}): string {
  const { carrierName, offer, companyName, signature, portalUrl, pin } = opts;

  const cargoParts = [
    offer.weight_kg ? `${(offer.weight_kg / 1000).toFixed(1)} t` : null,
    offer.ldm ? `${offer.ldm} LDM` : null,
    offer.pallet_count ? `${offer.pallet_count} paleți` : null,
  ].filter(Boolean);

  const vehicleParts = [offer.vehicle_type, offer.body_type].filter(Boolean);

  const rows = [
    row("Referință", `<span style="font-family:monospace;">${esc(offer.reference)}</span>`),
    row("Încărcare", `${esc([offer.origin_city, offer.origin_postal_code, offer.origin_country].filter(Boolean).join(", "))}<br/><span style="color:#64748b;">${fmtDateRange(offer.load_date_from, offer.load_date_to)}</span>`),
    row("Descărcare", `${esc([offer.dest_city, offer.dest_postal_code, offer.dest_country].filter(Boolean).join(", "))}<br/><span style="color:#64748b;">${fmtDateRange(offer.unload_date_from, offer.unload_date_to)}</span>`),
    cargoParts.length ? row("Marfă", esc(cargoParts.join(" · "))) : "",
    offer.goods_description ? row("Descriere", esc(offer.goods_description)) : "",
    vehicleParts.length ? row("Vehicul", esc(vehicleParts.join(" · "))) : "",
    offer.adr_class && offer.adr_class !== "None" ? row("ADR", esc(offer.adr_class)) : "",
    row("Preț", fmtPrice(offer)),
    offer.payment_terms_days != null ? row("Termen plată", `${offer.payment_terms_days} zile`) : "",
    offer.expires_at ? row("Valabil până la", fmtDate(offer.expires_at)) : "",
  ]
    .filter(Boolean)
    .join("");

  // Secure portal CTA + PIN (only when we have a tokenized link for the carrier).
  const ctaBlock = portalUrl
    ? `<div style="margin:4px 0 20px;text-align:center;">
        <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Vizualizați oferta &amp; răspundeți</a>
        ${
          pin
            ? `<p style="margin:12px 0 0;color:#475569;font-size:13px;">Cod PIN de acces: <strong style="font-family:monospace;font-size:18px;letter-spacing:3px;color:#0f172a;">${esc(pin)}</strong></p>`
            : ""
        }
        <p style="margin:6px 0 0;color:#94a3b8;font-size:11px;">Deschideți pagina securizată pentru a accepta, trimite un preț sau a discuta în chat.</p>
      </div>`
    : "";

  // App-store promotion for the BNG Tracking carrier app.
  const appBlock = `<div style="margin-top:16px;padding:16px;background:#0f172a;border-radius:12px;text-align:center;">
      <p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:600;">Aplicația ${esc(APP_NAME)} pentru transportatori</p>
      <p style="margin:0 0 12px;color:#94a3b8;font-size:12px;line-height:1.5;">Creați-vă contul gratuit, vedeți toate ofertele și răspundeți direct din telefon.</p>
      <a href="${APP_LINKS.appStore}" style="display:inline-block;margin:0 4px;background:#ffffff;color:#0f172a;text-decoration:none;font-size:12px;font-weight:600;padding:9px 16px;border-radius:8px;">App Store</a>
      <a href="${APP_LINKS.googlePlay}" style="display:inline-block;margin:0 4px;background:#ffffff;color:#0f172a;text-decoration:none;font-size:12px;font-weight:600;padding:9px 16px;border-radius:8px;">Google Play</a>
    </div>`;

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#0f172a;padding:20px 24px;">
        <p style="margin:0;color:#ffffff;font-size:16px;font-weight:600;">Ofertă nouă de transport</p>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${esc(formatRoute(offer))}</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#0f172a;font-size:14px;">Bună ziua <strong>${esc(carrierName)}</strong>,</p>
        <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.5;">
          Vă punem la dispoziție o ofertă de transport. ${portalUrl ? "Apăsați butonul de mai jos pentru a vedea detaliile complete, a răspunde și a discuta direct cu dispecerul." : "Dacă sunteți interesat, vă rugăm să răspundeți la acest e-mail cu disponibilitatea și prețul dvs."}
        </p>
        ${ctaBlock}
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;">${rows}</table>
        ${appBlock}
      </div>
      <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">Trimis de ${esc(companyName)} prin BNG Tracking</p>
      </div>
    </div>
    ${signature ? `<div style="margin-top:16px;color:#64748b;font-size:12px;">${signature}</div>` : ""}
  </div>
</body>
</html>`;
}
