-- Report system tables
-- report_configurations: saved report templates with scheduling
-- report_runs: executed report instances with cached data

-- Report configurations (saved templates)
CREATE TABLE IF NOT EXISTS report_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Report identity
  name TEXT NOT NULL,
  report_type TEXT NOT NULL, -- e.g. 'route_sheet', 'engine_hours', 'fuel_consumption'
  
  -- Device selection
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of traccar device IDs
  all_devices BOOLEAN NOT NULL DEFAULT false,
  
  -- Configuration
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- type-specific settings
  -- e.g. { "hideEmptyRows": true, "showSummary": true, "showSeconds": false, "controlDays": [1,2,3,4,5], "controlTimeFrom": "00:00", "controlTimeTo": "23:59" }
  
  -- Output
  output_format TEXT NOT NULL DEFAULT 'preview', -- 'preview', 'pdf', 'excel'
  locale TEXT NOT NULL DEFAULT 'ro', -- 'ro', 'en', 'de', 'hu' etc.
  
  -- Recurring schedule (optional)
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_cron TEXT, -- cron expression e.g. '0 8 * * 1' (every Monday 8am)
  recurrence_range TEXT, -- 'last_day', 'last_week', 'last_month'
  
  -- Email delivery (optional)
  email_recipients JSONB DEFAULT '[]'::jsonb, -- array of email addresses
  email_subject TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Report runs (execution history with cached data)
CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  configuration_id UUID REFERENCES report_configurations(id) ON DELETE SET NULL,
  
  -- Report identity
  report_type TEXT NOT NULL,
  name TEXT NOT NULL,
  
  -- Time range
  date_from TIMESTAMPTZ NOT NULL,
  date_to TIMESTAMPTZ NOT NULL,
  
  -- Devices
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_names JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "123": "BH38DWX", "456": "BH01DXM" }
  
  -- Cached report data (JSONB so we don't need to re-call Traccar)
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure depends on report_type, e.g. for route_sheet:
  -- { "devices": { "123": { "trips": [...], "summary": {...}, "positions": [...] } } }
  
  -- Configuration snapshot
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  locale TEXT NOT NULL DEFAULT 'ro',
  output_format TEXT NOT NULL DEFAULT 'preview',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed'
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_configurations_admin ON report_configurations(admin_id);
CREATE INDEX IF NOT EXISTS idx_report_runs_admin ON report_runs(admin_id);
CREATE INDEX IF NOT EXISTS idx_report_runs_config ON report_runs(configuration_id);
CREATE INDEX IF NOT EXISTS idx_report_runs_status ON report_runs(status);
CREATE INDEX IF NOT EXISTS idx_report_runs_created ON report_runs(created_at DESC);

-- RLS
ALTER TABLE report_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

-- Policies: admins can only access their own reports
CREATE POLICY "report_configurations_select" ON report_configurations FOR SELECT USING (admin_id = auth.uid());
CREATE POLICY "report_configurations_insert" ON report_configurations FOR INSERT WITH CHECK (admin_id = auth.uid());
CREATE POLICY "report_configurations_update" ON report_configurations FOR UPDATE USING (admin_id = auth.uid());
CREATE POLICY "report_configurations_delete" ON report_configurations FOR DELETE USING (admin_id = auth.uid());

CREATE POLICY "report_runs_select" ON report_runs FOR SELECT USING (admin_id = auth.uid());
CREATE POLICY "report_runs_insert" ON report_runs FOR INSERT WITH CHECK (admin_id = auth.uid());
CREATE POLICY "report_runs_update" ON report_runs FOR UPDATE USING (admin_id = auth.uid());
CREATE POLICY "report_runs_delete" ON report_runs FOR DELETE USING (admin_id = auth.uid());
