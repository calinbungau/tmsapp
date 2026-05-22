-- Order status flow v2: add accepted status, en_route stop status, geofence columns
-- New order flow: draft -> confirmed -> dispatched -> accepted -> in_transit -> delivered -> pod_received -> invoiced -> completed
-- picked_up is REMOVED as an order status (pickup completion is tracked at stop level)

-- 1. Add geofence columns to order_stops (matching task_stops pattern)
ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS auto_checkin BOOLEAN DEFAULT false;
ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS auto_checkout BOOLEAN DEFAULT false;
ALTER TABLE order_stops ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 200;

-- 2. Update any existing picked_up orders to in_transit (data migration)
UPDATE orders SET status = 'in_transit' WHERE status = 'picked_up';

-- 3. Update any order_status_history references
UPDATE order_status_history SET from_status = 'in_transit' WHERE from_status = 'picked_up';
UPDATE order_status_history SET to_status = 'in_transit' WHERE to_status = 'picked_up';
