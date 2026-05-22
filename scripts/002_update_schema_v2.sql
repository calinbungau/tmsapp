-- Updated Driver Daily Inspection Database Schema with Language Support and Extended Photos

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS inspections CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS admin_settings CASCADE;

-- Admin settings table (for admin password)
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_password VARCHAR(255) NOT NULL DEFAULT 'admin123',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default admin settings
INSERT INTO admin_settings (admin_password) VALUES ('admin123');

-- Drivers table with language preference
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  pin_code VARCHAR(6) NOT NULL UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(50),
  language VARCHAR(10) DEFAULT 'en', -- en, hu, ro, de, pl
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number VARCHAR(50) NOT NULL UNIQUE,
  make VARCHAR(100),
  model VARCHAR(100),
  year INTEGER,
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily inspections table with extended photos
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed
  photo_front_right_url TEXT,
  photo_front_left_url TEXT,
  photo_back_right_url TEXT,
  photo_back_left_url TEXT,
  photo_interior_url TEXT,
  photo_license_url TEXT,
  photo_gisa_url TEXT,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_drivers_pin_code ON drivers(pin_code);
CREATE INDEX IF NOT EXISTS idx_inspections_driver_id ON inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle_id ON inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_completed_at ON inspections(completed_at DESC);

-- Enable Row Level Security
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (since we're using PIN authentication, not Supabase Auth)
-- Admin settings policies
CREATE POLICY "Allow public read on admin_settings" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Allow public update on admin_settings" ON admin_settings FOR UPDATE USING (true);

-- Drivers policies
CREATE POLICY "Allow public read on drivers" ON drivers FOR SELECT USING (true);
CREATE POLICY "Allow public insert on drivers" ON drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on drivers" ON drivers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on drivers" ON drivers FOR DELETE USING (true);

-- Vehicles policies
CREATE POLICY "Allow public read on vehicles" ON vehicles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on vehicles" ON vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on vehicles" ON vehicles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on vehicles" ON vehicles FOR DELETE USING (true);

-- Inspections policies
CREATE POLICY "Allow public read on inspections" ON inspections FOR SELECT USING (true);
CREATE POLICY "Allow public insert on inspections" ON inspections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on inspections" ON inspections FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on inspections" ON inspections FOR DELETE USING (true);

-- Insert some sample data for testing
INSERT INTO drivers (name, pin_code, email, phone, language) VALUES
  ('John Smith', '1234', 'john@example.com', '+1234567890', 'en'),
  ('Nagy Istvan', '5678', 'nagy@example.com', '+0987654321', 'hu'),
  ('Ion Popescu', '9999', 'ion@example.com', '+1122334455', 'ro')
ON CONFLICT (pin_code) DO NOTHING;

INSERT INTO vehicles (plate_number, make, model, year, color) VALUES
  ('ABC-123', 'Toyota', 'Camry', 2022, 'White'),
  ('XYZ-789', 'Ford', 'F-150', 2023, 'Blue'),
  ('DEF-456', 'Honda', 'Civic', 2021, 'Black')
ON CONFLICT (plate_number) DO NOTHING;
