-- ============================================================================
-- Flexible Execution Architecture - Phase 1 Schema Migration
-- ============================================================================
-- This migration enables:
-- 1. One FWD order to cover multiple trip legs (forwarding_order_legs junction)
-- 2. Partial execution assignment (execution_status on order_stops)
-- 3. Swap stop type for cargo handover points
-- 4. Capacity tracking on trips for route optimization
-- ============================================================================

-- 1. Create forwarding_order_legs junction table
-- Allows ONE forwarding order to cover MULTIPLE trip legs
CREATE TABLE IF NOT EXISTS forwarding_order_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forwarding_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  trip_leg_id UUID NOT NULL REFERENCES trip_legs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(forwarding_order_id, trip_leg_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_forwarding_order_legs_fwd_order 
  ON forwarding_order_legs(forwarding_order_id);
CREATE INDEX IF NOT EXISTS idx_forwarding_order_legs_trip_leg 
  ON forwarding_order_legs(trip_leg_id);

-- 2. Add execution_status to order_stops
-- Tracks whether each stop has been assigned for execution
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_stops' AND column_name = 'execution_status'
  ) THEN
    ALTER TABLE order_stops ADD COLUMN execution_status TEXT DEFAULT 'unassigned';
  END IF;
END $$;

-- Add constraint for execution_status values
DO $$
BEGIN
  ALTER TABLE order_stops DROP CONSTRAINT IF EXISTS order_stops_execution_status_check;
  ALTER TABLE order_stops ADD CONSTRAINT order_stops_execution_status_check 
    CHECK (execution_status IN ('unassigned', 'assigned_own_fleet', 'assigned_forwarding', 'undecided', 'in_progress', 'completed'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Update stop_type constraint to include 'swap'
-- Swap points are where cargo is handed over between vehicles/carriers
DO $$
BEGIN
  ALTER TABLE order_stops DROP CONSTRAINT IF EXISTS order_stops_stop_type_check;
  ALTER TABLE order_stops ADD CONSTRAINT order_stops_stop_type_check 
    CHECK (stop_type IN ('pickup', 'delivery', 'customs', 'transit', 'rest', 'swap'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Add capacity fields to trips for route optimization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trips' AND column_name = 'total_capacity_kg'
  ) THEN
    ALTER TABLE trips ADD COLUMN total_capacity_kg NUMERIC(10,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trips' AND column_name = 'available_capacity_kg'
  ) THEN
    ALTER TABLE trips ADD COLUMN available_capacity_kg NUMERIC(10,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trips' AND column_name = 'is_optimizable'
  ) THEN
    ALTER TABLE trips ADD COLUMN is_optimizable BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- 5. Add subcontractor vehicle/driver fields to trip_legs
-- This allows tracking which specific truck/driver a subcontractor uses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trip_legs' AND column_name = 'subcontractor_vehicle_plate'
  ) THEN
    ALTER TABLE trip_legs ADD COLUMN subcontractor_vehicle_plate TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trip_legs' AND column_name = 'subcontractor_driver_name'
  ) THEN
    ALTER TABLE trip_legs ADD COLUMN subcontractor_driver_name TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trip_legs' AND column_name = 'subcontractor_driver_phone'
  ) THEN
    ALTER TABLE trip_legs ADD COLUMN subcontractor_driver_phone TEXT;
  END IF;
END $$;

-- 6. Enable RLS on new table
ALTER TABLE forwarding_order_legs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can access forwarding_order_legs for orders they have access to
DO $$
BEGIN
  DROP POLICY IF EXISTS "forwarding_order_legs_access" ON forwarding_order_legs;
  CREATE POLICY "forwarding_order_legs_access" ON forwarding_order_legs
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = forwarding_order_legs.forwarding_order_id
        AND o.admin_id IN (
          SELECT admin_id FROM admin_members WHERE user_id = auth.uid()
          UNION
          SELECT id FROM admins WHERE owner_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. Migrate existing data: Create forwarding_order_legs from trip_legs.forwarding_order_id
-- This preserves existing FWD order to trip_leg links
INSERT INTO forwarding_order_legs (forwarding_order_id, trip_leg_id)
SELECT DISTINCT forwarding_order_id, id
FROM trip_legs
WHERE forwarding_order_id IS NOT NULL
ON CONFLICT (forwarding_order_id, trip_leg_id) DO NOTHING;

-- 8. Update execution_status for stops that are already part of trips
UPDATE order_stops os
SET execution_status = 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM trip_stops ts 
      JOIN trip_legs tl ON ts.leg_id = tl.id
      WHERE ts.order_stop_id = os.id 
      AND tl.assignment_type = 'own_fleet'
    ) THEN 'assigned_own_fleet'
    WHEN EXISTS (
      SELECT 1 FROM trip_stops ts 
      JOIN trip_legs tl ON ts.leg_id = tl.id
      WHERE ts.order_stop_id = os.id 
      AND tl.assignment_type = 'forwarding'
    ) THEN 'assigned_forwarding'
    ELSE 'unassigned'
  END
WHERE execution_status = 'unassigned' OR execution_status IS NULL;

-- ============================================================================
-- Summary of changes:
-- 1. forwarding_order_legs: Junction table for many-to-many FWD order ↔ trip_legs
-- 2. order_stops.execution_status: Track assignment state per stop
-- 3. order_stops.stop_type: Added 'swap' for cargo handover points
-- 4. trips capacity fields: For route optimization
-- 5. trip_legs subcontractor fields: Track subcontractor vehicle/driver details
-- ============================================================================
