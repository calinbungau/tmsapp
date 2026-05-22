-- ============================================
-- CLEAN ARCHITECTURE: Drivers + Employees as separate masters
-- ============================================
-- drivers table = Master for Driver App (employee drivers + subcontractors)
-- employees table = Master for HR/Internal staff
-- Documents: driver_id for drivers, employee_id for non-driver employees only

-- ============================================
-- STEP 1: Remove sync triggers (no automatic sync between tables)
-- ============================================

DROP TRIGGER IF EXISTS trigger_sync_employee_to_driver ON employees;
DROP TRIGGER IF EXISTS trigger_sync_driver_to_employee ON drivers;
DROP FUNCTION IF EXISTS sync_employee_to_driver();
DROP FUNCTION IF EXISTS sync_driver_to_employee();

-- ============================================
-- STEP 2: Drop the driver_employees view (drivers table is master for drivers)
-- ============================================

DROP VIEW IF EXISTS driver_employees;

-- ============================================
-- STEP 3: Add subcontractor support to drivers table
-- ============================================

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_subcontractor BOOLEAN DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS company_name_subcontractor TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS notes TEXT;

-- Keep employee_id for linking employee drivers (nullable for subcontractors)
-- drivers.employee_id already exists from previous migration

-- ============================================
-- STEP 4: Update drivers table to have all necessary driver fields
-- ============================================

-- License information (for all drivers)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_categories TEXT[];

-- ADR/Dangerous goods
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS adr_certificate_number TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS adr_expiry DATE;

-- Medical
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS medical_certificate_expiry DATE;

-- Tachograph/Digital driver card
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS driver_card_number TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS driver_card_expiry DATE;

-- Emergency contact
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Address
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Status (for both employee and subcontractor drivers)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated'));

-- ============================================
-- STEP 5: Clean up documents - ensure proper linking
-- ============================================

-- Documents should use:
-- driver_id for ALL drivers (employee or subcontractor)
-- employee_id for non-driver employees ONLY (office staff, mechanics)

-- Add comment for documentation
COMMENT ON COLUMN documents.driver_id IS 'Links to drivers table - used for ALL driver documents (employee drivers and subcontractors)';
COMMENT ON COLUMN documents.employee_id IS 'Links to employees table - used ONLY for non-driver employee documents (office staff)';

-- ============================================
-- STEP 6: Clean up employees table - remove driver-specific fields
-- We keep employee_type as it's useful for categorization
-- ============================================

-- These fields should be on drivers table, not employees
-- We'll keep them for now but they won't be used for drivers

COMMENT ON COLUMN employees.employee_type IS 'Employee type: office, driver (linked to drivers table), mechanic, etc.';

-- ============================================
-- STEP 7: Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_drivers_is_subcontractor ON drivers(is_subcontractor);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX IF NOT EXISTS idx_drivers_license_expiry ON drivers(license_expiry);
CREATE INDEX IF NOT EXISTS idx_drivers_adr_expiry ON drivers(adr_expiry);
CREATE INDEX IF NOT EXISTS idx_drivers_medical_certificate_expiry ON drivers(medical_certificate_expiry);
CREATE INDEX IF NOT EXISTS idx_drivers_driver_card_expiry ON drivers(driver_card_expiry);

-- ============================================
-- STEP 8: Update existing drivers - migrate data from linked employees
-- ============================================

UPDATE drivers d
SET 
  license_number = COALESCE(d.license_number, e.license_number),
  license_expiry = COALESCE(d.license_expiry, e.license_expiry),
  status = CASE 
    WHEN e.status = 'active' AND d.is_active = true THEN 'active'
    WHEN e.status = 'inactive' OR d.is_active = false THEN 'inactive'
    ELSE 'active'
  END
FROM employees e
WHERE d.employee_id = e.id
  AND d.employee_id IS NOT NULL;

-- ============================================
-- DONE
-- ============================================
-- Architecture:
-- - drivers = all Driver App users (employee drivers + subcontractors)
-- - employees = HR/internal staff (office, mechanics, etc.)
-- - For employee drivers: exists in BOTH tables, linked via drivers.employee_id
-- - Documents: driver_id for drivers, employee_id for non-driver employees
