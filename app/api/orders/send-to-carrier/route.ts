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

export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-admin-id");
    const userId = request.headers.get("x-user-id");
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      orderId,
      carrierEmail,
      carrierEmails,
      carrierName,
      subject,
      message,
      orderHtml,
      // New: client-rendered PDF, base64-encoded. Preferred over orderHtml.
      orderPdfBase64,
      orderPdfFilename,
      lang,
    } = await request.json();

    // Accept either a single `carrierEmail` (legacy) or an array
    // `carrierEmails` (new chip-input UI). We normalize to a deduped
    // array of trimmed addresses, then keep the first one as the
    // primary recipient stored on the upload token (the token is
    // scoped to one carrier identity, but the SMTP `to:` field is sent
    // to all recipients in parallel).
    const rawList: string[] = Array.isArray(carrierEmails) && carrierEmails.length > 0
      ? carrierEmails
      : (carrierEmail ? [carrierEmail] : []);
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = Array.from(
      new Set(
        rawList
          .map((e: string) => (typeof e === "string" ? e.trim() : ""))
          .filter((e: string) => e.length > 0 && emailRe.test(e))
          .map((e: string) => e.toLowerCase()),
      ),
    );

    if (!orderId || recipients.length === 0) {
      return NextResponse.json({ error: "Order ID and at least one valid email address are required" }, { status: 400 });
    }
    const primaryEmail = recipients[0];

    // Get the order to verify it exists and get reference number.
    // We grab the full row + stops here because we want to snapshot
    // every operationally-meaningful field at send-time. The dispatcher
    // needs to be able to look back later and ask "what did we send to
    // the carrier last week?" — without a snapshot we'd only see the
    // current order data, which by then has already been mutated (new
    // dates, swapped stops, repriced).
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, reference_number, status, admin_id, customer_id, carrier_id, " +
          "customer_price, customer_currency, carrier_cost, carrier_currency, " +
          "weight_kg, pallet_count, volume_m3, loading_meters, " +
          "cargo_description, goods_type, adr_class, special_instructions, " +
          "temperature_min, temperature_max, " +
          "estimated_distance_km, estimated_duration_hours"
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    // Supabase's typed client widens to GenericStringError when the
    // select string is concatenated, so we narrow back to a permissive
    // shape for snapshot construction. Runtime fields are guaranteed
    // by the SQL select above.
    const o = order as any;

    // Pull stops separately and order them by sequence so the snapshot
    // mirrors what the operator sees in the dialog left-to-right.
    const { data: stopsRows } = await supabase
      .from("order_stops")
      .select(
        "id, sequence_order, stop_type, company_name, address, city, country, " +
          "postal_code, planned_date, planned_time_from, planned_time_to, " +
          "reference_number, contact_name, contact_phone, contact_email"
      )
      .eq("order_id", orderId)
      .order("sequence_order", { ascending: true });

    // The activity-log snapshot. Trimmed to the fields a dispatcher
    // actually compares against ("did the date slip? did the price
    // change? did the route reroute?"). Anything not here can't be
    // compared retroactively — keep this list aligned with the diff
    // logic in components/tms/send-to-carrier-dialog.tsx.
    const orderSnapshot = {
      order: {
        reference_number: o.reference_number,
        status: o.status,
        customer_price: o.customer_price,
        customer_currency: o.customer_currency,
        carrier_cost: o.carrier_cost,
        carrier_currency: o.carrier_currency,
        weight_kg: o.weight_kg,
        pallet_count: o.pallet_count,
        volume_m3: o.volume_m3,
        loading_meters: o.loading_meters,
        cargo_description: o.cargo_description,
        goods_type: o.goods_type,
        adr_class: o.adr_class,
        special_instructions: o.special_instructions,
        temperature_min: o.temperature_min,
        temperature_max: o.temperature_max,
        estimated_distance_km: o.estimated_distance_km,
        estimated_duration_hours: o.estimated_duration_hours,
      },
      stops: ((stopsRows ?? []) as any[]).map((s: any) => ({
        sequence_order: s.sequence_order,
        stop_type: s.stop_type,
        company_name: s.company_name,
        address: s.address,
        city: s.city,
        country: s.country,
        postal_code: s.postal_code,
        planned_date: s.planned_date,
        planned_time_from: s.planned_time_from,
        planned_time_to: s.planned_time_to,
        reference_number: s.reference_number,
        contact_name: s.contact_name,
        contact_phone: s.contact_phone,
        contact_email: s.contact_email,
      })),
    };

    // Get SMTP settings for the acting user (per-user mailbox), with
    // legacy fallback to the tenant's pre-migration mailbox row.
    const settings = await getUserEmailSettingsRow(supabase, adminId, userId);

    if (!settings || !settings.smtp_password_encrypted) {
      return NextResponse.json({ error: "SMTP not configured. Please set up email settings first." }, { status: 400 });
    }

    // Create a unique upload token for the carrier
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

    const { error: tokenErr } = await supabase
      .from("carrier_upload_tokens")
      .insert({
        token,
        order_id: orderId,
        // The upload token is keyed to a single carrier identity. When
        // multiple recipients are addressed (e.g. carrier dispatcher +
        // backup coordinator), we store the primary address but share
        // the same link with everyone via the SMTP `to:` field.
        carrier_email: primaryEmail,
        carrier_name: carrierName || null,
        admin_id: adminId,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenErr) {
      return NextResponse.json({ error: "Failed to create upload token" }, { status: 500 });
    }

    // Build the upload link. We pin the production domain
    // (app.bngtracking.ro) unconditionally — the previous logic honored
    // NEXT_PUBLIC_APP_URL, but in practice that env var was set to the
    // auto-generated Vercel preview URL (e.g. v0-camerabng.vercel.app),
    // which leaked into carrier-facing emails. Carriers see an unstable,
    // throwaway-looking domain → trust drops. The only override we still
    // accept is NEXT_PUBLIC_APP_URL when it does NOT look like a v0/Vercel
    // preview (so local dev with `http://localhost:3000` still works).
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const isPreviewUrl = /vercel\.app|v0-|\.vusercontent\./.test(envUrl);
    const baseUrl = envUrl && !isPreviewUrl ? envUrl : "https://app.bngtracking.ro";
    const uploadLink = `${baseUrl}/carrier/confirm/${token}`;

    // Build email body with the upload link
    const refNumber = o.reference_number || orderId.slice(0, 8);
    const emailHtml = buildCarrierEmailHtml({
      carrierName: carrierName || "Carrier",
      refNumber,
      message: message || "",
      uploadLink,
      companyName: settings.display_name || "Our Company",
      lang,
    });

    // Set up SMTP transport
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

    // Build full HTML with signature
    const fullHtml = settings.signature_html
      ? `${emailHtml}<br/>${settings.signature_html}`
      : emailHtml;

    // Build attachments. Preference order:
    //   1. Client-rendered PDF (base64) → attach as Order_<ref>.pdf
    //   2. Raw HTML → fall back to .html attachment (legacy clients)
    // Carriers consistently expect a real PDF, so the client now always
    // tries to send orderPdfBase64; the orderHtml branch only kicks in
    // when client-side PDF generation crashed (rare, but kept so the
    // email still ships rather than failing the whole request).
    const attachments: any[] = [];
    if (orderPdfBase64 && typeof orderPdfBase64 === "string") {
      const cleanBase64 = orderPdfBase64.replace(/^data:application\/pdf;base64,/, "");
      const safeFilename = (typeof orderPdfFilename === "string" && orderPdfFilename.trim())
        ? orderPdfFilename.trim()
        : `Order_${refNumber}.pdf`;
      attachments.push({
        filename: safeFilename,
        content: Buffer.from(cleanBase64, "base64"),
        contentType: "application/pdf",
      });
    } else if (orderHtml) {
      // Wrap in a self-contained printable HTML document
      const printableHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Order ${refNumber}</title>
<style>
  @page { margin: 10mm; size: A4; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { margin: 0; padding: 0; background: white; }
</style>
</head><body>${orderHtml}</body></html>`;
      attachments.push({
        filename: `Order_${refNumber}.html`,
        content: Buffer.from(printableHtml, "utf-8"),
        contentType: "text/html",
      });
    }

    // Localized fallback subject. Only used when the operator left the
    // Subject field blank — typed subjects pass through untouched so the
    // user can write whatever they want without us second-guessing it.
    const SUBJECT_I18N: Record<string, string> = {
      en: `Order ${refNumber} - Confirmation Required`,
      ro: `Comanda ${refNumber} - Confirmare necesară`,
      de: `Auftrag ${refNumber} - Bestätigung erforderlich`,
      hu: `Megrendelés ${refNumber} - Visszaigazolás szükséges`,
    };
    const subjectKey = (lang && SUBJECT_I18N[lang as string]) ? (lang as string) : "en";
    const mailSubject = subject || SUBJECT_I18N[subjectKey];

    await transporter.sendMail({
      from: fromAddress,
      // nodemailer accepts a comma-joined string OR an array — using an
      // array keeps each address as a distinct RFC-5322 mailbox so they
      // all appear in the carrier's inbox `To:` header.
      to: recipients,
      subject: mailSubject,
      html: fullHtml,
      attachments,
    });

    // Update order status — Send-to-Carrier only applies to forwarder
    // (subcontract) child orders. The parent's "in_execution" status is
    // managed by the recompute trigger on child status changes; we never
    // write parent status from here. For internal orders, dispatch lives
    // on trip_legs, not on orders.status — so we skip the flip entirely.
    const fromStatus = o.status;
    let toStatus: string | null = null;
    if (fromStatus?.startsWith("fwd_")) {
      toStatus = "fwd_carrier_confirmation_required";
      await supabase.from("orders").update({
        status: toStatus,
        carrier_sent_at: new Date().toISOString(),
      }).eq("id", orderId);

      await supabase.from("order_status_history").insert({
        order_id: orderId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by_type: "admin",
        changed_by: adminId,
        notes: `Order sent to carrier: ${carrierName || primaryEmail} (${recipients.length} recipient${recipients.length > 1 ? "s" : ""}). Upload link: ${uploadLink}`,
      });
    } else {
      // Internal order — just record the email send timestamp.
      await supabase.from("orders").update({
        carrier_sent_at: new Date().toISOString(),
      }).eq("id", orderId);
      console.log("[v0] send-to-carrier on internal order — no status flip", { orderId, fromStatus });
    }

    // Log activity (with the full order snapshot so future operators
    // can diff "what was sent then" vs. "what the order looks like now").
    // We insert first to get an id, then upload the exact PDF that was
    // attached to the email under that id so each historical send has
    // its own immutable copy in storage. If the upload fails we still
    // keep the log row — the snapshot data alone is still useful.
    const sentAtIso = new Date().toISOString();
    const { data: logRow } = await supabase
      .from("order_activity_log")
      .insert({
        order_id: orderId,
        action: "order_sent_to_carrier",
        details: {
          carrier_name: carrierName,
          carrier_email: primaryEmail,
          // Keep the full recipient list so the activity log shows
          // every address the email was actually delivered to.
          carrier_emails: recipients,
          recipient_count: recipients.length,
          upload_link: uploadLink,
          upload_token: token,
          language: lang || "en",
          subject: mailSubject,
          message: message || null,
          sent_at: sentAtIso,
          // Frozen snapshot of the order at send-time. Used by the
          // dialog's "Previously sent" panel to highlight what has
          // changed in the order since this send (dates slipped,
          // price changed, stops swapped, etc.).
          order_snapshot: orderSnapshot,
        },
        performed_by_type: "admin",
        performed_by_id: adminId,
      })
      .select("id")
      .single();

    // Persist the exact attached PDF so the dispatcher can re-download
    // the document that was actually sent on a given date — not a fresh
    // re-render against today's (possibly modified) order data.
    if (logRow?.id && orderPdfBase64 && typeof orderPdfBase64 === "string") {
      try {
        const cleanBase64 = orderPdfBase64.replace(/^data:application\/pdf;base64,/, "");
        const pdfBuffer = Buffer.from(cleanBase64, "base64");
        const safeFilename = (typeof orderPdfFilename === "string" && orderPdfFilename.trim())
          ? orderPdfFilename.trim()
          : `Order_${refNumber}.pdf`;
        // Path: orders/<orderId>/sent/<logId>.pdf — stable, predictable,
        // and scoped under the order so RLS / cleanup is straightforward.
        const storagePath = `orders/${orderId}/sent/${logRow.id}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) {
          console.error("[v0] send-to-carrier: pdf archive upload failed", upErr);
        } else {
          // Patch the log row with the storage pointer + filename so
          // the UI can build a download URL later.
          await supabase
            .from("order_activity_log")
            .update({
              details: {
                carrier_name: carrierName,
                carrier_email: primaryEmail,
                carrier_emails: recipients,
                recipient_count: recipients.length,
                upload_link: uploadLink,
                upload_token: token,
                language: lang || "en",
                subject: mailSubject,
                message: message || null,
                sent_at: sentAtIso,
                order_snapshot: orderSnapshot,
                pdf_storage_path: storagePath,
                pdf_filename: safeFilename,
              },
            })
            .eq("id", logRow.id);
        }
      } catch (e) {
        console.error("[v0] send-to-carrier: pdf archive exception", e);
      }
    }

    return NextResponse.json({
      success: true,
      uploadLink,
      token,
      newStatus: toStatus,
    });
  } catch (err: any) {
    console.error("[send-to-carrier] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Translation strings for the carrier-notification email body. Keyed
// off the same `lang` value the operator picked in the Send-to-Carrier
// dialog — Romanian is the most common since this app is operated by a
// Romanian forwarder, but we keep EN/DE/HU on hand for foreign carriers.
const EMAIL_I18N = {
  en: {
    headerTitle: "Order Confirmation Required",
    refLabel: "Reference",
    greeting: (name: string) => `Dear <strong>${name}</strong>,`,
    intro: "Please find the order document attached. To confirm this order, please sign the document and upload it using the secure link below:",
    button: "Upload Signed Document",
    copyLink: "Or copy this link:",
    expiry: "This link expires in 30 days. If you have any questions, please reply to this email.",
    sentBy: (company: string) => `Sent by ${company} via BNG Tracking`,
  },
  ro: {
    headerTitle: "Confirmare comandă necesară",
    refLabel: "Referință",
    greeting: (name: string) => `Bună ziua <strong>${name}</strong>,`,
    intro: "Vă atașăm documentul de comandă. Pentru a confirma această comandă, vă rugăm să semnați documentul și să îl încărcați folosind link-ul securizat de mai jos:",
    button: "Încarcă documentul semnat",
    copyLink: "Sau copiați acest link:",
    expiry: "Acest link expiră în 30 de zile. Dacă aveți întrebări, vă rugăm să răspundeți la acest e-mail.",
    sentBy: (company: string) => `Trimis de ${company} prin BNG Tracking`,
  },
  de: {
    headerTitle: "Auftragsbestätigung erforderlich",
    refLabel: "Referenz",
    greeting: (name: string) => `Sehr geehrte Damen und Herren von <strong>${name}</strong>,`,
    intro: "Im Anhang finden Sie das Auftragsdokument. Um diesen Auftrag zu bestätigen, unterschreiben Sie das Dokument bitte und laden Sie es über den unten stehenden sicheren Link hoch:",
    button: "Unterzeichnetes Dokument hochladen",
    copyLink: "Oder kopieren Sie diesen Link:",
    expiry: "Dieser Link läuft in 30 Tagen ab. Bei Fragen antworten Sie bitte auf diese E-Mail.",
    sentBy: (company: string) => `Gesendet von ${company} über BNG Tracking`,
  },
  hu: {
    headerTitle: "Megrendelés visszaigazolása szükséges",
    refLabel: "Hivatkozás",
    greeting: (name: string) => `Tisztelt <strong>${name}</strong>!`,
    intro: "Mellékelten megtalálja a megrendelési dokumentumot. A megrendelés megerősítéséhez kérjük, írja alá a dokumentumot, és töltse fel az alábbi biztonságos linken:",
    button: "Aláírt dokumentum feltöltése",
    copyLink: "Vagy másolja ezt a linket:",
    expiry: "A link 30 napon belül lejár. Ha kérdése van, kérjük, válaszoljon erre az e-mailre.",
    sentBy: (company: string) => `Küldte: ${company} – BNG Tracking`,
  },
} as const;
type EmailLang = keyof typeof EMAIL_I18N;

function buildCarrierEmailHtml(opts: {
  carrierName: string;
  refNumber: string;
  message: string;
  uploadLink: string;
  companyName: string;
  lang?: string;
}) {
  // Fall back to English for unknown locales (e.g. an old template that
  // still ships "es" — better to send English than crash the request).
  const key = (opts.lang && (opts.lang in EMAIL_I18N) ? opts.lang : "en") as EmailLang;
  const t = EMAIL_I18N[key];

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #1a1a2e; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #d4a843; margin: 0; font-size: 18px;">${t.headerTitle}</h2>
        <p style="color: #a0a0b0; margin: 6px 0 0; font-size: 13px;">${t.refLabel}: ${opts.refNumber}</p>
      </div>
      <div style="background: #f8f9fa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">
          ${t.greeting(opts.carrierName)}
        </p>
        ${opts.message ? `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">${opts.message.replace(/\n/g, "<br/>")}</p>` : ""}
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">
          ${t.intro}
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${opts.uploadLink}" 
             style="display: inline-block; background: #d4a843; color: #1a1a2e; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">
            ${t.button}
          </a>
        </div>
        <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-align: center;">
          ${t.copyLink} <a href="${opts.uploadLink}" style="color: #d4a843; word-break: break-all;">${opts.uploadLink}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          ${t.expiry}
        </p>
      </div>
      <div style="background: #1a1a2e; padding: 16px 32px; border-radius: 0 0 8px 8px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #6b7280;">
          ${t.sentBy(opts.companyName)}
        </p>
      </div>
    </div>
  `;
}
