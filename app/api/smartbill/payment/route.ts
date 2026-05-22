import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SMARTBILL_API_URL = "https://ws.smartbill.ro/SBORO/api";

// Record payment in Smartbill (Emitere incasare)
export async function POST(req: NextRequest) {
  try {
    const { 
      integrationId, 
      invoiceId,
      orderId,
      series,
      number,
      paymentData 
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

    // Payment type mapping - Smartbill uses string values
    const paymentTypeMap: Record<string, string> = {
      'cash': 'Numerar',
      'numerar': 'Numerar',
      'card': 'Card',
      'bank_transfer': 'Ordin plata',
      'ordin_plata': 'Ordin plata',
      'transfer': 'Ordin plata',
      'check': 'CEC',
      'cec': 'CEC',
      'bilet_ordin': 'Bilet la ordin',
      'mandat_postal': 'Mandat postal',
      'other': 'Alta incasare',
      'alta': 'Alta incasare',
    };

    const paymentType = paymentTypeMap[paymentData?.payment_method?.toLowerCase()] || 'Ordin plata';
    const paymentValue = paymentData?.amount || invoice.total_with_tax || invoice.amount;
    const paymentDate = paymentData?.payment_date || new Date().toISOString().split("T")[0];
    const isCash = paymentType === 'Numerar';
    
    // Use the series and number from the invoice or from params
    const invoiceSeries = series || invoice.smartbill_series;
    const invoiceNumber = number || invoice.smartbill_number;

    if (!invoiceSeries || !invoiceNumber) {
      return NextResponse.json({ success: false, error: "Invoice series and number required" }, { status: 400 });
    }

    // Get customer details for the payment
    const { data: order } = await supabase
      .from("trip_orders")
      .select("*, customer:customer_id(name, vat_number, address_line1, city, country, email)")
      .eq("id", orderId || invoice.order_id)
      .single();
    
    const customer = order?.customer;

    // Build Smartbill payment payload per official API docs
    const smartbillPayload = {
      companyVatCode: integration.smartbill_cif,
      client: {
        name: customer?.name || "Unknown Customer",
        vatCode: customer?.vat_number || "",
        isTaxPayer: !!customer?.vat_number,
        address: customer?.address_line1 || "",
        city: customer?.city || "",
        country: customer?.country || "Romania",
        email: customer?.email || "",
      },
      issueDate: paymentDate,
      currency: invoice.currency || "EUR",
      language: "RO",
      precision: 2,
      value: paymentValue,
      type: paymentType,
      isCash: isCash,
      useInvoiceDetails: true,
      invoicesList: [
        {
          seriesName: invoiceSeries,
          number: invoiceNumber,
        }
      ],
    };

    // Create Basic Auth header
    const authHeader = Buffer.from(`${integration.smartbill_email}:${integration.smartbill_token}`).toString("base64");

    // Call Smartbill API for payment
    const response = await fetch(`${SMARTBILL_API_URL}/payment`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Basic ${authHeader}`,
      },
      body: JSON.stringify(smartbillPayload),
    });

    const responseText = await response.text();
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ 
        success: false, 
        error: `Smartbill API error (${response.status}): ${responseText.substring(0, 200)}` 
      });
    }

    if (!response.ok || responseData.errorText) {
      return NextResponse.json({ 
        success: false, 
        error: responseData.errorText || responseData.message || "Failed to record payment" 
      });
    }

    // Update invoice in our database.
    // The `order_invoices` table column is `paid_amount` (NOT
    // `amount_paid`) — the latter was a typo present across the
    // codebase that silently failed every update with PGRST204 and
    // left the dashboard card showing "Paid 0.00" forever.
    const newPaidAmount = (invoice.paid_amount || 0) + paymentValue;
    const totalDue = invoice.total_with_tax || invoice.amount || 0;
    const newStatus = newPaidAmount >= totalDue ? "paid" : "partial";

    await supabase.from("order_invoices").update({
      paid_amount: newPaidAmount,
      status: newStatus,
      paid_date: newStatus === "paid" ? paymentDate : invoice.paid_date,
    }).eq("id", invoiceId);

    // Log payment in invoice_payments if table exists
    await supabase.from("invoice_payments").insert({
      order_invoice_id: invoiceId,
      admin_id: integration.admin_id,
      amount: paymentValue,
      currency: invoice.currency || "EUR",
      payment_method: paymentData?.payment_method || "bank_transfer",
      payment_date: paymentDate,
      reference: responseData.number || "",
      notes: paymentData?.notes || "",
      synced_to_accounting: true,
      accounting_sync_id: responseData.number?.toString(),
    }).then(() => {}).catch(() => {}); // Silently fail if table doesn't exist

    // Log activity
    await supabase.from("order_activity_log").insert({
      order_id: orderId || invoice.order_id,
      action: "payment_recorded_smartbill",
      details: { 
        invoice_id: invoiceId,
        invoice_number: `${invoiceSeries}${invoiceNumber}`,
        amount: paymentValue,
        payment_type: paymentData?.payment_method,
      },
      performed_by_type: "admin",
      performed_by_id: integration.admin_id,
    });

    return NextResponse.json({
      success: true,
      paymentNumber: responseData.number,
      smartbillData: responseData,
      newStatus,
      amountPaid: newPaidAmount,
    });
  } catch (err: any) {
    console.error("Smartbill payment error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
