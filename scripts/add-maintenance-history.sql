-- Maintenance Activity Log (tracks all changes to maintenance records)
CREATE TABLE IF NOT EXISTS maintenance_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_record_id UUID NOT NULL REFERENCES maintenance_records(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'status_changed', 'assigned', 'scheduled', 'cost_added', 'completed', 'note_added'
  old_value JSONB,
  new_value JSONB,
  performed_by_type TEXT, -- 'admin', 'driver', 'system'
  performed_by_id UUID,
  performed_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add photos array to maintenance_costs
ALTER TABLE maintenance_costs ADD COLUMN IF NOT EXISTS photos TEXT[];

-- Add completed_date to maintenance_records if not exists
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS completed_date DATE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_activity_log_record ON maintenance_activity_log(maintenance_record_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_activity_log_created ON maintenance_activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE maintenance_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "maintenance_activity_log_select" ON maintenance_activity_log;
DROP POLICY IF EXISTS "maintenance_activity_log_insert" ON maintenance_activity_log;

CREATE POLICY "maintenance_activity_log_select" ON maintenance_activity_log FOR SELECT USING (true);
CREATE POLICY "maintenance_activity_log_insert" ON maintenance_activity_log FOR INSERT WITH CHECK (true);

-- Enable realtime for activity log
ALTER PUBLICATION supabase_realtime ADD TABLE maintenance_activity_log;
