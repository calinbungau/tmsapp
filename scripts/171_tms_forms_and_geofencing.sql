-- ============================================================
-- 171: TMS-side forms, submissions, and per-trip auto-checkin
-- ------------------------------------------------------------
-- Goal: reuse the existing FSM form engine (task_forms /
-- task_form_fields) for the TMS side as well, so a dispatcher can
-- attach a form (e.g. "CMR upload + signature") to:
--   * an entire order      (orders.form_id)
--   * an entire trip exec  (trips.form_id)
--   * an individual trip stop (trip_stops.form_id already exists)
--
-- We DO NOT reuse stop_form_submissions because that table is FK'd
-- to task_stops/tasks, which are FSM-only. Instead we add parallel
-- submission tables that point at TMS entities. Same shape, same
-- driver/admin renderer, separate audit trail.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1. Expand task_forms.scope so the same builder UI can produce
--    forms intended for orders/trips as well as tasks/stops. The
--    FSM screens already filter by scope, so existing forms keep
--    working.
DO $$
BEGIN
  -- Drop the old CHECK if present, then add the wider one.
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'task_forms'
      AND constraint_name = 'task_forms_scope_check'
  ) THEN
    ALTER TABLE task_forms DROP CONSTRAINT task_forms_scope_check;
  END IF;

  ALTER TABLE task_forms
    ADD CONSTRAINT task_forms_scope_check
    CHECK (scope IN ('task','stop','order','trip'));
END $$;

-- 2. Order-level form attachment + submission audit.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES task_forms(id);

CREATE TABLE IF NOT EXISTS order_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES task_forms(id),
  submitted_by UUID,
  submitted_by_type TEXT DEFAULT 'driver' CHECK (submitted_by_type IN ('driver','admin')),
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_form_submissions_order
  ON order_form_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_form_submissions_form
  ON order_form_submissions(form_id);

-- 3. Trip-level form attachment + submission audit. Lets a
--    dispatcher require, e.g. a single end-of-trip POD signature
--    that the driver fills once after the last drop.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES task_forms(id);

CREATE TABLE IF NOT EXISTS trip_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES task_forms(id),
  submitted_by UUID,
  submitted_by_type TEXT DEFAULT 'driver' CHECK (submitted_by_type IN ('driver','admin')),
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_form_submissions_trip
  ON trip_form_submissions(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_form_submissions_form
  ON trip_form_submissions(form_id);

-- 4. Trip-stop form submissions. trip_stops.form_id already exists
--    (script 062), but we never had an audit-trail table for it -
--    drivers had nowhere to write a CMR photo against a trip stop.
CREATE TABLE IF NOT EXISTS trip_stop_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_stop_id UUID NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES task_forms(id),
  submitted_by UUID,
  submitted_by_type TEXT DEFAULT 'driver' CHECK (submitted_by_type IN ('driver','admin')),
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_stop_form_submissions_stop
  ON trip_stop_form_submissions(trip_stop_id);
CREATE INDEX IF NOT EXISTS idx_trip_stop_form_submissions_trip
  ON trip_stop_form_submissions(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stop_form_submissions_form
  ON trip_stop_form_submissions(form_id);

-- 5. Geofence audit trail: every auto check-in/out the engine
--    performs lands here so dispatchers can debug "why didn't it
--    fire?" or "why did it fire twice?". Distinct from
--    actual_arrival/actual_departure on trip_stops, which only
--    keep the final timestamps.
CREATE TABLE IF NOT EXISTS trip_stop_geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_stop_id UUID NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('enter','exit')),
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  distance_meters NUMERIC,
  position_lat DOUBLE PRECISION,
  position_lng DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_stop_geofence_events_stop
  ON trip_stop_geofence_events(trip_stop_id);
CREATE INDEX IF NOT EXISTS idx_trip_stop_geofence_events_trip
  ON trip_stop_geofence_events(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stop_geofence_events_driver_recorded
  ON trip_stop_geofence_events(driver_id, recorded_at DESC);

-- 6. Default geofence radius at company level. When a dispatcher
--    creates a stop without overriding, this value seeds
--    trip_stops.geofence_radius. Keeps a single tunable knob
--    instead of forcing radii on every stop.
ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS default_geofence_radius_m INTEGER DEFAULT 200;

-- 7. RLS
ALTER TABLE order_form_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_form_submissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stop_form_submissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stop_geofence_events    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_form_submissions' AND policyname='order_form_submissions_all') THEN
    CREATE POLICY order_form_submissions_all ON order_form_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_form_submissions' AND policyname='trip_form_submissions_all') THEN
    CREATE POLICY trip_form_submissions_all ON trip_form_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_stop_form_submissions' AND policyname='trip_stop_form_submissions_all') THEN
    CREATE POLICY trip_stop_form_submissions_all ON trip_stop_form_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_stop_geofence_events' AND policyname='trip_stop_geofence_events_all') THEN
    CREATE POLICY trip_stop_geofence_events_all ON trip_stop_geofence_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
