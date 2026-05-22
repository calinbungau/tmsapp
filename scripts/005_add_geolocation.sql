-- Add geolocation and timestamp fields to inspections
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(10, 2);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS location_timestamp TIMESTAMPTZ;
