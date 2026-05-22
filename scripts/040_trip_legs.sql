-- ──────────────────────────────────────────────
-- TRIP LEGS: Support for multi-leg trips where
-- truck/driver/trailer can change at mid-route points.
-- Each leg = one segment with its own assignment.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  leg_number INTEGER NOT NULL DEFAULT 1,
  
  -- Assignment (each leg can have different driver/vehicle/trailer)
  assignment_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (assignment_type IN ('internal', 'forwarding')),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL,
  
  -- For forwarding legs: linked forwarding order
  carrier_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
  forwarding_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  carrier_cost NUMERIC(12,2),
  carrier_currency TEXT DEFAULT 'EUR',
  
  -- Route segment
  origin_stop_id UUID REFERENCES order_stops(id) ON DELETE SET NULL,
  destination_stop_id UUID REFERENCES order_stops(id) ON DELETE SET NULL,
  origin_address TEXT,
  destination_address TEXT,
  
  -- Capacity / payload for this leg
  pallets_on_board INTEGER DEFAULT 0,
  weight_on_board_kg NUMERIC(10,2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'planned'
    CHECK (status IN ('planned','in_transit','completed','cancelled')),
  
  -- Timing
  planned_departure TIMESTAMPTZ,
  planned_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  
  -- Notes (e.g. "Truck swap at Oradea depot", "Pallets transferred to trailer B-99-XYZ")
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(trip_id, leg_number)
);

ALTER TABLE trip_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_legs_select" ON trip_legs FOR SELECT USING (true);
CREATE POLICY "trip_legs_insert" ON trip_legs FOR INSERT WITH CHECK (true);
CREATE POLICY "trip_legs_update" ON trip_legs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "trip_legs_delete" ON trip_legs FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_trip_legs_trip_id ON trip_legs(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_legs_driver_id ON trip_legs(driver_id);
CREATE INDEX IF NOT EXISTS idx_trip_legs_vehicle_id ON trip_legs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trip_legs_trailer_id ON trip_legs(trailer_id);
CREATE INDEX IF NOT EXISTS idx_trip_legs_status ON trip_legs(status);
