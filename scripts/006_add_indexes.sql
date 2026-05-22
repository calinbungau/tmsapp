-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inspections_driver_id ON inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle_id ON inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
