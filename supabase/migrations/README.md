# Database migrations

## Naming convention (use this for **new** files)

1. **Create migrations only with the CLI** (generates a unique UTC timestamp prefix):

   ```bash
   npx supabase migration new short_description_in_snake_case
   ```

   Produces: `YYYYMMDDHHMMSS_short_description_in_snake_case.sql`

2. **Slug rules:** lowercase, snake_case, describe the *change* (e.g. `add_partner_enrollment_details`, `fix_timesheet_rls`), not the ticket number alone.

3. **One concern per file** when practical, so rollbacks and reviews stay clear.

## Legacy numbered files (`001_` … `137_`)

Early migrations use `NNN_description.sql`. **Sort order is the full file name** (lexicographic), not just `NNN`.

Previously, two files shared `134_` and two shared `135_`, which was confusing. They are now unique and run in this order:

| Order | File |
|------:|------|
| 134 | `134_accommodation_partners_deal_types.sql` |
| 135 | `135_users_employee_id_on_delete_cascade.sql` |
| 136 | `136_partner_enrollment_details.sql` |
| 137 | `137_ui_errors_employee_id_on_delete_set_null.sql` |

After `137_`, timestamp-named migrations continue (e.g. `20260424…`).

**Do not renumber older `001_`–`133_` files** — it breaks migration history on any database that already applied them.

## If you already applied the old file names locally

If Supabase CLI linked the **previous** names (`135_partner_enrollment_details.sql`, etc.) in `supabase_migrations.schema_migrations`, a rename alone makes the CLI think history is out of sync. Fix with:

```bash
npx supabase migration repair --status reverted  <old_version>
npx supabase migration repair --status applied   <new_version>
```

…or apply the equivalent updates in the Dashboard **Migration** / SQL history for your project. Use the version string Supabase recorded (often the filename without `.sql`).

## Empty or duplicate stubs

If `supabase migration new` created an empty file by accident, **delete the stub** and keep one canonical file with the real SQL — duplicate slugs confuse everyone.
