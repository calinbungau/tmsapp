import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Two-step carrier upload portal
// ─────────────────────────────────────────────────────────────────────────────
// One token covers the entire post-delivery document handoff:
//
//   Step 1 — "cmr_pod": carrier uploads CMR + POD scans right after
//            delivery. Most carriers have these on the cab printer
//            within minutes of unloading.
//
//   Step 2 — "invoice": carrier uploads their freight invoice. This
//            often arrives DAYS later (accounting cycles). Same link
//            still works — they just bookmark it and come back.
//
// The link is only invalidated once BOTH steps are completed. The
// legacy single-step "order_confirmation" token type is preserved
// untouched for the contract-signature flow that runs at order
// creation time.
// ─────────────────────────────────────────────────────────────────────────────

// GET: Validate token and return order info + per-step progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const { data: tokenData, error } = await supabase
      .from("carrier_upload_tokens")
      .select("*, orders:order_id(id, reference_number, status, customer_price, carrier_cost, carrier_currency)")
      .eq("token", token)
      .single();

    if (error || !tokenData) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: "This upload link has expired. Please contact the sender for a new link." }, { status: 410 });
    }

    const tokenType = tokenData.token_type || "order_confirmation";

    // Legacy single-step confirmation: hard-block re-uploads
    if (tokenType !== "cmr_pod" && tokenData.used_at) {
      return NextResponse.json({
        error: "This order has already been confirmed. The signed document was uploaded.",
        alreadyUsed: true,
        usedAt: tokenData.used_at,
      }, { status: 409 });
    }

    const cmrPodUploaded = !!tokenData.cmr_pod_uploaded_at;
    const invoiceUploaded = !!tokenData.invoice_uploaded_at;
    const bothComplete = cmrPodUploaded && invoiceUploaded;

    // For cmr_pod tokens, the link stays alive across visits until both
    // halves are submitted. Once they are, this acts like the legacy
    // 409 — politely tells the carrier everything's been received and
    // there's nothing more to do.
    if (tokenType === "cmr_pod" && bothComplete) {
      return NextResponse.json({
        valid: true,
        tokenType,
        completed: true,
        cmrPodUploaded,
        invoiceUploaded,
        carrierName: tokenData.carrier_name,
        carrierEmail: tokenData.carrier_email,
        orderReference: tokenData.orders?.reference_number || "N/A",
        orderId: tokenData.order_id,
        message: "All documents have already been uploaded for this order. Thank you.",
      });
    }

    return NextResponse.json({
      valid: true,
      tokenType,
      cmrPodUploaded,
      invoiceUploaded,
      completed: false,
      carrierName: tokenData.carrier_name,
      carrierEmail: tokenData.carrier_email,
      orderReference: tokenData.orders?.reference_number || "N/A",
      orderId: tokenData.order_id,
      orderCurrency: tokenData.orders?.carrier_currency || "EUR",
      orderCarrierCost: tokenData.orders?.carrier_cost ?? null,
      previouslyUploaded: !!tokenData.used_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Upload from carrier. For cmr_pod tokens the form field `step`
// determines which slot of the two-step flow the files belong to.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const { data: tokenData, error: tokenErr } = await supabase
      .from("carrier_upload_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenErr || !tokenData) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: "This upload link has expired." }, { status: 410 });
    }

    const tokenType = tokenData.token_type || "order_confirmation";

    // Order confirmation tokens are one-shot
    if (tokenData.used_at && tokenType !== "cmr_pod") {
      return NextResponse.json({ error: "Document already uploaded for this order." }, { status: 409 });
    }

    // Parse multipart body
    const formData = await request.formData();
    const filesA = formData.getAll("file") as File[];
    const filesB = formData.getAll("files") as File[];
    const allFiles = [...filesA, ...filesB].filter(f => f instanceof File && f.size > 0);

    if (allFiles.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // The `step` field disambiguates between the two halves of the
    // cmr_pod flow. Legacy tokens (and clients that don't send `step`)
    // default to the previous "cmr_pod" behaviour so nothing breaks.
    const requestedStep = (formData.get("step") as string | null) || "cmr_pod";
    const stepIsInvoice = tokenType === "cmr_pod" && requestedStep === "invoice";
    const stepIsCmrPod = tokenType === "cmr_pod" && requestedStep !== "invoice";

    // Block re-uploading a step that is already on file -- prevents
    // duplicate invoice rows on the FWD order's Invoices tab.
    if (stepIsInvoice && tokenData.invoice_uploaded_at) {
      return NextResponse.json({ error: "The invoice for this order has already been uploaded." }, { status: 409 });
    }
    if (stepIsCmrPod && tokenData.cmr_pod_uploaded_at) {
      // CMR/POD allows additional pages (sometimes drivers send a
      // second-page scan later), so we keep this permissive.
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp"];
    for (const f of allFiles) {
      if (!allowedTypes.includes(f.type)) {
        return NextResponse.json({ error: `File "${f.name}" is not a supported type. Only PDF, JPG, PNG, and WebP files are accepted.` }, { status: 400 });
      }
    }
    // Invoice step is a single-document upload by convention
    if (stepIsInvoice && allFiles.length > 1) {
      return NextResponse.json({ error: "Please upload the invoice as a single file." }, { status: 400 });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("reference_number, admin_id, status, carrier_id, carrier_cost, carrier_currency, carrier_vat_rate")
      .eq("id", tokenData.order_id)
      .single();

    // Pick the right storage folder + document_type. The folder names
    // mirror the existing CMR/POD layout so all carrier-uploaded files
    // live under the same prefix in the documents bucket.
    let docType: string;
    let folder: string;
    if (stepIsInvoice) {
      docType = "invoice_from_carrier";
      folder = "carrier-invoices";
    } else if (stepIsCmrPod) {
      docType = "cmr_pod";
      folder = "cmr-pod";
    } else {
      docType = "carrier_confirmation";
      folder = "carrier-confirmations";
    }

    const uploadedUrls: string[] = [];

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "pdf";
      // Suffix with step + index to avoid clobbering the cmr-pod files
      // when the carrier later uploads the invoice via the same token.
      const stepSlug = stepIsInvoice ? "invoice" : stepIsCmrPod ? "cmrpod" : "confirmation";
      const storagePath = `${folder}/${tokenData.order_id}/${token}_${stepSlug}_${i}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, fileBuffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadErr) {
        return NextResponse.json({ error: `Failed to upload "${file.name}": ${uploadErr.message}` }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);
      uploadedUrls.push(urlData.publicUrl);

      await supabase.from("order_documents").insert({
        order_id: tokenData.order_id,
        admin_id: order?.admin_id || null,
        document_type: docType,
        name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by_type: "carrier",
        uploaded_by_name: tokenData.carrier_name || tokenData.carrier_email,
        notes: stepIsInvoice
          ? `Carrier invoice uploaded by: ${tokenData.carrier_name || tokenData.carrier_email}`
          : stepIsCmrPod
          ? `CMR/POD document uploaded by carrier: ${tokenData.carrier_name || tokenData.carrier_email}`
          : `Signed document uploaded by carrier: ${tokenData.carrier_name || tokenData.carrier_email}`,
      });
    }

    // ── Step-specific bookkeeping ─────────────────────────────────────
    const now = new Date().toISOString();
    const tokenUpdates: Record<string, any> = {
      used_at: tokenData.used_at || now, // preserve first-upload timestamp
      uploaded_file_url: uploadedUrls[0] || tokenData.uploaded_file_url || null,
    };
    if (stepIsCmrPod) tokenUpdates.cmr_pod_uploaded_at = now;
    if (stepIsInvoice) {
      tokenUpdates.invoice_uploaded_at = now;
      tokenUpdates.invoice_file_url = uploadedUrls[0];
    }

    await supabase
      .from("carrier_upload_tokens")
      .update(tokenUpdates)
      .eq("token", token);

    // ── Auto-create the carrier invoice row on the FWD Invoices tab ──
    // Pre-fills with the order's agreed carrier_cost so the operator
    // sees a usable row immediately. They can edit invoice number,
    // amount, due date, etc. once the carrier follows up by email,
    // but at minimum the file is already attached and visible.
    //
    // We use status: 'draft' to match the convention the rest of the
    // codebase uses (the InvoiceFormDialog and Smartbill route both
    // insert with 'draft'). A previous attempt used 'received' which
    // looks more semantic but isn't a recognised status value and
    // would either violate a CHECK constraint or, worse, succeed but
    // hide the row from the Invoices tab's status filter — either way
    // explaining why the carrier-uploaded invoice never appeared.
    //
    // We also explicitly destructure and check `error` here. The
    // previous version only pulled `data` from the response, so an
    // insert failure left invoiceCreatedId as null while the carrier
    // saw "All Documents Received" — a silent failure that's the
    // worst-case UX for accounting.
    let invoiceCreatedId: string | null = null;
    let invoiceInsertError: string | null = null;
    if (stepIsInvoice && order) {
      const amount = order.carrier_cost ?? 0;
      const taxRate = order.carrier_vat_rate ?? 0;
      const totalWithTax =
        Math.round((amount * (1 + taxRate / 100)) * 100) / 100;

      // `invoice_number` is NOT NULL on order_invoices, so we generate
      // a placeholder of the form CARRIER-{first-8-chars-of-token}.
      // It signals to the operator that the row originated from the
      // upload portal and still needs the real carrier-supplied
      // number filled in — and because it's derived from the token
      // id it's guaranteed unique per upload, which avoids unique-key
      // collisions if multiple orders use the same auto-naming scheme.
      // Omitting this field is what caused the original silent
      // insert failure that left the Invoices tab empty.
      const placeholderInvoiceNumber = `CARRIER-${tokenData.id.slice(0, 8)}`;

      const insertPayload = {
        order_id: tokenData.order_id,
        admin_id: order.admin_id,
        business_partner_id: order.carrier_id,
        direction: "incoming",
        status: "draft",
        invoice_number: placeholderInvoiceNumber,
        amount,
        currency: order.carrier_currency || "EUR",
        tax_rate: taxRate,
        total_with_tax: totalWithTax,
        remaining_amount: totalWithTax,
        paid_amount: 0,
        issue_date: new Date().toISOString().split("T")[0],
        file_url: uploadedUrls[0],
        notes: `Auto-created from carrier upload portal. Submitted by ${
          tokenData.carrier_name || tokenData.carrier_email
        }. Please review and edit invoice number and amount.`,
      };

      console.log("[v0] carrier-confirm inserting auto-invoice", insertPayload);
      const { data: createdInvoice, error: invErr } = await supabase
        .from("order_invoices")
        .insert(insertPayload)
        .select("id")
        .single();

      if (invErr) {
        // Don't 500 the whole upload because of this — the file and
        // order_documents row are already in place. Log it loudly so
        // the operator can manually add the invoice later; the
        // CarrierDocumentRequestCard will still show "Invoice
        // received" because invoice_uploaded_at gets set above.
        console.error("[carrier-confirm] auto-invoice insert FAILED", invErr);
        invoiceInsertError = invErr.message;
      } else {
        invoiceCreatedId = createdInvoice?.id || null;
        console.log("[v0] carrier-confirm auto-invoice OK", { invoiceCreatedId });
      }
    }

    // ── Order status update ───────────────────────────────────────────
    // CMR/POD arriving flips the order to "fwd_documents_received".
    // The invoice step does NOT change order status — accounting
    // reconciliation is a separate workflow and many ops teams want
    // to mark the order "completed" manually only after they've
    // matched the invoice against their books.
    const fromStatus = order?.status || "unknown";
    let toStatus: string | null = null;
    let statusNote = "";
    let activityAction: string;

    if (stepIsCmrPod) {
      toStatus = "fwd_documents_received";
      statusNote = `Carrier ${tokenData.carrier_name || tokenData.carrier_email} uploaded ${allFiles.length} CMR/POD document(s)`;
      activityAction = "cmr_pod_uploaded";
    } else if (stepIsInvoice) {
      statusNote = `Carrier ${tokenData.carrier_name || tokenData.carrier_email} uploaded the freight invoice`;
      activityAction = "carrier_invoice_uploaded";
    } else {
      toStatus = "fwd_carrier_confirmed";
      statusNote = `Carrier ${tokenData.carrier_name || tokenData.carrier_email} uploaded signed document`;
      activityAction = "carrier_confirmed_order";
    }

    if (toStatus) {
      await supabase.from("orders").update({ status: toStatus }).eq("id", tokenData.order_id);
      await supabase.from("order_status_history").insert({
        order_id: tokenData.order_id,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by_type: "carrier",
        changed_by: null,
        notes: statusNote,
      });
    }

    await supabase.from("order_activity_log").insert({
      order_id: tokenData.order_id,
      action: activityAction,
      details: {
        carrier_name: tokenData.carrier_name,
        carrier_email: tokenData.carrier_email,
        document_urls: uploadedUrls,
        file_names: allFiles.map(f => f.name),
        file_count: allFiles.length,
        step: stepIsInvoice ? "invoice" : stepIsCmrPod ? "cmr_pod" : "confirmation",
        invoice_id: invoiceCreatedId,
        invoice_insert_error: invoiceInsertError, // surfaces silent failures
        confirmed_at: now,
      },
      performed_by_type: "carrier",
      performed_by_id: tokenData.carrier_email,
    });

    const message = stepIsInvoice
      ? "Invoice uploaded successfully. Thank you."
      : stepIsCmrPod
      ? `${allFiles.length} CMR/POD document(s) uploaded successfully.`
      : "Document uploaded successfully. The order has been confirmed.";

    return NextResponse.json({
      success: true,
      message,
      step: stepIsInvoice ? "invoice" : stepIsCmrPod ? "cmr_pod" : "confirmation",
      documentUrls: uploadedUrls,
      fileCount: allFiles.length,
      invoiceId: invoiceCreatedId,
    });
  } catch (err: any) {
    console.error("[carrier-confirm] Upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
