-- Update the Laadlijst instruction with precise reference extraction rules
UPDATE ai_extraction_instructions
SET instructions = 'DOCUMENT TYPE: Dutch Laadlijst/Loslijst (Loading/Unloading List)

EXTRACTION RULES:

1. STOPS - Each document has multiple stops (pickup and delivery):
   - LEFT SIDE = PICKUP (Incarcare/Laden)
   - RIGHT SIDE = DELIVERY (Descarcare/Lossen)
   
2. FOR EACH STOP, extract these fields SEPARATELY:
   
   A. reference_number - ONLY include:
      - "Comanda vanzari: [number]" (e.g., "46162/1")
      - "Referinta/Referentie" line: "Ritnr: [number], Klantreferentie: [code]"
      - Format: "Comanda Vanzari: 46162/1\nRitnr: 82615880, Klantreferentie: FLS-46127/53256-"
      - For delivery stops, just the "Referinta" value (e.g., "6681LS")
      
   B. notes - Extract the "Note:" field (e.g., "DOORCODE: 774411")
   
   C. DO NOT put cargo item details (colli, LDM, kg, temperature) in reference_number
   
3. CARGO ITEMS - Extract separately in cargo_items array:
   - description: product name
   - colli: number of packages
   - weight_kg: weight
   - loading_meters: LDM value
   - temperature: temp requirement
   - reference: the item number like "46162/9"
   - customer_reference: the Klantreferentie

4. IMPORTANT FIELD SEPARATION:
   - reference_number = ONLY document references (Comanda vanzari, Ritnr, Klantreferentie)
   - notes = DOORCODE, special instructions
   - cargo_items = product details with quantities
   
5. EXAMPLE OUTPUT for a pickup stop:
   {
     "type": "pickup",
     "company_name": "Wolter Koops Bemmel",
     "address": "Logistiekweg 4",
     "city": "Bemmel",
     "postal_code": "6681 LS",
     "country": "NL",
     "reference_number": "Comanda Vanzari: 46162/1\nRitnr: 82615880, Klantreferentie: FLS-46127/53256-",
     "notes": "DOORCODE: 774411"
   }

6. EXAMPLE OUTPUT for a delivery stop:
   {
     "type": "delivery", 
     "company_name": "Depozit Kaufland Turda",
     "address": "Sat Mihai Viteazu 1408",
     "city": "Mihai Viteazu Turda",
     "postal_code": "407405",
     "country": "RO",
     "reference_number": "6681LS",
     "notes": ""
   }',
description = 'For Dutch Laadlijst/Loslijst documents. Extracts Comanda Vanzari, Ritnr, Klantreferentie into stop references. Notes go to notes field. Cargo details stay in cargo_items.',
updated_at = NOW()
WHERE name = 'Laadlijst / Loslijst (Dutch)';
