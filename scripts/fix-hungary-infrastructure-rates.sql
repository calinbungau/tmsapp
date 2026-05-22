-- Fix Hungary infrastructure rates to match official aplus.hu 2025 table
-- Previous values were slightly too high (wrong source data)
-- Official rates from aplus.hu/en/toll (2025 currently applicable)

DO $$
DECLARE
  v_admin UUID;
  v_hu_id UUID;
  v_hu_mw UUID;
  v_hu_mr UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID; v_axle5 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_hu_id FROM toll_countries WHERE country_code = 'HU' AND admin_id = v_admin;
  SELECT id INTO v_hu_mw FROM toll_road_segments WHERE toll_country_id = v_hu_id AND segment_code = 'motorway';
  SELECT id INTO v_hu_mr FROM toll_road_segments WHERE toll_country_id = v_hu_id AND segment_code = 'main_road';
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle5 FROM toll_vehicle_categories WHERE code = '5_AXLE' AND admin_id = v_admin;

  -- J2: Motorway 61.09 (was 63.17), Main Road 33.40 (was 34.54)
  UPDATE toll_rates SET infrastructure_rate = 61.09
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mw AND axle_category_id = v_axle2;

  UPDATE toll_rates SET infrastructure_rate = 33.40
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mr AND axle_category_id = v_axle2;

  -- J3: Motorway 97.66 (was 100.98), Main Road 55.25 (was 57.13)
  UPDATE toll_rates SET infrastructure_rate = 97.66
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mw AND axle_category_id = v_axle3;

  UPDATE toll_rates SET infrastructure_rate = 55.25
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mr AND axle_category_id = v_axle3;

  -- J4: Motorway 151.38 (was 156.53), Main Road 94.62 (was 97.84)
  UPDATE toll_rates SET infrastructure_rate = 151.38
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mw AND axle_category_id = v_axle4;

  UPDATE toll_rates SET infrastructure_rate = 94.62
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mr AND axle_category_id = v_axle4;

  -- J5: Motorway 158.50 (was 163.89), Main Road 98.43 (was 101.78)
  UPDATE toll_rates SET infrastructure_rate = 158.50
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mw AND axle_category_id = v_axle5;

  UPDATE toll_rates SET infrastructure_rate = 98.43
  WHERE toll_country_id = v_hu_id AND road_segment_id = v_hu_mr AND axle_category_id = v_axle5;

  RAISE NOTICE 'Updated Hungary infrastructure rates to official aplus.hu 2025 values';
  RAISE NOTICE 'J2: MW 61.09 / MR 33.40';
  RAISE NOTICE 'J3: MW 97.66 / MR 55.25';
  RAISE NOTICE 'J4: MW 151.38 / MR 94.62';
  RAISE NOTICE 'J5: MW 158.50 / MR 98.43';
END $$;
