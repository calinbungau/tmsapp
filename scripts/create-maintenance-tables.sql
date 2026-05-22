-- Maintenance System Tables

-- Extend vehicles table with Traccar device_id
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS traccar_device_id TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_odometer BIGINT DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_engine_hours BIGINT DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS odometer_updated_at TIMESTAMPTZ;

-- Maintenance Types (Templates for maintenance tasks)
CREATE TABLE IF NOT EXISTS maintenance_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Service interval flags (can select multiple)
  interval_by_date BOOLEAN DEFAULT false,
  interval_by_mileage BOOLEAN DEFAULT false,
  interval_by_engine_hours BOOLEAN DEFAULT false,
  -- Date interval settings
  date_interval_months INTEGER, -- e.g., every 6 months
  date_remind_days INTEGER DEFAULT 7, -- remind X days before due
  -- Mileage interval settings
  mileage_interval_km INTEGER, -- e.g., every 10000 km
  mileage_remind_km INTEGER DEFAULT 500, -- remind X km before due
  -- Engine hours interval settings
  engine_hours_interval INTEGER, -- e.g., every 500 hours
  engine_hours_remind INTEGER DEFAULT 50, -- remind X hours before due
  -- Auto repeat when completed
  auto_repeat BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notification emails for maintenance types
CREATE TABLE IF NOT EXISTS maintenance_notification_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_type_id UUID NOT NULL REFERENCES maintenance_types(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Maintenance Records (Scheduled/Due/Completed maintenance for specific vehicles)
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_type_id UUID NOT NULL REFERENCES maintenance_types(id) ON DELETE CASCADE,
  -- Status: scheduled, due, completed, expired
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'due', 'completed', 'expired')),
  -- Due conditions (based on what was selected in maintenance type)
  due_date DATE,
  due_mileage_km BIGINT,
  due_engine_hours BIGINT,
  -- Reminder dates/values
  remind_date DATE,
  remind_mileage_km BIGINT,
  remind_engine_hours BIGINT,
  -- Starting values when this maintenance was scheduled
  starting_odometer BIGINT,
  starting_engine_hours BIGINT,
  starting_date DATE,
  -- Completion details
  completed_at TIMESTAMPTZ,
  completed_odometer BIGINT,
  completed_engine_hours BIGINT,
  -- Cost and invoice
  cost DECIMAL(10, 2),
  cost_currency TEXT DEFAULT 'EUR',
  invoice_url TEXT,
  invoice_number TEXT,
  notes TEXT,
  -- Notification tracking
  reminder_sent_at TIMESTAMPTZ,
  due_notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Maintenance cost history (for detailed cost tracking)
CREATE TABLE IF NOT EXISTS maintenance_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_record_id UUID NOT NULL REFERENCES maintenance_records(id) ON DELETE CASCADE,
  description TEXT,
  cost DECIMAL(10, 2) NOT NULL,
  cost_currency TEXT DEFAULT 'EUR',
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admin settings for Traccar integration
ALTER TABLE admins ADD COLUMN IF NOT EXISTS traccar_url TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS traccar_token TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_maintenance_types_admin ON maintenance_types(admin_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_admin ON maintenance_records(admin_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_vehicle ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_status ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_due_date ON maintenance_records(due_date);
CREATE INDEX IF NOT EXISTS idx_vehicles_traccar_device ON vehicles(traccar_device_id);

-- Enable RLS
ALTER TABLE maintenance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_notification_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance_types
CREATE POLICY "maintenance_types_select" ON maintenance_types FOR SELECT USING (true);
CREATE POLICY "maintenance_types_insert" ON maintenance_types FOR INSERT WITH CHECK (true);
CREATE POLICY "maintenance_types_update" ON maintenance_types FOR UPDATE USING (true);
CREATE POLICY "maintenance_types_delete" ON maintenance_types FOR DELETE USING (true);

-- RLS Policies for maintenance_notification_emails
CREATE POLICY "maintenance_notification_emails_select" ON maintenance_notification_emails FOR SELECT USING (true);
CREATE POLICY "maintenance_notification_emails_insert" ON maintenance_notification_emails FOR INSERT WITH CHECK (true);
CREATE POLICY "maintenance_notification_emails_update" ON maintenance_notification_emails FOR UPDATE USING (true);
CREATE POLICY "maintenance_notification_emails_delete" ON maintenance_notification_emails FOR DELETE USING (true);

-- RLS Policies for maintenance_records
CREATE POLICY "maintenance_records_select" ON maintenance_records FOR SELECT USING (true);
CREATE POLICY "maintenance_records_insert" ON maintenance_records FOR INSERT WITH CHECK (true);
CREATE POLICY "maintenance_records_update" ON maintenance_records FOR UPDATE USING (true);
CREATE POLICY "maintenance_records_delete" ON maintenance_records FOR DELETE USING (true);

-- RLS Policies for maintenance_costs
CREATE POLICY "maintenance_costs_select" ON maintenance_costs FOR SELECT USING (true);
CREATE POLICY "maintenance_costs_insert" ON maintenance_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "maintenance_costs_update" ON maintenance_costs FOR UPDATE USING (true);
CREATE POLICY "maintenance_costs_delete" ON maintenance_costs FOR DELETE USING (true);
