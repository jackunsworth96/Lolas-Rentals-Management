-- Part days: share of a full day's pay a worked timesheet earns (0.5 = half day).
-- Hours alone can't carry this because normal 7-hour shifts are still paid as a full day.
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS day_fraction numeric(4,3) NOT NULL DEFAULT 1;

ALTER TABLE public.timesheets
  DROP CONSTRAINT IF EXISTS timesheets_day_fraction_check;
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_day_fraction_check CHECK (day_fraction > 0 AND day_fraction <= 1);
