-- Add device tracking columns to admins (match drivers table pattern)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS device_info JSONB;

-- Add fcm_token column to users table for sub-users
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_info JSONB;
