-- Reclassify Lola's expenses from 1 Nov 2026 onto the curated catalog (approved dry run).
-- Moves each row's type and account, and the matching journal debit leg. Cash legs are untouched,
-- so till/GCash/Wise balances and the trial balance totals must not move.
-- Left as is on purpose: "Refund Deposit to Italo in Cash" (55ee7d31…), pending review.

INSERT INTO expense_categories
  (name, main_category, account_id, is_active, kind, group_name, sort_order,
   requires_vehicle, requires_employee, requires_note, soft_limit, managers_only, help_text, link_path)
SELECT 'Driver Payments', 'Business costs', 'EXP-DRIVER-PAY', true, 'standard', 'Business costs', 125,
       false, false, true, NULL, true, 'Paying an outside driver for a transfer. Say who and which booking.', NULL
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Driver Payments' AND is_active);

DO $$
DECLARE
  v_driver int := (SELECT id FROM expense_categories WHERE name = 'Driver Payments' AND is_active);
  v_geo text := '43ae55f6-fe46-46d3-8652-b1424dc03d52';
  v_before jsonb;
  v_after jsonb;
  v_bad int;
BEGIN
  CREATE TEMP TABLE reclass (expense_id text PRIMARY KEY, category_id int, account_id text, employee_id text) ON COMMIT DROP;

  INSERT INTO reclass VALUES
    -- Partner Commissions
    ('db1fa4c8-dc5a-4eaf-8fe5-9a6d9bb9952d', 65, 'EXP-PARTNER-COMMISSION', NULL),
    ('5b59f508-5c12-4cb0-8462-58732b0d966c', 65, 'EXP-PARTNER-COMMISSION', NULL),
    -- Accounting, Tax & Fees
    ('c6323c51-7ce9-4c91-8ba8-6eeffaac65ce', 64, 'EXP-PROFESSIONAL-FEES', NULL),
    -- Bills & Utilities
    ('46704dee-9883-41a9-8caf-75dc5af0c4bf', 62, 'EXP-UTILITIES', NULL),
    -- Government Contributions
    ('eeda99c9-763e-40a1-bf36-f58063d5e18d', 72, 'EXP-EMPLOYER-CONTRIB', NULL),
    ('adea7c85-3a05-4e43-89e8-8c89c7ed98d7', 72, 'EXP-EMPLOYER-CONTRIB', NULL),
    -- Driver Payments
    ('44c6a833-b08f-48c4-a8b3-1406a7256d15', v_driver, 'EXP-DRIVER-PAY', NULL),
    ('c1036567-e032-46f0-935b-52b03a822e33', v_driver, 'EXP-DRIVER-PAY', NULL),
    -- Marketing & Printing
    ('2c5a7eff-fd62-4ff6-b459-8eded2b2761d', 61, 'EXP-MARKETING-store-lolas', NULL),
    ('49476957-1f0d-4930-b0db-ddae6db0bc18', 61, 'EXP-MARKETING-store-lolas', NULL),
    ('696710b9-828e-4d6f-8eb2-e4a738f0b218', 61, 'EXP-MARKETING-store-lolas', NULL),
    ('9a7af6c0-e7ea-4fa9-83e9-06a79516ab52', 61, 'EXP-MARKETING-store-lolas', NULL),
    ('0312b2d2-ef34-4aa5-b5ac-5b001253ff86', 61, 'EXP-MARKETING-store-lolas', NULL),
    -- Business Fuel
    ('bde9ddbe-543b-4935-9db8-87c27ff70bd9', 57, 'EXP-FUEL-store-lolas', NULL),
    ('b2363bab-ca5b-42ce-aa1a-37b3c85455f9', 57, 'EXP-FUEL-store-lolas', NULL),
    ('e357c206-6c5f-42d3-a494-2ae9db4a3910', 57, 'EXP-FUEL-store-lolas', NULL),
    ('a911455f-86a6-4f8c-ace4-00f69c5674ef', 57, 'EXP-FUEL-store-lolas', NULL),
    ('cf04ab56-0ee1-4df8-931f-a62432c37f6e', 57, 'EXP-FUEL-store-lolas', NULL),
    -- Entertainment & Hospitality
    ('c1503560-b690-4000-93e3-2dbe8fb78a59', 63, 'EXP-ENTERTAINMENT', NULL),
    ('91a8ef64-9500-4398-8790-be9d0409dbb7', 63, 'EXP-ENTERTAINMENT', NULL),
    ('221ac556-804c-41f6-b394-989382b4b316', 63, 'EXP-ENTERTAINMENT', NULL),
    -- Jack Personal (owner's withdrawals)
    ('03e1a706-14a4-4453-ab08-1610c88237d7', 68, 'OWNER-DRAWINGS-JACK', NULL),
    ('f643e95e-1fc0-49db-adb1-32696003dd0d', 68, 'OWNER-DRAWINGS-JACK', NULL),
    ('73a08e6e-f963-4e87-8742-b9a4fe450a57', 68, 'OWNER-DRAWINGS-JACK', NULL),
    ('d7ab7969-ce3e-4752-8c2a-257f65ba6d81', 68, 'OWNER-DRAWINGS-JACK', NULL),
    ('ed1feb30-530e-414b-8bf4-f4d53315fbf3', 68, 'OWNER-DRAWINGS-JACK', NULL),
    ('f01f4cbe-b892-4733-bf1b-d7e9c44a29e5', 68, 'OWNER-DRAWINGS-JACK', NULL),
    -- Claire Personal (owner's withdrawals)
    ('8717b291-b315-417a-96e8-f9c41374e66d', 69, 'OWNER-DRAWINGS-CLAIRE', NULL),
    ('128315fe-37a8-4147-9ccf-355e54e698d9', 69, 'OWNER-DRAWINGS-CLAIRE', NULL),
    ('c2b0399a-4ddb-44ea-8475-b06fdae07aae', 69, 'OWNER-DRAWINGS-CLAIRE', NULL),
    ('fac3d26d-8e34-4688-8186-516732b39532', 69, 'OWNER-DRAWINGS-CLAIRE', NULL),
    -- 9pm Returns (paid through payroll)
    ('1b663a87-1b61-465c-a741-34e0478bd41a', 71, 'EXP-PAYROLL-store-lolas', NULL),
    ('bf7bc60f-f75d-4700-b03d-989c0bf7a750', 71, 'EXP-PAYROLL-store-lolas', NULL),
    ('b7d7cd6b-3b49-4d8a-bcc7-d48b561f9b6e', 71, 'EXP-PAYROLL-store-lolas', NULL),
    ('9bb58b7f-dd80-4765-82fa-19dc63fe5103', 71, 'EXP-PAYROLL-store-lolas', NULL),
    ('d6dee5f1-c381-4da3-9395-5657d54d33eb', 71, 'EXP-PAYROLL-store-lolas', NULL),
    -- Transport & Fares
    ('1906f71d-7aa9-4feb-bd80-35d5c7939e08', 56, 'EXP-TRANSPORT', NULL),
    ('2905efb7-c9d1-4f7d-b977-a5e7c4a2b9f2', 56, 'EXP-TRANSPORT', NULL),
    ('088d818d-c2a1-4d99-8aa3-c0a1a27f0220', 56, 'EXP-TRANSPORT', NULL),
    ('b91ded8a-0115-42be-98f1-cdb17225b19d', 56, 'EXP-TRANSPORT', NULL),
    ('6046d92e-5c42-4e67-ad9e-85dd3c8c5b3a', 56, 'EXP-TRANSPORT', NULL),
    ('03c1f5b5-abad-4a22-adc2-ba94c9e50870', 56, 'EXP-TRANSPORT', NULL),
    ('85e6feb0-d44e-45b4-a05f-f75c18baba5e', 56, 'EXP-TRANSPORT', NULL),
    ('8084e963-2983-4a5c-b0a1-6da9a0b7829f', 56, 'EXP-TRANSPORT', NULL),
    -- Spare Parts & Rental Gear
    ('047898c7-1e34-4c88-bc46-4c46cca84d7f', 58, 'EXP-MAINTENANCE-store-lolas', NULL),
    ('ac88de08-bee3-45d6-b4f9-8958f847ff9e', 58, 'EXP-MAINTENANCE-store-lolas', NULL),
    ('ebdad2c4-ab63-4f28-aa88-8129328204b2', 58, 'EXP-MAINTENANCE-store-lolas', NULL),
    ('e96ade54-4074-4c90-9a17-280877fa06cd', 58, 'EXP-MAINTENANCE-store-lolas', NULL),
    -- Staff Vehicle Allowance: journals already debit the payable, only the row label was wrong
    ('893581a8-18a3-4bf5-bd13-673dbc207890', 59, 'VEHICLE-ALLOWANCE-PAYABLE', NULL),
    ('28508593-cc14-4fc2-aa1d-6fdc051ba969', 59, 'VEHICLE-ALLOWANCE-PAYABLE', NULL),
    ('5e4e91f8-d729-40eb-aeba-1b2ab31e0552', 59, 'VEHICLE-ALLOWANCE-PAYABLE', NULL),
    ('554df4cb-c087-4d04-a382-b11d04163d17', 59, 'VEHICLE-ALLOWANCE-PAYABLE', NULL),
    -- Geo's personal parcel: a cash advance repaid from his salary
    ('f186048b-7284-4e5e-9c52-db281eabf9ef', 60, 'Employee-Advance', v_geo);

  IF v_driver IS NULL THEN RAISE EXCEPTION 'Driver Payments type missing'; END IF;
  IF (SELECT count(*) FROM reclass r JOIN expenses e ON e.id = r.expense_id
      WHERE e.store_id = 'store-lolas' AND e.date >= '2026-11-01') <> (SELECT count(*) FROM reclass) THEN
    RAISE EXCEPTION 'Some expenses in the reclass list are missing or outside November';
  END IF;

  SELECT jsonb_build_object(
    'dr', sum(debit), 'cr', sum(credit),
    'cash', sum(CASE WHEN account_id = 'CASH-LOLA' THEN debit - credit END),
    'gcash', sum(CASE WHEN account_id = 'GCASH-store-lolas' THEN debit - credit END),
    'wise', sum(CASE WHEN account_id = 'Wise' THEN debit - credit END))
  INTO v_before FROM journal_entries;

  UPDATE journal_entries j
  SET account_id = r.account_id
  FROM reclass r JOIN expenses e ON e.id = r.expense_id
  WHERE j.reference_type = 'expense'
    AND j.reference_id = r.expense_id
    AND j.debit > 0
    AND j.account_id = e.account_id
    AND j.account_id <> r.account_id;

  UPDATE expenses e
  SET category_id = r.category_id,
      category = c.name,
      account_id = r.account_id,
      employee_id = COALESCE(r.employee_id, e.employee_id),
      description = CASE WHEN r.employee_id IS NOT NULL
                         THEN e.description || ' (personal, deducted from salary)'
                         ELSE e.description END
  FROM reclass r JOIN expense_categories c ON c.id = r.category_id
  WHERE e.id = r.expense_id;

  INSERT INTO cash_advance_schedules
    (id, employee_id, expense_id, total_amount, granted_date, installment_amount, period_start, period_end,
     deduction_per_period, remaining_balance, start_date, payday_type)
  SELECT gen_random_uuid(), r.employee_id, e.id, e.amount, e.date, e.amount, e.date, e.date,
         e.amount, e.amount, e.date, 'end_of_month'
  FROM reclass r JOIN expenses e ON e.id = r.expense_id
  WHERE r.employee_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM cash_advance_schedules s WHERE s.expense_id = e.id);

  -- Every paid row must now debit its new account exactly once.
  SELECT count(*) INTO v_bad
  FROM reclass r JOIN expenses e ON e.id = r.expense_id
  WHERE e.status = 'paid'
    AND (SELECT count(*) FROM journal_entries j
         WHERE j.reference_type = 'expense' AND j.reference_id = r.expense_id
           AND j.debit > 0 AND j.account_id = r.account_id) <> 1;
  IF v_bad > 0 THEN RAISE EXCEPTION '% reclassified expenses do not have a matching debit leg', v_bad; END IF;

  SELECT jsonb_build_object(
    'dr', sum(debit), 'cr', sum(credit),
    'cash', sum(CASE WHEN account_id = 'CASH-LOLA' THEN debit - credit END),
    'gcash', sum(CASE WHEN account_id = 'GCASH-store-lolas' THEN debit - credit END),
    'wise', sum(CASE WHEN account_id = 'Wise' THEN debit - credit END))
  INTO v_after FROM journal_entries;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'Totals moved: before % after %', v_before, v_after;
  END IF;
END $$;
