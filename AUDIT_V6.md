# Platform audit — Lola's Rentals & Tours Inc. (AUDIT_V6)

**Date:** April 9, 2026  
**Type:** Full-platform static review (architecture, security posture, data layer, apps, tooling, CI)  
**Auditor:** AI-assisted codebase review  

---

## 1. Scope and methodology

### 1.1 What “full platform” means here

The workspace contains on the order of **1,100+ tracked files** (source, assets, build artifacts under some packages, migrations, docs). A literal byte-for-byte read of every file is not practical or proportionate: large binaries (for example JPEG assets), generated `dist/` output, and duplicated path spellings on Windows (`apps\web` vs `apps/web`) do not change the technical conclusions.

This audit instead covers:

- **Entire intentional source surface:** monorepo layout, root and workspace `package.json` scripts, API bootstrap and routing, auth and rate limiting, representative public and protected routes, shared contracts, domain barrel and package boundaries, web routing and API client, Supabase client usage, CI workflows, and `SECURITY.md`.
- **Database evolution:** all **57** SQL files under `supabase/migrations/` were enumerated; core RLS design was read in `009_rls_policies.sql` and the hardening migration `058_rls_missing_tables.sql`, plus the head of `001_initial_schema.sql` for foundational tables.
- **Targeted search:** PostgREST `.or()` usage, authentication middleware patterns, and public route inventory.

If you need a **machine-generated file manifest** (every path + hash) for compliance, that should be produced by a script in CI rather than inferred from this document.

### 1.2 What was not exercised

- No production penetration test or live Supabase project inspection in this pass.
- No full `npm audit` report snapshot in this document (CI runs audit for `apps/api`; see Section 8).
- Not every React page or every use-case file was line-audited; patterns were inferred from architecture, middleware, and samples.

---

## 2. Executive summary

Lola's Rentals is a **npm workspaces monorepo** with four workspaces: `@lolas/domain`, `@lolas/shared`, `@lolas/api` (Express on Node), and `@lolas/web` (Vite + React). **Supabase (PostgreSQL)** is the system of record; the API uses the **service role** key and therefore **must** enforce authorization in application code. **Row Level Security** in Postgres is aligned with **Supabase JWT claims** (`store_ids`, `permissions`) for direct client access; the API bypasses RLS by design when using the service role.

**Strengths**

- Clear **hexagonal layering** (documented in `docs/architecture.md`): domain ports, shared Zod schemas, API adapters, React UI.
- **Centralized env validation** on API startup (`JWT_SECRET` min length, required Supabase variables).
- **Defense in depth** on the HTTP layer: Helmet, CORS allowlist, JSON body size cap (`100kb`), tiered rate limits, `trust proxy` for correct client IP behind proxies.
- **Permission model** is explicit (`packages/shared/src/constants/permissions.ts`) and applied broadly on protected routers via `authenticate` + `requirePermission`.
- **Security findings and remediation history** are tracked in `SECURITY.md` (April 2026 snapshot describes critical/high issues as addressed).
- **Automation:** GitHub Actions runs **npm audit** (API), **TruffleHog** secret scanning, and can patch `SECURITY.md` with audit summaries on `main`.

**Gaps and risks**

1. **`npm run lint` is currently broken** under ESLint 9: there is **no** `eslint.config.js` / `eslint.config.mjs` (or legacy `.eslintrc`); ESLint exits with “couldn't find an eslint.config” (verified locally). Static style and many bug classes are not enforced in CI via ESLint until this is fixed.
2. **Compiled artifacts in `packages/domain/src`** (`*.js`, `*.d.ts`, `*.map` alongside `.ts`) appear as **untracked** build output inside `src/`. This confuses source-of-truth, bloats reviews, and risks accidental commits; output should live only under `dist/` and `src/` should stay TypeScript-only (with `.gitignore` rules as needed).
3. **Test depth is thin** relative to platform size: API has a small integration suite and a couple of focused tests; domain/shared workspaces exist in Vitest workspace but breadth is unclear. Critical paths (booking, payments, extend, paw card, payroll) warrant more automated coverage.
4. **Dual access model complexity:** RLS protects Supabase when the anon key is used from the browser; the **API’s service role** must never trust the client for prices, permissions, or cross-store data. This is acknowledged in migrations; ongoing code review must preserve that invariant on every new endpoint.

---

## 3. Repository inventory

| Area | Role |
|------|------|
| `apps/api` | Express 5 API, Supabase adapters, use cases, cron/sync jobs, JWT auth |
| `apps/web` | Vite 6 + React 18 SPA: customer `/book/*` flows + staff backoffice behind login |
| `packages/domain` | Entities, value objects, domain services, port interfaces (no external deps) |
| `packages/shared` | Zod schemas, API types, permissions, constants — shared by API and web |
| `supabase/migrations` | 57 versioned SQL migrations (schema, RLS, functions, reviews CMS, etc.) |
| `docs/architecture.md` | ADR-style architecture notes |
| `SECURITY.md` | Security audit log and remediation checklist |
| `.github/workflows` | Security audit workflow (npm audit, TruffleHog, optional SECURITY.md update) |
| `vercel.json` | Static hosting + `/api/*` rewrite to Render backend |
| `_stitch_export/` | Design/export collateral (not core runtime) |

**Workspace scripts (root `package.json`):** `dev` runs domain, shared, api, and web concurrently; `build` chains package builds then API and web; `build:vercel` omits API (web-only deploy); `test` runs Vitest workspace; `lint` invokes ESLint (currently misconfigured).

---

## 4. Architecture

### 4.1 Layering

As documented, dependencies flow **inward**: UI and API depend on **shared contracts**; API implements **domain ports** against Supabase (and Google Sheets for mirror sync). The domain package stays free of framework and database SDKs — appropriate for testability and clarity.

### 4.2 Runtime topology

- **Browser** → Vercel-hosted SPA; `fetch` to `/api` (rewritten to **Render** `https://lolas-rentals.onrender.com/api/...` per `vercel.json`).
- **Optional Supabase client in web** (`apps/web/src/lib/supabase.ts`) uses **anon** key + URL from `VITE_*` env — suitable only for operations protected by RLS and bucket policies.
- **API** uses **service role** Supabase client (`apps/api/src/adapters/supabase/client.ts`) for full DB access; **all** authorization for those queries is application-side (JWT + permissions + store scoping in code).

### 4.3 Auth model

- Staff: **username + PIN**; PIN verified with bcrypt; JWT issued with **24h expiry** (`apps/api/src/adapters/auth/jwt.ts`). Payload carries `userId`, `employeeId`, `roleId`, `storeIds`, `permissions`.
- **Permission checks** are middleware-based (`apps/api/src/middleware/authorize.ts`) comparing required strings to JWT `permissions`.
- **Postgres RLS** helpers `user_store_ids()` and `has_permission()` read **Supabase JWT claims** — relevant when using PostgREST with user JWT, not when the API uses the service role.

### 4.4 Public surface (unauthenticated HTTP)

Mounted under `/api/public/*` (and `/api/public/reviews` on the root app before the main `/api` router), with **publicLimiter** (60/min) on the main API router and **additional** limits on sensitive actions (e.g. login, holds, flight lookup, paw card lookup — seen in `public-booking.ts` and related files).

Representative public capabilities include: booking availability, quotes, holds, direct booking submit, extend lookup/preview/confirm, paw card public lookup and listings, transfer booking, flight lookup, repair cost read, reviews read, charity impact read, etc. **SECURITY.md** lists past issues (price tampering, missing auth, injection, enumeration) and states they were addressed; this audit did not re-prove each fix line-by-line but confirms the **current** server wiring includes helmet, limits, validation middleware, and stricter patterns in auth and adapters.

### 4.5 Background work

- **Google Sheets sync** (`apps/api/src/jobs/sheets-sync.ts`, `adapters/google-sheets/`) — mirror/read model per architecture notes.
- **Cron-style jobs** (e.g. leave reset, recurring bills) live under `apps/api/src/jobs/`.

---

## 5. Data layer (Supabase / PostgreSQL)

### 5.1 Migrations

**57 migrations** evolve a large operational schema: stores, employees, users, roles, orders, payments, fleet, accounting journals, HR, maintenance, expenses, transfers, paw card, booking holds, card settlements, payroll-related objects, reviews CMS, budget, atomic extend/cancel RPCs, permission tweaks, etc.

### 5.2 RLS and privileges

- **009_rls_policies.sql** enables RLS broadly and defines **store-scoped** read/write policies using `user_store_ids()`, plus permission gates for writes. Comment notes that **Paw Card endpoints bypass RLS via service role** — consistent with API design.
- **058_rls_missing_tables.sql** closes gaps: RLS on `payment_routing_rules`, `booking_holds`, task notification/category/event tables, `repair_costs`; **REVOKE EXECUTE** on sensitive **SECURITY DEFINER** functions from `anon`; documents manual **Storage** policy work for `paw-card-receipts`.

### 5.3 Residual database / storage notes

- **Manual Supabase dashboard steps** remain for some storage policies (`SECURITY.md` and `058` comments).
- **Order reference entropy** called out in `SECURITY.md` as a future improvement (short hex references).

---

## 6. Applications

### 6.1 API (`apps/api`)

- **Stack:** Express 5, Zod validation (`middleware/validate.ts`), Supabase JS v2, bcrypt, jsonwebtoken, helmet, express-rate-limit, multer, node-cron, googleapis.
- **Composition root:** `server.ts` builds `app.locals.deps` with repository/adapter singletons — clear injection point for routes.
- **Error handling:** centralized error handler middleware.
- **CORS:** allowlist from `CORS_ORIGIN`, `ALLOWED_ORIGIN` (comma-separated), plus localhost origins in non-production.

**Notable implementation detail:** `auth.ts` uses **ILIKE with escaping** for username lookup to reduce wildcard/comma/or-injection issues in PostgREST filters — aligned with items described in `SECURITY.md`.

### 6.2 Web (`apps/web`)

- **Stack:** React 18, React Router 7, TanStack Query, Zustand, Tailwind, Framer Motion, Recharts, Vite 6.
- **Routing:** `apps/web/src/router.tsx` — public customer experience under `/book/*` and staff tools under `AppLayout` with `ProtectedRoute` (JWT in client store). Additional gating example: fleet book value route checks `can_view_fleet_book_value`.
- **API client:** `apps/web/src/api/client.ts` attaches Bearer token from auth store, normalizes `VITE_API_URL`, logs out on 401 (except login path).

**Client security note:** Staff permissions enforced in UI are **not** a security boundary; the API must remain authoritative (and does via middleware on protected routers).

---

## 7. Shared packages

### 7.1 `@lolas/shared`

Barrel export (`packages/shared/src/index.ts`) exposes schemas for essentially every domain area (orders, fleet, accounting, HR, paw card, extend, directory, budget, etc.). This is the **contract layer** between frontend and backend — a strong pattern for avoiding drift.

### 7.2 `@lolas/domain`

Barrel (`packages/domain/src/index.ts`) exports entities, value objects, services, errors, and **ports** (repository interfaces). Keeps business vocabulary centralized.

**Hygiene issue:** presence of emitted `.js`/`.d.ts` under `src/` (see Section 2) should be cleaned up for long-term maintainability.

---

## 8. Quality, testing, and tooling

### 8.1 Tests

- **Vitest workspace** (`vitest.workspace.ts`): `packages/domain`, `packages/shared`, `apps/api`, `apps/web`.
- **API tests observed:** `api.integration.test.ts` (health, unauthenticated orders, login validation), `config-crud.test.ts`, `fleet.test.ts`. Count is **low** vs. ~146 API source files and dozens of routes.

### 8.2 Linting

- Root script: `eslint . --ext .ts,.tsx` with ESLint 9.
- **No ESLint flat config file** present in the repo; **`npm run lint` fails** until `eslint.config.mjs` (or equivalent) is added and paths configured for TypeScript.

### 8.3 CI (`.github/workflows/security-audit.yml`)

- **npm audit** in `apps/api` with moderate threshold; artifacts uploaded.
- **TruffleHog** on PR (diff) and push (full history from root commit).
- **Optional bot commit** to refresh an “Automated Scan Results” section in `SECURITY.md` on pushes to `main` (ensure `SECURITY.md` contains the expected anchor if you rely on this).

---

## 9. Security cross-check (high level)

| Topic | Assessment |
|-------|------------|
| **Secrets** | API requires `JWT_SECRET` (min 32 chars) and service role key; web `.env.example` documents anon key only — appropriate split. |
| **Transport / headers** | Helmet enabled; CORS restricted; body size limited. |
| **Brute force / abuse** | Login, public API, and specific endpoints use rate limits. |
| **Injection / PostgREST filters** | `.or()` and `ilike` usage exists; `SECURITY.md` claims systematic fixes — spot-check during future reviews on **new** queries. |
| **RLS vs service role** | RLS protects direct Supabase access; API must enforce authz — pattern is established; each new route must be classified (public vs staff) and tested. |
| **JWT lifecycle** | 24h access token, no refresh in code reviewed — acceptable for internal tool if accepted; `SECURITY.md` lists refresh strategy as future work. |

For detailed finding IDs and remediation status, **`SECURITY.md` remains the authoritative security changelog** for this repository.

---

## 10. Recommendations (prioritized)

1. **Add ESLint 9 flat config** (`eslint.config.mjs`) for TypeScript/React, wire ignores for `dist` and generated files, and run `npm run lint` in CI on pull requests.
2. **Stop emitting compiled JS into `packages/domain/src`** — ensure `tsc` `outDir` is only `dist/`, add gitignore rules, and remove stray artifacts from the working tree.
3. **Expand automated tests** around money-moving and identity-sensitive flows: direct booking submit, extend confirm, transfer booking price verification, paw card writes, payroll run, and permission boundaries (403 vs 401).
4. **Narrow npm audit scope over time** — currently focused on `apps/api`; consider auditing root lockfile or `apps/web` for frontend dependency risk.
5. **Complete manual Supabase storage policy** work noted in `SECURITY.md` / migration `058`.
6. **Consider order reference length** and JWT refresh/revocation per `SECURITY.md` roadmap before a high-profile public launch.

---

## 11. Conclusion

The platform is a **well-structured monorepo** with a clear domain boundary, shared contracts, a **hardened HTTP API** (headers, CORS, limits, validation), and a **mature SQL migration history** with RLS aligned to multi-store operations. The dominant operational risk is **not** a single missing pattern but **ongoing discipline**: the service-role API must continue to treat every endpoint as part of the trust boundary, and **tooling debt** (broken ESLint, sparse tests, build artifacts in `src/`) should be addressed so regressions are caught automatically.

---

*End of AUDIT_V6*
