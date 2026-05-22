-- Email System: user_email_settings + user_emails tables
-- Each user can configure their own IMAP/SMTP credentials
-- Emails metadata is cached in DB, full body fetched on demand from IMAP

-- 1. User Email Settings (per-user IMAP+SMTP config)
CREATE TABLE IF NOT EXISTS user_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- IMAP settings (for reading)
  imap_host TEXT NOT NULL DEFAULT '',
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_secure BOOLEAN NOT NULL DEFAULT true,
  imap_user TEXT NOT NULL DEFAULT '',
  imap_password_encrypted TEXT NOT NULL DEFAULT '',
  
  -- SMTP settings (for sending)
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure BOOLEAN NOT NULL DEFAULT false,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_password_encrypted TEXT NOT NULL DEFAULT '',
  
  -- Display settings
  display_name TEXT NOT NULL DEFAULT '',
  email_address TEXT NOT NULL DEFAULT '',
  signature_html TEXT DEFAULT '',
  
  -- Sync state
  last_sync_at TIMESTAMPTZ,
  last_sync_uid INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'idle', -- idle, syncing, error
  sync_error TEXT,
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- 2. User Emails (metadata cache - no full body stored)
CREATE TABLE IF NOT EXISTS user_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email_setting_id UUID NOT NULL REFERENCES user_email_settings(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- IMAP identifiers
  message_id TEXT, -- Message-ID header
  uid INTEGER NOT NULL, -- IMAP UID
  mailbox TEXT NOT NULL DEFAULT 'INBOX',
  
  -- Envelope
  from_address TEXT,
  from_name TEXT,
  to_addresses JSONB DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  bcc_addresses JSONB DEFAULT '[]',
  subject TEXT,
  snippet TEXT, -- first ~200 chars of body text
  
  -- Timestamps
  date TIMESTAMPTZ,
  
  -- Attachments meta
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,
  attachments_meta JSONB DEFAULT '[]', -- [{name, size, contentType, partId}]
  
  -- Flags
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  flags JSONB DEFAULT '[]',
  
  -- Threading
  in_reply_to TEXT,
  references_header TEXT,
  
  -- Track if converted to order
  converted_to_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicates per mailbox
  UNIQUE(user_email_setting_id, mailbox, uid)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_user_emails_setting_mailbox 
  ON user_emails(user_email_setting_id, mailbox, date DESC);

CREATE INDEX IF NOT EXISTS idx_user_emails_setting_unread 
  ON user_emails(user_email_setting_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_user_emails_date 
  ON user_emails(date DESC);

CREATE INDEX IF NOT EXISTS idx_user_email_settings_user 
  ON user_email_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_user_email_settings_admin 
  ON user_email_settings(admin_id);

-- RLS
ALTER TABLE user_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_emails ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role (API routes use service role)
DROP POLICY IF EXISTS "user_email_settings_all" ON user_email_settings;
CREATE POLICY "user_email_settings_all" ON user_email_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "user_emails_all" ON user_emails;
CREATE POLICY "user_emails_all" ON user_emails FOR ALL USING (true) WITH CHECK (true);
