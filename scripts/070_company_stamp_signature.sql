-- Add stamp and signature image columns to company_profiles
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS stamp_url TEXT;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS signature_url TEXT;
