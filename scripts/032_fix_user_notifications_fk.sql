-- Fix: user_notifications.user_id has a FK constraint to users(id)
-- This prevents admin users (who are in the admins table, not users table)
-- from receiving in-app notifications. Drop the FK and keep the column generic.

-- Drop the foreign key constraint on user_id
ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_user_id_fkey;

-- Also drop the unique constraint and recreate it (the unique stays, just no FK)
-- The UNIQUE(notification_id, user_id) constraint should still work fine

-- Add a comment for clarity
COMMENT ON COLUMN user_notifications.user_id IS 'Can reference either users(id) or admins(id) - no FK enforced';
