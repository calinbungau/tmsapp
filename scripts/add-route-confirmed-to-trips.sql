-- Add route_confirmed_at to trips table
-- route_geometry, distance_km, duration_minutes already exist
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS route_confirmed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS route_confirmed_by UUID DEFAULT NULL REFERENCES admins(id);

-- Also add a status check for the new order statuses
-- Orders: draft -> confirmed -> dispatched -> in_transit -> delivered -> completed / cancelled
-- No constraint needed since we use text, but document the valid statuses
COMMENT ON COLUMN orders.status IS 'draft | confirmed | dispatched | in_transit | delivered | completed | cancelled';
COMMENT ON COLUMN trips.status IS 'planned | confirmed | dispatched | in_progress | completed | cancelled';
COMMENT ON COLUMN trips.route_geometry IS 'Encoded polyline or array of [lat,lng] for the confirmed route';
COMMENT ON COLUMN trips.route_confirmed_at IS 'Timestamp when dispatcher confirmed/saved the route';
