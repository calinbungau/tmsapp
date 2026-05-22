-- Migration: Add road_type column to toll_rates, fix Hungary data
-- This adds a proper column for road type (motorway/main_road) instead of relying on notes text

-- 1. Add road_type column
ALTER TABLE toll_rates ADD COLUMN IF NOT EXISTS road_type TEXT;

-- 2. Fix Hungary rates: set road_type from notes
UPDATE toll_rates SET road_type = 'motorway' WHERE notes LIKE '%Motorway%' AND road_type IS NULL;
UPDATE toll_rates SET road_type = 'main_road' WHERE notes LIKE '%Main Road%' AND road_type IS NULL;

-- 3. Fix Hungary rates: set axle_category_id from J-category in notes
-- J2 = 2 axles, J3 = 3 axles, J4 = 4 axles
DO $$
DECLARE
  v_hu_id UUID;
  v_axle2 UUID;
  v_axle3 UUID;
  v_axle4 UUID;
  v_sys_admin UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT id INTO v_hu_id FROM toll_countries WHERE country_code = 'HU';
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = 'AXLE_2' AND admin_id = v_sys_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = 'AXLE_3' AND admin_id = v_sys_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = 'AXLE_4' AND admin_id = v_sys_admin;

  RAISE NOTICE 'HU country id: %, AXLE_2: %, AXLE_3: %, AXLE_4: %', v_hu_id, v_axle2, v_axle3, v_axle4;

  -- J2 = AXLE_2
  UPDATE toll_rates SET axle_category_id = v_axle2
    WHERE toll_country_id = v_hu_id AND axle_category_id IS NULL AND notes LIKE '%J2 %';
  RAISE NOTICE 'Updated J2 rows: %', (SELECT count(*) FROM toll_rates WHERE toll_country_id = v_hu_id AND axle_category_id = v_axle2);

  -- J3 = AXLE_3
  UPDATE toll_rates SET axle_category_id = v_axle3
    WHERE toll_country_id = v_hu_id AND axle_category_id IS NULL AND notes LIKE '%J3 %';
  RAISE NOTICE 'Updated J3 rows: %', (SELECT count(*) FROM toll_rates WHERE toll_country_id = v_hu_id AND axle_category_id = v_axle3);

  -- J4 = AXLE_4 (covers 4+ axle vehicles)
  UPDATE toll_rates SET axle_category_id = v_axle4
    WHERE toll_country_id = v_hu_id AND axle_category_id IS NULL AND notes LIKE '%J4 %';
  RAISE NOTICE 'Updated J4 rows: %', (SELECT count(*) FROM toll_rates WHERE toll_country_id = v_hu_id AND axle_category_id = v_axle4);

  -- Verify no NULL axle_category_id remains for HU
  RAISE NOTICE 'HU rows still missing axle: %', (SELECT count(*) FROM toll_rates WHERE toll_country_id = v_hu_id AND axle_category_id IS NULL);
END $$;
