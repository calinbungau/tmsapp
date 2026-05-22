-- Add route/distance fields to orders table so drafts can persist route data
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_distance_km numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_duration_hours numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_geometry jsonb;
