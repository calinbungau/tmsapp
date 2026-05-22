-- Add appointment_location column to maintenance_records
ALTER TABLE maintenance_records
ADD COLUMN IF NOT EXISTS appointment_location TEXT;

-- Add comment
COMMENT ON COLUMN maintenance_records.appointment_location IS 'Location where the maintenance appointment will take place';
