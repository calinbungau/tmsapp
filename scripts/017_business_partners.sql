-- ============================================
-- Business Partners Master Data
-- Types: shipper, carrier, forwarder, vendor (multi-select)
-- ============================================

-- Create business_partners table
CREATE TABLE IF NOT EXISTS business_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Basic Info
  name TEXT NOT NULL,
  types TEXT[] NOT NULL DEFAULT '{}', -- Array: shipper, carrier, forwarder, vendor
  
  -- Legal / Tax Info
  tax_id TEXT,
  vat_number TEXT,
  registration_number TEXT,
  
  -- Contact Info
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  
  -- Billing Address (if different)
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state_province TEXT,
  billing_postal_code TEXT,
  billing_country TEXT,
  
  -- Banking / Payment
  payment_terms TEXT, -- e.g., 'net_30', 'net_60', 'immediate'
  credit_limit DECIMAL(12,2),
  bank_name TEXT,
  bank_account_number TEXT,
  bank_iban TEXT,
  bank_swift TEXT,
  
  -- Contract Info
  contract_start_date DATE,
  contract_end_date DATE,
  contract_notes TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_business_partners_admin_id ON business_partners(admin_id);
CREATE INDEX IF NOT EXISTS idx_business_partners_types ON business_partners USING GIN(types);
CREATE INDEX IF NOT EXISTS idx_business_partners_name ON business_partners(name);
CREATE INDEX IF NOT EXISTS idx_business_partners_is_active ON business_partners(is_active);

-- Enable RLS
ALTER TABLE business_partners ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admins can view own business partners" ON business_partners;
CREATE POLICY "Admins can view own business partners" ON business_partners
  FOR SELECT USING (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admins can insert own business partners" ON business_partners;
CREATE POLICY "Admins can insert own business partners" ON business_partners
  FOR INSERT WITH CHECK (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admins can update own business partners" ON business_partners;
CREATE POLICY "Admins can update own business partners" ON business_partners
  FOR UPDATE USING (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admins can delete own business partners" ON business_partners;
CREATE POLICY "Admins can delete own business partners" ON business_partners
  FOR DELETE USING (admin_id = current_setting('app.admin_id', true)::uuid);

-- Service role bypass
DROP POLICY IF EXISTS "Service role has full access to business_partners" ON business_partners;
CREATE POLICY "Service role has full access to business_partners" ON business_partners
  FOR ALL USING (current_setting('role', true) = 'service_role');

-- ============================================
-- Update drivers table to link to business partners
-- ============================================

-- Add business_partner_id to drivers (for subcontractors)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS business_partner_id UUID REFERENCES business_partners(id) ON DELETE SET NULL;

-- Add is_subcontractor flag if not exists
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_subcontractor BOOLEAN NOT NULL DEFAULT false;

-- Create index
CREATE INDEX IF NOT EXISTS idx_drivers_business_partner_id ON drivers(business_partner_id);
CREATE INDEX IF NOT EXISTS idx_drivers_is_subcontractor ON drivers(is_subcontractor);

-- ============================================
-- Enable realtime for business_partners
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'business_partners'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE business_partners;
  END IF;
END $$;
