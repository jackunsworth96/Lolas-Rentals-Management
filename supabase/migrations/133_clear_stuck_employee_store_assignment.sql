-- Clear stuck/invalid store assignment for Mico Angelo Subijano.
-- The employee had an inactive store ('store-seed-1') set as primary, which
-- the UI cannot display or remove because it is filtered out of the stores list.
-- After this migration, the user can open the modal and assign a correct active store.

DELETE FROM public.employee_stores
WHERE employee_id = '54a49e80-3ab5-44f8-93fe-a237fff75146';

UPDATE public.employees
SET store_id = NULL
WHERE id = '54a49e80-3ab5-44f8-93fe-a237fff75146';
