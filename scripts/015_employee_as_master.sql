-- ============================================
-- EMPLOYEE AS MASTER - Migration Script
-- Makes employees the single source of truth for all people
-- Keeps drivers table for Driver App compatibility
-- ============================================

-- ============================================
-- STEP 1: Add driver-specific fields to employees table
-- ============================================

-- Driver authentication fields (for Driver App)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_code VARCHAR(6);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'en';

-- Driver App push notifications
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS device_info JSONB;

-- Driver license information
ALTER TABLE employees ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS license_categories TEXT[]; -- e.g., ['B', 'C', 'CE']

-- Driver qualifications
ALTER TABLE employees ADD COLUMN IF NOT EXISTS adr_license_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS adr_license_expiry DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cpc_number TEXT; -- Certificate of Professional Competence
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cpc_expiry DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tacho_card_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tacho_card_expiry DATE;

-- Traccar integration (for GPS tracking)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS traccar_id INTEGER;

-- Legacy driver_id reference (for backward compatibility)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS legacy_driver_id UUID;

-- Create unique index on pin_code (per admin)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_pin_code_unique 
ON employees(admin_id, pin_code) WHERE pin_code IS NOT NULL;

-- ============================================
-- STEP 2: Ensure drivers table has employee_id reference
-- ============================================

-- Add employee_id to drivers if not exists
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Create index for the reference
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id);

-- ============================================
-- STEP 3: Migrate existing drivers to employees (if not already linked)
-- ============================================

-- First, create employee records for drivers that don't have one
INSERT INTO employees (
  admin_id,
  first_name,
  last_name,
  email,
  phone,
  employee_type,
  status,
  pin_code,
  language,
  fcm_token,
  fcm_token_updated_at,
  device_info,
  legacy_driver_id,
  created_at,
  updated_at
)
SELECT 
  d.admin_id,
  SPLIT_PART(d.name, ' ', 1) as first_name,
  COALESCE(NULLIF(SUBSTRING(d.name FROM POSITION(' ' IN d.name) + 1), ''), SPLIT_PART(d.name, ' ', 1)) as last_name,
  d.email,
  d.phone,
  'driver' as employee_type,
  CASE WHEN d.is_active THEN 'active' ELSE 'inactive' END as status,
  d.pin_code,
  COALESCE(d.language, 'en') as language,
  d.fcm_token,
  d.fcm_token_updated_at,
  d.device_info::jsonb,
  d.id as legacy_driver_id,
  d.created_at,
  d.updated_at
FROM drivers d
WHERE d.employee_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.admin_id = d.admin_id 
    AND (e.legacy_driver_id = d.id OR e.pin_code = d.pin_code)
  )
ON CONFLICT DO NOTHING;

-- Link drivers to newly created employees
UPDATE drivers d
SET employee_id = e.id
FROM employees e
WHERE d.employee_id IS NULL
  AND e.legacy_driver_id = d.id;

-- Also link by pin_code if legacy_driver_id didn't match
UPDATE drivers d
SET employee_id = e.id
FROM employees e
WHERE d.employee_id IS NULL
  AND e.admin_id = d.admin_id
  AND e.pin_code = d.pin_code;

-- ============================================
-- STEP 4: Update documents to use employee_id where driver_id exists
-- ============================================

-- First ensure employee_id column exists (from previous migration)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE CASCADE;

-- Migrate documents from driver_id to employee_id
UPDATE documents doc
SET employee_id = d.employee_id
FROM drivers d
WHERE doc.driver_id = d.id
  AND doc.employee_id IS NULL
  AND d.employee_id IS NOT NULL;

-- Create index for employee documents
CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON documents(employee_id);

-- ============================================
-- STEP 5: Update form_submissions to support employee_id
-- ============================================

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Migrate form_submissions driver_id to employee_id
UPDATE form_submissions fs
SET employee_id = d.employee_id
FROM drivers d
WHERE fs.driver_id = d.id
  AND fs.employee_id IS NULL
  AND d.employee_id IS NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_form_submissions_employee_id ON form_submissions(employee_id);

-- ============================================
-- STEP 7: Update inspections to support employee_id
-- ============================================

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Migrate inspections driver_id to employee_id
UPDATE inspections i
SET employee_id = d.employee_id
FROM drivers d
WHERE i.driver_id = d.id
  AND i.employee_id IS NULL
  AND d.employee_id IS NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_inspections_employee_id ON inspections(employee_id);

-- ============================================
-- STEP 8: Update vehicle_usage_sessions to support employee_id
-- ============================================

ALTER TABLE vehicle_usage_sessions ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Migrate vehicle_usage_sessions driver_id to employee_id
UPDATE vehicle_usage_sessions vus
SET employee_id = d.employee_id
FROM drivers d
WHERE vus.driver_id = d.id
  AND vus.employee_id IS NULL
  AND d.employee_id IS NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_vehicle_usage_sessions_employee_id ON vehicle_usage_sessions(employee_id);

-- ============================================
-- STEP 9: Create a view for "drivers" that reads from employees
-- This can be used by admin pages to get drivers data
-- ============================================

CREATE OR REPLACE VIEW driver_employees AS
SELECT 
  e.id,
  e.admin_id,
  CONCAT(e.first_name, ' ', e.last_name) as name,
  e.first_name,
  e.last_name,
  e.email,
  e.phone,
  e.pin_code,
  e.language,
  e.fcm_token,
  e.fcm_token_updated_at,
  e.device_info,
  e.license_number,
  e.license_expiry,
  e.license_categories,
  e.adr_license_number,
  e.adr_license_expiry,
  e.cpc_number,
  e.cpc_expiry,
  e.tacho_card_number,
  e.tacho_card_expiry,
  e.traccar_id,
  e.department_id,
  e.job_title,
  e.hire_date,
  e.profile_photo_url,
  e.address,
  e.city,
  e.country,
  e.emergency_contact_name,
  e.emergency_contact_phone,
  CASE WHEN e.status = 'active' THEN true ELSE false END as is_active,
  e.status,
  e.notes,
  e.created_at,
  e.updated_at,
  e.legacy_driver_id,
  d.id as driver_table_id -- Reference to old drivers table for backward compatibility
FROM employees e
LEFT JOIN drivers d ON d.employee_id = e.id
WHERE e.employee_type = 'driver';

-- ============================================
-- STEP 10: Sync trigger - when employee is updated, sync to drivers table
-- This keeps the Driver App working without changes
-- ============================================

CREATE OR REPLACE FUNCTION sync_employee_to_driver()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if employee is a driver type
  IF NEW.employee_type = 'driver' AND NEW.pin_code IS NOT NULL THEN
    -- Check if driver record exists
    IF EXISTS (SELECT 1 FROM drivers WHERE employee_id = NEW.id) THEN
      -- Update existing driver
      UPDATE drivers SET
        name = CONCAT(NEW.first_name, ' ', NEW.last_name),
        email = NEW.email,
        phone = NEW.phone,
        pin_code = NEW.pin_code,
        language = COALESCE(NEW.language, 'en'),
        is_active = (NEW.status = 'active'),
        fcm_token = NEW.fcm_token,
        fcm_token_updated_at = NEW.fcm_token_updated_at,
        device_info = NEW.device_info::text,
        updated_at = NOW()
      WHERE employee_id = NEW.id;
    ELSE
      -- Create new driver record
      INSERT INTO drivers (
        admin_id,
        name,
        email,
        phone,
        pin_code,
        language,
        is_active,
        fcm_token,
        fcm_token_updated_at,
        device_info,
        employee_id,
        created_at,
        updated_at
      ) VALUES (
        NEW.admin_id,
        CONCAT(NEW.first_name, ' ', NEW.last_name),
        NEW.email,
        NEW.phone,
        NEW.pin_code,
        COALESCE(NEW.language, 'en'),
        (NEW.status = 'active'),
        NEW.fcm_token,
        NEW.fcm_token_updated_at,
        NEW.device_info::text,
        NEW.id,
        NOW(),
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_employee_to_driver ON employees;
CREATE TRIGGER trigger_sync_employee_to_driver
AFTER INSERT OR UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION sync_employee_to_driver();

-- ============================================
-- STEP 11: Reverse sync - when driver is updated (from Driver App), sync to employee
-- ============================================

CREATE OR REPLACE FUNCTION sync_driver_to_employee()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if driver has employee_id
  IF NEW.employee_id IS NOT NULL THEN
    UPDATE employees SET
      fcm_token = NEW.fcm_token,
      fcm_token_updated_at = NEW.fcm_token_updated_at,
      device_info = NEW.device_info::jsonb,
      updated_at = NOW()
    WHERE id = NEW.employee_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_driver_to_employee ON drivers;
CREATE TRIGGER trigger_sync_driver_to_employee
AFTER UPDATE ON drivers
FOR EACH ROW
WHEN (OLD.fcm_token IS DISTINCT FROM NEW.fcm_token OR OLD.device_info IS DISTINCT FROM NEW.device_info)
EXECUTE FUNCTION sync_driver_to_employee();

-- ============================================
-- VERIFICATION: Show migration results
-- ============================================
SELECT 
  'Drivers' as table_name,
  COUNT(*) as total_rows,
  COUNT(employee_id) as linked_to_employee
FROM drivers
UNION ALL
SELECT 
  'Employees (drivers)' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) as linked_to_employee
FROM employees WHERE employee_type = 'driver'
UNION ALL
SELECT 
  'Documents with employee_id' as table_name,
  COUNT(*) as total_rows,
  COUNT(employee_id) as with_employee_id
FROM documents;
