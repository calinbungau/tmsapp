-- Fix email schema: use admin_id as primary lookup key everywhere
-- The user_id column on user_email_settings is optional (legacy admins don't have one)
-- admin_id is always available and should be the main lookup

-- Add unique constraint on admin_id for user_email_settings
ALTER TABLE user_email_settings DROP CONSTRAINT IF EXISTS user_email_settings_user_id_key;
DO $$ BEGIN
  ALTER TABLE user_email_settings ADD CONSTRAINT user_email_settings_admin_id_key UNIQUE (admin_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Make user_id nullable (legacy admins don't have it)
ALTER TABLE user_email_settings ALTER COLUMN user_id DROP NOT NULL;

-- Fix the unique conflict column on user_emails from (user_id, message_id) to (admin_id, mailbox, uid)
-- The existing UNIQUE(user_email_setting_id, mailbox, uid) is fine for upserts

-- Add admin_id index on user_emails for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_emails_admin_id ON user_emails(admin_id, mailbox, date DESC);
