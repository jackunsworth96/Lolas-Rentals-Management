-- Inactive employees must not be able to sign in.
-- Keep public.users.is_active in step with employees.status, and turn off
-- logins that are already active for inactive employees.

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users (employee_id);

CREATE OR REPLACE FUNCTION public.sync_employee_login_access()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET is_active = (lower(btrim(NEW.status)) IS DISTINCT FROM 'inactive')
  WHERE employee_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_sync_login_access ON public.employees;

CREATE TRIGGER employees_sync_login_access
AFTER UPDATE OF status ON public.employees
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_employee_login_access();

REVOKE ALL ON FUNCTION public.sync_employee_login_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_employee_login_access() TO service_role;

UPDATE public.users AS u
SET is_active = false
FROM public.employees AS e
WHERE u.employee_id = e.id
  AND lower(btrim(e.status)) = 'inactive'
  AND u.is_active = true;
