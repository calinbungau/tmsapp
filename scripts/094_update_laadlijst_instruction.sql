-- Update Laadlijst instruction to be more explicit about reference_number field
UPDATE ai_extraction_instructions
SET instructions = 'IMPORTANT: This is a Dutch Laadlijst/Loslijst document. Follow these rules STRICTLY:

1. REFERENCE NUMBER FIELD - CRITICAL:
   - For each stop, you MUST populate the "reference_number" field with the cargo description items
   - Format: One item per line with its reference
   - Example format for reference_number:
     "Cursa: 12345
     Comanda vanzari: ABC-001
     Comanda vanzari: ABC-002"
   - DO NOT put this information in the "notes" field
   - DO NOT leave reference_number as null or empty

2. CUSTOMER REFERENCE:
   - The "Cursa" number is the main customer reference for the order
   - Put this in the order-level customer_reference field

3. STOP IDENTIFICATION:
   - "Incarcare" or "Laden" = Loading stop (type: "loading")
   - "Descarcare" or "Lossen" = Unloading stop (type: "unloading")

4. CARGO ITEMS:
   - Each "Comanda vanzari" or sales order is a separate cargo item
   - Extract weight, pallets, and description for each item
   - Link cargo items to their respective stops

5. ADDRESSES:
   - Extract full address including street, city, postal code, and country
   - Country codes: RO = Romania, NL = Netherlands, DE = Germany, BE = Belgium

6. DATES AND TIMES:
   - Look for "Data" or "Datum" for dates
   - Format dates as YYYY-MM-DD
   - Extract time windows if provided

REMEMBER: The reference_number field should contain ALL cargo references for that stop, one per line. Never leave it empty if there are Comanda vanzari numbers.',
    updated_at = NOW()
WHERE name = 'Laadlijst / Loslijst (NL)';
