-- Seed actual toll rates for major European countries
-- Uses correct column names from create-toll-rate-tables.sql + fix-toll-rate-schema.sql

-- =====================================================
-- GERMANY (Maut) - Distance-based, by emission + axle + CO2
-- =====================================================
DO $$
DECLARE
  v_admin UUID;
  v_de_id UUID; v_de_mw UUID; v_de_fed UUID;
  v_euro6 UUID; v_euro5 UUID; v_euro4 UUID; v_euro3 UUID; v_euro0 UUID; v_euro6e UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID; v_axle5 UUID;
  v_w18 UUID; v_w26 UUID; v_w40 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_de_id FROM toll_countries WHERE country_code = 'DE' AND admin_id = v_admin;
  SELECT id INTO v_de_mw FROM toll_road_segments WHERE toll_country_id = v_de_id AND segment_code = 'motorway';
  SELECT id INTO v_de_fed FROM toll_road_segments WHERE toll_country_id = v_de_id AND segment_code = 'federal_road';
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE code = 'EURO_4' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0' AND admin_id = v_admin;
  SELECT id INTO v_euro6e FROM toll_vehicle_categories WHERE code = 'EURO_6E' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle5 FROM toll_vehicle_categories WHERE code = '5_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_w18 FROM toll_vehicle_categories WHERE code = '18T' AND admin_id = v_admin;
  SELECT id INTO v_w26 FROM toll_vehicle_categories WHERE code = '26T' AND admin_id = v_admin;
  SELECT id INTO v_w40 FROM toll_vehicle_categories WHERE code = '40T' AND admin_id = v_admin;

  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference)
  VALUES
    -- Motorway EURO 6
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w18, 0.190, 0.089, 0.011, 0.002, 0.088, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle3, v_w26, 0.211, 0.102, 0.011, 0.002, 0.096, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle4, v_w40, 0.228, 0.112, 0.011, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle5, v_w40, 0.228, 0.112, 0.011, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    -- Motorway EURO 5
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle2, v_w18, 0.198, 0.089, 0.021, 0.002, 0.086, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle3, v_w26, 0.221, 0.102, 0.021, 0.002, 0.096, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle4, v_w40, 0.238, 0.112, 0.021, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle5, v_w40, 0.238, 0.112, 0.021, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    -- Motorway EURO 4
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle2, v_w18, 0.209, 0.089, 0.032, 0.002, 0.086, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle4, v_w40, 0.249, 0.112, 0.032, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    -- Motorway EURO 3
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle2, v_w18, 0.220, 0.089, 0.043, 0.002, 0.086, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle4, v_w40, 0.260, 0.112, 0.043, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    -- Motorway EURO 0-2
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle2, v_w18, 0.236, 0.089, 0.059, 0.002, 0.086, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle4, v_w40, 0.276, 0.112, 0.059, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    -- EURO 6e electric - zero CO2
    (v_admin, v_de_id, v_de_mw, v_euro6e, v_axle2, v_w18, 0.102, 0.089, 0.011, 0.002, 0.000, 'EUR', '2024-01-01', 'BAG Toll Collect 2024 - zero CO2'),
    (v_admin, v_de_id, v_de_mw, v_euro6e, v_axle4, v_w40, 0.125, 0.112, 0.011, 0.002, 0.000, 'EUR', '2024-01-01', 'BAG Toll Collect 2024 - zero CO2'),
    -- Federal roads
    (v_admin, v_de_id, v_de_fed, v_euro6, v_axle2, v_w18, 0.175, 0.074, 0.011, 0.002, 0.088, 'EUR', '2024-01-01', 'BAG Toll Collect 2024'),
    (v_admin, v_de_id, v_de_fed, v_euro6, v_axle4, v_w40, 0.213, 0.097, 0.011, 0.002, 0.103, 'EUR', '2024-01-01', 'BAG Toll Collect 2024');

  RAISE NOTICE 'DE rates seeded';
END $$;

-- =====================================================
-- AUSTRIA (GO-Maut) - Distance-based, by axle + emission
-- =====================================================
DO $$
DECLARE
  v_admin UUID; v_at_id UUID; v_at_mw UUID;
  v_euro6 UUID; v_euro5 UUID; v_euro4 UUID; v_euro3 UUID; v_euro0 UUID; v_euro6e UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_at_id FROM toll_countries WHERE country_code = 'AT' AND admin_id = v_admin;
  SELECT id INTO v_at_mw FROM toll_road_segments WHERE toll_country_id = v_at_id AND segment_code = 'motorway';
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE code = 'EURO_4' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0' AND admin_id = v_admin;
  SELECT id INTO v_euro6e FROM toll_vehicle_categories WHERE code = 'EURO_6E' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;

  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, currency, valid_from, source_reference)
  VALUES
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle2, 0.2174, 0.1974, 0.0200, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle3, 0.3045, 0.2765, 0.0280, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro6, v_axle4, 0.4558, 0.4138, 0.0420, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro5, v_axle2, 0.2234, 0.1974, 0.0260, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro5, v_axle3, 0.3125, 0.2765, 0.0360, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro5, v_axle4, 0.4678, 0.4138, 0.0540, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro4, v_axle2, 0.2374, 0.1974, 0.0400, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro4, v_axle4, 0.4838, 0.4138, 0.0700, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro0, v_axle2, 0.2574, 0.1974, 0.0600, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro0, v_axle4, 0.5038, 0.4138, 0.0900, 'EUR', '2024-01-01', 'ASFINAG 2024'),
    (v_admin, v_at_id, v_at_mw, v_euro6e, v_axle2, 0.1974, 0.1974, 0.0000, 'EUR', '2024-01-01', 'ASFINAG 2024 - zero emission'),
    (v_admin, v_at_id, v_at_mw, v_euro6e, v_axle4, 0.4138, 0.4138, 0.0000, 'EUR', '2024-01-01', 'ASFINAG 2024 - zero emission');

  RAISE NOTICE 'AT rates seeded';
END $$;

-- =====================================================
-- HUNGARY (HU-GO) - Distance-based, by emission + axle
-- =====================================================
DO $$
DECLARE
  v_admin UUID; v_hu_id UUID; v_hu_mw UUID; v_hu_nr UUID;
  v_euro6 UUID; v_euro5 UUID; v_euro3 UUID; v_euro0 UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_hu_id FROM toll_countries WHERE country_code = 'HU' AND admin_id = v_admin;
  SELECT id INTO v_hu_mw FROM toll_road_segments WHERE toll_country_id = v_hu_id AND segment_code = 'motorway';
  SELECT id INTO v_hu_nr FROM toll_road_segments WHERE toll_country_id = v_hu_id AND segment_code = 'national_road';
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;

  -- HU-GO uses HUF but we store EUR equivalent for consistency
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id,
    rate_per_km, currency, valid_from, source_reference)
  VALUES
    -- Motorway J2 (2-axle)
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle2, 0.04974, 'EUR', '2024-01-01', 'HU-GO 2024 J2/EURO VI'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle2, 0.06564, 'EUR', '2024-01-01', 'HU-GO 2024 J2/EURO V'),
    (v_admin, v_hu_id, v_hu_mw, v_euro3, v_axle2, 0.08748, 'EUR', '2024-01-01', 'HU-GO 2024 J2/EURO III'),
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle2, 0.08748, 'EUR', '2024-01-01', 'HU-GO 2024 J2/EURO 0-II'),
    -- Motorway J3 (3-axle)
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle3, 0.06966, 'EUR', '2024-01-01', 'HU-GO 2024 J3/EURO VI'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle3, 0.09192, 'EUR', '2024-01-01', 'HU-GO 2024 J3/EURO V'),
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle3, 0.12252, 'EUR', '2024-01-01', 'HU-GO 2024 J3/EURO 0-II'),
    -- Motorway J4 (4+ axle)
    (v_admin, v_hu_id, v_hu_mw, v_euro6, v_axle4, 0.10950, 'EUR', '2024-01-01', 'HU-GO 2024 J4/EURO VI'),
    (v_admin, v_hu_id, v_hu_mw, v_euro5, v_axle4, 0.14454, 'EUR', '2024-01-01', 'HU-GO 2024 J4/EURO V'),
    (v_admin, v_hu_id, v_hu_mw, v_euro0, v_axle4, 0.19260, 'EUR', '2024-01-01', 'HU-GO 2024 J4/EURO 0-II'),
    -- National roads (lower rates)
    (v_admin, v_hu_id, v_hu_nr, v_euro6, v_axle2, 0.02988, 'EUR', '2024-01-01', 'HU-GO 2024 NR/J2'),
    (v_admin, v_hu_id, v_hu_nr, v_euro6, v_axle4, 0.06570, 'EUR', '2024-01-01', 'HU-GO 2024 NR/J4');

  RAISE NOTICE 'HU rates seeded';
END $$;

-- =====================================================
-- CZECH REPUBLIC (CzechToll) + POLAND (e-TOLL) + SLOVAKIA (SkyToll)
-- =====================================================
DO $$
DECLARE
  v_admin UUID;
  v_cz_id UUID; v_cz_mw UUID; v_pl_id UUID; v_pl_mw UUID; v_sk_id UUID; v_sk_mw UUID;
  v_euro6 UUID; v_euro5 UUID; v_euro0 UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_cz_id FROM toll_countries WHERE country_code = 'CZ' AND admin_id = v_admin;
  SELECT id INTO v_cz_mw FROM toll_road_segments WHERE toll_country_id = v_cz_id AND segment_code = 'motorway';
  SELECT id INTO v_pl_id FROM toll_countries WHERE country_code = 'PL' AND admin_id = v_admin;
  SELECT id INTO v_pl_mw FROM toll_road_segments WHERE toll_country_id = v_pl_id AND segment_code = 'motorway';
  SELECT id INTO v_sk_id FROM toll_countries WHERE country_code = 'SK' AND admin_id = v_admin;
  SELECT id INTO v_sk_mw FROM toll_road_segments WHERE toll_country_id = v_sk_id AND segment_code = 'motorway';
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE code = 'EURO_0' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;

  -- CZ (CZK rates converted to EUR)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id,
    rate_per_km, currency, valid_from, source_reference)
  VALUES
    (v_admin, v_cz_id, v_cz_mw, v_euro6, v_axle2, 0.0836, 'EUR', '2024-01-01', 'CzechToll 2024'),
    (v_admin, v_cz_id, v_cz_mw, v_euro6, v_axle3, 0.1424, 'EUR', '2024-01-01', 'CzechToll 2024'),
    (v_admin, v_cz_id, v_cz_mw, v_euro6, v_axle4, 0.2092, 'EUR', '2024-01-01', 'CzechToll 2024'),
    (v_admin, v_cz_id, v_cz_mw, v_euro5, v_axle2, 0.1300, 'EUR', '2024-01-01', 'CzechToll 2024'),
    (v_admin, v_cz_id, v_cz_mw, v_euro5, v_axle4, 0.3120, 'EUR', '2024-01-01', 'CzechToll 2024'),
    (v_admin, v_cz_id, v_cz_mw, v_euro0, v_axle2, 0.1816, 'EUR', '2024-01-01', 'CzechToll 2024'),
    (v_admin, v_cz_id, v_cz_mw, v_euro0, v_axle4, 0.4368, 'EUR', '2024-01-01', 'CzechToll 2024');

  -- PL (PLN rates converted to EUR)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id,
    rate_per_km, currency, valid_from, source_reference)
  VALUES
    (v_admin, v_pl_id, v_pl_mw, v_euro6, v_axle2, 0.0604, 'EUR', '2024-01-01', 'e-TOLL 2024'),
    (v_admin, v_pl_id, v_pl_mw, v_euro6, v_axle3, 0.0907, 'EUR', '2024-01-01', 'e-TOLL 2024'),
    (v_admin, v_pl_id, v_pl_mw, v_euro6, v_axle4, 0.0907, 'EUR', '2024-01-01', 'e-TOLL 2024'),
    (v_admin, v_pl_id, v_pl_mw, v_euro5, v_axle2, 0.0767, 'EUR', '2024-01-01', 'e-TOLL 2024'),
    (v_admin, v_pl_id, v_pl_mw, v_euro5, v_axle4, 0.1163, 'EUR', '2024-01-01', 'e-TOLL 2024'),
    (v_admin, v_pl_id, v_pl_mw, v_euro0, v_axle2, 0.0930, 'EUR', '2024-01-01', 'e-TOLL 2024'),
    (v_admin, v_pl_id, v_pl_mw, v_euro0, v_axle4, 0.1395, 'EUR', '2024-01-01', 'e-TOLL 2024');

  -- SK
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id,
    rate_per_km, currency, valid_from, source_reference)
  VALUES
    (v_admin, v_sk_id, v_sk_mw, v_euro6, v_axle2, 0.0777, 'EUR', '2024-01-01', 'SkyToll 2024'),
    (v_admin, v_sk_id, v_sk_mw, v_euro6, v_axle3, 0.1083, 'EUR', '2024-01-01', 'SkyToll 2024'),
    (v_admin, v_sk_id, v_sk_mw, v_euro6, v_axle4, 0.1462, 'EUR', '2024-01-01', 'SkyToll 2024'),
    (v_admin, v_sk_id, v_sk_mw, v_euro5, v_axle4, 0.1580, 'EUR', '2024-01-01', 'SkyToll 2024'),
    (v_admin, v_sk_id, v_sk_mw, v_euro0, v_axle4, 0.1859, 'EUR', '2024-01-01', 'SkyToll 2024');

  RAISE NOTICE 'CZ/PL/SK rates seeded';
END $$;

-- =====================================================
-- BELGIUM (Viapass) + SWITZERLAND (LSVA)
-- =====================================================
DO $$
DECLARE
  v_admin UUID;
  v_be_id UUID; v_be_mw UUID; v_ch_id UUID; v_ch_all UUID;
  v_euro6 UUID; v_euro5 UUID; v_euro3 UUID;
  v_axle2 UUID; v_axle4 UUID;
  v_w12 UUID; v_w18 UUID; v_w40 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_be_id FROM toll_countries WHERE country_code = 'BE' AND admin_id = v_admin;
  SELECT id INTO v_be_mw FROM toll_road_segments WHERE toll_country_id = v_be_id AND segment_code = 'motorway';
  SELECT id INTO v_ch_id FROM toll_countries WHERE country_code = 'CH' AND admin_id = v_admin;
  SELECT id INTO v_ch_all FROM toll_road_segments WHERE toll_country_id = v_ch_id AND segment_code = 'all_roads';
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE code = 'EURO_6' AND admin_id = v_admin;
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE code = 'EURO_5' AND admin_id = v_admin;
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE code = 'EURO_3' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_w12 FROM toll_vehicle_categories WHERE code = '12T' AND admin_id = v_admin;
  SELECT id INTO v_w18 FROM toll_vehicle_categories WHERE code = '18T' AND admin_id = v_admin;
  SELECT id INTO v_w40 FROM toll_vehicle_categories WHERE code = '40T' AND admin_id = v_admin;

  -- Belgium Viapass (weight + emission based)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id,
    rate_per_km, currency, valid_from, source_reference)
  VALUES
    (v_admin, v_be_id, v_be_mw, v_euro6, v_axle2, v_w12, 0.074, 'EUR', '2024-01-01', 'Viapass 2024'),
    (v_admin, v_be_id, v_be_mw, v_euro6, v_axle2, v_w40, 0.132, 'EUR', '2024-01-01', 'Viapass 2024'),
    (v_admin, v_be_id, v_be_mw, v_euro5, v_axle2, v_w12, 0.107, 'EUR', '2024-01-01', 'Viapass 2024'),
    (v_admin, v_be_id, v_be_mw, v_euro5, v_axle2, v_w40, 0.178, 'EUR', '2024-01-01', 'Viapass 2024'),
    (v_admin, v_be_id, v_be_mw, v_euro3, v_axle2, v_w12, 0.159, 'EUR', '2024-01-01', 'Viapass 2024'),
    (v_admin, v_be_id, v_be_mw, v_euro3, v_axle2, v_w40, 0.235, 'EUR', '2024-01-01', 'Viapass 2024');

  -- Switzerland LSVA (all roads, weight-based)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id,
    rate_per_km, currency, valid_from, source_reference)
  VALUES
    (v_admin, v_ch_id, v_ch_all, v_euro6, v_axle2, v_w18, 0.0228, 'CHF', '2024-01-01', 'BAZG LSVA 2024'),
    (v_admin, v_ch_id, v_ch_all, v_euro6, v_axle4, v_w40, 0.0310, 'CHF', '2024-01-01', 'BAZG LSVA 2024'),
    (v_admin, v_ch_id, v_ch_all, v_euro5, v_axle4, v_w40, 0.0310, 'CHF', '2024-01-01', 'BAZG LSVA 2024'),
    (v_admin, v_ch_id, v_ch_all, v_euro3, v_axle4, v_w40, 0.0370, 'CHF', '2024-01-01', 'BAZG LSVA 2024');

  RAISE NOTICE 'BE/CH rates seeded';
END $$;

-- =====================================================
-- VIGNETTES (Romania, Bulgaria, Slovenia)
-- =====================================================
DO $$
DECLARE
  v_admin UUID;
  v_ro_id UUID; v_bg_id UUID; v_si_id UUID;
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID;
  v_w12 UUID; v_w40 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_ro_id FROM toll_countries WHERE country_code = 'RO' AND admin_id = v_admin;
  SELECT id INTO v_bg_id FROM toll_countries WHERE country_code = 'BG' AND admin_id = v_admin;
  SELECT id INTO v_si_id FROM toll_countries WHERE country_code = 'SI' AND admin_id = v_admin;
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE code = '2_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE code = '3_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;
  SELECT id INTO v_w12 FROM toll_vehicle_categories WHERE code = '12T' AND admin_id = v_admin;
  SELECT id INTO v_w40 FROM toll_vehicle_categories WHERE code = '40T' AND admin_id = v_admin;

  -- Romania Rovinieta
  INSERT INTO toll_vignettes (admin_id, toll_country_id, vignette_name, vignette_type, vehicle_type, axle_category_id,
    price, currency, duration_days, valid_from, source_reference)
  VALUES
    (v_admin, v_ro_id, 'Rovinieta 1 day 2-axle',   'daily',   'truck', v_axle2, 7.00,   'EUR', 1,   '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 7 days 2-axle',  'weekly',  'truck', v_axle2, 16.00,  'EUR', 7,   '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 30 days 2-axle', 'monthly', 'truck', v_axle2, 32.00,  'EUR', 30,  '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta annual 2-axle',  'annual',  'truck', v_axle2, 320.00, 'EUR', 365, '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 1 day 3-axle',   'daily',   'truck', v_axle3, 12.00,  'EUR', 1,   '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 7 days 3-axle',  'weekly',  'truck', v_axle3, 28.00,  'EUR', 7,   '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 30 days 3-axle', 'monthly', 'truck', v_axle3, 56.00,  'EUR', 30,  '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta annual 3-axle',  'annual',  'truck', v_axle3, 560.00, 'EUR', 365, '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 1 day 4-axle',   'daily',   'truck', v_axle4, 16.00,  'EUR', 1,   '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 7 days 4-axle',  'weekly',  'truck', v_axle4, 37.00,  'EUR', 7,   '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta 30 days 4-axle', 'monthly', 'truck', v_axle4, 72.00,  'EUR', 30,  '2024-01-01', 'CNAIR 2024'),
    (v_admin, v_ro_id, 'Rovinieta annual 4-axle',  'annual',  'truck', v_axle4, 720.00, 'EUR', 365, '2024-01-01', 'CNAIR 2024');

  -- Bulgaria e-Vignette
  INSERT INTO toll_vignettes (admin_id, toll_country_id, vignette_name, vignette_type, vehicle_type, axle_category_id,
    price, currency, duration_days, valid_from, source_reference)
  VALUES
    (v_admin, v_bg_id, 'e-Vinieta 1 day 2-axle',  'daily',   'truck', v_axle2, 13.00,  'EUR', 1,   '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta 7 days 2-axle', 'weekly',  'truck', v_axle2, 31.00,  'EUR', 7,   '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta 30 days 2-axle','monthly', 'truck', v_axle2, 62.00,  'EUR', 30,  '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta annual 2-axle', 'annual',  'truck', v_axle2, 557.00, 'EUR', 365, '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta 1 day 4-axle',  'daily',   'truck', v_axle4, 22.00,  'EUR', 1,   '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta 7 days 4-axle', 'weekly',  'truck', v_axle4, 52.00,  'EUR', 7,   '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta 30 days 4-axle','monthly', 'truck', v_axle4, 104.00, 'EUR', 30,  '2024-01-01', 'AGP Bulgaria 2024'),
    (v_admin, v_bg_id, 'e-Vinieta annual 4-axle', 'annual',  'truck', v_axle4, 930.00, 'EUR', 365, '2024-01-01', 'AGP Bulgaria 2024');

  -- Slovenia DarsGo
  INSERT INTO toll_vignettes (admin_id, toll_country_id, vignette_name, vignette_type, vehicle_type, axle_category_id,
    price, currency, duration_days, valid_from, source_reference)
  VALUES
    (v_admin, v_si_id, 'DarsGo weekly 2-axle',  'weekly',  'truck', v_axle2, 55.00,  'EUR', 7,   '2024-01-01', 'DARS 2024'),
    (v_admin, v_si_id, 'DarsGo monthly 2-axle', 'monthly', 'truck', v_axle2, 165.00, 'EUR', 30,  '2024-01-01', 'DARS 2024'),
    (v_admin, v_si_id, 'DarsGo annual 2-axle',  'annual',  'truck', v_axle2, 220.00, 'EUR', 365, '2024-01-01', 'DARS 2024'),
    (v_admin, v_si_id, 'DarsGo weekly 4-axle',  'weekly',  'truck', v_axle4, 85.00,  'EUR', 7,   '2024-01-01', 'DARS 2024'),
    (v_admin, v_si_id, 'DarsGo monthly 4-axle', 'monthly', 'truck', v_axle4, 265.00, 'EUR', 30,  '2024-01-01', 'DARS 2024'),
    (v_admin, v_si_id, 'DarsGo annual 4-axle',  'annual',  'truck', v_axle4, 400.00, 'EUR', 365, '2024-01-01', 'DARS 2024');

  RAISE NOTICE 'Vignettes seeded';
END $$;

-- =====================================================
-- SPECIAL CHARGES (tunnels, bridges, mountain passes)
-- =====================================================
DO $$
DECLARE
  v_admin UUID;
  v_at_id UUID; v_fr_id UUID; v_it_id UUID;
  v_axle4 UUID;
BEGIN
  SELECT admin_id INTO v_admin FROM toll_countries LIMIT 1;
  SELECT id INTO v_at_id FROM toll_countries WHERE country_code = 'AT' AND admin_id = v_admin;
  SELECT id INTO v_fr_id FROM toll_countries WHERE country_code = 'FR' AND admin_id = v_admin;
  SELECT id INTO v_it_id FROM toll_countries WHERE country_code = 'IT' AND admin_id = v_admin;
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE code = '4_AXLE' AND admin_id = v_admin;

  INSERT INTO toll_special_charges (admin_id, toll_country_id, charge_type, name, location, axle_category_id,
    price, currency, is_round_trip, valid_from, notes)
  VALUES
    (v_admin, v_at_id, 'mountain_pass', 'Brenner Pass',    'Innsbruck - Brennero (AT/IT)',  v_axle4, 110.00, 'EUR', false, '2024-01-01', 'One-way truck toll A13 Brenner Autobahn'),
    (v_admin, v_at_id, 'tunnel',        'Arlberg Tunnel',   'St. Anton - Langen',           v_axle4, 45.00,  'EUR', false, '2024-01-01', 'One-way truck toll'),
    (v_admin, v_at_id, 'tunnel',        'Karawanken Tunnel','AT-SI border',                  v_axle4, 28.00,  'EUR', false, '2024-01-01', 'One-way truck toll'),
    (v_admin, v_at_id, 'tunnel',        'Tauern Tunnel',    'Flachau - Zederhaus',           v_axle4, 36.50,  'EUR', false, '2024-01-01', 'One-way truck toll'),
    (v_admin, v_fr_id, 'tunnel',        'Channel Tunnel',   'Calais - Folkestone (FR/UK)',   v_axle4, 350.00, 'EUR', true,  '2024-01-01', 'Freight round-trip crossing'),
    (v_admin, v_fr_id, 'tunnel',        'Mont Blanc Tunnel','Chamonix - Courmayeur (FR/IT)', v_axle4, 320.00, 'EUR', true,  '2024-01-01', 'Round-trip truck toll'),
    (v_admin, v_fr_id, 'tunnel',        'Frejus Tunnel',    'Modane - Bardonecchia (FR/IT)', v_axle4, 310.00, 'EUR', true,  '2024-01-01', 'Round-trip truck toll');

  RAISE NOTICE 'Special charges seeded';
END $$;
