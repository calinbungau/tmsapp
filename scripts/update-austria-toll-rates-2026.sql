-- =====================================================
-- AUSTRIA (ASFINAG GO-Maut) - Official 2026 Rates
-- Source: go-maut-tarife-2026_en.pdf + go-maut-tarife-2026_streckenmaut_en.pdf
-- Valid from 1 January 2026
-- All rates in EUR excl. 20% VAT
-- Structure: Infrastructure + Air/Noise surcharge + CO2 surcharge
-- =====================================================

-- 1. Delete old Austria toll rates
DELETE FROM toll_rates WHERE toll_country_id IN (
  SELECT id FROM toll_countries WHERE country_code = 'AT'
);

-- 2. Delete old Austria section rates
DELETE FROM toll_section_rates WHERE toll_country_id IN (
  SELECT id FROM toll_countries WHERE country_code = 'AT'
);

-- 3. Update Austria country info
UPDATE toll_countries SET
  currency = 'EUR',
  has_distance_based = true,
  has_section_based = true,
  has_vignette = false,
  toll_operator = 'ASFINAG',
  toll_operator_url = 'https://www.asfinag.at/en/toll/go-toll/',
  last_rate_update = '2026-01-01',
  notes = 'GO-Maut distance-based toll for HGV >3.5t on motorways/expressways. Section tolls on A9 Bosruck, A9 Gleinalm, A10 Tauern, A11 Karawanken, A12 Inntal, A13 Brenner, S16 Arlberg. All rates excl. 20% VAT.'
WHERE country_code = 'AT';

-- 4. Insert per-km rates for general motorway network
-- ASFINAG uses: Category 2 (2 axles HGV), Category 3 (3 axles), Category 4+ (4+ axles)
-- CO2 emission classes 1-5, combined with EURO emission classes
DO $$
DECLARE
  v_admin UUID;
  v_at_id UUID;
  v_at_mw UUID;
  -- Emission classes
  v_euro6 UUID; v_euro5 UUID; v_euro4 UUID; v_euro3 UUID; v_euro0 UUID; v_euro6e UUID;
  -- Axle categories
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID;
  -- CO2 classes
  v_co2_1 UUID; v_co2_2 UUID; v_co2_3 UUID; v_co2_4 UUID; v_co2_5 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries WHERE country_code = 'AT' LIMIT 1;
  SELECT id INTO v_at_id FROM toll_countries WHERE country_code = 'AT' AND admin_id = v_admin;
  SELECT id INTO v_at_mw FROM toll_road_segments WHERE toll_country_id = v_at_id AND segment_code = 'motorway';

  -- If no motorway segment, create one
  IF v_at_mw IS NULL THEN
    INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_code, segment_name, segment_type, is_active)
    VALUES (v_admin, v_at_id, 'motorway', 'Motorway/Expressway (general network)', 'motorway', true)
    RETURNING id INTO v_at_mw;
  END IF;

  -- Emission classes
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE code = 'EURO_4' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0' AND admin_id = v_admin;
  SELECT id INTO v_euro6e FROM toll_vehicle_categories WHERE code = 'EURO_6E' AND admin_id = v_admin;
  -- Axle categories
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;
  -- CO2 classes
  SELECT id INTO v_co2_1 FROM toll_vehicle_categories WHERE code = 'CO2_1' AND admin_id = v_admin;
  SELECT id INTO v_co2_2 FROM toll_vehicle_categories WHERE code = 'CO2_2' AND admin_id = v_admin;
  SELECT id INTO v_co2_3 FROM toll_vehicle_categories WHERE code = 'CO2_3' AND admin_id = v_admin;
  SELECT id INTO v_co2_4 FROM toll_vehicle_categories WHERE code = 'CO2_4' AND admin_id = v_admin;
  SELECT id INTO v_co2_5 FROM toll_vehicle_categories WHERE code = 'CO2_5' AND admin_id = v_admin;

  -- ─── TOTAL RATES (from PDF page 1): infrastructure + air/noise + CO2 combined ───
  -- We store the breakdown: infrastructure_rate, air_pollution_rate (=air+noise surcharge), co2_surcharge
  -- The total_per_km is auto-calculated by trigger

  -- ── CO2 Class 5 (zero emission) ──
  -- Infrastructure: 0.0547 / 0.0766 / 0.1149 | Air/Noise: 0.0040 | CO2: 0.0000
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro6e, v_axle2, v_co2_5, 0, 0.0547, 0.0040, 0.0000, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-5 zero emission'),
    (v_admin, v_at_id, v_at_mw, v_euro6e, v_axle3, v_co2_5, 0, 0.0766, 0.0040, 0.0000, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-5 zero emission'),
    (v_admin, v_at_id, v_at_mw, v_euro6e, v_axle4, v_co2_5, 0, 0.1149, 0.0040, 0.0000, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-5 zero emission');

  -- ── CO2 Class 4 (EURO VI) ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0060/0.0090/0.0100 | CO2: 0.0240/0.0290/0.0400
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle2, v_co2_4, 0, 0.2186, 0.0060, 0.0240, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-4 EURO VI'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle3, v_co2_4, 0, 0.3060, 0.0090, 0.0290, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-4 EURO VI'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle4, v_co2_4, 0, 0.4591, 0.0100, 0.0400, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-4 EURO VI');

  -- ── CO2 Class 3 (EURO VI) ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0060/0.0090/0.0100 | CO2: 0.0478/0.0638/0.0934
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle2, v_co2_3, 0, 0.2186, 0.0060, 0.0478, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-3 EURO VI'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle3, v_co2_3, 0, 0.3060, 0.0090, 0.0638, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-3 EURO VI'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle4, v_co2_3, 0, 0.4591, 0.0100, 0.0934, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-3 EURO VI');

  -- ── CO2 Class 2 (EURO VI) ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0060/0.0090/0.0100 | CO2: 0.0494/0.0660/0.0966
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle2, v_co2_2, 0, 0.2186, 0.0060, 0.0494, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-2 EURO VI'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle3, v_co2_2, 0, 0.3060, 0.0090, 0.0660, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-2 EURO VI'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle4, v_co2_2, 0, 0.4591, 0.0100, 0.0966, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-2 EURO VI');

  -- ── CO2 Class 1 - EURO VI ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0060/0.0090/0.0100 | CO2: 0.0528/0.0706/0.1033
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle2, v_co2_1, 0, 0.2186, 0.0060, 0.0528, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-1 EURO VI HGV'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle3, v_co2_1, 0, 0.3060, 0.0090, 0.0706, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-1 EURO VI HGV'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle4, v_co2_1, 0, 0.4591, 0.0100, 0.1033, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-1 EURO VI HGV');

  -- ── CO2 Class 1 - EEV/EURO V ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0210/0.0320/0.0400 | CO2: 0.0528/0.0706/0.1033
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro5, v_axle2, v_co2_1, 0, 0.2186, 0.0210, 0.0528, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-1 EURO V/EEV'),
    (v_admin, v_at_id, v_at_mw, v_euro5, v_axle3, v_co2_1, 0, 0.3060, 0.0320, 0.0706, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-1 EURO V/EEV'),
    (v_admin, v_at_id, v_at_mw, v_euro5, v_axle4, v_co2_1, 0, 0.4591, 0.0400, 0.1033, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-1 EURO V/EEV');

  -- ── CO2 Class 1 - EURO IV ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0400/0.0530/0.0700 | CO2: 0.0528/0.0706/0.1033
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro4, v_axle2, v_co2_1, 0, 0.2186, 0.0400, 0.0528, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-1 EURO IV'),
    (v_admin, v_at_id, v_at_mw, v_euro4, v_axle3, v_co2_1, 0, 0.3060, 0.0530, 0.0706, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-1 EURO IV'),
    (v_admin, v_at_id, v_at_mw, v_euro4, v_axle4, v_co2_1, 0, 0.4591, 0.0700, 0.1033, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-1 EURO IV');

  -- ── CO2 Class 1 - EURO 0-III ──
  -- Infrastructure: 0.2186 / 0.3060 / 0.4591 | Air/Noise: 0.0560/0.0770/0.1030 | CO2: 0.0528/0.0706/0.1033
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro0, v_axle2, v_co2_1, 0, 0.2186, 0.0560, 0.0528, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat2 CO2-1 EURO 0-III'),
    (v_admin, v_at_id, v_at_mw, v_euro0, v_axle3, v_co2_1, 0, 0.3060, 0.0770, 0.0706, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat3 CO2-1 EURO 0-III'),
    (v_admin, v_at_id, v_at_mw, v_euro0, v_axle4, v_co2_1, 0, 0.4591, 0.1030, 0.1033, 'EUR', '2026-01-01', 'ASFINAG GO-Maut 2026', 'Cat4+ CO2-1 EURO 0-III');

  -- ── EURO 3 with CO2 Class 1 (same infrastructure, different air/noise than EURO 0) ──
  -- Air/Noise for EURO 0-III is 0.0560/0.0770/0.1030 - same bracket, use v_euro3 -> v_euro0 bracket
  -- In ASFINAG, EURO 0 to III are the same bracket. We map EURO_3 to EURO_0 rates for simplicity.
  -- EURO_3 is already included in EURO_0 bracket above.

  RAISE NOTICE 'AT per-km rates inserted (21 rate combinations)';
END $$;

-- 5. Insert section toll rates (flat fees per passage)
-- These are charged ON TOP of the per-km rate when traversing these specific tunnel/pass sections
DO $$
DECLARE
  v_admin UUID;
  v_at_id UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries WHERE country_code = 'AT' LIMIT 1;
  SELECT id INTO v_at_id FROM toll_countries WHERE country_code = 'AT' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;

  -- Section toll rates for CO2 Class 1 / EURO VI (most common HGV profile)
  -- Using HGV rates (not bus rates)
  INSERT INTO toll_section_rates (admin_id, toll_country_id, section_name, road_number,
    from_location, to_location, distance_km, axle_category_id,
    price, currency, valid_from, is_active, notes)
  VALUES
    -- A12 Inntal (75 km) - Cat2 / Cat3 / Cat4+
    (v_admin, v_at_id, 'A12 Inntal', 'A12', 'Kufstein (border)', 'Innsbruck-Amras', 75, v_axle2, 25.00, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI day rate excl. VAT'),
    (v_admin, v_at_id, 'A12 Inntal', 'A12', 'Kufstein (border)', 'Innsbruck-Amras', 75, v_axle3, 34.78, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI day rate excl. VAT'),
    (v_admin, v_at_id, 'A12 Inntal', 'A12', 'Kufstein (border)', 'Innsbruck-Amras', 75, v_axle4, 51.71, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI day rate excl. VAT'),

    -- A9 Bosruck (10 km) - Cat2 / Cat3 / Cat4+
    (v_admin, v_at_id, 'A9 Bosruck', 'A9', 'Spital/Pyhrn', 'Ardning', 10, v_axle2, 5.54, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A9 Bosruck', 'A9', 'Spital/Pyhrn', 'Ardning', 10, v_axle3, 7.74, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A9 Bosruck', 'A9', 'Spital/Pyhrn', 'Ardning', 10, v_axle4, 11.54, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),

    -- A9 Gleinalm (25 km) - Cat2 / Cat3 / Cat4+
    (v_admin, v_at_id, 'A9 Gleinalm', 'A9', 'St. Michael', 'Uebelbach', 25, v_axle2, 13.51, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A9 Gleinalm', 'A9', 'St. Michael', 'Uebelbach', 25, v_axle3, 18.84, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A9 Gleinalm', 'A9', 'St. Michael', 'Uebelbach', 25, v_axle4, 28.11, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),

    -- A10 Tauern (47 km) - Cat2 / Cat3 / Cat4+
    (v_admin, v_at_id, 'A10 Tauern', 'A10', 'Flachau', 'Rennweg', 47, v_axle2, 23.90, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A10 Tauern', 'A10', 'Flachau', 'Rennweg', 47, v_axle3, 33.35, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A10 Tauern', 'A10', 'Flachau', 'Rennweg', 47, v_axle4, 49.74, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),

    -- A11 Karawanken (10 km) - Cat2 / Cat3 / Cat4+
    (v_admin, v_at_id, 'A11 Karawanken', 'A11', 'St. Jakob/Rosental', 'Karawankentunnel (border SI)', 10, v_axle2, 10.00, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A11 Karawanken', 'A11', 'St. Jakob/Rosental', 'Karawankentunnel (border SI)', 10, v_axle3, 13.98, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'A11 Karawanken', 'A11', 'St. Jakob/Rosental', 'Karawankentunnel (border SI)', 10, v_axle4, 20.91, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),

    -- A13 Brenner via Amras (35 km) - Cat2 / Cat3 / Cat4+ DAY rates
    (v_admin, v_at_id, 'A13 Brenner (via Amras)', 'A13', 'Innsbruck-Amras', 'Brenner (border IT)', 35, v_axle2, 27.63, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI DAY rate excl. VAT'),
    (v_admin, v_at_id, 'A13 Brenner (via Amras)', 'A13', 'Innsbruck-Amras', 'Brenner (border IT)', 35, v_axle3, 38.57, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI DAY rate excl. VAT'),
    (v_admin, v_at_id, 'A13 Brenner (via Amras)', 'A13', 'Innsbruck-Amras', 'Brenner (border IT)', 35, v_axle4, 57.65, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI DAY rate 4+ axles excl. VAT'),

    -- S16 Arlberg (16 km) - Cat2 / Cat3 / Cat4+
    (v_admin, v_at_id, 'S16 Arlberg', 'S16', 'St. Anton am Arlberg', 'Langen am Arlberg', 16, v_axle2, 10.28, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'S16 Arlberg', 'S16', 'St. Anton am Arlberg', 'Langen am Arlberg', 16, v_axle3, 14.35, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT'),
    (v_admin, v_at_id, 'S16 Arlberg', 'S16', 'St. Anton am Arlberg', 'Langen am Arlberg', 16, v_axle4, 21.43, 'EUR', '2026-01-01', true, 'CO2-1 EURO VI excl. VAT');

  RAISE NOTICE 'AT section tolls inserted (21 section rates for 7 segments x 3 axle categories)';
END $$;
