-- Notifications table for both drivers and admins
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient (either driver or admin, not both)
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Notification content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general', -- general, maintenance_due, form_reminder, inspection_alert, system
  
  -- Related entity (optional, for linking to specific items)
  related_type TEXT, -- maintenance_record, form_submission, vehicle, etc.
  related_id UUID,
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Push notification tracking
  push_sent BOOLEAN DEFAULT FALSE,
  push_sent_at TIMESTAMPTZ,
  push_error TEXT,
  
  -- Metadata
  data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure either driver_id or admin_id is set, but not both
  CONSTRAINT notification_recipient_check CHECK (
    (driver_id IS NOT NULL AND admin_id IS NULL) OR
    (driver_id IS NULL AND admin_id IS NOT NULL)
  )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_driver_id ON notifications(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_admin_id ON notifications(admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "notifications_driver_select" ON notifications
  FOR SELECT USING (driver_id IS NOT NULL);

CREATE POLICY "notifications_admin_select" ON notifications
  FOR SELECT USING (admin_id IS NOT NULL);

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (true);
