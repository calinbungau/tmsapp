-- Enhance order_invoices table for Skonto, Partial Payments, and Accounting Integration

-- Add Skonto (early payment discount) fields
ALTER TABLE order_invoices
ADD COLUMN IF NOT EXISTS skonto_percentage numeric,
ADD COLUMN IF NOT EXISTS skonto_days integer,
ADD COLUMN IF NOT EXISTS skonto_deadline date,
ADD COLUMN IF NOT EXISTS skonto_amount numeric;

-- Add partial payment tracking
ALTER TABLE order_invoices
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_amount numeric;

-- Add accounting software integration fields
ALTER TABLE order_invoices
ADD COLUMN IF NOT EXISTS accounting_system text, -- 'smartbill', 'fgo', 'e-factura', null
ADD COLUMN IF NOT EXISTS accounting_sync_status text DEFAULT 'pending', -- 'pending', 'synced', 'error', 'not_applicable'
ADD COLUMN IF NOT EXISTS accounting_sync_id text, -- external reference ID
ADD COLUMN IF NOT EXISTS accounting_sync_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS accounting_sync_error text;

-- Add external invoice number (for incoming carrier invoices)
ALTER TABLE order_invoices
ADD COLUMN IF NOT EXISTS external_invoice_number text;

-- Add line items support (for PDF generation)
ALTER TABLE order_invoices
ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb;

-- Update status check constraint to include more statuses
ALTER TABLE order_invoices DROP CONSTRAINT IF EXISTS order_invoices_status_check;
ALTER TABLE order_invoices ADD CONSTRAINT order_invoices_status_check 
CHECK (status IN ('draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'credit_note'));

-- Update direction check constraint
ALTER TABLE order_invoices DROP CONSTRAINT IF EXISTS order_invoices_direction_check;
ALTER TABLE order_invoices ADD CONSTRAINT order_invoices_direction_check 
CHECK (direction IN ('outgoing', 'incoming'));

-- Add accounting sync status check
ALTER TABLE order_invoices DROP CONSTRAINT IF EXISTS order_invoices_accounting_sync_status_check;
ALTER TABLE order_invoices ADD CONSTRAINT order_invoices_accounting_sync_status_check 
CHECK (accounting_sync_status IN ('pending', 'synced', 'error', 'not_applicable') OR accounting_sync_status IS NULL);

-- Create order_invoice_payments table for tracking partial payments
CREATE TABLE IF NOT EXISTS order_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES order_invoices(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  payment_method text, -- 'bank_transfer', 'cash', 'card', 'other'
  reference_number text, -- bank transaction reference
  notes text,
  is_skonto boolean DEFAULT false, -- was this a skonto payment?
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- RLS for invoice payments
ALTER TABLE order_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_invoice_payments_select ON order_invoice_payments FOR SELECT USING (true);
CREATE POLICY order_invoice_payments_insert ON order_invoice_payments FOR INSERT WITH CHECK (true);
CREATE POLICY order_invoice_payments_update ON order_invoice_payments FOR UPDATE USING (true);
CREATE POLICY order_invoice_payments_delete ON order_invoice_payments FOR DELETE USING (true);

-- Function to auto-update invoice paid_amount and status when payments are added
CREATE OR REPLACE FUNCTION update_invoice_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  total_paid numeric;
  invoice_total numeric;
  inv_status text;
BEGIN
  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM order_invoice_payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Get invoice total
  SELECT total_with_tax, status INTO invoice_total, inv_status
  FROM order_invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Update invoice
  UPDATE order_invoices
  SET 
    paid_amount = total_paid,
    remaining_amount = invoice_total - total_paid,
    status = CASE
      WHEN total_paid >= invoice_total THEN 'paid'
      WHEN total_paid > 0 THEN 'partially_paid'
      ELSE inv_status
    END,
    paid_date = CASE
      WHEN total_paid >= invoice_total THEN CURRENT_DATE
      ELSE NULL
    END
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment updates
DROP TRIGGER IF EXISTS trg_update_invoice_payments ON order_invoice_payments;
CREATE TRIGGER trg_update_invoice_payments
AFTER INSERT OR UPDATE OR DELETE ON order_invoice_payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_payment_totals();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_order_invoice_payments_invoice_id ON order_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_order_invoices_status ON order_invoices(status);
CREATE INDEX IF NOT EXISTS idx_order_invoices_due_date ON order_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_order_invoices_direction ON order_invoices(direction);
