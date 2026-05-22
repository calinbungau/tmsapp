-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  is_active BOOLEAN DEFAULT true,
  storage_folder TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add admin_id to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

-- Add admin_id to vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

-- Add admin_id to inspections table
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id);

-- Create indexes for admin_id
CREATE INDEX IF NOT EXISTS idx_drivers_admin_id ON drivers(admin_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_admin_id ON vehicles(admin_id);
CREATE INDEX IF NOT EXISTS idx_inspections_admin_id ON inspections(admin_id);

-- Create a default admin account (password: admin123)
-- Using a simple hash for demo - in production use bcrypt
INSERT INTO admins (id, email, password_hash, name, company_name, storage_folder)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin@example.com',
  'admin123',
  'Default Admin',
  'Demo Company',
  'admin-a0000000'
) ON CONFLICT (email) DO NOTHING;

-- Update existing records to belong to default admin
UPDATE drivers SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;
UPDATE vehicles SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;
UPDATE inspections SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;

-- Drop old admin_settings table (no longer needed)
DROP TABLE IF EXISTS admin_settings;
