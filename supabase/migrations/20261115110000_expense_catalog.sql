-- Expense catalog: a short list of expense types, each locked to the right account.
--
-- kind:
--   standard           posts DR account / CR paid-from through the Expenses page
--   bike_allowance     pays out of an employee's vehicle allowance balance
--   cash_advance       grants a cash advance with a payroll deduction schedule
--   handled_elsewhere  shown on the Expenses page with a link; cannot be logged there
--   system             written by other flows (maintenance, timesheets); never picked by hand

-- 1. Accounts the old list was missing (spending was landing in "Other").
INSERT INTO chart_of_accounts (id, name, account_type, store_id, is_active) VALUES
  ('EXP-TRANSPORT',          'Transport & Fares',                    'Expense', 'company', true),
  ('EXP-UTILITIES',          'Bills & Utilities',                    'Expense', 'company', true),
  ('EXP-PROFESSIONAL-FEES',  'Accounting, Tax & Professional Fees',  'Expense', 'company', true),
  ('EXP-PARTNER-COMMISSION', 'Partner Commissions',                  'Expense', 'company', true),
  ('EXP-ENTERTAINMENT',      'Entertainment & Hospitality',          'Expense', 'company', true),
  ('OWNER-DRAWINGS-JACK',    'Owner''s Withdrawals - Jack',          'Equity',  'company', true),
  ('OWNER-DRAWINGS-CLAIRE',  'Owner''s Withdrawals - Claire',        'Equity',  'company', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Catalog columns.
ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS kind              text    NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS group_name        text,
  ADD COLUMN IF NOT EXISTS sort_order        integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS requires_vehicle  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_employee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_note     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS soft_limit        numeric(12,2),
  ADD COLUMN IF NOT EXISTS managers_only     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS help_text         text,
  ADD COLUMN IF NOT EXISTS link_path         text;

ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_kind_check;
ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_kind_check
  CHECK (kind IN ('standard', 'bike_allowance', 'cash_advance', 'handled_elsewhere', 'system'));

-- An active category must book to an account that can actually take the cost:
-- never a cash/bank asset, which is what sent spending to the wrong place before.
CREATE OR REPLACE FUNCTION public.expense_category_check_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_type text;
BEGIN
  IF NOT NEW.is_active OR NEW.kind IN ('handled_elsewhere', 'system') THEN
    RETURN NEW;
  END IF;
  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Expense type "%" needs an account', NEW.name USING ERRCODE = 'check_violation';
  END IF;
  SELECT account_type INTO v_type FROM chart_of_accounts WHERE id = NEW.account_id AND is_active;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Account % does not exist or is inactive', NEW.account_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'standard' AND v_type NOT IN ('Expense', 'Equity', 'Liability') THEN
    RAISE EXCEPTION 'Expense type "%" cannot book to a % account', NEW.name, v_type USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS expense_category_check_account ON expense_categories;
CREATE TRIGGER expense_category_check_account BEFORE INSERT OR UPDATE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.expense_category_check_account();

-- 3. Retire the old list and seed the curated one.
UPDATE expense_categories SET is_active = false WHERE is_active AND kind = 'standard' AND group_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_active_name
  ON expense_categories (lower(name)) WHERE is_active;

INSERT INTO expense_categories
  (name, main_category, account_id, is_active, kind, group_name, sort_order,
   requires_vehicle, requires_employee, requires_note, soft_limit, managers_only, help_text, link_path)
SELECT * FROM (VALUES
  ('Staff Meal',                  'Everyday', 'EXP-STAFF-MEAL-store-lolas', true, 'standard', 'Everyday', 10, false, false, false, 500::numeric,  false, 'Meals bought for staff on shift.', NULL::text),
  ('Shop Supplies',               'Everyday', 'EXP-SUPPLIES-store-lolas',   true, 'standard', 'Everyday', 20, false, false, false, 3000,  false, 'Cleaning products, stationery, water, bags and other shop consumables.', NULL),
  ('Transport & Fares',           'Everyday', 'EXP-TRANSPORT',              true, 'standard', 'Everyday', 30, false, false, false, 500,   false, 'Tuktuk and van fares for business trips, deliveries and pick-ups.', NULL),
  ('Business Fuel',               'Vehicles', 'EXP-FUEL-store-lolas',       true, 'standard', 'Vehicles', 40, false, false, false, 1500,  false, 'Fuel for the fleet and fuel canisters. Not for staff bike allowance.', NULL),
  ('Spare Parts & Rental Gear',   'Vehicles', 'EXP-MAINTENANCE-store-lolas',true, 'standard', 'Vehicles', 50, false, false, false, 5000,  false, 'Stock parts, helmets, locks, phone holders and other rental inclusions.', NULL),
  ('Staff Vehicle Allowance',     'Staff payouts', 'VEHICLE-ALLOWANCE-PAYABLE', true, 'bike_allowance', 'Staff payouts', 60, false, true, false, NULL, false, 'Fuel or bike costs paid from a staff member''s monthly bike allowance. Comes off their balance.', NULL),
  ('Cash Advance',                'Staff payouts', 'Employee-Advance',      true, 'cash_advance', 'Staff payouts', 70, false, true, false, 5000, false, 'Money lent to a staff member. It is deducted from their pay on the payday you choose.', NULL),
  ('Marketing & Printing',        'Business costs', 'EXP-MARKETING-store-lolas', true, 'standard', 'Business costs', 80, false, false, false, 5000, false, 'Printing, signage, stickers, ads and promotional items.', NULL),
  ('Bills & Utilities',           'Business costs', 'EXP-UTILITIES',        true, 'standard', 'Business costs', 90, false, false, false, 5000, false, 'Electricity, water, internet, phone load and other recurring bills.', NULL),
  ('Entertainment & Hospitality', 'Business costs', 'EXP-ENTERTAINMENT',    true, 'standard', 'Business costs', 100, false, false, true, 3000, false, 'Client or partner meals, team events and gifts. Say who it was for.', NULL),
  ('Accounting, Tax & Fees',      'Business costs', 'EXP-PROFESSIONAL-FEES',true, 'standard', 'Business costs', 110, false, false, true, NULL, true, 'Bookkeeping, BIR filings, permits, notary and freelancer fees.', NULL),
  ('Partner Commissions',         'Business costs', 'EXP-PARTNER-COMMISSION',true, 'standard', 'Business costs', 120, false, false, true, NULL, true, 'Commission paid to referral partners such as hotels. Say which partner and month.', NULL),
  ('Rent',                        'Business costs', 'EXP-RENT-store-lolas', true, 'standard', 'Business costs', 130, false, false, false, NULL, true, 'Shop or storage rent.', NULL),
  ('Peace of Mind Payout',        'Business costs', 'POM-CONTINGENCY-store-lolas', true, 'standard', 'Business costs', 140, false, false, true, NULL, true, 'Repair costs covered by a customer''s Peace of Mind cover. Paid from the contingency fund.', NULL),
  ('Jack Personal',               'Owner', 'OWNER-DRAWINGS-JACK',           true, 'standard', 'Owner', 150, false, false, false, 5000, false, 'Anything bought for Jack personally, including coconuts. Not a business cost.', NULL),
  ('Claire Personal',             'Owner', 'OWNER-DRAWINGS-CLAIRE',         true, 'standard', 'Owner', 160, false, false, false, 5000, false, 'Anything bought for Claire personally. Not a business cost.', NULL),
  ('Other',                       'Other', 'EXP-OTHER-store-lolas',         true, 'standard', 'Other', 900, false, false, true, 2000, true, 'Only if nothing above fits. Describe it clearly so it can be reviewed.', NULL),
  ('9pm Returns',                 'Handled elsewhere', NULL,                true, 'handled_elsewhere', 'Handled elsewhere', 1000, false, false, false, NULL, false, '9pm returns are counted on the timesheet and paid through payroll.', '/hr/timesheets'),
  ('Government Contributions',    'Handled elsewhere', NULL,                true, 'handled_elsewhere', 'Handled elsewhere', 1010, false, false, false, NULL, false, 'SSS, PhilHealth and Pag-IBIG are paid from Payroll, Remittances so they clear what payroll withheld.', '/hr/payroll'),
  ('Wages & Salaries',            'Handled elsewhere', NULL,                true, 'handled_elsewhere', 'Handled elsewhere', 1020, false, false, false, NULL, false, 'Wages, payslips and staff commission are paid by running payroll.', '/hr/payroll'),
  ('Vehicle Repair',              'Handled elsewhere', NULL,                true, 'handled_elsewhere', 'Handled elsewhere', 1030, false, false, false, NULL, false, 'Repairs on a specific vehicle are logged in Maintenance, which books the parts and labour.', '/maintenance'),
  ('Customer Refund',             'Handled elsewhere', NULL,                true, 'handled_elsewhere', 'Handled elsewhere', 1040, false, false, false, NULL, false, 'Deposit returns and booking refunds are done on the order so the customer''s balance is updated.', '/orders/active'),
  ('Maintenance Parts',           'System', NULL,                           true, 'system', 'System', 2000, false, false, false, NULL, false, NULL, NULL),
  ('Maintenance Labour',          'System', NULL,                           true, 'system', 'System', 2010, false, false, false, NULL, false, NULL, NULL)
) v(name, main_category, account_id, is_active, kind, group_name, sort_order,
    requires_vehicle, requires_employee, requires_note, soft_limit, managers_only, help_text, link_path)
WHERE NOT EXISTS (SELECT 1 FROM expense_categories c WHERE c.is_active AND lower(c.name) = lower(v.name));

-- 4. Link each expense to its catalog entry and record who logged or changed it.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS category_id integer REFERENCES expense_categories(id),
  ADD COLUMN IF NOT EXISTS created_by  text DEFAULT public.audit_actor('x-actor-employee-id'),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by  text;

CREATE INDEX IF NOT EXISTS expenses_category_id_idx ON expenses (category_id);

UPDATE expenses e SET category_id = (
  SELECT c.id FROM expense_categories c WHERE lower(c.name) = lower(e.category)
  ORDER BY c.is_active DESC, c.id DESC LIMIT 1
) WHERE e.category_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = e.store_id AND s.is_active = false);

CREATE OR REPLACE FUNCTION public.expenses_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.category IS DISTINCT FROM OLD.category AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id) THEN
    SELECT id INTO NEW.category_id FROM expense_categories
    WHERE lower(name) = lower(NEW.category)
    ORDER BY is_active DESC, id DESC LIMIT 1;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.updated_by := public.audit_actor('x-actor-employee-id');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS expenses_stamp ON expenses;
CREATE TRIGGER expenses_stamp BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_stamp();

-- 5. Every insert, edit and delete on expenses goes to the tamper-evident audit log.
SELECT public.audit_attach('public.expenses');
