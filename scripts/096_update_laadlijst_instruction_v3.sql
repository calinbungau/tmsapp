-- Update Laadlijst instruction to extract ALL cargo item references
UPDATE ai_extraction_instructions
SET instructions = 'DOCUMENT TYPE: Dutch Laadlijst / Loslijst (Loading/Unloading List)

CRITICAL - REFERENCE EXTRACTION RULES:

This document contains MULTIPLE cargo items (Comanda vanzari). You MUST extract ALL of them.

For PICKUP stop reference_number, combine ALL cargo items in this format:
```
Comanda vanzari: 46162/9
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/8
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-

Comanda vanzari: 46162/7
Ritnr: 82615880, Klantreferentie: FLS-46125/55363-
```

Each cargo item block should have:
- Line 1: "Comanda vanzari: [number]"
- Line 2: "Ritnr: [value], Klantreferentie: [value]"
- Empty line before next item

LOOK FOR in the document:
- "Comanda vanzari:" followed by a number like 46162/9, 46162/8, etc.
- "Referinta:" section containing "Ritnr:" and "Klantreferentie:"
- Each cargo row has its own Comanda vanzari number

For DELIVERY stop reference_number:
- Extract the "Referinta:" value shown on the right side (e.g., "4043 KG", "47906", "6681LS")
- If multiple deliveries, combine them with newlines

NOTES FIELD:
- Extract "Note:" content like "DOORCODE: 774411" into the notes field

DO NOT include in reference_number:
- Colli count
- LDM (loading meters)  
- Weight in kg
- Temperature
- Product descriptions

STOP STRUCTURE:
- Pickup = left side (Incarcare/Adresa)
- Delivery = right side (Descarcare/Adresa)',
    updated_at = NOW()
WHERE name = 'Laadlijst / Loslijst (Dutch)';
