-- Create maintenance_types table
CREATE TABLE IF NOT EXISTS maintenance_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  service_interval_types TEXT[] DEFAULT '{}',
  interval_days INTEGER,
  remind_days_before INTEGER,
  interval_mileage INTEGER,
  remind_mileage_before INTEGER,
  interval_engine_hours INTEGER,
  remind_engine_hours_before INTEGER,
  auto_repeat BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create maintenance_notification_emails table
CREATE TABLE IF NOT EXISTS maintenance_notification_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_type_id UUID NOT NULL REFERENCES maintenance_types(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create maintenance_records table
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_type_id UUID NOT NULL REFERENCES maintenance_types(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'due', 'completed', 'expired')),
  scheduled_date DATE,
  due_mileage INTEGER,
  due_engine_hours INTEGER,
  completed_date DATE,
  completed_mileage INTEGER,
  completed_engine_hours INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create maintenance_costs table
CREATE TABLE IF NOT EXISTS maintenance_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_record_id UUID NOT NULL REFERENCES maintenance_records(id) ON DELETE CASCADE,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE maintenance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_notification_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance_types
DROP POLICY IF EXISTS "Admins can manage their maintenance types" ON maintenance_types;
CREATE POLICY "Admins can manage their maintenance types" ON maintenance_types
  FOR ALL USING (admin_id = auth.uid() OR admin_id IN (SELECT id FROM admins));

-- RLS Policies for maintenance_notification_emails
DROP POLICY IF EXISTS "Admins can manage notification emails" ON maintenance_notification_emails;
CREATE POLICY "Admins can manage notification emails" ON maintenance_notification_emails
  FOR ALL USING (maintenance_type_id IN (SELECT id FROM maintenance_types));

-- RLS Policies for maintenance_records
DROP POLICY IF EXISTS "Admins can manage their maintenance records" ON maintenance_records;
CREATE POLICY "Admins can manage their maintenance records" ON maintenance_records
  FOR ALL USING (admin_id = auth.uid() OR admin_id IN (SELECT id FROM admins));

-- RLS Policies for maintenance_costs
DROP POLICY IF EXISTS "Admins can manage maintenance costs" ON maintenance_costs;
CREATE POLICY "Admins can manage maintenance costs" ON maintenance_costs
  FOR ALL USING (maintenance_record_id IN (SELECT id FROM maintenance_records));
