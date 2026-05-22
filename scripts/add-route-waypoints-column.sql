-- Add route_waypoints column to orders table for storing draggable route waypoints
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_waypoints jsonb DEFAULT '[]'::jsonb;
