-- Update the document_has_entity check constraint to include trailer_id

-- First drop the existing constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_has_entity;

-- Add the updated constraint that includes trailer_id
ALTER TABLE documents ADD CONSTRAINT document_has_entity CHECK (
  vehicle_id IS NOT NULL OR 
  driver_id IS NOT NULL OR 
  employee_id IS NOT NULL OR 
  order_id IS NOT NULL OR
  trailer_id IS NOT NULL
);
