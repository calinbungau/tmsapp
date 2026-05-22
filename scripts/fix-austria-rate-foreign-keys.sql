-- Fix Austria toll_rates rows that have NULL emission_class_id, axle_category_id, co2_class_id
-- because the Austria seed script looked up categories under wrong admin_id.
-- The categories exist under admin '00000000-0000-0000-0000-000000000000' (system defaults).

DO $$
DECLARE
  v_at_id UUID;
  -- System-default category IDs (admin 00000000...)
  v_euro6 UUID;
  v_euro6e UUID;
  v_euro5 UUID;
  v_euro4 UUID;
  v_euro0 UUID;
  v_axle2 UUID;
  v_axle3 UUID;
  v_axle4 UUID;
  v_co2_1 UUID;
  v_co2_2 UUID;
  v_co2_3 UUID;
  v_co2_4 UUID;
  v_co2_5 UUID;
  v_sys_admin UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT id INTO v_at_id FROM toll_countries WHERE country_code = 'AT';

  -- Look up categories from system defaults
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_sys_admin;
  SELECT id INTO v_euro6e FROM toll_vehicle_categories WHERE code = 'EURO_6E' AND admin_id = v_sys_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_sys_admin;
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE code = 'EURO_4' AND admin_id = v_sys_admin;
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0_III' AND admin_id = v_sys_admin;

  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = 'AXLE_2' AND admin_id = v_sys_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = 'AXLE_3' AND admin_id = v_sys_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = 'AXLE_4' AND admin_id = v_sys_admin;

  SELECT id INTO v_co2_1 FROM toll_vehicle_categories WHERE code = 'CO2_1' AND admin_id = v_sys_admin;
  SELECT id INTO v_co2_2 FROM toll_vehicle_categories WHERE code = 'CO2_2' AND admin_id = v_sys_admin;
  SELECT id INTO v_co2_3 FROM toll_vehicle_categories WHERE code = 'CO2_3' AND admin_id = v_sys_admin;
  SELECT id INTO v_co2_4 FROM toll_vehicle_categories WHERE code = 'CO2_4' AND admin_id = v_sys_admin;
  SELECT id INTO v_co2_5 FROM toll_vehicle_categories WHERE code = 'CO2_5' AND admin_id = v_sys_admin;

  RAISE NOTICE 'Resolved: euro6=%, euro6e=%, euro5=%, euro4=%, euro0=%', v_euro6, v_euro6e, v_euro5, v_euro4, v_euro0;
  RAISE NOTICE 'Resolved: axle2=%, axle3=%, axle4=%', v_axle2, v_axle3, v_axle4;
  RAISE NOTICE 'Resolved: co2_1=%, co2_2=%, co2_3=%, co2_4=%, co2_5=%', v_co2_1, v_co2_2, v_co2_3, v_co2_4, v_co2_5;

  -- Update Austria per-km rates based on notes field which tells us the intended category
  -- CO2-5 zero emission rates (EURO 6E)
  UPDATE toll_rates SET emission_class_id = v_euro6e, axle_category_id = v_axle2, co2_class_id = v_co2_5
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-5 zero emission';
  UPDATE toll_rates SET emission_class_id = v_euro6e, axle_category_id = v_axle3, co2_class_id = v_co2_5
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-5 zero emission';
  UPDATE toll_rates SET emission_class_id = v_euro6e, axle_category_id = v_axle4, co2_class_id = v_co2_5
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-5 zero emission';

  -- CO2-4 EURO VI
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle2, co2_class_id = v_co2_4
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-4 EURO VI';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle3, co2_class_id = v_co2_4
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-4 EURO VI';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle4, co2_class_id = v_co2_4
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-4 EURO VI';

  -- CO2-3 EURO VI
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle2, co2_class_id = v_co2_3
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-3 EURO VI';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle3, co2_class_id = v_co2_3
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-3 EURO VI';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle4, co2_class_id = v_co2_3
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-3 EURO VI';

  -- CO2-2 EURO VI
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle2, co2_class_id = v_co2_2
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-2 EURO VI';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle3, co2_class_id = v_co2_2
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-2 EURO VI';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle4, co2_class_id = v_co2_2
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-2 EURO VI';

  -- CO2-1 EURO VI
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle2, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-1 EURO VI HGV';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle3, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-1 EURO VI HGV';
  UPDATE toll_rates SET emission_class_id = v_euro6, axle_category_id = v_axle4, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-1 EURO VI HGV';

  -- CO2-1 EURO V/EEV
  UPDATE toll_rates SET emission_class_id = v_euro5, axle_category_id = v_axle2, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-1 EURO V/EEV';
  UPDATE toll_rates SET emission_class_id = v_euro5, axle_category_id = v_axle3, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-1 EURO V/EEV';
  UPDATE toll_rates SET emission_class_id = v_euro5, axle_category_id = v_axle4, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-1 EURO V/EEV';

  -- CO2-1 EURO IV
  UPDATE toll_rates SET emission_class_id = v_euro4, axle_category_id = v_axle2, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-1 EURO IV';
  UPDATE toll_rates SET emission_class_id = v_euro4, axle_category_id = v_axle3, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-1 EURO IV';
  UPDATE toll_rates SET emission_class_id = v_euro4, axle_category_id = v_axle4, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-1 EURO IV';

  -- CO2-1 EURO 0-III
  UPDATE toll_rates SET emission_class_id = v_euro0, axle_category_id = v_axle2, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat2 CO2-1 EURO 0-III';
  UPDATE toll_rates SET emission_class_id = v_euro0, axle_category_id = v_axle3, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat3 CO2-1 EURO 0-III';
  UPDATE toll_rates SET emission_class_id = v_euro0, axle_category_id = v_axle4, co2_class_id = v_co2_1
    WHERE toll_country_id = v_at_id AND notes = 'Cat4+ CO2-1 EURO 0-III';

  -- Fix section toll rates (toll_section_rates only has axle_category_id, no emission/co2 columns)
  UPDATE toll_section_rates SET axle_category_id = v_axle2
    WHERE toll_country_id = v_at_id AND axle_category_id IS NULL AND notes LIKE '%Cat2%';
  UPDATE toll_section_rates SET axle_category_id = v_axle3
    WHERE toll_country_id = v_at_id AND axle_category_id IS NULL AND notes LIKE '%Cat3%';
  UPDATE toll_section_rates SET axle_category_id = v_axle4
    WHERE toll_country_id = v_at_id AND axle_category_id IS NULL AND notes LIKE '%Cat4+%';

  RAISE NOTICE 'Austria toll rate foreign keys repaired';
END $$;
