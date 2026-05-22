-- ============================================================
-- 062: Create trip_stops + stop_action_types tables
-- ============================================================

-- 1. Configurable stop action types (admin settings)
CREATE TABLE IF NOT EXISTS stop_action_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'Package',
  color TEXT DEFAULT 'blue',
  applies_to_stop_types TEXT[] DEFAULT '{}',
  requires_form BOOLEAN DEFAULT FALSE,
  default_form_id UUID REFERENCES task_forms(id),
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Trip stops: the execution sequence for a trip
CREATE TABLE IF NOT EXISTS trip_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  order_stop_id UUID REFERENCES order_stops(id),
  order_id UUID REFERENCES orders(id),
  leg_id UUID REFERENCES trip_legs(id),

  sequence_order INTEGER NOT NULL,
  stop_type TEXT DEFAULT 'pickup',
  action_type_id UUID REFERENCES stop_action_types(id),

  -- Location (copied from order_stop or set by dispatcher for execution-only stops)
  company_name TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  postal_code TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- Planned times (can differ from order_stop)
  planned_date DATE,
  planned_time_from TIME,
  planned_time_to TIME,
  notes TEXT,
  reference_number TEXT,

  -- Contact
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  -- Execution state (driver updates)
  status TEXT NOT NULL DEFAULT 'pending',
  actual_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,

  -- Auto-checkin settings
  auto_checkin BOOLEAN DEFAULT FALSE,
  auto_checkout BOOLEAN DEFAULT FALSE,
  geofence_radius INTEGER DEFAULT 200,

  -- Form
  form_id UUID REFERENCES task_forms(id),

  -- Routing to THIS stop (from previous stop)
  route_to_geometry JSONB,
  distance_to_km NUMERIC,
  duration_to_minutes NUMERIC,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_id ON trip_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_order_stop_id ON trip_stops(order_stop_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_order_id ON trip_stops(order_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_leg_id ON trip_stops(leg_id);
CREATE INDEX IF NOT EXISTS idx_trip_stops_status ON trip_stops(status);
CREATE INDEX IF NOT EXISTS idx_trip_stops_sequence ON trip_stops(trip_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_stop_action_types_admin ON stop_action_types(admin_id);

-- RLS
ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_stops_all ON trip_stops FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE stop_action_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY stop_action_types_all ON stop_action_types FOR ALL USING (true) WITH CHECK (true);

-- 3. Seed system default action types (admin_id = NULL = system defaults)
INSERT INTO stop_action_types (code, name, icon, color, applies_to_stop_types, is_system, display_order) VALUES
  ('loading',            'Loading',              'PackagePlus',   'blue',    '{pickup}',              TRUE, 1),
  ('unloading',          'Unloading',            'PackageMinus',  'orange',  '{delivery}',            TRUE, 2),
  ('container_pickup',   'Container Pickup',     'Container',     'cyan',    '{pickup}',              TRUE, 3),
  ('container_drop',     'Container Drop-off',   'Container',     'teal',    '{delivery}',            TRUE, 4),
  ('customs_clearance',  'Customs Clearance',    'ShieldCheck',   'amber',   '{customs}',             TRUE, 5),
  ('cross_dock',         'Cross Dock',           'ArrowLeftRight','purple',  '{transit}',             TRUE, 6),
  ('transshipment',      'Transshipment',        'Repeat',        'indigo',  '{transit,swap}',        TRUE, 7),
  ('inspection',         'Inspection',           'ClipboardCheck','yellow',  '{pickup,delivery,customs,transit}', TRUE, 8),
  ('fuel_stop',          'Fuel Stop',            'Fuel',          'emerald', '{rest}',                TRUE, 9),
  ('rest_break',         'Rest Break',           'Coffee',        'zinc',    '{rest}',                TRUE, 10),
  ('border_crossing',    'Border Crossing',      'Flag',          'red',     '{customs,transit}',     TRUE, 11),
  ('weighing',           'Weighing',             'Scale',         'slate',   '{pickup,delivery}',     TRUE, 12)
ON CONFLICT DO NOTHING;
