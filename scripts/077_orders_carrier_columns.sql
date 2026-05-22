-- Add carrier send tracking columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_upload_token_id uuid REFERENCES carrier_upload_tokens(id);
