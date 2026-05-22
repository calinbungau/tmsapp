-- Migration: Add Fleet Groups and Subcontractor Support to Vehicles/Trailers
-- Phase 1: Add business_partner_id to vehicles and trailers (like drivers)
-- Phase 2: Create fleet_groups and fleet_group_members tables

-- =====================================================
-- PHASE 1: Subcontractor Support for Vehicles & Trailers
-- =====================================================

-- Add business_partner_id and is_subcontractor to vehicles (to match drivers)
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS business_partner_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_subcontractor BOOLEAN DEFAULT false;

-- Add business_partner_id and is_subcontractor to trailers (to match drivers)
ALTER TABLE trailers 
ADD COLUMN IF NOT EXISTS business_partner_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_subcontractor BOOLEAN DEFAULT false;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_business_partner_id ON vehicles(business_partner_id);
CREATE INDEX IF NOT EXISTS idx_trailers_business_partner_id ON trailers(business_partner_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_subcontractor ON vehicles(is_subcontractor);
CREATE INDEX IF NOT EXISTS idx_trailers_is_subcontractor ON trailers(is_subcontractor);

-- =====================================================
-- PHASE 2: Fleet Groups System
-- =====================================================

-- Create fleet_groups table
CREATE TABLE IF NOT EXISTS fleet_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1', -- Default indigo color
  icon TEXT DEFAULT 'users', -- Default icon
  group_type TEXT DEFAULT 'custom', -- operational, regional, client, subcontractor, custom
  parent_group_id UUID REFERENCES fleet_groups(id) ON DELETE SET NULL, -- For hierarchy
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create fleet_group_members junction table (many-to-many)
CREATE TABLE IF NOT EXISTS fleet_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES fleet_groups(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL, -- 'driver', 'vehicle', 'trailer'
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  trailer_id UUID REFERENCES trailers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Ensure exactly one of the three IDs is set based on member_type
  CONSTRAINT valid_member CHECK (
    (member_type = 'driver' AND driver_id IS NOT NULL AND vehicle_id IS NULL AND trailer_id IS NULL) OR
    (member_type = 'vehicle' AND vehicle_id IS NOT NULL AND driver_id IS NULL AND trailer_id IS NULL) OR
    (member_type = 'trailer' AND trailer_id IS NOT NULL AND driver_id IS NULL AND vehicle_id IS NULL)
  ),
  
  -- Prevent duplicate memberships
  CONSTRAINT unique_driver_in_group UNIQUE (group_id, driver_id),
  CONSTRAINT unique_vehicle_in_group UNIQUE (group_id, vehicle_id),
  CONSTRAINT unique_trailer_in_group UNIQUE (group_id, trailer_id)
);

-- Create indexes for fleet_groups
CREATE INDEX IF NOT EXISTS idx_fleet_groups_admin_id ON fleet_groups(admin_id);
CREATE INDEX IF NOT EXISTS idx_fleet_groups_parent_group_id ON fleet_groups(parent_group_id);
CREATE INDEX IF NOT EXISTS idx_fleet_groups_group_type ON fleet_groups(group_type);
CREATE INDEX IF NOT EXISTS idx_fleet_groups_is_active ON fleet_groups(is_active);

-- Create indexes for fleet_group_members
CREATE INDEX IF NOT EXISTS idx_fleet_group_members_group_id ON fleet_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_fleet_group_members_driver_id ON fleet_group_members(driver_id);
CREATE INDEX IF NOT EXISTS idx_fleet_group_members_vehicle_id ON fleet_group_members(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_group_members_trailer_id ON fleet_group_members(trailer_id);
CREATE INDEX IF NOT EXISTS idx_fleet_group_members_member_type ON fleet_group_members(member_type);

-- Enable RLS on fleet_groups
ALTER TABLE fleet_groups ENABLE ROW LEVEL SECURITY;

-- RLS policy for fleet_groups
CREATE POLICY fleet_groups_all ON fleet_groups FOR ALL USING (true);

-- Enable RLS on fleet_group_members
ALTER TABLE fleet_group_members ENABLE ROW LEVEL SECURITY;

-- RLS policy for fleet_group_members
CREATE POLICY fleet_group_members_all ON fleet_group_members FOR ALL USING (true);

-- =====================================================
-- Add fleet_group_id direct column to assets (for single primary group)
-- This is in addition to the many-to-many relationship
-- =====================================================

-- Add primary fleet_group_id to drivers
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS fleet_group_id UUID REFERENCES fleet_groups(id) ON DELETE SET NULL;

-- Add primary fleet_group_id to vehicles
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS fleet_group_id UUID REFERENCES fleet_groups(id) ON DELETE SET NULL;

-- Add primary fleet_group_id to trailers
ALTER TABLE trailers 
ADD COLUMN IF NOT EXISTS fleet_group_id UUID REFERENCES fleet_groups(id) ON DELETE SET NULL;

-- Create indexes for primary group lookups
CREATE INDEX IF NOT EXISTS idx_drivers_fleet_group_id ON drivers(fleet_group_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_fleet_group_id ON vehicles(fleet_group_id);
CREATE INDEX IF NOT EXISTS idx_trailers_fleet_group_id ON trailers(fleet_group_id);
