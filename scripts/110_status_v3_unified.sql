-- ============================================================================
-- 110_status_v3_unified.sql
-- ----------------------------------------------------------------------------
-- Unifies the order/leg/subcontract status model into a single ranked
-- system that mirrors `lib/tms/status/registry.ts`. Non-destructive: every
-- existing row is mapped to the new value via UPDATEs, no DROP TABLE / no
-- COLUMN drops, and the CHECK constraint is rebuilt only after the data is
-- consistent.
--
-- Lifecycles:
--   PARENT   (orders.status WHERE parent_order_id IS NULL):
--     draft, customer_confirmation_required, confirmed_to_customer,
--     in_execution, documents_received, ready_for_invoicing,
--     documents_and_invoice_sent, completed, cancelled, on_hold
--
--   INTERNAL (trip_legs.status):
--     unassigned, assigned, planned, dispatched_to_driver,
--     accepted_by_driver, waiting_to_start, in_progress, delivered,
--     documents_pending, documents_received, completed, cancelled, on_hold
--
--   FORWARDER (orders.status WHERE parent_order_id IS NOT NULL):
--     fwd_unassigned, fwd_assigned_to_carrier,
--     fwd_carrier_confirmation_required, fwd_carrier_confirmed,
--     fwd_waiting_to_start, fwd_in_progress, fwd_delivered,
--     fwd_documents_pending, fwd_documents_received,
--     fwd_carrier_invoice_pending, fwd_carrier_invoice_unpaid,
--     fwd_completed, fwd_cancelled, fwd_on_hold
--
-- Convergence row 13 (documents_received) is where the parent auto-advances.
-- ============================================================================

BEGIN;

-- ── 1. Drop existing CHECK constraints so the data backfill can run ──────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE trip_legs DROP CONSTRAINT IF EXISTS trip_legs_status_check;

-- ── 2. Backfill PARENT (non-forwarding) statuses ─────────────────────────
-- These are commercial/operational orders sold to a customer. Old values:
--   draft, confirmed, dispatched, accepted, in_transit, delivered,
--   pod_received, invoiced, completed, cancelled
UPDATE orders SET status = 'confirmed_to_customer'
  WHERE status = 'confirmed' AND (parent_order_id IS NULL);

UPDATE orders SET status = 'in_execution'
  WHERE status IN ('dispatched', 'accepted', 'in_transit', 'delivered')
    AND (parent_order_id IS NULL);

UPDATE orders SET status = 'documents_received'
  WHERE status = 'pod_received' AND (parent_order_id IS NULL);

UPDATE orders SET status = 'documents_and_invoice_sent'
  WHERE status = 'invoiced' AND (parent_order_id IS NULL);

-- 'draft', 'completed', 'cancelled' map 1:1 — no UPDATE needed.

-- ── 2b. Repair PARENTS that carry legacy fwd_* values (data bug) ─────────
-- A handful of top-level orders ended up with forwarder statuses written
-- straight onto them. Map each to the closest parent equivalent.
UPDATE orders SET status = 'cancelled'
  WHERE parent_order_id IS NULL AND status = 'fwd_cancelled';

UPDATE orders SET status = 'documents_received'
  WHERE parent_order_id IS NULL AND status = 'fwd_documents_received';

UPDATE orders SET status = 'in_execution'
  WHERE parent_order_id IS NULL
    AND status IN (
      'fwd_unassigned', 'fwd_assigned', 'fwd_assigned_to_carrier',
      'fwd_carrier_confirmation_required', 'fwd_carrier_confirmed',
      'fwd_planned', 'fwd_waiting_to_start', 'fwd_in_progress',
      'fwd_in_transit', 'fwd_delivered', 'fwd_documents_pending',
      'fwd_carrier_invoice_pending', 'fwd_carrier_invoice_unpaid',
      'fwd_draft', 'fwd_client_confirmation_required', 'fwd_client_confirmed'
    );

UPDATE orders SET status = 'completed'
  WHERE parent_order_id IS NULL AND status = 'fwd_completed';

UPDATE orders SET status = 'on_hold'
  WHERE parent_order_id IS NULL AND status = 'fwd_on_hold';

-- ── 3. Backfill FORWARDER (subcontract) statuses ─────────────────────────
-- Old fwd_* values mapped to new fwd_* names. Conservative: anything with
-- ambiguous semantics maps to fwd_unassigned (the safe pre-execution state)
-- so the dispatcher can re-trigger the carrier flow.
UPDATE orders SET status = 'fwd_unassigned'
  WHERE status IN ('fwd_draft', 'fwd_client_confirmation_required', 'fwd_client_confirmed');

UPDATE orders SET status = 'fwd_assigned_to_carrier'
  WHERE status = 'fwd_assigned';

UPDATE orders SET status = 'fwd_carrier_confirmed'
  WHERE status = 'fwd_planned';

UPDATE orders SET status = 'fwd_in_progress'
  WHERE status = 'fwd_in_transit';

-- fwd_unassigned, fwd_carrier_confirmation_required, fwd_carrier_confirmed,
-- fwd_delivered, fwd_documents_pending, fwd_documents_received,
-- fwd_completed, fwd_cancelled — already match new spec, no UPDATE.

-- ── 4. Backfill TRIP_LEGS statuses ───────────────────────────────────────
-- Existing values seen in the codebase: 'planned', 'in_progress', 'completed'
-- plus possibly NULLs. Use resource columns to disambiguate 'unassigned'
-- vs 'planned'.
UPDATE trip_legs
   SET status = CASE
     WHEN status IS NULL OR status = '' THEN
       CASE
         WHEN driver_id IS NULL AND vehicle_id IS NULL AND carrier_id IS NULL
           THEN 'unassigned'
         ELSE 'planned'
       END
     WHEN status = 'planned' AND driver_id IS NULL AND vehicle_id IS NULL AND carrier_id IS NULL
       THEN 'unassigned'
     WHEN status = 'in_progress' THEN 'in_progress'
     WHEN status = 'completed'   THEN 'completed'
     WHEN status = 'cancelled'   THEN 'cancelled'
     WHEN status = 'on_hold'     THEN 'on_hold'
     -- Any value already matching the new spec stays as-is.
     WHEN status IN ('unassigned','assigned','planned','dispatched_to_driver',
                     'accepted_by_driver','waiting_to_start','in_progress',
                     'delivered','documents_pending','documents_received',
                     'completed','cancelled','on_hold') THEN status
     ELSE 'planned'  -- safe fallback for any stray legacy value
   END;

-- ── 5. Re-apply CHECK constraints with the unified value sets ────────────
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    -- Parent
    'draft',
    'customer_confirmation_required',
    'confirmed_to_customer',
    'in_execution',
    'documents_received',
    'ready_for_invoicing',
    'documents_and_invoice_sent',
    'completed',
    'cancelled',
    'on_hold',
    -- Forwarder
    'fwd_unassigned',
    'fwd_assigned_to_carrier',
    'fwd_carrier_confirmation_required',
    'fwd_carrier_confirmed',
    'fwd_waiting_to_start',
    'fwd_in_progress',
    'fwd_delivered',
    'fwd_documents_pending',
    'fwd_documents_received',
    'fwd_carrier_invoice_pending',
    'fwd_carrier_invoice_unpaid',
    'fwd_completed',
    'fwd_cancelled',
    'fwd_on_hold'
  )
);

ALTER TABLE trip_legs ADD CONSTRAINT trip_legs_status_check CHECK (
  status IN (
    'unassigned',
    'assigned',
    'planned',
    'dispatched_to_driver',
    'accepted_by_driver',
    'waiting_to_start',
    'in_progress',
    'delivered',
    'documents_pending',
    'documents_received',
    'completed',
    'cancelled',
    'on_hold'
  )
);

-- ── 6. Helper: rank a status value ───────────────────────────────────────
-- MUST mirror lib/tms/status/registry.ts `rank` field exactly.
CREATE OR REPLACE FUNCTION fn_status_rank(s text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    -- Parent
    WHEN 'draft' THEN 1
    WHEN 'customer_confirmation_required' THEN 2
    WHEN 'confirmed_to_customer' THEN 3
    WHEN 'in_execution' THEN 4
    WHEN 'documents_received' THEN 13
    WHEN 'ready_for_invoicing' THEN 14
    WHEN 'documents_and_invoice_sent' THEN 15
    WHEN 'completed' THEN 16
    -- Internal
    WHEN 'unassigned' THEN 4
    WHEN 'assigned' THEN 5
    WHEN 'planned' THEN 6
    WHEN 'dispatched_to_driver' THEN 7
    WHEN 'accepted_by_driver' THEN 8
    WHEN 'waiting_to_start' THEN 9
    WHEN 'in_progress' THEN 10
    WHEN 'delivered' THEN 11
    WHEN 'documents_pending' THEN 12
    -- 'documents_received' shared with parent (rank 13)
    -- 'completed' shared with parent (rank 16)
    -- Forwarder
    WHEN 'fwd_unassigned' THEN 4
    WHEN 'fwd_assigned_to_carrier' THEN 5
    WHEN 'fwd_carrier_confirmation_required' THEN 6
    WHEN 'fwd_carrier_confirmed' THEN 7
    WHEN 'fwd_waiting_to_start' THEN 9
    WHEN 'fwd_in_progress' THEN 10
    WHEN 'fwd_delivered' THEN 11
    WHEN 'fwd_documents_pending' THEN 12
    WHEN 'fwd_documents_received' THEN 13
    WHEN 'fwd_carrier_invoice_pending' THEN 14
    WHEN 'fwd_carrier_invoice_unpaid' THEN 15
    WHEN 'fwd_completed' THEN 16
    -- Sideways (cancelled / on_hold) → 99
    WHEN 'cancelled' THEN 99
    WHEN 'on_hold' THEN 99
    WHEN 'fwd_cancelled' THEN 99
    WHEN 'fwd_on_hold' THEN 99
    ELSE 0
  END;
$$;

-- ── 7. Recompute the parent status from its children ─────────────────────
-- Mirrors deriveParentStatus() in lib/tms/status/derivation.ts.
CREATE OR REPLACE FUNCTION fn_recompute_parent_status(p_parent_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status text;
  v_current_rank int;
  v_min_active_rank int;
  v_active_count int;
  v_new_status text := NULL;
BEGIN
  IF p_parent_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_current_status FROM orders WHERE id = p_parent_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_current_rank := fn_status_rank(v_current_status);

  -- Manual rows: never overwrite.
  IF v_current_status IN (
       'draft',
       'customer_confirmation_required',
       'ready_for_invoicing',
       'documents_and_invoice_sent',
       'completed',
       'cancelled'
     ) THEN
    -- Special case: confirmed_to_customer can auto-promote to in_execution
    -- if a child has crossed into rank >= 4, but draft/cust-confirm-req
    -- stay manual.
    RETURN;
  END IF;

  -- Compute min rank across active (non-sideways) children.
  -- Children = subcontract orders (parent_order_id = parent) UNION trip_legs
  -- on the parent's execution_trip_id.
  WITH parent_trip AS (
    SELECT execution_trip_id FROM orders WHERE id = p_parent_id
  ),
  child_statuses AS (
    SELECT status FROM orders WHERE parent_order_id = p_parent_id
    UNION ALL
    SELECT status FROM trip_legs
      WHERE trip_id = (SELECT execution_trip_id FROM parent_trip)
        AND (SELECT execution_trip_id FROM parent_trip) IS NOT NULL
  ),
  active AS (
    SELECT status, fn_status_rank(status) AS r
    FROM child_statuses
    WHERE fn_status_rank(status) <> 99
  )
  SELECT MIN(r), COUNT(*) INTO v_min_active_rank, v_active_count FROM active;

  IF v_active_count = 0 THEN
    -- No active children; leave parent alone.
    RETURN;
  END IF;

  IF v_min_active_rank >= 13 THEN
    -- All active children are at convergence or past it.
    IF v_current_rank < 13 THEN
      v_new_status := 'documents_received';
    END IF;
  ELSIF v_min_active_rank >= 4 THEN
    -- Operations in flight.
    IF v_current_status <> 'in_execution' AND v_current_rank <= 4 THEN
      v_new_status := 'in_execution';
    ELSIF v_current_status = 'confirmed_to_customer' THEN
      v_new_status := 'in_execution';
    ELSIF v_current_status = 'documents_received' AND v_min_active_rank < 13 THEN
      -- Edge case: parent was at documents_received but a child reverted to
      -- documents_pending (e.g. POD rejected). Pull parent back to in_execution.
      v_new_status := 'in_execution';
    END IF;
  END IF;

  IF v_new_status IS NOT NULL AND v_new_status <> v_current_status THEN
    UPDATE orders SET status = v_new_status, updated_at = NOW()
      WHERE id = p_parent_id;
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_type, notes, created_at)
      VALUES (p_parent_id, v_current_status, v_new_status, 'system',
              'Auto-recomputed from children (fn_recompute_parent_status)', NOW());
  END IF;
END;
$$;

-- ── 8. Trigger: child order status change → recompute parent ─────────────
CREATE OR REPLACE FUNCTION trg_child_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_order_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM fn_recompute_parent_status(NEW.parent_order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_child_order_status ON orders;
CREATE TRIGGER trg_after_child_order_status
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION trg_child_order_status_change();

-- ── 9. Trigger: trip_leg status change → recompute parent of each order ─
CREATE OR REPLACE FUNCTION trg_trip_leg_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    -- A trip can be linked to multiple orders via trip_orders. Recompute
    -- parent status for every order whose execution_trip_id matches the
    -- trip this leg belongs to.
    FOR r IN
      SELECT o.id
      FROM orders o
      WHERE o.execution_trip_id = NEW.trip_id
        AND o.parent_order_id IS NULL
    LOOP
      PERFORM fn_recompute_parent_status(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_trip_leg_status ON trip_legs;
CREATE TRIGGER trg_after_trip_leg_status
AFTER INSERT OR UPDATE OF status ON trip_legs
FOR EACH ROW
EXECUTE FUNCTION trg_trip_leg_status_change();

-- ── 10. One-shot reconciliation: recompute every parent now ──────────────
-- Brings existing rows into line with the new logic in a single pass.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM orders WHERE parent_order_id IS NULL
  LOOP
    PERFORM fn_recompute_parent_status(r.id);
  END LOOP;
END;
$$;

-- ── 11. Mark forwarding_checklist deprecated (kept for read compat) ──────
COMMENT ON COLUMN orders.forwarding_checklist IS
  'DEPRECATED — replaced by the unified status model in 110_status_v3_unified.sql. '
  'Read-only for legacy UI; do not write new data here. Will be dropped in a later migration.';

COMMIT;

-- ── Verification queries (run manually to inspect post-migration state) ──
-- SELECT status, COUNT(*) FROM orders WHERE parent_order_id IS NULL GROUP BY 1 ORDER BY 1;
-- SELECT status, COUNT(*) FROM orders WHERE parent_order_id IS NOT NULL GROUP BY 1 ORDER BY 1;
-- SELECT status, COUNT(*) FROM trip_legs GROUP BY 1 ORDER BY 1;
