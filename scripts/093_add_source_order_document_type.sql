-- Add source_order document type to order_documents
-- This is used for the original customer order document (PDF/image uploaded during AI extraction)

ALTER TABLE order_documents DROP CONSTRAINT IF EXISTS order_documents_document_type_check;
ALTER TABLE order_documents ADD CONSTRAINT order_documents_document_type_check
  CHECK (document_type IN ('invoice', 'bill_of_lading', 'proof_of_delivery', 'customs', 'insurance', 'other', 'carrier_confirmation', 'cmr_pod', 'source_order'));
