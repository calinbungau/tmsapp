-- Add geofence_radius column to task_stops for inline geofence sizing
ALTER TABLE task_stops ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 150;
