import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SMARTBILL_API_URL = "https://ws.smartbill.ro/SBORO/api";

export async function POST(req: NextRequest) {
  try {
    const { integrationId } = await req.json();

    const supabase = await createClient();

    // Get integration credentials
    const { data: integration, error } = await supabase
      .from("billing_integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (error || !integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 });
    }

    const { smartbill_email, smartbill_token, smartbill_cif } = integration;

    if (!smartbill_email || !smartbill_token || !smartbill_cif) {
      return NextResponse.json({ success: false, error: "Missing Smartbill credentials" }, { status: 400 });
    }

    // Create Basic Auth header
    const authHeader = Buffer.from(`${smartbill_email}:${smartbill_token}`).toString("base64");

    // Fetch invoice series
    const response = await fetch(`${SMARTBILL_API_URL}/series?cif=${smartbill_cif}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Smartbill API error:", errorText);
      return NextResponse.json({ 
        success: false, 
        error: `API Error: ${response.status} - ${errorText}` 
      });
    }

    const data = await response.json();

    // Return the series list
    return NextResponse.json({
      success: true,
      series: data.list || data.series || data,
    });
  } catch (err: any) {
    console.error("Smartbill series error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
