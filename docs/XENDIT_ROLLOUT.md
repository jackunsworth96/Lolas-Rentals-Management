# Xendit rollout

The integration uses Xendit Payment Sessions with hosted checkout. All credentials stay in the API environment; no Xendit secret belongs in a `VITE_*` variable.

## Required API environment

```dotenv
XENDIT_ENABLED=false
XENDIT_SECRET_KEY=xnd_development_...
XENDIT_CALLBACK_TOKEN=...
XENDIT_BUSINESS_ID=...
XENDIT_RETURN_STATE_SECRET=generate-a-long-random-api-only-secret
XENDIT_BASE_URL=https://api.xendit.co
XENDIT_ALLOWED_PAYMENT_CHANNELS=
WEB_URL=https://staging.example.com
```

`WEB_URL` must use HTTPS when Xendit is enabled. Leave `XENDIT_ALLOWED_PAYMENT_CHANNELS` empty to show every channel enabled on the Xendit account.

## Staging sequence

1. Take a staging database backup, then manually apply `scripts/manual/apply-xendit-schema.sql` through the Supabase SQL Editor or `psql`. Do not use `supabase db push` for this installation.
2. Deploy the API with Xendit development credentials and `XENDIT_ENABLED=false`.
3. Register `https://<api-host>/api/public/payments/xendit/webhook` as the Payment Session webhook in Xendit.
4. In Settings > Payment Methods, verify the `xendit` row, set the required surcharge, and confirm it is shown on the customer website.
5. Set `XENDIT_ENABLED=true` and redeploy the API.
6. Test a public single-vehicle booking, a grouped multi-vehicle booking, a cancelled checkout, an extension, and a staff-generated payment link.
7. Confirm each successful checkout creates one `payments` row per booking and no duplicates after resending the webhook. Confirm staff must cancel a live checkout before changing its order.
8. Review `xendit_payment_sessions` for `reconciliation_required` records before enabling checkout. A `creating` session with no provider session ID may be released only by an authorized Admin after verifying in the Xendit Dashboard that no payment occurred.

## Production sequence

Repeat the staging sequence with live credentials only after staging passes. Take a production database backup, keep Xendit disabled while the SQL and application deployment are being verified, and enable it only after webhook checks pass. Keep the Maya webhook and historical tables available during the agreed transition period, but do not expose Maya as a new-checkout option.

## Manual database installation

The Xendit schema is deliberately maintained outside `supabase/migrations` because the deployed databases do not reliably match the repository's migration history. Apply the committed installer explicitly:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/manual/apply-xendit-schema.sql
```

The installer is transactional, checks the existing core schema before making changes, and can be rerun after a successful installation. If a preflight check fails, stop and reconcile the reported production drift; do not edit `supabase_migrations.schema_migrations` or bypass the assertion without reviewing the affected data.

Future local, staging, and production environments must run this script explicitly. Neither `supabase db push` nor `supabase db reset` applies it automatically.
