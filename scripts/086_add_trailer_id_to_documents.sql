-- Add trailer_id column to documents table for trailer document management
ALTER TABLE documents ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES trailers(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_trailer_id ON documents(trailer_id);

-- Add trailer_id to maintenance_records for trailer maintenance tracking
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES trailers(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_maintenance_records_trailer_id ON maintenance_records(trailer_id);
