-- 170_carrier_cost_calculations.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a scalable, audit-friendly store for "Determine Cost" calculations so
-- the same breakdown can be:
--   - reused (pre-filled when re-opening the dialog),
--   - sent to a carrier (e.g. attached to a forwarding order PDF),
--   - kept for the carrier's own records.
--
-- A calculation is always tied to either an order (FWD order being priced)
-- or a trip_leg (a specific subcontracted leg). Both columns are nullable
-- and one of them must be set — enforced by a CHECK constraint.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS carrier_cost_calculations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL,

  -- Scope: at least one of these MUST be set
  order_id        uuid REFERENCES orders(id)     ON DELETE CASCADE,
  trip_leg_id    uuid REFERENCES trip_legs(id)  ON DELETE CASCADE,

  -- Which physical unit produced the route used in the calculation
  unit_type       text CHECK (unit_type IN ('vehicle','trailer','driver')),
  unit_id         uuid,
  unit_label      text,                       -- denormalized "B 21 VLR · Volvo FH" for stable display

  -- Period over which we measured distance/duration
  period_from     timestamptz,
  period_to       timestamptz,

  -- Pricing model. `hybrid` = combine multiple modes (e.g. per_km + per_day fixed).
  pricing_mode    text NOT NULL DEFAULT 'per_km'
                       CHECK (pricing_mode IN ('per_km','per_day','per_hour','fixed','hybrid')),

  rate_per_km     numeric,
  rate_per_day    numeric,
  rate_per_hour   numeric,
  fixed_amount    numeric,

  -- Measured values (any may be null when not relevant for the chosen mode)
  distance_km     numeric,
  duration_hours  numeric,
  days            numeric,

  -- Optional extras: array of { label, amount, currency } objects for
  -- toll, fuel surcharge, ferry, etc.
  extras          jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Computed totals (we store them so historical rows stay stable even if
  -- inputs are later edited).
  subtotal        numeric,
  total_amount    numeric,
  currency        text NOT NULL DEFAULT 'EUR',

  -- Provenance of the distance/route values
  gps_source      text CHECK (gps_source IN ('traccar','driver_app','odometer','manual','order_route')),
  route_geometry  jsonb,                      -- optional GeoJSON / encoded polyline

  notes           text,

  -- When true, this calculation is the one currently "applied" to the
  -- order's / leg's carrier_cost field. There can be many drafts but only
  -- one applied at a time per scope (enforced by a partial unique index).
  is_applied      boolean NOT NULL DEFAULT false,

  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT carrier_cost_calc_scope_chk
    CHECK (order_id IS NOT NULL OR trip_leg_id IS NOT NULL)
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS carrier_cost_calc_admin_idx
  ON carrier_cost_calculations(admin_id);
CREATE INDEX IF NOT EXISTS carrier_cost_calc_order_idx
  ON carrier_cost_calculations(order_id)    WHERE order_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS carrier_cost_calc_leg_idx
  ON carrier_cost_calculations(trip_leg_id) WHERE trip_leg_id IS NOT NULL;

-- Only one "applied" calculation per order
CREATE UNIQUE INDEX IF NOT EXISTS carrier_cost_calc_applied_order_uq
  ON carrier_cost_calculations(order_id)
  WHERE is_applied = true AND order_id IS NOT NULL;

-- Only one "applied" calculation per leg
CREATE UNIQUE INDEX IF NOT EXISTS carrier_cost_calc_applied_leg_uq
  ON carrier_cost_calculations(trip_leg_id)
  WHERE is_applied = true AND trip_leg_id IS NOT NULL;

-- Auto-update `updated_at`
CREATE OR REPLACE FUNCTION carrier_cost_calc_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carrier_cost_calc_touch_updated_at ON carrier_cost_calculations;
CREATE TRIGGER carrier_cost_calc_touch_updated_at
  BEFORE UPDATE ON carrier_cost_calculations
  FOR EACH ROW EXECUTE FUNCTION carrier_cost_calc_touch_updated_at();

-- RLS — mirror the rest of the TMS tables (admin-scoped open-read pattern).
ALTER TABLE carrier_cost_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carrier_cost_calc_select ON carrier_cost_calculations;
CREATE POLICY carrier_cost_calc_select ON carrier_cost_calculations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS carrier_cost_calc_insert ON carrier_cost_calculations;
CREATE POLICY carrier_cost_calc_insert ON carrier_cost_calculations
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS carrier_cost_calc_update ON carrier_cost_calculations;
CREATE POLICY carrier_cost_calc_update ON carrier_cost_calculations
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS carrier_cost_calc_delete ON carrier_cost_calculations;
CREATE POLICY carrier_cost_calc_delete ON carrier_cost_calculations
  FOR DELETE USING (true);
