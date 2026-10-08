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

## Phase 2 staff links

Phase 2 adds links for confirmed add-on IOUs, Reserve Now active rentals, and Reserve for Later raw reservations. Staff generate and share a link explicitly. A checkout link or browser redirect does not record a payment; only the verified webhook does. Deposits remain separate.

For an environment that does not yet have Phase 2:

1. Back up staging and pause new Xendit checkouts. Confirm the base installer is present and review the live `activate_order_atomic` definition. The Phase 2 installer aborts if its rental-payment insertion differs from the reviewed shape.
2. Review and manually apply `scripts/manual/apply-xendit-phase2.sql` on staging. It is transactional and requires the base installer. Rerun it once to verify idempotency. It does not touch Supabase migration history.
3. Deploy the matching API and web build together. Test a full unpaid Reserve Now rental, a Reserve for Later payment followed by activation, and an add-on link on a previously paid order. For each, confirm no duplicate payment after webhook replay and no rental charge includes the security deposit.
4. Test cancelled/expired checkout retries, same-store permission checks, changed IOU reconciliation, and staff return-page polling. Confirm abandoned checkouts leave the booking open and unpaid.
5. Only after staging acceptance, repeat with a production backup and a pause on new checkouts. Do not enable Phase 2 paths against a database that lacks the new script.

The Phase 2 script intentionally wraps the existing completion RPC and keeps the prior implementation under `complete_xendit_session_phase1_atomic`. Do not rerun the base installer over an active Phase 2 or Phase 3 deployment without pausing checkout and reviewing the RPC definitions.

## Manual deposit settlement guard

The active-order deposit correction is a separate, forward-only manual installation at `scripts/manual/apply-deposit-settlement-guard.sql`. It is not a Supabase migration and has **not** been applied locally. It requires the existing 17-argument `settle_order_atomic` RPC. Back up staging, inspect actual deposit receipts and refund/application journal entries, and resolve any over-collected deposits before applying it. Pause staff settlement and deposit collection while installing. Apply the SQL manually on staging, inspect its final privilege report, then deploy the matching API and web build before resuming those actions. Repeat only after staging acceptance and a production backup.

The installer revokes direct service-role execution of the unchecked settlement RPC, adds a checked settlement entry point, and adds an atomic manual deposit-receipt entry point. The API intentionally has no fallback to the old RPC: if the script has not been applied, settlement and new deposit collection fail closed. A planned `orders.security_deposit` amount or `deposit_method_id` is not proof of collection.

## Phase 3 combined deposits and refunds

### Staging account bootstrap

Staging's chart of accounts was empty before Phase 3. `scripts/manual/prepare-xendit-phase3-staging-accounts.sql` is a staging-only, forward-only bootstrap; it must never be run in production or locally. It inserts four `store-lolas` accounts (rental receivable, rental income, refundable deposits held, and Xendit Clearing) plus the Xendit receiving-account route. It inserts no balances or journal entries. Xendit Clearing represents the provider balance before payout, not a bank or card-terminal account.

Before running it, inspect `public.journal_entries`, `public.stores`, and `public.xendit_payment_sessions` read-only, back up staging, pause new checkouts, and verify any live session with Xendit. The script refuses unexpected existing accounts, journal history, conflicting routing, or `creating`/`active`/`reconciliation_required` sessions. Do not bypass those checks by updating session statuses in SQL. Run the script manually, rerun it immediately, and verify the four account definitions and the `(store-lolas, xendit)` route. Only then run the Phase 3 installer below. Production needs a separately reviewed Xendit clearing account and route; do not copy staging balances or run this bootstrap there.

```sql
SELECT id, name, account_type, store_id, is_active
FROM public.chart_of_accounts
WHERE id IN ('AR-RENTAL-store-lolas', 'INCOME-RENTAL-store-lolas',
  'DEPOSITS-HELD-LOLAS', 'XENDIT-CLEARING-store-lolas')
ORDER BY id;

SELECT store_id, payment_method_id, received_into_account_id
FROM public.payment_routing_rules
WHERE store_id = 'store-lolas' AND payment_method_id = 'xendit';
```

After the Phase 3 installer runs, `SELECT * FROM public.resolve_xendit_deposit_accounts('store-lolas');` must return `XENDIT-CLEARING-store-lolas` and `DEPOSITS-HELD-LOLAS`. Missing, inactive, cross-store, or multiple designated security-deposit liabilities must fail closed. The separate prior-system `Customer Deposits Received` liability must not affect the result.

`scripts/manual/apply-xendit-phase3.sql` is the only Phase 3 schema artifact. It is not a Supabase migration and must not be run against the local database. It requires the base Xendit installer, the Phase 2 installer, and `apply-deposit-settlement-guard.sql` to have been applied first. Review the current staging schema and data, take a backup, and pause new Xendit checkouts and staff financial actions before applying it manually. The script runs in one transaction, checks required contracts, and is intended to be rerunnable. Run it a second time on staging and check its final assertions before deploying the matching API and web builds together.

Configure the Xendit refund webhook to POST to the same API endpoint used for Payment Session events: `https://<api-host>/api/public/payments/xendit/webhook`. Use the configured callback token and verify the staging business ID. A refund request or provider API response is not proof of completion; only a verified `refund.succeeded` webhook posts the refund receipt and journal entries. This confirms provider processing, not arrival of funds in the customer's bank account. A `refund.failed` event releases the reserved amount. Uncertain or mismatched outcomes stay in `reconciliation_required` for finance review; do not resubmit them blindly.

Automatic rental refunds are blocked before the provider call when the original order contains charity or transfer income. Finance must allocate such mixed-component refunds correctly rather than reversing rental income alone.

Before requesting any refund, configure an active Xendit receiving asset account. Rental refunds also require one identifiable, active original rental income account; deposit refunds require the frozen receiving asset and deposit liability accounts to remain active and store-accessible. New deposit sessions select exactly one active, store-owned security-deposit liability with a `DEPOSITS-HELD-*` ID (or the seed's `DEPOSIT-LIAB-<store-id>` ID). They do not select the prior-system `Customer Deposits Received` account merely because its name contains "deposit". The reservation RPC rejects missing or ambiguous accounting before the API calls Xendit. A documented cancellation charge reserves its deposit amount until finance applies it; later refund requests cannot consume that amount. If account configuration changes after reservation, the verified webhook retains the refund for finance reconciliation rather than posting an incorrect journal.

Phase 3 adds card-only combined rental-and-deposit links for staff reservations and deposit-only links for active orders. Existing public basket, rental-only, and extension links retain their current channel policy. It also installs `confirm_extend_order_guarded_atomic`, which rejects a stale return date and writes extension add-ons and location changes in the same transaction as the extension charge; deploy its API caller with this script, not before it. The combined charge creates distinct rental and deposit receipts sharing one provider payment ID. A deposit is a liability until it is refunded or a documented cancellation charge is explicitly applied by an Admin. Payment success is not bank payout or settlement.

On staging, verify Reserve Now and Reserve for Later combined checkouts, later activation without duplicate receipts, deposit-only checkout, duplicate completion webhooks, full and partial refunds, failed refund callbacks, cancellation with a pending refund, and Admin resolution of a documented deposit charge. Confirm the card-settlement trigger creates exactly one settlement for the rental receipt and none for the deposit receipt. Check Cash Up for one online sale and a separate deposit liability, without double-counting a deposit application as new cash. Keep Phase 3 paths disabled until the script and these end-to-end test-mode scenarios pass.

For the refund release gate, test two deposit receipts on one order and verify both the per-receipt and order-wide limits. Cancel with a partial refund and documented charge, then attempt another refund against the charged portion: it must fail before any provider request. Race a second refund request against charge resolution; only one allocation may consume the remaining liability. Rerun charge resolution and duplicate success/failure webhooks: neither may create a second payment or journal pair. Verify a failed refund releases only its own reservation. Repeat missing-routing, missing/inactive-income, and missing/inactive-deposit-account cases and confirm no Xendit refund request is sent. Compare receipt, refund, unresolved intent, applied charge, and journal totals after each case.

If installation fails, leave checkout paused and inspect the preflight error; the SQL transaction rolls back. If provider refund initiation is ambiguous, retain the reserved amount and verify the provider state in Xendit before finance acts. Do not reset the database, rewrite applied migration history, automatically retry an uncertain refund, or treat a redirect as a payment confirmation.
