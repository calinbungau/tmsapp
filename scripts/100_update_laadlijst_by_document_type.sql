-- Update instruction by document_type instead of name (in case name was changed)
-- Also update all instructions with 'laadlijst' in the name (case insensitive)

UPDATE ai_extraction_instructions
SET instructions = 'LAADLIJST / LOSLIJST EXTRACTION RULES:

This document lists multiple cargo items (Comanda vanzari) with pickup and delivery information.

=== STOPS ===
Create exactly 2 stops:
1. PICKUP stop - from "Incarcare" section (left side - "Adresa")
2. DELIVERY stop - from "Descarcare" section (right side - "Adresa")

=== REFERENCE_NUMBER FIELD - VERY IMPORTANT ===

For PICKUP stops, format reference_number as:
Comanda vanzari: 46162/9
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/8
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

(one block per cargo item, blank line between blocks)

For DELIVERY stops, you MUST ALSO include the Comanda vanzari number paired with the delivery Referinta value.
The delivery "Referinta" is shown on the RIGHT side of the document (e.g., "Referinta: 4043 KG").

DELIVERY reference_number MUST be formatted as:
Comanda vanzari: 46162/9 → Referinta: 4043 KG
Comanda vanzari: 46162/8 → Referinta: 4043 KG
Comanda vanzari: 46162/7 → Referinta: 47906

WRONG (do NOT do this for delivery):
4043 KG
4043 KG
47906

CORRECT (always include Comanda vanzari for delivery):
Comanda vanzari: 46162/9 → Referinta: 4043 KG
Comanda vanzari: 46162/8 → Referinta: 4043 KG
Comanda vanzari: 46162/7 → Referinta: 47906

=== NOTES FIELD ===
Extract "Note:" field (e.g., "DOORCODE: 774411") into the notes field of each stop.

=== DO NOT INCLUDE IN REFERENCE ===
- Colli count
- LDM (loading meters)
- Weight in kg
- Temperature
- Product descriptions',
    updated_at = now()
WHERE document_type = 'laadlijst'
   OR LOWER(name) LIKE '%laadlijst%'
   OR LOWER(name) LIKE '%loslijst%';
