-- ============================================
-- EMPLOYEES & ROLES SYSTEM SCHEMA
-- Part 1: Departments, Employees, Roles, Permissions
-- ============================================

-- ============================================
-- DEPARTMENTS (for organizational hierarchy)
-- ============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  parent_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  manager_employee_id UUID, -- Will be set after employees table is created
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, name)
);

-- ============================================
-- EMPLOYEES (the "people" table)
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Personal Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  date_of_birth DATE,
  profile_photo_url TEXT,
  
  -- Employment Information
  employee_number TEXT, -- e.g., EMP-001
  employee_type TEXT NOT NULL DEFAULT 'office' CHECK (employee_type IN ('driver', 'office', 'field', 'contractor')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  job_title TEXT,
  hire_date DATE,
  termination_date DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'terminated')),
  
  -- Emergency Contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Metadata
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(admin_id, employee_number)
);

-- Add manager reference to departments
ALTER TABLE departments 
ADD CONSTRAINT fk_departments_manager 
FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ============================================
-- ROLES (per-tenant customizable roles)
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Is this a system-defined role that cannot be deleted?
  is_system_role BOOLEAN DEFAULT false,
  
  -- Color for UI display
  color TEXT DEFAULT '#6b7280',
  
  -- Permissions stored as JSONB for flexibility
  -- Format: { "module.action": true/false }
  -- e.g., { "forms:view": true, "forms:create": true, "maintenance:view": true, "maintenance:costs:view": false }
  permissions JSONB NOT NULL DEFAULT '{}',
  
  -- Role hierarchy (lower number = more permissions)
  hierarchy_level INTEGER DEFAULT 100,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(admin_id, name)
);

-- ============================================
-- PERMISSION DEFINITIONS (master list of all permissions)
-- ============================================
CREATE TABLE IF NOT EXISTS permission_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Permission key in dot notation: module.submodule.action
  permission_key TEXT UNIQUE NOT NULL,
  
  -- Human readable
  name TEXT NOT NULL,
  description TEXT,
  
  -- Module grouping for UI
  module TEXT NOT NULL,
  sub_module TEXT,
  
  -- Order for display
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default permission definitions
INSERT INTO permission_definitions (permission_key, name, description, module, sub_module, display_order) VALUES
  -- Forms Module
  ('forms:view', 'View Forms', 'View form submissions', 'Forms', NULL, 10),
  ('forms:create', 'Create Forms', 'Submit new forms', 'Forms', NULL, 20),
  ('forms:edit', 'Edit Forms', 'Edit form submissions', 'Forms', NULL, 30),
  ('forms:delete', 'Delete Forms', 'Delete form submissions', 'Forms', NULL, 40),
  ('forms:export', 'Export Forms', 'Export form data', 'Forms', NULL, 50),
  ('forms:types:manage', 'Manage Form Types', 'Create and edit form templates', 'Forms', 'Types', 60),
  
  -- Documents Module
  ('documents:view', 'View Documents', 'View documents', 'Documents', NULL, 10),
  ('documents:create', 'Create Documents', 'Upload new documents', 'Documents', NULL, 20),
  ('documents:edit', 'Edit Documents', 'Edit document details', 'Documents', NULL, 30),
  ('documents:delete', 'Delete Documents', 'Delete documents', 'Documents', NULL, 40),
  ('documents:types:manage', 'Manage Document Types', 'Create and edit document types', 'Documents', 'Types', 50),
  
  -- Maintenance Module
  ('maintenance:view', 'View Maintenance', 'View maintenance records', 'Maintenance', NULL, 10),
  ('maintenance:create', 'Create Maintenance', 'Create maintenance tasks', 'Maintenance', NULL, 20),
  ('maintenance:edit', 'Edit Maintenance', 'Edit maintenance records', 'Maintenance', NULL, 30),
  ('maintenance:delete', 'Delete Maintenance', 'Delete maintenance records', 'Maintenance', NULL, 40),
  ('maintenance:complete', 'Complete Maintenance', 'Mark maintenance as complete', 'Maintenance', NULL, 50),
  ('maintenance:costs:view', 'View Costs', 'View maintenance costs', 'Maintenance', 'Costs', 60),
  ('maintenance:costs:edit', 'Edit Costs', 'Edit maintenance costs', 'Maintenance', 'Costs', 70),
  ('maintenance:types:manage', 'Manage Maintenance Types', 'Create and edit maintenance types', 'Maintenance', 'Types', 80),
  
  -- Master Data - Vehicles
  ('vehicles:view', 'View Vehicles', 'View vehicle list and details', 'Master Data', 'Vehicles', 10),
  ('vehicles:create', 'Create Vehicles', 'Add new vehicles', 'Master Data', 'Vehicles', 20),
  ('vehicles:edit', 'Edit Vehicles', 'Edit vehicle details', 'Master Data', 'Vehicles', 30),
  ('vehicles:delete', 'Delete Vehicles', 'Delete vehicles', 'Master Data', 'Vehicles', 40),
  ('vehicles:usage:view', 'View Vehicle Usage', 'View vehicle usage history', 'Master Data', 'Vehicles', 50),
  
  -- Master Data - Drivers
  ('drivers:view', 'View Drivers', 'View driver list and details', 'Master Data', 'Drivers', 60),
  ('drivers:create', 'Create Drivers', 'Add new drivers', 'Master Data', 'Drivers', 70),
  ('drivers:edit', 'Edit Drivers', 'Edit driver details', 'Master Data', 'Drivers', 80),
  ('drivers:delete', 'Delete Drivers', 'Delete drivers', 'Master Data', 'Drivers', 90),
  
  -- Master Data - Employees
  ('employees:view', 'View Employees', 'View employee list and details', 'Master Data', 'Employees', 100),
  ('employees:create', 'Create Employees', 'Add new employees', 'Master Data', 'Employees', 110),
  ('employees:edit', 'Edit Employees', 'Edit employee details', 'Master Data', 'Employees', 120),
  ('employees:delete', 'Delete Employees', 'Delete employees', 'Master Data', 'Employees', 130),
  
  -- Settings Module
  ('settings:view', 'View Settings', 'View company settings', 'Settings', NULL, 10),
  ('settings:edit', 'Edit Settings', 'Modify company settings', 'Settings', NULL, 20),
  ('settings:users:view', 'View Users', 'View user accounts', 'Settings', 'Users', 30),
  ('settings:users:manage', 'Manage Users', 'Create, edit, delete users', 'Settings', 'Users', 40),
  ('settings:roles:manage', 'Manage Roles', 'Create, edit, delete roles', 'Settings', 'Roles', 50),
  ('settings:integrations:manage', 'Manage Integrations', 'Configure integrations', 'Settings', 'Integrations', 60),
  
  -- Logs & Audit
  ('logs:view', 'View Logs', 'View activity logs', 'Logs', NULL, 10),
  ('logs:export', 'Export Logs', 'Export activity logs', 'Logs', NULL, 20)
ON CONFLICT (permission_key) DO NOTHING;

-- ============================================
-- Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_departments_admin_id ON departments(admin_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_employees_admin_id ON employees(admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_type ON employees(employee_type);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_roles_admin_id ON roles(admin_id);
CREATE INDEX IF NOT EXISTS idx_permission_definitions_module ON permission_definitions(module);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read on departments" ON departments FOR SELECT USING (true);
CREATE POLICY "Allow public insert on departments" ON departments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on departments" ON departments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on departments" ON departments FOR DELETE USING (true);

CREATE POLICY "Allow public read on employees" ON employees FOR SELECT USING (true);
CREATE POLICY "Allow public insert on employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on employees" ON employees FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on employees" ON employees FOR DELETE USING (true);

CREATE POLICY "Allow public read on roles" ON roles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on roles" ON roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on roles" ON roles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on roles" ON roles FOR DELETE USING (true);

CREATE POLICY "Allow public read on permission_definitions" ON permission_definitions FOR SELECT USING (true);

-- ============================================
-- Insert default system roles (will be created per admin)
-- ============================================
-- Note: Default roles are created via application code when a new admin registers
