-- Enable realtime for drivers table (required for live location tracking in task detail)
-- The drivers table is updated with last_lat, last_lng, last_seen_at on each GPS ping

-- Set REPLICA IDENTITY FULL so UPDATE events include all columns (not just PK)
ALTER TABLE drivers REPLICA IDENTITY FULL;

-- Safely add drivers to realtime publication
DO $$ BEGIN
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
EXCEPTION WHEN duplicate_object THEN
NULL;
END $$;

-- Also add tasks table for realtime status updates
ALTER TABLE tasks REPLICA IDENTITY FULL;

DO $$ BEGIN
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
EXCEPTION WHEN duplicate_object THEN
NULL;
END $$;
