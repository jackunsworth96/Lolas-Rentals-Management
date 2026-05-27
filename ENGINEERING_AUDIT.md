# Engineering Audit

Date: 2026-05-18

Scope: Static review of the Lola's Rentals Management monorepo, with focused inspection of frontend, API, database migrations, integrations, security posture, and deployment readiness.

No source code changes were made as part of this audit.

## Executive Summary

This is a rental management monorepo for Lola's Rentals. It includes a React/Vite customer and backoffice frontend, an Express/Supabase API, shared domain packages, and integrations for Maya payments, Resend email, Telegram, Anthropic chat, Sentry, Supabase storage/realtime, and scheduled jobs.

The highest-risk issues are operational rather than cosmetic:

- The Maya checkout flow is broken for both public customer payment and staff-generated payment links.
- Several high-value API routes rely on UI-side filtering or broad permissions while the backend uses Supabase service-role access.
- Booking, payment, webhook, and cron flows need stronger transactional and idempotency guarantees.
- Deployment/security automation is incomplete, and dependency audit currently reports production vulnerabilities.

Build and test verification could not be completed in this checkout because dependencies are not installed locally. `npm test` failed with `vitest: command not found`, and `npm run build` failed with `tsc: command not found`.

`npm audit --omit=dev` reported 10 production vulnerabilities: 5 high and 5 moderate.

## Project Overview

### What The App Appears To Do

The app supports customer-facing rental booking plus internal operations for Lola's Rentals.

Major product areas include:

- Customer booking and basket flow.
- Public booking holds, direct booking submission, waivers, and extensions.
- Backoffice orders inbox, active orders, completed orders, and raw booking processing.
- Fleet, vehicle models, asset register, maintenance, transfers, and availability.
- Accounting, payments, cashup, card settlements, budgets, expenses, payroll, HR, and timesheets.
- Customers, partners, Paw Card, analytics, settings, UI error reporting, and dev tooling.

### Main Tech Stack

- Monorepo package manager: npm workspaces.
- Frontend: React 19, Vite, React Router, React Query, Zustand, Tailwind, Framer Motion.
- Backend: Express 5, TypeScript, Zod, Supabase service-role client, Pino, Helmet, CORS, node-cron.
- Database/storage: Supabase Postgres, Supabase storage, Supabase realtime.
- Integrations: Maya payments, Resend, Telegram, Anthropic, Sentry, Cloudinary, Google APIs, Aerodatabox.
- Testing/build tooling: Vitest, TypeScript, tsx, Vite.

### Key Modules And Data Flows

- Login: `apps/api/src/routes/auth.ts` authenticates by username/PIN, loads role permissions and store IDs, and issues a JWT. The web app stores the token in `apps/web/src/stores/auth-store.ts`.
- API client: `apps/web/src/api/client.ts` expects every API response to use `{ success, data, error }`.
- Public booking: `apps/web/src/pages/basket/BasketPage.tsx` calls public booking endpoints. The backend uses `apps/api/src/use-cases/booking/create-hold.ts` and `apps/api/src/use-cases/booking/submit-direct-booking.ts`.
- Payments: Maya checkout and webhook logic live in `apps/api/src/routes/maya.ts`. Staff payment and accounting writes use atomic SQL/RPC helpers in other payment routes.
- Waivers/uploads: public waiver and Paw Card uploads use Supabase storage from `apps/api/src/routes/public-waiver.ts` and `apps/api/src/routes/paw-card.ts`.
- Cron jobs: scheduled jobs are started from `apps/api/src/server.ts` when the API process starts.

## Architecture Review

### Folder Structure

The repository has a sensible high-level structure:

- `apps/api`: Express API, routes, adapters, jobs, services, middleware.
- `apps/web`: React/Vite app, pages, components, API client, stores.
- `packages/domain`: domain logic and shared business types.
- `packages/shared`: constants, schemas, and shared utilities.
- `supabase/migrations`: SQL migrations.
- `.github/workflows`: automation, currently focused on security audit.

The folder structure is workable, but responsibility boundaries are inconsistent inside the API. Some flows use use-cases and adapters, while many large route files directly query Supabase and implement business logic inline.

### Separation Of Concerns

Strengths:

- Public booking has some use-case/adaptor separation.
- Auth middleware and permission constants are centralized.
- Frontend API access is centralized through a shared client.

Weaknesses:

- Several route files mix request parsing, authorization, query building, business logic, and response formatting.
- Very large frontend components and API routes make behavioral review difficult.
- `packages/shared` contains schemas that appear stale relative to current API payloads.

### Frontend/Backend Boundaries

The HTTP boundary is clear, but authorization is not consistently enforced on the backend. The frontend hides routes and sidebar items based on permissions, but backend routes must be treated as the source of truth because users can call APIs directly.

### State Management

Frontend state is mostly straightforward:

- React Query for server state.
- Zustand for auth state.
- JWT persisted in localStorage.

The localStorage token approach is simple, but it increases the impact of any XSS issue. If the app handles sensitive operational data long term, moving toward httpOnly cookies or stronger session handling should be considered.

### API Design

Most endpoints use a standard `{ success, data, error }` response shape, but not all. The Maya checkout endpoint returns raw JSON, which breaks the shared frontend API client.

Rate limiting is present for auth, public routes, chat, and API traffic. This is good, but public paid integrations need more than IP rate limiting.

### Database/Data Access Design

The API uses the Supabase service-role key, which bypasses RLS. That can be acceptable for a trusted backend, but it means every route must enforce authorization and store scoping explicitly.

Critical business operations are not always transactional enough:

- Booking holds and order creation are separate operations.
- Maya webhook status updates and payment inserts are separate operations.
- Cron email logs do not consistently enforce uniqueness.

### Third-Party Integrations

The app integrates with several third-party systems:

- Supabase: database, storage, realtime.
- Maya: online payments.
- Resend: email.
- Telegram: notifications.
- Anthropic: public chat.
- Sentry: monitoring.
- Cloudinary: frontend-hosted images.
- Google APIs/scripts: sheets or operational workflows.

The integrations are useful but need tighter production environment validation and abuse/error handling.

## Findings By Severity

## Critical

### 1. Maya Checkout Is Broken For Public Customers And Staff Payment Links

- Severity: Critical
- Files/functions:
  - `apps/api/src/routes/maya.ts`, `router.post('/checkout', authenticate, ...)`
  - `apps/web/src/pages/basket/BasketPage.tsx`, `proceedToMayaPayment`
  - `apps/web/src/api/client.ts`, `request`
  - `apps/web/src/api/orders.ts`, `createMayaCheckout`
- What is wrong:
  - The customer basket calls `POST /payments/maya/checkout` without an auth token.
  - The API route requires `authenticate`.
  - The same route returns raw `{ checkoutId, redirectUrl }`, but the shared frontend client expects `{ success: true, data }`.
- Why it matters:
  - Public Maya customer payment cannot work as written.
  - Staff payment modal usage can also throw `Request failed` because the response shape does not match the API client contract.
  - The basket currently catches the failure and falls back to confirmation, which can hide the broken payment path.
- Recommended fix:
  - Add a dedicated public Maya checkout endpoint for public bookings, using a secure booking/order reference and server-side amount recomputation.
  - Keep staff checkout authenticated.
  - Return the standard API envelope for authenticated staff checkout.
  - Do not simply remove `authenticate` from the existing route, because the request accepts `orderId` and `amountPHP`.
- Fix effort: Moderate.

### 2. Maya Webhook Settlement Is Not Safely Idempotent

- Severity: Critical
- Files/functions:
  - `apps/api/src/routes/maya.ts`, webhook handler
  - `supabase/migrations/004_payments_and_accounting.sql`, `payments` table
- What is wrong:
  - The webhook handler fetches checkout state, checks whether it is already paid, updates status, then inserts payment/accounting records as separate operations.
  - The `payments` table does not enforce uniqueness for gateway settlement references.
- Why it matters:
  - Duplicate or concurrent webhooks can double-record payments and journal entries.
  - Payment webhooks are commonly retried by gateways, so this must be safe by design.
- Recommended fix:
  - Move webhook settlement into one SQL RPC or transaction.
  - Use an atomic `UPDATE ... WHERE checkout_id = ? AND status = 'pending' RETURNING ...`.
  - Insert payment/journal records only when the atomic update returns a row.
  - Add a unique index for non-null gateway settlement references, such as `payments(settlement_ref)`.
- Fix effort: Moderate.

## High

### 3. Backend Store Authorization Is Inconsistent While Using Supabase Service Role

- Severity: High
- Files/functions:
  - `apps/api/src/adapters/supabase/client.ts`, service-role Supabase client
  - `apps/api/src/routes/fleet.ts`, fleet listing/filtering
  - `apps/api/src/routes/accounting.ts`, dashboard/account ledger routes
  - `apps/api/src/routes/customers.ts`, customer list/detail/update routes
  - `apps/api/src/routes/dashboard.ts`, dashboard summary routes
- What is wrong:
  - The backend uses `SUPABASE_SERVICE_ROLE_KEY`, bypassing RLS.
  - Several routes accept arbitrary `storeId` or `all` without consistently checking `req.user.storeIds`.
  - Some routes are only protected by broad authentication or broad permissions.
- Why it matters:
  - A user with a narrow store assignment may be able to view or modify cross-store data through direct API calls.
  - UI hiding is not a security boundary.
- Recommended fix:
  - Add a shared `requireStoreAccess(req, storeId)` helper.
  - Apply it to every service-role route that reads or writes store-scoped data.
  - Treat `storeId=all` as "all stores assigned to this user" unless an explicit company-wide permission is present.
- Fix effort: Moderate.

### 4. Public Direct Booking Rollback Token Is Omitted

- Severity: High
- Files/functions:
  - `apps/api/src/use-cases/booking/submit-direct-booking.ts`, returned `cancellationToken`
  - `apps/api/src/routes/public-booking.ts`, submit response
  - `apps/web/src/pages/basket/BasketPage.tsx`, rollback call
- What is wrong:
  - The use case returns a cancellation token.
  - The public booking route does not include it in the response.
  - The frontend expects it for rollback during multi-vehicle booking failure.
- Why it matters:
  - If a multi-vehicle customer booking partially succeeds and then fails, cleanup can fail and leave orphaned raw orders.
- Recommended fix:
  - Quick fix: include `cancellationToken` in the public booking submit response.
  - Better fix: move multi-vehicle direct booking into one server-side batch operation with transaction-like behavior.
- Fix effort: Quick for token return, moderate for proper batch booking.

### 5. Booking Holds And Order Activation Can Race

- Severity: High
- Files/functions:
  - `apps/api/src/use-cases/booking/create-hold.ts`
  - `apps/api/src/adapters/supabase/booking-adapter.ts`, `insertHold`
  - `apps/api/src/use-cases/booking/submit-direct-booking.ts`
  - `supabase/migrations/099_fix_activate_order_atomic_addons.sql`
- What is wrong:
  - Availability checks and hold insertion are separate operations.
  - Hold consumption, raw order insertion, and hold deletion are separate operations.
  - Order activation and fleet assignment do not appear to use a strong overlap/capacity lock.
- Why it matters:
  - Concurrent bookings can oversell a model or create conflicting inventory assignments.
  - This risk increases under real customer traffic or staff processing multiple orders at once.
- Recommended fix:
  - Perform hold creation and hold consumption inside database transactions/RPCs.
  - Use advisory locks or capacity locks keyed by store/model/time bucket.
  - Re-check availability inside the transaction.
  - Add indexes/constraints that support conflict detection.
- Fix effort: Risky.

### 6. Destructive Dev Tools Are Mounted Without A Production Guard

- Severity: High
- Files/functions:
  - `apps/api/src/routes/dev-tools.ts`, reset endpoints
- What is wrong:
  - Data reset endpoints are mounted behind ordinary app permissions.
  - There is no clear `NODE_ENV !== 'production'` guard or explicit production opt-in.
- Why it matters:
  - A compromised or misconfigured privileged account could trigger destructive changes against production data.
- Recommended fix:
  - Disable this router in production by default.
  - Require an explicit environment flag for non-local use.
  - Add audit logging and stronger confirmation requirements if these tools are ever enabled outside local development.
- Fix effort: Quick.

## Medium

### 7. Production Dependency Vulnerabilities Are Present

- Severity: Medium
- Files/functions:
  - `package.json`
  - `package-lock.json`
  - `.github/workflows/security-audit.yml`
- What is wrong:
  - `npm audit --omit=dev` reported 10 production vulnerabilities: 5 high and 5 moderate.
  - Affected advisory areas include `vite`, `tar`, `path-to-regexp`, `picomatch`, `postcss`, `uuid`, and the `express-rate-limit` dependency chain.
- Why it matters:
  - Known vulnerabilities remain in production dependency paths.
  - Current security automation does not appear to fail the full monorepo build on these issues.
- Recommended fix:
  - Update affected packages.
  - Run production audit at the monorepo root/workspace level.
  - Make CI fail at high severity or above.
- Fix effort: Moderate.

### 8. CI/CD Readiness Is Incomplete

- Severity: Medium
- Files/functions:
  - `.github/workflows/security-audit.yml`
  - root `package.json`
- What is wrong:
  - The visible workflow focuses on security audit.
  - A full build/test/typecheck CI gate was not evident during review.
  - Local build/test could not run because dependencies were absent.
- Why it matters:
  - Broken TypeScript, stale contracts, and frontend/API integration failures can reach deployment.
- Recommended fix:
  - Add CI jobs for `npm ci`, build, typecheck, test, and production dependency audit.
  - Run these at the repo root so workspaces are covered.
- Fix effort: Moderate.

### 9. Route Permissions Do Not Fully Match The Permission Model

- Severity: Medium
- Files/functions:
  - `packages/shared/src/constants/permissions.ts`
  - `apps/api/src/routes/orders.ts`
  - `apps/web/src/router.tsx`
- What is wrong:
  - The shared permission model has granular permissions such as active/completed/dashboard/fleet views.
  - Several backend routes use broader permissions or only authenticated access.
  - Most frontend routes are guarded only by login state.
- Why it matters:
  - Users may access routes or APIs directly even when the navigation UI hides them.
- Recommended fix:
  - Enforce page/action-level permissions in both frontend route guards and backend route handlers.
  - Use backend checks as the source of truth.
- Fix effort: Moderate.

### 10. Upload Endpoints Trust MIME And Filename Too Much

- Severity: Medium
- Files/functions:
  - `apps/api/src/routes/public-waiver.ts`
  - `apps/api/src/routes/paw-card.ts`
- What is wrong:
  - Upload validation relies heavily on client-provided MIME type and original filename extension.
  - Public waiver upload is accessible by order reference without a stronger upload token or ownership proof.
- Why it matters:
  - File spoofing, metadata leakage, or unauthorized document attachment are possible.
- Recommended fix:
  - Validate magic bytes with a file inspection library.
  - Normalize and re-encode images where practical.
  - Strip metadata.
  - Store private files and serve short-lived signed URLs.
  - Require an order-specific upload token or additional customer verification.
- Fix effort: Moderate.

### 11. Public AI Chat Can Consume Paid API Quota

- Severity: Medium
- Files/functions:
  - `apps/api/src/routes/chat.ts`
- What is wrong:
  - Public unauthenticated chat can call Anthropic with only IP-based rate limiting.
- Why it matters:
  - Abuse can create direct cost and operational noise.
  - IP-only limits are weak against distributed or mobile-network traffic.
- Recommended fix:
  - Add per-session budgets.
  - Add bot friction such as Turnstile or similar.
  - Log usage and alerts.
  - Confirm transcript retention requirements.
- Fix effort: Moderate.

### 12. Environment And Deployment Configuration Are Incomplete

- Severity: Medium
- Files/functions:
  - `apps/api/src/server.ts`
  - `apps/api/.env.example`
  - `vercel.json`
  - `apps/api/src/services/email.ts`
- What is wrong:
  - The root project lacks a clear deployment runbook.
  - `vercel.json` rewrites API calls to a hardcoded Render URL.
  - Environment examples appear incomplete for Maya, webhook, CORS, email, and production URL settings.
  - Some integrations silently skip behavior when env vars are missing.
- Why it matters:
  - Production deployments are easy to misconfigure and hard to reproduce.
- Recommended fix:
  - Add a deployment README/runbook.
  - Complete env templates.
  - Fail fast in production for required integrations.
  - Parameterize frontend API destination instead of hardcoding it in `vercel.json`.
- Fix effort: Quick to moderate.

### 13. Important Test Coverage Is Missing

- Severity: Medium
- Files/functions:
  - `apps/api/__tests__/api.integration.test.ts`
  - payment, booking, store scoping, webhook, and public flow modules
- What is wrong:
  - Existing tests appear mostly focused on auth smoke and domain behavior.
  - Critical flows lack focused tests: Maya checkout, Maya webhook idempotency, store scoping, public booking partial failure, upload authorization, and booking races.
  - API integration tests import the app before test env setup, which can interact poorly with top-level env validation.
- Why it matters:
  - The exact flows most likely to fail after deployment are not well covered.
- Recommended fix:
  - Add focused integration tests around the critical/high findings.
  - Set env before importing the API app in tests.
  - Use fake Supabase/payment adapters where possible.
- Fix effort: Moderate.

## Low

### 14. Duplicate Migration Numbering Creates Maintenance Risk

- Severity: Low
- Files/functions:
  - `supabase/migrations/135_partner_enrollment_details.sql`
  - `supabase/migrations/135_users_employee_id_on_delete_cascade.sql`
  - `supabase/migrations/140_accommodation_partners_welcome_message.sql`
  - `supabase/migrations/140_cash_advance_payday_type.sql`
  - `supabase/migrations/154_return_reminder_log.sql`
  - `supabase/migrations/154_vehicle_model_deposit_and_pom.sql`
- What is wrong:
  - Multiple migration files share the same numeric prefixes.
- Why it matters:
  - Clean deploys, migration repair, and production history comparison become harder to reason about.
- Recommended fix:
  - Confirm production migration history first.
  - Repair/rename using timestamped migrations or Supabase migration repair practices.
- Fix effort: Moderate.

### 15. Cron Jobs Run In Every API Instance

- Severity: Low
- Files/functions:
  - `apps/api/src/server.ts`
  - `apps/api/src/jobs/post-rental-email.ts`
  - other files under `apps/api/src/jobs`
- What is wrong:
  - Scheduled jobs start from the API server process.
  - There is no obvious distributed lock around all jobs.
- Why it matters:
  - Multiple deployed API instances can send duplicate emails, duplicate reminders, or duplicate summaries.
- Recommended fix:
  - Run jobs in a single worker or managed scheduler.
  - Add advisory locks around each job.
  - Add unique constraints to sent-log tables where appropriate.
- Fix effort: Moderate.

### 16. Type Safety Is Weakened And Shared Schemas Look Stale

- Severity: Low
- Files/functions:
  - `apps/api/tsconfig.json`
  - `apps/web/tsconfig.json`
  - `packages/shared/src/schemas/auth-schemas.ts`
  - `packages/shared/src/schemas/order-schemas.ts`
  - `packages/shared/src/schemas/fleet-schemas.ts`
- What is wrong:
  - API and web TypeScript configs disable strictness such as `noImplicitAny`.
  - Some shared schemas appear to expect numeric IDs or old payload shapes while the app uses UUID/string-style data elsewhere.
- Why it matters:
  - API/client drift is easier to miss.
  - Runtime bugs can hide behind permissive TypeScript settings.
- Recommended fix:
  - Align shared schemas with actual API responses or remove stale ones.
  - Gradually enable stricter TypeScript settings module by module.
- Fix effort: Moderate.

### 17. Several Files Are Too Large For Safe Maintenance

- Severity: Low
- Files/functions:
  - `apps/web/src/components/orders/BookingModal.tsx`
  - `apps/web/src/components/orders/OrderDetailSummaryTab.tsx`
  - `apps/api/src/routes/dashboard.ts`
  - `apps/api/src/routes/cashup.ts`
  - `apps/api/src/routes/orders-raw.ts`
- What is wrong:
  - Large files mix many responsibilities and make hidden behavior harder to review.
- Why it matters:
  - AI-generated or fast-generated code often accumulates edge-case bugs in oversized files.
  - Regression risk increases when unrelated behavior shares the same file.
- Recommended fix:
  - Avoid a large rewrite.
  - Extract only around active work: payment flow, booking flow, dashboard query services, cashup calculations, and smaller UI sections.
- Fix effort: Incremental.

### 18. Security Documentation Appears Stale

- Severity: Low
- Files/functions:
  - `SECURITY.md`
  - `.github/workflows/security-audit.yml`
- What is wrong:
  - Security documentation claims high/critical findings are resolved, but current dependency audit still reports high vulnerabilities.
- Why it matters:
  - Stale security docs create false confidence and make handoff harder.
- Recommended fix:
  - Update security docs only after dependency updates and CI audit pass.
- Fix effort: Quick.

## Code Quality Review

### Repeated Code

Patterns repeated across route files include:

- Store filtering and `storeId=all` handling.
- Supabase query response/error mapping.
- Permission checks.
- Payment and accounting response shaping.

Recommendation: extract small helpers only where they reduce active bugs, especially store scoping and API response helpers.

### Dead Or Unused Code

The most suspicious dead/stale code is in shared schemas and documentation:

- Several shared schemas appear out of sync with current route behavior.
- Security/audit docs appear stale relative to the current dependency audit.
- Numerous historical audit and execution-plan files may be useful context, but they also make it hard to tell which documents are authoritative.

### Overly Complex Files

The highest-maintenance files are large route handlers and UI components. These should not be rewritten wholesale, but future changes should extract focused services/components around the changed behavior.

### Inconsistent Naming Or Patterns

The biggest consistency issue is API response shape. Most endpoints use `{ success, data, error }`; Maya checkout does not.

### Error Handling

Error handling exists but is inconsistent:

- Some customer-facing paths catch errors and continue, which can hide failed payment behavior.
- Some integrations silently skip behavior when environment variables are missing.
- Public booking rollback is client-orchestrated and can fail silently if the cancellation token is missing.

### Logging

Pino logging and request logging are present. Gaps remain around audit logs for destructive tools, payment settlement idempotency, and security-relevant authorization failures.

### Type Safety

TypeScript is used throughout, but strictness is weakened in important apps. Runtime validation with Zod exists in some routes, but not consistently at every API boundary.

### Validation

Validation is good in places, especially auth and several request schemas. Gaps include file content validation, public checkout trust boundaries, and some route-level query/permission combinations.

## Security Review

### Authentication And Authorization

Authentication uses JWTs and bcrypt PIN verification. The main authorization risk is inconsistent backend enforcement of permissions and store access.

### Exposed Secrets Or Unsafe Environment Handling

No committed secret value was confirmed during this review. The API uses service-role Supabase credentials by design, so environment handling and backend authorization must be treated as high risk.

The dotenv load order comment in `apps/api/src/adapters/supabase/client.ts` may be misleading because default dotenv behavior does not override already-loaded values. This could cause environment confusion between root and app `.env` files.

### Input Validation

Zod is used, but input validation is uneven. Public and paid flows should validate all externally controlled fields server-side and avoid trusting client amount/order details.

### API Access Control

The largest API access issue is store scoping. Any route using service-role access must explicitly constrain data by `req.user.storeIds` and permissions.

### File Upload Risks

Upload routes should inspect file bytes, re-encode images where possible, strip metadata, and avoid relying only on MIME/extension.

### Dependency Vulnerabilities

Current production dependency audit reports 10 vulnerabilities: 5 high and 5 moderate.

### CORS, Cookies, Sessions, Tokens, CSRF

The API uses CORS allow-listing and credentials. Auth tokens are stored in localStorage on the frontend. CSRF risk is lower for bearer-token APIs than cookie sessions, but XSS risk is higher because localStorage tokens are accessible to injected JavaScript.

## Data Integrity Review

### Transaction Handling

The most important transaction gaps are:

- Maya webhook settlement.
- Booking holds and public direct booking creation.
- Multi-vehicle booking submission.
- Cron job sent-log writes.

### Race Conditions

Race-prone flows include:

- Concurrent customer holds.
- Concurrent public booking submissions.
- Staff order activation against limited fleet availability.
- Gateway webhook retries.
- Multi-instance cron execution.

### Duplicate Records

Potential duplicate risks:

- Payments from webhook retries.
- Journal entries from repeated settlement handling.
- Cron email/reminder logs.
- Raw orders from partial booking failure.

### Missing Constraints Or Indexes

Likely constraints to add after validating production data:

- Unique gateway settlement/payment reference.
- Unique post-rental email log by order.
- Additional hold/order conflict detection indexes depending on the chosen locking strategy.

### Inconsistent Database Writes

Some flows mix direct route queries, adapter calls, and SQL RPCs. For critical money and booking paths, prefer one transaction/RPC boundary.

### Retry/Idempotency Issues

Maya webhooks and cron jobs need stronger idempotency. Public booking submission could also benefit from client idempotency keys.

## Deployment Readiness

### Environment Variables

Environment validation exists in `apps/api/src/server.ts`, but examples and docs appear incomplete for all production integrations. Add a complete env matrix with required/optional flags.

### Build Scripts

Root scripts exist for dev/build/test. Local verification was blocked because dependencies were absent.

### Docker/Deployment Config

No clear Dockerfile or deployment runbook was found. `vercel.json` points to a hardcoded Render backend URL.

### Database Migrations

Migrations are extensive, but duplicate numeric prefixes and stale migration notes should be resolved after checking production history.

### CI/CD Readiness

Current visible automation is not enough. Add full build/test/typecheck/audit gates.

### Observability And Monitoring Gaps

Sentry and Pino exist. Gaps remain for:

- Payment settlement alerts.
- Failed webhook alerts.
- Store-authorization denial logs.
- Cron duplicate/lock failures.
- Public chat usage/cost monitoring.

## AI-Generated Code Risks

The codebase has several patterns that commonly appear in fast AI-assisted projects:

- Plausible but inconsistent response contracts.
- Returned values from use-cases dropped by route handlers.
- Granular permission constants that are not fully enforced.
- Stale shared schemas that no longer match real payloads.
- Large stitched-together route/component files.
- Historical audit and planning docs that may not reflect current state.
- Duplicate migration numbering.

These are not proof of bad code, but they are strong signals that runtime behavior must be verified rather than trusted from naming or comments.

## Recommended Next Steps

### Fix First

1. Fix Maya checkout:
   - Add safe public checkout design.
   - Standardize staff checkout API response.
   - Add tests for both public and staff payment-link paths.
2. Make Maya webhook settlement idempotent and transactional.
3. Enforce backend store scoping everywhere service-role Supabase queries are used.
4. Disable production dev-tools routes.
5. Fix public booking rollback token or replace client-orchestrated multi-booking with server-side batch booking.
6. Add transaction/locking protection around booking holds and order activation.

### Fix Next

1. Patch production dependency vulnerabilities.
2. Add full monorepo CI: install, build, typecheck, tests, and audit.
3. Complete deployment documentation and env examples.
4. Harden upload validation and storage access.
5. Add focused integration tests for critical customer/payment/store flows.
6. Add cron locking or move cron jobs to a single managed worker.

### Can Wait

1. Gradual TypeScript strictness rollout.
2. Cleanup of stale shared schemas after API contracts are clarified.
3. Incremental extraction of oversized components/routes.
4. Archiving old audit and execution-plan documents.

### Needs Project Owner Clarification

1. Should staff users ever be allowed to access all stores, or only assigned stores?
2. Is Maya payment required before customer booking confirmation, or is post-confirmation payment acceptable?
3. What migration history has already been applied in production?
4. Are dev reset tools intended for staging only, local only, or any production support workflow?
5. What retention policy applies to uploaded IDs/licences, waiver files, and AI chat transcripts?

## Suggested Stabilization Roadmap

### Week 1: Stop The Highest-Risk Failures

- Fix Maya checkout and webhook idempotency.
- Disable production dev tools.
- Add store-scoping helper and apply it to the most sensitive routes.
- Add CI build/typecheck/test/audit gates.

### Week 2: Protect Booking And Payment Integrity

- Move booking hold consumption and order creation into transactional RPCs.
- Add idempotency keys for public booking submission.
- Add payment uniqueness constraints.
- Add targeted integration tests for public booking, staff payment, and webhook retries.

### Week 3: Harden Deployment And Public Surfaces

- Complete env templates and deployment docs.
- Harden uploads.
- Add public chat abuse controls.
- Add cron locking and observability alerts.

### Week 4 And Later: Reduce Maintenance Risk

- Align shared schemas with real API contracts.
- Gradually enable stricter TypeScript.
- Extract large files only around active product work.
- Archive stale generated planning/audit documents.

