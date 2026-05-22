-- Add columns for driver-reported issues
ALTER TABLE maintenance_records
ADD COLUMN IF NOT EXISTS requested_by_driver_id UUID REFERENCES drivers(id),
ADD COLUMN IF NOT EXISTS request_photos TEXT[] DEFAULT '{}';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_requested_by_driver 
ON maintenance_records(requested_by_driver_id);
