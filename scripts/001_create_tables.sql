-- Driver Daily Inspection Database Schema

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  pin_code VARCHAR(6) NOT NULL UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(50),
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

-- Daily inspections table
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed
  photo_front_url TEXT,
  photo_back_url TEXT,
  photo_left_url TEXT,
  photo_right_url TEXT,
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

-- Enable Row Level Security (we'll keep it simple for this app since drivers use PIN codes)
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (since we're using PIN authentication, not Supabase Auth)
-- For a production app, you might want more restrictive policies

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
INSERT INTO drivers (name, pin_code, email, phone) VALUES
  ('John Smith', '1234', 'john@example.com', '+1234567890'),
  ('Jane Doe', '5678', 'jane@example.com', '+0987654321'),
  ('Bob Wilson', '9999', 'bob@example.com', '+1122334455')
ON CONFLICT (pin_code) DO NOTHING;

INSERT INTO vehicles (plate_number, make, model, year, color) VALUES
  ('ABC-123', 'Toyota', 'Camry', 2022, 'White'),
  ('XYZ-789', 'Ford', 'F-150', 2023, 'Blue'),
  ('DEF-456', 'Honda', 'Civic', 2021, 'Black')
ON CONFLICT (plate_number) DO NOTHING;
