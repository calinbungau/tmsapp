-- Migration: Add integrations table for billing systems (Smartbill, FGO, etc.)
-- Run this script to set up the integrations infrastructure

-- Create integrations table for storing billing system credentials
CREATE TABLE IF NOT EXISTS billing_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('smartbill', 'fgo', 'saga', 'oblio')),
  
  -- Common fields
  is_active BOOLEAN DEFAULT false,
  display_name TEXT, -- e.g., "SmartBill Production"
  
  -- Smartbill specific
  smartbill_email TEXT,
  smartbill_token TEXT, -- API token (encrypted in production)
  smartbill_cif TEXT, -- Company VAT code (CIF)
  smartbill_default_series TEXT, -- Default invoice series
  smartbill_default_vat_rate DECIMAL(5,2) DEFAULT 19.00,
  
  -- FGO specific (for future)
  fgo_api_key TEXT,
  fgo_company_id TEXT,
  
  -- Sync settings
  auto_sync_invoices BOOLEAN DEFAULT false,
  sync_on_status TEXT DEFAULT 'sent', -- When to sync: 'draft', 'sent', 'paid'
  
  -- Last sync info
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(admin_id, provider)
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_billing_integrations_admin ON billing_integrations(admin_id);
CREATE INDEX IF NOT EXISTS idx_billing_integrations_provider ON billing_integrations(provider);

-- Create table for Smartbill invoice series (synced from Smartbill API)
CREATE TABLE IF NOT EXISTS smartbill_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES billing_integrations(id) ON DELETE CASCADE,
  
  series_name TEXT NOT NULL,
  series_type TEXT NOT NULL CHECK (series_type IN ('invoice', 'proforma', 'receipt')),
  next_number INTEGER,
  is_default BOOLEAN DEFAULT false,
  
  -- Sync info
  synced_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(integration_id, series_name, series_type)
);

CREATE INDEX IF NOT EXISTS idx_smartbill_series_integration ON smartbill_series(integration_id);

-- Create table for synced invoice records (to track what was sent to Smartbill)
CREATE TABLE IF NOT EXISTS invoice_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_invoice_id UUID NOT NULL REFERENCES order_invoices(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES billing_integrations(id) ON DELETE CASCADE,
  
  -- Smartbill response data
  external_number TEXT, -- The number assigned by Smartbill
  external_series TEXT,
  external_url TEXT, -- Link to invoice in Smartbill
  pdf_url TEXT, -- Cached PDF URL
  
  -- Sync status
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'error', 'cancelled')),
  sync_error TEXT,
  synced_at TIMESTAMPTZ,
  
  -- E-factura status (for Romanian compliance)
  efactura_status TEXT,
  efactura_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(order_invoice_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_sync_log_invoice ON invoice_sync_log(order_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_sync_log_integration ON invoice_sync_log(integration_id);

-- Add integration reference columns to order_invoices (if not exists from previous migration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'order_invoices' 
                 AND column_name = 'smartbill_number') THEN
    ALTER TABLE order_invoices ADD COLUMN smartbill_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'order_invoices' 
                 AND column_name = 'smartbill_series') THEN
    ALTER TABLE order_invoices ADD COLUMN smartbill_series TEXT;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE billing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartbill_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for billing_integrations
DROP POLICY IF EXISTS "Admin can view own integrations" ON billing_integrations;
CREATE POLICY "Admin can view own integrations" ON billing_integrations
  FOR SELECT USING (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admin can insert own integrations" ON billing_integrations;
CREATE POLICY "Admin can insert own integrations" ON billing_integrations
  FOR INSERT WITH CHECK (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admin can update own integrations" ON billing_integrations;
CREATE POLICY "Admin can update own integrations" ON billing_integrations
  FOR UPDATE USING (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admin can delete own integrations" ON billing_integrations;
CREATE POLICY "Admin can delete own integrations" ON billing_integrations
  FOR DELETE USING (admin_id = current_setting('app.admin_id', true)::uuid);

-- RLS Policies for smartbill_series
DROP POLICY IF EXISTS "Admin can view own series" ON smartbill_series;
CREATE POLICY "Admin can view own series" ON smartbill_series
  FOR SELECT USING (admin_id = current_setting('app.admin_id', true)::uuid);

DROP POLICY IF EXISTS "Admin can manage own series" ON smartbill_series;
CREATE POLICY "Admin can manage own series" ON smartbill_series
  FOR ALL USING (admin_id = current_setting('app.admin_id', true)::uuid);

-- RLS Policies for invoice_sync_log
DROP POLICY IF EXISTS "Admin can view own sync logs" ON invoice_sync_log;
CREATE POLICY "Admin can view own sync logs" ON invoice_sync_log
  FOR SELECT USING (
    integration_id IN (
      SELECT id FROM billing_integrations 
      WHERE admin_id = current_setting('app.admin_id', true)::uuid
    )
  );

DROP POLICY IF EXISTS "Admin can manage own sync logs" ON invoice_sync_log;
CREATE POLICY "Admin can manage own sync logs" ON invoice_sync_log
  FOR ALL USING (
    integration_id IN (
      SELECT id FROM billing_integrations 
      WHERE admin_id = current_setting('app.admin_id', true)::uuid
    )
  );

-- Grant permissions
GRANT ALL ON billing_integrations TO authenticated;
GRANT ALL ON smartbill_series TO authenticated;
GRANT ALL ON invoice_sync_log TO authenticated;
