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

## Phase 2 staff links (not yet deployed)

Phase 2 adds links for confirmed add-on IOUs, Reserve Now active rentals, and Reserve for Later raw reservations. Staff generate and share a link explicitly. A checkout link or browser redirect does not record a payment; only the verified webhook does. Deposits remain separate.

Do not apply Phase 2 SQL while Phase 1 staging QA is in progress. After QA acceptance:

1. Back up staging and pause new Xendit checkouts. Confirm the base installer is present and review the live `activate_order_atomic` definition. The Phase 2 installer aborts if its rental-payment insertion differs from the reviewed shape.
2. Review and manually apply `scripts/manual/apply-xendit-phase2.sql` on staging. It is transactional and requires the base installer. Rerun it once to verify idempotency. It does not touch Supabase migration history.
3. Deploy the matching API and web build together. Test a full unpaid Reserve Now rental, a Reserve for Later payment followed by activation, and an add-on link on a previously paid order. For each, confirm no duplicate payment after webhook replay and no rental charge includes the security deposit.
4. Test cancelled/expired checkout retries, same-store permission checks, changed IOU reconciliation, and staff return-page polling. Confirm abandoned checkouts leave the booking open and unpaid.
5. Only after staging acceptance, repeat with a production backup and a pause on new checkouts. Do not enable Phase 2 paths against a database that lacks the new script.

The Phase 2 script intentionally wraps the existing completion RPC and keeps the prior implementation under `complete_xendit_session_phase1_atomic`. If the base installer is rerun after Phase 2, rerun the Phase 2 script before enabling checkout so the wrapper remains the public RPC contract.

## Manual deposit settlement guard

The active-order deposit correction is a separate, forward-only manual installation at `scripts/manual/apply-deposit-settlement-guard.sql`. It is not a Supabase migration and has **not** been applied locally. It requires the existing 17-argument `settle_order_atomic` RPC. Back up staging, inspect actual deposit receipts and refund/application journal entries, and resolve any over-collected deposits before applying it. Pause staff settlement and deposit collection while installing. Apply the SQL manually on staging, inspect its final privilege report, then deploy the matching API and web build before resuming those actions. Repeat only after staging acceptance and a production backup.

The installer revokes direct service-role execution of the unchecked settlement RPC, adds a checked settlement entry point, and adds an atomic manual deposit-receipt entry point. The API intentionally has no fallback to the old RPC: if the script has not been applied, settlement and new deposit collection fail closed. A planned `orders.security_deposit` amount or `deposit_method_id` is not proof of collection. Card/Xendit deposits and provider refunds remain outside this manual workflow.
