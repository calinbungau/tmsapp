-- Add online tracking columns to drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;

-- Stop status history for audit trail
CREATE TABLE IF NOT EXISTS stop_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL REFERENCES task_stops(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  changed_by_type TEXT DEFAULT 'system' CHECK (changed_by_type IN ('driver','admin','system')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stop_status_history_stop ON stop_status_history(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_status_history_task ON stop_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_drivers_is_online ON drivers(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_drivers_admin_online ON drivers(admin_id) WHERE is_online = true;

ALTER TABLE stop_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stop_status_history_all" ON stop_status_history FOR ALL USING (true) WITH CHECK (true);
