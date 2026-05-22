-- Create cron_logs table for tracking background job executions
CREATE TABLE IF NOT EXISTS cron_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  job_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(50) NOT NULL, -- 'maintenance_check', 'notification_send', etc.
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  records_processed INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_cron_logs_admin_id ON cron_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_cron_logs_job_type ON cron_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON cron_logs(status);
CREATE INDEX IF NOT EXISTS idx_cron_logs_started_at ON cron_logs(started_at DESC);

-- Enable RLS
ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;

-- Allow unrestricted access (for API routes)
DROP POLICY IF EXISTS "Allow all operations on cron_logs" ON cron_logs;
CREATE POLICY "Allow all operations on cron_logs" ON cron_logs
  FOR ALL USING (true) WITH CHECK (true);

-- Add current_odometer and current_engine_hours to maintenance_records for tracking
ALTER TABLE maintenance_records 
ADD COLUMN IF NOT EXISTS current_odometer INTEGER,
ADD COLUMN IF NOT EXISTS current_engine_hours INTEGER,
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
