# Lola's Rentals & Tours — Pre-Deployment Audit Report V8

| Field | Value |
|-------|-------|
| **Audit date** | 15 April 2026 |
| **Follows** | Audit V7 (12 April 2026) |
| **Overall readiness score** | 7.5 / 10 |

## Executive Summary

This report (Audit V8) reviews the Lola's Rentals & Tours platform after the fixes and migrations completed since Audit V7 (12 April 2026). The codebase has materially improved: migration chain 060–069 hardens RLS and schema consistency; atomic RPCs (`activate_order_atomic`, `cancel_order_raw_atomic`, `confirm_extend_*`) reduce partial-failure states; Money arithmetic uses integer centavos; public booking cancellation is token-authenticated; inspection results RLS is store-scoped; customer-facing flows have been rebranded and SEO (react-helmet-async, meta tags, Schema.org, sitemap, robots.txt) is in place.

**Production posture:** The core journey—browse, basket, submit, confirmation, waiver, extend, staff activation/settlement—is coherent and better protected than in V7. **Two items are treated as launch blockers:** (1) user-supplied values interpolated into HTML email templates without escaping (HTML injection risk in outbound mail), and (2) the standalone public transfer booking path (`/public/public-transfer-booking`) never sends a confirmation email because the recipient is hardcoded to `null`. Remaining issues are mostly medium-effort hardening (rate limits on extend endpoints, explicit column selection on public order lookup, 404 handling, date validation on token transfer booking) and tech debt (very large `public-extend.ts` and `OrderDetailModal.tsx`, duplicate API-base logic).

**Known exclusions (per product owner — not re-audited here):** Maya checkout K004 / endpoint with Maya support; domain/email migration; pre-existing TypeScript errors in fleet/cashup modals; broader DB transaction gap (audit C2) for three operations.

---

## Section 1 — Security Audit
| # | Severity | Finding | File / Line | Recommended Fix |
|---|----------|---------|-------------|-----------------|
| S-01 | **HIGH** | **HTML injection in email templates.** Walk-in-direct and staff/cancel email paths interpolate user-supplied values (`customerName`, `vehicleName`, `orderReference`, etc.) directly into HTML template literals with no escaping. A malicious customer name or similar field could inject arbitrary HTML (e.g. `<img onerror=…>`, phishing markup) into emails sent to customers or staff. | `apps/api/src/routes/orders-raw.ts` (e.g. walk-in staff alert HTML ~L428–469; cancel path uses `bookingCancellationHtml` with structured data — review all string-built HTML); `apps/api/src/routes/public-booking.ts` (~L317–331 cancellation email via `bookingCancellationHtml` — verify template and all callers escape user content). | Introduce a shared `escapeHtml()` (or use a safe templating layer) and apply it to **every** user- or DB-sourced string embedded in HTML email bodies. Audit `services/email.ts` helpers to ensure they escape or use text-only alternatives where appropriate. |
| S-02 | **MEDIUM** | **No rate limiting on public extend endpoints.** `POST /extend/lookup`, `GET /extend/preview`, and `POST /extend/confirm` perform multiple sequential database queries per request without throttling. This enables abuse for resource exhaustion or email-trigger amplification. | `apps/api/src/routes/public-extend.ts` (lookup ~L34; preview ~L168; confirm ~L327) | Add `express-rate-limit` middleware consistent with `public-booking.ts` (e.g. stricter limits on `confirm`, moderate on `lookup`/`preview`), with `limit:` (v8 API) and draft-7 headers if used elsewhere. |
| S-03 | **MEDIUM** | **Public order lookup uses `SELECT *` on `orders_raw`.** The handler selects all columns then projects a subset in JSON. Any future logging, error dumps, or accidental exposure could widen the blast radius if the table gains sensitive columns. | `apps/api/src/routes/public-booking.ts` ~L431–433 (`.select('*')`) | Replace with an explicit `.select('col1, col2, …')` listing only fields required for the masked response (`order_reference`, `customer_email`, `customer_name`, `pickup_datetime`, `dropoff_datetime`, `vehicle_model_id`, `store_id`, `pickup_location_id`, `dropoff_location_id`, `addon_ids`, `transfer_type`, `flight_number`, `transfer_route`, `charity_donation`, `booking_channel`, etc.). |
| S-04 | **LOW** | **Zero-amount payments allowed on raw-order collect-payment.** Body schema uses `z.number().min(0)` for `amount`, allowing `0` to create a payment row (and potentially card settlement flow edge cases). | `apps/api/src/routes/orders-raw.ts` ~L679–680 (`collectPaymentSchema`) | Use `z.number().positive()` or `z.number().min(0.01)` unless a documented business case exists for exact zero. |
| S-05 | **LOW** | **Hardcoded charity ledger account id `'CHARITY-PAYABLE'`.** Walk-in-direct posts a charity journal via `accountingPort` using a string literal that may not exist in `chart_of_accounts`; failures are caught and logged as non-fatal, which can silently drop charity accrual. | `apps/api/src/routes/orders-raw.ts` ~L347–372 (`CHARITY-PAYABLE`) | Resolve the charity payable account from configuration or `chart_of_accounts` (same pattern as `resolveStoreAccounts`), and fail loudly in non-production or surface metrics if posting fails. |

---

## Section 2 — Functional Gaps & Bug Audit
| # | Severity | Finding | File / Line | Impact |
|---|----------|---------|-------------|--------|
| F-01 | **HIGH** | **Standalone transfer booking never sends confirmation email.** In `POST /public/public-transfer-booking`, the fire-and-forget email block sets `const emailTo = null as string \| null` and returns immediately, so no email is ever sent regardless of customer data. The UI (`TransferBookingPage`) collects contact details but the schema may not surface email to this path consistently. | `apps/api/src/routes/public-transfers.ts` ~L191–213 | Customers using the main site transfer flow get **no automated confirmation email**, increasing support load and reducing trust. Fix by passing through `customerEmail` from the validated body (if added to schema) or another agreed channel (SMS/WhatsApp template). |
| F-02 | **MEDIUM** | **No application-level 404 route.** React Router has no `path="*"` fallback; unknown URLs under the SPA may render a blank content area with no branded error page. | `apps/web/src/router.tsx` (no catch-all route) | Poor UX for mistyped links; bad for perceived quality and may confuse crawlers on odd paths. Add a `NotFoundPage` or redirect to `/book`. |
| F-03 | **MEDIUM** | **Token-based public transfer page allows past service dates.** The service date `<input type="date">` has no `min` attribute tied to “today”, so users can submit historical dates. | `apps/web/src/pages/transfers/PublicBookingPage.tsx` ~L179–186 | Operations may receive nonsensical bookings; reconciliation and driver scheduling confusion. Set `min={todayISO}` in Manila or UTC per business rule. |
| F-04 | **LOW** | **TransferBookingPage uses raw `fetch()` instead of shared API client.** Bypasses centralized base URL handling, error parsing, and any future interceptors. | `apps/web/src/pages/TransferBookingPage.tsx` ~L203 (`fetch(\`${API_BASE}/public/public-transfer-booking\`)`) | Inconsistent error UX; duplicate `normalizeApiBase` logic; harder to maintain. Refactor to `api.post(...)`. |
| F-05 | **LOW** | **API allows nullable `contactNumber` for token-based transfer booking while UI requires it.** Zod schema permits `null` for `contactNumber`; crafted requests could omit phone. | `apps/api/src/routes/public-transfers.ts` `PublicBookingSchema` ~L23 | Minor integrity gap between UI and API; support may lack contact info. Align schema with product rule: `z.string().min(1)` if phone is mandatory. |

---

## Section 3 — Customer Website Audit
| # | Finding | File / Line | Recommended Fix |
|---|---------|-------------|-----------------|
| W-01 | **Global lazy-route loading spinner uses generic Tailwind blue (`border-blue-600`), not brand tokens.** First paint during code-split loading contradicts the teal/gold/sand design system. | `apps/web/src/router.tsx` ~L62–65 (`Loading` component) | Replace with `border-teal-brand` (or gold) to match `PageLayout` and public pages. |
| W-02 | **SEO `<SEO>` component not applied to several customer routes.** Pages such as basket, confirmation, extend, paw-card, partners, waiver-agreement, privacy, refund-policy, peace-of-mind, and cancel lack per-route titles/canonicals/noindex as appropriate. | `apps/web/src/pages/basket/BasketPage.tsx`, `confirmation/`, `extend/`, `paw-card/`, `waiver/`, `legal/`, `peace-of-mind/`, `cancel/`, etc. | Add `<SEO>`: use `noIndex` for transactional/sensitive flows (basket, cancel, waiver signing); add full metadata + canonical for indexable content (privacy, refund-policy, peace-of-mind, paw-card). Update `sitemap.xml` when adding indexable URLs. |
| W-03 | **Sitemap omits some public marketing/legal routes.** `/peace-of-mind` and `/refund-policy` are customer-facing but not listed in `sitemap.xml` (only `/book/*` subset is present). | `apps/web/public/sitemap.xml` | Add `<url>` entries with appropriate `changefreq`/`priority` (e.g. monthly, priority ~0.5). |
| W-04 | **Order detail modal (backoffice) remains heavy on generic gray/blue Tailwind.** Tabs, buttons, and panels use `blue-600`, `gray-50`, etc., unlike newer branded components. | `apps/web/src/components/orders/OrderDetailModal.tsx` (throughout, e.g. tab buttons ~L509–515, collect payment ~L720–763) | Progressive refactor to `teal-brand`, `charcoal-brand`, `sand-brand` for consistency with the rest of the staff UI. Low priority for launch if staff accept current UI. |

---

## Section 4 — Code Quality & Tech Debt
| # | Finding | File / Line | Impact |
|---|---------|-------------|--------|
| Q-01 | **`public-extend.ts` is ~940 lines with four near-duplicate branches** (public vs staff × raw order vs active order). Logic for availability, quoting, RPC args, and email is repeated, increasing bug risk when one path is patched and others are not. | `apps/api/src/routes/public-extend.ts` (entire file; staff router from ~L632) | Higher maintenance cost; regression risk on extend flows. Extract shared helpers (e.g. `resolveExtensionForRaw`, `resolveExtensionForActive`, shared email sender). |
| Q-02 | **`OrderDetailModal.tsx` is ~1,450 lines** — single component owns summary, payments, vehicles, addons, history, Maya modal, inspection portal, extend modal, and multiple forms. | `apps/web/src/components/orders/OrderDetailModal.tsx` | Hard to test, review, and onboard; slow IDE performance. Split into tab subcomponents and custom hooks (`useOrderPayments`, `useAddonEdits`, etc.). |
| Q-03 | **Dead / unreachable email block in `public-transfer-booking`.** `emailTo` is always `null`, making the following `sendEmail` call unreachable dead code. | `apps/api/src/routes/public-transfers.ts` ~L191–213 | Confuses readers; hides the F-01 bug. Remove or fix in same change as enabling email. |
| Q-04 | **Duplicate API base URL normalization** in `TransferBookingPage` vs centralized client. | `apps/web/src/pages/TransferBookingPage.tsx` ~L108–115 (`normalizeApiBase`, `API_BASE`) | DRY violation; risk of drift from `api/client` behavior. |
| Q-05 | **Walk-in staff notification email built with inline HTML template literals** mixing presentation and data, overlapping S-01 (escaping) and making reuse difficult. | `apps/api/src/routes/orders-raw.ts` ~L424–469 | Should move to `services/email.ts` as a named template function with escaped interpolations. |

---

## Section 5 — Production Readiness

### 🔴 Blockers — Must Fix Before Any Real Usage
| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| B-1 | Escape or sanitize all user/DB strings in HTML emails (HTML injection in outbound mail). | S-01 | 0.5–1.5 days (audit all templates + one utility + tests) |
| B-2 | Fix standalone transfer booking confirmation email (`emailTo` null / schema + send path). | F-01, Q-03 | 0.25–0.5 days |

### 🟡 Important — Fix Within First Week of Launch
| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| I-1 | Rate limit public extend endpoints (lookup, preview, confirm). | S-02 | 0.25 day |
| I-2 | Replace `SELECT *` with explicit columns on public order lookup. | S-03 | 0.25 day |
| I-3 | Add SPA404 / catch-all route with branded page or redirect. | F-02 | 0.25 day |
| I-4 | Prevent past service dates on token-based `PublicBookingPage`. | F-03 | 0.1 day |
| I-5 | Replace global `border-blue-600` loading spinner with brand token. | W-01 | 0.1 day |
| I-6 | Refactor `public-extend.ts` to shared helpers (reduce duplication). | Q-01 | 1–2 days |

### 🟢 Nice to Have — Can Operate Without These
| # | Item | Ref | Est. Effort |
|---|------|-----|-------------|
| N-1 | Reject zero-amount raw collect-payment amounts. | S-04 | 0.1 day |
| N-2 | Resolve charity payable account from chart of accounts, not hardcoded id. | S-05 | 0.25 day |
| N-3 | Use `api.post` on `TransferBookingPage` instead of raw `fetch`. | F-04, Q-04 | 0.25 day |
| N-4 | Require `contactNumber` in API schema if business requires it. | F-05 | 0.1 day |
| N-5 | Extend SEO coverage to remaining customer pages (incl. noIndex). | W-02 | 0.5–1 day |
| N-6 | Add peace-of-mind and refund-policy to `sitemap.xml`. | W-03 | 0.1 day |
| N-7 | Gradually rebrand `OrderDetailModal` to design tokens. | W-04 | 1–2 days |
| N-8 | Split `OrderDetailModal` into smaller components. | Q-02 | 2–3 days |
| N-9 | Centralize walk-in staff email HTML in `email` service. | Q-05 | 0.25 day |

---
*End of Audit Report V8*
