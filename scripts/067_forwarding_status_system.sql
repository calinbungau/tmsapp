-- Forwarding Order Status System Migration
-- Introduces fwd_ prefixed statuses for forwarding orders
-- Internal orders (order_type = 'internal') are NOT touched

-- Step 0: Drop old status CHECK constraint and replace with one that supports both internal + forwarding statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    -- Internal order statuses (unchanged)
    'draft', 'confirmed', 'dispatched', 'picked_up', 'in_transit', 
    'delivered', 'pod_received', 'invoiced', 'completed', 'cancelled',
    -- Forwarding order statuses (new fwd_ prefix)
    'fwd_draft',
    'fwd_client_confirmation_required',
    'fwd_client_confirmed',
    'fwd_unassigned',
    'fwd_assigned',
    'fwd_carrier_confirmation_required',
    'fwd_carrier_confirmed',
    'fwd_in_transit',
    'fwd_delivered',
    'fwd_documents_pending',
    'fwd_documents_received',
    'fwd_completed',
    'fwd_cancelled'
  ])
);

-- Step 1: Migrate existing forwarding orders from old statuses to new fwd_ prefixed statuses
UPDATE orders
SET status = CASE status
  WHEN 'draft' THEN 'fwd_draft'
  WHEN 'confirmed' THEN 'fwd_client_confirmed'
  WHEN 'dispatched' THEN 'fwd_assigned'
  WHEN 'allocated' THEN 'fwd_assigned'
  WHEN 'accepted' THEN 'fwd_carrier_confirmed'
  WHEN 'in_transit' THEN 'fwd_in_transit'
  WHEN 'delivered' THEN 'fwd_delivered'
  WHEN 'pod_received' THEN 'fwd_delivered'
  WHEN 'invoiced' THEN 'fwd_delivered'
  WHEN 'completed' THEN 'fwd_completed'
  WHEN 'cancelled' THEN 'fwd_cancelled'
  ELSE 'fwd_draft'
END
WHERE order_type = 'forwarding'
  AND status NOT LIKE 'fwd_%';

-- Step 2: Also migrate order_status_history entries for forwarding orders
UPDATE order_status_history osh
SET 
  from_status = CASE osh.from_status
    WHEN 'draft' THEN 'fwd_draft'
    WHEN 'confirmed' THEN 'fwd_client_confirmed'
    WHEN 'dispatched' THEN 'fwd_assigned'
    WHEN 'allocated' THEN 'fwd_assigned'
    WHEN 'accepted' THEN 'fwd_carrier_confirmed'
    WHEN 'in_transit' THEN 'fwd_in_transit'
    WHEN 'delivered' THEN 'fwd_delivered'
    WHEN 'pod_received' THEN 'fwd_delivered'
    WHEN 'invoiced' THEN 'fwd_delivered'
    WHEN 'completed' THEN 'fwd_completed'
    WHEN 'cancelled' THEN 'fwd_cancelled'
    ELSE osh.from_status
  END,
  to_status = CASE osh.to_status
    WHEN 'draft' THEN 'fwd_draft'
    WHEN 'confirmed' THEN 'fwd_client_confirmed'
    WHEN 'dispatched' THEN 'fwd_assigned'
    WHEN 'allocated' THEN 'fwd_assigned'
    WHEN 'accepted' THEN 'fwd_carrier_confirmed'
    WHEN 'in_transit' THEN 'fwd_in_transit'
    WHEN 'delivered' THEN 'fwd_delivered'
    WHEN 'pod_received' THEN 'fwd_delivered'
    WHEN 'invoiced' THEN 'fwd_delivered'
    WHEN 'completed' THEN 'fwd_completed'
    WHEN 'cancelled' THEN 'fwd_cancelled'
    ELSE osh.to_status
  END
FROM orders o
WHERE osh.order_id = o.id
  AND o.order_type = 'forwarding'
  AND (osh.from_status NOT LIKE 'fwd_%' OR osh.to_status NOT LIKE 'fwd_%');

-- Step 3: Update forwarding_checklist JSONB structure for existing forwarding orders
-- The new structure has 7 items (added documents_pending which was not in the old schema)
-- Preserve any existing checked states
UPDATE orders
SET forwarding_checklist = jsonb_build_object(
  'documents_pending', COALESCE(forwarding_checklist->'documents_pending', '{"checked": false, "date": null, "note": ""}'::jsonb),
  'documents_received', COALESCE(forwarding_checklist->'documents_received', '{"checked": false, "date": null, "note": ""}'::jsonb),
  'invoiced_client', COALESCE(forwarding_checklist->'client_invoiced', forwarding_checklist->'invoiced_client', '{"checked": false, "date": null, "note": ""}'::jsonb),
  'documents_sent_client', COALESCE(forwarding_checklist->'documents_sent_client', '{"checked": false, "date": null, "note": ""}'::jsonb),
  'carrier_payment_due', COALESCE(forwarding_checklist->'carrier_payment_due', '{"checked": false, "date": null, "note": ""}'::jsonb),
  'carrier_paid', COALESCE(forwarding_checklist->'carrier_paid', '{"checked": false, "date": null, "note": ""}'::jsonb),
  'client_payment_received', COALESCE(forwarding_checklist->'client_payment_received', '{"checked": false, "date": null, "note": ""}'::jsonb)
)
WHERE order_type = 'forwarding';

-- Step 4: Update comment on forwarding_checklist column
COMMENT ON COLUMN orders.forwarding_checklist IS 'Post-delivery checklist for forwarding orders (7 items). Structure: { "documents_pending": { "checked": bool, "date": string|null, "note": string }, "documents_received": {...}, "invoiced_client": {...}, "documents_sent_client": {...}, "carrier_payment_due": {...}, "carrier_paid": {...}, "client_payment_received": {...} }. Status auto-transitions to fwd_completed when all items are checked.';
