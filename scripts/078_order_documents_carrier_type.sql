-- Add carrier_confirmation to document_type CHECK, and add optional notes/uploaded_by_name columns
ALTER TABLE order_documents DROP CONSTRAINT IF EXISTS order_documents_document_type_check;
ALTER TABLE order_documents ADD CONSTRAINT order_documents_document_type_check 
  CHECK (document_type IN ('cmr','pod','invoice','packing_list','customs','adr','insurance','order_confirmation','delivery_note','carrier_confirmation','other'));

-- Make admin_id nullable (carrier uploads won't have an admin_id)
ALTER TABLE order_documents ALTER COLUMN admin_id DROP NOT NULL;

-- Add notes column if not exists
ALTER TABLE order_documents ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE order_documents ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT;
