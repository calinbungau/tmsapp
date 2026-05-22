-- Update Laadlijst instruction v6 - MUST include Comanda vanzari in delivery references
UPDATE ai_extraction_instructions
SET instructions = '=== LAADLIJST / LOSLIJST DOCUMENT EXTRACTION ===

This is a Dutch transport loading/unloading list with multiple cargo items.

DOCUMENT STRUCTURE:
- Each cargo item starts with "Comanda vanzari: XXXXX/X" (e.g., 46162/9, 46162/8, 46162/7)
- LEFT side = PICKUP (Incarcare) with address in Netherlands
- RIGHT side = DELIVERY (Descarcare/Cumparator) with address in Romania
- Below each cargo item line there is "Referinta:" for PICKUP and "Referinta:" for DELIVERY

=== CRITICAL: REFERENCE EXTRACTION RULES ===

For PICKUP stops, extract and format reference_number as:
```
Comanda vanzari: 46162/9
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/8
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/7
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-
```
(One block per cargo item, separated by blank line)

For DELIVERY stops, MUST format reference_number as:
```
Comanda vanzari: 46162/9 → Referinta: 4043 KG
Comanda vanzari: 46162/8 → Referinta: 4043 KG  
Comanda vanzari: 46162/7 → Referinta: 47906
```
(One line per cargo item - MUST start with "Comanda vanzari:" followed by arrow and delivery Referinta)

IMPORTANT: The delivery "Referinta" values (like "4043 KG", "47906", "6681LS") are on the RIGHT side of the document next to each cargo item delivery address.

=== NOTES EXTRACTION ===
Extract "Note:" field (e.g., "DOORCODE: 774411") into the stop notes field.

=== DO NOT INCLUDE IN REFERENCES ===
- Colli count
- Temperature  
- LDM (loading meters)
- Weight in kg (unless it IS the Referinta value like "4043 KG")
- Product descriptions

=== SUMMARY ===
1. Find ALL "Comanda vanzari:" entries in document
2. For each one, find its PICKUP Referinta (Ritnr, Klantreferentie) and DELIVERY Referinta
3. PICKUP reference_number = list all with their Ritnr/Klantreferentie
4. DELIVERY reference_number = list all as "Comanda vanzari: X → Referinta: Y"
'
WHERE name = 'Laadlijst / Loslijst (Dutch)';
