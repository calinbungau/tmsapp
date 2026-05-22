-- AI Extraction Instructions System
-- Allows users to define custom extraction rules for different document types

-- Create ai_extraction_instructions table
CREATE TABLE IF NOT EXISTS ai_extraction_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  document_type VARCHAR(50), -- 'laadlijst', 'cmr', 'transport_order', 'invoice', 'generic', etc.
  instructions TEXT NOT NULL, -- The actual prompt/instructions for the AI
  field_mappings JSONB DEFAULT '{}', -- Optional: explicit field mappings
  example_extractions JSONB DEFAULT '[]', -- Optional: example input/output pairs for few-shot learning
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ai_instructions_active ON ai_extraction_instructions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_instructions_default ON ai_extraction_instructions(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_instructions_doc_type ON ai_extraction_instructions(document_type);

-- Track which instruction was used for each extraction
ALTER TABLE ai_extraction_logs ADD COLUMN IF NOT EXISTS instruction_id UUID REFERENCES ai_extraction_instructions(id);
ALTER TABLE ai_extraction_logs ADD COLUMN IF NOT EXISTS instruction_name VARCHAR(100);

-- Enable RLS
ALTER TABLE ai_extraction_instructions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "ai_extraction_instructions_select" ON ai_extraction_instructions;
CREATE POLICY "ai_extraction_instructions_select" ON ai_extraction_instructions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ai_extraction_instructions_insert" ON ai_extraction_instructions;
CREATE POLICY "ai_extraction_instructions_insert" ON ai_extraction_instructions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "ai_extraction_instructions_update" ON ai_extraction_instructions;
CREATE POLICY "ai_extraction_instructions_update" ON ai_extraction_instructions
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "ai_extraction_instructions_delete" ON ai_extraction_instructions;
CREATE POLICY "ai_extraction_instructions_delete" ON ai_extraction_instructions
  FOR DELETE USING (true);

-- Insert default instruction sets
INSERT INTO ai_extraction_instructions (name, description, document_type, instructions, is_default, is_active) VALUES
(
  'Laadlijst / Loslijst (Dutch)',
  'For Dutch loading/unloading lists with Cursa numbers and Comanda vanzari references',
  'laadlijst',
  'DUTCH LAADLIJST/LOSLIJST DOCUMENT EXTRACTION:

KEY IDENTIFIERS:
- "Cursa: XXXXX" = This is the MAIN customer_reference (the trip/journey number)
- "Comanda vanzari: XXXXX/X" = These are individual SHIPMENT references within the trip
  - Put ALL Comanda vanzari numbers in the all_references array
  - Each one corresponds to a cargo item

CARGO EXTRACTION:
- Look for repeated sections with "Comanda vanzari" headers
- Each section contains: goods description, Colli count, Temperature, LDM (loading meters), weight
- Extract EACH as a separate cargo_item with:
  - reference: the Comanda vanzari number (e.g., "46162/9")
  - description: goods name (e.g., "CC Container with KONIFERE 9CM RO-PLOI")
  - colli: package count
  - loading_meters: LDM value
  - weight_kg: weight in KG
  - temperature: if specified

ADDRESSES:
- "Incarcare" section = Loading/pickup location
- "Descarcare" section = Unloading/delivery location
- Extract full address including company name, street, postal code, city, country

SPECIAL FIELDS:
- "Autocamion" = Truck/vehicle info (for internal notes)
- "Semiremorca" = Trailer info
- "Sofer" = Driver name
- "Sealnr." = Seal number
- "DOORCODE" = Door code (put in special_instructions)',
  true,
  true
),
(
  'CMR Consignment Note',
  'For CMR international transport documents',
  'cmr',
  'CMR CONSIGNMENT NOTE EXTRACTION:

KEY FIELDS:
- Box 1: Sender (Expeditor) - Extract as shipper
- Box 2: Consignee (Destinatar) - Extract as receiver  
- Box 3: Place of delivery
- Box 4: Place and date of taking over
- Box 5: Documents attached
- Box 6-9: Marks, packages, nature of goods, weight
- Box 13: Carrier instructions
- Box 16: Carrier name
- Box 21: CMR number = customer_reference

CARGO:
- Extract goods description from boxes 6-9
- Weight from box 11/12
- Package count from box 8

ADDRESSES:
- First stop (loading) = Box 4 location
- Last stop (unloading) = Box 3 location

DATES:
- Loading date from Box 4
- Use pickup_date for loading, delivery_date for unloading',
  false,
  true
),
(
  'Transport Order (Generic)',
  'Standard transport order document extraction',
  'transport_order',
  'TRANSPORT ORDER EXTRACTION:

LOOK FOR:
- Order/Reference number: Usually at top of document
- Customer name and details
- Pickup location with date/time window
- Delivery location with date/time window
- Goods description, weight, dimensions
- Special requirements (temperature, ADR, etc.)
- Price/freight rate if visible

STOPS:
- Create separate stops for each pickup and delivery
- Include time windows when specified
- Extract contact person and phone if available

REFERENCES:
- Main order number goes in customer_reference
- Any sub-references or PO numbers go in all_references array',
  false,
  true
),
(
  'Generic Document',
  'Fallback extraction for any transport document',
  'generic',
  'GENERAL TRANSPORT DOCUMENT EXTRACTION:

Extract any visible information related to:
1. Reference numbers - any order, trip, or tracking numbers
2. Parties involved - shipper, carrier, consignee
3. Addresses - loading and unloading locations
4. Dates and times - pickup and delivery schedules
5. Cargo details - what is being transported, weight, packages
6. Special requirements - temperature, handling instructions
7. Pricing - freight rates if visible

Be thorough and extract ALL relevant transport logistics information.',
  false,
  true
);

-- Function to ensure only one default per document_type
CREATE OR REPLACE FUNCTION check_single_default_instruction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE ai_extraction_instructions 
    SET is_default = FALSE 
    WHERE document_type = NEW.document_type 
      AND id != NEW.id 
      AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_default_instruction ON ai_extraction_instructions;
CREATE TRIGGER ensure_single_default_instruction
  BEFORE INSERT OR UPDATE ON ai_extraction_instructions
  FOR EACH ROW
  EXECUTE FUNCTION check_single_default_instruction();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_ai_instructions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ai_instructions_timestamp ON ai_extraction_instructions;
CREATE TRIGGER update_ai_instructions_timestamp
  BEFORE UPDATE ON ai_extraction_instructions
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_instructions_timestamp();
