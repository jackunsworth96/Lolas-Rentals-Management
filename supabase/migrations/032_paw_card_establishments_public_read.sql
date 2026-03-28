-- Partner list is public metadata; allow anon reads so the dropdown works even if the
-- JWT is not yet attached to the client request. Authenticated users keep the same access.
CREATE POLICY paw_card_establishments_select_anon
  ON public.paw_card_establishments
  FOR SELECT
  TO anon
  USING (is_active = true);
