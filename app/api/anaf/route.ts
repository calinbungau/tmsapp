import { NextRequest, NextResponse } from "next/server";

// ANAF Async Web Service for Romanian company data
// Documentation: https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_Async_V8.txt

interface ANAFCompanyData {
  name: string;
  address: string;
  city: string;
  county: string;
  postalCode: string;
  country: string;
  registrationNumber: string;
  phone: string;
  isVatPayer: boolean;
  isActive: boolean;
  iban: string;
}

export async function POST(request: NextRequest) {
  try {
    const { cui } = await request.json();

    if (!cui) {
      return NextResponse.json({ error: "CUI is required" }, { status: 400 });
    }

    // Clean CUI - remove "RO" prefix if present and any spaces
    const cleanCui = cui.toString().replace(/^RO/i, "").replace(/\s/g, "").trim();
    
    if (!/^\d+$/.test(cleanCui)) {
      return NextResponse.json({ error: "Invalid CUI format" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Step 1: Submit request to ANAF async service
    let submitResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      submitResponse = await fetch(
        "https://webservicesp.anaf.ro/AsynchWebService/api/v8/ws/tva",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; TMS/1.0)",
          },
          body: JSON.stringify([
            {
              cui: parseInt(cleanCui, 10),
              data: today,
            },
          ]),
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
    } catch (fetchError: unknown) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
      console.error("[ANAF] Fetch error:", errorMessage);
      return NextResponse.json(
        { error: "Unable to connect to ANAF service. Please try again later." },
        { status: 503 }
      );
    }

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error("[ANAF] Submit error:", errorText);
      return NextResponse.json(
        { error: "Failed to submit request to ANAF" },
        { status: 500 }
      );
    }

    const submitResult = await submitResponse.json();

    if (submitResult.cod !== 200) {
      return NextResponse.json(
        { error: submitResult.message || "ANAF request failed" },
        { status: 400 }
      );
    }

    const correlationId = submitResult.correlationId;

    // Step 2: Wait minimum 2 seconds as per ANAF requirements
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Step 3: Fetch results with retries
    let attempts = 0;
    const maxAttempts = 5;
    let resultData = null;

    while (attempts < maxAttempts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const resultResponse = await fetch(
          `https://webservicesp.anaf.ro/AsynchWebService/api/v8/ws/tva?id=${correlationId}`,
          { 
            method: "GET",
            headers: {
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 (compatible; TMS/1.0)",
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);

        if (resultResponse.ok) {
          const result = await resultResponse.json();
          
          if (result.cod === 200 && result.found && result.found.length > 0) {
            resultData = result.found[0];
            break;
          } else if (result.notFound && result.notFound.length > 0) {
            return NextResponse.json(
              { error: "Company not found in ANAF database" },
              { status: 404 }
            );
          }
        }
      } catch (fetchError) {
        console.error("[ANAF] Result fetch error on attempt", attempts + 1, ":", fetchError);
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (!resultData) {
      return NextResponse.json(
        { error: "Failed to retrieve data from ANAF after multiple attempts" },
        { status: 500 }
      );
    }

    // Parse and format the response
    const general = resultData.date_generale || {};
    const address = resultData.adresa_sediu_social || {};
    const vatInfo = resultData.inregistrare_scop_Tva || {};
    const inactiveInfo = resultData.stare_inactiv || {};

    const companyData: ANAFCompanyData = {
      name: general.denumire || "",
      address: [
        address.sdenumire_Strada,
        address.snumar_Strada,
        address.sdetalii_Adresa,
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      city: address.sdenumire_Localitate || "",
      county: address.sdenumire_Judet || "",
      postalCode: address.scod_Postal || general.codPostal || "",
      country: address.stara || "Romania",
      registrationNumber: general.nrRegCom || "",
      phone: general.telefon || "",
      isVatPayer: vatInfo.scpTVA === true || vatInfo.scpTVA === "true",
      isActive: !(inactiveInfo.statusInactivi === true || inactiveInfo.statusInactivi === "true"),
      iban: general.iban || "",
    };

    return NextResponse.json({ success: true, data: companyData });
  } catch (error) {
    console.error("[ANAF] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
