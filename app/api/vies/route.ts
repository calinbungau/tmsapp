import { NextRequest, NextResponse } from "next/server";

// EU Country codes supported by VIES
const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", 
  "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", 
  "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI" // XI = Northern Ireland
];

interface VIESResponse {
  valid: boolean; // VIES API uses "valid" not "isValid"
  requestDate: string;
  userError?: string;
  name?: string;
  address?: string;
  requestIdentifier?: string;
  vatNumber?: string;
  countryCode?: string;
  // Trader fields (used by some countries like Germany that return "---" for privacy)
  traderName?: string;
  traderStreet?: string;
  traderPostalCode?: string;
  traderCity?: string;
  traderCompanyType?: string;
  viesApproximate?: {
    name?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    companyType?: string;
    matchName?: number;
    matchStreet?: number;
    matchPostalCode?: number;
    matchCity?: number;
    matchCompanyType?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { vatNumber } = await request.json();

    if (!vatNumber) {
      return NextResponse.json({ success: false, error: "VAT number is required" }, { status: 400 });
    }

    // Clean and normalize VAT number
    const cleanVat = vatNumber.replace(/[\s.-]/g, "").toUpperCase();
    
    // Extract country code (first 2 characters)
    const countryCode = cleanVat.substring(0, 2);
    const vatNum = cleanVat.substring(2);

    // Validate country code
    if (!EU_COUNTRY_CODES.includes(countryCode)) {
      return NextResponse.json({ 
        success: false, 
        error: `Country code "${countryCode}" is not an EU member state. VIES only supports EU VAT numbers.` 
      }, { status: 400 });
    }

    // For Romania, suggest using ANAF instead (more detailed data)
    if (countryCode === "RO") {
      return NextResponse.json({ 
        success: false, 
        error: "For Romanian companies, use ANAF lookup instead (more detailed data available).",
        useAnaf: true
      }, { status: 400 });
    }

    // Call VIES REST API with retry logic for rate limiting
    // Documentation: https://ec.europa.eu/taxation_customs/vies/#/vat-validation
    console.log("[VIES] Checking VAT:", countryCode, vatNum);
    
    const MAX_RETRIES = 3;
    const RETRY_ERRORS = ["MS_MAX_CONCURRENT_REQ", "MS_UNAVAILABLE", "TIMEOUT", "SERVICE_UNAVAILABLE"];
    
    let viesData: VIESResponse | null = null;
    let lastError = "";
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const viesResponse = await fetch(
          "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              countryCode,
              vatNumber: vatNum,
            }),
          }
        );

        const responseText = await viesResponse.text();
        console.log(`[VIES] Attempt ${attempt} - Status:`, viesResponse.status, "Body:", responseText.substring(0, 300));

        // Parse response
        let parsed: VIESResponse;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          console.error("VIES JSON parse error:", responseText);
          lastError = "Invalid response from VIES service";
          continue;
        }

        // Check for retryable errors in actionSucceed=false responses
        if ("actionSucceed" in parsed && !(parsed as unknown as { actionSucceed: boolean }).actionSucceed) {
          const errorInfo = parsed as unknown as { errorWrappers?: Array<{ error?: string; message?: string }> };
          const errorCode = errorInfo.errorWrappers?.[0]?.error || "";
          const errorMsg = errorInfo.errorWrappers?.[0]?.message || errorCode || "Unknown error";
          
          if (RETRY_ERRORS.some(e => errorCode.includes(e) || errorMsg.includes(e))) {
            console.log(`[VIES] Retryable error (${errorCode}), waiting before retry...`);
            lastError = errorMsg;
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
            continue;
          }
          
          // Non-retryable error
          console.error("VIES API error:", errorMsg);
          return NextResponse.json({ 
            success: false, 
            error: `VIES error: ${errorMsg}` 
          }, { status: 400 });
        }

        // Success - we have valid data
        viesData = parsed;
        break;
      } catch (fetchError) {
        console.error(`[VIES] Fetch error on attempt ${attempt}:`, fetchError);
        lastError = "Network error connecting to VIES";
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }

    if (!viesData) {
      return NextResponse.json({ 
        success: false, 
        error: `VIES service temporarily unavailable: ${lastError}. Please try again in a few seconds.` 
      }, { status: 503 });
    }

    if (viesData.userError) {
      return NextResponse.json({ 
        success: false, 
        error: `VIES error: ${viesData.userError}` 
      }, { status: 400 });
    }

    if (!viesData.valid) {
      return NextResponse.json({ 
        success: false, 
        error: "VAT number is not valid or not registered in VIES",
        isValid: false
      }, { status: 200 });
    }

    // Parse address - handle both name/address fields and trader* fields
    // Some countries (like Germany) return "---" for privacy reasons
    const cleanValue = (val?: string) => (val && val !== "---" ? val : "");
    
    let parsedAddress = {
      street: cleanValue(viesData.traderStreet) || "",
      city: cleanValue(viesData.traderCity) || "",
      postalCode: cleanValue(viesData.traderPostalCode) || "",
      country: getCountryName(countryCode),
    };

    // Try to parse from address field if trader fields are empty
    const addressStr = cleanValue(viesData.address);
    if (addressStr && !parsedAddress.street) {
      const addressLines = addressStr.split("\n").map(l => l.trim()).filter(Boolean);
      if (addressLines.length >= 2) {
        parsedAddress.street = addressLines[0];
        const lastLine = addressLines[addressLines.length - 1];
        const postalMatch = lastLine.match(/^(\d{4,6})\s+(.+)$/);
        if (postalMatch) {
          parsedAddress.postalCode = postalMatch[1];
          parsedAddress.city = postalMatch[2];
        } else {
          parsedAddress.city = lastLine;
        }
      } else if (addressLines.length === 1) {
        parsedAddress.street = addressLines[0];
      }
    }

    // Use approximate data if available (more structured)
    if (viesData.viesApproximate) {
      const approx = viesData.viesApproximate;
      if (approx.street) parsedAddress.street = approx.street;
      if (approx.city) parsedAddress.city = approx.city;
      if (approx.postalCode) parsedAddress.postalCode = approx.postalCode;
    }

    // Get company name - try different fields
    const companyName = cleanValue(viesData.traderName) || cleanValue(viesData.name) || "";
    
    // Note: Some countries (DE, etc.) don't share company details for privacy
    // In this case, we still return success with valid=true but empty name/address
    const privacyCountries = ["DE", "ES", "IT"]; // Countries that often hide details
    const hasLimitedData = !companyName && privacyCountries.includes(countryCode);

    return NextResponse.json({
      success: true,
      data: {
        vatNumber: `${countryCode}${vatNum}`,
        name: companyName,
        address: cleanValue(viesData.address) || "",
        street: parsedAddress.street,
        city: parsedAddress.city,
        postalCode: parsedAddress.postalCode,
        country: parsedAddress.country,
        countryCode,
        isValid: true,
        requestDate: viesData.requestDate,
        requestId: viesData.requestIdentifier,
        // Flag to indicate limited data due to privacy
        limitedData: hasLimitedData,
        limitedDataReason: hasLimitedData ? `${parsedAddress.country} does not share company details through VIES for privacy reasons` : undefined,
      },
    });
  } catch (error) {
    console.error("VIES lookup error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to validate VAT number" 
    }, { status: 500 });
  }
}

function getCountryName(code: string): string {
  const countries: Record<string, string> = {
    AT: "Austria", BE: "Belgium", BG: "Bulgaria", CY: "Cyprus",
    CZ: "Czech Republic", DE: "Germany", DK: "Denmark", EE: "Estonia",
    EL: "Greece", ES: "Spain", FI: "Finland", FR: "France",
    HR: "Croatia", HU: "Hungary", IE: "Ireland", IT: "Italy",
    LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", MT: "Malta",
    NL: "Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania",
    SE: "Sweden", SI: "Slovenia", SK: "Slovakia", XI: "Northern Ireland",
  };
  return countries[code] || code;
}
