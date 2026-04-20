# Pending migrations — apply these in Supabase SQL editor

These migrations fix known issues with the extension + settlement flow.
They are idempotent (`CREATE OR REPLACE`) — safe to re-run.

Apply **in order**:

## 091 — `091_fix_extend_balance_due_on_paid.sql`

**What it does:** Stops `confirm_extend_order_atomic` from double-incrementing
`orders.balance_due` when the extension is paid at the same time (the matching
payment row already covers the charge, so incrementing balance_due overstates it).

**Symptoms if not applied:**
- Paid-now extensions from the backoffice leave the order's `balance_due`
  inflated by the extension amount
- Summary Tab may still render correctly because the new UI logic is resilient,
  but the raw `orders.balance_due` column will drift

## 092 — `092_settle_order_resolves_pending_extensions.sql`

**What it does:** Adds a new parameter `p_absorbed_extension_payment_ids` to
`settle_order_atomic` so that when a customer's outstanding balance includes
unpaid-extension IOUs, those IOU payment rows are flipped from
`settlement_status='pending'` to `'absorbed'` in the same transaction as the
final settlement payment. Prevents the IOUs from orphaning in Cashup's
"Pending Extensions" list and on the Payments tab.

**Symptoms if not applied:**
- After settling an order with a pending extension, Cashup keeps listing it
  as "Unpaid Extensions" indefinitely
- Payments tab continues to show the "Unpaid" badge on the extension row
- Extensions tab keeps the amber "Unpaid" chip

## 093 — `093_settle_order_card_surcharge.sql`

**What it does:** Adds a new parameter `p_card_fee_surcharge_delta` to
`settle_order_atomic` so that when staff collect the remaining balance by
card at settle time, the 5% card surcharge is recorded correctly:
- `orders.final_total` is bumped by the surcharge delta
- `orders.card_fee_surcharge` is bumped by the same delta
- The `payments` row stores the **inclusive** amount (`balance × 1.05`)

The ledger stays balanced because `final_total` and `payments` both go up by
the same amount, so `finalBalanceDue` resolves to zero.

**Symptoms if not applied:**
- Card settlements silently under-charge the customer (Lola's eats the fee)
- `orders.card_fee_surcharge` never reflects fees absorbed post-settlement
- Revenue reports show the surcharge as an operating loss

## How to apply

1. Open Supabase SQL editor
2. Paste the full contents of `091_fix_extend_balance_due_on_paid.sql`, run it
3. Paste the full contents of `092_settle_order_resolves_pending_extensions.sql`, run it
4. Paste the full contents of `093_settle_order_card_surcharge.sql`, run it
5. Verify by querying:
   ```sql
   SELECT pg_get_functiondef(oid)
   FROM pg_proc
   WHERE proname IN ('confirm_extend_order_atomic', 'settle_order_atomic');
   ```
   Confirm all show the expected body (091 has `CASE WHEN p_is_paid THEN balance_due`,
   092 has `p_absorbed_extension_payment_ids`, 093 has `p_card_fee_surcharge_delta`).

## Application-layer fallbacks

The frontend + API have been updated to cope if either migration isn't yet applied:
- Summary Tab computes balance as `max(final_total - rentalPaid, pendingExtensionsTotal)`
  so the displayed Balance Due is correct even if `final_total` is stale.
- `settleOrder` computes the pre-deposit balance from the filtered payment list
  rather than the raw `final_total`, so settlement math stays correct.

However, `orders.balance_due` and orphan IOU rows are **only** fixed by the
migrations themselves. Please apply them to get full data integrity.
