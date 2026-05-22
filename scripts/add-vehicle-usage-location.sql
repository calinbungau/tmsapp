-- Add GPS location tracking to vehicle usage sessions

-- Check-in location
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS check_in_latitude DECIMAL(10, 8);
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS check_in_longitude DECIMAL(11, 8);

-- Check-out location
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS check_out_latitude DECIMAL(10, 8);
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS check_out_longitude DECIMAL(11, 8);

-- Last known location (updated periodically while session is active)
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS last_latitude DECIMAL(10, 8);
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS last_longitude DECIMAL(11, 8);
ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS last_location_time TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN vehicle_usage_sessions.check_in_latitude IS 'GPS latitude at check-in';
COMMENT ON COLUMN vehicle_usage_sessions.check_in_longitude IS 'GPS longitude at check-in';
COMMENT ON COLUMN vehicle_usage_sessions.check_out_latitude IS 'GPS latitude at check-out';
COMMENT ON COLUMN vehicle_usage_sessions.check_out_longitude IS 'GPS longitude at check-out';
COMMENT ON COLUMN vehicle_usage_sessions.last_latitude IS 'Last known GPS latitude while session active';
COMMENT ON COLUMN vehicle_usage_sessions.last_longitude IS 'Last known GPS longitude while session active';
COMMENT ON COLUMN vehicle_usage_sessions.last_location_time IS 'Timestamp of last location update';
