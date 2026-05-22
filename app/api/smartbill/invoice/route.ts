import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SMARTBILL_API_URL = "https://ws.smartbill.ro/SBORO/api";

// Create invoice in Smartbill
export async function POST(req: NextRequest) {
  try {
    const { integrationId, orderId, invoiceId, series: seriesName, invoiceData } = await req.json();

    const supabase = await createClient();

    // Get integration by ID
    const { data: integration } = await supabase
      .from("billing_integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("is_active", true)
      .single();

    if (!integration) {
      return NextResponse.json({ success: false, error: "Smartbill integration not configured or inactive" }, { status: 400 });
    }

    // Get order with customer/business partner, vehicle and trailer.
    // Vehicle/trailer joins are used as a safety net to rebuild the
    // article name on the server side when the client didn't supply
    // one (e.g. older callers or direct API hits without the dialog).
    const { data: order } = await supabase
      .from("orders")
      .select(`
        *,
        customer:business_partners!orders_customer_id_fkey(*),
        vehicle:vehicles!orders_vehicle_id_fkey(id, plate_number),
        trailer:trailers!orders_trailer_id_fkey(id, plate_number)
      `)
      .eq("id", orderId)
      .single();

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    // Get or create invoice record
    let invoice;
    if (invoiceId) {
      const { data } = await supabase
        .from("order_invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      invoice = data;
    }

    const customer = order.customer;

    // Use invoice data from request or fall back to order data
    const amount = invoiceData?.amount || order.customer_price || 0;
    const currency = invoiceData?.currency || order.currency || "EUR";
    const taxRate = invoiceData?.tax_rate ?? 21;
    const taxType = invoiceData?.tax_type || "Normala"; // Use tax type directly from Smartbill
    const issueDate = invoiceData?.issue_date || new Date().toISOString().split("T")[0];
    const dueDate = invoiceData?.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Determine if tax is included based on tax type
    const isTaxIncluded = taxType === "TVA Inclus";

    // ── Article / line name resolution ──
    // 1. If the caller supplied a non-empty `line_description` we trust
    //    it verbatim (the dialog already prefills the Romanian template
    //    and lets the operator tweak it).
    // 2. Otherwise rebuild the same template server-side from the
    //    joined vehicle/trailer so old callers and API hits without the
    //    dialog keep working.
    //
    // The reference shown on the invoice line is the customer's own
    // order number (`customer_reference`, e.g. "13/5427") — NOT our
    // internal reference_number (INT-XXXX). Customers reconcile our
    // bills against their purchase orders, so the customer ref is what
    // they need to see on the line. We fall back to the internal ref
    // only when customer_reference is unset.
    const ownVehiclePlate = (order as any)?.vehicle?.plate_number || null;
    const ownTrailerPlate = (order as any)?.trailer?.plate_number || null;
    const subcontractorVehiclePlate = (order as any)?.subcontractor_vehicle_plate || null;
    const subcontractorTrailerPlate = (order as any)?.subcontractor_trailer_plate || null;
    const lkwPlate = ownVehiclePlate || subcontractorVehiclePlate || "";
    const lkwTrailer = ownTrailerPlate || subcontractorTrailerPlate || "";
    const lkwLabel = [lkwPlate, lkwTrailer].filter(Boolean).join("/");
    const customerRef = ((order as any)?.customer_reference || "").toString().trim();
    const referenceForArticle = customerRef || order.reference_number || orderId;
    const fallbackArticleName = lkwLabel
      ? `TRANSPORT MARFA CONFORM COMENZII ${referenceForArticle} - LKW ${lkwLabel}`
      : `TRANSPORT MARFA CONFORM COMENZII ${referenceForArticle}`;
    const articleName =
      typeof invoiceData?.line_description === "string" && invoiceData.line_description.trim().length > 0
        ? invoiceData.line_description.trim()
        : fallbackArticleName;

    // Build full address from address fields
    const customerAddress = [
      customer?.address_line1,
      customer?.address_line2,
      customer?.postal_code,
    ].filter(Boolean).join(", ");

    // Build Smartbill invoice payload
    const smartbillPayload = {
      companyVatCode: integration.smartbill_cif,
      client: {
        name: customer?.name || "Unknown Customer",
        vatCode: customer?.vat_number || customer?.tax_id || "",
        regCom: customer?.registration_number || "",
        address: customerAddress || "",
        city: customer?.city || "",
        country: customer?.country || "Romania",
        email: customer?.email || "",
        phone: customer?.phone || "",
        isTaxPayer: !!(customer?.vat_number || customer?.tax_id),
      },
      issueDate: issueDate,
      seriesName: seriesName,
      isDraft: false,
      dueDate: dueDate,
      deliveryDate: issueDate,
      currency: currency,
      language: "RO",
      precision: 2,
      products: [
        {
          name: articleName,
          code: order.reference_number || "",
          measuringUnitName: "buc",
          currency: currency,
          quantity: 1,
          price: amount,
          isTaxIncluded: isTaxIncluded,
          // Use tax type name directly from Smartbill (Normala, Redusa, SDD, Taxare inversa, etc.)
          taxName: taxType,
          taxPercentage: taxRate,
          saveToDb: false,
        },
      ],
      mentions: order.internal_notes || "",
    };

    // Create Basic Auth header
    const authHeader = Buffer.from(`${integration.smartbill_email}:${integration.smartbill_token}`).toString("base64");

    // Call Smartbill API
    const response = await fetch(`${SMARTBILL_API_URL}/invoice`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Basic ${authHeader}`,
      },
      body: JSON.stringify(smartbillPayload),
    });

    const responseData = await response.json();

    if (!response.ok || responseData.errorText) {
      console.error("Smartbill create invoice error:", responseData);

      // Log sync error - use actual invoice_sync_log schema
      if (invoiceId) {
        await supabase.from("invoice_sync_log").insert({
          integration_id: integration.id,
          order_invoice_id: invoiceId,
          sync_status: "error",
          sync_error: responseData.errorText || responseData.message || "Unknown error",
          synced_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({ 
        success: false, 
        error: responseData.errorText || responseData.message || "Failed to create invoice" 
      });
    }

    // Success - update invoice record
    // Smartbill returns number with series prefix, we need to extract just the number
    let smartbillNumber = responseData.number || responseData.invoiceNumber;
    const smartbillSeries = responseData.series || seriesName;
    
    // If the number includes the series prefix, strip it
    if (typeof smartbillNumber === 'string' && smartbillNumber.startsWith(smartbillSeries)) {
      smartbillNumber = smartbillNumber.substring(smartbillSeries.length);
    }

    let savedInvoiceId = invoiceId;
    
    if (invoiceId) {
      const { error: updateError } = await supabase.from("order_invoices").update({
        invoice_number: `${smartbillSeries}${smartbillNumber}`,
        accounting_system: "smartbill",
        accounting_sync_status: "synced",
        accounting_sync_id: responseData.number?.toString(),
        accounting_sync_at: new Date().toISOString(),
        status: "issued",
        issue_date: new Date().toISOString().split("T")[0],
      }).eq("id", invoiceId);
    } else {
      // Create new invoice record
      const totalWithTax = amount * (1 + taxRate / 100);
      const { data: insertedInvoice, error: insertError } = await supabase.from("order_invoices").insert({
        order_id: orderId,
        admin_id: integration.admin_id,
        business_partner_id: order.customer_id,
        direction: "outgoing",
        invoice_number: `${smartbillSeries}${smartbillNumber}`,
        smartbill_series: smartbillSeries,
        smartbill_number: smartbillNumber?.toString(),
        amount: amount,
        currency: currency,
        tax_rate: taxRate,
        total_with_tax: totalWithTax,
        status: "issued",
        issue_date: issueDate,
        due_date: dueDate,
        accounting_system: "smartbill",
        accounting_sync_status: "synced",
        accounting_sync_id: responseData.number?.toString(),
        accounting_sync_at: new Date().toISOString(),
      }).select("id").single();
      
      if (insertedInvoice) {
        savedInvoiceId = insertedInvoice.id;
      }
    }

    // Log successful sync
    if (savedInvoiceId) {
      await supabase.from("invoice_sync_log").insert({
        integration_id: integration.id,
        order_invoice_id: savedInvoiceId,
        sync_status: "synced",
        external_number: smartbillNumber?.toString(),
        external_series: smartbillSeries,
        synced_at: new Date().toISOString(),
      });
    }

    // Log activity
    await supabase.from("order_activity_log").insert({
      order_id: orderId,
      action: "invoice_synced_smartbill",
      details: { 
        invoice_number: `${smartbillSeries}${smartbillNumber}`,
        series: smartbillSeries,
      },
      performed_by_type: "admin",
      performed_by_id: integration.admin_id,
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: `${smartbillSeries}${smartbillNumber}`,
      rawNumber: smartbillNumber,
      series: smartbillSeries,
      smartbillData: responseData,
    });
  } catch (err: any) {
    console.error("Smartbill invoice error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Get invoice PDF from Smartbill
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceNumber = searchParams.get("number");
    const series = searchParams.get("series");
    const integrationId = searchParams.get("integrationId");

    if (!invoiceNumber || !series) {
      return NextResponse.json({ success: false, error: "Invoice number and series required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get integration - either by ID or by session
    let integration;
    
    if (integrationId) {
      // Direct access via integrationId
      const { data } = await supabase
        .from("billing_integrations")
        .select("*")
        .eq("id", integrationId)
        .eq("provider", "smartbill")
        .single();
      integration = data;
    } else {
      // Fallback to session-based auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!admin) {
        return NextResponse.json({ success: false, error: "Admin not found" }, { status: 404 });
      }

      const { data } = await supabase
        .from("billing_integrations")
        .select("*")
        .eq("admin_id", admin.id)
        .eq("provider", "smartbill")
        .single();
      integration = data;
    }

    if (!integration) {
      return NextResponse.json({ success: false, error: "Smartbill integration not found" }, { status: 404 });
    }

    // Create Basic Auth header
    const authHeader = Buffer.from(`${integration.smartbill_email}:${integration.smartbill_token}`).toString("base64");

    // Build PDF URL - invoiceNumber should be just the number part (e.g., "0001" not "TMSTEST0001")
    const pdfUrl = `${SMARTBILL_API_URL}/invoice/pdf?cif=${integration.smartbill_cif}&seriesname=${series}&number=${invoiceNumber}`;

    // Get PDF
    const response = await fetch(pdfUrl, {
        method: "GET",
        headers: {
          "Accept": "application/octet-stream",
          "Authorization": `Basic ${authHeader}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ success: false, error: "Failed to fetch PDF", details: errorText }, { status: response.status });
    }

    const pdfBuffer = await response.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${series}${invoiceNumber}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("Smartbill PDF error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
