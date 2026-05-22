import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SMARTBILL_API_URL = "https://ws.smartbill.ro/SBORO/api";

// Cancel/Storno invoice in Smartbill
export async function POST(req: NextRequest) {
  try {
    const { 
      integrationId, 
      invoiceId,
      orderId,
      series,
      number,
      cancelType = "cancel", // "cancel" or "storno"
    } = await req.json();

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

    // Get invoice details
    const { data: invoice } = await supabase
      .from("order_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    // Use the series and number from the invoice or from params
    const invoiceSeries = series || invoice.smartbill_series;
    const invoiceNumber = number || invoice.smartbill_number;

    if (!invoiceSeries || !invoiceNumber) {
      return NextResponse.json({ success: false, error: "Invoice series and number required" }, { status: 400 });
    }

    // Create Basic Auth header
    const authHeader = Buffer.from(`${integration.smartbill_email}:${integration.smartbill_token}`).toString("base64");

    let response;
    let responseData;

    if (cancelType === "storno") {
      // Storno - creates a reversal invoice (factura storno)
      // This is used when the invoice has already been fiscalized or sent to the customer
      const stornoPayload = {
        companyVatCode: integration.smartbill_cif,
        seriesName: invoiceSeries,
        number: invoiceNumber,
        issueDate: new Date().toISOString().split("T")[0],
      };

      response = await fetch(`${SMARTBILL_API_URL}/invoice/storno`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Basic ${authHeader}`,
        },
        body: JSON.stringify(stornoPayload),
      });

      responseData = await response.json();
    } else {
      // Cancel/Delete - marks the invoice as cancelled (anulare)
      // This is used for draft invoices or invoices that haven't been sent
      const cancelUrl = `${SMARTBILL_API_URL}/invoice/cancel?cif=${integration.smartbill_cif}&seriesname=${invoiceSeries}&number=${invoiceNumber}`;

      response = await fetch(cancelUrl, {
        method: "PUT",
        headers: {
          "Accept": "application/json",
          "Authorization": `Basic ${authHeader}`,
        },
      });

      responseData = await response.json();
    }

    if (!response.ok || responseData.errorText) {
      console.error("Smartbill cancel error:", responseData);
      return NextResponse.json({ 
        success: false, 
        error: responseData.errorText || responseData.message || "Failed to cancel invoice" 
      });
    }

    // Update invoice in our database
    const newStatus = cancelType === "storno" ? "storno" : "cancelled";
    
    await supabase.from("order_invoices").update({
      status: newStatus,
      accounting_sync_status: "synced",
      accounting_sync_at: new Date().toISOString(),
    }).eq("id", invoiceId);

    // If storno, also create a record for the storno invoice
    if (cancelType === "storno" && responseData.number) {
      // Extract storno invoice number
      let stornoNumber = responseData.number;
      const stornoSeries = responseData.series || invoiceSeries;
      
      if (typeof stornoNumber === 'string' && stornoNumber.startsWith(stornoSeries)) {
        stornoNumber = stornoNumber.substring(stornoSeries.length);
      }

      await supabase.from("order_invoices").insert({
        order_id: orderId || invoice.order_id,
        admin_id: integration.admin_id,
        business_partner_id: invoice.business_partner_id,
        direction: "outgoing",
        invoice_number: `${stornoSeries}${stornoNumber}`,
        smartbill_series: stornoSeries,
        smartbill_number: stornoNumber?.toString(),
        amount: -(invoice.amount || 0),
        currency: invoice.currency,
        tax_rate: invoice.tax_rate,
        total_with_tax: -(invoice.total_with_tax || 0),
        status: "issued",
        issue_date: new Date().toISOString().split("T")[0],
        accounting_system: "smartbill",
        accounting_sync_status: "synced",
        accounting_sync_id: responseData.number?.toString(),
        accounting_sync_at: new Date().toISOString(),
      });
    }

    // Log activity
    await supabase.from("order_activity_log").insert({
      order_id: orderId || invoice.order_id,
      action: cancelType === "storno" ? "invoice_storno_smartbill" : "invoice_cancelled_smartbill",
      details: { 
        invoice_id: invoiceId,
        invoice_number: `${invoiceSeries}${invoiceNumber}`,
        cancel_type: cancelType,
        storno_number: cancelType === "storno" ? responseData.number : null,
      },
      performed_by_type: "admin",
      performed_by_id: integration.admin_id,
    });

    return NextResponse.json({
      success: true,
      cancelType,
      newStatus,
      stornoNumber: cancelType === "storno" ? responseData.number : null,
      smartbillData: responseData,
    });
  } catch (err: any) {
    console.error("Smartbill cancel error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
