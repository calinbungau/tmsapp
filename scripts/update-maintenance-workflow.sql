-- Update maintenance_records table to support driver requests and planning workflow
-- New statuses: 'request' (driver submitted), 'diagnose' (admin reviewing), 'scheduled', 'due', 'expired', 'completed'

-- Add new columns for driver requests and planning
ALTER TABLE maintenance_records 
ADD COLUMN IF NOT EXISTS requested_by_driver_id UUID REFERENCES drivers(id),
ADD COLUMN IF NOT EXISTS request_description TEXT,
ADD COLUMN IF NOT EXISTS request_photos TEXT[], -- Array of photo URLs
ADD COLUMN IF NOT EXISTS request_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ, -- When status changed to expired
ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ, -- Planned start time for mechanic
ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMPTZ, -- Planned end time
ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES drivers(id), -- Driver assigned to bring vehicle
ADD COLUMN IF NOT EXISTS mechanic_notes TEXT;

-- Create table for maintenance request photos (for blob storage)
CREATE TABLE IF NOT EXISTS maintenance_request_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_record_id UUID REFERENCES maintenance_records(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE maintenance_request_photos ENABLE ROW LEVEL SECURITY;

-- Unrestricted policies for maintenance_request_photos
DROP POLICY IF EXISTS "unrestricted_select_maintenance_photos" ON maintenance_request_photos;
DROP POLICY IF EXISTS "unrestricted_insert_maintenance_photos" ON maintenance_request_photos;
DROP POLICY IF EXISTS "unrestricted_update_maintenance_photos" ON maintenance_request_photos;
DROP POLICY IF EXISTS "unrestricted_delete_maintenance_photos" ON maintenance_request_photos;

CREATE POLICY "unrestricted_select_maintenance_photos" ON maintenance_request_photos FOR SELECT USING (true);
CREATE POLICY "unrestricted_insert_maintenance_photos" ON maintenance_request_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "unrestricted_update_maintenance_photos" ON maintenance_request_photos FOR UPDATE USING (true);
CREATE POLICY "unrestricted_delete_maintenance_photos" ON maintenance_request_photos FOR DELETE USING (true);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_records_status ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_requested_by ON maintenance_records(requested_by_driver_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_scheduled_time ON maintenance_records(scheduled_start_time);
