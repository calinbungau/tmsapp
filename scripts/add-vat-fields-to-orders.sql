-- Add VAT-related fields to orders table for Romanian law compliance
-- VAT Types according to Romanian fiscal code:
-- - 'excluding' = Price without VAT (fără TVA) - most common in B2B
-- - 'including' = Price includes VAT (cu TVA inclus)  
-- - 'exempt' = VAT exempt (scutit de TVA) - for intra-EU transport with valid VAT
-- - 'reverse_charge' = Reverse charge (taxare inversă) - B2B intra-EU services
-- - 'non_taxable' = Non-taxable (nescutit) - export outside EU

-- Customer pricing VAT fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_vat_type TEXT DEFAULT 'excluding';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_vat_rate NUMERIC DEFAULT 19;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_vat_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_price_with_vat NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_price_without_vat NUMERIC;

-- Carrier pricing VAT fields  
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_vat_type TEXT DEFAULT 'excluding';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_vat_rate NUMERIC DEFAULT 19;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_vat_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_cost_with_vat NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_cost_without_vat NUMERIC;

-- Add constraints for VAT types
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_vat_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_customer_vat_type_check 
  CHECK (customer_vat_type IN ('excluding', 'including', 'exempt', 'reverse_charge', 'non_taxable'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_carrier_vat_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_carrier_vat_type_check 
  CHECK (carrier_vat_type IN ('excluding', 'including', 'exempt', 'reverse_charge', 'non_taxable'));

-- Add check for valid VAT rates (Romanian standard: 19%, reduced: 9%, 5%, or 0% for exempt)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_vat_rate_check;
ALTER TABLE orders ADD CONSTRAINT orders_customer_vat_rate_check 
  CHECK (customer_vat_rate IN (0, 5, 9, 19));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_carrier_vat_rate_check;
ALTER TABLE orders ADD CONSTRAINT orders_carrier_vat_rate_check 
  CHECK (carrier_vat_rate IN (0, 5, 9, 19));

-- Update existing orders to populate the new calculated fields
-- For existing orders, assume price is without VAT (excluding)
UPDATE orders 
SET 
  customer_price_without_vat = customer_price,
  customer_price_with_vat = customer_price * (1 + COALESCE(customer_vat_rate, 19) / 100),
  customer_vat_amount = customer_price * (COALESCE(customer_vat_rate, 19) / 100),
  carrier_cost_without_vat = carrier_cost,
  carrier_cost_with_vat = carrier_cost * (1 + COALESCE(carrier_vat_rate, 19) / 100),
  carrier_vat_amount = carrier_cost * (COALESCE(carrier_vat_rate, 19) / 100)
WHERE customer_price IS NOT NULL OR carrier_cost IS NOT NULL;

-- Add comment explaining Romanian VAT rules for transport
COMMENT ON COLUMN orders.customer_vat_type IS 'VAT type: excluding (net), including (gross), exempt, reverse_charge, non_taxable';
COMMENT ON COLUMN orders.customer_vat_rate IS 'VAT rate in %: 19 (standard), 9, 5 (reduced), 0 (exempt)';
