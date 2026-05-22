-- Migration script to link existing drivers to employees and set up default roles
-- This script should be run ONCE after the new schema is created

-- Step 0: Add employee_id column to drivers table if it doesn't exist
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

-- Step 1: Create a default "Operations" department for each admin
INSERT INTO departments (admin_id, name, description)
SELECT 
  id,
  'Operations',
  'Default operations department'
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM departments WHERE departments.admin_id = admins.id AND departments.name = 'Operations'
);

-- Step 2: Create employee records for all existing drivers
-- First, get the Operations department ID for linking
INSERT INTO employees (
  admin_id,
  department_id,
  employee_type,
  first_name,
  last_name,
  email,
  phone,
  status,
  hire_date,
  created_at
)
SELECT 
  d.admin_id,
  (SELECT id FROM departments WHERE departments.admin_id = d.admin_id AND name = 'Operations' LIMIT 1),
  'driver',
  SPLIT_PART(d.name, ' ', 1),
  CASE 
    WHEN POSITION(' ' IN d.name) > 0 THEN SUBSTRING(d.name FROM POSITION(' ' IN d.name) + 1)
    ELSE ''
  END,
  d.email,
  d.phone,
  'active',
  COALESCE(d.created_at::date, CURRENT_DATE),
  d.created_at
FROM drivers d
WHERE NOT EXISTS (
  SELECT 1 FROM employees e WHERE e.admin_id = d.admin_id AND e.email = d.email
);

-- Step 3: Link drivers to their employee records
UPDATE drivers d
SET employee_id = (
  SELECT e.id FROM employees e 
  WHERE e.admin_id = d.admin_id 
  AND e.email = d.email 
  LIMIT 1
)
WHERE d.employee_id IS NULL;

-- Step 4: Create default roles for each admin (if not exists)
-- Fleet Manager (full access)
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Fleet Manager',
  'Full access to all system features',
  true,
  '{
    "forms": ["view", "create", "edit", "delete", "export"],
    "documents": ["view", "create", "edit", "delete", "types:manage"],
    "maintenance": ["view", "create", "edit", "delete", "costs:view", "costs:edit", "types:manage"],
    "master_data": ["vehicles:view", "vehicles:edit", "drivers:view", "drivers:edit"],
    "settings": ["view", "users:manage", "roles:manage", "integrations"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Fleet Manager'
);

-- Operations Manager
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Operations Manager',
  'Full access to operations, limited settings access',
  true,
  '{
    "forms": ["view", "create", "edit", "delete", "export"],
    "documents": ["view", "create", "edit"],
    "maintenance": ["view", "create", "edit", "delete", "costs:view"],
    "master_data": ["vehicles:view", "drivers:view", "drivers:edit"],
    "settings": ["view"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Operations Manager'
);

-- Dispatcher
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Dispatcher',
  'Forms and vehicle monitoring access',
  true,
  '{
    "forms": ["view", "create", "edit", "export"],
    "documents": ["view"],
    "maintenance": ["view"],
    "master_data": ["vehicles:view", "drivers:view"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Dispatcher'
);

-- Planner
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Planner',
  'Maintenance planning and scheduling access',
  true,
  '{
    "forms": ["view"],
    "documents": ["view"],
    "maintenance": ["view", "create", "edit", "delete"],
    "master_data": ["vehicles:view", "drivers:view"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Planner'
);

-- Mechanic
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Mechanic',
  'Maintenance work access without cost visibility',
  true,
  '{
    "maintenance": ["view", "create", "edit"],
    "master_data": ["vehicles:view"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Mechanic'
);

-- Accountant
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Accountant',
  'Financial reporting and cost access',
  true,
  '{
    "forms": ["view", "export"],
    "documents": ["view"],
    "maintenance": ["view", "costs:view", "costs:edit"],
    "master_data": ["vehicles:view", "drivers:view"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Accountant'
);

-- Administrative
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Administrative',
  'Document management and general access',
  true,
  '{
    "forms": ["view"],
    "documents": ["view", "create", "edit"],
    "maintenance": ["view"],
    "master_data": ["vehicles:view", "drivers:view"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Administrative'
);

-- Driver (for driver portal access)
INSERT INTO roles (admin_id, name, description, is_system_role, permissions)
SELECT 
  id,
  'Driver',
  'Driver portal access only',
  true,
  '{
    "forms": ["submit"],
    "documents": ["own:view"],
    "maintenance": ["report"]
  }'::jsonb
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE roles.admin_id = admins.id AND roles.name = 'Driver'
);

-- Step 5: Create a user record for the main admin (the one in admins table)
-- with Fleet Manager role
INSERT INTO users (admin_id, employee_id, email, password_hash, role_id, status)
SELECT 
  a.id,
  NULL, -- No employee record for the main admin
  a.email,
  a.password_hash,
  (SELECT r.id FROM roles r WHERE r.admin_id = a.id AND r.name = 'Fleet Manager' LIMIT 1),
  'active'
FROM admins a
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.admin_id = a.id AND u.email = a.email
);

-- Step 6: Set up default notification preferences for existing admins
INSERT INTO notification_preferences (user_id)
SELECT u.id
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM notification_preferences np WHERE np.user_id = u.id
);
