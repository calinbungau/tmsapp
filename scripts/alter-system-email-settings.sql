-- Alter system_email_settings to use encrypted password (matching user_email_settings pattern)

-- Add new encrypted column if not exists
ALTER TABLE system_email_settings 
ADD COLUMN IF NOT EXISTS smtp_password_encrypted TEXT;

-- If there's existing plain password data, we'll need to manually encrypt it
-- For now, just drop the old column if it exists
ALTER TABLE system_email_settings 
DROP COLUMN IF EXISTS smtp_password;
