-- =====================================================
-- TOLL RATE SEED DATA - European toll systems
-- Uses a placeholder admin_id that should be updated
-- =====================================================

-- Helper: use a fixed UUID for the seed admin (will be overridden by actual admin)
-- We'll use '00000000-0000-0000-0000-000000000000' as placeholder

-- ─── Vehicle Categories (shared across all countries) ───
INSERT INTO toll_vehicle_categories (admin_id, category_type, code, name, sort_order) VALUES
-- Emission Classes
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_0', 'Euro 0 (Pre-Euro)', 0),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_1', 'Euro I', 1),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_2', 'Euro II', 2),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_3', 'Euro III', 3),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_4', 'Euro IV', 4),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_5', 'Euro V', 5),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_6', 'Euro VI', 6),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_EEV', 'Euro EEV', 7),
('00000000-0000-0000-0000-000000000000', 'emission_class', 'EURO_ZERO', 'Zero Emission (Electric/H2)', 8),
-- Axle Categories
('00000000-0000-0000-0000-000000000000', 'axle_category', 'AXLE_2', '2 Axles', 0),
('00000000-0000-0000-0000-000000000000', 'axle_category', 'AXLE_3', '3 Axles', 1),
('00000000-0000-0000-0000-000000000000', 'axle_category', 'AXLE_4', '4 Axles', 2),
('00000000-0000-0000-0000-000000000000', 'axle_category', 'AXLE_5_PLUS', '5+ Axles', 3),
-- Weight Classes
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_7_5T', 'Up to 7.5t', 0),
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_7_5T_12T', '7.5t - 12t', 1),
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_12T_18T', '12t - 18t', 2),
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_18T_26T', '18t - 26t', 3),
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_26T_32T', '26t - 32t', 4),
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_32T_40T', '32t - 40t', 5),
('00000000-0000-0000-0000-000000000000', 'weight_class', 'W_40T_PLUS', 'Over 40t', 6),
-- CO2 Classes (new EU regulation)
('00000000-0000-0000-0000-000000000000', 'co2_class', 'CO2_1', 'CO2 Class 1 (highest)', 0),
('00000000-0000-0000-0000-000000000000', 'co2_class', 'CO2_2', 'CO2 Class 2', 1),
('00000000-0000-0000-0000-000000000000', 'co2_class', 'CO2_3', 'CO2 Class 3', 2),
('00000000-0000-0000-0000-000000000000', 'co2_class', 'CO2_4', 'CO2 Class 4', 3),
('00000000-0000-0000-0000-000000000000', 'co2_class', 'CO2_5', 'CO2 Class 5 (zero emission)', 4)
ON CONFLICT DO NOTHING;

-- ─── Countries with toll systems ───
INSERT INTO toll_countries (admin_id, country_code, country_name, currency, has_distance_based, has_vignette, has_section_based, toll_operator, toll_operator_url, last_rate_update) VALUES
('00000000-0000-0000-0000-000000000000', 'DE', 'Germany', 'EUR', true, false, false, 'Toll Collect GmbH', 'https://www.toll-collect.de', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'AT', 'Austria', 'EUR', true, false, false, 'ASFINAG GO-Maut', 'https://www.go-maut.at', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'HU', 'Hungary', 'HUF', true, false, false, 'HU-GO (NMTD)', 'https://www.hu-go.hu', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'CZ', 'Czech Republic', 'CZK', true, false, false, 'CzechToll (myto.cz)', 'https://www.mytocz.eu', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'SK', 'Slovakia', 'EUR', true, false, false, 'SkyToll', 'https://www.emyto.sk', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'PL', 'Poland', 'PLN', true, false, false, 'e-TOLL (KAS)', 'https://etoll.gov.pl', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'RO', 'Romania', 'RON', true, true, false, 'RO e-Toll / CNAIR', 'https://www.rovinietaonline.ro', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'BG', 'Bulgaria', 'BGN', true, true, false, 'BGToll / API', 'https://www.bgtoll.bg', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'FR', 'France', 'EUR', false, false, true, 'Various concessionaires', 'https://www.autoroutes.fr', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'IT', 'Italy', 'EUR', true, false, true, 'Autostrade per l''Italia', 'https://www.autostrade.it', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'ES', 'Spain', 'EUR', false, false, true, 'Various concessionaires', 'https://www.autopistas.com', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'BE', 'Belgium', 'EUR', true, false, false, 'Viapass', 'https://www.viapass.be', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'NL', 'Netherlands', 'EUR', false, true, false, 'Eurovignet', 'https://www.eurovignet.eu', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'CH', 'Switzerland', 'CHF', true, false, false, 'BAZG/LSVA', 'https://www.bazg.admin.ch', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'SI', 'Slovenia', 'EUR', true, false, false, 'DarsGo', 'https://www.darsgo.si', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'HR', 'Croatia', 'EUR', false, false, true, 'HAC / ARZ', 'https://www.hac.hr', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'RS', 'Serbia', 'RSD', false, false, true, 'JP Putevi Srbije', 'https://www.putevi-srbije.rs', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'PT', 'Portugal', 'EUR', false, false, true, 'Via Verde', 'https://www.viaverde.pt', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'GR', 'Greece', 'EUR', false, false, true, 'Various concessionaires', 'https://www.nea-odos.gr', '2024-01-01'),
('00000000-0000-0000-0000-000000000000', 'TR', 'Turkey', 'TRY', false, false, true, 'HGS/OGS', 'https://www.kgm.gov.tr', '2024-01-01')
ON CONFLICT DO NOTHING;

-- ─── Road Segments per country ───
-- Germany
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway (Autobahn)', 'motorway', 'Bundesautobahnen (BAB)' FROM toll_countries WHERE country_code = 'DE'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Federal Road (Bundesstrasse)', 'federal', 'Bundesstrassen' FROM toll_countries WHERE country_code = 'DE'
ON CONFLICT DO NOTHING;

-- Austria
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway (Autobahn)', 'motorway', 'Autobahnen' FROM toll_countries WHERE country_code = 'AT'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Expressway (Schnellstrasse)', 'expressway', 'Schnellstrassen' FROM toll_countries WHERE country_code = 'AT'
ON CONFLICT DO NOTHING;

-- Hungary
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Autopalya' FROM toll_countries WHERE country_code = 'HU'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Expressway', 'expressway', 'Autoút' FROM toll_countries WHERE country_code = 'HU'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Main Road', 'main_road', 'Fout (National Main Roads)' FROM toll_countries WHERE country_code = 'HU'
ON CONFLICT DO NOTHING;

-- Czech Republic
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Dalnice' FROM toll_countries WHERE country_code = 'CZ'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Expressway', 'expressway', 'Rychlostnl silnice' FROM toll_countries WHERE country_code = 'CZ'
ON CONFLICT DO NOTHING;

-- Slovakia
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Dialnica' FROM toll_countries WHERE country_code = 'SK'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Expressway', 'expressway', 'Rychlostna cesta' FROM toll_countries WHERE country_code = 'SK'
ON CONFLICT DO NOTHING;

-- Poland
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Autostrada' FROM toll_countries WHERE country_code = 'PL'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Expressway', 'expressway', 'Droga ekspresowa' FROM toll_countries WHERE country_code = 'PL'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'National Road', 'national', 'Droga krajowa' FROM toll_countries WHERE country_code = 'PL'
ON CONFLICT DO NOTHING;

-- Belgium
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'All Roads', 'all_roads', 'Per-km charge on all roads (Viapass)' FROM toll_countries WHERE country_code = 'BE'
ON CONFLICT DO NOTHING;

-- Switzerland
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'All Roads', 'all_roads', 'LSVA applies on all roads' FROM toll_countries WHERE country_code = 'CH'
ON CONFLICT DO NOTHING;

-- Slovenia
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Avtocesta' FROM toll_countries WHERE country_code = 'SI'
ON CONFLICT DO NOTHING;

-- Romania
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Autostrada' FROM toll_countries WHERE country_code = 'RO'
ON CONFLICT DO NOTHING;
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'National Road', 'national', 'Drum national' FROM toll_countries WHERE country_code = 'RO'
ON CONFLICT DO NOTHING;

-- Bulgaria
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway', 'motorway', 'Avtomagistrala' FROM toll_countries WHERE country_code = 'BG'
ON CONFLICT DO NOTHING;

-- Italy (distance-based component)
INSERT INTO toll_road_segments (admin_id, toll_country_id, segment_name, segment_code, description)
SELECT '00000000-0000-0000-0000-000000000000', id, 'Motorway (Autostrada)', 'motorway', 'Autostrada' FROM toll_countries WHERE country_code = 'IT'
ON CONFLICT DO NOTHING;
