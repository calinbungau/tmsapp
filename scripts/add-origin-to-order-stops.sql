-- Add origin column to order_stops to distinguish document stops from execution stops
-- "order" = stops from the original customer document/order (immutable record)
-- "execution" = stops added during trip planning (swap points, extra deliveries, re-routing)

ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'order';

-- Add check constraint (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_stops_origin_check'
  ) THEN
    ALTER TABLE order_stops ADD CONSTRAINT order_stops_origin_check
      CHECK (origin IN ('order', 'execution'));
  END IF;
END $$;

-- Mark all existing stops as "order" (they all came from documents)
UPDATE order_stops SET origin = 'order' WHERE origin IS NULL;

-- Add index for filtering by origin
CREATE INDEX IF NOT EXISTS idx_order_stops_origin ON order_stops(origin);
