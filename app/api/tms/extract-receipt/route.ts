import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/tms/geocode";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "trip-receipts";

function getSupabase() { return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Receipt extraction schema. Mirrors the order-extraction approach but tuned for
 * fuel slips, toll tickets, ferry vouchers, parking, AdBlue, repair invoices, etc.
 */
const ReceiptSchema = z.object({
  category: z
    .enum([
      "fuel",
      "toll",
      "parking",
      "ferry",
      "ad_blue",
      "wash",
      "repair",
      "driver_per_diem",
      "customs",
      "insurance",
      "penalty",
      "other",
    ])
    .describe(
      "Best-fit expense category. Use 'fuel' only for diesel/petrol fuel; 'ad_blue' for AdBlue/DEF/urea; 'toll' for highway/road tolls and vignettes; 'ferry' for ferry crossings; 'parking' for parking lots and truck stops without fuel; 'wash' for vehicle washing; 'repair' for tyre/mechanic invoices; 'penalty' for fines; 'customs' for border/customs fees."
    ),
  amount: z
    .number()
    .nullable()
    .describe(
      "Total amount paid (gross, including VAT/tax). Use the largest 'TOTAL' / 'GRAND TOTAL' / 'TOTAAL' / 'GESAMTBETRAG' line."
    ),
  currency: z
    .string()
    .nullable()
    .describe(
      "ISO 4217 code: EUR, USD, GBP, RON, HUF, PLN, CHF, CZK, etc. Infer from symbol or country if not stated."
    ),
  vendor: z
    .string()
    .nullable()
    .describe(
      "Vendor / station / company name (e.g. 'Shell', 'OMV', 'ASFINAG', 'Aral', 'MyRO'). Use the brand, not the franchisee."
    ),
  occurred_at: z
    .string()
    .nullable()
    .describe("ISO 8601 timestamp of when the expense occurred (date + time if visible)."),
  country: z
    .string()
    .nullable()
    .describe("ISO 3166-1 alpha-2 country code (DE, AT, HU, RO, BE, NL, FR, IT, etc.)"),
  city: z.string().nullable().describe("City or town printed on the receipt"),
  address: z.string().nullable().describe("Street address printed on the receipt"),
  latitude: z
    .number()
    .nullable()
    .describe("GPS latitude in decimal degrees if printed on the receipt; null otherwise"),
  longitude: z
    .number()
    .nullable()
    .describe("GPS longitude in decimal degrees if printed on the receipt; null otherwise"),
  quantity: z
    .number()
    .nullable()
    .describe(
      "Quantity dispensed if applicable (liters of diesel for 'fuel'; liters of AdBlue for 'ad_blue'; null otherwise)"
    ),
  unit: z
    .string()
    .nullable()
    .describe("Unit for quantity, e.g. 'L' for liters, 'kg', 'h'."),
  unit_price: z
    .number()
    .nullable()
    .describe("Price per unit (e.g. EUR/liter for fuel)"),
  vat_amount: z.number().nullable().describe("VAT/tax portion of the total if itemized"),
  vat_number: z.string().nullable().describe("VAT/tax id of the vendor if printed"),
  receipt_number: z.string().nullable().describe("Receipt or invoice number"),
  description: z
    .string()
    .nullable()
    .describe(
      "Short human-readable summary, e.g. 'Diesel 412.5 L @ 1.659 EUR/L', 'A1 Vienna -> Salzburg toll', 'AdBlue 25 L'."
    ),
  confidence: z.number().describe("Overall confidence score 0-100"),
  warnings: z
    .array(z.string())
    .describe("Flags about ambiguous fields (e.g. 'amount ambiguous', 'date unreadable')"),
});

export type ReceiptExtraction = z.infer<typeof ReceiptSchema>;

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 26214400, // 25 MB
    });
  }
}

async function uploadFile(file: File, tripId: string): Promise<string> {
  await ensureBucket();
  const ext = file.name.split(".").pop() || "bin";
  const filePath = `${tripId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

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

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const t0 = Date.now();
  console.log("[v0] extract-receipt: request received");
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const tripId = (formData.get("tripId") as string) || "unassigned";

    if (!file) {
      console.log("[v0] extract-receipt: missing file in formData");
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    console.log(
      "[v0] extract-receipt: file received",
      JSON.stringify({
        tripId,
        name: file.name,
        type: file.type,
        size: file.size,
      })
    );

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.log("[v0] extract-receipt: missing Supabase env vars", {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SERVICE_ROLE_KEY,
      });
      return NextResponse.json(
        { error: "Server misconfiguration: Supabase env vars missing" },
        { status: 500 }
      );
    }

    // Upload to Supabase Storage so the receipt persists & the model can fetch it via URL
    console.log("[v0] extract-receipt: uploading to bucket", BUCKET);
    const receiptUrl = await uploadFile(file, tripId);
    console.log("[v0] extract-receipt: upload OK", receiptUrl);

    const isPdf = file.type === "application/pdf";

    // Encode the file as raw base64 (NOT a data: URL). The AI SDK accepts a raw base64
    // string in the `data` field for "file" content parts and handles transport itself.
    // This mirrors the working /api/tms/extract-order pattern.
    const fileBytes = await file.arrayBuffer();
    const base64 = Buffer.from(fileBytes).toString("base64");
    const mimeType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
    console.log("[v0] extract-receipt: invoking AI model openai/gpt-5-mini", {
      isPdf,
      mimeType,
      base64Length: base64.length,
    });

    const result = await generateText({
      model: "openai/gpt-5-mini",
      experimental_output: Output.object({ schema: ReceiptSchema }),
      messages: [
        {
          role: "system",
          content:
            "You are a meticulous European trucking-fleet expense reader. Read the attached receipt (fuel slip, toll ticket, ferry voucher, parking, AdBlue, repair invoice, etc.) and extract every visible field with maximum accuracy. Output strictly the JSON schema. If a field is not visible, use null. Never invent values. Round liters/amounts to 2 decimals. For ambiguous total vs subtotal vs VAT, prefer the gross 'total to pay' figure.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract structured data from this ${isPdf ? "PDF" : "image"} receipt. The vehicle was on a delivery trip across the EU; treat the document as a transport-related expense.`,
            },
            {
              type: "file",
              data: base64,
              mediaType: mimeType,
              filename: file.name,
            },
          ],
        },
      ],
    });

    // AI SDK v6: when using experimental_output: Output.object({ schema }),
    // the parsed object is exposed on `result.output` (not result.experimental_output).
    const extracted = (result as any).output as ReceiptExtraction;
    console.log(
      "[v0] extract-receipt: AI extraction OK in",
      Date.now() - t0,
      "ms",
      JSON.stringify({
        category: extracted?.category,
        amount: extracted?.amount,
        currency: extracted?.currency,
        vendor: extracted?.vendor,
        confidence: extracted?.confidence,
        hasGeo: extracted?.latitude != null && extracted?.longitude != null,
      })
    );

    /* Geocoding fallback ────────────────────────────────────────────────
     * Vision models read addresses well but rarely produce lat/lng. If we
     * have a usable address (street/city/vendor) but no coords, try a free
     * Nominatim forward-geocode so the receipt can land on the map. We
     * never fail the request if geocoding fails; the row will still save
     * without coords and can be edited manually. */
    if (extracted && (extracted.latitude == null || extracted.longitude == null)) {
      const queryParts = [extracted.address, extracted.city, extracted.country, extracted.vendor]
        .filter(Boolean)
        .join(", ");
      if (queryParts) {
        console.log("[v0] extract-receipt: forward-geocoding", queryParts);
        const geo = await geocodeAddress(queryParts, extracted.country ?? undefined);
        if (geo) {
          extracted.latitude = geo.latitude;
          extracted.longitude = geo.longitude;
          console.log("[v0] extract-receipt: geocode OK", {
            lat: geo.latitude,
            lng: geo.longitude,
          });
        } else {
          console.log("[v0] extract-receipt: geocode returned no match");
        }
      }
    }

    return NextResponse.json({
      ok: true,
      receipt_url: receiptUrl,
      extraction: extracted,
    });
  } catch (err: any) {
    console.log(
      "[v0] extract-receipt: FAILED after",
      Date.now() - t0,
      "ms",
      err?.message ?? err,
      err?.stack
    );
    return NextResponse.json(
      { error: err?.message || "Extraction failed" },
      { status: 500 }
    );
  }
}
