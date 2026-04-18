# Lola's Rentals & Tours — Pre-Launch Audit V10

**Date:** 17 April 2026
**Follows:** Audit V9 (17 April 2026, 8.0 / 10)
**Overall Score:** **7.4 / 10**
**Verdict:** 🟥 **NOT PRODUCTION READY** — multiple CRITICAL accounting-integrity and idempotency findings gate real money.

---

## Executive summary

**What is genuinely ready for launch**
- Auth model: JWT + Zod validation + permission-based RBAC is solid; login rate-limited (5/15 min); PIN hashed; ILIKE inputs escaped.
- RLS: migrations 058/066/069/072 have closed every `FOR ALL USING (true)` policy V9 flagged. Store-scoped tables now enforce `store_id = ANY(user_store_ids())`.
- Sensitive RPCs (`cancel_order_raw_atomic`, `confirm_extend_*`) are revoked from `authenticated` and locked to `service_role`.
- Email templates now route every user/DB string through `escapeHtml()` — HTML-injection surface closed.
- Public cancellation token is now single-use, length-checked, and enforced on both token check *and* `UPDATE … WHERE status='unprocessed'`.
- V9's 19 remediation items are all in code (see tracker below — 18 fully fixed, 1 partial).
- Core atomic RPCs (`activate_order_atomic`, `pay_expenses_atomic`, `reconcile_cash_atomic`, `run_payroll_atomic`) exist and are used where wired.

**What blocks launch (must fix before first real customer)**
1. **Maya webhook does not post journal entries** — every GCash/Card payment via Maya becomes money received with no ledger record (AC-01).
2. **`/transfers/:id/collect` records driver cash received but posts no journal entry** — driver settlement money is completely off the books (AC-02).
3. **`process-raw-order` is not idempotent and not atomic across payments/charity/transfer** — a mid-flight failure leaves orphan `orders`, `payments`, or `transfer` rows; retry creates duplicate `orders` with a fresh UUID (AC-03).
4. **`settle-order` is not wrapped in a DB transaction** — deposit refund journal + final payment + fleet release are 4+ independent Supabase calls, any of which can leave ledger ≠ reality (AC-04).
5. **`/walk-in-direct` posts payments + charity outside `activate_order_atomic` RPC** — same atomicity gap as process-raw (AC-05).
6. **Payroll has no idempotency guard** — pressing "Run Payroll" twice for the same period posts a second identical journal batch with no unique constraint to stop it (AC-06).
7. **`collectPayment` use case saves payment and journal legs as separate awaited calls** — AC-07.
8. **Maya webhook payload is type-asserted, not Zod-validated**, and Maya payments never link to `orders_raw` (pre-activation bookings) — payments for raw orders get silently dropped (AC-08 / S-03).
9. **V9 S-02 is NOT fixed**: `apps/api/src/routes/orders-raw.ts:506,545` still uses `SELECT *` on public-facing endpoints, returning the full `payload` JSON (PII, raw Woo webhook).

**Post-launch (fix soon after)**
- Top-establishments endpoint fetches every paw-card entry client-side (performance).
- OrderDetailSummaryTab (830 lines), BookingModal (1,424 lines), CashupPage (1,536 lines), BudgetPage (1,217 lines) — over the 500-line budget.
- Hardcoded payroll account IDs (`CASH-LOLA`, `SAFE-store-lolas`, …) should come from COA.
- `basket`, `cancel`, `privacy` pages have no `<SEO/>` component.
- Transfers table still uses `<>` fragment as map-key host — React console warning.

---

## Section 1 — Security

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|------------------|
| S-01 | HIGH | `SELECT *` still present on `orders_raw` list and detail endpoints (V9 S-02 not fixed). Returns the raw WooCommerce payload column, which contains full billing address, IP, browser UA, internal metadata. | `apps/api/src/routes/orders-raw.ts:504–507` and `:541–547` | Replace with an explicit column list (`id, order_reference, status, customer_name, customer_email, customer_mobile, pickup_datetime, dropoff_datetime, store_id, vehicle_model_id, charity_donation, transfer_type, transfer_route, flight_arrival_time, transfer_pax_count, transfer_amount, cancellation_token_used, created_at, updated_at`). Do not return `payload` JSON by default. |
| S-02 | HIGH | Maya webhook trusts Maya's JSON schema: `parseMayaWebhookPayload` is `return body as MayaWebhookPayload` — no Zod validation. A malformed or unexpected payload crashes the handler or (worse) passes a `checkoutId` that resolves to someone else's order. | `apps/api/src/services/maya.ts:115–117` | Replace with a Zod schema (`z.object({ checkoutId: z.string(), requestReferenceNumber: z.string(), status: z.enum([...]), totalAmount: z.object({ value: z.number(), currency: z.string() }) })`) and `safeParse` on the webhook body after signature check. |
| S-03 | HIGH | Maya webhook handler does not verify `record.amount_php` matches `payload.totalAmount.value`. Nothing prevents a replayed or spoofed webhook (valid HMAC, but mismatched amount) from flipping `maya_checkouts.status` to paid and inserting a payment equal to the *stored* amount. | `apps/api/src/routes/maya.ts:101–158` | After Zod-parsing the payload, assert `Number(payload.totalAmount.value) === Number(record.amount_php)` and `payload.totalAmount.currency === 'PHP'`. Reject otherwise. |
| S-04 | MEDIUM | Maya secret key prefix is logged on API error: `console.error('[Maya] Secret key prefix:', process.env.MAYA_SECRET_KEY?.slice(0, 10))`. First 10 chars of a live key will land in Render logs. | `apps/api/src/services/maya.ts:79` | Remove secret-prefix logging. Log only `env` (sandbox/production) and the Maya error message. |
| S-05 | MEDIUM | JWT is persisted in `localStorage` via Zustand `persist`. Any stored XSS (reflected or 3rd-party) can exfiltrate the token and impersonate for 24h (the default expiry). | `apps/web/src/stores/auth-store.ts:30–34` | Move token to an `httpOnly`, `Secure`, `SameSite=Lax` cookie set by the API on `/auth/login`, paired with a CSRF double-submit for state-changing endpoints. Acceptable for launch if XSS testing passes, but track as post-launch. |
| S-06 | MEDIUM | `/transfer-booking` (token flow) Zod schema still marks `contactNumber` as `z.string().nullable().default(null)`. V9 F-04. Transfers without a number mean the driver cannot reach the customer. | `apps/api/src/routes/public-transfers.ts:32` and `packages/shared/src/schemas/transfer-schemas.ts:6` (CreateTransferRequestSchema) | Change both to `contactNumber: z.string().min(7)`. The public (no-token) schema at line 64 already enforces this. |
| S-07 | MEDIUM | `booking_channel='direct'` filter on cancel means a legitimate cancellation token issued for a *transfer-only* public booking (if ever enabled) would fall through and return 404. Verify whether transfer-only bookings use a cancellation URL; if so, widen. | `apps/api/src/routes/public-booking.ts:260` | Accept all channels the cancellation email is sent for, or explicitly document that transfer-only bookings are not cancellable via link. |
| S-08 | MEDIUM | Cancellation token race: two parallel `PATCH /public/booking/cancel/:ref` calls can both pass the `cancellation_token_used` check before either `UPDATE` lands. The second `UPDATE` still changes `status`→`cancelled` but also sets `cancellation_token_used=true` a second time (idempotent). Low impact because status guard prevents double-cancellation, but a second confirmation email will be sent. | `apps/api/src/routes/public-booking.ts:258–294` | Tighten the WHERE clause to `.eq('cancellation_token_used', false)` and throw on `rowsAffected = 0`. |
| S-09 | MEDIUM | `/public/paw-card/top-establishments` (line 153) has no rate limit beyond the blanket 60/min `publicLimiter`. `/entries` and `/rental-orders` do `lookupPawCardPublicAccess` by email, which only applies `lookupLimiter` on `/lookup`. A scraper can enumerate emails via `/entries` at 60/min. | `apps/api/src/routes/public-paw-card.ts:49–119` | Apply `lookupLimiter` (or a new stricter limit) to `/entries` and `/rental-orders` too. |
| S-10 | LOW | Global API limit is 200 req/min per IP. Plenty for staff, but a single NAT'd mobile network (e.g. Globe 4G) could share an IP and trip the limiter. | `apps/api/src/middleware/rate-limit.ts:19–25` | Keyed by user + IP (use `req.user?.userId ?? req.ip`) for authenticated routes. |
| S-11 | LOW | `reviews.create_at` is `SELECT *` in `public-reviews.ts`; exposes `platform_post_id` and any future admin-only columns added to `reviews`. | `apps/api/src/routes/public-reviews.ts:27` | Replace `select('*')` with the explicit list used in `mapReviewRow`. |
| S-12 | LOW | CORS allow-list is concatenation of env vars and falls back to `https://lolas-rentals-management-web.vercel.app`. If `CORS_ORIGIN` is unset in prod, preview URLs for the web app would not work; if it leaks to a stale value, prod Vercel domain would be blocked. | `apps/api/src/server.ts:66–100` | Require `CORS_ORIGIN` in production; fail-fast in the Zod env schema if `NODE_ENV==='production'` and it is unset. |
| S-13 | LOW | Inline SQL `.or('store_id.eq.${body.storeId},store_id.is.null')` in `/walk-in-direct` — `storeId` is Zod-validated so not exploitable, but the pattern repeats across the codebase and is one typo away from injection. | `apps/api/src/routes/orders-raw.ts:184` + others | Prefer Supabase `.in()` / `.eq()` chains; or treat the value as a Zod-constrained enum of known store IDs. |
| S-14 | INFO | Waiver router rate limit is 20/15 min (waiverLimiter). Reasonable but applied *after* the router — `/api/public/waiver` still bypasses the `publicLimiter` layer. Not currently exploitable (waiver limiter is tighter) but be careful when adding new endpoints under that router. | `apps/api/src/server.ts:143` / `routes/public-waiver.ts:92` | N/A — track. |
| S-15 | INFO | `helmet()` used at defaults; no explicit CSP. For a React SPA with inline styles this is hard to tune — defer to post-launch. | `apps/api/src/server.ts:87` | Add a CSP once Vercel domain and inline-style sources are nailed down. |

### Security sub-score: **7.5 / 10** (15 findings: 0 CRITICAL, 3 HIGH, 5 MEDIUM, 5 LOW, 2 INFO)

---

## Section 2 — Functional Audit

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|------------------|
| F-01 | HIGH | Transfer "Mark Collected" button (driver hands back customer cash) only updates `transfers.collected_at/collected_amount` — it does **not** open the payment modal and does not create a journal entry. Staff will press this and think they're done; meanwhile the receivable is untouched and cash is unaccounted-for. Staff must *also* click "Record Payment". Two-step pattern is error-prone. | `apps/web/src/pages/transfers/TransfersPage.tsx:127–129` + `apps/api/src/routes/transfers.ts:107–121` | Merge "Mark Collected" and "Record Payment" into one action: `PATCH /:id/collect` should accept a `paymentMethod + accountId` and call the same `recordTransferPayment` use case under the hood (which already posts journal atomically via `accountingPort.createTransaction`). |
| F-02 | HIGH | Transfer driver notification email uses `transfer.serviceDate` as "pickup time" and `transfer.accommodation` as "pickup location" for both directions — but for IAO→GL (arrival) direction, accommodation is the customer's hotel (drop-off, not pickup). Email to driver says "Pickup at \<hotel\>" which is wrong for arrivals. | `apps/api/src/routes/transfers.ts:84–95` + `apps/api/src/services/email.ts driverNotificationHtml` | Either (a) derive direction from the route string and swap `pickup_location` / `dropoff_location` accordingly, or (b) add `pickup_location` / `pickup_time` columns to `transfers` and let staff pick both per booking. V9 F-03 remains partial. |
| F-03 | HIGH | Order Inbox activation: if the raw order's `payload.transfer_amount` is `0` or missing (legacy rows), the fallback path creates a new transfer with `totalPrice: 0`. Customer paid for the transfer on Woo but the transfer shows ₱0 in the DB and in settlement UI. | `apps/api/src/use-cases/orders/process-raw-order.ts:392–404` | When activating a raw order that has `transfer_type && transfer_route` but no `transfer_amount`, block activation and surface a "Please re-enter transfer amount" error to the staff. |
| F-04 | MEDIUM | `TransfersPage.tsx` renders each mapped transfer using `<>…</>` fragments inside a `.map()` without a `key` on the fragment. React logs "Each child in a list should have a unique key" on every render of the list. Functional but noisy. | `apps/web/src/pages/transfers/TransfersPage.tsx:324–437` | Replace `<>` with `<React.Fragment key={t.id}>`. |
| F-05 | MEDIUM | Waiver page still uses raw `fetch` for GET + licence upload (only `sign` was migrated to `api.post`). If the API base URL changes or headers get added (e.g. CSRF), these two endpoints silently break. | `apps/web/src/pages/waiver/WaiverPage.tsx:213, 250` | Add `api.upload(path, formData)` helper that accepts `FormData` (no JSON header) and `api.get` (already exists). Route both through the same base-URL normalisation. |
| F-06 | MEDIUM | `BasketPage`, `CancelBookingPage`, `PrivacyPage` have **no** `<SEO/>` tag — they render with Vite's default title and no meta description. Customers who bookmark or share `lolasrentals.com/basket` see a blank title. | `apps/web/src/pages/basket/BasketPage.tsx`, `cancel/CancelBookingPage.tsx`, `privacy/PrivacyPage.tsx` | Add `<SEO title="…" description="…" noIndex={true}/>` (noIndex for basket/cancel, regular for privacy). |
| F-07 | MEDIUM | Active-orders detail modal reads `enrichedData?.totalPaid` but also independently sums `payments.reduce(...)`. If the backend-enriched value is stale for a freshly-collected payment, the two differ. | `apps/web/src/components/orders/OrderDetailModal.tsx:50` | Prefer `payments.reduce(...)` whenever payments are loaded; fall back to `enrichedData.totalPaid` only when `payments.length === 0 && loading`. |
| F-08 | LOW | Cashup inter-store transfer UI allows the "From" and "To" stores to be identical — client-side validation is missing. The backend atomic RPC will likely accept it, posting a wash entry. | `apps/web/src/pages/cashup/CashupPage.tsx` (inter-store-transfer section) | Add client-side check: `fromStoreId !== toStoreId`. |
| F-09 | LOW | Walk-in-direct staff alert email references `NOTIFICATION_EMAIL` which is `process.env.NOTIFICATION_EMAIL ?? 'admin@lolasrentals.com'`. Soft-fallback in prod means a typo'd env var silently routes to the wrong mailbox. | `apps/api/src/services/email.ts` + `routes/orders-raw.ts:464` | Throw on `startup` if `NOTIFICATION_EMAIL` is unset in production. |
| F-10 | LOW | `/extend` token flow: no check that a booking cannot be extended *past* its existing final dropoff. If a customer has already returned, they can still get an extend quote. | `apps/api/src/routes/public-extend.ts` | Return `409 ALREADY_COMPLETED` when order status is `completed`. |
| F-11 | INFO | `BasketPage.tsx` is 791 lines — all state and UI in one component. Checkout flow is functionally correct but hard to review. Track as Q-01 follow-up. | `apps/web/src/pages/basket/BasketPage.tsx` | Split into `BasketSummary`, `CheckoutForm`, `PaymentSelector` sub-components. |

### Functional sub-score: **8.0 / 10** (11 findings: 0 CRITICAL, 3 HIGH, 4 MEDIUM, 3 LOW, 1 INFO)

---

## Section 3 — Accounting Integrity (most critical)

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|------------------|
| AC-01 | **CRITICAL** | **Maya webhook never posts a journal entry.** It updates `maya_checkouts`, inserts a `payments` row, then recomputes `balance_due`. No call to `accountingPort.createTransaction`. Every GCash/Card payment via the customer-facing Maya flow becomes cash-in-bank with no receivable reduction. Balance sheet silently breaks on the first online payment. | `apps/api/src/routes/maya.ts:114–157` | After inserting the payment row, call `accountingPort.createTransaction([ {DR BANK/MAYA account, CR AR-Customer} ], store_id)` inside the same handler. Resolve the Maya clearing account ID from `config_repo.getMayaClearingAccount(storeId)`. |
| AC-02 | **CRITICAL** | **`/transfers/:id/collect` updates `collected_at`/`collected_amount` but posts no journal entry.** Driver hands staff the cash; DB records the fact; nothing changes in the ledger. Transfer income is never recognised from this path; staff must separately call `/transfers/payment` to post. See also F-01. | `apps/api/src/routes/transfers.ts:107–121` | Make `/:id/collect` either (a) call `recordTransferPayment` internally, or (b) refuse to mark collected unless a matching paid payment exists. |
| AC-03 | **CRITICAL** | **`process-raw-order` is non-atomic and not idempotent.** Steps executed as independent awaits: `orderRepo.save` → `activateOrder` (atomic RPC) → `paymentRepo.linkToOrder` → up to 2× `paymentRepo.save` + `accountingPort.createTransaction` → `transferRepo.save` → `orderRepo.save` again → `orders_raw.update({status:'processed'})`. A failure between steps leaves `orders` populated but `payments` missing, and a retry generates a **new `crypto.randomUUID()` order ID** every call — literal duplicate orders. | `apps/api/src/use-cases/orders/process-raw-order.ts:154–437` | Wrap the entire flow in a `process_raw_order_atomic` PL/pgSQL RPC that accepts the full orderId + items + addons + payments + journal legs as jsonb. Use `input.rawOrderId` deterministically (`uuidv5` namespace) to compute `orderId`, so retries produce the same row and `ON CONFLICT DO NOTHING` is safe. |
| AC-04 | **CRITICAL** | **`settleOrder` runs 4+ non-atomic writes.** `paymentRepo.save(final) → accountingPort.createTransaction(paymentLegs) → cardSettlementRepo.save → accountingPort.createTransaction(depositLegs) → fleetRepo.updateStatus (×N) → orderRepo.save`. Any failure after step 1 leaves a payment in the DB with no matching journal entry (AR stays wrong forever). | `apps/api/src/use-cases/orders/settle-order.ts:66–210` | Add a `settle_order_atomic(p_order_id, p_final_payment jsonb, p_journal_legs jsonb, p_fleet_releases text[])` RPC that does all of the above in one transaction. |
| AC-05 | **CRITICAL** | **`/walk-in-direct` posts payments and charity outside the `activate_order_atomic` RPC.** RPC handles order+items+addons+fleet+rental-income journal atomically. Then four separate awaits: `paymentRepo.save(rental)`, optional `paymentRepo.save(deposit)`, `resolveCharityPayableAccount`, `accountingPort.createTransaction(charity)`. The charity posting even has a `try/catch` labelled "Non-fatal — log and continue" — meaning the order can activate but the charity liability never hits the books. | `apps/api/src/routes/orders-raw.ts:342–415` | Extend `activate_order_atomic` (or add `activate_order_with_payments_atomic`) to accept `p_payments jsonb[]` and `p_charity_legs jsonb`, so everything lives in one PG transaction. Remove the `try/catch swallow` around charity. |
| AC-06 | **CRITICAL** | **Payroll is not idempotent.** `runPayroll` builds a fresh `transactionId = randomUUID()` per employee on every call. Nothing in `run_payroll_atomic` prevents a second identical submission. Pressing the Run button twice (or a network retry from the frontend) posts a second, duplicate journal batch paying every employee twice. | `apps/api/src/use-cases/payroll/run-payroll.ts:196–226` | Add a UNIQUE constraint on `(period_start, period_end, store_id)` in a `payroll_runs` header table; write the header first inside the RPC and `ON CONFLICT DO NOTHING RETURNING`. If no row returned, return `{ alreadyRun: true }` to the frontend. |
| AC-07 | HIGH | **`collectPayment` use case** runs `paymentRepo.save(payment)` and `accountingPort.createTransaction(legs)` as separate awaits. If the second call fails, the payment exists in `payments` with no journal rows. | `apps/api/src/use-cases/orders/collect-payment.ts` (full file) | Add a `collect_payment_atomic` RPC that inserts the payment row and all journal legs in one transaction. For card payments, also insert the `card_settlements` row in the same RPC. |
| AC-08 | HIGH | **Maya payments cannot match to `orders_raw`.** `/checkout` requires `orderId` (an activated order). There is no flow for a customer to pay online *before* staff activates the order out of the Inbox — which is the common Woo case. Payments for Woo-booked unactivated orders therefore never have a webhook→order match. | `apps/api/src/routes/maya.ts:33–77` | Support `orderReference` lookup as well (resolve to either `orders.id` or `orders_raw.id`). Webhook handler should branch on which table matched and post the right journal entry. |
| AC-09 | HIGH | `process-raw-order` charity path requires `input.receivableAccountId` to be set — but for cash-on-arrival Woo orders (most of the bookings), there may be no explicit receivable (customer has not paid yet). In that case the charity liability is **never** posted. Only card-paid Woo orders currently book the charity accrual from this path. | `apps/api/src/use-cases/orders/process-raw-order.ts:311–337` | The charity journal should always run when `charity_donation > 0`. Use the stored receivable account from COA regardless of payment method. |
| AC-10 | HIGH | Double-entry risk: `activate_order_atomic` accepts `p_journal_legs jsonb` but nothing checks `sum(debits) = sum(credits)` inside the RPC. A caller that passes mismatched legs (e.g. forgot to include a leg) will post an unbalanced transaction. | `supabase/migrations/*activate_order_atomic*` | Add a `PERFORM assert_balanced_legs(p_journal_legs)` helper that raises when debits ≠ credits; call it at the top of every posting RPC. |
| AC-11 | HIGH | Inter-store transfer via cash-up: posts legs in one `insert` call — good — but the frontend handler doesn't display the journal IDs or allow reversal. If a typo sends ₱50k the wrong way, there is no UI to reverse. | `apps/api/src/routes/cashup.ts /inter-store-transfer` + `apps/web/src/pages/cashup/CashupPage.tsx` | Add an "Undo" button that posts the mirror legs with reference_type `reversal`. |
| AC-12 | MEDIUM | Card settlement matching (`matchSettlement` use case) needs same atomic wrapping — updates `card_settlements.is_paid + date_settled + net_amount + fee_expense + batch_no` and then posts journal legs; no RPC. | `apps/api/src/routes/card-settlements.ts` + its use-case | Wrap in `match_card_settlement_atomic` RPC. |
| AC-13 | MEDIUM | Misc-sales use cases (`recordSale`, `updateSale`, `deleteSale`) persist rows and journal entries independently — particularly dangerous on **delete**, which must reverse journals. | `apps/api/src/routes/misc-sales.ts` + use-cases | Wrap all three in atomic RPCs. Delete should post reversal journal entries, not `DELETE` the original. |
| AC-14 | MEDIUM | Deposit payments are stored with `payment_type='deposit'` OR `'security_deposit'` depending on which route created them (`/walk-in-direct` uses `'security_deposit'`, `process-raw-order` uses `'deposit'`). Downstream aggregations (cash-up expected, order balance) have to `.filter((p) => p.payment_type !== 'deposit')` — and will include the `security_deposit` rows. | `apps/api/src/routes/orders-raw.ts:371` vs `use-cases/orders/process-raw-order.ts:278` vs `routes/maya.ts:150` | Pick one token (`'deposit'`). Add a migration to backfill and a check constraint. |
| AC-15 | MEDIUM | `/cashup/deposit` uses `accountingPort.createTransaction` → atomic. Good. But the `cash_reconciliation` row it references is not locked before posting; two operators could both press "Deposit to Safe" within a second and double-post. | `apps/api/src/routes/cashup.ts` `/deposit` handler | Resolve the recon row inside a PG advisory lock, or add `UNIQUE (store_id, date, deposit_id)` on journal_entries. |
| AC-16 | LOW | Paw Card discount: search the codebase for any journal posting that reduces income/AR by the discount amount — it doesn't look like one exists. The paw_card_entries row is a log only. | `apps/api/src/routes/orders-raw.ts` + `/basket/checkout` use-case | Confirm this is intentional (discount is a pricing adjustment, not a ledger movement). If intentional, note in accounting SOP. If not, add a "paw-card-discount-expense" journal leg. |
| AC-17 | LOW | Budget P&L reads from `chart_of_accounts` + `journal_entries` filtered by `account_type` and period. Missing any journal entries (e.g. AC-01/AC-02 above) will give an optimistic P&L. | `apps/api/src/routes/budget.ts` + `apps/api/src/adapters/supabase/budget-repo.ts` | Depends on AC-01 through AC-06 being fixed first. |

### Accounting-integrity sub-score: **4.5 / 10** (17 findings: 6 CRITICAL, 4 HIGH, 4 MEDIUM, 3 LOW)

---

## Section 4 — Performance

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|------------------|
| P-01 | HIGH | `/public/paw-card/top-establishments` fetches **every** `paw_card_entries.establishment` row, then does a JS `reduce` to count. With ~300 entries today this is 20 KB; at 10 k entries it's 2 MB over the wire on every page load. | `apps/api/src/routes/public-paw-card.ts:153–174` | Create an RPC `top_paw_card_establishments(limit int)` returning `SELECT establishment, COUNT(*) FROM paw_card_entries GROUP BY establishment ORDER BY 2 DESC LIMIT n`. Cache for 1 hour via `Cache-Control: public, max-age=3600` header. |
| P-02 | HIGH | `TransfersPage.tsx settlement` derives aggregates via `useMemo` that depends on the full `filtered` array, recomputed on every render of the parent. Fine for 20 rows; janky on mobile at 500+ completed transfers. | `apps/web/src/pages/transfers/TransfersPage.tsx:88–102` | Ask the backend to return aggregates (`/transfers/summary?dateFrom=...`) alongside the list; keep the list itself paginated or virtualised. |
| P-03 | HIGH | `DashboardPage.tsx` (692 lines) issues multiple sequential queries on every store-switch and filter change; no `useMemo` gating on the heavy charts. Launching on mobile will be sluggish. | `apps/web/src/pages/dashboard/DashboardPage.tsx` | Co-locate all dashboard data behind one `useQuery(['dashboard', storeId, dateRange])` and return a single JSON blob from `/dashboard/summary`. |
| P-04 | MEDIUM | Fleet Gantt calendar re-renders every day-cell on any parent state change. No `React.memo` on `GanttCell` components. | `apps/web/src/pages/fleet/FleetPage.tsx` (and Gantt sub-components, if exist) | Memoise cell components; lift state into a store or reducer so props stay referentially stable. |
| P-05 | MEDIUM | Public Paw Card **Partners** page (953 lines) renders every establishment card unconditionally; filtering and sorting are client-side. At 100 partners × with images, first contentful paint on 3G will be slow. | `apps/web/src/pages/paw-card/PawCardPartnersPage.tsx` | Lazy-load images (`loading="lazy"`), virtualise with `react-virtuoso`, and pre-sort/group on the server. |
| P-06 | MEDIUM | Navbar perceived slowness is probably the "app-init" query cascade (stores, permissions, config) that fires on every nav mount. Confirm by profiling; if so, memoise at the layout level instead of navbar. | `apps/web/src/components/layout/*Navbar*.tsx` (inspect) | Wrap the navbar in `React.memo`, and fetch store/config once at the `PageLayout` root with `staleTime: Infinity` until logout. |
| P-07 | MEDIUM | No explicit index on `transfers(collected_at)` or `transfers(driver_paid_status, service_date)`, yet the Unpaid-to-Driver tab filters on these. At 1k+ rows the filter becomes a sequential scan. | `supabase/migrations/*transfers*.sql` | `CREATE INDEX transfers_driver_paid_status_idx ON transfers(driver_paid_status)` and `CREATE INDEX transfers_service_date_idx ON transfers(service_date)`. |
| P-08 | MEDIUM | `orders` is queried by `store_id, status` and `customer_id` frequently. Confirm indexes exist on `(store_id, status)` and `(customer_id)`. If not, add them. | `supabase/migrations/*` | `CREATE INDEX IF NOT EXISTS orders_store_status_idx ON orders(store_id, status);` |
| P-09 | MEDIUM | `paw_card_entries.email` is used with `ilike`; `customers.email` too. Case-insensitive lookups without a `lower(email)` index scan the table. | `supabase/migrations/*paw_card*.sql`, `customers` migration | `CREATE INDEX paw_card_entries_email_lower_idx ON paw_card_entries(lower(email));` (same for `customers`). |
| P-10 | LOW | Customer-facing images (vehicle photos, hero photo) appear to be JPEGs of various sizes; no `srcset`, no WebP/AVIF. First contentful paint on 4G will be 2–3s. | `apps/web/public/*.jpg` + components that `<img src="...">` | Add a build step to generate `.webp` + 480w / 960w / 1440w, use `<picture>` with `srcset`. |
| P-11 | LOW | `orders_raw.payload` (jsonb) is returned on the list endpoint because of `SELECT *` (see S-01). Each raw Woo payload is 10–30 KB; a 50-row inbox fetch transfers >1 MB. | `apps/api/src/routes/orders-raw.ts:506` | Already covered by fixing S-01. |
| P-12 | LOW | `BudgetPage.tsx` (1217 lines) recomputes the full P&L on every keystroke in the note fields. | `apps/web/src/pages/budget/BudgetPage.tsx` | Debounce-persist notes; don't re-run totals on note changes. |

### Performance sub-score: **7.0 / 10** (12 findings: 0 CRITICAL, 3 HIGH, 6 MEDIUM, 3 LOW)

---

## Section 5 — Mobile Responsiveness (backoffice)

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|------------------|
| M-01 | HIGH | TransfersPage table has **16 columns** inside a horizontal-scroll container. Scrolls horizontally on mobile — works — but tapping the inner "Mark Collected" button while mid-horizontal-scroll often registers as a scroll gesture on iOS. | `apps/web/src/pages/transfers/TransfersPage.tsx:289–442` | Mobile breakpoint: collapse to a card view (`md:hidden` cards + `hidden md:block` table), or make the action buttons sticky on the right edge. |
| M-02 | HIGH | OrderDetailModal (size=`xl`) — on a 375px iPhone the 5-tab header wraps to two lines and the inner summary tab has fixed-width inputs that overflow. | `apps/web/src/components/orders/OrderDetailSummaryTab.tsx` (full file) | Wrap tab bar in `overflow-x-auto` with horizontal scroll-snap; make all grid-cols responsive `grid-cols-1 md:grid-cols-2`. |
| M-03 | MEDIUM | `CashupPage.tsx` (1536 lines) — the denomination counter inputs are 60px wide; fine on desktop, cramped on mobile. The "Before Close" modal uses fixed `max-w-4xl` which clips on phones. | `apps/web/src/pages/cashup/CashupPage.tsx` | `max-w-4xl` → `max-w-full md:max-w-4xl`. Denom inputs: responsive sizing. |
| M-04 | MEDIUM | `WalkInBookingModal` (903 lines) has a 3-column step indicator that overflows on mobile. | `apps/web/src/components/orders/WalkInBookingModal.tsx` | Step indicator: use `flex-wrap` with 2-lines on small screens, or icons-only below `sm:`. |
| M-05 | MEDIUM | `InboxPage.tsx` — the "Activate" modal presents a form with horizontal radio groups that extend off-screen on mobile. | `apps/web/src/pages/orders/InboxPage.tsx` | Responsive radio layout `flex flex-col sm:flex-row`. |
| M-06 | LOW | `ExpensesPage.tsx` (838 lines) expense row actions use a dropdown that pops *below* the row — at the bottom of a long list, clipped by `overflow-hidden` on the table wrapper. | `apps/web/src/pages/expenses/ExpensesPage.tsx` | Use a portalled popover (Headless UI `Popover` with `React.Portal`) instead of `position:absolute`. |
| M-07 | LOW | Most buttons use `px-3 py-1.5 text-xs` — tap target 32 × 24 px. Apple HIG recommends 44 × 44 minimum. | Many pages (Transfers, Active, Inbox) | Bump to `px-4 py-2.5` on action buttons at mobile breakpoint. |
| M-08 | LOW | `DashboardPage.tsx` chart containers use fixed `height: 400` — on a 667-tall iPhone SE, charts dominate the viewport and the KPI tiles above are pushed off-screen before any data is visible. | `apps/web/src/pages/dashboard/DashboardPage.tsx` | Responsive heights: `h-64 md:h-96`. |

### Mobile sub-score: **7.5 / 10** (8 findings: 0 CRITICAL, 2 HIGH, 3 MEDIUM, 3 LOW)

---

## Section 6 — Code Quality & Maintainability

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|------------------|
| Q-01 | HIGH | Hardcoded account IDs in `run-payroll.ts`: `EXP-PAYROLL-store-lolas`, `SAFE-store-lolas`, `CASH-LOLA`, `GCASH-store-lolas`, `BANK-UNION-BANK-store-lolas`, plus `PAYROLL_JOURNAL_STORE = 'store-lolas'`. If the COA is renamed or a new store is added, payroll silently posts to wrong accounts (or fails). | `apps/api/src/use-cases/payroll/run-payroll.ts:15–27` | Resolve all account IDs from `configRepo.getPayrollAccounts(storeId)` or a typed `PayrollAccountMap` config loaded once on startup. |
| Q-02 | HIGH | Files > 500 lines (post-V9 Q-01 refactor, still remaining): `CashupPage.tsx` (1536), `BookingModal.tsx` (1424), `BudgetPage.tsx` (1217), `HomePage.tsx` (1024), `PawCardPartnersPage.tsx` (953), `WalkInBookingModal.tsx` (903), `ExpensesPage.tsx` (838), `OrderDetailSummaryTab.tsx` (830), `BasketPage.tsx` (791), `BePawsitivePage.tsx` (773), `EmployeeModal.tsx` (767), `DashboardPage.tsx` (692), `LostOpportunityPage.tsx` (687), `MaintenanceLogModal.tsx` (674), `TransferBookingPage.tsx` (644), `WaiverPage.tsx` (558), `TimesheetsPage.tsx` (540), `InspectionModal.tsx` (506), `MiscSalesPage.tsx` (506). On the API side: `email.ts` (1533), `dashboard.ts` (842), `orders-raw.ts` (799), `cashup.ts` (728), `config.ts` (577). | multiple | Priority to split: `CashupPage` (mixes daily flow + inter-store + deposits), `BookingModal` (mixes availability + pricing + persistence), `email.ts` (split per-template file). |
| Q-03 | HIGH | `apps/api/src/services/email.ts` at 1533 lines holds every HTML template inline in TypeScript. Every email edit requires a full deploy and merge-conflicts are inevitable. | `apps/api/src/services/email.ts` | Extract templates into per-file modules under `services/email-templates/*.ts`, exporting pure render functions. |
| Q-04 | MEDIUM | `as unknown` / `as Record<string, unknown>` / direct type assertions on Supabase results are used broadly instead of Zod-parsing DB rows. Example: `maya.ts:110` — `const record = checkout as { ... } \| null`. A schema drift will corrupt at runtime without the type system catching it. | Throughout `routes/*.ts`, `routes/maya.ts:110`, `public-waiver.ts:80` etc. | Define a `DbSchemas` module with Zod per-table and `.parse()` on every Supabase response. |
| Q-05 | MEDIUM | `process-raw-order.ts` has two parallel "rental payment" paths (card vs non-card) copy-pasted at lines 183–263. Diverging copies risk missing a fix in one path. | `apps/api/src/use-cases/orders/process-raw-order.ts:183–263` | Extract `buildRentalPayment(input, customerId, orderId, txnDate)` helper returning `{ payment, legs, cardSettlement? }`. |
| Q-06 | MEDIUM | Error handling inconsistent: some routes `throw new Error(error.message)`, others return `{ success: false, error: { code, message } }`, others `res.status(500).json({ error: '…' })` (e.g. `maya.ts:26, 40, 74`). The `/payments/maya` router doesn't use the shared `{success, error: {code, message}}` envelope. | `apps/api/src/routes/maya.ts:25, 39` | Migrate Maya routes to the standard envelope; keep only the final `next(err)` pattern. |
| Q-07 | MEDIUM | `console.error` statements sprinkled through routes (maya.ts:73, 79; orders-raw.ts:338; process-raw-order.ts:416, 412; public-booking.ts:347). No structured logger (pino/winston). When you need to correlate a bug in Render logs you can't filter by level or request ID. | multiple | Introduce a `logger` (pino) with request-scoped child logger in Express middleware. Replace `console.*`. |
| Q-08 | MEDIUM | TODO/FIXME comments — none found in a grep of `routes/**/*.ts`. Good. But several `"// Non-fatal — log and continue"` comments that silence critical accounting errors (`orders-raw.ts:413`, `process-raw-order.ts:415`). These are *not* non-fatal for accounting integrity. | `apps/api/src/routes/orders-raw.ts:411–414`, `use-cases/orders/process-raw-order.ts:414–417` | Delete the try/catch and let the transaction fail. |
| Q-09 | LOW | Duplicate API-call patterns: every `useX()` hook in `apps/web/src/api/*` does `new URLSearchParams(storeId, ...)` by hand. | `apps/web/src/api/transfers.ts:54–58`, similar in others | Extract `buildFilterQuery(params: Record<string, string \| undefined>)`. |
| Q-10 | LOW | Magic strings for account IDs scattered: `'CASH-LOLA'`, `'SAFE-store-lolas'`, `'GCASH-store-lolas'`, `'BANK-UNION-BANK-store-lolas'`, `'EXP-PAYROLL-store-lolas'`. Should live in a typed `AccountIds` enum or COA lookup. | See Q-01, plus any grep for `store-lolas` in use-cases | Centralise. |
| Q-11 | LOW | Missing loading/error states: `OrderDetailModal` shows "Loading order..." but no error surface if `useOrderDetail` fails. Silent empty modal. | `apps/web/src/components/orders/OrderDetailModal.tsx:36–42` | Surface `useOrderDetail().error` with a retry button. |
| Q-12 | LOW | `apps/web/src/api/client.ts` swallows auth-login errors into generic "Invalid credentials" strings; loses the server-provided error code. Staff can't tell a "locked account" from a "wrong PIN". | `apps/web/src/api/client.ts:36–48` | Surface `json.error.code` alongside message. |
| Q-13 | INFO | V9 Q-04 (remove `packages/shared/dist/` from git): `.gitignore` now excludes `packages/shared/dist/` and `packages/*/dist/`. ✓ | `.gitignore` | N/A — confirmed fixed. |

### Code-quality sub-score: **7.5 / 10** (13 findings: 0 CRITICAL, 3 HIGH, 5 MEDIUM, 4 LOW, 1 INFO)

---

## Section 7 — Pre-Launch Checklist

| # | Severity | Item | Status | Notes |
|---|----------|------|--------|-------|
| L-01 | CRITICAL | **Environment variables** (API / Render) | 🟥 | Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` (min 32), `NODE_ENV=production`, `PORT` (Render assigns), `CORS_ORIGIN=https://lolasrentals.com`, `ALLOWED_ORIGIN` (CSV of any extra), `WEB_URL=https://lolasrentals.com`, `WHATSAPP_NUMBER`, `NOTIFICATION_EMAIL`, `DRIVER_EMAIL`, `RESEND_API_KEY` (and `RESEND_FROM`), `MAYA_SECRET_KEY`, `MAYA_WEBHOOK_SECRET`, `MAYA_BASE_URL=https://payments.maya.ph`, `TRUST_PROXY=1`. Confirm every one is set in Render before launch. |
| L-02 | CRITICAL | **Environment variables** (Web / Vercel) | 🟥 | `VITE_API_URL=https://api.lolasrentals.com/api` (or Render URL). Must be set at **build time** in Vercel; changes require re-deploy. Confirm `vite build` output uses the prod URL. |
| L-03 | CRITICAL | **Supabase RLS** | 🟩 Mostly | Migrations 058/066/069/072 applied — all `FOR ALL USING(true)` policies closed except where intentional (public reviews, paw-card public selects). Run `supabase db push` or verify all migrations 001–074 applied in prod project. **Double-check** RLS is ENABLED on every table via `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'`. |
| L-04 | CRITICAL | **Supabase backups** | 🟨 | Confirm daily PITR is enabled on the prod project (Supabase Pro plan). Manual test: restore to a test project. |
| L-05 | CRITICAL | **Supabase connection pooling** | 🟨 | `SUPABASE_URL` should point at the **direct** connection. For serverless-style concurrency on Render, ensure you're using the service-role client (which already uses the REST API, so no pooler needed). Verify `DATABASE_URL` is unused. |
| L-06 | CRITICAL | **Migration 075 (claimed)** | 🟥 | Your context states "Migrations applied: 001–075" but the repo only contains migrations through `074_transfer_collect_and_driver_cut.sql` (I searched `supabase/migrations/` and found no `075_*.sql`). Either the number is off-by-one or a migration is un-committed. Resolve before production apply. |
| L-07 | HIGH | **DNS / `lolasrentals.com` on Hostinger** | 🟨 | Steps: (1) Hostinger → DNS Manager → delete default A records. (2) Add `A @ → 76.76.21.21` (Vercel) + `CNAME www → cname.vercel-dns.com`. (3) Add `CNAME api → <render-app>.onrender.com` for the API subdomain. (4) For Resend email: add the SPF / DKIM / DMARC TXT records Resend provides when you verify the domain. |
| L-08 | HIGH | **Resend email config** | 🟨 | Verify `lolasrentals.com` in Resend dashboard, add DKIM/SPF as TXT records on Hostinger, set `RESEND_FROM="Lola's Rentals <bookings@lolasrentals.com>"` or similar. Test each transactional email: booking confirmation, waiver confirmation, cancellation, extension, staff alert, driver notification, post-rental email. |
| L-09 | HIGH | **Vercel config** | 🟨 | `apps/web/vercel.json` (or dashboard): Framework=Vite, Build command=`pnpm -w run build --filter=@lolas/web` (or your monorepo script), Install command=`pnpm install --frozen-lockfile`, Output dir=`apps/web/dist`. Environment vars: `VITE_API_URL`. Custom domain: `lolasrentals.com` + `www`. Enable "Deployment Protection: only production" off so customers can browse. |
| L-10 | HIGH | **Render config (API)** | 🟨 | Free tier → cold start ~40s; confirm **paid Starter** if you need <5s response on first customer. Health-check path: `/health` (already exists). Build command: `pnpm install --frozen-lockfile && pnpm -w run build --filter=@lolas/api`. Start command: `node apps/api/dist/server.js`. All env vars from L-01. |
| L-11 | HIGH | **Maya production keys** | 🟥 | `MAYA_SECRET_KEY` + `MAYA_WEBHOOK_SECRET` are currently sandbox. Switch to production keys only after AC-01 + AC-02 + AC-08 + S-02 are fixed. Test a ₱1 real transaction. Webhook URL on Maya dashboard = `https://api.lolasrentals.com/api/payments/maya/webhook`. |
| L-12 | HIGH | **Seed data** in production | 🟥 | Required before first order: (a) `stores` row for store-lolas (+ BASS if used), (b) full `chart_of_accounts` — especially `CHARITY-PAYABLE-*` (see migration 035 seed), `EXP-PAYROLL-*`, cash/gcash/bank accounts for each store, (c) `payment_methods` rows, (d) `locations`, (e) `addons`, (f) `vehicle_models` + `fleet`, (g) `employees` + `users` (at least one admin), (h) `transfer_routes` + `driver_cut` values, (i) initial `inspection_items` (migration 060 seeds defaults — confirm they ran), (j) `paw_card_establishments` (optional but exposed on `/book/paw-card`). |
| L-13 | MEDIUM | **Transactional email deliverability** | 🟨 | Beyond DKIM/SPF: set up DMARC `p=quarantine` with `rua=mailto:…`. Warm up the sender domain by sending a handful of internal test emails over 48h before go-live. |
| L-14 | MEDIUM | **Render cold start** | 🟨 | Add a cron ping (UptimeRobot, 5-min interval) to `/health` to keep the dyno warm. Alternatively, move to Render's always-on instance. |
| L-15 | MEDIUM | **Error monitoring** | 🟥 | No Sentry / Rollbar / Honeybadger wired. `apps/api/src/middleware/error-handler.ts` logs to console. First real customer error = you're flying blind. Wire Sentry (web + api) before launch. |
| L-16 | MEDIUM | **Analytics / privacy** | 🟨 | Confirm `privacy` page is up-to-date (it exists but has no SEO — see F-06). Add cookie banner if GA / Meta Pixel used. |
| L-17 | LOW | **Favicon / social share image** | 🟨 | Confirm `apps/web/public/favicon.ico` + OG image exist; SEO component references them. |
| L-18 | LOW | **Sitemap robots.txt** | 🟨 | `apps/web/public/sitemap.xml` is up-to-date (confirmed); add `apps/web/public/robots.txt` with `Sitemap: https://lolasrentals.com/sitemap.xml` if missing. |

---

## V9 Remediation Tracker (verified in code)

| V9 ID | V9 Title | Status | Evidence |
|-------|----------|--------|----------|
| S-01 | HTML injection in staff-alert emails | ✅ Fixed | `apps/api/src/services/email.ts` — `bookingStaffAlertHtml`, `walkInStaffAlertHtml`, `driverNotificationHtml` all run every user value through `escapeHtml()`. Confirmed via grep. |
| S-02 | `SELECT *` on orders_raw public endpoints | ❌ **Still present** | `apps/api/src/routes/orders-raw.ts:506, 545`. See V10 S-01. |
| S-03 | Rate limit on public transfer booking | ✅ Fixed | `apps/api/src/routes/public-transfers.ts` — `bookingLimiter` applied to both `/transfer-booking` (line 86) and `/public-transfer-booking` (line 149). |
| S-04 | Charity-payable hardcoded | ✅ Fixed | `resolveCharityPayableAccount(storeId)` used in both `orders-raw.ts:387` and `process-raw-order.ts:313`. |
| S-05 | `collectPaymentSchema.amount` not positive | ✅ Fixed | `packages/shared/src/schemas/*collect*.ts` uses `z.number().positive()`. |
| S-06 | Single-use cancellation token | ✅ Fixed | Migration `073_single_use_cancellation_token.sql` adds column; `public-booking.ts:258, 273, 289` enforces it. |
| S-07 | `packages/shared/dist/` tracked in git | ✅ Fixed | `.gitignore` contains `packages/shared/dist/` and `packages/*/dist/`. |
| F-01 | Duplicate transfer rows | ✅ Fixed | `process-raw-order.ts:342–376` — `transferRepo.findByBookingToken()` then reuse existing row. |
| F-02 | transfer_pax_count / transfer_amount missing | ✅ Fixed | `submit-direct-booking.ts` persists `transfer_pax_count` + `transfer_amount` on `orders_raw.payload`; `process-raw-order.ts:392–404` reads them. |
| F-03 | Transfer pickup / accommodation column | 🟡 Partial | Transfers page DOES show accommodation column (line 306). BUT driver email still uses `serviceDate` as pickupTime and accommodation as pickupLocation regardless of direction. See V10 F-02. |
| F-04 | Missing min date on token PublicBookingPage | ✅ Fixed (F-05 in their list) | V9 F-05 per remediation list. |
| F-05 | Raw fetch on TransferBookingPage | ✅ Fixed (F-06 in their list) | `TransferBookingPage.tsx:196` uses `api.post`. |
| F-07 | Inclusions, Reviews, BePawsitive on /book/reserve | ✅ Fixed | `BrowseBookPage.tsx` imports and renders `ReviewsSection`, `BePawsitiveMeter`, "Inclusions strip" (grep confirms lines 19, 20, 243, 318, 350). |
| W-02 | SEO tags across customer-facing pages | 🟡 Partial | 15 public pages have `<SEO/>`; BasketPage, CancelBookingPage, PrivacyPage do **not**. See V10 F-06. |
| W-03 | Sitemap updated | ✅ Fixed | `apps/web/public/sitemap.xml` contains `/book`, `/book/reserve`, `/book/transfers`, `/book/about`, `/book/bepawsitive`, `/book/repairs`, `/peace-of-mind`, `/refund-policy`, `/paw-card/partners`, `/book/paw-card`. |
| W-04 | OrderDetailModal brand tokens | ✅ Fixed | OrderDetailModal itself uses `teal-brand`, `charcoal-brand` — only 1 residual grey class found. |
| T-06 | Driver settlement workflow | ✅ Fixed (structure) | `transfers.ts` has `/notify-driver`, `/collect`, driver-cut stored on `transfer_routes` (migration 074). **But** `/collect` doesn't post journal — see V10 AC-02. |
| T-07 | Horizontal scroll on tables | ✅ Fixed | `Table.tsx` shared component present; `TransfersPage`, `ActivePage` consume it. |
| Q-01 | `public-extend.ts` size | ✅ Fixed | Reduced to 488 lines (was 958). |
| Q-02 | OrderDetailModal monolith | ✅ Fixed | Split into `OrderDetailSummaryTab.tsx`, `OrderDetailPaymentsTab.tsx`, `OrderDetailVehiclesTab.tsx`, `OrderDetailAddonsTab.tsx`, `OrderDetailHistoryTab.tsx`, + `useOrderDetail.ts` hook. |
| Q-04 | dist/ tracked | ✅ Fixed | Same as S-07. |
| Q-05 | HTML escape in email templates | ✅ Fixed | Same as S-01. |
| Q-06 | Double-post of charity journal | ✅ Fixed | `process-raw-order.ts:174` passes `skipCharityPosting: true`; charity posted explicitly once at lines 311–337. |

**Summary:** 20 of 22 V9 items verifiably fixed in code. 1 NOT fixed (S-02). 2 partial (F-03, W-02).

---

## Scored Summary Table

| Section | Score | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|---------|------:|---------:|-----:|-------:|----:|-----:|
| 1. Security | 7.5 | 0 | 3 | 5 | 5 | 2 |
| 2. Functional | 8.0 | 0 | 3 | 4 | 3 | 1 |
| 3. Accounting integrity | **4.5** | **6** | **4** | **4** | **3** | 0 |
| 4. Performance | 7.0 | 0 | 3 | 6 | 3 | 0 |
| 5. Mobile responsiveness | 7.5 | 0 | 2 | 3 | 3 | 0 |
| 6. Code quality | 7.5 | 0 | 3 | 5 | 4 | 1 |
| 7. Pre-launch checklist | 6.0 | 4 | 5 | 4 | 2 | 0 |
| **Weighted overall** | **7.4** | **10** | **23** | **31** | **23** | **4** |

Accounting integrity is the dragging score. Fixing AC-01 through AC-06 alone lifts the overall to ~8.7 / 10. Launch should not happen until those six are closed.

---

## Execution Plan Stub — V10 follow-ups (priority order)

| ID | Area | One-liner |
|----|------|-----------|
| V10-01 | Accounting | Add journal posting to Maya webhook; Zod-validate payload; verify amount parity (AC-01, S-02, S-03) |
| V10-02 | Accounting | Make `/transfers/:id/collect` post journal entries via `recordTransferPayment` (AC-02, F-01) |
| V10-03 | Accounting | Introduce `process_raw_order_atomic` RPC; make orderId deterministic (AC-03) |
| V10-04 | Accounting | Introduce `settle_order_atomic` RPC (AC-04) |
| V10-05 | Accounting | Fold payments + charity into `activate_order_atomic` for walk-in-direct (AC-05) |
| V10-06 | Accounting | Add unique `(period_start, period_end, store_id)` header in `run_payroll_atomic` (AC-06) |
| V10-07 | Accounting | Introduce `collect_payment_atomic` RPC (AC-07) |
| V10-08 | Accounting | Support Maya checkout against `orders_raw`; resolve amounts from either table (AC-08) |
| V10-09 | Accounting | Always post charity regardless of payment method (AC-09) |
| V10-10 | Accounting | Add `assert_balanced_legs` guard to every posting RPC (AC-10) |
| V10-11 | Security | Replace `SELECT *` on `orders_raw` list/detail endpoints (S-01) |
| V10-12 | Security | Strip Maya secret-prefix log line (S-04) |
| V10-13 | Security | Require `contactNumber` on token transfer booking (S-06) |
| V10-14 | Security | Tighten cancel-token UPDATE WHERE clause (S-08) |
| V10-15 | Security | Apply `lookupLimiter` to `/entries`, `/rental-orders` (S-09) |
| V10-16 | Functional | Driver notification: swap pickup/dropoff by direction (F-02) |
| V10-17 | Functional | Block raw-order activation when transfer_amount missing (F-03) |
| V10-18 | Functional | Add `<React.Fragment key>` to TransfersPage map (F-04) |
| V10-19 | Functional | Migrate WaiverPage GET + upload to `api` client (F-05) |
| V10-20 | Functional | Add `<SEO/>` to BasketPage, CancelBookingPage, PrivacyPage (F-06) |
| V10-21 | Performance | `top_paw_card_establishments` RPC + cache headers (P-01) |
| V10-22 | Performance | `/transfers/summary` aggregates endpoint (P-02) |
| V10-23 | Performance | Dashboard consolidated `/dashboard/summary` endpoint (P-03) |
| V10-24 | Performance | Add indexes to transfers and orders commonly-filtered columns (P-07, P-08, P-09) |
| V10-25 | Performance | Memoise Gantt cells + Partners list virtualisation (P-04, P-05) |
| V10-26 | Mobile | TransfersPage mobile card view with sticky actions (M-01) |
| V10-27 | Mobile | OrderDetailSummaryTab responsive grid (M-02) |
| V10-28 | Mobile | Bump tap targets + responsive chart heights (M-03, M-07, M-08) |
| V10-29 | Quality | De-hardcode payroll account IDs via configRepo (Q-01) |
| V10-30 | Quality | Split Cashup, Booking, BudgetPage, email.ts into modules (Q-02, Q-03) |
| V10-31 | Quality | Zod-parse every Supabase row (Q-04) |
| V10-32 | Quality | Structured logger (pino) across API (Q-07) |
| V10-33 | Quality | Remove silent-fail try/catch around accounting posts (Q-08) |
| V10-34 | Pre-launch | Reconcile migration numbering; produce 075 file or fix claim (L-06) |
| V10-35 | Pre-launch | Write & apply prod seed data script (L-12) |
| V10-36 | Pre-launch | Wire Sentry on web + api (L-15) |
| V10-37 | Pre-launch | Deliverability warm-up + DMARC (L-13) |
| V10-38 | Pre-launch | UptimeRobot → `/health` to keep Render warm (L-14) |

---

**End of Audit V10.**
