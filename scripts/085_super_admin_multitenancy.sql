-- Add super_admin column to admins table for multi-tenancy management
-- Only super admins can create and manage other admin accounts

-- Add is_super_admin column
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Add subscription/plan fields for future billing
ALTER TABLE admins ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS max_vehicles INTEGER DEFAULT 10;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS max_drivers INTEGER DEFAULT 10;

-- Add contact fields
ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS vat_number TEXT;

-- Add status field
ALTER TABLE admins ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_admins_is_super_admin ON admins(is_super_admin) WHERE is_super_admin = true;
CREATE INDEX IF NOT EXISTS idx_admins_status ON admins(status);

-- Set existing admin as super admin (the first admin account)
UPDATE admins 
SET is_super_admin = true 
WHERE email = 'admin@example.com' 
   OR id = (SELECT id FROM admins ORDER BY created_at ASC LIMIT 1);

-- Comment: Super admins can see and manage all tenant admin accounts
-- Regular admins can only see/manage their own tenant's data
