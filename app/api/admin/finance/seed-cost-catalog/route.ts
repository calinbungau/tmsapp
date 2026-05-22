import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Complete European Freight Cost Taxonomy (192 codes)
// Based on IATA/IRU/FIATA standards adapted for road, maritime, air, and rail freight
const DEFAULT_COST_CODES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // A. DIRECT OPERATIONS (A1-A5)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // A1. Linehaul Costs
  { code: "A1-001", name: "Motorină (Diesel)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-002", name: "AdBlue / DEF", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-003", name: "LNG / CNG", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-004", name: "Încărcare electrică", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-005", name: "HVO / Biodiesel", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-010", name: "Taxă rutieră - DE (Maut)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-011", name: "Taxă rutieră - AT (GO-Maut)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-012", name: "Taxă rutieră - HU (HU-GO)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-013", name: "Taxă rutieră - PL (e-TOLL)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-014", name: "Taxă rutieră - CZ (Myto)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-015", name: "Taxă rutieră - SK", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-016", name: "Taxă rutieră - RO (Rovinieta)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-017", name: "Taxă rutieră - alte țări UE", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-020", name: "Tunel / Pod (taxă trecere)", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-021", name: "Traversare feribot", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  { code: "A1-022", name: "Taxă congestie / LEZ / ZFE", group_code: "A", group_name: "DIRECT OPS", category_code: "A1", category_name: "Linehaul", is_variable: true },
  
  // A2. Accessorial Charges
  { code: "A2-001", name: "Încărcare manuală", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-002", name: "Descărcare manuală", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-003", name: "Încărcare cu stivuitor (FLT)", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-004", name: "Descărcare cu stivuitor (FLT)", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-005", name: "Încărcare cu macara", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-006", name: "Descărcare cu macara", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-007", name: "Hayon hidraulic (tail-lift)", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-010", name: "Staționare (demurrage)", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-011", name: "Așteptare la rampă (detention)", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-012", name: "Layover / overnight", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-015", name: "Re-livrare (re-delivery)", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-016", name: "Retur marfă", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-017", name: "Sortare / segregare", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-020", name: "Paletizare", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-021", name: "Ambalare / reambalare", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-022", name: "Etichetare", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  { code: "A2-023", name: "Fixare / amarare marfă", group_code: "A", group_name: "DIRECT OPS", category_code: "A2", category_name: "Accesoriale", is_variable: true },
  
  // A3. Mode-Specific Costs - Maritime
  { code: "A3-001", name: "Navlu maritim (ocean freight)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-002", name: "THC origine (terminal handling)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-003", name: "THC destinație", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-004", name: "BAF (Bunker Adjustment Factor)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-005", name: "CAF (Currency Adjustment Factor)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-006", name: "LSS (Low Sulphur Surcharge)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-007", name: "ISPS (security fee)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-008", name: "Taxă document BL", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-009", name: "Container cleaning", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-010", name: "Reefer plug-in / monitoring", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  
  // A3. Mode-Specific Costs - Air
  { code: "A3-020", name: "Air freight (per kg)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-021", name: "FSC (Fuel Surcharge - aerian)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-022", name: "SSC (Security Surcharge)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-023", name: "AWB fee", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-024", name: "ULD handling", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-025", name: "Screening fee", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-026", name: "DGR handling (mărfuri periculoase)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  
  // A3. Mode-Specific Costs - Road
  { code: "A3-030", name: "FTL charter (full truck)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-031", name: "LTL groupaj (partial)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-032", name: "Express / dedicat", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-033", name: "ADR surcharge (mărfuri periculoase)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-034", name: "Temperatură controlată", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-035", name: "Oversized / OOG", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-036", name: "Escortă specială", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  
  // A3. Mode-Specific Costs - Rail
  { code: "A3-040", name: "Navlu feroviar", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-041", name: "Terminal rail origine", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-042", name: "Terminal rail destinație", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-043", name: "Wagon hire / demurrage", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  { code: "A3-044", name: "Intermodal lift (road-rail)", group_code: "A", group_name: "DIRECT OPS", category_code: "A3", category_name: "Mode-specific", is_variable: true },
  
  // A4. Customs & Border
  { code: "A4-001", name: "Taxă vămuire export", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-002", name: "Taxă vămuire import", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-003", name: "Taxă tranzit (T1/T2)", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-004", name: "Garanție vamală", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-005", name: "Taxă antrepozit vamal", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-006", name: "Inspecție fitosanitară", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-007", name: "Inspecție veterinară", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-008", name: "Certificat de origine", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-009", name: "EUR.1 / ATR", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  { code: "A4-010", name: "Scanare / X-ray", group_code: "A", group_name: "DIRECT OPS", category_code: "A4", category_name: "Vamă", is_variable: true },
  
  // A5. Cargo Insurance
  { code: "A5-001", name: "Asigurare CMR standard", group_code: "A", group_name: "DIRECT OPS", category_code: "A5", category_name: "Asigurare", is_variable: true },
  { code: "A5-002", name: "Asigurare all-risk", group_code: "A", group_name: "DIRECT OPS", category_code: "A5", category_name: "Asigurare", is_variable: true },
  { code: "A5-003", name: "Asigurare marfă valoroasă", group_code: "A", group_name: "DIRECT OPS", category_code: "A5", category_name: "Asigurare", is_variable: true },
  { code: "A5-004", name: "Asigurare temperatură controlată", group_code: "A", group_name: "DIRECT OPS", category_code: "A5", category_name: "Asigurare", is_variable: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // B. FLEET (B1-B4)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // B1. Vehicle Ownership
  { code: "B1-001", name: "Depreciere camion", group_code: "B", group_name: "FLEET", category_code: "B1", category_name: "Proprietate", is_variable: false },
  { code: "B1-002", name: "Depreciere remorcă", group_code: "B", group_name: "FLEET", category_code: "B1", category_name: "Proprietate", is_variable: false },
  { code: "B1-003", name: "Leasing camion", group_code: "B", group_name: "FLEET", category_code: "B1", category_name: "Proprietate", is_variable: false },
  { code: "B1-004", name: "Leasing remorcă", group_code: "B", group_name: "FLEET", category_code: "B1", category_name: "Proprietate", is_variable: false },
  { code: "B1-005", name: "Dobândă finanțare", group_code: "B", group_name: "FLEET", category_code: "B1", category_name: "Proprietate", is_variable: false },
  { code: "B1-006", name: "Chirie operațională (rental)", group_code: "B", group_name: "FLEET", category_code: "B1", category_name: "Proprietate", is_variable: false },
  
  // B2. Vehicle Operations
  { code: "B2-001", name: "Service programat (ITP)", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-002", name: "Schimb ulei & filtre", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-003", name: "Anvelope (înlocuire)", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-004", name: "Anvelope (reșapare)", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-005", name: "Frâne (întreținere)", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-006", name: "Reparații motor", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-007", name: "Reparații transmisie", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-008", name: "Reparații electrice", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-009", name: "Depanare / tractare", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  { code: "B2-010", name: "Spălătorie / curățenie", group_code: "B", group_name: "FLEET", category_code: "B2", category_name: "Operare", is_variable: true },
  
  // B3. Vehicle Insurance & Compliance
  { code: "B3-001", name: "RCA (asigurare obligatorie)", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  { code: "B3-002", name: "CASCO", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  { code: "B3-003", name: "Asigurare CMR", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  { code: "B3-004", name: "Taxă drum (vignietă anuală)", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  { code: "B3-005", name: "Înmatriculare / reînnoire", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  { code: "B3-006", name: "Inspecție tehnică (ITP)", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  { code: "B3-007", name: "Calibrare tahograf", group_code: "B", group_name: "FLEET", category_code: "B3", category_name: "Asigurare", is_variable: false },
  
  // B4. Container / Trailer Specific
  { code: "B4-001", name: "Container hire", group_code: "B", group_name: "FLEET", category_code: "B4", category_name: "Container/Trailer", is_variable: true },
  { code: "B4-002", name: "Container demurrage", group_code: "B", group_name: "FLEET", category_code: "B4", category_name: "Container/Trailer", is_variable: true },
  { code: "B4-003", name: "Container detention", group_code: "B", group_name: "FLEET", category_code: "B4", category_name: "Container/Trailer", is_variable: true },
  { code: "B4-004", name: "Swap-body hire", group_code: "B", group_name: "FLEET", category_code: "B4", category_name: "Container/Trailer", is_variable: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // C. DRIVERS (C1-C5)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // C1. Driver Salaries
  { code: "C1-001", name: "Salariu bază șofer", group_code: "C", group_name: "DRIVERS", category_code: "C1", category_name: "Salarii", is_variable: false },
  { code: "C1-002", name: "Ore suplimentare", group_code: "C", group_name: "DRIVERS", category_code: "C1", category_name: "Salarii", is_variable: true },
  { code: "C1-003", name: "Bonus performanță", group_code: "C", group_name: "DRIVERS", category_code: "C1", category_name: "Salarii", is_variable: true },
  { code: "C1-004", name: "Concediu plătit", group_code: "C", group_name: "DRIVERS", category_code: "C1", category_name: "Salarii", is_variable: false },
  { code: "C1-005", name: "Concediu medical", group_code: "C", group_name: "DRIVERS", category_code: "C1", category_name: "Salarii", is_variable: false },
  
  // C2. Social Taxes & Benefits
  { code: "C2-001", name: "CAS (contribuție asigurări sociale)", group_code: "C", group_name: "DRIVERS", category_code: "C2", category_name: "Taxe sociale", is_variable: false },
  { code: "C2-002", name: "CASS (contribuție sănătate)", group_code: "C", group_name: "DRIVERS", category_code: "C2", category_name: "Taxe sociale", is_variable: false },
  { code: "C2-003", name: "Contribuție șomaj", group_code: "C", group_name: "DRIVERS", category_code: "C2", category_name: "Taxe sociale", is_variable: false },
  { code: "C2-004", name: "Asigurare accidente muncă", group_code: "C", group_name: "DRIVERS", category_code: "C2", category_name: "Taxe sociale", is_variable: false },
  
  // C3. Driver Allowances
  { code: "C3-001", name: "Diurnă internă", group_code: "C", group_name: "DRIVERS", category_code: "C3", category_name: "Diurne", is_variable: true },
  { code: "C3-002", name: "Diurnă externă", group_code: "C", group_name: "DRIVERS", category_code: "C3", category_name: "Diurne", is_variable: true },
  { code: "C3-003", name: "Indemnizație de noapte", group_code: "C", group_name: "DRIVERS", category_code: "C3", category_name: "Diurne", is_variable: true },
  { code: "C3-004", name: "Indemnizație masă", group_code: "C", group_name: "DRIVERS", category_code: "C3", category_name: "Diurne", is_variable: true },
  
  // C4. Training & Licensing
  { code: "C4-001", name: "Curs CPC (Certificat Profesional)", group_code: "C", group_name: "DRIVERS", category_code: "C4", category_name: "Formare", is_variable: false },
  { code: "C4-002", name: "Curs ADR", group_code: "C", group_name: "DRIVERS", category_code: "C4", category_name: "Formare", is_variable: false },
  { code: "C4-003", name: "Reînnoire permis", group_code: "C", group_name: "DRIVERS", category_code: "C4", category_name: "Formare", is_variable: false },
  { code: "C4-004", name: "Examen medical periodic", group_code: "C", group_name: "DRIVERS", category_code: "C4", category_name: "Formare", is_variable: false },
  
  // C5. Driver Recruitment
  { code: "C5-001", name: "Recrutare (agenție)", group_code: "C", group_name: "DRIVERS", category_code: "C5", category_name: "Recrutare", is_variable: false },
  { code: "C5-002", name: "Anunțuri recrutare", group_code: "C", group_name: "DRIVERS", category_code: "C5", category_name: "Recrutare", is_variable: false },
  { code: "C5-003", name: "Onboarding / induction", group_code: "C", group_name: "DRIVERS", category_code: "C5", category_name: "Recrutare", is_variable: false },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // D. NETWORK (D1-D4)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // D1. Transport Procurement
  { code: "D1-001", name: "Sub-contractare transport (spot)", group_code: "D", group_name: "NETWORK", category_code: "D1", category_name: "Achiziții transport", is_variable: true },
  { code: "D1-002", name: "Contract cadru transportatori", group_code: "D", group_name: "NETWORK", category_code: "D1", category_name: "Achiziții transport", is_variable: true },
  { code: "D1-003", name: "Bursă transport (comision)", group_code: "D", group_name: "NETWORK", category_code: "D1", category_name: "Achiziții transport", is_variable: true },
  
  // D2. Consolidation
  { code: "D2-001", name: "Cross-docking", group_code: "D", group_name: "NETWORK", category_code: "D2", category_name: "Consolidare", is_variable: true },
  { code: "D2-002", name: "Hub handling", group_code: "D", group_name: "NETWORK", category_code: "D2", category_name: "Consolidare", is_variable: true },
  { code: "D2-003", name: "Milk-run collection", group_code: "D", group_name: "NETWORK", category_code: "D2", category_name: "Consolidare", is_variable: true },
  
  // D3. Agent Network
  { code: "D3-001", name: "Comision agent origine", group_code: "D", group_name: "NETWORK", category_code: "D3", category_name: "Rețea agenți", is_variable: true },
  { code: "D3-002", name: "Comision agent destinație", group_code: "D", group_name: "NETWORK", category_code: "D3", category_name: "Rețea agenți", is_variable: true },
  { code: "D3-003", name: "Handling fee (co-loaders)", group_code: "D", group_name: "NETWORK", category_code: "D3", category_name: "Rețea agenți", is_variable: true },
  
  // D4. Procurement Tools
  { code: "D4-001", name: "Abonament bursă transport", group_code: "D", group_name: "NETWORK", category_code: "D4", category_name: "Procurement tools", is_variable: false },
  { code: "D4-002", name: "Platformă e-procurement", group_code: "D", group_name: "NETWORK", category_code: "D4", category_name: "Procurement tools", is_variable: false },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // E. WAREHOUSE (E1-E4)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // E1. Warehouse Operations
  { code: "E1-001", name: "Chirie depozit", group_code: "E", group_name: "WAREHOUSE", category_code: "E1", category_name: "Operare", is_variable: false },
  { code: "E1-002", name: "Depozitare (per palet/zi)", group_code: "E", group_name: "WAREHOUSE", category_code: "E1", category_name: "Operare", is_variable: true },
  { code: "E1-003", name: "Picking / order handling", group_code: "E", group_name: "WAREHOUSE", category_code: "E1", category_name: "Operare", is_variable: true },
  
  // E2. Warehouse Equipment
  { code: "E2-001", name: "Echipamente WMS (soft)", group_code: "E", group_name: "WAREHOUSE", category_code: "E2", category_name: "Echipamente", is_variable: false },
  { code: "E2-002", name: "Stivuitoare (leasing/mentenanță)", group_code: "E", group_name: "WAREHOUSE", category_code: "E2", category_name: "Echipamente", is_variable: false },
  
  // E3. Warehouse Labor
  { code: "E3-001", name: "Personal depozit (salarii)", group_code: "E", group_name: "WAREHOUSE", category_code: "E3", category_name: "Manoperă", is_variable: false },
  { code: "E3-002", name: "Personal temporar / zilieri", group_code: "E", group_name: "WAREHOUSE", category_code: "E3", category_name: "Manoperă", is_variable: true },
  
  // E4. Warehouse Utilities
  { code: "E4-001", name: "Utilități depozit (electricitate)", group_code: "E", group_name: "WAREHOUSE", category_code: "E4", category_name: "Utilități", is_variable: false },
  { code: "E4-002", name: "Încălzire / răcire", group_code: "E", group_name: "WAREHOUSE", category_code: "E4", category_name: "Utilități", is_variable: false },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // F. OVERHEAD (F1-F5)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // F1. Operations Overhead
  { code: "F1-001", name: "Planificare / Dispatch", group_code: "F", group_name: "OVERHEAD", category_code: "F1", category_name: "Ops overhead", is_variable: false },
  { code: "F1-002", name: "Control trafic", group_code: "F", group_name: "OVERHEAD", category_code: "F1", category_name: "Ops overhead", is_variable: false },
  { code: "F1-003", name: "Customer service", group_code: "F", group_name: "OVERHEAD", category_code: "F1", category_name: "Ops overhead", is_variable: false },
  { code: "F1-004", name: "Documentație transport", group_code: "F", group_name: "OVERHEAD", category_code: "F1", category_name: "Ops overhead", is_variable: false },
  
  // F2. Commercial Overhead
  { code: "F2-001", name: "Vânzări (salarii + comision)", group_code: "F", group_name: "OVERHEAD", category_code: "F2", category_name: "Comercial", is_variable: false },
  { code: "F2-002", name: "Marketing / publicitate", group_code: "F", group_name: "OVERHEAD", category_code: "F2", category_name: "Comercial", is_variable: false },
  { code: "F2-003", name: "Reprezentare / evenimente", group_code: "F", group_name: "OVERHEAD", category_code: "F2", category_name: "Comercial", is_variable: false },
  { code: "F2-004", name: "CRM / sales tools", group_code: "F", group_name: "OVERHEAD", category_code: "F2", category_name: "Comercial", is_variable: false },
  
  // F3. Administrative Overhead
  { code: "F3-001", name: "Management (salarii)", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  { code: "F3-002", name: "Contabilitate", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  { code: "F3-003", name: "HR / Resurse umane", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  { code: "F3-004", name: "Chirie birou", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  { code: "F3-005", name: "Utilități birou", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  { code: "F3-006", name: "Consumabile birou", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  { code: "F3-007", name: "Asigurări profesionale", group_code: "F", group_name: "OVERHEAD", category_code: "F3", category_name: "Administrativ", is_variable: false },
  
  // F4. IT & Systems
  { code: "F4-001", name: "TMS (licență software)", group_code: "F", group_name: "OVERHEAD", category_code: "F4", category_name: "IT & Sisteme", is_variable: false },
  { code: "F4-002", name: "ERP / contabilitate", group_code: "F", group_name: "OVERHEAD", category_code: "F4", category_name: "IT & Sisteme", is_variable: false },
  { code: "F4-003", name: "Telematică (abonament per vehicul)", group_code: "F", group_name: "OVERHEAD", category_code: "F4", category_name: "IT & Sisteme", is_variable: false },
  { code: "F4-004", name: "Internet / telefonie", group_code: "F", group_name: "OVERHEAD", category_code: "F4", category_name: "IT & Sisteme", is_variable: false },
  { code: "F4-005", name: "Cloud / hosting", group_code: "F", group_name: "OVERHEAD", category_code: "F4", category_name: "IT & Sisteme", is_variable: false },
  { code: "F4-006", name: "Securitate IT", group_code: "F", group_name: "OVERHEAD", category_code: "F4", category_name: "IT & Sisteme", is_variable: false },
  
  // F5. Compliance & Legal
  { code: "F5-001", name: "Licență transport", group_code: "F", group_name: "OVERHEAD", category_code: "F5", category_name: "Conformitate", is_variable: false },
  { code: "F5-002", name: "Permise CEMT", group_code: "F", group_name: "OVERHEAD", category_code: "F5", category_name: "Conformitate", is_variable: false },
  { code: "F5-003", name: "Certificare ISO / SQAS", group_code: "F", group_name: "OVERHEAD", category_code: "F5", category_name: "Conformitate", is_variable: false },
  { code: "F5-004", name: "Audit extern", group_code: "F", group_name: "OVERHEAD", category_code: "F5", category_name: "Conformitate", is_variable: false },
  { code: "F5-005", name: "Consultanță juridică", group_code: "F", group_name: "OVERHEAD", category_code: "F5", category_name: "Conformitate", is_variable: false },
  { code: "F5-006", name: "Amenzi / penalități", group_code: "F", group_name: "OVERHEAD", category_code: "F5", category_name: "Conformitate", is_variable: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // G. CLAIMS (G1-G4)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // G1. Cargo Claims
  { code: "G1-001", name: "Daune marfă (pierdere)", group_code: "G", group_name: "CLAIMS", category_code: "G1", category_name: "Daune marfă", is_variable: true },
  { code: "G1-002", name: "Daune marfă (avarie)", group_code: "G", group_name: "CLAIMS", category_code: "G1", category_name: "Daune marfă", is_variable: true },
  { code: "G1-003", name: "Daune temperatură (reefer)", group_code: "G", group_name: "CLAIMS", category_code: "G1", category_name: "Daune marfă", is_variable: true },
  
  // G2. SLA Penalties
  { code: "G2-001", name: "Penalitate întârziere livrare", group_code: "G", group_name: "CLAIMS", category_code: "G2", category_name: "Penalități SLA", is_variable: true },
  { code: "G2-002", name: "Penalitate neconformitate", group_code: "G", group_name: "CLAIMS", category_code: "G2", category_name: "Penalități SLA", is_variable: true },
  
  // G3. Theft & Loss
  { code: "G3-001", name: "Furt marfă", group_code: "G", group_name: "CLAIMS", category_code: "G3", category_name: "Furt & Pierderi", is_variable: true },
  { code: "G3-002", name: "Furt echipamente", group_code: "G", group_name: "CLAIMS", category_code: "G3", category_name: "Furt & Pierderi", is_variable: true },
  
  // G4. Disputes
  { code: "G4-001", name: "Dispute comerciale", group_code: "G", group_name: "CLAIMS", category_code: "G4", category_name: "Dispute", is_variable: true },
  { code: "G4-002", name: "Litigii juridice", group_code: "G", group_name: "CLAIMS", category_code: "G4", category_name: "Dispute", is_variable: true },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // H. SUSTAINABILITY (H1-H4)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // H1. Carbon Costs
  { code: "H1-001", name: "Certificate CO₂ (ETS)", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H1", category_name: "Carbon costs", is_variable: true },
  { code: "H1-002", name: "Compensare carbon (offset)", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H1", category_name: "Carbon costs", is_variable: true },
  { code: "H1-003", name: "Carbon tax (unde aplicabil)", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H1", category_name: "Carbon costs", is_variable: true },
  
  // H2. CBAM
  { code: "H2-001", name: "CBAM certificates", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H2", category_name: "CBAM", is_variable: true },
  { code: "H2-002", name: "CBAM reporting cost", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H2", category_name: "CBAM", is_variable: true },
  
  // H3. Sustainability Reporting
  { code: "H3-001", name: "Consultanță ESG / CSRD", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H3", category_name: "Reporting", is_variable: false },
  { code: "H3-002", name: "Audit emisii (Scope 1,2,3)", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H3", category_name: "Reporting", is_variable: false },
  
  // H4. Packaging & Waste
  { code: "H4-001", name: "Taxă ambalaje (EPR)", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H4", category_name: "Taxe ambalaje", is_variable: true },
  { code: "H4-002", name: "Colectare / reciclare ambalaje", group_code: "H", group_name: "SUSTAINABILITY", category_code: "H4", category_name: "Taxe ambalaje", is_variable: true },
];

export async function POST(request: NextRequest) {
  try {
    const { adminId } = await request.json();
    console.log("[v0] seed-cost-catalog API called with adminId:", adminId);

    if (!adminId) {
      return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
    }

    const supabase = await createClient();

    // ─── 1. Build unique groups and categories from DEFAULT_COST_CODES ───
    const groupsMap = new Map<string, { code: string; name: string }>();
    const categoriesMap = new Map<string, { code: string; name: string; group_code: string }>();

    DEFAULT_COST_CODES.forEach((c) => {
      if (!groupsMap.has(c.group_code)) {
        groupsMap.set(c.group_code, { code: c.group_code, name: c.group_name });
      }
      if (!categoriesMap.has(c.category_code)) {
        categoriesMap.set(c.category_code, {
          code: c.category_code,
          name: c.category_name,
          group_code: c.group_code,
        });
      }
    });

    // ─── 2. Upsert groups ───
    const { data: existingGroups } = await supabase
      .from("cost_catalog_groups")
      .select("id, code")
      .eq("admin_id", adminId);

    const existingGroupCodes = new Set(existingGroups?.map((g) => g.code) || []);
    const newGroups = Array.from(groupsMap.values()).filter((g) => !existingGroupCodes.has(g.code));

    if (newGroups.length > 0) {
      const { error: groupErr } = await supabase.from("cost_catalog_groups").insert(
        newGroups.map((g, i) => ({
          admin_id: adminId,
          code: g.code,
          name: g.name,
          display_order: g.code.charCodeAt(0) - 64, // A=1, B=2, ...
          is_active: true,
        }))
      );
      if (groupErr) {
        console.error("[v0] Error seeding groups:", groupErr);
        return NextResponse.json({ error: `Groups: ${groupErr.message}` }, { status: 500 });
      }
    }

    // Refetch all groups for ID lookup
    const { data: allGroups } = await supabase
      .from("cost_catalog_groups")
      .select("id, code")
      .eq("admin_id", adminId);

    const groupIdByCode = new Map(allGroups?.map((g) => [g.code, g.id]) || []);

    // ─── 3. Upsert categories ───
    const { data: existingCategories } = await supabase
      .from("cost_catalog_categories")
      .select("id, code")
      .eq("admin_id", adminId);

    const existingCategoryCodes = new Set(existingCategories?.map((c) => c.code) || []);
    const newCategories = Array.from(categoriesMap.values()).filter(
      (c) => !existingCategoryCodes.has(c.code)
    );

    if (newCategories.length > 0) {
      const { error: catErr } = await supabase.from("cost_catalog_categories").insert(
        newCategories.map((c, i) => ({
          admin_id: adminId,
          group_id: groupIdByCode.get(c.group_code),
          code: c.code,
          name: c.name,
          display_order: parseInt(c.code.substring(1)) || i + 1,
          is_active: true,
        }))
      );
      if (catErr) {
        console.error("[v0] Error seeding categories:", catErr);
        return NextResponse.json({ error: `Categories: ${catErr.message}` }, { status: 500 });
      }
    }

    // Refetch all categories for ID lookup
    const { data: allCategories } = await supabase
      .from("cost_catalog_categories")
      .select("id, code")
      .eq("admin_id", adminId);

    const categoryIdByCode = new Map(allCategories?.map((c) => [c.code, c.id]) || []);

    // ─── 4. Insert cost codes ───
    const { data: existing } = await supabase
      .from("cost_catalog")
      .select("cost_code")
      .eq("admin_id", adminId);

    const existingCodes = new Set(existing?.map((e) => e.cost_code) || []);
    const newCodes = DEFAULT_COST_CODES.filter((c) => !existingCodes.has(c.code));

    if (newCodes.length === 0) {
      return NextResponse.json({
        message: "Catalog already seeded",
        groupsAdded: newGroups.length,
        categoriesAdded: newCategories.length,
        count: 0,
      });
    }

    const { error } = await supabase.from("cost_catalog").insert(
      newCodes.map((code, index) => ({
        admin_id: adminId,
        cost_code: code.code,
        category_id: categoryIdByCode.get(code.category_code),
        cost_line: code.name,
        description: `${code.group_name} > ${code.category_name}`,
        unit: "EUR",
        nature: code.is_variable ? "variable" : "fixed",
        behavior: "direct",
        is_system: true,
        is_active: true,
        display_order: index + 1,
      }))
    );

    if (error) {
      console.error("[v0] Error seeding catalog:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(
      "[v0] Seeded:",
      newGroups.length,
      "groups,",
      newCategories.length,
      "categories,",
      newCodes.length,
      "codes"
    );
    return NextResponse.json({
      message: "Default catalog seeded successfully",
      groupsAdded: newGroups.length,
      categoriesAdded: newCategories.length,
      count: newCodes.length,
    });
  } catch (err: any) {
    console.error("[v0] Seed error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
