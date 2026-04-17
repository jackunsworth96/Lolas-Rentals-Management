# Lola's Rentals & Tours — Pre-Deployment Audit Report V7

| Field | Value |
|-------|-------|
| **Audit date** | 12 April 2026 |
| **Platform version** | `14f8c8b0624d0a4d869cc0f63b69a4c91e40c190` |
| **Overall readiness score** | **5.5 / 10** |

## Executive Summary

Lola's Rentals is a feature-rich rental management platform with a clean monorepo architecture, strong domain modelling in `packages/domain`, and generally solid frontend UX for the core booking flow. However, the platform has **critical security gaps** that must be resolved before handling real money and customer data: unauthenticated cancel endpoints, overly permissive Supabase RLS policies on financial tables (budget, waivers, orders_raw), SECURITY DEFINER RPCs without internal authorisation checks, and several money-moving operations that lack transactional atomicity. The customer website has inconsistent branding (multiple pages use non-brand blue/gray palettes), no SEO meta tags beyond page titles, placeholder content on the BePawsitive page, and a broken confirmation page refresh flow. The staff extend flow UI collects override fields the server silently discards. These issues are fixable within a focused 2–3 week sprint, after which the platform would be ready for controlled launch.

---

## Table of Contents

1. [Security Audit](#section-1--security-audit)
2. [Functional Gaps & Bug Audit](#section-2--functional-gaps--bug-audit)
3. [Performance Audit](#section-3--performance-audit)
4. [Customer Website Audit](#section-4--customer-website-audit)
5. [Code Quality & Tech Debt](#section-5--code-quality--tech-debt)
6. [Strategic Recommendations](#section-6--10-strategic-recommendations)
7. [Pre-Deployment Checklist](#section-7--pre-deployment-checklist)

---

## Section 1 — Security Audit

### 1.1 Authentication & Authorisation

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-1 | **CRITICAL** | **Unauthenticated order cancellation.** `PATCH /api/public/booking/cancel/:orderReference` cancels any `direct` + `unprocessed` order and fires a cancellation email with no authentication. Anyone who guesses or enumerates an order reference can cancel bookings and spam emails. | `apps/api/src/routes/public-booking.ts` L229–300 | Require a cancellation token (emailed to customer) or email verification before allowing cancel. Rate-limit this endpoint separately. |
| S-2 | **CRITICAL** | **SECURITY DEFINER RPCs without internal authorisation.** `cancel_order_raw_atomic`, `confirm_extend_raw_atomic`, `confirm_extend_order_atomic` run as the function owner (bypassing RLS). Migration `058` only revokes EXECUTE from `anon` — any `authenticated` user can call these and modify any order. No `auth.uid()` or permission check inside the function body. | `supabase/migrations/055_atomic_extend_cancel.sql` L18, 87, 176; `058_rls_missing_tables.sql` L60–62 | Add `IF NOT has_permission('can_edit_orders') THEN RAISE ...` inside each function. Set `search_path = public` on all SECURITY DEFINER functions. Revoke EXECUTE from `authenticated` and grant only to `service_role`. |
| S-3 | **CRITICAL** | **Budget tables fully open.** `budget_periods` and `budget_lines` have `FOR ALL USING (true)` RLS policies — any role (including anonymous via Supabase client) can read, insert, update, and delete financial budget data. | `supabase/migrations/054_budget.sql` L82–88 | Replace with store-scoped `USING (store_id = ANY(user_store_ids()))` and require `can_view_accounts` / `can_edit_settings` permissions. |
| S-4 | **CRITICAL** | **Waivers globally readable.** `waivers` table has `SELECT USING (true)` — any authenticated or anonymous user can enumerate and read all waiver records including PII (names, licence images, signatures). | `supabase/migrations/059_waivers.sql` L66–68 | Restrict SELECT to `user_store_ids()` for staff, or use a service-role-only approach for public waiver submission/retrieval. |
| S-5 | **HIGH** | **orders_raw world-insertable and world-readable.** `INSERT WITH CHECK (true)` and `SELECT USING (true)` allow any Supabase key holder to insert fake orders or read all raw order data. | `supabase/migrations/011_orders_raw.sql` L19–23 | Restrict INSERT to service_role (edge function already uses it). Restrict SELECT to `user_store_ids()` + permission. |
| S-6 | **HIGH** | **Maya checkout — no IDOR or amount validation.** `POST /api/payments/maya/checkout` accepts `orderId` and `amountPHP` from the request body with no Zod validation and no check that the authenticated user is authorised for that order or that the amount matches the order balance. | `apps/api/src/routes/maya.ts` L13–76 | Add Zod schema validation. Verify `orderId` belongs to the user's store. Validate `amountPHP` against the computed order balance. |
| S-7 | **HIGH** | **Directory accessible to all authenticated users.** `GET /api/directory` requires only `authenticate` with no `requirePermission` — any logged-in staff member can search and read all contact/bank/GCash records. | `apps/api/src/routes/directory.ts` L13–34 | Add `requirePermission(Permission.EditSettings)` to the GET route, or create a dedicated `ViewDirectory` permission. |
| S-8 | **HIGH** | **No JWT refresh mechanism.** Tokens expire after 24h with no refresh flow. Users are silently logged out, and the only recovery is re-login. Long staff shifts may exceed 24h. | `apps/api/src/adapters/auth/jwt.ts` L20–21 | Implement a refresh token flow with shorter access token expiry (e.g. 1h access + 7d refresh), or implement silent re-auth. |
| S-9 | **HIGH** | **Public storage bucket allows unrestricted uploads.** `paw-card-receipts` bucket has `INSERT` for all roles — anyone can upload arbitrary files (storage spam, malware hosting). | `supabase/migrations/030_paw_card_enhancements.sql` L10–17 | Restrict INSERT to authenticated users with file size and type validation at the storage policy level. Add a lifecycle rule to auto-delete old receipts. |
| S-10 | **MEDIUM** | **Budget route uses ViewAccounts for upsert.** `POST /api/budget/lines` requires `Permission.ViewAccounts` (a read permission) for write operations. | `apps/api/src/routes/budget.ts` L49–80 | Create and require a dedicated `EditBudget` permission. |
| S-11 | **MEDIUM** | **late_return_assignments fully open.** `FOR ALL USING (true)` allows any role to CRUD assignment records. | `supabase/migrations/053_before_close_tables.sql` L13–14 | Scope to `user_store_ids()` + appropriate permission. |
| S-12 | **MEDIUM** | **inspection_results fully open.** `FOR ALL USING (true)` on `inspection_results`. | `supabase/migrations/060_inspections.sql` L85–88 | Scope to store via join with `inspections` table. |
| S-13 | **MEDIUM** | **booking_holds not store-scoped.** Any authenticated user can select/insert/delete any store's holds. | `supabase/migrations/058_rls_missing_tables.sql` L17–25 | Add `store_id = ANY(user_store_ids())` to the USING clause. |

### 1.2 Input Validation & Injection

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-14 | **HIGH** | **Maya checkout lacks Zod validation.** `orderId` and `amountPHP` are extracted from `req.body` without schema validation; only manual falsy checks. | `apps/api/src/routes/maya.ts` L25–34 | Add `validateBody(MayaCheckoutSchema)` with `orderId: z.string().uuid()` and `amountPHP: z.number().positive()`. |
| S-15 | **MEDIUM** | **HTML injection in email templates.** Customer names, damage notes, and other user-supplied strings are interpolated into HTML without encoding. If a customer registers with `<script>` in their name, it renders in email clients. | `apps/api/src/services/email.ts` (multiple templates) | HTML-encode all interpolated values using a utility like `he.encode()` or template literals with an escape helper. |
| S-16 | **MEDIUM** | **Basket email validation too weak.** Client-side validation only checks `includes('@')` for email format. | `apps/web/src/pages/basket/BasketPage.tsx` L422 | Use `z.string().email()` or a proper regex; server already validates via Zod, but client should match. |
| S-17 | **LOW** | **Route params not Zod-validated.** Multiple routes extract `req.params.id` (UUID) without validation (e.g. `orders/:id`, `fleet/:id`, `maintenance/:id`). | Various route files | Add `validateParams(z.object({ id: z.string().uuid() }))` middleware or validate inline. |

### 1.3 Data Exposure

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-18 | **HIGH** | **PII logged in production.** `email.ts` logs recipient email addresses on every send; cron jobs log customer emails, tokens, and order references. | `apps/api/src/services/email.ts` L54–55; `jobs/waiver-reminder.ts` L130, 137–140; `jobs/post-rental-email.ts` L137–142 | Replace with structured logging that redacts PII. Log only order IDs, not emails/tokens. |
| S-19 | **MEDIUM** | **paw_card_entries `select('*')` after access check.** If the access check is bypassed or weakened, the full row (including PII) is exposed. | `apps/api/src/routes/public-paw-card.ts` L65 | Select only required columns (`email`, `amount`, `created_at`, etc.). |
| S-20 | **MEDIUM** | **Maya route logs operational details.** Console.log includes `orderId`, `amountPHP`, and environment flags on every checkout attempt. | `apps/api/src/routes/maya.ts` L17–22 | Remove or gate behind `NODE_ENV !== 'production'`. |
| S-21 | **LOW** | **11 `console.log` statements in production frontend code.** Debug logging in `ActivePage.tsx`, `InspectionModal.tsx`, `OrderDetailModal.tsx`. | `apps/web/src/pages/orders/ActivePage.tsx` L55, 185, 188, 272; `apps/web/src/components/orders/InspectionModal.tsx` L56, 85–87, 95, 126; `apps/web/src/components/orders/OrderDetailModal.tsx` L401 | Remove all debug console.log from production builds. |

### 1.4 Infrastructure

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-22 | **HIGH** | **Missing environment variables in .env.example.** At least 12 env vars used in code are not documented: `RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `NOTIFICATION_EMAIL_FROM`, `WEB_URL`, `WHATSAPP_NUMBER`, `CORS_ORIGIN`, `TRUST_PROXY`, `MAYA_BASE_URL`, `MAYA_SECRET_KEY`, `MAYA_PUBLIC_KEY`, `MAYA_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`. | `apps/api/.env.example` | Add all production-required env vars to `.env.example` with clear descriptions and placeholder values. |
| S-23 | **MEDIUM** | **WhatsApp fallback number is placeholder.** `639XXXXXXXXX` used as fallback when `WHATSAPP_NUMBER` is missing — customers would receive broken WhatsApp links. | `apps/api/src/use-cases/booking/submit-direct-booking.ts` L210 + 5 other files | Make `WHATSAPP_NUMBER` required in the env schema, or fail gracefully instead of using a placeholder. |
| S-24 | **MEDIUM** | **Rate limiter `max` vs `limit` inconsistency.** Global rate limiters in `rate-limit.ts` use `limit` (express-rate-limit v8 API), but inline limiters use `max`. If `max` is ignored in v8, those limits are ineffective. | `apps/api/src/routes/paw-card.ts` L143; `public-booking.ts` L15, 200; `public-waiver.ts` L14; `public-paw-card.ts` L10; `public-transfers.ts` L10 | Verify against express-rate-limit v8 docs. Replace `max` with `limit` across all inline rate limiters. |
| S-25 | **MEDIUM** | **Cron jobs lack leader election.** If multiple API instances run (e.g. Render auto-scaling), waiver-reminder and post-rental-email jobs will fire duplicate emails. | `apps/api/src/server.ts` L164–168 | Use a DB-based lock (e.g. `pg_advisory_lock`) or a `cron_lock` table to ensure single execution. |
| S-26 | **LOW** | **No ESLint config file.** ESLint 9 is installed but no `eslint.config.js` or `.eslintrc` exists. The `lint` script likely fails or runs with defaults. | Root `package.json` | Create an `eslint.config.js` with TypeScript + React rules. |

### 1.5 Email Security

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-27 | **MEDIUM** | **Fire-and-forget emails.** All email sends are wrapped in try/catch with errors only logged. If Resend is down, no booking confirmations are sent and there is no retry mechanism. | `apps/api/src/services/email.ts` L55–58 | Add a dead-letter queue or at minimum persist failed sends to a `failed_emails` table for retry. |
| S-28 | **LOW** | **Hardcoded fallback notification email.** If `NOTIFICATION_EMAIL` env var is missing, a development email address is used. | `apps/api/src/services/email.ts` L28–29 | Make `NOTIFICATION_EMAIL` required in the env schema. |

### 1.6 File Upload Security

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-29 | **MEDIUM** | **No magic-byte validation on uploads.** Multer validates MIME type from the client header, not actual file content. A malicious file with a spoofed MIME type could be uploaded. | `apps/api/src/routes/paw-card.ts` L19–29; `public-waiver.ts` L23–33 | Add server-side magic-byte validation using a library like `file-type`. |

---

## Section 2 — Functional Gaps & Bug Audit

### 2.1 Journey 1: Browse → Reserve → Basket → Checkout → Confirmation → Waiver → Pickup

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-1 | **CRITICAL** | **Confirmation page breaks on refresh/bookmark.** `ConfirmationPage.tsx` calls `GET /public/booking/order/:reference` without the required `?email=` query param. The API returns 400 "email is required". Customers who refresh or share the URL see "Booking not found". | `apps/web/src/pages/confirmation/ConfirmationPage.tsx` L63–74; `apps/api/src/routes/public-booking.ts` L380–386 | Either persist `email` in URL params/localStorage, or make the API return limited order info without email verification. |
| F-2 | **HIGH** | **Charity donation duplicated on multi-vehicle basket.** `BasketPage.tsx` sends `charityDonation` on every `submit` call in a loop (one per basket item). If a customer rents 3 vehicles, charity is posted 3x. | `apps/web/src/pages/basket/BasketPage.tsx` L459–487 | Send `charityDonation` only on the first item, or aggregate into a single API call. |
| F-3 | **HIGH** | **Waiver confirmation email skipped if email not provided.** The waiver form makes email optional. If omitted, the waiver is signed but no confirmation email is sent. Customer has no record. | `apps/api/src/routes/public-waiver.ts` L224–226; `apps/web/src/pages/waiver/WaiverPage.tsx` L397–404 | Make email required on the waiver form, or use the email from the booking record. |
| F-4 | **MEDIUM** | **No "ready for pickup" status or notification.** After staff processes an order and the waiver is signed, there is no automated transition or notification telling the customer their vehicle is ready. | Gap — no file | Add a `ready_for_pickup` status and trigger an SMS/email notification. |
| F-5 | **MEDIUM** | **Transfer add-on fields stripped by Zod.** UI sends `transferRouteId` and `transferPaxCount` but the `SubmitDirectBookingRequestSchema` doesn't include them; Zod strips unknown keys. | `apps/web/src/pages/basket/BasketPage.tsx` L475–476; `packages/shared/src/schemas/orders-raw-schemas.ts` L56–79 | Add the transfer fields to the schema, or remove them from the UI if not needed. |
| F-6 | **LOW** | **Confirmation page copy typo.** Line 323: "Two sanitised helmets a full tank" — missing punctuation. | `apps/web/src/pages/confirmation/ConfirmationPage.tsx` L323 | Fix copy to "Two sanitised helmets, a full tank, …" |

### 2.2 Journey 2: Walk-in → Activation → Inspection → Return → Settlement

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-7 | **HIGH** | **Walk-in-direct: payments not atomic with RPC.** `activate_order_atomic` RPC succeeds, then rental/deposit payments are inserted in separate queries. If payment insert fails, the order is active with no payment record — books don't balance. | `apps/api/src/routes/orders-raw.ts` L300–365 | Move payment creation into the RPC, or wrap the entire sequence in a Supabase `rpc` that handles all inserts atomically. |
| F-8 | **HIGH** | **Charity GL entry is non-fatal.** If `createTransaction` fails for charity, the error is caught and logged but the order proceeds. The GL will be short on charity payables with no alert. | `apps/api/src/routes/orders-raw.ts` L367–396 | At minimum, persist the failure to a reconciliation queue. Consider making charity posting part of the atomic RPC. |
| F-9 | **HIGH** | **Possible charity double-posting.** The `activate_order_atomic` RPC receives `p_charity_donation`, and the route handler also calls `createTransaction` for charity. If the RPC posts to the GL and the handler also posts, the entry is doubled. | `apps/api/src/routes/orders-raw.ts` L321–322, 367–392; `supabase/migrations/049_order_activation_transaction.sql` | Verify RPC SQL — if RPC does NOT post charity, this is OK. If it does, remove the duplicate call in the route handler. |
| F-10 | **MEDIUM** | **Inspection email failures are swallowed.** If the inspection notification email fails, `console.error` is the only signal — staff may not know the email wasn't sent. | `apps/api/src/routes/inspections.ts` L353–356 | Add a toast/notification in the UI on email failure, or persist to a failed-sends table. |

### 2.3 Journey 3: Transfer Booking → Backoffice → Driver → Notification

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-11 | **HIGH** | **No customer email on transfer booking.** When a customer submits a transfer booking, no confirmation email is sent. The customer has no proof of booking. | `apps/api/src/routes/public-transfers.ts` L76–112 | Add a transfer booking confirmation email using the existing email service. |
| F-12 | **MEDIUM** | **No driver assignment entity.** The system records `driverFee` and `driverPaidStatus` but has no concept of assigning a named driver. Staff cannot track which driver is handling which transfer. | `packages/domain/src/entities/transfer.ts` | Add `driverId` / `driverName` fields to the transfer entity and expose in the UI. |
| F-13 | **MEDIUM** | **transfers.order_id has no foreign key.** The column is plain `text` with no FK to `orders`, allowing orphaned or invalid references. | `supabase/migrations/005_hr_and_operations.sql` L84–85 | Add a FK constraint: `REFERENCES orders(id) ON DELETE SET NULL`. |

### 2.4 Journey 4: Paw Card → Login → Log Saving → History

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-14 | **MEDIUM** | **Paw Card savings aggregation not store-scoped.** `GET /api/paw-card/customer-savings` sums all `paw_card_entries` by email with no store filter. In a multi-store setup, totals will combine across stores. | `apps/api/src/routes/paw-card.ts` L69–77 | Add `store_id` filter to the query. |

### 2.5 Journey 5: Extend Booking

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-15 | **CRITICAL** | **Staff extend override fields silently discarded.** `ExtendOrderModal.tsx` sends `overrideDailyRate`, `paymentStatus`, `paymentMethod`, `paymentAccountId` — but the server validates only `PublicExtendConfirmSchema` (3 fields). Zod strips the extras. The handler hardcodes `overrideDailyRate = undefined`, `isPaid = false`. Staff cannot override rates or mark extensions as paid. | `apps/web/src/components/orders/ExtendOrderModal.tsx` L171–181; `apps/api/src/routes/public-extend.ts` L323–340 | Create a `StaffExtendConfirmSchema` with the additional fields and add a separate authenticated route for staff extensions. |
| F-16 | **HIGH** | **Staff extend uses `wooOrderId` as reference.** The modal sets `orderReference = enrichedData.wooOrderId`, which is null for direct/web bookings. Lookup will fail for non-WooCommerce orders. | `apps/web/src/components/orders/ExtendOrderModal.tsx` L128–129 | Use `bookingToken` or `orderReference` field instead. |
| F-17 | **MEDIUM** | **Extension quote failure is silent.** If the quote API call fails, `extensionCost` is set to `null` with no user-facing error message. | `apps/web/src/pages/extend/ExtendPage.tsx` L83–84 | Show a toast or inline error when the quote fails. |

### 2.6 Journey 6: Maintenance → Fleet Status → Resolution

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-18 | **MEDIUM** | **Maintenance without downtime tracking doesn't revert fleet status.** If maintenance is logged without `downtimeTracked`, completing it does not set the vehicle back to `Available`. Vehicle can be stuck in `Under Maintenance` if the flag was missed at creation. | `apps/api/src/use-cases/fleet/complete-maintenance.ts` L87–93 | Always check and revert fleet status on completion, or prompt staff to confirm status change. |

### 2.7 Cross-Cutting Issues

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-19 | **HIGH** | **Migration inconsistency — `055` references columns that don't exist.** `cancel_order_raw_atomic` writes `cancelled_at` and `cancelled_reason` to `orders_raw`, but no migration adds these columns. It also deletes from `booking_holds` by `order_reference`, a column not in the `036` schema. The `011` CHECK constraint doesn't allow `'cancelled'` status. A fresh `supabase db reset` from migrations will fail. | `supabase/migrations/055_atomic_extend_cancel.sql` L40–50; `011_orders_raw.sql` L8–9; `036_booking_holds.sql` | Add a migration to: (a) add `cancelled_at`, `cancelled_reason` to `orders_raw`; (b) add `order_reference` to `booking_holds`; (c) update the CHECK constraint to include `'cancelled'`. |
| F-20 | **HIGH** | **card_settlement RPC type mismatch.** `match_card_settlement` declares `p_settlement_ids integer[]` but `card_settlements.id` is `text` (changed in migration `018`). Runtime type coercion may fail or silently produce wrong results. | `supabase/migrations/046_card_settlement_transaction.sql` L7, 48; `018_card_settlements_update.sql` L2–6 | Change the RPC parameter to `text[]`. |
| F-21 | **HIGH** | **`activate_order_atomic` RPC parameter type mismatch.** `p_woo_order_id` is declared as `integer` but `orders.woo_order_id` is `text`. | `supabase/migrations/049_order_activation_transaction.sql` L5–6; `014_orders_woo_order_id.sql` L2 | Change to `text`. |
| F-22 | **MEDIUM** | **Timezone inconsistency on transaction dates.** Several routes use `new Date().toISOString().slice(0, 10)` which produces UTC dates, not Manila dates. Transactions near midnight Manila time (UTC+8) will have wrong dates. | `apps/api/src/routes/maya.ts` L138; `orders-raw.ts` L732; `use-cases/orders/process-raw-order.ts` L175 | Use a consistent `formatManilaDate()` utility everywhere. |
| F-23 | **MEDIUM** | **Expense journal date uses `new Date()` instead of expense date.** The `create-expense` use case uses current time for journal date/period, not the expense's own date. | `apps/api/src/use-cases/expenses/create-expense.ts` L73–80 | Use `input.date` for the journal entry's date and period. |
| F-24 | **MEDIUM** | **No seed.sql file.** `config.toml` references `./seed.sql` but the file doesn't exist. `supabase db reset` will fail during seeding. | `supabase/config.toml` L55–60 | Create the seed file or update `sql_paths` to `[]`. |
| F-25 | **MEDIUM** | **Vehicle swap time uses server-local timezone.** `swap_time: now.toTimeString().slice(0, 8)` captures server's local time, not Manila. | `apps/api/src/use-cases/orders/swap-vehicle.ts` L66–67 | Use `toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })`. |
| F-26 | **LOW** | **`cash_advance_schedules.expense_id` has no FK.** Orphaned references possible. | `supabase/migrations/005_hr_and_operations.sql` L27 | Add FK to `expenses` with `ON DELETE SET NULL`. |
| F-27 | **LOW** | **`processRawOrder` — multi-step sequence without transaction wrapper.** Order save, activate, payment inserts, and charity journal are sequential awaits with no enclosing transaction. Partial failure leaves inconsistent state. | `apps/api/src/use-cases/orders/process-raw-order.ts` | Wrap in a Supabase RPC or use `BEGIN`/`COMMIT` via raw SQL. |

---

## Section 3 — Performance Audit

### 3.1 Backend

| # | Priority | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| P-1 | **HIGH** | **N+1 in batch depreciation.** Per-vehicle `await fleetRepo.updateDepreciation` inside a loop — one DB call per vehicle. | `apps/api/src/use-cases/fleet/batch-depreciation.ts` L40–72 | Batch into a single RPC or bulk UPDATE. |
| P-2 | **HIGH** | **N+1 in payroll run.** Sequential `await calculatePayslip` per employee in a loop. | `apps/api/src/use-cases/payroll/run-payroll.ts` L81–96 | Use `Promise.all` for calculation, then batch the DB write. |
| P-3 | **HIGH** | **Unbounded completed orders query.** Cashup summary loads ALL completed orders for a store (no date filter) just to get IDs for deposit handling. Grows linearly with business history. | `apps/api/src/routes/cashup.ts` L100–105 | Add a date range filter (e.g. current cashup period) to the query. |
| P-4 | **MEDIUM** | **Utilization loads all order_items without date filter.** Fetches every `order_item` for all fleet vehicle IDs, then filters by order status in JavaScript. | `apps/api/src/use-cases/fleet/get-utilization.ts` L94–99 | Add date range filter in the Supabase query. Move status filtering to SQL. |
| P-5 | **MEDIUM** | **Sequential vehicle lookups in activation.** `activate-order.ts` calls `fleetRepo.findById` per assignment sequentially. | `apps/api/src/use-cases/orders/activate-order.ts` L61–67 | Use `Promise.all` or batch `findByIds`. |
| P-6 | **MEDIUM** | **Pervasive `select('*')`.** 90+ instances of `.select('*')` across API adapters and routes. Returns all columns including unused ones, increasing payload size and DB load. | See grep results — `config-repo.ts`, `fleet-repo.ts`, `customer-repo.ts`, `accounting-repo.ts`, etc. | Specify only needed columns: `.select('id, name, status')`. Start with high-traffic routes (orders, fleet, payments). |
| P-7 | **MEDIUM** | **Budget repo TODO: JS aggregation instead of RPC.** Three separate comments acknowledging this should be a Supabase RPC. | `apps/api/src/adapters/supabase/budget-repo.ts` L136, 186, 247 | Implement as Supabase RPCs for server-side aggregation. |
| P-8 | **LOW** | **Sequential awaits in quote computation.** Vehicle model, pricing, and location lookups are sequential when they could be parallel. | `apps/api/src/use-cases/booking/compute-quote.ts` L36–63 | Use `Promise.all([getModelById, getPricing, getLocations])`. |

### 3.2 Frontend

| # | Priority | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| P-9 | **HIGH** | **Eager PNG glob bundling.** `HomePage.tsx` uses `import.meta.glob('...Be Pawsitive/*.png', { eager: true })` — all BePawsitive photos are bundled into the main chunk regardless of visibility. | `apps/web/src/pages/home/HomePage.tsx` L39–49 | Switch to `eager: false` and lazy-load images, or move to a CDN/Supabase storage with URL references. |
| P-10 | **MEDIUM** | **Zero `React.memo` usage.** No components use `React.memo` across the entire frontend. List items in fleet, orders, and dashboard will re-render on any parent state change. | Entire `apps/web/src/` | Add `React.memo` to pure presentational components (vehicle cards, table rows, list items). |
| P-11 | **MEDIUM** | **TanStack Query: no `gcTime` configured.** Global defaults only set `staleTime: 30_000` and `retry: 1`. The default `gcTime` (5 minutes) may cause excessive memory usage on data-heavy dashboard. | `apps/web/src/App.tsx` L7–10 | Tune `gcTime` per query based on data volatility. |
| P-12 | **MEDIUM** | **Large library imports not code-split.** `recharts` (dashboard), `gsap` (nav animation), and `framer-motion` are loaded eagerly. Dashboard is lazy-loaded via router, but `gsap` and `framer-motion` are imported in always-rendered components. | `apps/web/src/components/layout/PillNav.tsx`; various | Use dynamic imports for `gsap`. Consider `framer-motion/lazy` or tree-shake unused features. |
| P-13 | **LOW** | **No per-route error boundaries.** A single `ErrorBoundary` wraps the entire app. A crash in dashboard takes down the whole application. | `apps/web/src/App.tsx` L17–20 | Add error boundaries per major route section (dashboard, orders, fleet, etc.). |

### 3.3 Database

| # | Priority | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| P-14 | **MEDIUM** | **Missing composite index on `orders_raw`.** Common staff queries filter by `source` + `status` + `created_at`. Only individual indexes exist on `status`, `source`, and `created_at`. | `supabase/migrations/011_orders_raw.sql` L13–15 | Add: `CREATE INDEX idx_orders_raw_source_status_created ON orders_raw(source, status, created_at DESC)`. |
| P-15 | **MEDIUM** | **Cashup summary would benefit from a materialized view.** The current implementation runs 9+ parallel queries to build the summary. A materialized view refreshed on relevant changes would reduce load. | `apps/api/src/routes/cashup.ts` L27–105 | Create a `cashup_daily_summary` materialized view, refresh via trigger or scheduled job. |
| P-16 | **LOW** | **No index on `waivers.order_reference` for staff lookup.** While an index exists (migration 059 L39–40), confirm it covers the RLS-filtered query pattern with `user_store_ids()`. | `supabase/migrations/059_waivers.sql` L39–40 | Verify with `EXPLAIN ANALYZE` on production data. |

---

## Section 4 — Customer Website Audit

### 4.1 Visual Consistency

| # | Page | Finding | File / Line |
|---|------|---------|-------------|
| V-1 | **Global** | `sand-brand` in Tailwind is `#f1e6d6` (canonical). | `apps/web/tailwind.config.ts` L21–22 |
| V-2 | **Global** | Body font defaults to Alegreya Sans, not Lato. `fontFamily.body` maps to Alegreya Sans, violating the Lato body text spec. | `apps/web/tailwind.config.ts` L26–32 |
| V-3 | **Global** | `index.html` loads 5 font families (Alegreya Sans, Inter, Playfair, Lato, Roboto Flex) — Inter and Roboto are not in the design system. | `apps/web/index.html` L6–11 |
| V-4 | **Global** | `index.css` hero title uses `#1A7A6E` (not teal `#00577C`); subtitle uses `#3D3D3D` (not charcoal `#363737`). | `apps/web/src/index.css` L71–78 |
| V-5 | **Public Booking (Transfers)** | Entire page uses `bg-gray-50`, `blue-600`, `indigo-100` — completely off-brand. Looks like a different application. | `apps/web/src/pages/transfers/PublicBookingPage.tsx` L86–150 |
| V-6 | **Login** | Uses `blue-50`, `indigo-100`, `blue-500` — generic Tailwind, not brand colours. | `apps/web/src/pages/login/LoginPage.tsx` L37–52 |
| V-7 | **BePawsitive** | Uses non-brand palette: `#397dbe`, `#72b36d`, custom gradients instead of teal/gold/sand. | `apps/web/src/pages/bepawsitive/BePawsitivePage.tsx` L124, 219, 320 |
| V-8 | **Paw Card (various)** | Uses alternate teal `#1A7A6E`, gold `#F5B731`, charcoal `#3e4946` — close but not matching brand tokens. | `apps/web/src/pages/paw-card/PawCardDashboard.tsx`, `PawCardLoginPanel.tsx` |
| V-9 | **Home** | Extensive inline hex (`#00577C`, `#FCBC5A`, `#363737`, `#f1e6d6`) instead of Tailwind tokens. While the hues are correct, they bypass the design system. | `apps/web/src/pages/home/HomePage.tsx` (40+ instances) |
| V-10 | **Button component** | Primary variant uses `bg-blue-600` / `hover:bg-blue-700` — not `teal-brand`. Affects any page using the default Button. | `apps/web/src/components/common/Button.tsx` L6–11 |
| V-11 | **Router fallback spinner** | Uses `border-blue-600` instead of `border-teal-brand`. | `apps/web/src/router.tsx` L61–64 |
| V-12 | **PageLayout** | `contentBackground` light-cream option uses `#FAF6F6` instead of `cream-brand` (`#FAF6F0`). | `apps/web/src/components/layout/PageLayout.tsx` L155–156 |

### 4.2 Mobile & Tablet

| # | Finding | File / Line | Recommended Fix |
|---|---------|-------------|-----------------|
| M-1 | **PageLayout duplicate back-to-top buttons.** Two identical `<button>` elements (lines 302–323 and 327–348) — duplicate DOM nodes, both 40px (under 44px minimum). | `apps/web/src/components/layout/PageLayout.tsx` L302–348 | Remove the duplicate. Increase to `w-11 h-11` (44px). |
| M-2 | **PawCardPage separator `minWidth: 800px`.** Forces horizontal scroll on mobile despite `overflow-x-hidden` on parent. | `apps/web/src/pages/paw-card/PawCardPage.tsx` L208 | Use `min-w-full` or responsive width. |
| M-3 | **HomePage stack container fixed `width: 340px`.** Could be tight on screens < 360px (some budget Android devices). | `apps/web/src/pages/home/HomePage.tsx` L750 | Use `max-w-[340px] w-full`. |
| M-4 | **Basket emoji link (🛒) has no text or aria-label.** Screen readers get an empty link. | `apps/web/src/components/layout/PageLayout.tsx` L171–176 | Add `aria-label="View basket"`. |
| M-5 | **Waiver signature canvas lacks aria-label.** No accessible name for the drawing area. | `apps/web/src/pages/waiver/WaiverPage.tsx` L147–158 | Add `aria-label="Sign your name"` and `role="img"`. |

### 4.3 SEO

| # | Finding | File / Line | Recommended Fix |
|---|---------|-------------|-----------------|
| SEO-1 | **Default `<title>` is "Lola's Rentals Backoffice".** Before React hydrates, customers see "Backoffice" in tabs and social previews. | `apps/web/index.html` L6 | Change to "Lola's Rentals & Tours — Siargao Island Vehicle Rental". |
| SEO-2 | **No meta descriptions or Open Graph tags on any page.** Social sharing previews will show nothing useful. Google will auto-generate snippets. | All pages | Install `react-helmet-async`. Add per-page `<meta name="description">`, `og:title`, `og:description`, `og:image`. |
| SEO-3 | **WaiverPage and PublicBookingPage don't use PageLayout.** No `document.title` is set — tab shows default "Backoffice" title. | `apps/web/src/pages/waiver/WaiverPage.tsx`; `apps/web/src/pages/transfers/PublicBookingPage.tsx` | Add `useEffect` to set `document.title` on mount. |
| SEO-4 | **No canonical URLs.** Potential duplicate content issues if the site is accessible via multiple domains. | All pages | Add `<link rel="canonical">` via helmet. |
| SEO-5 | **No sitemap.xml or robots.txt.** Search engines have no crawl guidance. | Project root / `public/` | Generate a static `sitemap.xml` and `robots.txt` for the public folder. |

### 4.4 Professional Quality

| # | Finding | File / Line | Recommended Fix |
|---|---------|-------------|-----------------|
| Q-1 | **BePawsitivePage has placeholder content.** `[XXX]+` stats, `[X]` values, and "TODO: Replace with actual fun run photos" visible to customers. | `apps/web/src/pages/bepawsitive/BePawsitivePage.tsx` L497, 540 | Replace with real data or hide the section until ready. |
| Q-2 | **PublicBookingPage (transfers) feels like a prototype.** Generic gray/blue design with no brand elements, no PageLayout nav/footer. | `apps/web/src/pages/transfers/PublicBookingPage.tsx` | Rebuild using PageLayout and brand tokens. |
| Q-3 | **No customer reviews/testimonials on the home page.** The `reviews` table exists in the DB but no review display component is on the home page. | `apps/web/src/pages/home/HomePage.tsx` | Add a testimonial carousel section pulling from the reviews API. |
| Q-4 | **Missing trust signals.** No visible safety certifications, insurance information, or partner logos on the booking flow pages (only on partners page). | Booking pages | Add a "Trusted by" or "Our guarantees" strip near the CTA on browse/basket pages. |
| Q-5 | **No `prefers-reduced-motion` respect.** Count-up animations and GSAP transitions don't check for reduced motion preferences. | `apps/web/src/pages/bepawsitive/BePawsitivePage.tsx` L8–26; various GSAP uses | Wrap animations in `if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)`. |

---

## Section 5 — Code Quality & Tech Debt

### 5.1 TypeScript

| # | Finding | File / Line | Impact |
|---|---------|-------------|--------|
| T-1 | **`strict: false` in web tsconfig.** Frontend TypeScript runs without strict null checks, allowing potential null pointer bugs. | `apps/web/tsconfig.json` | Enable `strict: true` and fix resulting errors incrementally. |
| T-2 | **16 instances of `: any` across apps.** Found in `AccountDetailPage.tsx` (6), `fleet.ts` (2), `fleet-status-sync.ts` (2), `todo-repo.ts` (1), `DomeGallery.tsx` (1), `TimesheetsPage.tsx` (1), `email.ts` (1). | See grep results | Replace with proper types or `unknown` + type narrowing. |
| T-3 | **Domain `Vehicle.status` is plain `string`.** Not aligned with the `z.enum` in `fleet-schemas.ts` or the `fleet_statuses` table. | `packages/domain/src/entities/vehicle.ts` L16 | Use a union type: `'available' \| 'rented' \| 'maintenance' \| 'retired'`. |
| T-4 | **Domain vs Shared type drift.** `OrderStatus` exists in both `packages/domain` and `packages/shared` with identical values but different representations (class vs const object). `JournalLegSchema` in shared has no `entryId` and no debit/credit XOR constraint. `DirectoryContactSchema` uses different field names than the domain port. | Multiple files | Consolidate: domain should be the source of truth; shared schemas should derive from domain types. |

### 5.2 Dead Code & Unused Exports

| # | Finding | File / Line |
|---|---------|-------------|
| D-1 | **Unused domain port interfaces.** `AuthPort`, `ReviewRepository`, `DirectoryRepository`, `RecurringBillsPort` are exported from `packages/domain` but never imported in `apps/`. | `packages/domain/src/ports/auth-port.ts`, `review-repository.ts`, `directory-repository.ts`, `recurring-bills-port.ts` |
| D-2 | **Unused value objects.** `StoreId` and `DateRange` are only used in domain tests, never in app code. | `packages/domain/src/value-objects/store-id.ts`, `date-range.ts` |
| D-3 | **`packages/shared/dist` may be tracked in git.** `.gitignore` ignores `packages/domain/dist/` but not `packages/shared/dist/`. | Root `.gitignore` |

### 5.3 Test Coverage

| # | Finding | Impact |
|---|---------|--------|
| TC-1 | **`packages/shared` has zero tests.** Zod schemas (the validation layer for every API route) have no unit tests. A schema regression could silently break all endpoints. | Add at least snapshot tests for every schema. |
| TC-2 | **No integration tests for critical paths.** Order activation, payment recording, charity posting, and extend flows have no end-to-end tests. | Add Supertest integration tests for the top 5 critical routes. |
| TC-3 | **Payroll 13th-month formula may be incorrect.** For `rateType === 'daily'`, `basicPay` is already `basicRate * daysWorked`, so the 13th-month accrual computes `(basicRate * daysWorked²) / 12`. This needs a domain expert review. | `packages/domain/src/services/payroll-calculator.ts` L84–86 |

### 5.4 TODOs/FIXMEs

| Location | Content |
|----------|---------|
| `apps/api/src/adapters/supabase/budget-repo.ts` L136, 186, 247 | "TODO: Replace JS aggregation with a Supabase RPC for better performance" |
| `apps/web/src/pages/bepawsitive/BePawsitivePage.tsx` L540 | "TODO: Replace with actual fun run photos" |

### 5.5 Other

| # | Finding | File / Line |
|---|---------|-------------|
| CQ-1 | **No ESLint configuration.** `eslint` v9 and plugins are installed but no config file exists. Linting is effectively disabled. | Root |
| CQ-2 | **Missing root README.md.** No onboarding documentation for new developers. | Root |
| CQ-3 | **`.env.example` inconsistent with code.** Documents `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` but code uses `GOOGLE_SERVICE_ACCOUNT_JSON`. | `apps/api/.env.example` vs `apps/api/src/adapters/google-sheets/sheets-client.ts` |
| CQ-4 | **CI runs `npm ci` in `apps/api` but lockfile is at root.** This may fail or produce different dependency trees than local development. | `.github/workflows/security-audit.yml` |

---

## Section 6 — 10 Strategic Recommendations

### 1. Automated SMS/WhatsApp Notifications via Twilio or MessageBird

**Business case:** Siargao has unreliable email access for many tourists. WhatsApp links are already in email templates but there's no programmatic messaging. SMS/WhatsApp for booking confirmations, waiver reminders, and pickup readiness would dramatically improve customer experience and reduce no-shows.

**Technical complexity:** Medium
**Estimated development time:** 1–2 weeks
**Priority:** Must have before launch

### 2. Online Payment Integration Completion (Maya + GCash)

**Business case:** Maya checkout exists but lacks amount verification, proper error handling, and webhook idempotency. GCash is the dominant payment method in the Philippines. Completing and hardening the payment flow unlocks online revenue before arrival.

**Technical complexity:** Medium
**Estimated development time:** 1–2 weeks
**Priority:** Must have before launch

### 3. Dynamic Pricing & Seasonal Rate Management

**Business case:** Siargao has extreme seasonality (Cloud 9 surfing season, Holy Week, Christmas). Currently pricing is static per model. Dynamic pricing by date range would maximise revenue during peak and fill capacity during low season.

**Technical complexity:** Medium
**Estimated development time:** 2–3 weeks
**Priority:** Nice to have

### 4. Multi-Language Support (Filipino, Korean, Chinese)

**Business case:** Siargao attracts significant Korean and Chinese tourist demographics. A language toggle for key customer pages (browse, basket, waiver, confirmation) would reduce friction and expand market reach.

**Technical complexity:** Medium (i18n framework + translation files)
**Estimated development time:** 2–3 weeks
**Priority:** Future roadmap

### 5. Customer Account & Booking History Portal

**Business case:** Returning customers (especially long-term expats and digital nomads) currently have no way to view past bookings, rebook favourite vehicles, or manage active rentals. A lightweight customer portal would increase retention and reduce staff workload.

**Technical complexity:** Medium
**Estimated development time:** 3–4 weeks
**Priority:** Nice to have

### 6. Real-Time Vehicle GPS Tracking Dashboard

**Business case:** Vehicle theft and unauthorised area usage are real risks on an island. GPS integration (e.g. via OBD devices) with a staff dashboard showing live locations would improve security and enable geofenced alerts.

**Technical complexity:** High
**Estimated development time:** 4–6 weeks
**Priority:** Future roadmap

### 7. Automated Damage Assessment with Photo AI

**Business case:** The inspection flow already captures photos. Integrating a damage detection model (or structured photo comparison) would standardise damage assessment, reduce disputes, and speed up the return process.

**Technical complexity:** High
**Estimated development time:** 4–6 weeks
**Priority:** Future roadmap

### 8. Loyalty Programme Tier System for Paw Card

**Business case:** The Paw Card tracks savings but has no tier system. Adding Bronze/Silver/Gold tiers with increasing benefits (priority booking, free helmets, upgrade eligibility) would incentivise repeat business and increase average order value.

**Technical complexity:** Low
**Estimated development time:** 1–2 weeks
**Priority:** Nice to have

### 9. Partner Commission & Referral Tracking System

**Business case:** Paw Card partner establishments drive referrals but there's no tracking of conversion or commission. A referral code system with automatic commission calculation would strengthen partner relationships and enable performance-based partnerships.

**Technical complexity:** Medium
**Estimated development time:** 2–3 weeks
**Priority:** Nice to have

### 10. Comprehensive Reporting & Analytics Dashboard

**Business case:** The current dashboard shows operational metrics but lacks trend analysis, revenue forecasting, fleet utilisation reports, and export capabilities. Management needs historical reporting for business decisions, tax compliance, and investor reporting.

**Technical complexity:** Medium
**Estimated development time:** 2–3 weeks
**Priority:** Must have before launch (basic version)

---

## Section 7 — Pre-Deployment Checklist

### 🔴 Blockers — Must Fix Before Any Real Usage

| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| 1 | **Fix migration inconsistencies** — add missing columns (`cancelled_at`, `cancelled_reason` on `orders_raw`; `order_reference` on `booking_holds`), update CHECK constraint to include `'cancelled'`, fix RPC type mismatches (`card_settlements` text[], `woo_order_id` text). Test full `supabase db reset`. | F-19, F-20, F-21 | 1 day |
| 2 | **Add authentication/token to public cancel endpoint.** Require cancellation token or email verification. | S-1 | 0.5 days |
| 3 | **Lock down RLS on financial tables.** Restrict `budget_periods`, `budget_lines`, `orders_raw`, `waivers`, `late_return_assignments`, `inspection_results` to store-scoped + permission-based policies. | S-3, S-4, S-5, S-11, S-12 | 1 day |
| 4 | **Secure SECURITY DEFINER RPCs.** Add internal permission checks. Restrict EXECUTE to `service_role`. Set `search_path`. | S-2 | 0.5 days |
| 5 | **Add Zod validation to Maya checkout.** Validate amount matches order balance. Check order belongs to user's store. | S-6, S-14 | 0.5 days |
| 6 | **Fix staff extend flow.** Create authenticated extend route with override support. Fix order reference lookup to use `bookingToken`. | F-15, F-16 | 1 day |
| 7 | **Fix confirmation page refresh.** Persist email in URL or localStorage for the public order lookup. | F-1 | 0.5 days |
| 8 | **Fix charity double-posting risk.** Verify RPC vs route handler don't both post charity GL. Make charity posting atomic. | F-9 | 0.5 days |
| 9 | **Fix rate limiter `max` → `limit`.** Verify and correct all inline rate limiters to use `express-rate-limit` v8 API. | S-24 | 0.5 days |
| 10 | **Set all required env vars in production.** Document and verify every env var. Replace placeholder WhatsApp number. | S-22, S-23, S-28 | 0.5 days |
| 11 | **Unify timezone handling.** Replace all `toISOString().slice(0,10)` with a `formatManilaDate()` utility. Fix expense journal dates. | F-22, F-23, F-25 | 0.5 days |
| 12 | **Remove BePawsitive placeholder content.** Replace `[XXX]+` and TODO photo placeholders with real data or hide section. | Q-1 | 0.5 days |
| 13 | **Fix `index.html` title.** Change from "Backoffice" to customer-facing title. | SEO-1 | 5 min |
| 14 | **Make walk-in-direct payment insertion atomic.** Move payment creation into the RPC or wrap in a transaction. | F-7 | 1 day |
| 15 | **Add `requirePermission` to directory GET route.** | S-7 | 5 min |
| 16 | **Create `seed.sql` or remove from `config.toml`.** | F-24 | 5 min |

### 🟡 Important — Fix Within First Week of Launch

| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| 17 | **Restrict paw-card-receipts storage bucket.** Limit to authenticated users with file type/size enforcement at policy level. | S-9 | 0.5 days |
| 18 | **Add cron job leader election.** Prevent duplicate emails from multiple server instances. | S-25 | 1 day |
| 19 | **Add transfer booking confirmation email.** | F-11 | 0.5 days |
| 20 | **Fix charity donation duplication on multi-vehicle basket.** Send charity only on first item. | F-2 | 0.5 days |
| 21 | **Make waiver email required.** Or pull from booking record. | F-3 | 0.5 days |
| 22 | **Brand the public transfer booking page.** Apply PageLayout, teal/gold/sand tokens. | V-5, Q-2 | 1 day |
| 23 | **Fix Button component to use `teal-brand`.** Update primary variant from `blue-600` to `bg-teal-brand`. | V-10 | 0.5 days |
| 24 | **Fix PageLayout duplicate back-to-top buttons.** Remove duplicate, increase to 44px. | M-1 | 15 min |
| 25 | **Remove all debug `console.log` from production code.** 11 in frontend, 30 in backend. | S-21, S-18 | 0.5 days |
| 26 | **Add basic SEO meta tags.** Install `react-helmet-async`, add descriptions and OG tags to customer pages. | SEO-2 | 1 day |
| 27 | **Fix body font to Lato.** Update tailwind.config.ts (`fontFamily.body`). | V-2 | 0.5 days |
| 28 | **HTML-encode email template interpolations.** | S-15 | 0.5 days |
| 29 | **Enable `strict: true` in web tsconfig.** Fix null safety issues. | T-1 | 2 days |
| 30 | **Add ESLint configuration.** Create `eslint.config.js` with TypeScript + React rules. | CQ-1 | 0.5 days |

### 🟢 Nice to Have — Can Operate Without These

| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| 31 | **Replace `select('*')` with specific columns** on high-traffic routes. | P-6 | 2 days |
| 32 | **Fix N+1 patterns** in batch depreciation, payroll, and activation. | P-1, P-2, P-5 | 1 day |
| 33 | **Add `React.memo`** to presentational components. | P-10 | 1 day |
| 34 | **Optimize eager PNG glob** on HomePage. | P-9 | 0.5 days |
| 35 | **Add per-route error boundaries.** | P-13 | 0.5 days |
| 36 | **Add unit tests for `packages/shared` schemas.** | TC-1 | 1 day |
| 37 | **Add integration tests** for top 5 critical API routes. | TC-2 | 2 days |
| 38 | **Consolidate domain/shared type duplication.** | T-4 | 1 day |
| 39 | **Review payroll 13th-month formula** with domain expert. | TC-3 | 0.5 days |
| 40 | **Implement JWT refresh token flow.** | S-8 | 2 days |
| 41 | **Add magic-byte file validation** on uploads. | S-29 | 0.5 days |
| 42 | **Add `sitemap.xml` and `robots.txt`.** | SEO-5 | 0.5 days |
| 43 | **Add `prefers-reduced-motion` support** for animations. | Q-5 | 0.5 days |
| 44 | **Create root README.md** with setup instructions. | CQ-2 | 0.5 days |
| 45 | **Add driver assignment to transfers.** | F-12 | 1 day |
| 46 | **Add materialized view for cashup summary.** | P-15 | 1 day |
| 47 | **Budget repo: implement Supabase RPCs** for aggregation. | P-7 | 1 day |
| 48 | **Remove unused font imports** (Inter, Roboto Flex) from `index.html`. | V-3 | 5 min |

---

*End of Audit Report V7*
