-- Drop ALL existing status check constraints and recreate with all statuses
DO $$ 
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'maintenance_records'::regclass 
        AND conname LIKE '%status%'
    LOOP
        EXECUTE 'ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS ' || constraint_record.conname;
    END LOOP;
END $$;

-- Add the new constraint with all valid statuses
ALTER TABLE maintenance_records 
ADD CONSTRAINT maintenance_records_status_check 
CHECK (status IN ('reported', 'due', 'expired', 'scheduled', 'diagnose', 'in_progress', 'completed'));
