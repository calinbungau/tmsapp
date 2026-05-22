-- Add system email settings table for automated/system emails
-- This is separate from user_email_settings which is for business correspondence

CREATE TABLE IF NOT EXISTS system_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Email identity
  email_address TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Fleet System',
  
  -- SMTP settings (only SMTP needed for sending)
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure BOOLEAN NOT NULL DEFAULT true,
  smtp_user TEXT NOT NULL,
  smtp_password_encrypted TEXT NOT NULL,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- One system email per admin
  UNIQUE(admin_id)
);

-- Enable RLS
ALTER TABLE system_email_settings ENABLE ROW LEVEL SECURITY;

-- Policy for admin access
CREATE POLICY system_email_settings_all ON system_email_settings FOR ALL USING (true);

-- Comment
COMMENT ON TABLE system_email_settings IS 'System email configuration for automated notifications (reports, alerts, reminders)';
