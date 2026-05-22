-- TMS Order Enhancements: status history, per-stop forms, form submissions

-- 1. Add form_id to order_stops for per-stop custom form assignment
ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES task_forms(id) ON DELETE SET NULL;

-- 2. Order status history table (mirrors task_status_history)
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  changed_by_type TEXT DEFAULT 'admin',
  notes TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_status_history_all ON order_status_history;
CREATE POLICY order_status_history_all ON order_status_history FOR ALL USING (true) WITH CHECK (true);

-- 3. Order stop form submissions (mirrors stop_form_submissions)
CREATE TABLE IF NOT EXISTS order_stop_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stop_id UUID NOT NULL REFERENCES order_stops(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES task_forms(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}',
  submitted_by UUID,
  submitted_by_type TEXT DEFAULT 'driver',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_stop_form_subs_order ON order_stop_form_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_stop_form_subs_stop ON order_stop_form_submissions(stop_id);

ALTER TABLE order_stop_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_stop_form_subs_all ON order_stop_form_submissions;
CREATE POLICY order_stop_form_subs_all ON order_stop_form_submissions FOR ALL USING (true) WITH CHECK (true);
