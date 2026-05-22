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

    // Test connection by fetching invoice series
    const response = await fetch(`${SMARTBILL_API_URL}/series?cif=${smartbill_cif}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${authHeader}`,
      },
    });

    const responseText = await response.text();
    
    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // If not JSON, it's likely an HTML error page
      if (response.status === 401) {
        return NextResponse.json({ 
          success: false, 
          error: "Invalid credentials. Please check your API username and token." 
        });
      }
      return NextResponse.json({ 
        success: false, 
        error: `API Error: ${response.status}` 
      });
    }

    // Check for Smartbill error response
    if (data.errorText) {
      return NextResponse.json({ 
        success: false, 
        error: data.errorText 
      });
    }

    // Success - return series count as confirmation
    const seriesCount = Array.isArray(data.list) ? data.list.length : 0;

    return NextResponse.json({
      success: true,
      message: `Connected successfully. Found ${seriesCount} invoice series.`,
      seriesCount,
    });
  } catch (err: any) {
    console.error("Smartbill test error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
