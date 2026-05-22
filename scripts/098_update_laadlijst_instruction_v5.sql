-- Update Laadlijst instruction to properly format delivery references with Comanda vanzari
UPDATE ai_extraction_instructions
SET instructions = 'DOCUMENT TYPE: Laadlijst / Loslijst (Dutch loading/unloading list)

CRITICAL EXTRACTION RULES:

1. CARGO ITEMS - Extract ALL cargo items from the document. Each row starting with "Comanda vanzari:" is a separate cargo item.

2. STOPS - There are typically 2 stops:
   - PICKUP (Incarcare): The "Adresa" on the LEFT side
   - DELIVERY (Descarcare): The "Adresa" on the RIGHT side

3. PICKUP STOP reference_number - Combine ALL cargo items like this:
   For EACH cargo item, create one block:
   "Comanda vanzari: [number]
   Ritnr: [value], Klantreferentie: [value]"
   
   Separate each block with a blank line.
   
   Example:
   "Comanda vanzari: 46162/9
   Ritnr: 82615880, Klantreferentie: FLS-46125/55363-
   
   Comanda vanzari: 46162/8
   Ritnr: 82615880, Klantreferentie: FLS-46125/55363-"

4. DELIVERY STOP reference_number - MUST include the Comanda vanzari number paired with the delivery Referinta:
   For EACH cargo item, find the delivery-side "Referinta:" value and format as:
   "Comanda vanzari: [number], Referinta: [delivery_ref_value]"
   
   One line per cargo item.
   
   Example:
   "Comanda vanzari: 46162/9, Referinta: 4043 KG
   Comanda vanzari: 46162/8, Referinta: 4043 KG
   Comanda vanzari: 46162/7, Referinta: 47906"

5. NOTES - Extract "Note:" field value (e.g., "DOORCODE: 774411") into the stop notes field.

6. DO NOT include in reference_number:
   - Colli count
   - Temperature
   - Loading meters (LDM)
   - Product descriptions

REMEMBER: Every delivery reference line MUST start with "Comanda vanzari: [number]" so users can identify which reference belongs to which cargo item.'
WHERE name = 'Laadlijst / Loslijst (Dutch)';
