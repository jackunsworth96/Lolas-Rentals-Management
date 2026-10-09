-- Allow logging "user error" breakdowns (kickstand left down, etc.)
-- where the vehicle itself was fine. These stay on the report so we
-- can see the volume, but they should not count as a real fleet issue.

alter table public.breakdown_reports
  drop constraint if exists breakdown_reports_issue_type_check;

alter table public.breakdown_reports
  add constraint breakdown_reports_issue_type_check
  check (issue_type in (
    'flat_tyre',
    'flat_battery',
    'engine_mechanical',
    'electrical',
    'user_error',
    'other'
  ));
