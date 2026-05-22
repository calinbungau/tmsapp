-- Add token_type to carrier_upload_tokens to distinguish order confirmation vs CMR/POD uploads
ALTER TABLE carrier_upload_tokens
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'order_confirmation';

-- Allow multiple file uploads for CMR/POD tokens (don't lock on first use)
-- The 'used' flag will be set after upload but CMR/POD tokens allow re-upload

-- Add cmr_pod document type to order_documents
ALTER TABLE order_documents DROP CONSTRAINT IF EXISTS order_documents_document_type_check;
ALTER TABLE order_documents ADD CONSTRAINT order_documents_document_type_check
  CHECK (document_type IN ('invoice', 'bill_of_lading', 'proof_of_delivery', 'customs', 'insurance', 'other', 'carrier_confirmation', 'cmr_pod'));
