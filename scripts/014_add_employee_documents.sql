-- Add employee_id column to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE CASCADE;

-- Create index for employee documents
CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON documents(employee_id);

-- Update document_types applies_to to support employee
-- First, drop the existing constraint
ALTER TABLE document_types DROP CONSTRAINT IF EXISTS document_types_applies_to_check;

-- Add new constraint with employee option
ALTER TABLE document_types ADD CONSTRAINT document_types_applies_to_check 
  CHECK (applies_to IN ('driver', 'vehicle', 'employee', 'both', 'all', 'order'));

-- Update the documents entity check constraint to include employee_id
ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_has_entity;
ALTER TABLE documents ADD CONSTRAINT document_has_entity CHECK (
  driver_id IS NOT NULL OR vehicle_id IS NOT NULL OR employee_id IS NOT NULL OR order_id IS NOT NULL
);

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
