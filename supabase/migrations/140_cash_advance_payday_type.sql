-- Add payday_type to cash_advance_schedules so each scheduled deduction
-- can be tagged to either the 15th (mid_month) or last-day (end_of_month) payrun.
-- Existing rows default to 'end_of_month' to preserve current behaviour.

ALTER TABLE cash_advance_schedules
  ADD COLUMN IF NOT EXISTS payday_type text NOT NULL DEFAULT 'end_of_month'
    CHECK (payday_type IN ('mid_month', 'end_of_month'));
