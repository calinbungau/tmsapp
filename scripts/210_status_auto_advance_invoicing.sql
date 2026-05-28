-- ============================================================================
-- 210_status_auto_advance_invoicing.sql
--
-- Auto-advance the PARENT order through three previously-manual gates:
--   • Convergence (all children docs received) → ready_for_invoicing
--     Previously parent landed on `documents_received` and required a
--     manual click. Operators were unanimously skipping that click, so
--     we now jump straight to row 14 (ready_for_invoicing).
--   • Customer docs sent → documents_and_invoice_sent
--     Triggered from app/api/orders/[id]/send-docs-to-customer.
--   • Customer invoice paid → completed
--     Triggered from the manual mark-paid handler and the Smartbill
--     payment route.
--
-- This file ONLY redefines fn_recompute_parent_status — the convergence
-- jump. The two send/paid transitions are handled by application code,
-- which writes the parent status directly via update queries.
--
-- Paired with: lib/tms/status/derivation.ts (must mirror exactly).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_recompute_parent_status(p_parent_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status   text;
  v_current_rank     int;
  v_min_active_rank  int;
  v_active_count     int;
  v_new_status       text := NULL;
BEGIN
  IF p_parent_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_current_status FROM orders WHERE id = p_parent_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_current_rank := fn_status_rank(v_current_status);

  -- Manual / post-convergence rows: never overwrite from children.
  -- ready_for_invoicing is included here because once we've auto-advanced
  -- the parent to it, child status changes (e.g. a stray leg flipped back
  -- to documents_pending) must NOT pull the parent back to in_execution.
  -- Back-office stays in control of forward motion from there.
  IF v_current_status IN (
    'draft',
    'customer_confirmation_required',
    'ready_for_invoicing',
    'documents_received',           -- legacy rows still on this state stay manual
    'documents_and_invoice_sent',
    'completed',
    'cancelled'
  ) THEN
    RETURN;
  END IF;

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
    RETURN;
  END IF;

  IF v_min_active_rank >= 13 THEN
    -- Convergence: ALL active children have at least docs received.
    -- Auto-promote straight to ready_for_invoicing (row 14) and skip the
    -- old, transient documents_received parent state. Only fires if the
    -- parent isn't already at rank 14 or beyond.
    IF v_current_rank < 14 THEN
      v_new_status := 'ready_for_invoicing';
    END IF;
  ELSIF v_min_active_rank >= 4 THEN
    IF v_current_status <> 'in_execution' AND v_current_rank <= 4 THEN
      v_new_status := 'in_execution';
    ELSIF v_current_status = 'confirmed_to_customer' THEN
      v_new_status := 'in_execution';
    ELSIF v_current_status = 'documents_received' AND v_min_active_rank < 13 THEN
      -- Edge case carried over from the previous version: parent was at
      -- documents_received but a child reverted (e.g. POD rejected).
      v_new_status := 'in_execution';
    END IF;
  END IF;

  IF v_new_status IS NOT NULL AND v_new_status <> v_current_status THEN
    UPDATE orders SET status = v_new_status, updated_at = NOW()
    WHERE id = p_parent_id;
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_type, notes, created_at)
    VALUES (p_parent_id, v_current_status, v_new_status, 'system',
            'Auto-recomputed from children (fn_recompute_parent_status v2)', NOW());
  END IF;
END;
$$;

-- Reconcile every parent now so existing rows that are eligible advance
-- in a single pass without waiting for the next child status change.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM orders WHERE parent_order_id IS NULL LOOP
    PERFORM fn_recompute_parent_status(r.id);
  END LOOP;
END;
$$;

COMMIT;
