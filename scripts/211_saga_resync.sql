-- 211_saga_resync.sql
-- Extends the invoice sync lifecycle to support bidirectional TMS <-> Saga sync
-- until an invoice is fully paid.

-- 1. Relax the accounting_sync_status constraint to allow:
--    pending, synced, validated, modified, paid, error, not_applicable (or NULL)
ALTER TABLE order_invoices
  DROP CONSTRAINT IF EXISTS order_invoices_accounting_sync_status_check;

ALTER TABLE order_invoices
  ADD CONSTRAINT order_invoices_accounting_sync_status_check
  CHECK (accounting_sync_status IS NULL OR accounting_sync_status IN (
    'pending',      -- new, awaiting first push to Saga
    'synced',       -- in Saga, in sync
    'validated',    -- (legacy alias for synced)
    'modified',     -- edited in TMS after sync; needs re-push
    'paid',         -- fully paid; locked from further auto re-sync
    'error',        -- last sync attempt failed
    'not_applicable'
  ));

-- 2. Index for the pull query: WHERE admin_id = ? AND accounting_system = 'saga'
--    AND accounting_sync_status IN ('pending','modified')
CREATE INDEX IF NOT EXISTS idx_order_invoices_saga_queue
  ON order_invoices (admin_id, accounting_system, accounting_sync_status)
  WHERE accounting_system = 'saga';

-- 3. Add accounting_sync_error column if missing (stores last error message)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_invoices' AND column_name = 'accounting_sync_error'
  ) THEN
    ALTER TABLE order_invoices ADD COLUMN accounting_sync_error text;
  END IF;
END $$;
