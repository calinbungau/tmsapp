-- ============================================================
-- SEED 2026 TOLL RATES FOR ALL EUROPEAN COUNTRIES
-- Countries AT, DE, HU already have correct data -- NOT touched.
-- ============================================================
DO $$
DECLARE
  v_admin UUID := '00000000-0000-0000-0000-000000000000';
  v_euro6 UUID; v_euro5 UUID; v_euro4 UUID; v_euro3 UUID; v_euro2 UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID; v_axle5p UUID;
  v_co2_1 UUID; v_co2_2 UUID;
  v_bg UUID; v_ro UUID; v_si UUID; v_pl UUID; v_cz UUID; v_sk UUID;
  v_fr UUID; v_it UUID; v_es UUID; v_hr UUID; v_pt UUID; v_nl UUID;
  v_se UUID; v_dk UUID;
BEGIN
  -- Create SE and DK if they don't exist yet
  INSERT INTO toll_countries (admin_id, country_code, country_name, currency, has_distance_based, has_vignette, has_section_based, toll_operator, is_active)
  VALUES (v_admin, 'SE', 'Sweden', 'SEK', false, true, false, 'Eurovignette / Transportstyrelsen', true)
  ON CONFLICT (admin_id, country_code) DO NOTHING;

  INSERT INTO toll_countries (admin_id, country_code, country_name, currency, has_distance_based, has_vignette, has_section_based, toll_operator, is_active)
  VALUES (v_admin, 'DK', 'Denmark', 'DKK', false, true, false, 'Eurovignette / Sund & Baelt', true)
  ON CONFLICT (admin_id, country_code) DO NOTHING;

  -- Resolve category UUIDs once
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE code = 'EURO_4' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_euro2 FROM toll_vehicle_categories WHERE code = 'EURO_2' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = 'AXLE_2' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = 'AXLE_3' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = 'AXLE_4' AND admin_id = v_admin;
  SELECT id INTO v_axle5p FROM toll_vehicle_categories WHERE code = 'AXLE_5_PLUS' AND admin_id = v_admin;
  SELECT id INTO v_co2_1 FROM toll_vehicle_categories WHERE code = 'CO2_1' AND admin_id = v_admin;
  SELECT id INTO v_co2_2 FROM toll_vehicle_categories WHERE code = 'CO2_2' AND admin_id = v_admin;

  -- Resolve country UUIDs
  SELECT id INTO v_bg FROM toll_countries WHERE country_code = 'BG';
  SELECT id INTO v_ro FROM toll_countries WHERE country_code = 'RO';
  SELECT id INTO v_si FROM toll_countries WHERE country_code = 'SI';
  SELECT id INTO v_pl FROM toll_countries WHERE country_code = 'PL';
  SELECT id INTO v_cz FROM toll_countries WHERE country_code = 'CZ';
  SELECT id INTO v_sk FROM toll_countries WHERE country_code = 'SK';
  SELECT id INTO v_fr FROM toll_countries WHERE country_code = 'FR';
  SELECT id INTO v_it FROM toll_countries WHERE country_code = 'IT';
  SELECT id INTO v_es FROM toll_countries WHERE country_code = 'ES';
  SELECT id INTO v_hr FROM toll_countries WHERE country_code = 'HR';
  SELECT id INTO v_pt FROM toll_countries WHERE country_code = 'PT';
  SELECT id INTO v_nl FROM toll_countries WHERE country_code = 'NL';
  SELECT id INTO v_se FROM toll_countries WHERE country_code = 'SE';
  SELECT id INTO v_dk FROM toll_countries WHERE country_code = 'DK';

  -- ============================================================
  -- 1. BULGARIA (BG) - Distance-based, BGN
  -- Source: tollpass.bg April 2025 tariff, >12t highway rates
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'BGN' WHERE id = v_bg;
  DELETE FROM toll_rates WHERE toll_country_id = v_bg;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_bg, v_euro6, v_axle4,   0.39, 0.39, 'BGN', 'motorway', 'BG >12t 4+ax EURO VI Highway', '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro5, v_axle4,   0.40, 0.40, 'BGN', 'motorway', 'BG >12t 4+ax EURO V Highway',  '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro4, v_axle4,   0.41, 0.41, 'BGN', 'motorway', 'BG >12t 4+ax EURO III-IV Hwy', '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro3, v_axle4,   0.41, 0.41, 'BGN', 'motorway', 'BG >12t 4+ax EURO III Hwy',    '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro2, v_axle4,   0.47, 0.47, 'BGN', 'motorway', 'BG >12t 4+ax EURO 0-II Hwy',   '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro6, v_axle2,   0.29, 0.29, 'BGN', 'motorway', 'BG >12t 2ax EURO VI Highway',  '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro6, v_axle3,   0.29, 0.29, 'BGN', 'motorway', 'BG >12t 3ax EURO VI Highway',  '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro6, v_axle5p,  0.39, 0.39, 'BGN', 'motorway', 'BG >12t 5+ax EURO VI Highway', '2025-04-01', 'tollpass.bg April 2025', true),
    (v_admin, v_bg, v_euro5, v_axle5p,  0.40, 0.40, 'BGN', 'motorway', 'BG >12t 5+ax EURO V Highway',  '2025-04-01', 'tollpass.bg April 2025', true);

  -- ============================================================
  -- 2. ROMANIA (RO) - Vignette only (Rovinieta), EUR
  -- Source: roviniete.ro 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = false, has_vignette = true, has_section_based = false, currency = 'EUR' WHERE id = v_ro;
  DELETE FROM toll_rates WHERE toll_country_id = v_ro;
  DELETE FROM toll_vignettes WHERE toll_country_id = v_ro;

  INSERT INTO toll_vignettes (admin_id, toll_country_id, vehicle_type, vignette_type, duration_days, price, currency, vignette_name, notes, valid_from, is_active) VALUES
    (v_admin, v_ro, 'truck', 'daily',   1,    11.00, 'EUR', 'Rovinieta Cat F daily',   '>12t 4+ax, 1 day',     '2025-01-01', true),
    (v_admin, v_ro, 'truck', 'weekly',  7,    55.00, 'EUR', 'Rovinieta Cat F weekly',  '>12t 4+ax, 7 days',    '2025-01-01', true),
    (v_admin, v_ro, 'truck', 'monthly', 30,  121.00, 'EUR', 'Rovinieta Cat F monthly', '>12t 4+ax, 30 days',   '2025-01-01', true),
    (v_admin, v_ro, 'truck', 'annual',  365, 1210.00,'EUR', 'Rovinieta Cat F annual',  '>12t 4+ax, 12 months', '2025-01-01', true);

  -- ============================================================
  -- 3. SLOVENIA (SI) - Distance-based (DarsGo), EUR
  -- Source: dars.si R2/R4/R5 tariff 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'EUR' WHERE id = v_si;
  DELETE FROM toll_rates WHERE toll_country_id = v_si;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_si, v_euro6, v_axle2,  0.1853, 0.1853, 'EUR', 'motorway', 'SI R2 2ax EURO VI', '2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro5, v_axle2,  0.2224, 0.2224, 'EUR', 'motorway', 'SI R2 2ax EURO V',  '2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro6, v_axle3,  0.2965, 0.2965, 'EUR', 'motorway', 'SI R4 3ax EURO VI', '2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro5, v_axle3,  0.3558, 0.3558, 'EUR', 'motorway', 'SI R4 3ax EURO V',  '2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro6, v_axle4,  0.3336, 0.3336, 'EUR', 'motorway', 'SI R5 4+ax EURO VI','2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro5, v_axle4,  0.4003, 0.4003, 'EUR', 'motorway', 'SI R5 4+ax EURO V', '2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro6, v_axle5p, 0.3336, 0.3336, 'EUR', 'motorway', 'SI R5 5+ax EURO VI','2025-01-01', 'dars.si DarsGo', true),
    (v_admin, v_si, v_euro5, v_axle5p, 0.4003, 0.4003, 'EUR', 'motorway', 'SI R5 5+ax EURO V', '2025-01-01', 'dars.si DarsGo', true);

  -- ============================================================
  -- 4. POLAND (PL) - Distance-based (e-TOLL), PLN
  -- Source: etoll.gov.pl 2026
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'PLN' WHERE id = v_pl;
  DELETE FROM toll_rates WHERE toll_country_id = v_pl;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_pl, v_euro6, 0.465, 0.465, 'PLN', 'motorway', 'PL >12t EURO VI A/S 2026',     '2026-01-01', 'etoll.gov.pl 2026', true),
    (v_admin, v_pl, v_euro5, 0.530, 0.530, 'PLN', 'motorway', 'PL >12t EURO V A/S 2026',      '2026-01-01', 'etoll.gov.pl 2026', true),
    (v_admin, v_pl, v_euro4, 0.575, 0.575, 'PLN', 'motorway', 'PL >12t EURO IV A/S 2026',     '2026-01-01', 'etoll.gov.pl 2026', true),
    (v_admin, v_pl, v_euro3, 0.620, 0.620, 'PLN', 'motorway', 'PL >12t EURO III A/S 2026',    '2026-01-01', 'etoll.gov.pl 2026', true),
    (v_admin, v_pl, v_euro2, 0.620, 0.620, 'PLN', 'motorway', 'PL >12t EURO 0-II A/S 2026',   '2026-01-01', 'etoll.gov.pl 2026', true);

  -- ============================================================
  -- 5. CZECH REPUBLIC (CZ) - Distance-based (myto.cz), CZK
  -- Source: trans.info, myto.cz 2026
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'CZK' WHERE id = v_cz;
  DELETE FROM toll_rates WHERE toll_country_id = v_cz;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, co2_class_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_cz, v_euro6, v_axle4,  v_co2_1, 3.43, 3.43, 'CZK', 'motorway', 'CZ >12t 4+ax EURO VI CO2-1 MW 2026', '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro6, v_axle4,  v_co2_2, 2.86, 2.86, 'CZK', 'motorway', 'CZ >12t 4+ax EURO VI CO2-2 MW 2026', '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro6, v_axle5p, v_co2_1, 3.43, 3.43, 'CZK', 'motorway', 'CZ >12t 5+ax EURO VI CO2-1 MW 2026', '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro5, v_axle4,  NULL,    3.98, 3.98, 'CZK', 'motorway', 'CZ >12t 4+ax EURO V MW 2026',        '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro4, v_axle4,  NULL,    4.52, 4.52, 'CZK', 'motorway', 'CZ >12t 4+ax EURO IV MW 2026',       '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro3, v_axle4,  NULL,    4.98, 4.98, 'CZK', 'motorway', 'CZ >12t 4+ax EURO III MW 2026',      '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro6, v_axle2,  v_co2_1, 2.35, 2.35, 'CZK', 'motorway', 'CZ >12t 2ax EURO VI CO2-1 MW 2026', '2026-01-01', 'myto.cz 2026', true),
    (v_admin, v_cz, v_euro6, v_axle3,  v_co2_1, 3.00, 3.00, 'CZK', 'motorway', 'CZ >12t 3ax EURO VI CO2-1 MW 2026', '2026-01-01', 'myto.cz 2026', true);

  -- ============================================================
  -- 6. SLOVAKIA (SK) - Distance-based (emyto.sk), EUR
  -- Source: emyto.sk 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'EUR' WHERE id = v_sk;
  DELETE FROM toll_rates WHERE toll_country_id = v_sk;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_sk, v_euro6, v_axle4,  0.1267, 0.1267, 'EUR', 'motorway', 'SK >12t 4+ax EURO VI MW', '2025-07-01', 'emyto.sk 2025', true),
    (v_admin, v_sk, v_euro5, v_axle4,  0.1526, 0.1526, 'EUR', 'motorway', 'SK >12t 4+ax EURO V MW',  '2025-07-01', 'emyto.sk 2025', true),
    (v_admin, v_sk, v_euro4, v_axle4,  0.1680, 0.1680, 'EUR', 'motorway', 'SK >12t 4+ax EURO IV MW', '2025-07-01', 'emyto.sk 2025', true),
    (v_admin, v_sk, v_euro3, v_axle4,  0.1840, 0.1840, 'EUR', 'motorway', 'SK >12t 4+ax EURO III MW','2025-07-01', 'emyto.sk 2025', true),
    (v_admin, v_sk, v_euro6, v_axle2,  0.0980, 0.0980, 'EUR', 'motorway', 'SK >12t 2ax EURO VI MW',  '2025-07-01', 'emyto.sk 2025', true),
    (v_admin, v_sk, v_euro6, v_axle3,  0.1120, 0.1120, 'EUR', 'motorway', 'SK >12t 3ax EURO VI MW',  '2025-07-01', 'emyto.sk 2025', true),
    (v_admin, v_sk, v_euro6, v_axle5p, 0.1267, 0.1267, 'EUR', 'motorway', 'SK >12t 5+ax EURO VI MW', '2025-07-01', 'emyto.sk 2025', true);

  -- ============================================================
  -- 7. FRANCE (FR) - Concession tolls, EUR
  -- Source: ASFA 2026 tariff (+0.87%), avg per km for truck classes
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, has_section_based = false, currency = 'EUR' WHERE id = v_fr;
  DELETE FROM toll_rates WHERE toll_country_id = v_fr;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_fr, v_euro6, v_axle4,  0.22, 0.22, 'EUR', 'motorway', 'FR Class 4 truck 4+ax avg', '2026-02-01', 'ASFA 2026', true),
    (v_admin, v_fr, v_euro5, v_axle4,  0.22, 0.22, 'EUR', 'motorway', 'FR Class 4 truck EURO V',   '2026-02-01', 'ASFA 2026', true),
    (v_admin, v_fr, v_euro6, v_axle2,  0.17, 0.17, 'EUR', 'motorway', 'FR Class 3 truck 2ax avg',  '2026-02-01', 'ASFA 2026', true),
    (v_admin, v_fr, v_euro6, v_axle5p, 0.22, 0.22, 'EUR', 'motorway', 'FR Class 4 truck 5+ax avg', '2026-02-01', 'ASFA 2026', true);

  -- ============================================================
  -- 8. ITALY (IT) - Section-based (Autostrade), EUR
  -- Source: Autostrade per l'Italia 2025 tariff
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, has_section_based = false, currency = 'EUR' WHERE id = v_it;
  DELETE FROM toll_rates WHERE toll_country_id = v_it;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_it, v_euro6, v_axle4,  0.152, 0.152, 'EUR', 'motorway', 'IT Class 5 (4+ax) avg', '2025-01-01', 'Autostrade 2025', true),
    (v_admin, v_it, v_euro6, v_axle3,  0.127, 0.127, 'EUR', 'motorway', 'IT Class 4 (3ax) avg',  '2025-01-01', 'Autostrade 2025', true),
    (v_admin, v_it, v_euro6, v_axle2,  0.103, 0.103, 'EUR', 'motorway', 'IT Class 3 (2ax) avg',  '2025-01-01', 'Autostrade 2025', true),
    (v_admin, v_it, v_euro6, v_axle5p, 0.152, 0.152, 'EUR', 'motorway', 'IT Class 5 (5+ax) avg', '2025-01-01', 'Autostrade 2025', true);

  -- ============================================================
  -- 9. SPAIN (ES) - Concession autopistas, EUR
  -- Source: inspain.news 2026
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, has_section_based = false, currency = 'EUR' WHERE id = v_es;
  DELETE FROM toll_rates WHERE toll_country_id = v_es;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_es, v_euro6, v_axle4,  0.14, 0.14, 'EUR', 'motorway', 'ES heavy truck 4+ax avg', '2026-01-01', 'inspain.news 2026', true),
    (v_admin, v_es, v_euro6, v_axle2,  0.11, 0.11, 'EUR', 'motorway', 'ES light truck 2ax avg',  '2026-01-01', 'inspain.news 2026', true),
    (v_admin, v_es, v_euro6, v_axle5p, 0.14, 0.14, 'EUR', 'motorway', 'ES heavy truck 5+ax avg', '2026-01-01', 'inspain.news 2026', true);

  -- ============================================================
  -- 10. CROATIA (HR) - Section-based (HAC), EUR
  -- Source: hac.hr 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, has_section_based = false, currency = 'EUR' WHERE id = v_hr;
  DELETE FROM toll_rates WHERE toll_country_id = v_hr;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_hr, v_euro6, v_axle4,  0.13, 0.13, 'EUR', 'motorway', 'HR Cat IV 4+ax avg', '2025-01-01', 'hac.hr 2025', true),
    (v_admin, v_hr, v_euro6, v_axle2,  0.08, 0.08, 'EUR', 'motorway', 'HR Cat II 2ax avg',  '2025-01-01', 'hac.hr 2025', true),
    (v_admin, v_hr, v_euro6, v_axle3,  0.10, 0.10, 'EUR', 'motorway', 'HR Cat III 3ax avg', '2025-01-01', 'hac.hr 2025', true),
    (v_admin, v_hr, v_euro6, v_axle5p, 0.13, 0.13, 'EUR', 'motorway', 'HR Cat IV 5+ax avg', '2025-01-01', 'hac.hr 2025', true);

  -- ============================================================
  -- 11. PORTUGAL (PT) - Section-based (Via Verde), EUR
  -- Source: Via Verde 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, has_section_based = false, currency = 'EUR' WHERE id = v_pt;
  DELETE FROM toll_rates WHERE toll_country_id = v_pt;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_pt, v_euro6, v_axle4,  0.12, 0.12, 'EUR', 'motorway', 'PT Class 4 4+ax avg', '2025-01-01', 'Via Verde 2025', true),
    (v_admin, v_pt, v_euro6, v_axle2,  0.09, 0.09, 'EUR', 'motorway', 'PT Class 2 2ax avg',  '2025-01-01', 'Via Verde 2025', true),
    (v_admin, v_pt, v_euro6, v_axle5p, 0.12, 0.12, 'EUR', 'motorway', 'PT Class 4 5+ax avg', '2025-01-01', 'Via Verde 2025', true);

  -- ============================================================
  -- 12. NETHERLANDS (NL) - Distance-based (truck heffing from July 2026), EUR
  -- Source: vrachtwagenheffing.nl 2026
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'EUR' WHERE id = v_nl;
  DELETE FROM toll_rates WHERE toll_country_id = v_nl;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, co2_class_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_nl, v_euro6, v_co2_1, 0.201, 0.201, 'EUR', 'motorway', 'NL >32t EURO VI CO2-1', '2026-07-01', 'vrachtwagenheffing.nl 2026', true),
    (v_admin, v_nl, v_euro6, v_co2_2, 0.103, 0.103, 'EUR', 'motorway', 'NL >32t EURO VI CO2-2', '2026-07-01', 'vrachtwagenheffing.nl 2026', true),
    (v_admin, v_nl, v_euro5, v_co2_1, 0.236, 0.236, 'EUR', 'motorway', 'NL >32t EURO V CO2-1',  '2026-07-01', 'vrachtwagenheffing.nl 2026', true),
    (v_admin, v_nl, v_euro4, v_co2_1, 0.298, 0.298, 'EUR', 'motorway', 'NL >32t EURO IV CO2-1', '2026-07-01', 'vrachtwagenheffing.nl 2026', true),
    (v_admin, v_nl, v_euro3, v_co2_1, 0.349, 0.349, 'EUR', 'motorway', 'NL >32t EURO III CO2-1','2026-07-01', 'vrachtwagenheffing.nl 2026', true);

  -- ============================================================
  -- 13. SWEDEN (SE) - Eurovignette (time-based), EUR
  -- Source: Eurovignette system 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = false, has_vignette = true, currency = 'EUR' WHERE id = v_se;
  DELETE FROM toll_rates WHERE toll_country_id = v_se;
  DELETE FROM toll_vignettes WHERE toll_country_id = v_se;

  INSERT INTO toll_vignettes (admin_id, toll_country_id, vehicle_type, vignette_type, duration_days, price, currency, vignette_name, notes, valid_from, is_active) VALUES
    (v_admin, v_se, 'truck', 'daily',   1,    12.00, 'EUR', 'Eurovignette daily',   '>12t truck',              '2025-01-01', true),
    (v_admin, v_se, 'truck', 'weekly',  7,    33.00, 'EUR', 'Eurovignette weekly',  '>12t truck',              '2025-01-01', true),
    (v_admin, v_se, 'truck', 'monthly', 30,   96.00, 'EUR', 'Eurovignette monthly', '>12t truck',              '2025-01-01', true),
    (v_admin, v_se, 'truck', 'annual',  365, 1550.00,'EUR', 'Eurovignette annual',  '>12t EURO V/older truck', '2025-01-01', true);

  -- ============================================================
  -- 14. DENMARK (DK) - Distance-based (km toll from 2025), DKK
  -- Source: DK km-based toll system 2025
  -- ============================================================
  UPDATE toll_countries SET has_distance_based = true, has_vignette = false, currency = 'DKK' WHERE id = v_dk;
  DELETE FROM toll_rates WHERE toll_country_id = v_dk;
  DELETE FROM toll_vignettes WHERE toll_country_id = v_dk;

  INSERT INTO toll_rates (admin_id, toll_country_id, emission_class_id, axle_category_id, rate_per_km, total_per_km, currency, road_type, notes, valid_from, source_reference, is_active) VALUES
    (v_admin, v_dk, v_euro6, v_axle4,  1.09, 1.09, 'DKK', 'motorway', 'DK >12t 4+ax EURO VI',  '2025-01-01', 'DK km toll 2025', true),
    (v_admin, v_dk, v_euro5, v_axle4,  1.28, 1.28, 'DKK', 'motorway', 'DK >12t 4+ax EURO V',   '2025-01-01', 'DK km toll 2025', true),
    (v_admin, v_dk, v_euro6, v_axle2,  0.87, 0.87, 'DKK', 'motorway', 'DK >12t 2ax EURO VI',   '2025-01-01', 'DK km toll 2025', true),
    (v_admin, v_dk, v_euro6, v_axle5p, 1.09, 1.09, 'DKK', 'motorway', 'DK >12t 5+ax EURO VI',  '2025-01-01', 'DK km toll 2025', true);

  RAISE NOTICE 'All 2026 rates seeded successfully for BG, RO, SI, PL, CZ, SK, FR, IT, ES, HR, PT, NL, SE, DK';
END $$;
