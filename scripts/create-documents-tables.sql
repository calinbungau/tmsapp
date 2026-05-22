-- Document Types table (scalable for drivers, vehicles, orders, etc.)
CREATE TABLE IF NOT EXISTS document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  applies_to TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('driver', 'vehicle', 'both', 'order')),
  requires_expiry BOOLEAN DEFAULT false,
  expiry_remind_days INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table (linked to drivers, vehicles, or future entities)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  order_id UUID, -- For future use with orders
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  expiry_date DATE,
  notes TEXT,
  uploaded_by_type TEXT NOT NULL DEFAULT 'admin' CHECK (uploaded_by_type IN ('admin', 'driver')),
  uploaded_by_admin_id UUID REFERENCES admins(id),
  uploaded_by_driver_id UUID REFERENCES drivers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure document is linked to at least one entity
  CONSTRAINT document_has_entity CHECK (
    driver_id IS NOT NULL OR vehicle_id IS NOT NULL OR order_id IS NOT NULL
  )
);

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_types
DROP POLICY IF EXISTS "Allow select document_types" ON document_types;
CREATE POLICY "Allow select document_types" ON document_types FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert document_types" ON document_types;
CREATE POLICY "Allow insert document_types" ON document_types FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update document_types" ON document_types;
CREATE POLICY "Allow update document_types" ON document_types FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete document_types" ON document_types;
CREATE POLICY "Allow delete document_types" ON document_types FOR DELETE USING (true);

-- RLS Policies for documents
DROP POLICY IF EXISTS "Allow select documents" ON documents;
CREATE POLICY "Allow select documents" ON documents FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert documents" ON documents;
CREATE POLICY "Allow insert documents" ON documents FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update documents" ON documents;
CREATE POLICY "Allow update documents" ON documents FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete documents" ON documents;
CREATE POLICY "Allow delete documents" ON documents FOR DELETE USING (true);

-- Storage policies for documents bucket
DROP POLICY IF EXISTS "Allow uploads to documents" ON storage.objects;
CREATE POLICY "Allow uploads to documents" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Allow reads from documents" ON storage.objects;
CREATE POLICY "Allow reads from documents" ON storage.objects
FOR SELECT USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Allow deletes from documents" ON storage.objects;
CREATE POLICY "Allow deletes from documents" ON storage.objects
FOR DELETE USING (bucket_id = 'documents');

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_admin_id ON documents(admin_id);
CREATE INDEX IF NOT EXISTS idx_documents_driver_id ON documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_documents_vehicle_id ON documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_document_type_id ON documents(document_type_id);
CREATE INDEX IF NOT EXISTS idx_document_types_admin_id ON document_types(admin_id);

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
