-- Fix RLS policies for business_partners table
-- Use the same pattern as other tables (allow public access, filter by admin_id in queries)

-- Drop the restrictive policies
DROP POLICY IF EXISTS "Admins can view own business partners" ON business_partners;
DROP POLICY IF EXISTS "Admins can insert own business partners" ON business_partners;
DROP POLICY IF EXISTS "Admins can update own business partners" ON business_partners;
DROP POLICY IF EXISTS "Admins can delete own business partners" ON business_partners;
DROP POLICY IF EXISTS "Service role has full access to business_partners" ON business_partners;

-- Create permissive policies (same pattern as other tables)
CREATE POLICY "Allow public read on business_partners" ON business_partners FOR SELECT USING (true);
CREATE POLICY "Allow public insert on business_partners" ON business_partners FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on business_partners" ON business_partners FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on business_partners" ON business_partners FOR DELETE USING (true);
