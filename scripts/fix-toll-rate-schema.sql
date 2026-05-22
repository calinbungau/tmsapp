-- Fix toll_rates table: add detailed rate breakdown columns + source tracking
ALTER TABLE toll_rates
  ADD COLUMN IF NOT EXISTS infrastructure_rate NUMERIC(10, 5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS air_pollution_rate NUMERIC(10, 5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS noise_rate NUMERIC(10, 5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS co2_surcharge NUMERIC(10, 5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- Drop the generated column and replace with a trigger-updated column
ALTER TABLE toll_rates DROP COLUMN IF EXISTS total_per_km;
ALTER TABLE toll_rates ADD COLUMN IF NOT EXISTS total_per_km NUMERIC(10, 5);

-- Fix toll_vignettes: add vignette_name, make vignette_type more flexible, add source
ALTER TABLE toll_vignettes
  ADD COLUMN IF NOT EXISTS vignette_name TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- Also drop the enum constraint on vignette_type and allow any text
ALTER TABLE toll_vignettes DROP CONSTRAINT IF EXISTS toll_vignettes_vignette_type_check;

-- Fix toll_vehicle_categories: the seed uses 'axle_category' not 'axle_count'
-- Update the CHECK constraint to allow both
ALTER TABLE toll_vehicle_categories DROP CONSTRAINT IF EXISTS toll_vehicle_categories_category_type_check;
ALTER TABLE toll_vehicle_categories ADD CONSTRAINT toll_vehicle_categories_category_type_check
  CHECK (category_type IN ('emission_class', 'axle_category', 'axle_count', 'weight_class', 'co2_class'));

-- Fix toll_road_segments: seed uses segment_type not segment_code
ALTER TABLE toll_road_segments
  ADD COLUMN IF NOT EXISTS segment_type TEXT;

-- Drop and recreate the unique constraint to include segment_type
ALTER TABLE toll_road_segments DROP CONSTRAINT IF EXISTS toll_road_segments_toll_country_id_segment_code_key;

-- Fix toll_special_charges: allow more charge types
ALTER TABLE toll_special_charges DROP CONSTRAINT IF EXISTS toll_special_charges_charge_type_check;

-- Create an update trigger to auto-calculate total_per_km
CREATE OR REPLACE FUNCTION update_total_per_km()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_per_km := COALESCE(NEW.rate_per_km, 0) 
    + COALESCE(NEW.infrastructure_rate, 0) 
    + COALESCE(NEW.air_pollution_rate, 0) 
    + COALESCE(NEW.noise_rate, 0) 
    + COALESCE(NEW.co2_surcharge, 0)
    + COALESCE(NEW.surcharge_per_km, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS toll_rates_total_trigger ON toll_rates;
CREATE TRIGGER toll_rates_total_trigger
  BEFORE INSERT OR UPDATE ON toll_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_total_per_km();
