-- Add Traccar integration columns to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS traccar_server_url TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS traccar_email TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS traccar_password TEXT;

-- Add traccar_device_id to vehicles if not exists
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS traccar_device_id INTEGER;
