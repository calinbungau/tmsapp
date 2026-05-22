-- Fix: expand template_type check constraint to include forwarding_order and carrier_order
ALTER TABLE order_templates DROP CONSTRAINT IF EXISTS order_templates_template_type_check;
ALTER TABLE order_templates ADD CONSTRAINT order_templates_template_type_check
  CHECK (template_type IN ('order_confirmation','cmr','invoice','credit_note','pod','forwarding_order','carrier_order'));

-- Add forwarding_checklist column (idempotent from 065)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS forwarding_checklist jsonb;

COMMENT ON COLUMN orders.forwarding_checklist IS 'Post-delivery checklist for forwarding orders. Structure: { "documents_received": { "checked": bool, "date": string|null, "note": string }, "client_invoiced": {...}, "documents_sent_client": {...}, "carrier_payment_due": {...}, "carrier_paid": {...}, "client_payment_received": {...} }';

-- Seed default forwarding order template
INSERT INTO order_templates (admin_id, template_type, name, html_template, is_default, is_active)
SELECT 
  a.id,
  'carrier_order',
  'Default Carrier Order',
  '{"blocks":[{"id":"header","type":"company_header","visible":true,"props":{}},{"id":"order_info","type":"order_info","visible":true,"props":{}},{"id":"route","type":"route_summary","visible":true,"props":{}},{"id":"stops","type":"stops_table","visible":true,"props":{"maxPerPage":10}},{"id":"cargo","type":"cargo_details","visible":true,"props":{}},{"id":"financials","type":"financial_summary","visible":true,"props":{"showCarrierCost":true,"showCustomerPrice":false,"showMargin":false}},{"id":"carrier","type":"carrier_info","visible":true,"props":{}},{"id":"notes","type":"notes","visible":true,"props":{}},{"id":"signatures","type":"signature_area","visible":true,"props":{}},{"id":"footer","type":"footer","visible":true,"props":{}}],"pageSettings":{"margins":{"top":20,"right":20,"bottom":20,"left":20},"orientation":"portrait","stopsPerPage":10}}',
  true,
  true
FROM admins a
WHERE NOT EXISTS (
  SELECT 1 FROM order_templates ot WHERE ot.admin_id = a.id AND ot.template_type = 'carrier_order'
);
