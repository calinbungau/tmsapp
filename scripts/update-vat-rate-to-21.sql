-- Update VAT rate constraint and defaults to 21% (current Romanian standard rate as of 2024)
-- Romanian VAT rates: 21% (standard), 9% (reduced), 5% (reduced), 0%

-- Update default values for VAT rate columns
ALTER TABLE orders 
  ALTER COLUMN customer_vat_rate SET DEFAULT 21,
  ALTER COLUMN carrier_vat_rate SET DEFAULT 21;

-- Update existing orders with 19% rate to 21% (only if they haven't been invoiced yet)
UPDATE orders 
SET customer_vat_rate = 21 
WHERE customer_vat_rate = 19 
  AND customer_vat_type = 'excluding'
  AND status NOT IN ('invoiced', 'completed', 'fwd_completed');

UPDATE orders 
SET carrier_vat_rate = 21 
WHERE carrier_vat_rate = 19 
  AND carrier_vat_type = 'excluding'
  AND status NOT IN ('invoiced', 'completed', 'fwd_completed');

-- Recalculate VAT amounts for updated orders
UPDATE orders 
SET 
  customer_vat_amount = ROUND((customer_price * (customer_vat_rate / 100))::numeric, 2),
  customer_price_with_vat = ROUND((customer_price * (1 + customer_vat_rate / 100))::numeric, 2),
  customer_price_without_vat = customer_price
WHERE customer_vat_type = 'excluding' 
  AND customer_price IS NOT NULL
  AND status NOT IN ('invoiced', 'completed', 'fwd_completed');

UPDATE orders 
SET 
  carrier_vat_amount = ROUND((carrier_cost * (carrier_vat_rate / 100))::numeric, 2),
  carrier_cost_with_vat = ROUND((carrier_cost * (1 + carrier_vat_rate / 100))::numeric, 2),
  carrier_cost_without_vat = carrier_cost
WHERE carrier_vat_type = 'excluding' 
  AND carrier_cost IS NOT NULL
  AND status NOT IN ('invoiced', 'completed', 'fwd_completed');
