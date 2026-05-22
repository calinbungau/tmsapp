import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "order-documents";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Cargo item schema for multiple shipments within one order
const CargoItemSchema = z.object({
  reference: z.string().nullable().describe("Reference number for this cargo item (e.g. 'Comanda vanzari: 46162/1', 'Order: 12345')"),
  customer_reference: z.string().nullable().describe("Customer's reference for this item (e.g. 'Klantreferentie: FLS-46125/55363-')"),
  description: z.string().nullable().describe("Description of goods (e.g. 'KONIFERE 9CM', 'PASSIONSBLUME')"),
  colli: z.number().nullable().describe("Number of packages/colli"),
  weight_kg: z.number().nullable().describe("Weight in kg for this item"),
  loading_meters: z.number().nullable().describe("LDM (loading meters) for this item"),
  pallet_count: z.number().nullable().describe("Number of pallets for this item"),
  temperature: z.number().nullable().describe("Required temperature in Celsius (e.g. +16)"),
  notes: z.string().nullable().describe("Notes specific to this cargo item"),
});

// Zod schema for extracted order data
const OrderExtractionSchema = z.object({
  customer_name: z.string().nullable().describe("The company that ISSUED/CREATED this transport document - the party ordering and paying for the transport (e.g. the shipper, freight forwarder, or logistics company whose logo/header appears on the document)"),
  customer_vat: z.string().nullable().describe("VAT number / Tax ID / CUI of the customer company (e.g. RO12345678, NL123456789B01, DE123456789). Look for labels like 'VAT:', 'BTW:', 'TVA:', 'CUI:', 'CIF:', 'Tax ID:', 'Steuernummer:', 'Ust-IdNr:' near the customer company info"),
  carrier_name: z.string().nullable().describe("The transport/trucking company the order is addressed TO - the party that will execute the transport (e.g. found after 'Laadopdracht voor:', 'Transportauftrag fur:', 'Transport order for:', 'Subcontractor:', or 'T.a.v.:')"),
  trip_number: z.string().nullable().describe("Trip/journey/route number (e.g. 'Cursa: 40116' -> extract '40116')"),
  customer_reference: z.string().nullable().describe("The MAIN order/transport reference number - typically 'Cursa:', 'Trip:', 'Transportopdracht:', 'Order:'. For 'Cursa: 40116' -> customer_reference = '40116'. This is NOT the individual shipment references."),
  all_references: z.array(z.string()).nullable().describe("Individual SHIPMENT references within the transport (e.g. 'Comanda vanzari' numbers: ['46162/1', '46162/2']). These are sub-references, not the main customer reference."),
  cargo_description: z.string().nullable().describe("Summary description of all goods being transported"),
  goods_type: z.string().nullable().describe("Type of goods (e.g. electronics, food, plants, chemicals)"),
  weight_kg: z.number().nullable().describe("TOTAL weight in kilograms (sum of all items)"),
  volume_m3: z.number().nullable().describe("Total volume in cubic meters"),
  pallet_count: z.number().nullable().describe("TOTAL number of pallets/colli (sum of all items)"),
  loading_meters: z.number().nullable().describe("TOTAL loading meters required (sum of all items)"),
  stackable: z.boolean().nullable().describe("Whether cargo is stackable"),
  adr_class: z.string().nullable().describe("ADR dangerous goods class if applicable"),
  temperature_min: z.number().nullable().describe("Minimum temperature requirement in Celsius"),
  temperature_max: z.number().nullable().describe("Maximum temperature requirement in Celsius"),
  special_instructions: z.string().nullable().describe("Any special instructions or notes (e.g. door codes, access instructions)"),
  customer_price: z.number().nullable().describe("Price charged to the customer"),
  customer_currency: z.string().nullable().describe("Currency code (EUR, RON, USD, etc.)"),
  payment_terms_days: z.number().nullable().describe("Payment terms in days"),
  cargo_items: z.array(CargoItemSchema).nullable().describe("Individual cargo items/shipments when document contains multiple references (e.g. multiple 'Comanda vanzari' entries). Each item represents a separate shipment within the same transport"),
  stops: z.array(z.object({
    type: z.enum(["pickup", "delivery", "customs", "transit"]).describe("Stop type"),
    company_name: z.string().nullable().describe("Company/warehouse name at this stop"),
    address: z.string().nullable().describe("Full address"),
    city: z.string().nullable().describe("City"),
    country: z.string().nullable().describe("Country"),
    postal_code: z.string().nullable().describe("Postal/ZIP code"),
    planned_date: z.string().nullable().describe("Planned date in YYYY-MM-DD format"),
    planned_time_from: z.string().nullable().describe("Earliest time in HH:MM format"),
    planned_time_to: z.string().nullable().describe("Latest time in HH:MM format"),
    contact_name: z.string().nullable().describe("Contact person name"),
    contact_phone: z.string().nullable().describe("Contact phone number"),
    reference_number: z.string().nullable().describe("Main reference number for this stop. If multiple items go to same stop, use primary reference"),
    all_references: z.array(z.string()).nullable().describe("ALL reference numbers for items at this stop"),
    notes: z.string().nullable().describe("Notes for this stop (e.g. door codes, time windows)"),
  })).describe("Pickup and delivery stops. Note: multiple cargo items may share the same stops"),
  seal_number: z.string().nullable().describe("Seal number if mentioned (e.g. 'Sealnr.')"),
  crossing_info: z.string().nullable().describe("Border crossing or ferry information"),
  confidence: z.number().describe("Overall confidence score 0-100 of extraction accuracy"),
  warnings: z.array(z.string()).describe("Any warnings about unclear or missing information"),
});

export type OrderExtraction = z.infer<typeof OrderExtractionSchema>;

// Ensure the storage bucket exists
async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 52428800 });
  }
}

// Upload file to Supabase Storage
async function uploadFile(file: File, adminId: string): Promise<string> {
  await ensureBucket();
  const ext = file.name.split(".").pop() || "bin";
  const filePath = `${adminId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "3600",
        "x-upsert": "false",
      },
      body: arrayBuffer,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${await uploadRes.text()}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
}

// Check monthly AI usage limit
async function checkMonthlyLimit(adminId: string): Promise<{ allowed: boolean; used: number; limit: number | null; warningPct: number }> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Get monthly usage
  const { data: logs } = await supabase
    .from("ai_extraction_logs")
    .select("estimated_cost_usd")
    .eq("admin_id", adminId)
    .gte("created_at", monthStart)
    .lte("created_at", monthEnd);

  const used = (logs || []).reduce((sum: number, l: any) => sum + (l.estimated_cost_usd || 0), 0);

  // Get limit from company_profiles (may not exist yet)
  const { data: profile } = await supabase
    .from("company_profiles")
    .select("ai_monthly_limit_usd, ai_monthly_warning_pct")
    .eq("admin_id", adminId)
    .maybeSingle();

  const limit = profile?.ai_monthly_limit_usd || null;
  const warningPct = profile?.ai_monthly_warning_pct || 80;

  if (limit && used >= limit) {
    return { allowed: false, used, limit, warningPct };
  }

  return { allowed: true, used, limit, warningPct };
}

// Calculate cost based on model and tokens
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    "openai/gpt-4.1-mini": { input: 0.0000004, output: 0.0000016 },
    "openai/gpt-4.1": { input: 0.000002, output: 0.000008 },
    "openai/gpt-4o-mini": { input: 0.00000015, output: 0.0000006 },
    "openai/gpt-4o": { input: 0.0000025, output: 0.00001 },
  };
  const rate = rates[model] || rates["openai/gpt-4.1-mini"];
  return (inputTokens * rate.input) + (outputTokens * rate.output);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const adminId = formData.get("admin_id") as string;
    const instructionId = formData.get("instruction_id") as string | null;

    if (!file || !adminId) {
      return NextResponse.json({ error: "File and admin_id are required" }, { status: 400 });
    }

    // Load custom instruction if provided
    let customInstructions = "";
    if (instructionId) {
      const { data: instruction } = await supabase
        .from("ai_extraction_instructions")
        .select("instructions, name")
        .eq("id", instructionId)
        .eq("is_active", true)
        .single();
      
      if (instruction?.instructions) {
        customInstructions = instruction.instructions;
      }
    }

    // 1. Check monthly limit
    const limitCheck = await checkMonthlyLimit(adminId);
    if (!limitCheck.allowed) {
      return NextResponse.json({
        error: "Monthly AI extraction limit reached",
        used: limitCheck.used,
        limit: limitCheck.limit,
      }, { status: 429 });
    }

    // 2. Upload file to Supabase Storage
    const fileUrl = await uploadFile(file, adminId);

    // 3. Convert file to base64 for AI processing
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "application/pdf";
    const isPdf = mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // 4. Step 1 - OCR text extraction (free, for classification)
    let ocrText = "";
    let pageCount = 1;

    if (isPdf) {
      // For PDFs, we try to extract text using a simple approach
      // We send the first request to classify which pages are relevant
      try {
        const textContent = Buffer.from(arrayBuffer).toString("utf-8");
        // Basic PDF text extraction - look for text streams
        const textMatches = textContent.match(/\(([^)]+)\)/g);
        if (textMatches) {
          ocrText = textMatches.map(m => m.slice(1, -1)).join(" ").substring(0, 5000);
        }
        // Count pages
        const pageMatches = textContent.match(/\/Type\s*\/Page[^s]/g);
        pageCount = pageMatches ? pageMatches.length : 1;
      } catch {
        // OCR extraction failed, will send full image to AI
      }
    }

    // 5. Step 2 - Page classification (text-only, cheap)
    let classificationInputTokens = 0;
    let classificationOutputTokens = 0;
    let relevantPages: number[] = [];

    if (ocrText.length > 100 && pageCount > 1) {
      const classResult = await generateText({
        model: "openai/gpt-4.1-mini",
        prompt: `You are analyzing a transport/logistics document with ${pageCount} pages. 
Here is the extracted text content:
---
${ocrText.substring(0, 4000)}
---

Which pages contain the actual transport order information (addresses, cargo details, dates, prices)?
Return ONLY a JSON array of page numbers (1-indexed), e.g. [1, 2].
Skip cover letters, terms & conditions, general information pages.
If unsure, include the page.`,
      });

      classificationInputTokens = classResult.usage?.inputTokens || 0;
      classificationOutputTokens = classResult.usage?.outputTokens || 0;

      try {
        const parsed = JSON.parse(classResult.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
        if (Array.isArray(parsed)) {
          relevantPages = parsed;
        }
      } catch {
        // If classification fails, process all pages
        relevantPages = Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1);
      }
    } else {
      relevantPages = Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1);
    }

    // 6. Step 3 - Vision extraction (image-based, main extraction)
    const MODEL = "openai/gpt-4.1-mini";

    const extractionResult = await generateText({
      model: MODEL,
      output: Output.object({ schema: OrderExtractionSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert transport logistics document parser. Extract ALL transport order information from this document.

IMPORTANT RULES:
- Extract every field you can find. Set null for fields not present in the document.

CUSTOMER vs CARRIER distinction (CRITICAL):
- customer_name = The company that ISSUED/CREATED this document. This is the party ordering the transport. Usually their logo/letterhead appears at the top. They are the shipper or freight forwarder.
- customer_vat = Extract the VAT/Tax ID of the customer company. Look for labels like VAT, BTW, TVA, CUI, CIF, Tax ID, Steuernummer, Ust-IdNr, USt, MwSt near the customer header/letterhead. Format: include country prefix (e.g. NL123456789B01, RO12345678, DE123456789).
- carrier_name = The transport company the order is addressed TO. Look for "Laadopdracht voor:", "T.a.v.:", "Subcontractor:", "Transportauftrag fur:". This is the trucking company that will execute the transport.
- Example: If "H.Z. Logistics" logo is at the top and it says "Subcontractor: Vimarek Logistic Srl", then customer_name = "H.Z. Logistics RO SrL" and carrier_name = "Vimarek Logistic Srl".

CUSTOMER REFERENCE vs SHIPMENT REFERENCES (CRITICAL):
- customer_reference = The MAIN order/trip number that identifies this transport job. Look for:
  - "Cursa: 40116" -> customer_reference = "40116"
  - "Transportopdracht:", "Auftragsnummer:", "Order number:", "Trip:"
  - This is typically a single number that identifies the entire transport
- all_references = Individual shipment/item references WITHIN the transport (NOT the main reference)
  - "Comanda vanzari: 46162/1, 46162/2..." -> these go in all_references array
  - These are sub-order references, not the main customer reference

MULTIPLE CARGO ITEMS (CRITICAL for Laadlijst/Loslijst documents):
- Documents like "Laadlijst/Loslijst" contain MULTIPLE shipments within ONE transport
- Look for repeated patterns like:
  - "Comanda vanzari: 46162/1", "Comanda vanzari: 46162/2", etc.
  - Each has its own goods, colli, LDM, weight, temperature
- When you find multiple shipments:
  1. Extract EACH as a separate cargo_item with its reference, description, colli, weight, LDM, temperature
  2. Put the shipment references in all_references array (e.g. ["46162/1", "46162/2"])
  3. SUM UP the totals: weight_kg = sum of all weights, loading_meters = sum of all LDM, pallet_count = sum of all colli
  4. cargo_description should list all goods types
- trip_number = Same as customer_reference for "Cursa:" type documents

STOPS (Pickup and Delivery locations):
- CRITICAL STOP TYPE RULES (in order of priority):
  1. EXPLICIT LABELS - Use document labels:
     - PICKUP/LOADING: "Loading", "Laden", "Laadadres", "Incarcare", "Beladung", "Pick-up"
     - DELIVERY/UNLOADING: "Unloading", "Lossen", "Losadres", "Descarcare", "Entladung", "Delivery"
  2. DATE ORDER - Earlier date = pickup, Later date = delivery
  3. In Dutch: "Incarcare" = loading/pickup, "Descarcare" = unloading/delivery
- If multiple cargo items share the same stops, create only ONE pickup and ONE delivery stop
- Put ALL references for that stop in the stop's all_references array
- Extract time windows (e.g. "13:00 - 23:59" becomes planned_time_from: "13:00", planned_time_to: "23:59")

SPECIAL FIELDS:
- seal_number = Look for "Sealnr.", "Seal number", "Sigiliu"
- crossing_info = Border crossing or ferry details
- special_instructions = Door codes, access instructions, temperature notes
- temperature_min/temperature_max = Extract from "Temp: +16°C" (both min and max would be 16)

FORMAT RULES:
- Dates: YYYY-MM-DD format
- Times: HH:MM format (24-hour)
- Prices: numbers only, no currency symbols
- Currency: 3-letter code (EUR, RON, USD, GBP)
- Country: full name or 2-letter ISO code
- Confidence: 0-100 based on extraction accuracy
- Warnings: list anything unclear or potentially wrong

This is a European transport order, likely Romania/Netherlands/Germany region.

${customInstructions ? `\n\n--- CUSTOM INSTRUCTIONS FROM USER ---\n${customInstructions}\n--- END CUSTOM INSTRUCTIONS ---\n\n` : ""}${ocrText.length > 100 ? `OCR text for additional context:\n${ocrText.substring(0, 2000)}\n\n` : ""}Extract the order details from the document image:`,
            },
            {
              type: "file",
              data: base64,
              mediaType: isPdf ? "application/pdf" : mimeType,
              filename: file.name,
            },
          ],
        },
      ],
    });

    const extractionInputTokens = extractionResult.usage?.inputTokens || 0;
    const extractionOutputTokens = extractionResult.usage?.outputTokens || 0;

    // --- Logging: AI Extraction ---
    console.log("[AI Extract] File:", file.name, "| Size:", (file.size / 1024).toFixed(1), "KB | Type:", mimeType);
    console.log("[AI Extract] Pages:", pageCount, "| Relevant:", relevantPages, "| OCR length:", ocrText.length);
    console.log("[AI Extract] Model:", MODEL);
    console.log("[AI Extract] Classification tokens:", classificationInputTokens, "in /", classificationOutputTokens, "out");
    console.log("[AI Extract] Extraction tokens:", extractionInputTokens, "in /", extractionOutputTokens, "out");
    console.log("[AI Extract] Result:", JSON.stringify(extractionResult.output, null, 2));

    // 7. Calculate totals
    const totalInputTokens = classificationInputTokens + extractionInputTokens;
    const totalOutputTokens = classificationOutputTokens + extractionOutputTokens;
    const estimatedCost = calculateCost(MODEL, totalInputTokens, totalOutputTokens);
    const processingTime = Date.now() - startTime;

    const extracted = extractionResult.output;

    // 8. Log to ai_extraction_logs
    // Note: total_input_tokens, total_output_tokens, total_tokens are GENERATED columns
    await supabase.from("ai_extraction_logs").insert({
      admin_id: adminId,
      document_name: file.name,
      document_type: isPdf ? "pdf" : mimeType.split("/").pop() || "image",
      page_count: pageCount,
      relevant_pages: relevantPages,
      classification_input_tokens: classificationInputTokens,
      classification_output_tokens: classificationOutputTokens,
      classification_model: classificationInputTokens > 0 ? MODEL : null,
      extraction_input_tokens: extractionInputTokens,
      extraction_output_tokens: extractionOutputTokens,
      extraction_model: MODEL,
      estimated_cost_usd: estimatedCost,
      processing_time_ms: processingTime,
      extraction_confidence: extracted?.confidence || 0,
      was_corrected: false,
      status: "completed",
      extracted_data: extracted,
    });

    // 9. Return extraction result
    return NextResponse.json({
      success: true,
      extraction: extracted,
      fileUrl,
      metadata: {
        pageCount,
        relevantPages,
        totalInputTokens,
        totalOutputTokens,
        estimatedCostUsd: estimatedCost,
        processingTimeMs: processingTime,
        model: MODEL,
      },
      monthlyUsage: {
        used: limitCheck.used + estimatedCost,
        limit: limitCheck.limit,
        warningPct: limitCheck.warningPct,
      },
    });

  } catch (err: any) {
    console.error("AI extraction error:", err);
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
