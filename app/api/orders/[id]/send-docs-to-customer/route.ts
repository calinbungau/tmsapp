import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";

/**
 * POST /api/orders/[id]/send-docs-to-customer
 *
 * Sends a selection of documents (order documents + outgoing
 * customer invoices) from the parent order and any subcontract
 * child orders to the customer via email. Optionally merges all
 * attachments into a single PDF using pdf-lib.
 *
 * The route is intentionally tolerant of mixed content types:
 * non-PDF attachments (JPG, PNG) are embedded as PDF pages when
 * merging is requested, so the customer always receives one clean
 * PDF if that mode is chosen. When merging is off, files are
 * attached individually in their original formats.
 *
 * Authentication mirrors the existing sign-and-send pattern: the
 * caller must include `x-admin-id`, and we use the admin's
 * configured SMTP (user_email_settings) so the email leaves from
 * the company's own mailbox rather than a system address.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Hard cap on combined attachment size to keep SMTP servers happy.
// Most providers reject anything over ~25MB; 20MB is a safe ceiling
// that still accommodates a CMR PDF + a couple of invoice PDFs.
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

type SelectedDoc = {
  // 'order_document' = row from order_documents, 'invoice' = row from order_invoices
  type: "order_document" | "invoice";
  id: string;
};

async function fetchAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("[send-docs] fetch failed", { url, status: res.status });
      return null;
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const arrayBuf = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuf), contentType };
  } catch (err) {
    console.error("[send-docs] fetch threw", { url, err });
    return null;
  }
}

/**
 * Merge a list of file buffers into a single PDF. PDFs are
 * appended page-by-page; raster images (JPEG/PNG) are embedded
 * on a new page sized to the image. Anything else is skipped
 * with a warning — there's no sensible way to embed an arbitrary
 * binary blob in a PDF.
 */
async function mergeIntoSinglePdf(
  files: Array<{ buffer: Buffer; contentType: string; filename: string }>
): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const ct = file.contentType.toLowerCase();
    try {
      if (ct.includes("pdf")) {
        const src = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
        const copiedPages = await merged.copyPages(src, src.getPageIndices());
        copiedPages.forEach((p) => merged.addPage(p));
      } else if (ct.includes("png") || file.filename.toLowerCase().endsWith(".png")) {
        const img = await merged.embedPng(file.buffer);
        const page = merged.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else if (
        ct.includes("jpeg") ||
        ct.includes("jpg") ||
        file.filename.toLowerCase().endsWith(".jpg") ||
        file.filename.toLowerCase().endsWith(".jpeg")
      ) {
        const img = await merged.embedJpg(file.buffer);
        const page = merged.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else {
        console.warn("[send-docs] skipping unmergeable file in merge mode", { filename: file.filename, contentType: ct });
      }
    } catch (err) {
      console.error("[send-docs] merge failed for one file, skipping", { filename: file.filename, err });
    }
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = request.headers.get("x-admin-id");
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await ctx.params;
    const body = await request.json();
    const {
      recipient_email,
      cc_email,
      subject,
      message,
      documents,
      merge,
      merged_filename,
    } = body as {
      recipient_email: string;
      cc_email?: string;
      subject?: string;
      message?: string;
      documents: SelectedDoc[];
      merge: boolean;
      merged_filename?: string;
    };

    if (!recipient_email || !documents || documents.length === 0) {
      return NextResponse.json(
        { error: "recipient_email and at least one document are required" },
        { status: 400 }
      );
    }

    // ── Verify the order exists and is owned by this admin ──
    // We also pull customer + parent_order_id so the route can
    // include the reference number in the email subject when
    // the caller didn't override it.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, admin_id, reference_number, customer_id, customer_reference, parent_order_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.admin_id !== adminId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Resolve every selected document to a downloadable URL ──
    // We do this in two grouped queries (one per source table)
    // rather than N round trips. The result preserves the order
    // the caller selected things in so attachment ordering in the
    // merged PDF and in the email body is predictable.
    const docIds = documents.filter((d) => d.type === "order_document").map((d) => d.id);
    const invoiceIds = documents.filter((d) => d.type === "invoice").map((d) => d.id);

    const [docRowsRes, invoiceRowsRes] = await Promise.all([
      docIds.length
        ? supabase
            .from("order_documents")
            .select("id, name, file_url, mime_type, document_type, order_id")
            .in("id", docIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? supabase
            .from("order_invoices")
            .select(
              "id, invoice_number, file_url, order_id, direction, smartbill_series, smartbill_number, admin_id"
            )
            .in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (docRowsRes.error || invoiceRowsRes.error) {
      console.error("[send-docs] resolution failed", docRowsRes.error, invoiceRowsRes.error);
      return NextResponse.json({ error: "Failed to resolve documents" }, { status: 500 });
    }

    const docRows = docRowsRes.data || [];
    const invoiceRows = invoiceRowsRes.data || [];

    // ── Tenant-isolation guard ──
    // We never trust the client-supplied document IDs. Even though
    // RLS would prevent cross-tenant reads, we additionally confirm
    // every document belongs either to the current order or to one
    // of its subcontract children — otherwise an attacker could pass
    // arbitrary doc IDs they happen to know.
    const { data: childOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("parent_order_id", orderId);
    const allowedOrderIds = new Set<string>([orderId, ...(childOrders?.map((o) => o.id) || [])]);

    const allRows = [
      ...docRows.map((r) => ({
        kind: "order_document" as const,
        id: r.id,
        order_id: r.order_id,
        url: r.file_url,
        filename: r.name || `document-${r.id.slice(0, 8)}`,
        mime: r.mime_type || "application/octet-stream",
      })),
      ...invoiceRows.map((r) => ({
        kind: "invoice" as const,
        id: r.id,
        order_id: r.order_id,
        url: r.file_url,
        // Smartbill-backed invoices have no stored file_url — the PDF
        // is fetched on demand from Smartbill's API. We carry the
        // series/number through so the downloader below can decide
        // which strategy to use.
        smartbill_series: (r as any).smartbill_series as string | null,
        smartbill_number: (r as any).smartbill_number as string | null,
        invoice_admin_id: (r as any).admin_id as string | null,
        filename: r.invoice_number ? `Invoice-${r.invoice_number}.pdf` : `invoice-${r.id.slice(0, 8)}.pdf`,
        mime: "application/pdf",
      })),
    ];

    const unauthorized = allRows.find((r) => !allowedOrderIds.has(r.order_id));
    if (unauthorized) {
      console.error("[send-docs] unauthorized doc selected", unauthorized);
      return NextResponse.json({ error: "One or more documents do not belong to this order" }, { status: 403 });
    }

    // A row is downloadable if it has EITHER a stored file_url OR
    // (for invoices) the Smartbill coordinates needed to pull the
    // PDF from Smartbill's API on the fly. Anything else would
    // produce an empty attachment and confuse the customer.
    const downloadable = allRows.filter((r) => {
      if (r.url) return true;
      if (r.kind === "invoice") {
        const inv = r as typeof r & { smartbill_series?: string | null; smartbill_number?: string | null };
        return !!(inv.smartbill_series && inv.smartbill_number);
      }
      return false;
    });
    if (downloadable.length === 0) {
      return NextResponse.json({ error: "None of the selected documents have a stored file" }, { status: 400 });
    }

    // ── Resolve the Smartbill integration once ──
    // Every Smartbill invoice in this batch belongs to the same
    // admin (the caller), so we only need to look it up once. We
    // skip the query entirely when no Smartbill rows are involved
    // to keep the happy path (stored Blob URLs) fast.
    const needsSmartbill = downloadable.some(
      (r) => !r.url && r.kind === "invoice"
    );
    let smartbillIntegration: {
      smartbill_email: string;
      smartbill_token: string;
      smartbill_cif: string;
    } | null = null;
    if (needsSmartbill) {
      const { data: integ } = await supabase
        .from("billing_integrations")
        .select("smartbill_email, smartbill_token, smartbill_cif")
        .eq("admin_id", adminId)
        .eq("provider", "smartbill")
        .eq("is_active", true)
        .maybeSingle();
      smartbillIntegration = integ as typeof smartbillIntegration;
    }

    // ── Download all selected files in parallel ──
    // Two backends are possible:
    //   1. Stored Blob URL — plain HTTPS fetch.
    //   2. Smartbill invoice — call their /invoice/pdf endpoint with
    //      HTTP Basic auth using the admin's stored credentials.
    const fetched = await Promise.all(
      downloadable.map(async (row) => {
        if (row.url) {
          const res = await fetchAsBuffer(row.url as string);
          return res ? { ...row, ...res } : null;
        }
        if (row.kind === "invoice" && smartbillIntegration) {
          const inv = row as typeof row & { smartbill_series: string; smartbill_number: string };
          const authHeader = Buffer.from(
            `${smartbillIntegration.smartbill_email}:${smartbillIntegration.smartbill_token}`
          ).toString("base64");
          const pdfUrl = `https://ws.smartbill.ro/SBORO/api/invoice/pdf?cif=${encodeURIComponent(
            smartbillIntegration.smartbill_cif
          )}&seriesname=${encodeURIComponent(inv.smartbill_series)}&number=${encodeURIComponent(inv.smartbill_number)}`;
          try {
            const r = await fetch(pdfUrl, {
              method: "GET",
              headers: {
                Accept: "application/octet-stream",
                Authorization: `Basic ${authHeader}`,
              },
            });
            if (!r.ok) {
              console.error("[send-docs] smartbill PDF fetch failed", {
                status: r.status,
                series: inv.smartbill_series,
                number: inv.smartbill_number,
              });
              return null;
            }
            const arrayBuf = await r.arrayBuffer();
            return {
              ...row,
              buffer: Buffer.from(arrayBuf),
              contentType: "application/pdf",
            };
          } catch (err) {
            console.error("[send-docs] smartbill PDF fetch threw", err);
            return null;
          }
        }
        return null;
      })
    );
    const successfulFetches = fetched.filter((x): x is NonNullable<typeof x> => x !== null);

    if (successfulFetches.length === 0) {
      return NextResponse.json({ error: "Failed to download any of the selected documents" }, { status: 502 });
    }

    // Enforce the total size cap to avoid SMTP rejections.
    const totalBytes = successfulFetches.reduce((sum, f) => sum + f.buffer.byteLength, 0);
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return NextResponse.json(
        {
          error: `Combined attachment size (${(totalBytes / 1024 / 1024).toFixed(1)} MB) exceeds the ${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024} MB limit. Please send fewer documents at a time.`,
        },
        { status: 413 }
      );
    }

    // ── Build the attachment list ──
    let attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
    if (merge) {
      const mergedBuffer = await mergeIntoSinglePdf(
        successfulFetches.map((f) => ({
          buffer: f.buffer,
          contentType: f.contentType,
          filename: f.filename,
        }))
      );
      const finalName =
        (merged_filename && merged_filename.trim()) ||
        `Documents-${order.reference_number || orderId.slice(0, 8)}.pdf`;
      attachments = [
        {
          filename: finalName.endsWith(".pdf") ? finalName : `${finalName}.pdf`,
          content: mergedBuffer,
          contentType: "application/pdf",
        },
      ];
    } else {
      // Deduplicate filenames so SMTP doesn't silently collapse them.
      const seen = new Map<string, number>();
      attachments = successfulFetches.map((f) => {
        const baseName = f.filename;
        const seenCount = seen.get(baseName) || 0;
        seen.set(baseName, seenCount + 1);
        const finalName = seenCount === 0 ? baseName : baseName.replace(/(\.[^.]+)?$/, `-${seenCount}$1`);
        return {
          filename: finalName,
          content: f.buffer,
          contentType: f.contentType,
        };
      });
    }

    // ── Load SMTP config from user_email_settings ──
    // Same source as the existing sign-and-send route — the admin's
    // own outbound mailbox. Keeps email auditability consistent.
    const { data: settings } = await supabase
      .from("user_email_settings")
      .select("*")
      .eq("admin_id", adminId)
      .single();

    if (!settings) {
      return NextResponse.json(
        { error: "Email settings are not configured. Go to Email > Settings to set up SMTP." },
        { status: 400 }
      );
    }

    const smtpPassword = decrypt(settings.smtp_password_encrypted);
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: { user: settings.smtp_user, pass: smtpPassword },
    });

    const fromAddress = settings.display_name
      ? `"${settings.display_name}" <${settings.email_address}>`
      : settings.email_address;

    const finalSubject =
      (subject && subject.trim()) ||
      `Documents for ${order.reference_number || "your order"}`;

    const finalBody =
      (message && message.trim()) ||
      `Dear customer,\n\nPlease find attached the documents for ${
        order.reference_number ? `order ${order.reference_number}` : "your order"
      }${order.customer_reference ? ` (your ref: ${order.customer_reference})` : ""}.\n\nKind regards.`;

    await transporter.sendMail({
      from: fromAddress,
      to: recipient_email,
      cc: cc_email || undefined,
      subject: finalSubject,
      html: `<p>${finalBody.replace(/\n/g, "<br>")}</p>` +
        (settings.signature_html ? `<br>${settings.signature_html}` : ""),
      attachments,
    });

    // ── Audit trail ──
    // Log the send to order_activity_log so the dashboard activity
    // feed shows exactly which documents went to which customer
    // address and when. The details payload is the full source of
    // truth for any later support inquiries.
    await supabase.from("order_activity_log").insert({
      order_id: orderId,
      action: "documents_sent_to_customer",
      details: {
        recipient_email,
        cc_email: cc_email || null,
        subject: finalSubject,
        merged: merge,
        document_count: documents.length,
        attachment_count: attachments.length,
        total_bytes: totalBytes,
        documents: documents,
        failed_downloads: downloadable.length - successfulFetches.length,
        sent_at: new Date().toISOString(),
      },
      performed_by_type: "admin",
      performed_by_id: adminId,
    });

    return NextResponse.json({
      success: true,
      message: `Sent ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} to ${recipient_email}`,
      total_bytes: totalBytes,
      merged: merge,
    });
  } catch (error: any) {
    console.error("[send-docs] uncaught error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send documents" },
      { status: 500 }
    );
  }
}
