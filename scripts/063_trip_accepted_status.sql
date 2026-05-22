-- Add accepted status to trips (between dispatched and in_progress)
COMMENT ON COLUMN trips.status IS 'planned | dispatched | accepted | in_progress | completed | cancelled';

-- Add trip status to trip_stops comment
COMMENT ON COLUMN trip_stops.status IS 'pending | en_route | arrived | in_action | completed | skipped';
