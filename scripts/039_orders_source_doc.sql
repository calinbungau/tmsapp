-- Add source_document_url to orders for persisting uploaded PDF URLs
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_document_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT TRUE;
