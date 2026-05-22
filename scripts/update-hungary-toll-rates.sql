-- Update Hungary (HU-GO) toll rates with correct 2025 official data
-- Source: hu-go.hu "E-tolls: the table of toll rates applicable from January 2025"
-- Decree 25/2013 (V. 31.) NFM
-- Currency: HUF (Hungarian Forint)
-- Structure: Infrastructure charge (motorway OR main road) + External cost (Air pollution/Suburban + Intermunicipal + CO2)

DO $$
DECLARE
  v_admin UUID;
  v_hu_id UUID;
  v_hu_mw UUID; -- motorway segment
  v_hu_mr UUID; -- main road segment
  -- Emission classes
  v_euro0 UUID; v_euro1 UUID; v_euro2 UUID; v_euro3 UUID;
  v_euro4 UUID; v_euro5 UUID; v_euro6 UUID; v_euro6e UUID;
  -- Axle categories
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID; v_axle5 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_hu_id FROM toll_countries WHERE country_code = 'HU' AND admin_id = v_admin;

  -- Delete old HU rates first
  DELETE FROM toll_rates WHERE toll_country_id = v_hu_id AND admin_id = v_admin;

  -- Get road segments
  SELECT id INTO v_hu_mw FROM toll_road_segments WHERE toll_country_id = v_hu_id AND segment_code = 'motorway';
  SELECT id INTO v_hu_mr FROM toll_road_segments WHERE toll_country_id = v_hu_id AND segment_code = 'main_road';

  -- Create main_road segment if it doesn't exist
  IF v_hu_mr IS NULL THEN
    INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
    VALUES (v_admin, v_hu_id, 'Main Road', 'main_road', 'Hungarian main roads (foutak)')
    RETURNING id INTO v_hu_mr;
  END IF;

  -- Get vehicle categories
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0' AND admin_id = v_admin;
  SELECT id INTO v_euro1 FROM toll_vehicle_categories WHERE code = 'EURO_1' AND admin_id = v_admin;
  SELECT id INTO v_euro2 FROM toll_vehicle_categories WHERE code = 'EURO_2' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE code = 'EURO_4' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro6e FROM toll_vehicle_categories WHERE code = 'EURO_6E' AND admin_id = v_admin;

  -- Create EURO_1 and EURO_2 if they don't exist
  IF v_euro1 IS NULL THEN
    INSERT INTO toll_vehicle_categories (admin_id, category_type, code, name, description, sort_order)
    VALUES (v_admin, 'emission_class', 'EURO_1', 'EURO I', 'Euro 1 emission standard', 11)
    RETURNING id INTO v_euro1;
  END IF;
  IF v_euro2 IS NULL THEN
    INSERT INTO toll_vehicle_categories (admin_id, category_type, code, name, description, sort_order)
    VALUES (v_admin, 'emission_class', 'EURO_2', 'EURO II', 'Euro 2 emission standard', 12)
    RETURNING id INTO v_euro2;
  END IF;

  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle5 FROM toll_vehicle_categories WHERE code = '5_AXLE' AND admin_id = v_admin;

  -- =====================================================
  -- J2: 2 AXLES - MOTORWAY
  -- Infrastructure: 63.17 HUF/km (motorway)
  -- =====================================================
  -- Columns: (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id,
  --           rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference)
  -- NOTE: rate_per_km = 0 (breakdown fields hold the actual values), trigger calculates total_per_km

  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    -- J2 Motorway
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle2, 0, 63.17, 91.80, 48.86, 22.21, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO 0 Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro1, v_axle2, 0, 63.17, 62.18, 31.59, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO I Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro2, v_axle2, 0, 63.17, 61.69, 31.09, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO II Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro3, v_axle2, 0, 63.17, 47.38, 23.69, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO III Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro4, v_axle2, 0, 63.17, 36.03, 16.78, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO IV Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle2, 0, 63.17, 21.71, 8.88, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO V Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle2, 0, 63.17, 11.35, 2.47, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO VI Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6e, v_axle2, 0, 63.17, 9.87, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 Zero-emission Motorway'),

    -- J2 Main Road
    (v_admin, v_hu_id, v_hu_mr, v_euro0, v_axle2, 0, 34.54, 91.80, 48.86, 22.21, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO 0 Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro1, v_axle2, 0, 34.54, 62.18, 31.59, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO I Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro2, v_axle2, 0, 34.54, 61.69, 31.09, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO II Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro3, v_axle2, 0, 34.54, 47.38, 23.69, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO III Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro4, v_axle2, 0, 34.54, 36.03, 16.78, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO IV Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro5, v_axle2, 0, 34.54, 21.71, 8.88, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO V Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6, v_axle2, 0, 34.54, 11.35, 2.47, 19.74, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 EURO VI Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6e, v_axle2, 0, 34.54, 9.87, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J2 Zero-emission Main Road'),

    -- =====================================================
    -- J3: 3 AXLES - MOTORWAY (100.98 HUF/km)
    -- =====================================================
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle3, 0, 100.98, 121.41, 67.61, 29.61, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO 0 Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro1, v_axle3, 0, 100.98, 77.98, 41.46, 25.66, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO I Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro2, v_axle3, 0, 100.98, 77.98, 41.46, 25.66, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO II Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro3, v_axle3, 0, 100.98, 61.69, 32.57, 25.66, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO III Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro4, v_axle3, 0, 100.98, 45.40, 22.21, 24.68, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO IV Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle3, 0, 100.98, 27.64, 13.33, 24.68, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO V Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle3, 0, 100.98, 13.82, 3.45, 24.68, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO VI Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6e, v_axle3, 0, 100.98, 11.35, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 Zero-emission Motorway'),

    -- J3 Main Road (57.13 HUF/km)
    (v_admin, v_hu_id, v_hu_mr, v_euro0, v_axle3, 0, 57.13, 121.41, 67.61, 29.61, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO 0 Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro1, v_axle3, 0, 57.13, 77.98, 41.46, 25.66, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO I Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro2, v_axle3, 0, 57.13, 77.98, 41.46, 25.66, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO II Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro3, v_axle3, 0, 57.13, 61.69, 32.57, 25.66, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO III Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro4, v_axle3, 0, 57.13, 45.40, 22.21, 24.68, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO IV Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro5, v_axle3, 0, 57.13, 27.64, 13.33, 24.68, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO V Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6, v_axle3, 0, 57.13, 13.82, 3.45, 24.68, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 EURO VI Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6e, v_axle3, 0, 57.13, 11.35, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J3 Zero-emission Main Road'),

    -- =====================================================
    -- J4: 4 AXLES - MOTORWAY (156.53 HUF/km)
    -- =====================================================
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle4, 0, 156.53, 137.20, 77.98, 38.99, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO 0 Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro1, v_axle4, 0, 156.53, 100.68, 55.77, 34.05, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO I Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro2, v_axle4, 0, 156.53, 100.68, 55.27, 34.05, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO II Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro3, v_axle4, 0, 156.53, 80.44, 43.92, 34.05, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO III Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro4, v_axle4, 0, 156.53, 58.24, 29.61, 33.07, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO IV Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle4, 0, 156.53, 32.57, 16.78, 33.07, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO V Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle4, 0, 156.53, 15.30, 3.95, 33.07, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO VI Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6e, v_axle4, 0, 156.53, 12.34, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 Zero-emission Motorway'),

    -- J4 Main Road (97.84 HUF/km)
    (v_admin, v_hu_id, v_hu_mr, v_euro0, v_axle4, 0, 97.84, 137.20, 77.98, 38.99, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO 0 Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro1, v_axle4, 0, 97.84, 100.68, 55.77, 34.05, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO I Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro2, v_axle4, 0, 97.84, 100.68, 55.27, 34.05, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO II Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro3, v_axle4, 0, 97.84, 80.44, 43.92, 34.05, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO III Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro4, v_axle4, 0, 97.84, 58.24, 29.61, 33.07, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO IV Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro5, v_axle4, 0, 97.84, 32.57, 16.78, 33.07, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO V Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6, v_axle4, 0, 97.84, 15.30, 3.95, 33.07, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 EURO VI Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6e, v_axle4, 0, 97.84, 12.34, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J4 Zero-emission Main Road'),

    -- =====================================================
    -- J5: 5+ AXLES - MOTORWAY (163.89 HUF/km)
    -- =====================================================
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle5, 0, 163.89, 165.33, 95.74, 44.91, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO 0 Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro1, v_axle5, 0, 163.89, 123.38, 69.59, 39.98, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO I Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro2, v_axle5, 0, 163.89, 122.89, 68.60, 39.98, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO II Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro3, v_axle5, 0, 163.89, 99.20, 54.78, 39.98, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO III Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro4, v_axle5, 0, 163.89, 70.08, 37.01, 39.48, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO IV Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle5, 0, 163.89, 37.51, 18.75, 39.48, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO V Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle5, 0, 163.89, 16.78, 3.95, 39.48, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO VI Motorway'),
    (v_admin, v_hu_id, v_hu_mw, v_euro6e, v_axle5, 0, 163.89, 13.82, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 Zero-emission Motorway'),

    -- J5 Main Road (101.78 HUF/km)
    (v_admin, v_hu_id, v_hu_mr, v_euro0, v_axle5, 0, 101.78, 165.33, 95.74, 44.91, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO 0 Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro1, v_axle5, 0, 101.78, 123.38, 69.59, 39.98, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO I Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro2, v_axle5, 0, 101.78, 122.89, 68.60, 39.98, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO II Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro3, v_axle5, 0, 101.78, 99.20, 54.78, 39.98, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO III Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro4, v_axle5, 0, 101.78, 70.08, 37.01, 39.48, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO IV Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro5, v_axle5, 0, 101.78, 37.51, 18.75, 39.48, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO V Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6, v_axle5, 0, 101.78, 16.78, 3.95, 39.48, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 EURO VI Main Road'),
    (v_admin, v_hu_id, v_hu_mr, v_euro6e, v_axle5, 0, 101.78, 13.82, 1.48, 0.00, 'HUF', '2025-01-01', 'hu-go.hu 25/2013 NFM Decree', 'J5 Zero-emission Main Road');

  -- Also update the country record to set currency to HUF
  UPDATE toll_countries SET currency = 'HUF', updated_at = now() WHERE id = v_hu_id;

  RAISE NOTICE 'Hungary toll rates updated: % rows inserted', (SELECT COUNT(*) FROM toll_rates WHERE toll_country_id = v_hu_id);
END $$;
