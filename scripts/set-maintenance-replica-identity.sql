-- Set REPLICA IDENTITY FULL for maintenance_records table
-- This is required for realtime updates to include all columns
ALTER TABLE maintenance_records REPLICA IDENTITY FULL;
