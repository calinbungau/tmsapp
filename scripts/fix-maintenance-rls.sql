-- Disable RLS on maintenance tables to allow unrestricted access
-- (Authentication is handled at the application level)

ALTER TABLE maintenance_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_notification_emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_costs DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Admins can manage their maintenance types" ON maintenance_types;
DROP POLICY IF EXISTS "Admins can manage notification emails" ON maintenance_notification_emails;
DROP POLICY IF EXISTS "Admins can manage maintenance records" ON maintenance_records;
DROP POLICY IF EXISTS "Admins can manage maintenance costs" ON maintenance_costs;
