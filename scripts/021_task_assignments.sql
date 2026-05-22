-- Task assignments junction table for multi-driver/multi-vehicle support
CREATE TABLE IF NOT EXISTS task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  is_primary BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'declined', 'completed')),
  UNIQUE(task_id, driver_id),
  UNIQUE(task_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_driver ON task_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_vehicle ON task_assignments(vehicle_id);

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_assignments_all" ON task_assignments FOR ALL USING (true) WITH CHECK (true);
