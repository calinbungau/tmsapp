-- Create number_series table for scalable document numbering
-- Supports multiple series per entity type with auto-increment functionality

CREATE TABLE IF NOT EXISTS number_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Entity type this series applies to (e.g., 'internal_order', 'forwarding_order', 'invoice', 'decont', 'payment')
  entity_type TEXT NOT NULL,
  
  -- Series configuration
  name TEXT NOT NULL,  -- Display name like "Main Series", "Budapest Branch", etc.
  prefix TEXT NOT NULL,  -- e.g., "INT", "FWD", "INV"
  
  -- Year configuration
  include_year BOOLEAN NOT NULL DEFAULT true,
  year_format TEXT NOT NULL DEFAULT 'YYYY',  -- 'YYYY' = 2026, 'YY' = 26
  year_separator TEXT NOT NULL DEFAULT '-',  -- e.g., "-" for FWD-2026-001, "" for FWD2026001
  
  -- Number configuration
  number_separator TEXT NOT NULL DEFAULT '',  -- e.g., "" for FWD-2026-001, "/" for FWD-2026/001
  number_padding INTEGER NOT NULL DEFAULT 4,  -- Number of digits, e.g., 4 = 0001
  start_number INTEGER NOT NULL DEFAULT 1,  -- Starting number for the series
  
  -- Current state (per year if include_year is true)
  current_numbers JSONB NOT NULL DEFAULT '{}',  -- e.g., {"2026": 15, "2025": 102}
  
  -- Flags
  is_default BOOLEAN NOT NULL DEFAULT false,  -- Default series for this entity type
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure unique prefix per entity type per admin
  UNIQUE(admin_id, entity_type, prefix)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_number_series_admin_entity ON number_series(admin_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_number_series_default ON number_series(admin_id, entity_type, is_default) WHERE is_default = true;

-- Enable RLS
ALTER TABLE number_series ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY number_series_all ON number_series FOR ALL USING (true);

-- Function to get next number in a series (with atomic increment)
CREATE OR REPLACE FUNCTION get_next_series_number(
  p_series_id UUID,
  p_year INTEGER DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_series RECORD;
  v_current_year INTEGER;
  v_current_num INTEGER;
  v_next_num INTEGER;
  v_result TEXT;
BEGIN
  -- Get the series configuration
  SELECT * INTO v_series FROM number_series WHERE id = p_series_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Series not found: %', p_series_id;
  END IF;
  
  -- Determine year to use
  IF v_series.include_year THEN
    v_current_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  ELSE
    v_current_year := 0;  -- Use 0 as key when year is not included
  END IF;
  
  -- Get current number for this year
  v_current_num := COALESCE((v_series.current_numbers->>(v_current_year::TEXT))::INTEGER, v_series.start_number - 1);
  v_next_num := v_current_num + 1;
  
  -- Update the series with new number
  UPDATE number_series 
  SET 
    current_numbers = jsonb_set(
      COALESCE(current_numbers, '{}'::jsonb),
      ARRAY[v_current_year::TEXT],
      to_jsonb(v_next_num)
    ),
    updated_at = now()
  WHERE id = p_series_id;
  
  -- Build the result string
  v_result := v_series.prefix;
  
  IF v_series.include_year THEN
    v_result := v_result || v_series.year_separator;
    IF v_series.year_format = 'YY' THEN
      v_result := v_result || RIGHT(v_current_year::TEXT, 2);
    ELSE
      v_result := v_result || v_current_year::TEXT;
    END IF;
  END IF;
  
  v_result := v_result || v_series.number_separator || LPAD(v_next_num::TEXT, v_series.number_padding, '0');
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Insert default series for existing admins (internal orders and forwarding orders)
INSERT INTO number_series (admin_id, entity_type, name, prefix, include_year, year_format, year_separator, number_separator, number_padding, start_number, is_default, is_active)
SELECT 
  id,
  'internal_order',
  'Internal Orders',
  COALESCE(
    (SELECT order_prefix FROM company_profiles WHERE admin_id = admins.id),
    'INT'
  ),
  COALESCE(
    (SELECT order_include_year FROM company_profiles WHERE admin_id = admins.id),
    true
  ),
  'YYYY',
  '-',
  '',
  4,
  COALESCE(
    (SELECT order_next_number FROM company_profiles WHERE admin_id = admins.id),
    1
  ),
  true,
  true
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM number_series ns 
  WHERE ns.admin_id = admins.id AND ns.entity_type = 'internal_order'
);

INSERT INTO number_series (admin_id, entity_type, name, prefix, include_year, year_format, year_separator, number_separator, number_padding, start_number, is_default, is_active)
SELECT 
  id,
  'forwarding_order',
  'Forwarding Orders',
  COALESCE(
    (SELECT (forwarder_settings->>'order_prefix')::TEXT FROM admins a WHERE a.id = admins.id),
    'FWD'
  ),
  true,
  'YYYY',
  '-',
  '',
  4,
  1,
  true,
  true
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM number_series ns 
  WHERE ns.admin_id = admins.id AND ns.entity_type = 'forwarding_order'
);
