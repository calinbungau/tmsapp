-- Add separate columns for license front and back photos
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS photo_license_front_url TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS photo_license_back_url TEXT;

-- Migrate existing license photos to front (assuming they were front photos)
UPDATE inspections 
SET photo_license_front_url = photo_license_url 
WHERE photo_license_url IS NOT NULL AND photo_license_front_url IS NULL;

-- Keep the old column for backward compatibility, can be dropped later
-- ALTER TABLE inspections DROP COLUMN photo_license_url;
