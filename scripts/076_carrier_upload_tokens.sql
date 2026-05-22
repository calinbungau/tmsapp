-- Carrier upload tokens: unique links for carriers to upload signed documents
CREATE TABLE IF NOT EXISTS carrier_upload_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  carrier_name TEXT,
  carrier_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  uploaded_file_url TEXT,
  uploaded_file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_carrier_upload_tokens_token ON carrier_upload_tokens(token);
CREATE INDEX IF NOT EXISTS idx_carrier_upload_tokens_order ON carrier_upload_tokens(order_id);

-- RLS
ALTER TABLE carrier_upload_tokens ENABLE ROW LEVEL SECURITY;

-- Public can read/update by token (for the upload page)
CREATE POLICY "carrier_upload_tokens_public_read" ON carrier_upload_tokens
  FOR SELECT USING (true);

CREATE POLICY "carrier_upload_tokens_public_update" ON carrier_upload_tokens
  FOR UPDATE USING (true);

-- Authenticated users can insert
CREATE POLICY "carrier_upload_tokens_auth_insert" ON carrier_upload_tokens
  FOR INSERT WITH CHECK (true);

-- Authenticated users can delete their own
CREATE POLICY "carrier_upload_tokens_auth_delete" ON carrier_upload_tokens
  FOR DELETE USING (true);
