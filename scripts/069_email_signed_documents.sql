-- Add signed document tracking columns to user_emails
ALTER TABLE user_emails ADD COLUMN IF NOT EXISTS signed_document_url TEXT;
ALTER TABLE user_emails ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE user_emails ADD COLUMN IF NOT EXISTS signed_filename TEXT;
