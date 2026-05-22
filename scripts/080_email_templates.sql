-- Email Templates system (scalable, multi-language)
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  trigger_event TEXT,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  variables JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_template_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_id, language_code)
);

-- Index for fast lookup by trigger event
CREATE INDEX IF NOT EXISTS idx_email_templates_trigger ON email_templates(trigger_event) WHERE trigger_event IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_templates_admin ON email_templates(admin_id);
CREATE INDEX IF NOT EXISTS idx_email_template_translations_template ON email_template_translations(template_id);

-- Add is_read index on user_emails for fast unread count
CREATE INDEX IF NOT EXISTS idx_user_emails_unread ON user_emails(admin_id, is_read) WHERE is_read = false;

-- Enable realtime on user_emails for live inbox updates
ALTER PUBLICATION supabase_realtime ADD TABLE user_emails;

-- Seed default template categories as a comment for reference:
-- categories: 'orders', 'documents', 'notifications', 'invoices', 'maintenance', 'general'
-- trigger_events: 'order_confirmed', 'order_signed', 'order_delivered', 'cmr_pod_received', 'invoice_sent', null (manual)
