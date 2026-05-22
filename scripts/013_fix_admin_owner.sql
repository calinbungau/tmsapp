-- Fix: Set is_owner = true for users that are the main admin
-- A user should be owner if their email matches the admin's email in the admins table

UPDATE users u
SET is_owner = true
WHERE EXISTS (
  SELECT 1 FROM admins a 
  WHERE a.id = u.admin_id 
  AND a.email = u.email
);

-- Also ensure the specific admin user is set as owner
UPDATE users
SET is_owner = true
WHERE email = 'admin@example.com';

-- Verify the update
SELECT id, email, is_owner, role_id FROM users WHERE is_owner = true;
