-- Drop the old check constraint and add new one with 'reported' status
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_status_check;

ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_records_status_check 
CHECK (status IN ('due', 'expired', 'scheduled', 'diagnose', 'in_progress', 'completed', 'cancelled', 'reported'));
