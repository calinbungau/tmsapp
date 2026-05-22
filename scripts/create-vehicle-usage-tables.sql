-- Vehicle Usage / Check-in Check-out System
-- Tracks which driver is assigned to which vehicle and usage history

-- Vehicle usage sessions table
CREATE TABLE IF NOT EXISTS vehicle_usage_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  
  -- Check-in details
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_in_odometer INTEGER,
  check_in_notes TEXT,
  
  -- Check-out details (null if still active)
  check_out_time TIMESTAMPTZ,
  check_out_odometer INTEGER,
  check_out_notes TEXT,
  
  -- Status: active, completed, auto_continued (when driver confirms next day)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'auto_continued')),
  
  -- For tracking when driver was prompted about continuing session
  last_continuation_prompt TIMESTAMPTZ,
  continuation_confirmed BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding active sessions
CREATE INDEX IF NOT EXISTS idx_vehicle_usage_active ON vehicle_usage_sessions(vehicle_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_vehicle_usage_driver ON vehicle_usage_sessions(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_usage_admin ON vehicle_usage_sessions(admin_id);

-- Function to check if vehicle is available (no active session)
CREATE OR REPLACE FUNCTION is_vehicle_available(p_vehicle_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM vehicle_usage_sessions 
    WHERE vehicle_id = p_vehicle_id AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get current driver for a vehicle
CREATE OR REPLACE FUNCTION get_current_vehicle_driver(p_vehicle_id UUID)
RETURNS UUID AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  SELECT driver_id INTO v_driver_id
  FROM vehicle_usage_sessions
  WHERE vehicle_id = p_vehicle_id AND status = 'active'
  LIMIT 1;
  
  RETURN v_driver_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE vehicle_usage_sessions ENABLE ROW LEVEL SECURITY;

-- Unrestricted policy (like other tables in this app)
DROP POLICY IF EXISTS "Unrestricted access to vehicle_usage_sessions" ON vehicle_usage_sessions;
CREATE POLICY "Unrestricted access to vehicle_usage_sessions" ON vehicle_usage_sessions
FOR ALL USING (true) WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_vehicle_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vehicle_usage_sessions_updated_at ON vehicle_usage_sessions;
CREATE TRIGGER vehicle_usage_sessions_updated_at
  BEFORE UPDATE ON vehicle_usage_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_usage_updated_at();
