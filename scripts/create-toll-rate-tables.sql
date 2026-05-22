-- =====================================================
-- TOLL RATE MANAGER - Database Schema
-- Scalable European road toll rate management
-- =====================================================

-- 1. Toll Countries - master list of countries with toll systems
CREATE TABLE IF NOT EXISTS toll_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  country_code CHAR(2) NOT NULL,           -- ISO 3166-1 alpha-2 (DE, AT, HU, etc.)
  country_name TEXT NOT NULL,               -- Germany, Austria, Hungary, etc.
  currency TEXT NOT NULL DEFAULT 'EUR',     -- Local toll currency
  has_distance_based BOOLEAN DEFAULT false, -- Has per-km toll system
  has_vignette BOOLEAN DEFAULT false,       -- Has vignette/time-based system
  has_section_based BOOLEAN DEFAULT false,  -- Has per-section tolls (FR, IT)
  toll_operator TEXT,                       -- e.g. "Toll Collect", "ASFINAG", "HU-GO"
  toll_operator_url TEXT,                   -- Official URL for rate updates
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  last_rate_update DATE,                    -- When rates were last verified/updated
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(admin_id, country_code)
);

-- 2. Toll Vehicle Categories - emission classes and axle categories
-- These are reusable across all countries
CREATE TABLE IF NOT EXISTS toll_vehicle_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('emission_class', 'axle_category', 'weight_class', 'co2_class')),
  code TEXT NOT NULL,                       -- e.g. "EURO_6", "2_AXLE", "12T_18T", "CO2_1"
  name TEXT NOT NULL,                       -- e.g. "Euro 6", "2 Axles", "12t - 18t", "CO2 Class 1"
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(admin_id, category_type, code)
);

-- 3. Toll Rate Segments - defines what types of roads are tolled per country
-- e.g. "Autobahn" in DE, "Schnellstrasse" in AT, "National Roads" in CZ
CREATE TABLE IF NOT EXISTS toll_road_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  toll_country_id UUID NOT NULL REFERENCES toll_countries(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL,               -- e.g. "Motorway", "Expressway", "National Road"
  segment_code TEXT NOT NULL,               -- e.g. "motorway", "expressway", "national"
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(toll_country_id, segment_code)
);

-- 4. Toll Rates - the actual per-km rates
-- Each rate is a combination of: country + road segment + emission class + axle category + (optional) weight/co2
CREATE TABLE IF NOT EXISTS toll_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  toll_country_id UUID NOT NULL REFERENCES toll_countries(id) ON DELETE CASCADE,
  road_segment_id UUID REFERENCES toll_road_segments(id) ON DELETE SET NULL,
  emission_class_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  axle_category_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  weight_class_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  co2_class_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  rate_per_km NUMERIC(10, 5) NOT NULL,      -- Rate in the country's toll currency
  currency TEXT NOT NULL DEFAULT 'EUR',
  surcharge_per_km NUMERIC(10, 5) DEFAULT 0, -- Additional surcharges (CO2, infrastructure, etc.)
  total_per_km NUMERIC(10, 5) GENERATED ALWAYS AS (rate_per_km + surcharge_per_km) STORED,
  valid_from DATE NOT NULL,                  -- Effective date
  valid_to DATE,                             -- NULL = currently active
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups: country + active + date range
CREATE INDEX IF NOT EXISTS idx_toll_rates_lookup 
  ON toll_rates(toll_country_id, is_active, valid_from, valid_to);

-- 5. Toll Vignettes - time-based flat-fee tolls
CREATE TABLE IF NOT EXISTS toll_vignettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  toll_country_id UUID NOT NULL REFERENCES toll_countries(id) ON DELETE CASCADE,
  vignette_type TEXT NOT NULL CHECK (vignette_type IN ('daily', 'weekly', 'monthly', 'annual', '10_day', 'weekend', 'other')),
  vehicle_type TEXT NOT NULL DEFAULT 'truck', -- truck, truck_trailer, bus, etc.
  axle_category_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  emission_class_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  weight_class_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  duration_days INTEGER,                     -- How many days the vignette is valid
  valid_from DATE NOT NULL,
  valid_to DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Toll Section Rates - for section-based toll systems (France, Italy, Spain)
CREATE TABLE IF NOT EXISTS toll_section_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  toll_country_id UUID NOT NULL REFERENCES toll_countries(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,                -- e.g. "A1 Paris-Lyon", "A7 Lyon-Marseille"
  road_number TEXT,                          -- e.g. "A1", "A7", "E45"
  from_location TEXT NOT NULL,               -- Entry point
  to_location TEXT NOT NULL,                 -- Exit point
  distance_km NUMERIC(8, 1),
  axle_category_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  price NUMERIC(10, 2) NOT NULL,             -- Fixed price for this section
  currency TEXT NOT NULL DEFAULT 'EUR',
  valid_from DATE NOT NULL,
  valid_to DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Toll Special Charges - bridges, tunnels, ferries, etc.
CREATE TABLE IF NOT EXISTS toll_special_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  toll_country_id UUID NOT NULL REFERENCES toll_countries(id) ON DELETE CASCADE,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('bridge', 'tunnel', 'ferry', 'mountain_pass', 'congestion', 'environmental_zone', 'other')),
  name TEXT NOT NULL,                        -- e.g. "Brenner Pass", "Oresund Bridge", "Channel Tunnel"
  location TEXT,
  axle_category_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  weight_class_id UUID REFERENCES toll_vehicle_categories(id) ON DELETE SET NULL,
  price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_round_trip BOOLEAN DEFAULT false,       -- Price is for round trip?
  valid_from DATE NOT NULL,
  valid_to DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Toll Rate History - audit log for rate changes (for AI analysis)
CREATE TABLE IF NOT EXISTS toll_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  toll_country_id UUID NOT NULL REFERENCES toll_countries(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('rate', 'vignette', 'section', 'special_charge')),
  entity_id UUID NOT NULL,                   -- FK to the specific rate/vignette/section
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deactivated')),
  old_values JSONB,                          -- Previous values
  new_values JSONB,                          -- New values
  changed_by UUID,                           -- admin/user who made the change
  change_reason TEXT,                        -- Why the rate was changed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toll_rate_history_lookup 
  ON toll_rate_history(toll_country_id, entity_type, created_at DESC);

-- 9. Toll Calculation Cache - store calculation results per order for quick retrieval
CREATE TABLE IF NOT EXISTS toll_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  order_id UUID,                             -- Optional link to TMS order
  route_description TEXT,                    -- e.g. "Moers (DE) -> Oradea (RO) -> Dordrecht (NL)"
  total_distance_km NUMERIC(10, 1),
  total_toll_cost NUMERIC(10, 2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  breakdown JSONB NOT NULL,                  -- Detailed per-country breakdown
  vehicle_profile JSONB,                     -- Vehicle specs used for calculation
  calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toll_calculations_order 
  ON toll_calculations(order_id);

-- Enable RLS on all tables
ALTER TABLE toll_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_vehicle_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_road_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_vignettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_section_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_special_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_calculations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin-scoped access)
CREATE POLICY toll_countries_all ON toll_countries FOR ALL USING (true);
CREATE POLICY toll_vehicle_categories_all ON toll_vehicle_categories FOR ALL USING (true);
CREATE POLICY toll_road_segments_all ON toll_road_segments FOR ALL USING (true);
CREATE POLICY toll_rates_all ON toll_rates FOR ALL USING (true);
CREATE POLICY toll_vignettes_all ON toll_vignettes FOR ALL USING (true);
CREATE POLICY toll_section_rates_all ON toll_section_rates FOR ALL USING (true);
CREATE POLICY toll_special_charges_all ON toll_special_charges FOR ALL USING (true);
CREATE POLICY toll_rate_history_all ON toll_rate_history FOR ALL USING (true);
CREATE POLICY toll_calculations_all ON toll_calculations FOR ALL USING (true);
