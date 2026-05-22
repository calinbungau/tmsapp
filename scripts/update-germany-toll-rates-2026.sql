-- Germany (DE) Toll Rates - Official Toll Collect rates since July 1, 2024
-- Source: https://www.toll-collect.de/en/toll_collect/bezahlen/maut_tarife/p1745_mauttarife_07_2024.html
-- CO2 Class 5 (zero emission) from Jan 1 2026: 75% infrastructure + air/noise + 0 CO2
-- All rates in EUR/km (converted from cent/km in official table)
-- NOTE: Germany tolls ALL roads (Autobahn + federal), same rate everywhere
-- FOCUS: >18t trucks (main use case for TMS). Lighter classes included for completeness.

DO $$
DECLARE
  v_admin UUID := '00000000-0000-0000-0000-000000000000';
  v_de_id UUID;
  v_de_mw UUID;
  -- Emission classes
  v_euro0 UUID; v_euro1 UUID; v_euro2 UUID; v_euro3 UUID;
  v_euro4 UUID; v_euro5 UUID; v_euro6 UUID;
  -- Axle categories
  v_axle2 UUID; v_axle3 UUID; v_axle4 UUID; v_axle5 UUID;
  -- Weight classes
  v_w3_5 UUID; v_w7_5 UUID; v_w12 UUID; v_w18 UUID;
  -- CO2 classes
  v_co2_1 UUID; v_co2_2 UUID; v_co2_3 UUID; v_co2_4 UUID; v_co2_5 UUID;
BEGIN
  SELECT id INTO v_de_id FROM toll_countries WHERE country_code = 'DE' AND admin_id = v_admin;
  SELECT id INTO v_de_mw FROM toll_road_segments WHERE toll_country_id = v_de_id AND segment_code = 'motorway';

  -- Emission classes
  SELECT id INTO v_euro0 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_0';
  SELECT id INTO v_euro1 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_1';
  SELECT id INTO v_euro2 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_2';
  SELECT id INTO v_euro3 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_3';
  SELECT id INTO v_euro4 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_4';
  SELECT id INTO v_euro5 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_5';
  SELECT id INTO v_euro6 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'EURO_6';

  -- Axle categories
  SELECT id INTO v_axle2 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'AXLE_2';
  SELECT id INTO v_axle3 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'AXLE_3';
  SELECT id INTO v_axle4 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'AXLE_4';
  SELECT id INTO v_axle5 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'AXLE_5_PLUS';

  -- Weight classes (ensure 3.5-7.5t exists)
  INSERT INTO toll_vehicle_categories (admin_id, category_type, code, name, sort_order)
    VALUES (v_admin, 'weight_class', 'W_3_5T_7_5T', '3.5t - 7.5t', -1)
    ON CONFLICT DO NOTHING;

  SELECT id INTO v_w3_5 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'W_3_5T_7_5T';
  SELECT id INTO v_w7_5 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'W_7_5T_12T';
  SELECT id INTO v_w12 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'W_12T_18T';
  SELECT id INTO v_w18 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'W_18T_26T';

  -- CO2 classes
  SELECT id INTO v_co2_1 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'CO2_1';
  SELECT id INTO v_co2_2 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'CO2_2';
  SELECT id INTO v_co2_3 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'CO2_3';
  SELECT id INTO v_co2_4 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'CO2_4';
  SELECT id INTO v_co2_5 FROM toll_vehicle_categories WHERE admin_id = v_admin AND code = 'CO2_5';

  -- Delete old Germany rates
  DELETE FROM toll_rates WHERE toll_country_id = v_de_id;

  -- ============================================================
  -- CO2 CLASS 1 - All emission classes
  -- weight_class_id differentiates lighter categories
  -- >18t uses axle_category_id (3/4/5+ axles)
  -- ============================================================

  -- 3.5 - 7.49t (weight_class=W_3_5T_7_5T, axle=2)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.102, 0.014, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO0 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro1, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.102, 0.014, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO1 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro2, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.098, 0.014, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO2 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.079, 0.014, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO3 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.055, 0.014, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO4 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.043, 0.014, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO5/EEV CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w3_5, v_co2_1, 0, 0.052, 0.011, 0.014, 0.074, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO6 CO2-1');

  -- 7.5 - 11.99t (weight_class=W_7_5T_12T, axle=2)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.114, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO0 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro1, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.114, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO1 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro2, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.113, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO2 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.088, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO3 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.059, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO4 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.043, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO5/EEV CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w7_5, v_co2_1, 0, 0.066, 0.015, 0.016, 0.080, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO6 CO2-1');

  -- 12 - 18t (weight_class=W_12T_18T, axle=2)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.123, 0.016, 0.104, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO0 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro1, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.123, 0.016, 0.104, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO1 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro2, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.121, 0.016, 0.104, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO2 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.101, 0.016, 0.104, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO3 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.063, 0.016, 0.100, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO4 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.052, 0.016, 0.100, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO5/EEV CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w12, v_co2_1, 0, 0.107, 0.015, 0.016, 0.100, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO6 CO2-1');

  -- >18t up to 3 axles (weight_class=W_18T, axle=3)
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.169, 0.016, 0.158, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO0 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro1, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.169, 0.016, 0.158, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO1 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro2, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.164, 0.016, 0.138, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO2 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.134, 0.016, 0.138, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO3 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.080, 0.016, 0.134, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO4 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.062, 0.016, 0.134, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO5/EEV CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle3, v_w18, v_co2_1, 0, 0.141, 0.022, 0.016, 0.124, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO6 CO2-1');

  -- >18t with 4 axles
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.187, 0.012, 0.158, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO0 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro1, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.187, 0.012, 0.158, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO1 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro2, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.182, 0.012, 0.138, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO2 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.149, 0.012, 0.138, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO3 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.087, 0.012, 0.134, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO4 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.062, 0.012, 0.134, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO5/EEV CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle4, v_w18, v_co2_1, 0, 0.155, 0.023, 0.012, 0.134, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO6 CO2-1');

  -- >18t with 5+ axles
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro0, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.187, 0.012, 0.162, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO0 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro1, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.187, 0.012, 0.162, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO1 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro2, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.182, 0.012, 0.162, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO2 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro3, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.149, 0.012, 0.162, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO3 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro4, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.087, 0.012, 0.160, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO4 CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro5, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.062, 0.012, 0.160, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO5/EEV CO2-1'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle5, v_w18, v_co2_1, 0, 0.155, 0.023, 0.012, 0.158, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO6 CO2-1');

  -- ============================================================
  -- CO2 CLASS 2 - EURO 6 only (official table only publishes EURO 6 for classes 2-4)
  -- ============================================================
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w3_5, v_co2_2, 0, 0.052, 0.011, 0.014, 0.070, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO6 CO2-2'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w7_5, v_co2_2, 0, 0.066, 0.015, 0.016, 0.076, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO6 CO2-2'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w12,  v_co2_2, 0, 0.107, 0.015, 0.016, 0.096, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO6 CO2-2'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle3, v_w18,  v_co2_2, 0, 0.141, 0.022, 0.016, 0.118, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO6 CO2-2'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle4, v_w18,  v_co2_2, 0, 0.155, 0.023, 0.012, 0.128, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO6 CO2-2'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle5, v_w18,  v_co2_2, 0, 0.155, 0.023, 0.012, 0.150, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO6 CO2-2');

  -- ============================================================
  -- CO2 CLASS 3 - EURO 6 only
  -- ============================================================
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w3_5, v_co2_3, 0, 0.052, 0.011, 0.014, 0.067, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO6 CO2-3'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w7_5, v_co2_3, 0, 0.066, 0.015, 0.016, 0.072, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO6 CO2-3'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w12,  v_co2_3, 0, 0.107, 0.015, 0.016, 0.090, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO6 CO2-3'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle3, v_w18,  v_co2_3, 0, 0.141, 0.022, 0.016, 0.111, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO6 CO2-3'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle4, v_w18,  v_co2_3, 0, 0.155, 0.023, 0.012, 0.120, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO6 CO2-3'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle5, v_w18,  v_co2_3, 0, 0.155, 0.023, 0.012, 0.142, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO6 CO2-3');

  -- ============================================================
  -- CO2 CLASS 4 - EURO 6 only
  -- ============================================================
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w3_5, v_co2_4, 0, 0.052, 0.011, 0.014, 0.037, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 3.5-7.5t EURO6 CO2-4'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w7_5, v_co2_4, 0, 0.066, 0.015, 0.016, 0.040, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 7.5-12t EURO6 CO2-4'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w12,  v_co2_4, 0, 0.107, 0.015, 0.016, 0.050, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE 12-18t EURO6 CO2-4'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle3, v_w18,  v_co2_4, 0, 0.141, 0.022, 0.016, 0.063, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 3ax EURO6 CO2-4'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle4, v_w18,  v_co2_4, 0, 0.155, 0.023, 0.012, 0.068, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 4ax EURO6 CO2-4'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle5, v_w18,  v_co2_4, 0, 0.155, 0.023, 0.012, 0.079, 'EUR', '2024-07-01', 'Toll Collect July 2024', 'DE >18t 5ax EURO6 CO2-4');

  -- ============================================================
  -- CO2 CLASS 5 (zero emission) - from Jan 1, 2026
  -- 75% infrastructure + full air pollution + full noise + 0 CO2
  -- Source: BFStrMG + Toll Collect FAQ on alternative drives
  -- ============================================================
  INSERT INTO toll_rates (admin_id, toll_country_id, road_segment_id, emission_class_id, axle_category_id, weight_class_id, co2_class_id,
    rate_per_km, infrastructure_rate, air_pollution_rate, noise_rate, co2_surcharge, currency, valid_from, source_reference, notes)
  VALUES
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w3_5, v_co2_5, 0, 0.039,    0.011, 0.014, 0.000, 'EUR', '2026-01-01', 'BFStrMG 75% infra zero-em', 'DE 3.5-7.5t CO2-5 zero-em'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w7_5, v_co2_5, 0, 0.0495,   0.015, 0.016, 0.000, 'EUR', '2026-01-01', 'BFStrMG 75% infra zero-em', 'DE 7.5-12t CO2-5 zero-em'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle2, v_w12,  v_co2_5, 0, 0.08025,  0.015, 0.016, 0.000, 'EUR', '2026-01-01', 'BFStrMG 75% infra zero-em', 'DE 12-18t CO2-5 zero-em'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle3, v_w18,  v_co2_5, 0, 0.10575,  0.022, 0.016, 0.000, 'EUR', '2026-01-01', 'BFStrMG 75% infra zero-em', 'DE >18t 3ax CO2-5 zero-em'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle4, v_w18,  v_co2_5, 0, 0.11625,  0.023, 0.012, 0.000, 'EUR', '2026-01-01', 'BFStrMG 75% infra zero-em', 'DE >18t 4ax CO2-5 zero-em'),
    (v_admin, v_de_id, v_de_mw, v_euro6, v_axle5, v_w18,  v_co2_5, 0, 0.11625,  0.023, 0.012, 0.000, 'EUR', '2026-01-01', 'BFStrMG 75% infra zero-em', 'DE >18t 5ax CO2-5 zero-em');

  RAISE NOTICE 'Germany toll rates updated: 59 CO2-1 rates (7 emission x 6 weight/axle + 3 lighter) + 24 CO2-2/3/4 rates + 6 CO2-5 rates = 65 total';
END $$;
