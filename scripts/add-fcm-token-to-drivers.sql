-- Add FCM token columns to drivers table for push notifications
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS fcm_token TEXT,
ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS device_info JSONB;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_drivers_fcm_token ON drivers(fcm_token) WHERE fcm_token IS NOT NULL;
