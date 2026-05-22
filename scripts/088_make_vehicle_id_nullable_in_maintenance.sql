-- Make vehicle_id nullable in maintenance_records to allow trailer-only maintenance
ALTER TABLE maintenance_records ALTER COLUMN vehicle_id DROP NOT NULL;

-- Add a check constraint to ensure either vehicle_id or trailer_id is set
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_has_asset;
ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_has_asset 
  CHECK (vehicle_id IS NOT NULL OR trailer_id IS NOT NULL);
