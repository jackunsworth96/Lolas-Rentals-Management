# Lola's Rentals & Tours — Pre-Deployment Audit Report V9

| Field | Value |
|-------|-------|
| **Audit date** | 17 April 2026 |
| **Follows** | Audit V8 (15 April 2026) |
| **Overall readiness score** | **8.0 / 10** |

## Executive Summary

Audit V9 reviews the platform after the remediation work carried out since V8 (migrations 070–072; `escapeHtml()` in the email service; the `save()` insert/update split; the atomic-activation overload cleanup; basket/confirmation transfer pricing fixes; customer hero copy and payment-method filter; transfers created on booking; walk-in payment rows).

**What's meaningfully better.** Database posture is the strongest it has ever been: RLS is now enabled on every public table (migration 070 closed the `late_return_assignments` gap), 15 additional functions had `SET search_path = public` added (071/072), and the previously "open to `true`" policies on `directory`, `merchandise`, `paw_card_establishments`, `post_rental_email_log`, `reviews`, and `waiver_reminder_log` are now scoped to `authenticated` staff or the right permission. Email bodies produced by the **template functions** in `apps/api/src/services/email.ts` now escape every interpolated customer field (71 `escapeHtml()` call sites across 9 templates). The booking/basket pipeline is internally consistent: `webQuoteRaw` persists rental + fees + addons + **transfer** + **charity** together; `BasketPage` no longer double-adds delivery/collection; walk-in activation writes both the rental payment and the deposit payment; and the standalone transfer booking path (V8 F-01) now sends the customer confirmation email. Customer site polish has advanced: `NotFoundPage` with a catch-all `path="*"`, teal-brand loading spinner, conversion-focused hero headline, card/bank-transfer filtered from public checkout with a "coming soon" notice, helmet count + flight arrival time surfaced in the inbox modal, and GCash instructions embedded in the confirmation email.

**What's still a launch blocker.** Two problems are material enough to gate real traffic: (1) **HTML injection is only partially fixed.** The `escapeHtml()` utility is used inside `email.ts`, but the **inline staff-alert templates** in `orders-raw.ts` (walk-in-direct) and `submit-direct-booking.ts` (online direct) still interpolate user-supplied `customerName`, `customerEmail`, `customerMobile`, `flightNumber`, and `orderReference` directly into HTML. Because a single booking form sends strings straight into operational inboxes, this is still a live XSS-in-email vector for staff. (2) **Online transfer bookings now produce duplicate rows in `transfers`.** V8's fix created a transfer immediately in `submit-direct-booking.ts` (good — solves the "transfer never appears" problem); but `process-raw-order.ts` still creates a transfer when staff later activate the raw order, with no existence check. Every online booking that includes a transfer will leave two rows (one with `order_id = null`, one with the activated `order_id`) — and this is the most plausible explanation for the user-reported "Transfer total showing ₱0 on Transfers page" symptom (two rows, stale pricing on one).

**Known exclusions (per product owner — not re-audited here):** Maya checkout K004 / endpoint remains blocked on Maya support; pre-existing TypeScript strict errors in fleet/cashup modals; domain/email migration; `public-extend.ts` duplication not yet refactored (down from 940 → 836 lines, still four near-duplicate branches).

---

## Section 1 — Security Audit

| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-01 | **HIGH** | **HTML injection still present in inline staff-alert emails.** Template functions in `apps/api/src/services/email.ts` now escape correctly (verified: 71 `escapeHtml()` call sites). But the **walk-in-direct staff alert** and the **online-direct staff alert** are built as inline template literals in the route/use-case and still interpolate raw user input — `${body.customerName}`, `${body.customerEmail}`, `${body.customerMobile}`, `${orderReference}`, `${body.vehicleName}`, `${input.flightNumber}`, `${input.flightArrivalTime}`. A malicious customer name (`<img src=x onerror=…>`) will render in the operations inbox. Subject lines are also unescaped (less risky, but still). | `apps/api/src/routes/orders-raw.ts` ~L461–504 (walk-in alert); `apps/api/src/use-cases/booking/submit-direct-booking.ts` ~L316–380 (online booking alert, including `addonsStaffHtml` + `transferStaffHtml`) | Move both staff-alert templates into `services/email.ts` as `walkInStaffAlertHtml()` and `bookingStaffAlertHtml()` and route every `${...}` through `escapeHtml()` (and `encodeURIComponent(customerMobile)` in the `tel:` href). Blocker. |
| S-02 | **MEDIUM** | **Public raw-order list/detail endpoints use `SELECT *` on `orders_raw`.** V8's S-03 fix updated the *public* `/order/:reference` lookup (good — now projects explicit columns). The staff-facing endpoints in `orders-raw.ts` still use `.select('*')`. These are behind `ViewInbox`, but any future PII columns on `orders_raw` would widen the blast radius. | `apps/api/src/routes/orders-raw.ts` ~L534 (list) and ~L573 (detail) | Replace with an explicit `.select(...)` listing only the columns the inbox UI consumes, or at minimum add a comment locking the column set and a linter rule to flag future `select('*')`. |
| S-03 | **MEDIUM** | **No rate limit on `/public/public-transfer-booking`.** The `flightLimiter` is applied only to `/flight-lookup`. The booking endpoint (token-less when a `storeId` is provided) can be hammered to create transfer rows. | `apps/api/src/routes/public-transfers.ts` ~L140 | Add a per-IP limiter (e.g. `limit: 20 / 15 min`) equivalent to `publicLimiter` on POST `/transfer-booking` and `/public-transfer-booking`. |
| S-04 | **LOW** | **Charity ledger account still hardcoded as `'CHARITY-PAYABLE'`.** Present in both paths. The posting is wrapped in `try/catch` and swallowed — so if `chart_of_accounts` does not contain this id, charity accruals silently disappear with only a `console.error`. | `apps/api/src/routes/orders-raw.ts` ~L398; `apps/api/src/use-cases/orders/process-raw-order.ts` ~L323 | Resolve the charity-payable account from `chart_of_accounts` (mirroring `resolveStoreAccounts`) and surface non-production failures loudly. Same N-2 recommendation as V8. |
| S-05 | **LOW** | **Zero-amount raw collect-payment still allowed.** V8 S-04 unchanged. `collectPaymentSchema` uses `z.number().min(0)`. | `apps/api/src/routes/orders-raw.ts` ~L715 | `z.number().positive()` unless a documented business case exists. |
| S-06 | **LOW** | **Cancellation token logged in email URL and stored in `sessionStorage` keys.** The cancel URL includes `?token=...` in the confirmation email and the basket writes `confirm_email_${ref}` to sessionStorage — both are acceptable, but the token is a 64-char hex string never rotated after use. If the email is forwarded, the recipient can cancel. | `apps/api/src/use-cases/booking/submit-direct-booking.ts` ~L291 | Consider a single-use flag on `cancellation_token` (rotate/clear after successful cancel) or a shorter token TTL (e.g. until pickup date). |
| S-07 | **INFO** | **`packages/shared/dist/` is tracked in git** (see `git status` — two modified dist files in V8→V9 diff). `.gitignore` excludes `apps/api/dist`, `apps/web/dist`, `packages/domain/dist`, but **not** `packages/shared/dist`. Every build produces noisy diffs and creates merge conflicts. | `.gitignore` | Add `packages/shared/dist/` (and `packages/*/dist/` for defense-in-depth) and `git rm --cached -r packages/shared/dist/`. |

---

## Section 2 — Functional Gaps & Bug Audit

| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-01 | **HIGH** | **Duplicate transfer rows on every online booking with a transfer.** `submit-direct-booking.ts` step 6b creates a `transfers` row immediately on submit (correct — this is the V8 fix that makes the transfer visible on the ops page before activation). When staff later process the raw order, `process-raw-order.ts` L334–371 creates a **second** transfer row with `order_id = activated_order_id`. There is no "does a transfer already exist for this raw order / order reference / customer+serviceDate?" check. This is almost certainly the cause of the user-reported "Transfer total showing ₱0 on Transfers page" — ops sees two rows, and the first-created (with `orderId = null`) is not displayed against the order. | `apps/api/src/use-cases/booking/submit-direct-booking.ts` ~L183–216 and `apps/api/src/use-cases/orders/process-raw-order.ts` ~L334–371 | Pick one creator: either (a) keep creation on submit and, in `process-raw-order`, only **link** the existing transfer to the activated `orderId`; or (b) remove the eager creation in `submit-direct-booking` and re-instate a null-order transfer only for the edge cases (walk-in with transfer, public transfer endpoint) — this is the simpler refactor. Add a unique constraint (e.g. `transfers.order_ref UNIQUE NULLS DISTINCT`) once the chosen path is in place. |
| F-02 | **MEDIUM** | **`process-raw-order.ts` hardcodes `paxCount: 1` and drops `transferAmount`.** When a staff member activates an online raw order with a transfer, the transfer row it creates uses `paxCount: 1` regardless of what the customer selected, and `totalPrice` is taken from `rawOrder.payload.transfer_amount` **only if** that key is present. Even though `submit-direct-booking` does write `payload.transfer_amount`, it does **not** write `payload.transfer_pax_count` — so staff-activated transfers lose pax. | `apps/api/src/use-cases/orders/process-raw-order.ts` ~L350; `apps/api/src/adapters/supabase/booking-adapter.ts` ~L237–245 (payload construction) | Persist `transfer_pax_count` and `transfer_amount` into `payload` when inserting the direct booking, then read them back in `process-raw-order`. Resolves together with F-01 once a single creation site is chosen. |
| F-03 | **MEDIUM** | **Transfers page has no pickup-time column / driver-notification workflow.** The operations `TransfersPage` surfaces `flightTime` and `route` but there is no `pickup_time`/`pickup_location` field on the transfer row or UI, and no on-action "email driver" trigger. Listed by product owner as outstanding; confirmed absent in code. | `apps/web/src/pages/transfers/TransfersPage.tsx`; `apps/web/src/api/transfers.ts` | Add `pickupTime` / `pickupLocation` columns on `transfers` (migration + schema), display in the upcoming list, and wire a "Notify driver" action to a new `POST /transfers/:id/notify` with an email template. |
| F-04 | **MEDIUM** | **`PublicBookingSchema.contactNumber` still nullable.** V8 F-05 unchanged. The UI requires a WhatsApp number; the API schema does not. | `apps/api/src/routes/public-transfers.ts` ~L23 | `z.string().min(1)` if mandatory. |
| F-05 | **LOW** | **Past service dates still accepted on token-based transfer page.** V8 F-03 unchanged — `<input type="date">` has no `min` attribute tied to today. | `apps/web/src/pages/transfers/PublicBookingPage.tsx` ~L179–186 | Set `min={todayManilaISO}`. |
| F-06 | **LOW** | **`TransferBookingPage` still uses raw `fetch()` instead of `api.post`.** V8 F-04/Q-04 partial fix — `normalizeApiBase` was extracted to `apps/web/src/api/normalize-api-base.ts`, but `TransferBookingPage.tsx` ~L109–116 redeclares its own copy and builds `API_BASE` locally, then calls `fetch(`${API_BASE}/public/public-transfer-booking`…)` at L205. `WaiverPage.tsx` has the same duplication. | `apps/web/src/pages/TransferBookingPage.tsx`; `apps/web/src/pages/waiver/WaiverPage.tsx` | Remove local `normalizeApiBase` and call `api.post('/public/public-transfer-booking', ...)`. |
| F-07 | **LOW** | **`/book/reserve` has no inclusions list, reviews, or donation counter.** Product owner flagged as outstanding — confirmed: `BrowseBookPage.tsx` contains only the search, basket chips, and vehicle grid. | `apps/web/src/pages/booking/BrowseBookPage.tsx` | Port the inclusion grid and `ReviewsSection` / `BePawsitiveMeter` from `HomePage` into a below-fold section on reserve. |

---

## Section 3 — Customer Website Audit

| # | Finding | File / Line | Recommended Fix |
|---|---------|-------------|-----------------|
| W-01 | **Donation ticker has no ₱5,000 preset.** `OrderSummaryPanel` exposes only `[0, 50, 100, 200]` presets. Product owner flagged a ₱5,000 option on BePawsitive as outstanding. | `apps/web/src/components/basket/OrderSummaryPanel.tsx` ~L131 | Add a ₱5,000 preset button (and, on `BePawsitivePage`, a standalone "Donate ₱5,000" CTA wired to a one-off donation endpoint or WhatsApp flow). |
| W-02 | **Sitemap still missing indexable public pages.** `/peace-of-mind`, `/refund-policy`, `/paw-card/partners`, and `/book/paw-card` all render full branded content but are absent from `sitemap.xml`. V8 W-03 unchanged. | `apps/web/public/sitemap.xml` | Add four `<url>` entries (`changefreq=monthly`, `priority=0.5`). |
| W-03 | **SEO component coverage incomplete.** `BrowseBookPage`, `TransferBookingPage`, and `HomePage` use `<SEO>`. `BasketPage`, `ConfirmationPage`, `ExtendPage`, `CancelBookingPage`, `WaiverPage`, `PrivacyPage`, `RefundPolicyPage`, `PeaceOfMindPage`, `PawCardPage`, `PawCardPartnersPage`, and `BePawsitivePage` do not. | Listed pages under `apps/web/src/pages/` | Add `<SEO noIndex />` for transactional/sensitive flows (basket, confirmation, extend, waiver, cancel) and full meta for indexable content (privacy, refund-policy, peace-of-mind, paw-card, paw-card/partners, bepawsitive). |
| W-04 | **`OrderDetailModal` still leans on generic Tailwind blue/gray.** File is 1,362 lines (down from ~1,450) and still contains 21 occurrences of `blue-600`, `bg-gray-50`, etc. V8 W-04 only partially progressed. | `apps/web/src/components/orders/OrderDetailModal.tsx` | Progressive refactor to `teal-brand` / `charcoal-brand` / `sand-brand`. Low launch priority. |
| W-05 | **Operations pages still scroll horizontally on mobile.** Product owner flagged as outstanding — tables in `FleetPage`, `CashupPage`, `UtilizationDashboard`, `TransfersPage`, `MaintenancePage` rely on `overflow-x-auto` + fixed-width columns. Staff-only; acceptable for launch but should be fixed. | Multiple | Audit column widths, hide low-priority columns under `md:` breakpoint, or switch to a stacked-card layout on small screens. |

---

## Section 4 — Code Quality & Tech Debt

| # | Finding | File / Line | Impact |
|---|---------|-------------|--------|
| Q-01 | **`public-extend.ts` still 836 lines with four near-duplicate branches** (public + staff × raw + active). Modestly shorter than V8's 940, but the structural duplication (availability → quoting → RPC args → email) is unchanged; rate limiters were added inline, which is good. | `apps/api/src/routes/public-extend.ts` | Extract `resolveExtensionForRaw()` and `resolveExtensionForActive()` helpers returning a normalized quote/payload, plus a single `sendExtendConfirmationEmail()` — each route then becomes ~40 lines of orchestration. |
| Q-02 | **`OrderDetailModal.tsx` still ~1,360 lines** — a single component owning summary, payments, vehicles, addons, history, Maya modal, inspection portal, extend modal, and multiple forms. V8 Q-02 largely unchanged. | `apps/web/src/components/orders/OrderDetailModal.tsx` | Split into tab subcomponents and custom hooks (`useOrderPayments`, `useAddonEdits`, etc.). |
| Q-03 | **Three copies of `normalizeApiBase`.** A shared helper now exists at `apps/web/src/api/normalize-api-base.ts`, but `TransferBookingPage.tsx` and `WaiverPage.tsx` still inline the function. | `apps/web/src/api/normalize-api-base.ts` + 2 inline copies | Import the shared helper (or refactor both pages to use `api.*` and drop `API_BASE` entirely). |
| Q-04 | **`packages/shared/dist/` tracked in git** — same root cause as S-07, listed here because the impact is also build-hygiene (CI caches, PR noise). | `.gitignore` | Same fix. |
| Q-05 | **Walk-in staff alert HTML built inline in the route.** V8 Q-05 unchanged — overlaps S-01. Two inline HTML builders (walk-in route + online direct use-case) should both live in `services/email.ts`. | `apps/api/src/routes/orders-raw.ts` ~L461–504; `apps/api/src/use-cases/booking/submit-direct-booking.ts` ~L316–380 | Promote to named template functions in `services/email.ts`; resolves S-01 in the same change. |
| Q-06 | **`process-raw-order.ts` hardcodes `'CHARITY-PAYABLE'` and duplicates the charity-posting logic from `orders-raw.ts` walk-in-direct.** Two sources of truth for a business rule. | `apps/api/src/use-cases/orders/process-raw-order.ts` ~L309–332; `apps/api/src/routes/orders-raw.ts` ~L383–411 | Extract `postCharityJournal({ orderId, amount, storeId, receivableAccountId }, { accountingPort, configRepo })` — resolves Q-06 and S-04 together. |
| Q-07 | **TypeScript strict mode not enabled.** Product owner flagged as known; not re-audited. Pre-existing errors in fleet/cashup modals block the flag. | `tsconfig.base.json`; modal components | Post-launch: fix underlying types, enable `"strict": true` incrementally per package. |

---

## Section 5 — Production Readiness

### 🔴 Blockers — Must Fix Before Any Real Usage

| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| B-1 | Centralize the **walk-in** and **online-direct staff alert** emails into `services/email.ts` and route every user/DB string through `escapeHtml()` (completes V8 S-01 for the inline paths). | S-01, Q-05 | 0.5 day |
| B-2 | Eliminate duplicate transfer rows on online bookings: either link the existing transfer in `process-raw-order` instead of creating a second one, or move creation fully to activation (pick one creator, persist `transfer_pax_count` + `transfer_amount` on `orders_raw.payload`, and add a DB uniqueness guard). | F-01, F-02 | 0.5–1 day |

### 🟡 Important — Fix Within First Week of Launch

| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| I-1 | Replace `SELECT *` on staff-side `orders_raw` list/detail with explicit columns. | S-02 | 0.25 day |
| I-2 | Add a per-IP rate limiter to `/public/transfer-booking` and `/public/public-transfer-booking`. | S-03 | 0.25 day |
| I-3 | Require non-null `contactNumber` on `PublicBookingSchema`. | F-04 | 0.1 day |
| I-4 | Set `min={todayManilaISO}` on token-based `PublicBookingPage` service date. | F-05 | 0.1 day |
| I-5 | Extract shared helpers in `public-extend.ts` (reduce 836-line duplication). | Q-01 | 1–2 days |
| I-6 | Port inclusions list + trust elements (reviews, donation counter) onto `/book/reserve`. | F-07 | 0.5 day |
| I-7 | Add `<SEO>` (with `noIndex` on transactional pages) to the remaining customer routes. | W-03 | 0.5–1 day |
| I-8 | Add `/peace-of-mind`, `/refund-policy`, `/paw-card/partners`, `/book/paw-card` to `sitemap.xml`. | W-02 | 0.1 day |
| I-9 | Add `packages/shared/dist/` (and `packages/*/dist/`) to `.gitignore` and purge from the index. | S-07, Q-04 | 0.1 day |
| I-10 | Ship pickup-time column + "Notify driver" email from the Transfers page. | F-03 | 1 day |

### 🟢 Nice to Have — Can Operate Without These

| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| N-1 | Reject zero-amount raw collect-payment amounts. | S-05 | 0.1 day |
| N-2 | Resolve charity-payable account from `chart_of_accounts`, not a hardcoded id; extract `postCharityJournal()`. | S-04, Q-06 | 0.25 day |
| N-3 | Rotate/expire cancellation tokens on first successful cancel. | S-06 | 0.25 day |
| N-4 | Move `TransferBookingPage` and `WaiverPage` onto the shared `api` client. | F-06, Q-03 | 0.25 day |
| N-5 | Add ₱5,000 preset to donation ticker + standalone "Donate ₱5,000" on BePawsitive. | W-01 | 0.25 day |
| N-6 | Accommodation column on Transfers page for GL→IAO routes. | product owner list | 0.25 day |
| N-7 | Fix horizontal scroll on operations pages for mobile. | W-05 | 0.5–1 day |
| N-8 | Gradually rebrand `OrderDetailModal` to design tokens. | W-04 | 1–2 days |
| N-9 | Split `OrderDetailModal` into smaller components + hooks. | Q-02 | 2–3 days |
| N-10 | Enable TypeScript `strict` incrementally; fix pre-existing errors in fleet/cashup modals. | Q-07 | 1–3 days |
| N-11 | Resolve Maya K004 with Maya support and re-enable card checkout (remove "coming soon" notice). | owner-tracked | external |

---

## Regression & Fix Verification (V8 → V9)

| V8 Item | Outcome in V9 | Evidence |
|---|---|---|
| S-01 HTML injection (email templates) | **Partial** — `services/email.ts` fully escapes (71 call sites); inline staff alerts in `orders-raw.ts` + `submit-direct-booking.ts` still raw | See S-01 above |
| S-02 Rate limits on `/extend` | **Fixed** — `extendLookupLimiter` + `extendConfirmLimiter` applied to lookup/preview/confirm | `routes/public-extend.ts` L21–35, L51/185/344 |
| S-03 `SELECT *` on public order lookup | **Fixed** — explicit columns in `public-booking.ts` L437 | — |
| S-04 Zero-amount raw payment | **Not fixed** | `orders-raw.ts` L715 |
| S-05 Hardcoded `CHARITY-PAYABLE` | **Not fixed** | `orders-raw.ts` L398, `process-raw-order.ts` L323 |
| F-01 Standalone transfer email | **Fixed** — `emailTo = req.body.customerEmail` | `public-transfers.ts` L116, L205 |
| F-02 SPA 404 route | **Fixed** — `NotFoundPage` + `<Route path="*" …>` | `router.tsx` L49, L132 |
| F-03 Past service date on token page | **Not fixed** | — |
| F-04 Raw `fetch` on TransferBookingPage | **Not fixed** | `TransferBookingPage.tsx` L205 |
| F-05 Nullable `contactNumber` | **Not fixed** | `public-transfers.ts` L23 |
| W-01 Blue loading spinner | **Fixed** — `border-teal-brand` | `router.tsx` L65 |
| W-02 SEO coverage | **Partial** — HomePage/BrowseBook/TransferBooking have `<SEO>`; other customer pages do not | Surveyed |
| W-03 Sitemap | **Not fixed** | `public/sitemap.xml` |
| W-04 OrderDetailModal branding | **Not fixed** | 21 generic blue/gray tokens remain |
| Q-01 `public-extend.ts` | **Partial** — 940 → 836 lines, structure unchanged | — |
| Q-02 `OrderDetailModal` size | **Partial** — 1,450 → 1,362 lines | — |

### Product-owner fix list (post-V8) — confirmed in code

| Claim | Verified |
|---|---|
| Migrations 070 / 071 / 072 applied | ✅ present with correct content |
| `escapeHtml()` across 9 email templates (69 call sites) | ✅ 71 call sites in `services/email.ts` (including new `transferBookingConfirmationHtml`, `inspectionLogHtml`, `maintenanceLogHtml`) |
| `order-repo.save()` INSERT/UPDATE split | ✅ `adapters/supabase/order-repo.ts` L175–208 |
| `webQuoteRaw` includes transfer + charity | ✅ `submit-direct-booking.ts` L132–141 |
| `BasketPage` removes double location-fee | ✅ `serverTotal` used when > 0; no double-add |
| Transfer created immediately on booking | ✅ `submit-direct-booking.ts` L183–216 (but see F-01 — now creates duplicates) |
| `transferPaxCount` passed through | ✅ `basket/BasketPage.tsx` L489; schema L81 — but **not** persisted on `orders_raw.payload` (see F-02) |
| Payment records on walk-in activation | ✅ `orders-raw.ts` L343–379 |
| Walk-in `vehicle_model_id` error fix | ✅ `WalkInBookingModal.tsx` L312–313 passes `vehicleModelId` |
| `Est. 2019 → Est. 2023` | ✅ zero occurrences of "Est. 2019" anywhere |
| GCash instructions in confirmation email | ✅ `services/email.ts` L235–255 |
| Helmet count + transfer arrival time in inbox modal | ✅ `BookingModal.tsx` L825–841 |
| Transfer amount in pricing breakdown | ✅ `OrderSummaryPanel.tsx` L159; `services/email.ts` L128–134 |
| Transfer price in `RentalSummaryCard` | ✅ `RentalSummaryCard.tsx` L107–110 |
| `AnimatedHeading` replaces `VariableProximity` on pages | ✅ pages import `AnimatedHeading`; component still exists but unused on pages |
| Hero headline conversion copy | ✅ "Siargao's #1 Trusted Rental" / "Book in 2 Minutes" |
| Card + bank transfer hidden in customer checkout | ✅ `BasketPage.tsx` L385–390 |
| "Card payments coming soon" notice | ✅ `OrderSummaryPanel.tsx` L237 |
| Transfer section UX (toggle logic) | ✅ `TransferSection.tsx` L147 (click selected → null; unselected → `selectGroup`) |
| PawCardPartnersPage top-10 mobile scroll | (visual) — not code-verifiable; take product owner's word |

---

*End of Audit Report V9*
