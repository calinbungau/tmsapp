-- ============================================
-- TMS Schema Migration
-- 037_tms_schema.sql
-- ============================================

-- ──────────────────────────────────────────────
-- 1. COMPANY PROFILES
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  company_name TEXT,
  logo_url TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'RO',
  vat_number TEXT,
  registration_number TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  bank_name TEXT,
  bank_iban TEXT,
  bank_swift TEXT,
  bank_currency TEXT DEFAULT 'EUR',
  default_currency TEXT DEFAULT 'EUR',
  default_payment_terms_days INTEGER DEFAULT 30,
  -- Order numbering
  order_prefix TEXT DEFAULT 'TMS',
  order_include_year BOOLEAN DEFAULT TRUE,
  order_next_number INTEGER DEFAULT 1,
  -- Invoice numbering
  invoice_prefix TEXT DEFAULT 'INV',
  invoice_include_year BOOLEAN DEFAULT TRUE,
  invoice_next_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id)
);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_profiles_all" ON company_profiles FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 2. TRAILERS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trailers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  plate_number VARCHAR(20) NOT NULL,
  trailer_type TEXT DEFAULT 'curtain_side'
    CHECK (trailer_type IN ('curtain_side','box','flatbed','reefer','tanker','lowbed','mega','container','other')),
  make VARCHAR(100),
  model VARCHAR(100),
  year INTEGER,
  vin_number VARCHAR(50),
  registration_country TEXT DEFAULT 'RO',
  max_weight_kg NUMERIC(10,2),
  max_pallets INTEGER,
  loading_meters NUMERIC(5,2),
  volume_m3 NUMERIC(8,2),
  adr_certified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  traccar_device_id TEXT,
  next_inspection_date DATE,
  insurance_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trailers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trailers_select" ON trailers FOR SELECT USING (true);
CREATE POLICY "trailers_insert" ON trailers FOR INSERT WITH CHECK (true);
CREATE POLICY "trailers_update" ON trailers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "trailers_delete" ON trailers FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 3. EXTEND VEHICLES TABLE (capacity fields)
-- ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='vehicle_type') THEN
    ALTER TABLE vehicles ADD COLUMN vehicle_type TEXT DEFAULT 'truck';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='max_weight_kg') THEN
    ALTER TABLE vehicles ADD COLUMN max_weight_kg NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='max_pallets') THEN
    ALTER TABLE vehicles ADD COLUMN max_pallets INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='loading_meters') THEN
    ALTER TABLE vehicles ADD COLUMN loading_meters NUMERIC(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='volume_m3') THEN
    ALTER TABLE vehicles ADD COLUMN volume_m3 NUMERIC(8,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='default_trailer_id') THEN
    ALTER TABLE vehicles ADD COLUMN default_trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- 4. ORDERS (core TMS entity)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (order_type IN ('internal','forwarding')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','dispatched','picked_up','in_transit','delivered','pod_received','invoiced','completed','cancelled')),
  
  -- Customer / Commercial
  customer_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
  customer_reference TEXT,
  carrier_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
  
  -- Pricing
  customer_price NUMERIC(12,2),
  customer_currency TEXT DEFAULT 'EUR',
  carrier_cost NUMERIC(12,2),
  carrier_currency TEXT DEFAULT 'EUR',
  margin NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN customer_price IS NOT NULL AND carrier_cost IS NOT NULL
      THEN customer_price - carrier_cost
      ELSE NULL
    END
  ) STORED,
  payment_terms_customer_days INTEGER,
  payment_terms_carrier_days INTEGER,
  
  -- Assignment (internal)
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL,
  
  -- Cargo
  cargo_description TEXT,
  goods_type TEXT,
  weight_kg NUMERIC(10,2),
  volume_m3 NUMERIC(8,2),
  pallet_count INTEGER,
  loading_meters NUMERIC(5,2),
  adr_class TEXT,
  temperature_min NUMERIC(5,1),
  temperature_max NUMERIC(5,1),
  stackable BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_from TEXT DEFAULT 'manual'
    CHECK (created_from IN ('manual','ai_upload','ai_email')),
  special_instructions TEXT,
  internal_notes TEXT,
  form_id UUID REFERENCES task_forms(id) ON DELETE SET NULL,
  
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "orders_delete" ON orders FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 5. ORDER STOPS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  stop_type TEXT NOT NULL DEFAULT 'pickup'
    CHECK (stop_type IN ('pickup','delivery','customs','transit','rest')),
  company_name TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  postal_code TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  planned_date DATE,
  planned_time_from TIME,
  planned_time_to TIME,
  actual_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  reference_number TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','en_route','arrived','loading','unloading','completed','skipped')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_stops_select" ON order_stops FOR SELECT USING (true);
CREATE POLICY "order_stops_insert" ON order_stops FOR INSERT WITH CHECK (true);
CREATE POLICY "order_stops_update" ON order_stops FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "order_stops_delete" ON order_stops FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 6. ORDER DOCUMENTS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  document_type TEXT DEFAULT 'other'
    CHECK (document_type IN ('cmr','pod','invoice','packing_list','customs','adr','insurance','order_confirmation','delivery_note','other')),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by_id UUID,
  uploaded_by_type TEXT DEFAULT 'admin',
  generated_from_template BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_documents_select" ON order_documents FOR SELECT USING (true);
CREATE POLICY "order_documents_insert" ON order_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "order_documents_update" ON order_documents FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "order_documents_delete" ON order_documents FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 7. ORDER INVOICES
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outgoing'
    CHECK (direction IN ('outgoing','incoming')),
  business_partner_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  tax_rate NUMERIC(5,2) DEFAULT 0,
  total_with_tax NUMERIC(12,2),
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_invoices_select" ON order_invoices FOR SELECT USING (true);
CREATE POLICY "order_invoices_insert" ON order_invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "order_invoices_update" ON order_invoices FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "order_invoices_delete" ON order_invoices FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 8. ORDER EXPENSES
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expense_type TEXT DEFAULT 'other'
    CHECK (expense_type IN ('fuel','toll','parking','ferry','border','loading','unloading','overnight','fines','repair','other')),
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  receipt_url TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  reported_by_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  approved BOOLEAN DEFAULT FALSE,
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_expenses_select" ON order_expenses FOR SELECT USING (true);
CREATE POLICY "order_expenses_insert" ON order_expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "order_expenses_update" ON order_expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "order_expenses_delete" ON order_expenses FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 9. ORDER ACTIVITY LOG
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  performed_by_id UUID,
  performed_by_type TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_activity_log_select" ON order_activity_log FOR SELECT USING (true);
CREATE POLICY "order_activity_log_insert" ON order_activity_log FOR INSERT WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 10. TRIPS (multi-load grouping)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  reference_number TEXT,
  status TEXT DEFAULT 'planned'
    CHECK (status IN ('planned','active','completed','cancelled')),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_select" ON trips FOR SELECT USING (true);
CREATE POLICY "trips_insert" ON trips FOR INSERT WITH CHECK (true);
CREATE POLICY "trips_update" ON trips FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "trips_delete" ON trips FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 11. TRIP_ORDERS (junction table)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sequence INTEGER DEFAULT 1,
  UNIQUE(trip_id, order_id)
);

ALTER TABLE trip_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_orders_select" ON trip_orders FOR SELECT USING (true);
CREATE POLICY "trip_orders_insert" ON trip_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "trip_orders_update" ON trip_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "trip_orders_delete" ON trip_orders FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 12. ORDER TEMPLATES (PDF generation)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT DEFAULT 'order_confirmation'
    CHECK (template_type IN ('order_confirmation','cmr','invoice','credit_note','pod')),
  html_template TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_templates_select" ON order_templates FOR SELECT USING (true);
CREATE POLICY "order_templates_insert" ON order_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "order_templates_update" ON order_templates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "order_templates_delete" ON order_templates FOR DELETE USING (true);

-- ──────────────────────────────────────────────
-- 13. INDEXES
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_admin_id ON orders(admin_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_carrier_id ON orders(carrier_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_vehicle_id ON orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_stops_order_id ON order_stops(order_id);
CREATE INDEX IF NOT EXISTS idx_order_stops_sequence ON order_stops(order_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_invoices_order_id ON order_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_order_invoices_status ON order_invoices(status);
CREATE INDEX IF NOT EXISTS idx_order_expenses_order_id ON order_expenses(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_log_order_id ON order_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_trips_admin_id ON trips(admin_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trip_orders_trip_id ON trip_orders(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_orders_order_id ON trip_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_trailers_admin_id ON trailers(admin_id);
CREATE INDEX IF NOT EXISTS idx_trailers_plate ON trailers(plate_number);
CREATE INDEX IF NOT EXISTS idx_company_profiles_admin ON company_profiles(admin_id);

-- ──────────────────────────────────────────────
-- 14. ENABLE REALTIME for key TMS tables
-- ──────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_stops;
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
