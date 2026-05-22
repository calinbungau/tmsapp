-- Update Laadlijst instruction to include Comanda vanzari in delivery references
UPDATE ai_extraction_instructions
SET instructions = 'DOCUMENT TYPE: Dutch Laadlijst/Loslijst (Loading/Unloading List)

CRITICAL: This document contains MULTIPLE cargo items. Each "Comanda vanzari" block is a separate shipment.

EXTRACTION RULES:

1. PICKUP STOP (Incarcare side - LEFT column):
   - Address: Use "Adresa" from the Incarcare section
   - Date/Time: Use "Incarcare" date and time
   - reference_number: Combine ALL cargo items in this format (one block per cargo item):
     
     Comanda vanzari: [number]
     Ritnr: [value], Klantreferentie: [value]
     
     Comanda vanzari: [next number]
     Ritnr: [value], Klantreferentie: [value]
     
     (continue for ALL cargo items in document)
   
   - notes: Extract "Note:" value (e.g., "DOORCODE: 774411")

2. DELIVERY STOP (Descarcare side - RIGHT column):
   - Address: Use "Adresa" from the Descarcare/Cumparator section
   - Date/Time: Use "Descarcare" date and time
   - reference_number: Combine ALL cargo items with their delivery reference:
     
     Comanda vanzari: [number] - Referinta: [delivery ref value]
     Comanda vanzari: [next number] - Referinta: [delivery ref value]
     
     (continue for ALL cargo items, matching each Comanda vanzari with its corresponding delivery Referinta)

EXAMPLE from document with 3 cargo items (46162/9, 46162/8, 46162/7):

PICKUP reference_number should be:
"Comanda vanzari: 46162/9
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/8
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/7
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-"

DELIVERY reference_number should be:
"Comanda vanzari: 46162/9 - Referinta: 4043 KG
Comanda vanzari: 46162/8 - Referinta: 4043 KG
Comanda vanzari: 46162/7 - Referinta: 47906"

IMPORTANT:
- Count ALL "Comanda vanzari" entries in the document
- Each cargo item has a pickup Referinta AND a delivery Referinta
- Do NOT put colli, LDM, kg, or temperature in reference_number
- Notes field is for DOORCODE or other special instructions only',
    updated_at = NOW()
WHERE name = 'Laadlijst / Loslijst (Dutch)';
