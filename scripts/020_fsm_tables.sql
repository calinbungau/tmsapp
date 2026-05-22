-- FSM Module: Tasks, Stops, Geofences, Custom Forms, Driver Positions

-- 1. Geofences (reusable location boundaries)
CREATE TABLE IF NOT EXISTS geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'circle' CHECK (type IN ('circle', 'polygon')),
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters INTEGER,
  polygon_coordinates JSONB,
  address TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Task types (configurable)
CREATE TABLE IF NOT EXISTS task_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT 'clipboard',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Task custom statuses
CREATE TABLE IF NOT EXISTS task_custom_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  system_status TEXT NOT NULL CHECK (system_status IN ('not_assigned','scheduled','dispatched','confirmed','in_progress','completed','failed','cancelled')),
  color TEXT DEFAULT '#6b7280',
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Task forms (custom form definitions)
CREATE TABLE IF NOT EXISTS task_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('task', 'stop')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Task form fields (with drag & drop ordering)
CREATE TABLE IF NOT EXISTS task_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES task_forms(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','textarea','number','select','checkbox','date','time','photo','signature','file','toggle','rating')),
  label TEXT NOT NULL,
  placeholder TEXT,
  help_text TEXT,
  is_required BOOLEAN DEFAULT false,
  is_visible_to_driver BOOLEAN DEFAULT true,
  is_editable_by_driver BOOLEAN DEFAULT true,
  options JSONB,
  default_value TEXT,
  validation_rules JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tasks (core entity)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  reference_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  task_type_id UUID REFERENCES task_types(id),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','not_assigned','scheduled','dispatched','confirmed','in_progress','completed','failed','cancelled')),
  custom_status_id UUID REFERENCES task_custom_statuses(id),
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  customer_id UUID REFERENCES business_partners(id),
  task_form_id UUID REFERENCES task_forms(id),
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_by UUID,
  notes TEXT,
  tags JSONB,
  is_draft BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate reference number
CREATE OR REPLACE FUNCTION generate_task_reference()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  year_str TEXT;
BEGIN
  year_str := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(reference_number FROM '\d+$') AS INTEGER)
  ), 0) + 1 INTO next_num
  FROM tasks
  WHERE admin_id = NEW.admin_id
  AND reference_number LIKE 'FSM-' || year_str || '-%';
  
  NEW.reference_number := 'FSM-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_reference_trigger ON tasks;
CREATE TRIGGER task_reference_trigger
  BEFORE INSERT ON tasks
  FOR EACH ROW
  WHEN (NEW.reference_number IS NULL)
  EXECUTE FUNCTION generate_task_reference();

-- 7. Task stops (ordered waypoints)
CREATE TABLE IF NOT EXISTS task_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  geofence_id UUID REFERENCES geofences(id),
  auto_checkin BOOLEAN DEFAULT false,
  auto_checkout BOOLEAN DEFAULT false,
  planned_arrival TIMESTAMPTZ,
  planned_departure TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  estimated_duration_minutes INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','en_route','arrived','in_progress','completed','skipped','failed')),
  stop_form_id UUID REFERENCES task_forms(id),
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Task form submissions (task-level)
CREATE TABLE IF NOT EXISTS task_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES task_forms(id),
  submitted_by UUID,
  submitted_by_type TEXT DEFAULT 'driver' CHECK (submitted_by_type IN ('driver','admin')),
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Stop form submissions (stop-level)
CREATE TABLE IF NOT EXISTS stop_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL REFERENCES task_stops(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES task_forms(id),
  submitted_by UUID,
  submitted_by_type TEXT DEFAULT 'driver' CHECK (submitted_by_type IN ('driver','admin')),
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Task status history (audit trail)
CREATE TABLE IF NOT EXISTS task_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  changed_by_type TEXT DEFAULT 'system' CHECK (changed_by_type IN ('driver','admin','system')),
  notes TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Task comments (dispatcher-driver communication)
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID,
  author_type TEXT DEFAULT 'admin' CHECK (author_type IN ('driver','admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Driver positions (1-min GPS tracking)
CREATE TABLE IF NOT EXISTS driver_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  task_id UUID REFERENCES tasks(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery_level INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_admin_id ON tasks(admin_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_driver_id ON tasks(driver_id);
CREATE INDEX IF NOT EXISTS idx_tasks_vehicle_id ON tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_planned_start ON tasks(planned_start);
CREATE INDEX IF NOT EXISTS idx_task_stops_task_id ON task_stops(task_id);
CREATE INDEX IF NOT EXISTS idx_task_stops_geofence_id ON task_stops(geofence_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_driver_positions_driver_id ON driver_positions(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_positions_recorded_at ON driver_positions(recorded_at);
CREATE INDEX IF NOT EXISTS idx_driver_positions_task_id ON driver_positions(task_id);
CREATE INDEX IF NOT EXISTS idx_geofences_admin_id ON geofences(admin_id);
CREATE INDEX IF NOT EXISTS idx_task_forms_admin_id ON task_forms(admin_id);
CREATE INDEX IF NOT EXISTS idx_task_form_fields_form_id ON task_form_fields(form_id);

-- Enable RLS
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_custom_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_positions ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies (matching existing app patterns)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'geofences','task_types','task_custom_statuses','task_forms','task_form_fields',
    'tasks','task_stops','task_form_submissions','stop_form_submissions',
    'task_status_history','task_comments','driver_positions'
  ])
  LOOP
    EXECUTE format('CREATE POLICY "Allow public read on %I" ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow public insert on %I" ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow public update on %I" ON %I FOR UPDATE USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow public delete on %I" ON %I FOR DELETE USING (true)', tbl, tbl);
  END LOOP;
END $$;
