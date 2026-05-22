-- Add from_stop_index and to_stop_index to trips table
-- These reference order_stops by sequence_order (not by ID, since stops may not be saved yet during drafting)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS from_stop_index integer;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS to_stop_index integer;

-- Add carrier fields to trips (for forwarding segments)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES business_partners(id);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS carrier_cost numeric;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS carrier_currency text DEFAULT 'EUR';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assignment_type text DEFAULT 'own_fleet';

-- Add route info to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS distance_km numeric;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS duration_minutes numeric;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_geometry jsonb;

-- Add swap type info
ALTER TABLE trips ADD COLUMN IF NOT EXISTS swap_type text; -- 'truck_swap', 'trailer_swap', 'full_swap', null
