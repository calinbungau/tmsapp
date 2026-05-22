-- Add forwarder_settings JSONB column to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS forwarder_settings jsonb DEFAULT '{
  "profit_display_currency": "EUR",
  "default_carrier_currency": "EUR",
  "default_payment_terms_days": 30,
  "order_prefix": "FWD",
  "margin_warning_threshold": 10,
  "margin_danger_threshold": 5,
  "default_carrier_id": null,
  "email_notifications": {
    "on_carrier_assign": true,
    "on_status_change": true,
    "on_delivery_complete": true
  },
  "order_template": {
    "show_company_logo": true,
    "show_cargo_details": true,
    "show_payment_terms": true,
    "footer_text": "",
    "language": "en"
  }
}'::jsonb;
