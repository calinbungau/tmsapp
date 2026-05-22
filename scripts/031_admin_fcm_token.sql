-- Add fcm_token to admins table for push notifications
ALTER TABLE admins ADD COLUMN IF NOT EXISTS fcm_token TEXT;
