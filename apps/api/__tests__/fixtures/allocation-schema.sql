-- Minimal existing schema for the allocation migration's PostgreSQL integration tests.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
CREATE TABLE stores(id text PRIMARY KEY);
CREATE TABLE accommodation_partners(id uuid PRIMARY KEY,store_id text,slug text,portal_subdomain text,active boolean,status text);
CREATE TABLE vehicle_models(id text PRIMARY KEY,name text,type text,is_active boolean DEFAULT true);
CREATE TABLE fleet(id text PRIMARY KEY,store_id text,model_id text,status text);
CREATE TABLE fleet_unavailability(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id text,vehicle_id text,starts_at timestamptz,ends_at timestamptz,cancelled_at timestamptz);
CREATE TABLE booking_holds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id text,vehicle_model_id text,pickup_datetime timestamptz,dropoff_datetime timestamptz,session_token text,expires_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE orders_raw(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id text,partner_ref text,vehicle_model_id text,vehicle_id text,pickup_datetime timestamptz,dropoff_datetime timestamptz,status text DEFAULT 'unprocessed',created_at timestamptz DEFAULT now(),order_reference text UNIQUE,booking_channel text,cancellation_token text);
CREATE TABLE orders(id text PRIMARY KEY,store_id text,partner_ref text,status text,booking_token text);
CREATE TABLE order_items(id text PRIMARY KEY,store_id text,order_id text,vehicle_id text,pickup_datetime timestamptz,dropoff_datetime timestamptz,created_at timestamptz DEFAULT now());
CREATE FUNCTION activate_order_atomic(p_order_id text,p_store_id text,p_order_items jsonb,p_status text,p_booking_token text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO orders(id,store_id,status,booking_token) VALUES(p_order_id,p_store_id,p_status,p_booking_token);
 INSERT INTO order_items(id,store_id,order_id,vehicle_id,pickup_datetime,dropoff_datetime)
 SELECT x.id,p_store_id,p_order_id,x.vehicle_id,x.pickup_datetime,x.dropoff_datetime
 FROM jsonb_populate_recordset(NULL::order_items,p_order_items) x;
END $$;
