-- Add forwarding_checklist JSONB column to orders table for post-delivery milestone tracking
-- Only used by forwarding orders; null for internal orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS forwarding_checklist jsonb;

-- Add a comment explaining the structure
COMMENT ON COLUMN orders.forwarding_checklist IS 'Post-delivery checklist for forwarding orders. Structure: { "documents_received": { "checked": bool, "date": string|null, "note": string }, "client_invoiced": {...}, "documents_sent_client": {...}, "carrier_payment_due": {...}, "carrier_paid": {...}, "client_payment_received": {...} }';

-- Ensure allocated is a valid status (update check constraint if exists, otherwise no-op)
-- The status column is text type, so any value is allowed. We just need the app to recognize it.

-- Seed default forwarding order template into order_templates if none exists
INSERT INTO order_templates (admin_id, template_type, name, html_template, is_default, is_active)
SELECT 
  a.id,
  'forwarding_order',
  'Default Forwarding Order',
  '{"blocks":[{"id":"header","type":"company_header","visible":true,"props":{}},{"id":"order_info","type":"order_info","visible":true,"props":{}},{"id":"route","type":"route_summary","visible":true,"props":{}},{"id":"stops","type":"stops_table","visible":true,"props":{}},{"id":"cargo","type":"cargo_details","visible":true,"props":{}},{"id":"financials","type":"financial_summary","visible":true,"props":{"showCarrierCost":true,"showCustomerPrice":false,"showMargin":false}},{"id":"carrier","type":"carrier_info","visible":true,"props":{}},{"id":"notes","type":"notes","visible":true,"props":{}},{"id":"signatures","type":"signature_area","visible":true,"props":{}},{"id":"footer","type":"footer","visible":true,"props":{}}],"pageSettings":{"margins":{"top":20,"right":20,"bottom":20,"left":20},"orientation":"portrait"}}',
  true,
  true
FROM admins a
WHERE NOT EXISTS (
  SELECT 1 FROM order_templates ot WHERE ot.admin_id = a.id AND ot.template_type = 'forwarding_order'
);
