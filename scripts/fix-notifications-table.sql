-- Drop and recreate notifications table with correct structure
DROP TABLE IF EXISTS notifications;

-- Notifications table for both drivers and admins
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Admin who owns/sent the notification
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Recipient info (scalable for driver or admin recipients)
  recipient_type TEXT NOT NULL, -- 'driver' or 'admin'
  recipient_id UUID NOT NULL, -- driver_id or admin_id
  
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
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_notifications_recipient ON notifications(recipient_type, recipient_id);
CREATE INDEX idx_notifications_admin_id ON notifications(admin_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(type);

-- Enable RLS but allow all operations (service role handles access)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Unrestricted policies for service role access
CREATE POLICY "notifications_select_all" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert_all" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update_all" ON notifications FOR UPDATE USING (true);
CREATE POLICY "notifications_delete_all" ON notifications FOR DELETE USING (true);
