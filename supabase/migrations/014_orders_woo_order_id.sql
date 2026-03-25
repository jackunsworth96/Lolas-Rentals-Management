-- Add WooCommerce order number for display (4-digit from webhook)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS woo_order_id text;
