ALTER TABLE addons
  ADD COLUMN applicable_model_ids text[] DEFAULT NULL;

COMMENT ON COLUMN addons.applicable_model_ids IS
  'When NULL or empty, the add-on applies to all vehicle models. When populated, only applies to the listed model IDs.';
