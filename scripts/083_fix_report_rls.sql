-- Fix report table RLS to use service_role pattern (matching existing app pattern)
-- The app uses server-side API routes with admin_id params, not Supabase Auth

-- Drop existing auth.uid() policies
DROP POLICY IF EXISTS "report_configurations_select" ON report_configurations;
DROP POLICY IF EXISTS "report_configurations_insert" ON report_configurations;
DROP POLICY IF EXISTS "report_configurations_update" ON report_configurations;
DROP POLICY IF EXISTS "report_configurations_delete" ON report_configurations;

DROP POLICY IF EXISTS "report_runs_select" ON report_runs;
DROP POLICY IF EXISTS "report_runs_insert" ON report_runs;
DROP POLICY IF EXISTS "report_runs_update" ON report_runs;
DROP POLICY IF EXISTS "report_runs_delete" ON report_runs;

-- Allow service_role full access (server-side API routes)
CREATE POLICY "report_configurations_service" ON report_configurations
  FOR ALL USING (current_setting('role', true) = 'service_role');

CREATE POLICY "report_runs_service" ON report_runs
  FOR ALL USING (current_setting('role', true) = 'service_role');
