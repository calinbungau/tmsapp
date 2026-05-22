-- Fix RLS for cron_logs table to allow unrestricted access

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all operations on cron_logs" ON cron_logs;

-- Disable RLS (simplest approach for internal logs table)
ALTER TABLE cron_logs DISABLE ROW LEVEL SECURITY;

-- Or if you want to keep RLS enabled but allow all operations:
-- ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all operations on cron_logs" ON cron_logs FOR ALL USING (true) WITH CHECK (true);
