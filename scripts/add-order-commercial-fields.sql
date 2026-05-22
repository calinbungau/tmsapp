-- Migration: Add commercial relationship fields to orders table
-- This separates commercial contracts from execution details

-- Add parent_order_id: Links subcontract orders to their parent customer order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

-- Add commercial_role: Categorizes the order type for reporting and filtering
-- 'customer_order' = Direct customer contract (revenue source)
-- 'subcontract_order' = Subcontracted execution leg (cost, not revenue)
-- 'standalone_forwarding' = Pure forwarding order (both revenue and carrier cost)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commercial_role TEXT DEFAULT 'customer_order';

-- Add execution_trip_id: Direct link from subcontract order to its execution trip
-- (Alternative to using trip_orders for subcontracts)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;

-- Create index for efficient parent-child lookups
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;

-- Create index for commercial role filtering
CREATE INDEX IF NOT EXISTS idx_orders_commercial_role ON orders(commercial_role);

-- Migrate existing data:
-- 1. Set all existing internal orders as customer_order
UPDATE orders 
SET commercial_role = 'customer_order' 
WHERE order_type = 'internal' AND commercial_role IS NULL;

-- 2. Set existing forwarding orders as standalone_forwarding (since we don't know if they have parents)
UPDATE orders 
SET commercial_role = 'standalone_forwarding' 
WHERE order_type = 'forwarding' AND commercial_role IS NULL;

-- Note: After migration, you may need to manually identify and update any existing
-- subcontract orders by setting their parent_order_id and changing commercial_role to 'subcontract_order'
