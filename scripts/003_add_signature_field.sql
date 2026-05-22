-- Add signature_url field to inspections table

ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS signature_url TEXT;
