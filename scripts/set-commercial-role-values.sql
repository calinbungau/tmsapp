-- Set commercial_role and order_type for existing orders
-- Customer orders: orders without a parent_order_id (top-level orders from customers)
-- Carrier subcontract: orders with a parent_order_id (auto-generated for trip execution)

-- First, set all orders without a parent to 'customer_order' and order_type to 'internal'
-- (All customer orders are "internal" type - execution type is determined by trips)
UPDATE orders 
SET 
  commercial_role = 'customer_order',
  order_type = 'internal'
WHERE parent_order_id IS NULL;

-- Set all orders with a parent to 'carrier_subcontract' (these keep order_type: 'forwarding')
UPDATE orders 
SET commercial_role = 'carrier_subcontract'
WHERE parent_order_id IS NOT NULL;

-- Verify the update
SELECT 
  commercial_role,
  order_type,
  COUNT(*) as count
FROM orders 
GROUP BY commercial_role, order_type;
