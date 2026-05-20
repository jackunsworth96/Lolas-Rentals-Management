# Developer Handover — Lola's Rentals & Tours Platform

**Audience:** the engineer taking over this codebase from day one.
**Author:** outgoing technical owner.
**Last revised:** May 2026.

This document is the single source of truth for getting productive on this platform without a verbal walkthrough. Read it end-to-end first, then keep it open as a reference. Every section is written for a competent developer who has never seen this codebase, this business, or Siargao Island.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository Map](#2-repository-map)
3. [Tech Stack & Dependencies](#3-tech-stack--dependencies)
4. [Environment Variables](#4-environment-variables)
5. [Local Development Setup](#5-local-development-setup)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Domain Model & Business Logic](#9-domain-model--business-logic)
10. [Email & Notification System](#10-email--notification-system)
11. [External Integrations](#11-external-integrations)
12. [Authentication & Security](#12-authentication--security)
13. [Known Issues & Technical Debt](#13-known-issues--technical-debt)
14. [Deployment Guide](#14-deployment-guide)
15. [Operational Runbook](#15-operational-runbook)
16. [What to Build Next](#16-what-to-build-next)
17. [Contacts & Credentials Reference](#17-contacts--credentials-reference)

---

## 1. Executive Summary

**The business.** Lola's Rentals & Tours Inc. is a vehicle hire and airport-transfer operator on Siargao Island, Philippines. It runs two brands out of a single back office:

- **Lola's Rentals** — premium scooters (Honda Beat 110cc) and TukTuks (Bajaj RE 250cc), the marketed brand at `lolasrentals.com`.
- **Bass Bikes** — older fleet sub-brand that shares the same staff, payroll, cash management and accounts. Internally it lives as a second store (`store-bass`) inside the same database; both brands roll up into one set of company-level books.

**The platform replaces a Google Sheets workflow.** Every operational artefact — bookings, fleet, transfers, payroll, cash-up, accounts — was previously a tab in a single spreadsheet. The platform is an as-faithful-as-possible re-implementation in a real database with a real UI, plus a customer-facing booking site that did not previously exist.

**Who uses it.**
- **Customers** (anonymous web visitors): browse and book scooters, TukTuks and airport transfers; sign waivers; cancel / extend bookings; redeem the Paw Card discount programme.
- **Ops staff** (PIN login at `/login`): process incoming bookings, walk-ins, returns, settlements, payments, transfers, maintenance.
- **Owner / admin**: payroll, cash-up, accounting journal, dashboards, settings, fleet purchases and sales.
- **Lolo AI agent** (a respond.io chat workflow): live customer Q&A on Facebook / Instagram / WhatsApp, calling our `/api/public/respond/*` endpoints over an API-key.

**Stack at a glance.** React 18 + Vite + Tailwind on Vercel; Node 20 + Express 5 + TypeScript on Render (paid Starter — no cold starts); Supabase Postgres (with RLS) for data; Resend for email; a single Telegram bot fanning out to ten channels; Cloudinary for images; Maya for online card payments (built but currently disabled — see §11). The repo is a single npm workspaces monorepo with a strict hexagonal architecture: `packages/domain` (pure business logic) → `packages/shared` (Zod schemas / types shared between API and Web) → `apps/api` (Express + Supabase adapters) → `apps/web` (React).

**State of the platform.** The codebase has been through ten internal audits (`AUDIT_V1.md` … `AUDIT_V10.md`) and an explicit V10 remediation pass. The accounting-integrity issues that gated launch in V10 have been closed (atomic RPCs `process_raw_order_atomic`, `settle_order_atomic`, `collect_payment_atomic`, `run_payroll_atomic` with idempotency, plus Maya webhook journal posting + Zod validation + `orders_raw` matching). Every public route is rate-limited; RLS is enabled on every store-scoped table; PINs are bcrypt-hashed; secrets have been rotated. The platform is **functionally complete and live** in production for staff use; customer-facing direct booking is also live. Maya online card payments are the one feature blocked from production use.

**The single most important thing to know.** This codebase was built end-to-end by a non-developer owner-operator using AI coding agents, not by a traditional development team. There is no test suite of any meaningful coverage, there is no CI/CD beyond Vercel and Render auto-deploys on push to `main`, and there is no staging environment — every push to `main` deploys to production. **Treat `main` as production. Do not push speculative work.** If you need to validate a change, run it against your local Supabase project (or a fresh branch project) and only merge when you are confident. There are 167 SQL migration files under `supabase/migrations/`; running them against a fresh database is the safest way to test schema-related changes.

The existing audits (`AUDIT_V10.md` is the most recent and detailed, dated April 2026) are extremely useful for understanding the history of fixes. Many of the issues those audits flag have since been resolved by migrations 077–099 and 116–157. Section 13 of this document gives the **current** state, not the historical state.

---

## 2. Repository Map

```
User Interface/                    ← repo root (note the space; needs quoting in CLI)
├── apps/
│   ├── api/                       ← Express + Supabase backend, deployed to Render
│   │   ├── src/
│   │   │   ├── server.ts          ← Express bootstrap, env validation, app.locals.deps wiring
│   │   │   ├── dev-server.ts      ← Local entrypoint (loads .env then imports server.ts)
│   │   │   ├── instrument.ts      ← Sentry init for production
│   │   │   ├── routes/            ← One file per HTTP domain (orders, fleet, cashup, etc.)
│   │   │   │   ├── index.ts       ← Mount points + rate limiters
│   │   │   │   ├── auth.ts        ← /api/auth/login (PIN check + JWT)
│   │   │   │   ├── orders.ts      ← Active/completed orders, settlement, /enriched aggregator
│   │   │   │   ├── orders-raw.ts  ← Inbox (orders_raw), walk-in-direct, activation
│   │   │   │   ├── public-*.ts    ← Customer-facing endpoints (no JWT, rate-limited)
│   │   │   │   ├── public-respond.ts ← Lolo AI / respond.io endpoints (X-API-KEY auth)
│   │   │   │   └── ...            ← cashup, hr, payroll, transfers, fleet, maya, dashboard, etc.
│   │   │   ├── use-cases/         ← Application layer (one folder per domain)
│   │   │   │   ├── orders/        ← activate / settle / collect-payment / process-raw-order
│   │   │   │   ├── booking/       ← public booking pipeline
│   │   │   │   ├── payroll/       ← run-payroll, calculate-payslip
│   │   │   │   └── ...            ← cashup, expenses, transfers, paw-card, hr, etc.
│   │   │   ├── adapters/
│   │   │   │   ├── supabase/      ← Repository adapters (one file per port)
│   │   │   │   ├── auth/          ← bcrypt + JWT helpers
│   │   │   │   └── google-sheets/ ← Read-only mirror (legacy; not on critical path)
│   │   │   ├── services/
│   │   │   │   ├── email.ts       ← Resend wrapper + escapeHtml + re-exports
│   │   │   │   ├── email-templates/ ← customer.ts / staff.ts / driver.ts / maintenance.ts
│   │   │   │   └── maya.ts        ← Maya checkout creation + webhook signature verify
│   │   │   ├── middleware/        ← authenticate, authorize, validate, rate-limit, error-handler
│   │   │   ├── jobs/              ← node-cron jobs (daily summary, fleet summary, reminders)
│   │   │   ├── lib/               ← logger (pino), telegram, sentry, partner-benefit
│   │   │   ├── telegram/          ← telegram.service / templates / webhook (Confirm buttons)
│   │   │   ├── transfers/         ← Pickup-time computation + rules loader
│   │   │   └── utils/             ← Manila timezone helpers, business-days, unsubscribe-token
│   │   ├── scripts/               ← seed-users, send-test-email, migrate-sheets, import-fleet-csv
│   │   ├── tests/                 ← Vitest suites (limited coverage — focus on Money, RPC dry-runs)
│   │   └── package.json
│   └── web/                       ← React 18 + Vite frontend, deployed to Vercel
│       ├── src/
│       │   ├── main.tsx           ← React root
│       │   ├── App.tsx            ← QueryClient + BrowserRouter + ErrorBoundary
│       │   ├── router.tsx         ← All routes (lazy + ProtectedRoute)
│       │   ├── i18n.ts            ← i18next bootstrap (en + tl + few partial)
│       │   ├── pages/             ← One folder per page; *.tsx + sub-components
│       │   ├── components/        ← One folder per UI module + ui/ (shared primitives)
│       │   ├── api/               ← Per-domain fetch wrappers (call apps/api)
│       │   ├── stores/            ← Zustand stores (auth, booking, ui, realtime, task-notifications)
│       │   ├── hooks/             ← Reusable hooks (useFavicon, useIsMobile, usePartnerRefCapture)
│       │   ├── locales/           ← JSON translation files (en/tl/...)
│       │   ├── content/           ← Static copy (pulled out of components for editability)
│       │   ├── data/              ← Static data (paw-card seed lists, etc.)
│       │   ├── utils/             ← Currency, date, partner-discount, raw-order-payload, PDF
│       │   ├── lib/               ← Cloudinary helpers, design-system tokens
│       │   ├── assets/            ← Logos, hero images, icons
│       │   ├── types/             ← Local type augmentations
│       │   ├── config/            ← Frontend-only constants
│       │   └── index.css          ← Tailwind base + design-system custom properties
│       ├── public/                ← Static assets, sitemap.xml, favicon, robots.txt
│       ├── DESIGN_SYSTEM.md       ← Brand colours, typography, spacing tokens
│       └── vite.config.ts
├── packages/
│   ├── domain/                    ← Pure business logic; zero runtime deps
│   │   └── src/
│   │       ├── entities/          ← Order, Vehicle, Employee, Transfer, Maintenance, Timesheet, JournalTransaction
│   │       ├── value-objects/     ← Money (decimal-safe), Period, DateRange, OrderStatus, StoreId
│   │       ├── services/          ← deposit-calculator, depreciation-service, payroll-calculator
│   │       ├── ports/             ← All repository + port interfaces (~30 files)
│   │       └── errors/            ← DomainError + named subclasses
│   └── shared/                    ← API contracts: Zod schemas + permission constants
│       └── src/
│           ├── schemas/           ← Per-domain Zod schemas, used by both API and Web
│           ├── constants/         ← order-status, store-mapping, reference-types, permissions
│           └── types/             ← api-types (envelope shape)
├── supabase/
│   ├── migrations/                ← 167 .sql files (numbered 001_… plus timestamp-named); see §6
│   ├── functions/                 ← Reserved for Edge Functions (currently empty / minimal)
│   ├── seed.sql                   ← Production seed: 6 transfer routes + minimum chart of accounts
│   └── config.toml                ← Supabase CLI project config
├── docs/
│   ├── architecture.md            ← Two-page hexagonal-architecture decision record
│   ├── Lolas-Rentals-SOP.md       ← Staff Standard Operating Procedures (read this!)
│   ├── OPS_RUNBOOK.md             ← Render keep-warm, Maya prod-switch, env vars
│   └── DELIVERABILITY_CHECKLIST.md← Email DKIM/SPF/DMARC checklist
├── scripts/                       ← Repo-level scripts (mostly empty)
├── _stitch_export/                ← LEGACY: HTML/CSS exports from Stitch design tool. Reference only.
├── .github/                       ← GitHub Actions workflows (mostly README only)
├── .cursor/plans/                 ← Cursor agent execution plans. Historical, not authoritative.
├── package.json                   ← Root: npm workspaces + dev/build/test scripts
├── package-lock.json              ← Single lockfile for the whole monorepo
├── tsconfig.base.json             ← Strict mode + ES2022; every workspace extends this
├── vitest.workspace.ts            ← Vitest cross-package config
├── vercel.json                    ← Vercel rewrites: /api/* → Render, * → SPA fallback
├── .env                           ← Local dev env (gitignored). Rotate keys before sharing.
├── .env.example                   ← Sample env file (no real secrets)
├── AUDIT_V1.md … AUDIT_V10.md     ← Historical audits. V10 (Apr 2026) is the most recent.
├── EXECUTION_PLAN_V10.md          ← V10 remediation plan (mostly executed; see §13).
├── SECURITY.md                    ← Security audit summary (37 issues found, 36 closed)
├── SYSTEM_AUDIT_v1…v4.md          ← Earlier audits. Superseded by AUDIT_V10.md.
├── platform_overview (old project).md ← Original Google Sheets requirements doc. Reference only.
├── Website Amendments V11.docx    ← Owner's amendments / wishlist Word doc. Reference.
└── package-lock-DESKTOP-3J45FU7.json ← STRAY 99-byte file; OneDrive sync conflict; safe to delete.
```

**Flagged non-obvious / legacy items:**
- `_stitch_export/` — frozen Stitch.app HTML exports used as visual references when the customer pages were built. Don't ship anything from here; treat it as design archive.
- `package-lock-DESKTOP-3J45FU7.json` — empty file from a OneDrive sync conflict. Delete it.
- `apps/api/src/adapters/google-sheets/` — Google Sheets is a **read-only background mirror** for the owner's historical comfort. Nothing in production reads from it. The cron job is `apps/api/src/jobs/sheets-sync.ts`.
- `SYSTEM_AUDIT_v1.md`, `…v2.md`, `…v3.md`, `…v4.md` — superseded; use `AUDIT_V10.md` if you need the most recent comprehensive view, but treat this document as the canonical handover.
- `.cursor/plans/` — execution plans the owner produced via Cursor agents while building. Useful for archaeology but not authoritative.
- Repo root contains a space in its path on Windows (`User Interface`). Quote everything when scripting.
- The migration filename convention switched mid-project. See §6 for the full story.

---

## 3. Tech Stack & Dependencies

### 3.1 Frontend (`apps/web`)

| Dependency | Version | Purpose |
|---|---|---|
| `react`, `react-dom` | 18.3.1 | UI framework |
| `react-router-dom` | 7.1.0 | Client-side routing (note: v7, the Remix-flavoured one) |
| `vite` | 6.0.0 | Build tool / dev server |
| `@vitejs/plugin-react` | 4.3.0 | React refresh during dev |
| `typescript` | 5.7.0 | Strict mode |
| `tailwindcss` | 3.4.17 | Utility CSS |
| `postcss`, `autoprefixer` | 8.x, 10.x | Required by Tailwind |
| `@tanstack/react-query` | 5.62.0 | Server-state caching for every API call |
| `zustand` | 5.0.0 | Local UI state (auth, booking basket, ui flags) |
| `lucide-react` | 0.468.0 | Icon set |
| `framer-motion` | 12.38.0 | Page transitions, modal animations |
| `gsap` | 3.14.2 | Hero animations on the customer landing pages |
| `ogl` | 1.0.11 | WebGL hero effects (very lightweight Three alternative) |
| `recharts` | 3.8.1 | Dashboard / analytics charts |
| `@supabase/supabase-js` | 2.49.0 | Used directly for realtime subscriptions only |
| `@cloudinary/react`, `@cloudinary/url-gen` | 1.x | Vehicle photos, partner logos |
| `@sentry/react` | 10.49.0 | Error reporting (DSN in env) |
| `react-helmet-async` | 3.0.0 | SEO meta tags per page |
| `i18next`, `react-i18next`, `i18next-browser-languagedetector` | 26.x / 17.x / 8.x | Localisation (en, tl, partial others) |
| `jspdf`, `jspdf-autotable` | 4.x / 5.x | Service history PDF export from Active orders |
| `@use-gesture/react` | 10.3.1 | Swipe gestures on mobile order cards |

### 3.2 Backend (`apps/api`)

| Dependency | Version | Purpose |
|---|---|---|
| `express` | 5.0.1 | HTTP server. Note: v5 (newer than most tutorials). |
| `@supabase/supabase-js` | 2.49.0 | Database client (service-role key). Bypasses RLS at the API layer. |
| `zod` | 3.24.0 | Request validation + env validation + Maya webhook payload |
| `bcrypt` | 5.1.1 | PIN hashing |
| `jsonwebtoken` | 9.0.2 | JWT issue/verify (HS256) |
| `helmet` | 8.0.0 | Security headers |
| `cors` | 2.8.5 | CORS allow-list (see `server.ts` `buildCorsAllowedOrigins`) |
| `express-rate-limit` | 8.3.1 | Rate limiting on `/auth`, `/public`, default `/api` |
| `pino`, `pino-http`, `pino-pretty` | 8.x / 9.x / 13.x | Structured logging |
| `node-cron` | 3.0.3 | All recurring jobs (daily summary, reminders, sheet sync) |
| `chrono-node` | 2.9.1 | Natural-language date parsing in Lolo respond.io endpoints |
| `resend` | 6.10.0 | Transactional email |
| `multer` | 2.1.1 | Inspection / waiver photo uploads |
| `googleapis` | 144.0.0 | Read-only Google Sheets mirror (background sync) |
| `@sentry/node` | 10.49.0 | Server-side error reporting |
| `dotenv` | 16.4.5 | `.env` loading in dev |
| `tsx` | 4.19.0 | TS execution for dev + scripts |
| `uuid` | 11.1.0 | UUID generation (Node `crypto.randomUUID` is also used) |

### 3.3 Domain & Shared (`packages/domain`, `packages/shared`)

- `@lolas/domain` — **zero runtime dependencies**. Pure TS classes/types/services. Anything that needs Node, Supabase, or Express must live in the API layer or in adapters.
- `@lolas/shared` — only `zod` 3.24.0. Schemas live here so both API and web validate against the same rules.

### 3.4 Tooling (root)

- `concurrently` 9.2.1 — runs all four watchers (`domain`, `shared`, `api`, `web`) in parallel for `npm run dev`.
- `eslint` 9.0.0 + `@typescript-eslint/*` 8.x — single shared config (loose; the codebase predates strict ESLint 9 flat config).
- `vitest` 3.0.0 — workspace-wide test runner.
- `typescript` 5.7.0 — root, with each workspace pinning its own `^5.7.0`.

### 3.5 Pinned-version notes

- **React 18.3 (not 19).** Several third-party libs (`@cloudinary/react`, parts of GSAP demos) were not React-19-tested when the platform launched. Upgrade to 19 when those settle.
- **Express 5.** `req`/`res` types come from `@types/express` 5.x. Async error propagation is built in — `try { … } catch (err) { next(err) }` is still used everywhere for explicitness, but the `next(err)` is what hands control to `errorHandler`.
- **react-router-dom 7.** Uses the new data-router style for `<Routes>` only. We have not adopted `loader`/`action` data routes; everything still uses TanStack Query.
- **Tailwind 3 (not 4).** Tailwind 4 is alpha-quality at the time of writing; sticking with 3.4 keeps the `tailwind.config.cjs` tooling stable.
- **Node 20+** is required (Render uses 20 LTS; local dev should match).

---

## 4. Environment Variables

The truth: `.env.example` at the repo root is out of date. Use the tables below. The API also fails fast on startup if any of `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` (≥32 chars) is missing — see `apps/api/src/server.ts:13–25`.

### 4.1 `apps/api/.env` (copied to Render dashboard for prod)

| Variable | Required | Secret? | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | No (URL) | Supabase REST endpoint, e.g. `https://gyoiepzkncnnmklyafvq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **YES** | Service-role key. Bypasses RLS. Treat like a master password. |
| `SUPABASE_ANON_KEY` | ⚠️ Optional | No | Only used by some client-side helpers; API itself uses service role |
| `JWT_SECRET` | ✅ | **YES** | HS256 signing key. Min 32 chars (Zod-validated). |
| `NODE_ENV` | ✅ | No | `development` \| `production` \| `test` |
| `PORT` | Auto on Render | No | Defaults to 3001 locally |
| `CORS_ORIGIN` | Production-required | No | Primary front-end origin, e.g. `https://lolasrentals.com` |
| `ALLOWED_ORIGIN` | Optional | No | CSV of additional allowed origins (Vercel previews etc.) |
| `TRUST_PROXY` | Production | No | Set to `1` (Render is behind a proxy). Defaults to `1` unless explicitly `false`. |
| `WEB_URL` | ✅ | No | Public web root used in email links, e.g. `https://lolasrentals.com` |
| `RESEND_API_KEY` | ✅ for email | **YES** | Resend transactional email API key |
| `EMAIL_FROM_CUSTOMER` | Optional | No | `hello@lolasrentals.com` (default) |
| `EMAIL_FROM_BOOKINGS` | Optional | No | `bookings@lolasrentals.com` (default) — used as default sender |
| `EMAIL_FROM_INTERNAL` | Optional | No | `maintenance@lolasrentals.com` (default) — for staff alerts |
| `NOTIFICATION_EMAIL` | Optional | No | Internal staff alerts inbox (defaults to `jack@lolasrentals.com`) |
| `DRIVER_EMAIL` | Recommended | No | Email recipient for driver transfer notifications |
| `WHATSAPP_NUMBER` | Optional | No | E.164 digits only (e.g. `639XXXXXXXXX`) for "WhatsApp us" CTAs |
| `TELEGRAM_BOT_TOKEN` | Recommended | **YES** | Single bot used for all channels |
| `TELEGRAM_CHAT_ID` | Optional | No | Default fallback chat (owner's personal chat) |
| `TELEGRAM_OPS_CHAT_ID` | Recommended | No | Lola's Ops channel (booking activations) |
| `TELEGRAM_FLEET_CHAT_ID` | Recommended | No | Vehicle status changes |
| `TELEGRAM_DAILY_CHAT_ID` | Recommended | No | 7am briefing / 6pm snapshot |
| `TELEGRAM_MAINTENANCE_CHAT_ID` | Recommended | No | New maintenance jobs + status changes |
| `TELEGRAM_DRIVER_CHAT_ID` | Optional | No | Legacy single driver channel (kept as fallback) |
| `TELEGRAM_VAN_CHAT_ID` | Optional | No | Van transfers info-only group |
| `TELEGRAM_VAN_DRIVER_CHAT_ID` | Optional | No | Van driver's personal chat (gets the Confirm button) |
| `TELEGRAM_TUKTUK_CHAT_ID` | Optional | No | TukTuk transfers info-only group |
| `TELEGRAM_TUKTUK_DRIVER_CHAT_ID` | Optional | No | TukTuk driver's personal chat (gets the Confirm button) |
| `TELEGRAM_FEEDBACK_CHAT_ID` | Optional | No | Customer review / feedback feed |
| `TELEGRAM_PAID_ORDERS_CHAT_ID` | Optional | No | Order activated events (staggered 3s after Ops) |
| `TELEGRAM_TODO_CHAT_ID` | Optional | No | To-do list visibility board |
| `MAYA_SECRET_KEY` | For Maya | **YES** | Maya secret key (currently sandbox; production is K004-blocked) |
| `MAYA_PUBLIC_KEY` | For Maya | No (semi) | Maya public key |
| `MAYA_BASE_URL` | For Maya | No | `https://pg-sandbox.maya.ph` (sandbox) or `https://pg.maya.ph` (prod) |
| `MAYA_WEBHOOK_SECRET` | For Maya | **YES** | HMAC secret used to verify `X-Maya-Signature` |
| `RESPOND_IO_API_KEY` | For Lolo AI | **YES** | Static API key checked by `authenticateApiKey` middleware |
| `SENTRY_DSN` | Recommended | Mostly No | Server Sentry DSN (DSNs are public, but treat as mild secret) |
| `LOG_LEVEL` | Optional | No | Pino log level (`info`, `debug`, etc.); defaults to `info` |
| `AERODATABOX_API_KEY` | Optional | **YES** | Aerodatabox flight lookup (used in Lolo respond.io transfer flow) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Optional | No | Sheets mirror destination |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional | No | Service account email for Sheets API |
| `GOOGLE_PRIVATE_KEY` | Optional | **YES** | Service account private key (escape `\n` correctly) |

### 4.2 `apps/web/.env.local` (set in Vercel dashboard for prod)

| Variable | Required | Secret? | Purpose |
|---|---|---|---|
| `VITE_API_URL` | ✅ | No | Full API base URL incl. `/api`, e.g. `https://api.lolasrentals.com/api` (prod) or `http://localhost:3001/api` (dev) |
| `VITE_SUPABASE_URL` | ✅ | No | Same as the API's `SUPABASE_URL` (used for realtime channel) |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public-by-design | Anon key (RLS gates writes) — safe to expose |
| `VITE_CLOUDINARY_CLOUD_NAME` | ✅ for images | No | Cloudinary cloud name |
| `VITE_SENTRY_DSN` | Recommended | Mostly No | Browser Sentry DSN |
| `VITE_BETA_ERROR_NOTICE` | Optional | No | `'true'` shows the WhatsApp error banner on every error (off by default) |

### 4.3 Vercel project configuration

- **Framework preset:** None (we set our own).
- **Build command:** `npm run build:vercel` (runs domain → shared → web).
- **Install command:** `npm install`.
- **Output directory:** `apps/web/dist`.
- **Root directory:** repo root (because of npm workspaces).
- **Rewrites** (defined in `vercel.json`):
  - `/api/(.*)` → `https://lolas-rentals.onrender.com/api/$1`
  - `/(.*)` → `/index.html` (SPA fallback)
- **Custom domain:** `lolasrentals.com` + `www.lolasrentals.com`. DNS is on Hostinger.
- **Production branch:** `main`. Every push to `main` deploys.

### 4.4 Render service configuration (API)

- **Service type:** Web Service.
- **Plan:** Starter (≈$7/mo) — paid so cold starts don't bite. UptimeRobot pings `/health` every 5 minutes for redundancy (see `docs/OPS_RUNBOOK.md`).
- **Runtime:** Node 20.
- **Build command:** `npm install && npm run build:render-api`.
- **Start command:** `node --import ./apps/api/dist/instrument.js ./apps/api/dist/server.js` (the `--import` loads Sentry before the app).
- **Health check path:** `/health`.
- **Auto-deploy:** on push to `main`.
- **Custom domain:** `api.lolasrentals.com` (DNS CNAME → `lolas-rentals.onrender.com` on Hostinger).

---

## 5. Local Development Setup

### 5.1 Prerequisites

1. **Node.js 20.x LTS.** Use `nvm` or Volta. The lockfile assumes npm (not pnpm/yarn).
2. **Git.**
3. **A Supabase project** for development. You can either:
   - Use the same project as production (read-only safe; writes will be visible to staff). Not recommended.
   - Create a fresh personal project and run all migrations against it. **Recommended** — see step 4.
4. **Optional but recommended:** the [Supabase CLI](https://supabase.com/docs/guides/cli) for `supabase migration new` and `supabase db push`.

### 5.2 First-time setup

```bash
# 1. Clone (note the space — quote the path on macOS / Linux too)
git clone <repo-url> "User Interface"
cd "User Interface"

# 2. Install all workspace deps with one command (single root lockfile)
npm install

# 3. Build the leaf packages once so other packages can resolve them
#    (TS project references will keep them in sync after this).
npm run build -w packages/domain
npm run build -w packages/shared

# 4. Copy the env template and fill in values (ask the owner for secrets)
cp .env.example .env
# Edit .env — at minimum:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET (>= 32 chars random),
#   RESEND_API_KEY (or leave blank to skip email)
#   PORT=3001, NODE_ENV=development

# 5. Create a web env file
cat > apps/web/.env.local <<'EOF'
VITE_API_URL=http://localhost:3001/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_CLOUDINARY_CLOUD_NAME=lolas-rentals
EOF
```

### 5.3 Apply database migrations

If using a fresh Supabase project:

```bash
# Option A: via Supabase CLI (recommended)
npx supabase link --project-ref <your-ref>
npx supabase db push

# Option B: copy each migration into the SQL editor manually, in lexical order
#   See supabase/migrations/README.md for the ordering caveat.
```

Then seed the minimum reference data:

```bash
# In the Supabase SQL editor
\i supabase/seed.sql
```

This inserts six transfer routes plus the minimum chart of accounts (`AR-RENTAL-store-lolas`, `INCOME-RENTAL-store-lolas`, `CASH-TILL-store-lolas`, `DEPOSIT-LIAB-store-lolas`, `WAGES-EXP-store-lolas`, `OWNER-DRAWINGS-store-lolas`, `CHARITY-PAYABLE`, `GCASH-store-lolas`, `SAFE-store-lolas`, `BANK-UNION-BANK-store-lolas`, `BANK-BDO-store-lolas`, `NEW-VEHICLE-FUND-store-lolas`, `CASH-LOLA`, `CASH-CHARITY-WALLET`, `OPENING-BALANCE-EQUITY`). Without these, order activation will fail with a "no receivable account found" error.

You will also need at minimum:
- A `stores` row for `store-lolas` (and `store-bass` if testing both brands). Check `001_initial_schema.sql` for the column shape.
- A `roles` row + `role_permissions` rows (use `ALL_PERMISSIONS` from `packages/shared/src/constants/permissions.ts`).
- An `employees` row (with `store_id = 'store-lolas'`).
- A `users` row linked to that employee, with a `pin_hash` you can generate with the helper script:

```bash
npm run seed -w apps/api          # creates a default admin if none exists
# OR, to manually create a hash for a 4-digit PIN:
node -e "import('bcrypt').then(b => b.hash('1234', 10).then(console.log))"
```

### 5.4 Run all four watchers

```bash
npm run dev
```

This runs four `concurrently`-managed processes:
- `domain` — `tsc --watch` for `packages/domain`
- `shared` — `tsc --watch` for `packages/shared`
- `api`    — `tsx watch` for `apps/api/src/dev-server.ts` (port 3001)
- `web`    — `vite` for `apps/web` (port 3000 by default; check terminal — Vite picks the next free port)

Open http://localhost:3000 (or whatever port Vite chose). The customer site is at `/book`; the staff login is at `/login`.

### 5.5 Known gotchas

- **OneDrive on Windows.** If your repo lives in `OneDrive\…` (the owner's setup), OneDrive will sometimes lock files mid-save. Symptom: `EBUSY` from Vite or random `tsc` failures. Workaround: pause OneDrive sync while developing, or move the repo out of OneDrive.
- **Path with spaces.** "User Interface" has a space — quote it in every shell command. `cd "User Interface"`, not `cd User Interface`.
- **Stale `dist/` folders.** If you switch branches and TS gets weird, run `npm run build` from the root to reset all `dist/` outputs.
- **Migrations partially applied.** If the Supabase CLI's `schema_migrations` table disagrees with your filesystem, see `supabase/migrations/README.md` ("If you already applied the old file names locally") for the `migration repair` recipe.
- **Pending migrations 091/092/093.** `supabase/migrations/PENDING_MIGRATIONS_README.md` documents three migrations that should be applied via the Supabase SQL editor if not already in your project's migration history. Symptoms of missing them: paid extensions inflating `balance_due`, "Unpaid Extensions" never clearing in Cash-up, card-fee surcharge not being charged at settlement.
- **Missing chart of accounts.** Seed first, or activation will throw `Maya webhook: no receivable asset account found` (and similar for other resolvers).
- **Telegram silently no-ops** when `TELEGRAM_BOT_TOKEN` or the relevant `*_CHAT_ID` is unset. Expected in dev. Search the logs for `Telegram alert skipped` — it's not an error.
- **Email silently no-ops** when `RESEND_API_KEY` is unset. Same pattern.
- **CORS.** In dev, `localhost:3000`, `:3002`, `:3003` are auto-allowed. If you change the Vite port outside that range, add it to `apps/api/src/server.ts:88`.
- **Maya in dev.** Maya checkouts hit the sandbox API, but webhook signatures are computed against `MAYA_WEBHOOK_SECRET` — if you don't have a sandbox webhook secret, the webhook handler will reject all calls. Use the unit tests under `apps/api/tests/maya.test.ts` (if present) to exercise the flow.

---

## 6. Database Schema

### 6.1 Migration count and ordering

There are **167 SQL files** under `supabase/migrations/`. They use two naming conventions:

1. **Numeric prefix** (`001_…` through `157_…`) — used through May 2026. Apply in lexical order. There were two collisions historically (two `134_…` and two `135_…`); the README explains the resolution.
2. **Timestamp prefix** (`20260424…`, etc.) — generated by `supabase migration new` for everything created after `137_`. Continue this convention going forward. **Do not** renumber old files.

The most recent migration at the time of writing is `157_post_rental_review_log.sql` (May 2026, dedupes the WhatsApp Google-review-request job).

There are **three pending migrations** (`091`, `092`, `093`) that may not have been applied to every environment — see `supabase/migrations/PENDING_MIGRATIONS_README.md`. They are idempotent (`CREATE OR REPLACE`), so re-running is safe.

### 6.2 Table catalog

The schema is too large to fully reproduce inline. The authoritative source is `001_initial_schema.sql` through `006_remaining_tables.sql`, plus every `ALTER TABLE` migration that followed. Below is the operational catalog grouped by domain. Column types in PostgreSQL: `text` is the default for IDs (we don't use UUID columns for business IDs — we use deterministic strings like `store-lolas`, `AR-RENTAL-store-lolas`).

#### Identity & access
- `stores` — `id text PK`, `name`, `is_company boolean default false` (`'company'` row holds shared accounts), `default_float numeric`, `public_booking_token text` (used by `/book/transfer/:token` flow), `created_at`. RLS: read all, modify with `can_edit_accounts`.
- `roles` — `id text PK`, `name`, `description`. Public read.
- `role_permissions` — `role_id, permission` (composite PK). Public read.
- `employees` — `id text PK`, `name`, `email`, `mobile`, `store_id` (legacy single-store; superseded by `employee_stores`), `role`, `pay_rate`, `rate_type` (`hourly`/`daily`/`monthly`), payment fields, `is_active`, `current_cash_advance` (legacy lump-sum, now superseded by `cash_advance_schedules`), `telegram_user_id` (mig 02 May 2026). RLS store-scoped read.
- `employee_stores` (mig 087) — many-to-many join `employee_id, store_id`.
- `users` — `id text PK`, `username text unique`, `pin_hash text` (bcrypt), `employee_id` (cascade delete via mig 135), `role_id`, `is_active`. RLS: only `can_edit_accounts`.

#### Customers
- `customers` — `id text PK`, `store_id`, `name`, `email`, `mobile`, `total_spent numeric`, `notes`, `blacklisted boolean`, timestamps.
- `paw_card_entries` (mig 030+) — paw card discount tracking, `paw_reference text` per customer, savings logs view + RLS in mig 031.

#### Orders
- `orders_raw` — Inbox table. Bookings land here (from web checkout, walk-in-to-inbox, Lolo bot). Columns: `id uuid PK`, `order_reference text` (4-hex), `status` (`unprocessed` / `processed` / `cancelled`), `payload jsonb` (raw Woo-shape blob), plus extracted columns added over time: `customer_name/email/mobile`, `pickup_datetime`, `dropoff_datetime`, `store_id`, `vehicle_model_id`, `charity_donation`, `transfer_type`, `transfer_route`, `flight_arrival_time`, `transfer_pax_count`, `transfer_amount`, `cancellation_token text`, `cancellation_token_used boolean` (mig 073), `web_payment_method`, `device_type`, `walk_in_reserved` (mig 103), `company`, `extra_comments`, `pre_booking_checkin` (mig 111), `web_quote_raw` (mig 089), `rental_value_raw` (mig 130), `dropoff_location_note` (mig 101), `original_dropoff_datetime` (mig 102).
- `orders` — Live order. `id text PK`, `store_id`, `woo_order_id`, `customer_id`, `employee_id`, `order_date`, `status` (`active`/`confirmed`/`completed`/`cancelled`), `web_notes`, `quantity`, `web_quote_raw`, `security_deposit`, `deposit_status`, `card_fee_surcharge`, `return_charges`, `return_charges_note` (mig 128), `final_total`, `balance_due`, `payment_method_id`, `deposit_method_id`, `booking_token`, `tips`, `charity_donation`, `partner_ref` (capture for affiliate attribution), `cancellation_token` (mig 068, 073), `settled_at`, `updated_at`.
- `order_items` — One row per assigned vehicle. `id text PK`, FK `order_id`, `vehicle_id`, `vehicle_name`, `pickup_datetime`, `dropoff_datetime`, `rental_days_count`, `pickup_location`, `dropoff_location`, `pickup_fee`, `dropoff_fee`, `rental_rate`, `helmet_numbers`, `discount`, `ops_notes`, `return_condition`, plus walk-in columns (mig 096).
- `order_addons` — `id text PK`, `order_id`, `addon_name`, `addon_price`, `addon_type` (`per_day`/`one_time`), `quantity`, `total_amount`.
- `payments` — `id text PK`, `store_id`, `order_id` (nullable for raw orders), `raw_order_id uuid` (nullable; for pre-activation Maya payments), `order_item_id`, `order_addon_id`, `payment_type` (`rental`/`deposit`/`security_deposit` legacy/`addon`/`extension`/`refund`/`settlement`/`card_maya`), `amount`, `payment_method_id`, `transaction_date`, `settlement_status` (`pending`/`absorbed`/null), `settlement_ref`, `customer_id`, `account_id`, `notes` (mig 081).
- `vehicle_swaps` — log of mid-rental vehicle swaps.
- `booking_holds` (mig 036) — temporary holds during checkout.
- `booking_sessions` (mig 113, 131) — session tracking with interaction count for UX analytics.

#### Fleet & maintenance
- `fleet` — `id text PK`, `name` (e.g. "Garlic"), `store_id`, `model_id`, `plate_number`, `engine_number` (mig 065), `chassis_number`, `gps_id`, `status` (FK to `fleet_statuses`), `current_mileage`, `orcr_expiry_date`, `surf_rack`, `purchase_price`, `purchase_date`, `useful_life_months`, `salvage_value`, `accumulated_depreciation`, `book_value`, `total_bike_cost`, `set_up_costs`, `owner`, `rentable_start_date`, `registration_date`, `date_sold`, `sold_price`, `profit_loss`, `odometer` (mig 061), timestamps.
- `fleet_statuses` — `id text PK`, `name`. Seeded set: `Available`, `Active`, `Under Maintenance`, `Service Vehicle`, `Pending ORCR`, `Closed`, `Sold`. Only `Available` is rentable (see `vehicle.ts` `isRentable`).
- `vehicle_models` — `id text PK`, `name`, `security_deposit` (mig 037), `peace_of_mind_per_day`, `metadata jsonb` (mig 153), `pom_required` (mig 154).
- `vehicle_model_pricing` — tiered pricing (`min_days, max_days, daily_rate`) per `(model_id, store_id)`.
- `helmet_swaps` (mig 114) — track helmet inventory changes during a swap.
- `maintenance` — `id text PK`, `vehicle_id`, `work_type`, `description`, `parts`, `labour`, `status` (`Reported`/`In Progress`/`Completed`), `cost`, `reported_at`, `reported_by`.
- `maintenance_work_types` — reference table of maintenance categories.
- `repair_costs` (mig 039) — public repair-quote tracking.
- `inspections` (mig 060) + `inspection_results` (mig 069) — pre/post-rental vehicle inspection forms with photos.
- `late_return_assignments` (mig 070) — track which staff are scheduled for 9PM late returns.

#### Accounting
- `chart_of_accounts` — `id text PK` (deterministic, e.g. `AR-RENTAL-store-lolas`), `name`, `account_type` (`Asset`/`Liability`/`Income`/`Expense`/`Equity`), `store_id` (or `'company'` for shared), `is_active`, `parent_account_id`. Migration 027 consolidates company-level accounts; migration 097 backfills a missing `STAFF-MEAL` account.
- `journal_entries` — `id text PK`, `transaction_id` (groups legs), `period text` (`YYYY-MM`), `date date`, `store_id`, `account_id`, `debit numeric(12,2)`, `credit numeric(12,2)`, `description`, `reference_type` (see `packages/shared/src/constants/reference-types.ts`), `reference_id`, `created_by`, `created_at`. The `assert_balanced_legs` helper (mig 076, 124) raises if `sum(debits) != sum(credits)` for any RPC posting.
- `payment_methods` — `id text PK`, `name`, `surcharge_percent`, `eligible_for_deposit boolean`, `show_on_customer_website boolean` (mig 107).
- `payment_routing_rules` (mig 022) — maps `(payment_method_id, store_id)` → `account_id`.
- `card_settlements` — Card transactions awaiting bank settlement. Linked to `payments` via `payment_id`. Columns include `is_paid`, `date_settled`, `settlement_ref`, `net_amount`, `fee_expense`, `account_id`, `batch_no`.
- `cash_reconciliation` — Daily cash-up. `id, store_id, date, opening_balance, expected_cash, actual_counted, variance, variance_type, submitted_by, submitted_at, is_locked, overridden_by/at/reason, till_counted, deposits_counted, till_denoms jsonb, deposit_denoms jsonb, till_expected, deposits_expected, till_variance, deposit_variance, closing_balance`.
- `expenses` — `id, store_id, date, category, description, amount, paid_from, vehicle_id, employee_id, account_id, status` (`paid`/`unpaid` — mig 050), `created_at`. Migration 152 fixes the date stamp for unpaid → paid transitions.
- `expense_categories` — reference table.
- `recurring_bills` — `id, name, frequency, account_id, next_due_date, amount`. The `recurring-bills.ts` job creates expenses from these.
- `before_close_tables` (mig 053) — denormalised snapshots used by Cashup's "Before Close" review modal.

#### Payroll & HR
- `timesheets` — `id, store_id, employee_id, work_date, hours, status, payroll_status, day_type, notes`, plus mig 087 `employee_stores` join.
- `timesheet_amendment_logs` (mig 20260505023001) — audit trail of timesheet edits after submission.
- `cash_advance_schedules` (mig 116, 140) — per-employee installment schedule with `payday_type` (`mid_month`/`end_of_month`).
- `leave_balances` + `leave_config` + `leave_reset_log` (mig 025) — annual leave tracking and the year-end reset job.
- `payroll_runs` (mig 080) — header row per `(store_id, period_start, period_end)`. UNIQUE constraint provides idempotency.
- `day_types` — reference (Regular, Sunday, Holiday, etc.) — drives multipliers in `payroll-calculator.ts`.

#### Transfers
- `transfers` — `id, order_id, service_date, customer_name, contact_number, customer_email, customer_type, route, flight_time, flight_number, pax_count, van_type, accommodation, status, ops_notes, total_price, payment_method, payment_status, driver_fee, net_profit, driver_paid_status, booking_source, booking_token, store_id, telegram_message_id, pickup_time_from, pickup_time_to, collected_at, collected_amount` (mig 074, 075).
- `transfer_routes` — `route, van_type, price, pricing_type` (`fixed`/`per_head`, mig 052), `driver_cut`, `store_id`, `is_active`. Mig 155 fixes route prices.
- `transfer_pickup_rules` (mig 086, 126) — JSON-driven rules for computing pickup time from flight time.
- `accommodation_partners` (mig 129, 130, 134, 138, 139, 140) — referral / commission partners.
- `accommodation_aliases` (mig 150) — alternate names for fuzzy matching in transfer bookings.

#### Misc & operational
- `addons` — `id text PK`, `name`, `price`, `addon_type`, `mutual_exclusivity_group`, `applicable_model_ids text[]` (mig 040).
- `locations` — `id, name, delivery_cost, collection_cost, store_id`.
- `merchandise` (mig 021) — small in-store merchandise sales.
- `misc_sales` — non-rental sales.
- `lost_opportunity` — track customer enquiries that didn't convert.
- `todo_tasks` + `todo_comments` + task accountability (mig 024) — internal team to-do board.
- `ui_errors` — frontend error reports captured by `useErrorReporter`.
- `directory` — internal vendor / supplier directory (mig 051).
- `paw_card_establishments` — discount partners.
- `paw_card_entries` — customer paw cards.
- `reviews` (mig 057) — CMS for customer reviews shown on `/book`.
- `chat_sessions` (mig 115, 151) — Lolo AI conversation tracking with topic tags.
- `email_opt_out` (mig 121) — unsubscribe table; managed by `unsubscribe-token.ts`.
- `waivers` (mig 059) + `waiver_reminder_log` (mig 063) + `waivers.referral_source` (mig 145, 149) — digital waivers.
- `post_rental_email_log` (mig 064) — dedupe for thank-you / review-request emails.
- `post_rental_review_log` (mig 157) — dedupe for the WhatsApp review-request job.
- `delivery_reminder_log` (mig 146) — dedupe for delivery-reminder Telegram messages.
- `return_reminder_log` (mig 154) — dedupe for return-reminder messages.
- `maya_checkouts` (mig 062, 083) — Maya checkout tracking with `raw_order_id` link for pre-activation payments.
- `partner_enrollment_details` (mig 135, 136, 141) — affiliate signup form data.
- `ui_errors` — captured client-side errors (mig 137 makes employee_id ON DELETE SET NULL).
- `budget` (mig 054, 132) — monthly budget rows used by `/budget`.
- `opening_balance_journal` (mig 117, 118) — opening balances when migrating from sheets.
- `post_batch_depreciation` (mig 119) — depreciation posting helpers.

#### Foreign keys (high-level)

The schema relies heavily on text foreign keys with explicit deterministic IDs:

```
orders.customer_id     → customers.id
orders.store_id        → stores.id
orders.employee_id     → employees.id
orders.payment_method_id → payment_methods.id
order_items.order_id   → orders.id (cascade delete)
order_items.vehicle_id → fleet.id
order_addons.order_id  → orders.id (cascade)
payments.order_id      → orders.id
payments.raw_order_id  → orders_raw.id          (mig 083)
payments.account_id    → chart_of_accounts.id
journal_entries.account_id → chart_of_accounts.id
fleet.store_id         → stores.id
fleet.model_id         → vehicle_models.id
employees.store_id     → stores.id (legacy single-store FK)
employee_stores.employee_id, store_id (composite PK)
users.employee_id      → employees.id (CASCADE; mig 135)
users.role_id          → roles.id
role_permissions.role_id → roles.id
transfers.order_id     → orders.id (nullable)
maintenance.vehicle_id → fleet.id
expenses.vehicle_id    → fleet.id
expenses.employee_id   → employees.id
expenses.account_id    → chart_of_accounts.id
ui_errors.employee_id  → employees.id (SET NULL; mig 137)
```

Cascading delete is reserved for child rows (order_items, addons, payments). Most FKs are `ON DELETE NO ACTION` so accidental deletes throw rather than silently propagate.

### 6.3 RPC functions / stored procedures

The accounting integrity story sits inside Postgres. Critical RPCs:

| Function | Migration | Purpose |
|---|---|---|
| `user_store_ids()` | 009 | Reads `request.jwt.claims.store_ids`. Used in every store-scoped RLS policy. |
| `has_permission(text)` | 009 | Reads `request.jwt.claims.permissions`. |
| `assert_balanced_legs(jsonb)` | 076, 124 | Throws if `sum(debit) != sum(credit)` for the legs jsonb passed by any posting RPC. Migration 124 also rejects zero-leg arrays. |
| `activate_order_atomic(...)` | 049, 067, 079, 098, 099 | Insert order + items + addons, update fleet, post journal legs. Charity is folded in (mig 079). Migration 098/099 fix vehicle-name/addon edge cases. |
| `process_raw_order_atomic(...)` | 077, 090 | One-shot: upsert customer, insert order + items + addons, update fleet, insert payments, insert card-settlement, insert/update transfer, post journal legs, mark `orders_raw.status='processed'`. Idempotent on `p_order_id` (deterministic UUID) so retries are safe. |
| `settle_order_atomic(...)` | 078, 092, 093, 125 | Insert final payment + card-settlement, post deposit applied/refund + final-payment legs, release fleet rows, update `orders.status='completed'`, absorb pending extension IOUs (mig 092), bump `final_total/card_fee_surcharge` for card-fee surcharge at settle (mig 093), apply `return_charges_note` (mig 125, 128). |
| `collect_payment_atomic(...)` | 081, 120, 122 | Insert payment row + journal legs in one transaction. Migration 120 absorbs IOUs when balance clears; mig 122 fixes a `balance_due` bug on partial payments. |
| `pay_expenses_atomic(...)` | 045 | Pay one or more unpaid expenses, posting cash legs. Mig 152 fixes the date stamp. |
| `match_card_settlement_atomic(...)` | 046 | Mark a batch of card settlements paid + post bank/fee legs. |
| `reconcile_cash_atomic(...)` | 047 | Insert/update `cash_reconciliation` + post deposit-to-safe legs in one transaction. |
| `run_payroll_atomic(...)` | 048, 080 | Insert into `payroll_runs` (UNIQUE on store_id+period_start+period_end so a duplicate run raises 23505 → API maps to `PAYROLL_ALREADY_RUN`), then insert all journal legs. |
| `confirm_extend_order_atomic(...)` | 055, 091 | Atomic extension: bump `final_total`, optionally insert IOU payment row. Mig 091 stops double-incrementing `balance_due` for paid-now extensions. |
| `cancel_order_raw_atomic(...)` | 055, 077 (referenced) | Cancel a raw order with a single-use cancellation token (mig 073). Locked to `service_role`. |
| `cleanup_bookings_by_email_or_test(...)` | 106 | Owner test-data cleanup helper. Locked to `service_role`. |
| `cascade_customer_contact_update(...)` | 20260501083347 | When a customer's email/phone changes, propagate to associated bookings. |
| `top_paw_card_establishments(int)` | 084 | Aggregated leaderboard for the public Paw Card page (replaces the V10 N+1 query). |
| `transfer_summary(...)` | 088 | Aggregated transfer counts/totals for the Transfers page summary tiles. |
| `clear_cash_advance(employee_id text)` | 048 | Legacy lump-sum cash-advance clearer (still called from `run-payroll.ts:settleCashAdvances`). |
| `reset_test_data(...)` | 094, 095 | Owner-only nuke for test data; `pg_safeupdate`-aware. Locked to `service_role`. |

Function search-path hardening is in `071_function_search_paths.sql` and `072_remaining_security_fixes.sql`. All sensitive RPCs are `SECURITY DEFINER` with `EXECUTE` revoked from `public`/`anon`/`authenticated` and `GRANT`ed only to `service_role`. The API connects with the service-role key, so RLS is bypassed at the API layer; RLS is the second line of defence for any client connecting with the anon key (frontend realtime subscriptions, future Supabase-direct integrations).

### 6.4 Row Level Security (RLS) summary

Every store-scoped table has RLS enabled and policies of the form:

```sql
USING (store_id = ANY(public.user_store_ids()))            -- SELECT
USING (store_id = ANY(public.user_store_ids())             -- INSERT/UPDATE/DELETE
       AND public.has_permission('can_…'))
```

Public-readable reference tables (`addons`, `locations`, `payment_methods`, `vehicle_models`, `vehicle_model_pricing`, `fleet_statuses`, `expense_categories`, `transfer_routes`, `day_types`, `roles`, `role_permissions`, `chart_of_accounts`) use `USING (true)` for SELECT and gate writes behind `can_edit_accounts` or `can_edit_settings`.

Migrations that closed historic RLS gaps:
- `058_rls_missing_tables.sql` — added RLS to the six tables that shipped without it.
- `066_security_and_schema_fixes.sql` — closed every `FOR ALL USING (true)` write policy.
- `069_inspection_results_rls.sql`, `070_late_return_assignments_rls_enable.sql` — new tables.
- `072_remaining_security_fixes.sql` — final tightening.
- `144_rls_booking_sessions_and_helmet_swaps.sql` — RLS on the more recent tables.

The API uses the **service-role key** for all writes, which bypasses RLS. RLS exists primarily to:
1. Defend against a stolen JWT being used directly against Supabase REST.
2. Allow the frontend to subscribe to realtime channels (`stores/realtime.ts`) safely with the anon key.

If you ever introduce a feature that calls Supabase from the browser with the anon key, RLS is your only line of defence — verify it.

### 6.5 Migration state

- **All numbered migrations 001–157** are committed to the repo.
- The repo plus three pending migrations (091, 092, 093) is the canonical schema. The "pending" label predates the more recent additions; they have likely been applied to production but verify against `supabase_migrations.schema_migrations`.
- There is no migration tooling integrated into deploy. New migrations are created with `npx supabase migration new <slug>` and pushed via `npx supabase db push` against each environment, **manually**.

---

## 7. API Reference

All routes are mounted at `/api/*`. The frontend goes through Vercel's `/api/*` rewrite to Render. Every response uses the envelope:

```ts
{ success: true,  data: T }
{ success: false, error: { code: string, message: string, details?: unknown } }
```

`ApiError` on the web side reads `error.code`. The error handler is `apps/api/src/middleware/error-handler.ts`. Global rate limits applied in `routes/index.ts`:

- `/auth/*` → `loginLimiter` (5 / 15min)
- `/public/*` → `publicLimiter` (60 / min)
- everything else → `apiLimiter` (200 / min)

### 7.1 Auth (`apps/api/src/routes/auth.ts`)

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `{ username, pin }` (LoginRequestSchema) | `{ token, user: { userId, username, employeeId, roleId, storeIds, permissions } }` |

JWT is HS256, 24h expiry. Stored in `localStorage` via Zustand persist (see §12).

### 7.2 Orders — Active / Completed (`routes/orders.ts`)

All require `authenticate`. Permissions noted per route.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/orders` | `can_view_inbox` | List orders by `?storeId=&status=`. Returns domain shape via `orderRepo.findByStore`. |
| GET | `/api/orders/enriched` | `can_view_inbox` | Aggregated payload with customer, items, payments, pendingExtensions for the Active table. |
| GET | `/api/orders/:id` | `can_view_inbox` | Single order, full domain. |
| GET | `/api/orders/:id/full` | `can_view_inbox` | Order + items + addons + payments + transfer in one round-trip (used by OrderDetailModal). |
| POST | `/api/orders/:id/activate` | `can_edit_orders` | Calls `activateOrder` use case. |
| POST | `/api/orders/:id/settle` | `can_edit_orders` | Calls `settleOrder` use case (atomic RPC `settle_order_atomic`). |
| POST | `/api/orders/:id/payments` | `can_edit_orders` | Calls `collectPayment` use case (atomic RPC `collect_payment_atomic`). |
| POST | `/api/orders/:id/refund` | `can_edit_orders` | Calls `refundOrder` use case. |
| PATCH | `/api/orders/:id` | `can_edit_orders` | Adjust dates, swap vehicle, modify addons, update notes/dropoff-location-note. |
| POST | `/api/orders/:id/cancel` | `can_cancel_orders` | Cancel an active order. |
| GET | `/api/orders/delivery-reminders` | `can_view_active` | Sub-router (`delivery-reminders.ts`) for reminder management. |

### 7.3 Orders Raw (Inbox) (`routes/orders-raw.ts`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/orders-raw` | `can_view_inbox` | List `orders_raw` (Inbox queue). Returns explicit columns (no full `payload`). |
| GET | `/api/orders-raw/:id` | `can_view_inbox` | Single raw order detail. |
| POST | `/api/orders-raw/walk-in-direct` | `can_edit_orders` | Walk-in-direct flow: creates customer + raw order + activates immediately via `activate_order_atomic`. |
| POST | `/api/orders-raw/:id/process` | `can_edit_orders` | Process inbox → live order via `process_raw_order_atomic`. Idempotent on retry. |
| POST | `/api/orders-raw/:id/cancel` | `can_cancel_orders` | Cancel an inbox booking. |
| PATCH | `/api/orders-raw/:id` | `can_edit_orders` | Edit raw order fields. |

### 7.4 Public booking (`routes/public-booking.ts`)

No JWT (rate-limited under `/public`). Used by the customer site under `/book/*`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/public/booking/models` | Vehicle models available at a store. |
| GET | `/api/public/booking/model-pricing` | Tiered pricing for a model. |
| GET | `/api/public/booking/availability` | Available counts for a date range. |
| GET | `/api/public/booking/quote` | Compute quote (rental + addons + locations + surcharge). |
| POST | `/api/public/booking/hold` | Place a booking hold (per-IP rate-limited 20/10min). |
| POST | `/api/public/booking/release-hold` | Release a hold. |
| POST | `/api/public/booking/submit-direct-booking` | Persist `orders_raw` row + send confirmation email + ops Telegram. |
| GET | `/api/public/booking/lookup/:reference` | Customer lookup by order reference + email check. |
| PATCH | `/api/public/booking/cancel/:reference` | Customer self-cancel with single-use cancellation token (mig 073, rate-limited 10/h). |

### 7.5 Public extend (`routes/public-extend.ts` + `staffExtendRoutes`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/public/extend/quote` | none | Quote a date extension. |
| POST | `/api/public/extend/confirm` | none (token) | Confirm and (optionally) pay extension. |
| POST | `/api/extend/...` | JWT, `can_edit_orders` | Staff-side extend (separate schema; no rate/payment override allowed by customers). |

### 7.6 Public waiver (`routes/public-waiver.ts`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/public/waiver/:orderReference` | none | Fetch waiver shape for signing. |
| POST | `/api/public/waiver/:orderReference/sign` | none | Submit signed waiver (5MB body limit for base64 signature). Rate-limited 20/15min. |
| POST | `/api/public/waiver/:orderReference/licence` | none | Upload licence photo (multer). |
| GET | `/api/waiver/...` | JWT | Same router mounted under `/api/waiver` for staff use. |

### 7.7 Transfers (`routes/transfers.ts` + `routes/public-transfers.ts`)

Staff (`/api/transfers/*`, JWT + `can_view_transfers` / `can_edit_transfers`):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/transfers` | List transfers. |
| GET | `/api/transfers/summary` | Aggregated counts via `transfer_summary` RPC (mig 088). |
| GET | `/api/transfers/:id` | One transfer. |
| POST | `/api/transfers` | Create + fire-and-forget driver Telegram + customer email. |
| PATCH | `/api/transfers/:id` | Edit fields. |
| PATCH | `/api/transfers/:id/pickup-time` | Update pickup time window. |
| PATCH | `/api/transfers/:id/accommodation` | Update accommodation. |
| PATCH | `/api/transfers/:id/flight-time` | Update flight time. |
| POST | `/api/transfers/:id/notify-driver` | Re-send driver Telegram. |
| POST | `/api/transfers/:id/collect` | Mark cash collected from driver (and post journal — see §13). |
| POST | `/api/transfers/payment` | Record customer payment for a transfer. |
| POST | `/api/transfers/driver-payment` | Pay one driver. |
| POST | `/api/transfers/bulk-driver-payment` | Pay multiple drivers in one journal. |

Public (`/api/public/...`, no JWT, rate-limited):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/public/transfer-booking` | Public booking via store token. Body must include valid `bookingToken`. |
| POST | `/api/public/public-transfer-booking` | Token-less alternative used by the public landing transfers page. |
| GET | `/api/public/booking/transfer/:token` | Token-validated booking page bootstrap. |

### 7.8 Fleet (`routes/fleet.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/fleet` | `can_view_fleet` |
| GET | `/api/fleet/:id` | `can_view_fleet` |
| POST | `/api/fleet/sync` | `can_view_fleet` (kicks off sheets-sync job) |
| POST | `/api/fleet` | `can_edit_fleet` |
| PATCH | `/api/fleet/:id` | `can_edit_fleet` |
| POST | `/api/fleet/purchase` | `can_edit_fleet` (records vehicle purchase + journal) |
| POST | `/api/fleet/sale` | `can_edit_fleet` (records sale + book P&L) |
| GET | `/api/fleet/utilization` | `can_view_fleet_book_value` |

### 7.9 Maintenance (`routes/maintenance.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/maintenance` | `can_view_maintenance` |
| POST | `/api/maintenance` | `can_view_maintenance` (intentional — anyone with view can log; edit gating tightened in V10) |
| PATCH | `/api/maintenance/:id` | `can_edit_maintenance` |
| GET | `/api/maintenance/work-types` | any authenticated |

### 7.10 Inspections (`routes/inspections.ts`)

Mounted at `/api/inspections` outside the main router for clean photo upload handling.

| Method | Path | Permission |
|---|---|---|
| GET | `/api/inspections/items` | any authenticated |
| GET | `/api/inspections/orders/:orderId/...` | `can_view_inbox` |
| POST | `/api/inspections/orders/:orderId/pre` | `can_edit_orders` |
| POST | `/api/inspections/orders/:orderId/post` | `can_edit_orders` |

### 7.11 Cashup (`routes/cashup.ts`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/cashup/expected` | `can_view_cashup` | Calculate expected cash for a date. |
| GET | `/api/cashup/before-close` | `can_view_cashup` | "Before Close" snapshot endpoint. |
| POST | `/api/cashup/reconcile` | `can_view_cashup` | Submit reconciliation via `reconcile_cash_atomic`. |
| POST | `/api/cashup/override` | `can_override_cashup` | Override a locked reconciliation. |
| POST | `/api/cashup/deposit` | `can_view_cashup` | Move cash to safe (atomic). |
| POST | `/api/cashup/inter-store-transfer` | `can_view_cashup` | Atomic `from`/`to` legs. |
| GET | `/api/cashup/pending-extensions` | `can_view_cashup` | List unpaid extension IOUs (mig 092). |
| GET | `/api/cashup/recurring-bills` | `can_view_cashup` | Recurring bills due. |

### 7.12 Card Settlements (`routes/card-settlements.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/card-settlements` | `can_view_cardsettlements` |
| POST | `/api/card-settlements/match` | `can_view_cardsettlements` (atomic `match_card_settlement_atomic`) |

### 7.13 Accounting (`routes/accounting.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/accounting/accounts` | `can_view_accounts` |
| GET | `/api/accounting/accounts/:id` | `can_view_accounts` |
| GET | `/api/accounting/accounts/:id/transactions` | `can_view_accounts` |
| POST | `/api/accounting/manual-journal` | `can_edit_accounts` |
| POST | `/api/accounting/owner-drawing` | `can_edit_accounts` |

### 7.14 Budget (`routes/budget.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/budget` | `can_view_accounts` |
| POST | `/api/budget/:period` | `can_edit_accounts` |
| GET | `/api/budget/:period/p&l` | `can_view_accounts` |

### 7.15 HR & Payroll (`routes/hr.ts`, `routes/payroll.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/hr/employees` | `can_manage_employees` |
| POST | `/api/hr/employees` | `can_manage_employees` |
| PATCH | `/api/hr/employees/:id` | `can_manage_employees` |
| GET | `/api/hr/timesheets` | `can_view_timesheets` |
| POST | `/api/hr/timesheets` | `can_submit_timesheets` |
| PATCH | `/api/hr/timesheets/:id` | `can_edit_timesheets` (mig 20260505023000) |
| POST | `/api/hr/timesheets/:id/approve` | `can_approve_timesheets` |
| POST | `/api/hr/timesheets/:id/reject` | `can_approve_timesheets` |
| GET | `/api/payroll/preview` | `can_view_payroll` |
| POST | `/api/payroll/run` | `can_view_payroll` (atomic `run_payroll_atomic`) |

### 7.16 Expenses (`routes/expenses.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/expenses` | `can_view_expenses` |
| POST | `/api/expenses` | `can_edit_expenses` |
| PATCH | `/api/expenses/:id` | `can_edit_expenses` |
| DELETE | `/api/expenses/:id` | `can_edit_expenses` |
| POST | `/api/expenses/:id/pay` | `can_edit_expenses` |

### 7.17 Customers (`routes/customers.ts`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/customers` | `can_view_inbox` |
| GET | `/api/customers/:id` | `can_view_inbox` |
| GET | `/api/customers/:id/orders` | `can_view_inbox` |
| PATCH | `/api/customers/:id` | `can_edit_orders` |

### 7.18 Config / settings (`routes/config.ts`)

Many endpoints for `addons`, `locations`, `payment_methods`, `vehicle_models`, `vehicle_model_pricing`, `roles`, `users`, `chart_of_accounts`, `payment_routing`, `transfer_routes`, `maintenance_work_types`, `expense_categories`, `recurring_bills`, `leave_config`, `day_types`. All gated behind `can_edit_settings` for writes, public reads for reference data.

### 7.19 Dashboard / Analytics

| Method | Path | Permission |
|---|---|---|
| GET | `/api/dashboard/summary` | `can_view_dashboard` |
| GET | `/api/dashboard/...` | `can_view_dashboard` (multiple aggregations) |
| GET | `/api/analytics/...` | `can_view_dashboard` |

### 7.20 Paw Card (`routes/paw-card.ts`, `routes/public-paw-card.ts`)

Public:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/public/paw-card/establishments` | Public list of partner establishments. |
| GET | `/api/public/paw-card/top-establishments` | Cached aggregate via `top_paw_card_establishments` RPC (mig 084). |
| POST | `/api/public/paw-card/lookup` | Email lookup (heavy rate limit). |
| GET | `/api/public/paw-card/entries` | Customer-savings list (lookup-token gated). |
| GET | `/api/public/paw-card/rental-orders` | Customer's rental orders (lookup-token gated). |
| POST | `/api/public/paw-card/register` | Customer signup (rate-limited 8/15min). |

Staff (`/api/paw-card/*`, JWT):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/paw-card/entries` | Manual paw-card entry creation. |
| GET | `/api/paw-card/savings` | Aggregate savings reports. |

### 7.21 Maya (`routes/maya.ts`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/payments/maya/checkout` | JWT | Create a Maya checkout. Resolves `orderId` against `orders` first then `orders_raw` (mig 083 fix). |
| POST | `/api/payments/maya/webhook` | HMAC signature (`X-Maya-Signature`) | Receives Maya callback. Zod-validated payload, amount-parity check, posts journal entry, marks `maya_checkouts.status='paid'`. Currently sandbox; **production blocked** — see §11. |

### 7.22 Public — Lolo AI (`routes/public-respond.ts`)

Mounted under `/api/public/respond`, gated by `authenticateApiKey` (single static `RESPOND_IO_API_KEY` checked with `crypto.timingSafeEqual`).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/public/respond/fleet` | 5-min in-memory cached fleet pricing/availability for Lolo to quote. |
| GET | `/api/public/respond/transfers` | 5-min cached transfer routes + pricing. |
| GET | `/api/public/respond/booking-lookup` | Look up a booking by reference for Lolo to summarise. |
| POST | `/api/public/respond/quote` | Compute a full booking quote on demand. |
| (more) | various | See file for the full set; designed to expose anything Lolo's prompt needs. |

### 7.23 Other public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/public/reviews` | Public reviews CMS (mig 057). |
| GET | `/api/public/stats` | Public counters (vehicles, customers served). |
| POST | `/api/public/repairs` | Public repair-quote enquiry. |
| POST | `/api/unsubscribe` (`routes/unsubscribe.ts`) | Email unsubscribe via signed token (mig 121). |
| POST | `/api/public/telegram` | Telegram webhook (driver Confirm-button callbacks, mig 105). |
| GET | `/health` | Render health check. |

### 7.24 Internal-only

`/api/dev-tools/*` — owner-only debugging utilities (e.g. test-data reset). Permission-gated. Inspect before exposing externally.
`/api/ui-errors` — receives client error reports.
`/api/lost-opportunities` — list/create lost-opportunity entries.
`/api/todo` — full to-do CRUD with realtime channel.
`/api/directory` — internal supplier directory.
`/api/partners` — affiliate / accommodation partner CRUD.
`/api/chat` — Lolo session metrics dashboard.
`/api/misc-sales`, `/api/merchandise` — non-rental sales.

---

## 8. Frontend Architecture

### 8.1 Bootstrap

`apps/web/src/main.tsx` mounts `<App />`. `App.tsx` configures `QueryClient` (default `staleTime: 30s`, `retry: 1`), `BrowserRouter`, `ErrorBoundary`, the `BetaErrorBanner` opt-in (controlled by `VITE_BETA_ERROR_NOTICE`), and `<DeliveryReminderModal />` (a global modal that pops based on the realtime store).

`router.tsx` defines every route via `lazy()` imports for code-splitting. Two layout patterns:

- **Customer-facing pages** — direct routes under `/book/*`, no auth, mounted as bare components.
- **Backoffice pages** — wrapped by `<ProtectedRoute><AppLayout /></ProtectedRoute>` so they share a sidebar / header. `ProtectedRoute` redirects to `/login` if `useAuthStore.token` is null. `AppLayout` lives at `apps/web/src/components/layout/AppLayout.tsx`.

Two finer-grained guards exist for niche backoffice pages:

- `<RequireFleetBookValue>` → `/fleet/utilization`, `/fleet/asset-register` need `can_view_fleet_book_value`.
- `<RequireAccounts>` → asset register also needs `can_view_accounts`.

### 8.2 Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `<Navigate to="/book" />` | Root redirects to customer homepage. |
| `/login` | `LoginPage` | Username + PIN login. |
| **Customer-facing** | | |
| `/book` | `HomePage` | Marketing landing + brand story + reviews. |
| `/book/reserve` | `BrowseBookPage` | Browse available vehicles for a date range. |
| `/book/basket` | `BasketPage` | Checkout form + payment selector. |
| `/book/confirmation` / `/book/confirmation/:reference` | `ConfirmationPage` | Post-checkout confirmation. |
| `/book/extend` | `ExtendPage` | Customer self-extend an active booking. |
| `/paw-card/partners` (and `/book/paw-card` redirect) | `PawCardPartnersPage` | Public Paw Card partner directory. |
| `/book/transfers` | `TransferBookingPage` | Public transfer-only booking page (van + tuktuk). |
| `/book/transfer/:token` | `PublicBookingPage` | Tokenised transfer booking via store-specific URL. |
| `/book/repairs` | `RepairsPage` | Repair quote enquiry. |
| `/book/about` | `AboutPage` | About / brand story. |
| `/book/privacy` | `PrivacyPage` | Privacy policy. |
| `/book/terms` | `TermsPage` | Terms & conditions. |
| `/book/waiver-agreement` | `WaiverAgreementPage` | Waiver text. |
| `/waiver/:orderReference` | `WaiverPage` | Customer signs waiver per booking. |
| `/refund-policy` | `RefundPolicyPage` | Refund policy. |
| `/peace-of-mind` | `PeaceOfMindPage` | Damage cover sales page. |
| `/book/bepawsitive` | `BePawsitivePage` | Charity programme info. |
| `/book/cancel/:orderReference` | `CancelBookingPage` | Customer self-cancel. |
| `/unsubscribe` | `UnsubscribePage` | Email unsubscribe via signed token. |
| `/affiliates` | `AffiliatesPage` | Affiliate signup landing. |
| `/affiliates/details/:partnerId` | `AffiliatesDetailsPage` | Affiliate detail page. |
| **Backoffice** (under `<AppLayout />`) | | |
| `/dashboard` | `DashboardPage` | Owner KPI dashboard. |
| `/orders/inbox` | `InboxPage` | Unprocessed bookings. |
| `/orders/active` | `ActivePage` | Live rentals. |
| `/orders/completed` | `CompletedPage` | Settled rentals. |
| `/fleet` | `FleetPage` | Fleet list + Gantt calendar. |
| `/fleet/utilization` | `UtilizationDashboard` | Per-vehicle utilisation %. |
| `/fleet/asset-register` | `AssetRegisterPage` | Book values + depreciation. |
| `/maintenance` | `MaintenancePage` | Maintenance queue. |
| `/transfers` | `TransfersPage` | Transfer ops + driver settlement. |
| `/accounts` | `AccountsPage` | Chart of accounts. |
| `/accounts/:id` | `AccountDetailPage` | Per-account journal entries. |
| `/journal` | `ManualJournalPage` | Post manual journal entries. |
| `/budget` | `BudgetPage` | Monthly budget + P&L. |
| `/card-settlements` | `CardSettlementsPage` | Match bank settlement reports. |
| `/cashup` | `CashupPage` | Daily cash reconciliation. |
| `/hr/employees` | `EmployeesPage` | Employee CRUD. |
| `/hr/timesheets` | `TimesheetsPage` | Timesheets. |
| `/hr/payroll` | `PayrollPage` | Payroll preview + run. |
| `/expenses` | `ExpensesPage` | Expense log. |
| `/todo` | `TodoPage` | To-do board with realtime updates. |
| `/misc-sales` | `MiscSalesPage` | Misc sales log. |
| `/merchandise` | `MerchandisePage` | Merchandise inventory + sales. |
| `/lost-opportunity` | `LostOpportunityPage` | Lost-opportunity tracking. |
| `/settings` | `SettingsPage` | All admin settings. |
| `/ui-errors` | `UIErrorsPage` | Client-side error log. |
| `/dev-tools` | `DevToolsPage` | Owner-only debug. |
| `/directory` | `DirectoryPage` | Internal supplier directory. |
| `/customers` | `CustomersPage` | Customer browser. |
| `/partners` | `PartnersPage` | Affiliate / accommodation partner manager. |
| `/analytics` | `AnalyticsPage` | Funnel & cohort analytics. |
| `*` | `NotFoundPage` | 404. |

### 8.3 Component hierarchy (high-level)

- `components/layout/`
  - `AppLayout.tsx` — sidebar + header + `<Outlet />`
  - `Sidebar.tsx`, `Header.tsx`, `MobileNavbar.tsx`
- `components/orders/`
  - `OrderDetailModal.tsx` — split into `OrderDetailSummaryTab`, `OrderDetailPaymentsTab`, `OrderDetailVehiclesTab`, `OrderDetailAddonsTab`, `OrderDetailHistoryTab` (refactored from V9 monolith)
  - `BookingModal.tsx` (Inbox flow), `WalkInBookingModal.tsx` (walk-in flow)
  - `DeliveryReminderModal.tsx` — shows globally based on realtime store
- `components/orders/extensions/`
  - `ExtendOrderModal.tsx`, `ExtendOrderSummary.tsx`
- `components/cashup/` — denomination counter, before-close modal, deposit-to-safe, inter-store transfer
- `components/fleet/` — `GanttCalendar.tsx`, `VehicleEditModal.tsx`, `FleetPurchaseModal.tsx`, `FleetSaleModal.tsx`
- `components/hr/` — `EmployeeModal.tsx`, `TimesheetEditModal.tsx`, `PayrollPreview.tsx`
- `components/maintenance/` — `MaintenanceLogModal.tsx`, `InspectionModal.tsx`
- `components/transfers/` — `TransferModal.tsx`, `DriverSettlementModal.tsx`
- `components/booking/` — public booking carousel, vehicle card, model selector
- `components/basket/` — checkout form, payment selector, summary
- `components/confirmation/` — confirmation summary, IDP info, paw card pitch
- `components/extend/` — public extend flow
- `components/repairs/` — repair-quote form
- `components/waiver/` — waiver signature canvas, licence upload
- `components/seo/` — `<SEO/>` for per-page meta tags
- `components/hero/` — homepage GSAP/OGL hero
- `components/about/`, `components/home/`, `components/public/` — marketing copy blocks
- `components/ui/` — shared primitives (Modal, Table, Button, Input, Select, Badge, Toast, ScrollToTop)
- `components/common/` — `ErrorBoundary`, `BetaErrorBanner`
- `components/chat/` — Lolo session viewer
- `components/dashboard/` — KPI tiles, charts

### 8.4 State management

- **Server state:** TanStack Query everywhere. Each `apps/web/src/api/*.ts` file exposes thin fetchers; pages call them via `useQuery`/`useMutation`. There is no Redux.
- **Auth state:** `stores/auth-store.ts` Zustand store (persisted in `localStorage` under key `lolas-auth`).
- **Customer booking basket:** `stores/bookingStore.ts` Zustand store (also persisted) — keeps the in-progress reservation across page reloads.
- **UI state:** `stores/ui-store.ts` for global UI toggles.
- **Realtime:** `stores/realtime.ts` + `hooks/useTaskRealtime.ts` subscribe to Supabase realtime channels (todo updates, delivery reminders).
- **Toast notifications:** `hooks/useToast.ts` via `stores/task-notification-store.ts`.

### 8.5 Auth flow

1. User submits username + PIN to `/api/auth/login`.
2. API verifies the bcrypt-hashed PIN, builds a JWT payload `{ userId, username, employeeId, roleId, storeIds, permissions }`, signs it HS256 with `JWT_SECRET`, returns it with the user payload.
3. Web stores the token + user in `useAuthStore` via Zustand `persist` (localStorage).
4. `apps/web/src/api/client.ts` adds `Authorization: Bearer <token>` to every API request from `useAuthStore.getState().token`.
5. On any 401 (other than `/auth/login`), the client calls `useAuthStore.logout()` and throws `Session expired`. Routing then redirects to `/login` because `ProtectedRoute` sees no token.
6. There is **no refresh token**. Tokens expire at 24h. The user re-logs in.

`useAuthStore.hasPermission(p)` is the simple in-app permission check used by sidebar visibility and the two `Require*` guards.

---

## 9. Domain Model & Business Logic

### 9.1 Order lifecycle

States and transitions (see `packages/shared/src/constants/order-status.ts` and `packages/domain/src/value-objects/order-status.ts`):

```
                         ┌──────────────────────────┐
                         │                          ▼
[orders_raw]  ──process──►  active  ──settle──►  completed
   unprocessed              │                       ▲
       │                    │                       │
       └────cancel──────────┴──cancel──────────► cancelled
                                                    ▲
                                                    │
[walk-in-direct] ─────────────────────────────►   active  (immediately)
                                                  (then settle as normal)
```

| From | To | Trigger | Required Permission | API Call |
|---|---|---|---|---|
| `orders_raw.unprocessed` | `orders.active` | Inbox "Process" | `can_edit_orders` | `POST /api/orders-raw/:id/process` |
| `orders_raw.unprocessed` | `orders_raw.cancelled` | Inbox "Cancel" / customer self-cancel link | `can_cancel_orders` (staff) or token (customer) | `POST /api/orders-raw/:id/cancel` or `PATCH /api/public/booking/cancel/:reference` |
| (none) | `orders.active` | Walk-in-direct | `can_edit_orders` | `POST /api/orders-raw/walk-in-direct` |
| `orders.active` | `orders.completed` | Settle on return | `can_edit_orders` | `POST /api/orders/:id/settle` |
| `orders.active` | `orders.cancelled` | Cancel mid-rental | `can_cancel_orders` | `POST /api/orders/:id/cancel` |
| `orders.active` | `orders.active` (mutated) | Adjust dates / swap vehicle / modify addons / collect payment / extend | `can_edit_orders` | various PATCH/POST |

Activation runs through `process_raw_order_atomic` (process flow) or `activate_order_atomic` (walk-in / direct activation): inserts customer, order, items, addons, fleet status updates, and journal legs (DR Receivable, CR Income; charity legs DR Receivable, CR Charity-Payable) in one PG transaction. Settlement runs through `settle_order_atomic`: deposit applied/refunded legs, optional final payment legs, optional card-settlement row, fleet release, mark `completed`, absorb pending extension IOUs (mig 092).

Statuses are tracked per row in `orders.status` and `orders_raw.status`. The domain layer's `OrderStatus` value object enforces transitions in TypeScript; the SQL layer doesn't enforce transitions but the RPCs assume the right starting state.

### 9.2 Cash management & cash-up

**Why it exists.** Each store handles physical cash daily. The system needs to know what the till should hold at any moment so a manager can count it and reconcile.

**Daily flow.**

1. **Opening balance.** Each store has a `default_float` (e.g. ₱5,000) seeded into the till. The opening balance for any given day is the previous day's `closing_balance`, or the float if it's day one.
2. **Throughout the day.** Every cash-paid `payment` (rentals, deposits, addons) increments the till's expected cash. Every cash-paid `expense` decrements it. The expected cash for any given moment is computable from the `journal_entries` posted to the cash account.
3. **End of day.** A staff member opens `/cashup`, picks the date and store, and:
   - The "Expected" column shows what the journal says.
   - The denomination counter (`till_denoms` jsonb) lets them count physical notes/coins.
   - The "Counted" column shows the sum.
   - Variance = counted − expected.
4. **Submit.** `POST /api/cashup/reconcile` calls `reconcile_cash_atomic`, which inserts the `cash_reconciliation` row and locks it (`is_locked=true`).
5. **Override.** A user with `can_override_cashup` can re-open a locked reconciliation via `POST /api/cashup/override`.
6. **Deposit to safe.** Cash beyond the float can be moved to the safe via `POST /api/cashup/deposit` — atomic journal `DR Safe, CR Cash Till`.
7. **Inter-store transfer.** Cash moved between stores is recorded via `POST /api/cashup/inter-store-transfer` — atomic two-leg journal across stores.

The `before_close_tables` migration (053) supports a "Before Close" preview modal that shows what the closing entries will look like before submitting.

### 9.3 Payroll

**Cadence.** Payroll runs twice a month: mid-month (15th) and end-of-month. Whether a run is "end of month" is passed in the request and affects which `cash_advance_schedules` rows are settled (`payday_type = mid_month` or `end_of_month`, mig 116/140).

**Calculation** (`packages/domain/src/services/payroll-calculator.ts`):

For each active employee in the store (excluding monthly-rate employees, who are handled separately):

1. **Gross pay.** Sum of (hours × rate) across approved timesheets in the period, with multipliers per `day_type` (Sunday, Holiday, etc.).
2. **Bonuses.** Per-employee bonuses passed in the request body.
3. **Deductions.** Cash advance deduction per the `payday_type`-tagged schedule rows.
4. **Net pay.** Gross + bonuses − deductions.

**Payment posting.**

For each payslip, a journal transaction is built:

- `DR Wages Expense` (`WAGES-EXP-store-lolas` or whatever `resolvePayrollAccounts` returns for that store)
- `CR Cash / GCash / Union Bank` based on `paymentMethod`. Cash splits across `till` and `safe` per the request.

Hardcoded `PAYROLL_JOURNAL_STORE = 'store-lolas'` means **all payroll journals are posted against `store-lolas`**, even for `store-bass` employees. This is intentional today (one company-level payroll book) — but be aware. See §13 Q-01.

**Idempotency.** `payroll_runs` (mig 080) has a UNIQUE constraint on `(store_id, period_start, period_end)`. A second run for the same window raises `unique_violation`, which the API maps to HTTP 409 `PAYROLL_ALREADY_RUN`.

**Cash advances.** After the journal posts, `settleCashAdvances` reduces `cash_advance_schedules.remaining_balance` by the deducted amount (and clears legacy `employees.current_cash_advance` on end-of-month runs). Schedule rows are tagged with the `payday_type` so mid-month and end-of-month deductions stay on their own cadences.

### 9.4 Fleet & maintenance

**Vehicle lifecycle.**

- **Available** — rentable.
- **Active** — currently on a rental. Set by `activate_order_atomic`. Released back to Available by `settle_order_atomic`.
- **Under Maintenance** — being serviced. Manually set; cleared when the maintenance record is `Completed` (often manual still).
- **Service Vehicle** — internal use.
- **Pending ORCR** — registration renewal.
- **Closed** — retired.
- **Sold** — disposed. Set by the fleet sale flow (which also posts a P&L journal).

`isRentable` (in `packages/domain/src/entities/vehicle.ts`) returns true only for `Available`. Activation throws `NonRentableVehicleError` otherwise.

**Gantt calendar.** `FleetPage` includes a calendar showing each vehicle's bookings on a horizontal grid. Cells are computed from `order_items.pickup_datetime` / `dropoff_datetime`. Heavy on render — see §13 P-04.

**Depreciation.** `packages/domain/src/services/depreciation-service.ts` implements straight-line monthly depreciation. `post_batch_depreciation` (mig 119) is the manual posting RPC; depreciation is not currently auto-posted.

**Maintenance jobs.** Lifecycle: `Reported → In Progress → Completed`. Status changes fire Telegram messages to the Maintenance channel. Cost can be split between `parts` and `labour`.

### 9.5 Transfers (airport / shuttle)

**Pricing types** (`transfer_routes.pricing_type`, mig 052):

- **`fixed`** — `total_price = price` regardless of pax count. Used for Private Van and Private TukTuk.
- **`per_head`** — `total_price = price × pax_count`. Used for Shared Van.

The seed in `supabase/seed.sql` shows the canonical six rows (3 van types × 2 directions), all `store-lolas`.

**Public booking flow.**

1. `/book/transfers` (`TransferBookingPage.tsx`) — public marketing page for transfers. Customer picks van type, direction, date, time, pax count, accommodation, contact info. Calls `POST /api/public/public-transfer-booking`. Rate-limited.
2. `/book/transfer/:token` (`PublicBookingPage.tsx`) — token-gated variant for partners (each store has a `public_booking_token` column on `stores`).
3. Server validates, computes price, inserts `transfers` row, fires email to customer + Telegram to Ops.

**Operational flow.**

1. Transfer appears in `/transfers` (backoffice).
2. `notifyNewTransfer` (`telegram.service.ts`) posts to the relevant driver channel (van vs. tuktuk) with an inline "Confirm" button. The driver taps it; the webhook (`telegram.webhook.ts`) records the confirmation and edits the message to remove the button.
3. After the run, the driver hands the cash to the office. Staff click "Mark Collected" in `/transfers`, which posts to `POST /api/transfers/:id/collect` — this records `collected_amount`/`collected_at` and (post-V10 fix) posts the journal leg.
4. Driver settlement runs via `POST /api/transfers/driver-payment` (single) or `POST /api/transfers/bulk-driver-payment` (batch).

**Pickup time computation.** `apps/api/src/transfers/pickup-time.ts` reads pickup rules from `transfer_pickup_rules` (mig 086, 126) — a JSON-driven table that maps direction × van type × flight-time offset to a pickup window. The driver's Telegram message includes `pickup_time_from` / `pickup_time_to` so they have a clean window.

### 9.6 Lolo AI agent (respond.io)

**What it is.** Lolo is an AI agent running inside [respond.io](https://respond.io) — a chat platform that aggregates Facebook Messenger, Instagram DM, WhatsApp, and the website chat widget. The agent's prompt is configured in respond.io itself; we don't store it in this repo.

**What it does.** Lolo handles inbound customer enquiries 24/7: vehicle availability questions, pricing quotes, transfer bookings, booking lookups. When it needs real-time data (live availability, current pricing, an actual booking record), it calls our API at `/api/public/respond/*`.

**How it talks to us.** Every call carries a static `X-API-Key: <RESPOND_IO_API_KEY>` header. `apps/api/src/middleware/authenticateApiKey.ts` checks it with `crypto.timingSafeEqual` and rejects with 401 if it doesn't match. There is **no per-conversation auth** — the API key is the single trust boundary.

**Behaviour rules to know.**

- All Lolo endpoints respond with **plain English** prose where appropriate (some return JSON), so the agent can paste fragments straight into chat.
- Caching: fleet (`/api/public/respond/fleet`) and transfers (`/api/public/respond/transfers`) are cached in-memory for 5 minutes to avoid hammering the DB on every chat turn.
- `STORE_ID = 'store-lolas'` is hardcoded — Lolo currently only quotes for the Lola's brand, not Bass.
- `CALLOUT_CHARGE = { minimum: 200, per_km: 20 }` is hardcoded for now (no DB table; see §13 Q-10).
- `chat_sessions` (mig 115, 131, 151) tracks each conversation's interaction count and topic tags — used by `/chat` (the Chat dashboard) for QA on agent performance.

**Lolo never writes to the database** — it only reads and quotes. Any actual booking is done via the public booking endpoints by the customer (or by Lolo prompting the customer to use the URL).

---

## 10. Email & Notification System

### 10.1 Transactional emails (Resend)

All email flows use the helper `sendEmail({ to, from, subject, html, text })` in `apps/api/src/services/email.ts`. The helper silently no-ops if `RESEND_API_KEY` is unset and never throws (intentional: email failure must not break a booking).

`escapeHtml(str)` is exported and is used by every template that interpolates user-supplied strings. **Never** interpolate raw values into HTML email bodies — use `escapeHtml` on every value.

| Trigger | Template | Recipient | Sender |
|---|---|---|---|
| Customer completes website booking | `bookingConfirmationHtml` (`email-templates/customer.ts`) | Customer email | `EMAIL_FROM_BOOKINGS` (`bookings@lolasrentals.com`) |
| Customer completes walk-in-direct (staff-recorded) | `bookingConfirmationHtml` (sometimes skipped if customer email absent) | Customer email | `EMAIL_FROM_BOOKINGS` |
| Staff alert: new website booking | `bookingStaffAlertHtml` (`email-templates/staff.ts`) | `NOTIFICATION_EMAIL` | `EMAIL_FROM_INTERNAL` |
| Staff alert: new walk-in-direct | `walkInStaffAlertHtml` | `NOTIFICATION_EMAIL` | `EMAIL_FROM_INTERNAL` |
| Customer extends booking | `extendConfirmationHtml` | Customer email | `EMAIL_FROM_BOOKINGS` |
| Customer cancels booking | `bookingCancellationHtml` | Customer email | `EMAIL_FROM_BOOKINGS` |
| Customer signs waiver | `waiverConfirmationHtml` | Customer email | `EMAIL_FROM_CUSTOMER` |
| Reminder: customer hasn't signed waiver | `waiverReminderHtml` | Customer email | `EMAIL_FROM_BOOKINGS` |
| Day after rental ends | `postRentalThankYouHtml` | Customer email | `EMAIL_FROM_CUSTOMER` |
| Transfer booked (public flow) | `transferBookingConfirmationHtml` | Customer email | `EMAIL_FROM_BOOKINGS` |
| Transfer driver assigned | `driverNotificationHtml` (`email-templates/driver.ts`) | `DRIVER_EMAIL` | `EMAIL_FROM_INTERNAL` |
| Transfer pickup confirmed (driver tapped Confirm) | `transferPickupConfirmationHtml` | Customer email | `EMAIL_FROM_BOOKINGS` |
| Maintenance log created/updated | `maintenanceLogHtml` (`email-templates/maintenance.ts`) | `NOTIFICATION_EMAIL` | `EMAIL_FROM_INTERNAL` |
| Inspection completed | `inspectionLogHtml` | `NOTIFICATION_EMAIL` | `EMAIL_FROM_INTERNAL` |

Dedupe tables prevent duplicates:

- `waiver_reminder_log` (mig 063) — one reminder per booking.
- `post_rental_email_log` (mig 064) — one thank-you per booking.
- `delivery_reminder_log` (mig 146) — one delivery reminder per pickup-day.
- `return_reminder_log` (mig 154) — one return reminder per return-day.
- `post_rental_review_log` (mig 157) — one Google-review WhatsApp per booking.

Unsubscribe is handled by signed tokens (`apps/api/src/utils/unsubscribe-token.ts` + `routes/unsubscribe.ts` + `email_opt_out` table, mig 121). All customer emails should include the unsubscribe link.

### 10.2 Telegram channels

A single bot (`TELEGRAM_BOT_TOKEN`) sends to multiple chat IDs. `getTelegramChatId(kind)` in `apps/api/src/lib/telegram.ts` switches on a `kind`.

| Channel `kind` | Env var | What is posted |
|---|---|---|
| `ops` | `TELEGRAM_OPS_CHAT_ID` | Order activated (walk-in or inbox-process), order details |
| `paid_orders` | `TELEGRAM_PAID_ORDERS_CHAT_ID` | Same activated-order alert, **staggered 3 seconds** after Ops, so notification sounds don't collide |
| `fleet` | `TELEGRAM_FLEET_CHAT_ID` | Fleet status changes (purchase, sale, status manual edit) |
| `daily` | `TELEGRAM_DAILY_CHAT_ID` | 7am morning briefing (`daily-summary.ts`) and 6pm evening snapshot (`fleet-summary.ts`) |
| `maintenance` | `TELEGRAM_MAINTENANCE_CHAT_ID` | Maintenance job created / status change |
| `driver` | `TELEGRAM_DRIVER_CHAT_ID` | Legacy single-driver fallback |
| `van` | `TELEGRAM_VAN_CHAT_ID` | Van transfers info-only group (no Confirm button) |
| `van_driver` | `TELEGRAM_VAN_DRIVER_CHAT_ID` | Van driver's personal chat (gets the Confirm button) |
| `tuktuk` | `TELEGRAM_TUKTUK_CHAT_ID` | TukTuk transfers info-only group |
| `tuktuk_driver` | `TELEGRAM_TUKTUK_DRIVER_CHAT_ID` | TukTuk driver's personal chat (gets the Confirm button) |
| `feedback` | `TELEGRAM_FEEDBACK_CHAT_ID` | Customer review / NPS feedback |
| `todo` | `TELEGRAM_TODO_CHAT_ID` | To-do list visibility board |
| `default` | `TELEGRAM_CHAT_ID` | Owner's personal chat (fallback for everything) |

When the bot token or a given chat id is unset, alerts targeting that channel are silently skipped — by design. This is what makes local development quiet.

### 10.3 Driver Confirm-button webhook

Migration 105 (`105_transfer_telegram_automation.sql`) adds the columns the webhook flow needs. The flow:

1. `notifyNewTransfer` posts to the driver channel with an inline keyboard containing one "Confirm" button. The Telegram `message_id` is stored on `transfers.telegram_message_id`.
2. When the driver taps Confirm, Telegram POSTs a `callback_query` to our webhook URL (`https://api.lolasrentals.com/api/public/telegram`), handled by `apps/api/src/telegram/telegram.webhook.ts`.
3. The webhook updates the transfer row, calls `editMessageReplyMarkup` to remove the button (so it can't be tapped twice), `answerCallbackQuery` to dismiss the loading spinner on the driver's device, and emails the customer their pickup confirmation.

To get this working you must register the webhook URL with Telegram's `setWebhook` once after deploy (one-off).

### 10.4 Fire-and-forget pattern

Every email send and Telegram message is fire-and-forget: the API returns the HTTP response **before** the email/Telegram is sent. The pattern looks like:

```ts
res.status(201).json({ success: true, data: result });

void (async () => {
  try {
    await notifyDriver(...);
    await sendEmail(...);
  } catch (err) {
    logger.error({ err }, 'fire-and-forget notification failed');
  }
})();
```

**Why.** A booking submission shouldn't fail because Telegram's API blipped or Resend rate-limited us. The customer must see their confirmation page.

**Trade-off.** A failed email or Telegram is invisible to the user and very hard to recover after the fact. We mitigate this with structured logging (pino → Render logs) and dedupe tables. See §13 for the open recovery story.

---

## 11. External Integrations

### 11.1 Supabase

- **Purpose.** Postgres database, RLS, realtime channel for the to-do board.
- **Project.** Single project (project ref in `SUPABASE_URL`). No separate dev/staging projects in production today — see §16.
- **Credentials.** `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (never expose), `SUPABASE_ANON_KEY` (web frontend only). On Render: same. On Vercel: only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- **Where keys live.** API uses service-role key for all writes (bypasses RLS). Web uses anon key for realtime channels.
- **Known issues.** None at present. Migration history is the operational risk — see §6.5.

### 11.2 Resend

- **Purpose.** Transactional email.
- **Sender domain.** `lolasrentals.com` (verified in Resend; DKIM/SPF records in Hostinger DNS — see `docs/DELIVERABILITY_CHECKLIST.md`).
- **From addresses.** `bookings@lolasrentals.com`, `hello@lolasrentals.com`, `maintenance@lolasrentals.com` — all aliases on the same verified domain.
- **Credentials.** `RESEND_API_KEY` in API env only.
- **Known issues.** None functional. Recommend setting up DMARC `p=quarantine` with reporting (see §13 / §16). Verify deliverability after any DNS changes.

### 11.3 Telegram bot

- **Purpose.** Operational notifications + driver Confirm-button workflow.
- **Bot.** Single bot, multiple chat IDs (see §10.2).
- **Credentials.** `TELEGRAM_BOT_TOKEN` plus per-channel chat IDs. Issued by [@BotFather](https://t.me/BotFather).
- **Setup.** After deploy, register the webhook URL once: `curl https://api.telegram.org/bot$TOKEN/setWebhook -d url=https://api.lolasrentals.com/api/public/telegram`.
- **Known issues.** Confirm buttons on stale messages return errors silently (logged, not user-visible). If you're investigating "the button didn't work," check pino logs for `editMessageReplyMarkup failed`.

### 11.4 Cloudinary

- **Purpose.** All image hosting (vehicle photos, partner logos, hero images).
- **Cloud name.** `lolas-rentals` (or as configured in `VITE_CLOUDINARY_CLOUD_NAME`).
- **Credentials.** Public-by-design — the cloud name is in the bundle. Uploads are done via the Cloudinary dashboard, not via the app. URLs stored in `vehicle_models.metadata`, `accommodation_partners.logo_url`, etc.
- **Known issues.** No upload UI inside the platform — all uploads happen on Cloudinary's dashboard. If you add an upload feature, do it server-side with a signed upload preset, not the unsigned variant.

### 11.5 Maya (PayMaya / Maya Business)

- **Purpose.** Online card and GCash payments.
- **Status.** **Built but currently disabled.** The "Pay online" payment method is hidden from the customer-facing checkout (`payment_methods.show_on_customer_website = false` on the Maya row, mig 107). The integration is feature-complete on our side: `maya_checkouts` table, signed webhook handler, journal posting, raw-order fallback.
- **The blocker.** Maya's onboarding flow returned a `K004` error during the production-account application. K004 is Maya's "merchant account verification incomplete or rejected" error — it sits between Maya's KYC team and our owner. **Until K004 is resolved with Maya, we cannot use production keys**, only sandbox keys. The owner is the point of contact for the Maya account.
- **Credentials.** `MAYA_SECRET_KEY`, `MAYA_PUBLIC_KEY`, `MAYA_WEBHOOK_SECRET`, `MAYA_BASE_URL` (`https://pg-sandbox.maya.ph` or `https://pg.maya.ph`).
- **Sandbox testing.** `apps/api/src/services/maya.ts` and `routes/maya.ts` work end-to-end against sandbox. Use the standard Maya test cards from their docs.
- **Webhook URL.** `https://api.lolasrentals.com/api/payments/maya/webhook` (set in Maya dashboard for the merchant).
- **What to do when unblocked.** Rotate `MAYA_SECRET_KEY` + `MAYA_WEBHOOK_SECRET` in Render dashboard, change `MAYA_BASE_URL` to `https://pg.maya.ph`, push a ₱1 real transaction end-to-end, verify journal entry + payments row + balance update in Supabase, then set `payment_methods.show_on_customer_website = true` on the Maya row to expose it to customers. See `docs/OPS_RUNBOOK.md` for the full checklist.

### 11.6 respond.io / Lolo AI agent

- **Purpose.** 24/7 customer chat across Facebook, Instagram, WhatsApp, and website widget.
- **Where Lolo lives.** Inside respond.io's "Conversation Automation" — the agent prompt and conversation flow are configured there, not in our repo.
- **Credentials.** `RESPOND_IO_API_KEY` — a single static API key, used as the `X-API-Key` header on every call to `/api/public/respond/*`. Generated in respond.io dashboard. Owner has the credential.
- **Endpoints we expose.** See §7.22.
- **Known issues.** Hardcoded `STORE_ID = 'store-lolas'` and `CALLOUT_CHARGE` constants in `apps/api/src/routes/public-respond.ts` — see §13 Q-10. Any change to fleet pricing requires waiting up to 5 minutes for the in-memory cache to expire (or restart the API).

---

## 12. Authentication & Security

### 12.1 Auth chain end-to-end

1. **Login.** `POST /api/auth/login` accepts `{ username, pin }`. Username is matched case-insensitively against `users.username` (with `ILIKE` and the wildcards `%` `_` `\` `,` `(` `)` escaped — see `escapeForILikeExact`). PIN is verified against `pin_hash` (bcrypt, cost 10).
2. **JWT issued.** Payload: `{ userId, username, employeeId, roleId, storeIds, permissions }`. `storeIds` is the union of `employee_stores.store_id` rows plus the legacy `employees.store_id` if the join is empty. `permissions` is the array of `role_permissions.permission` for the user's role.
3. **Token storage.** Web stores token + user in `useAuthStore` (Zustand persist → localStorage key `lolas-auth`).
4. **Per-request auth.** `apps/web/src/api/client.ts` adds `Authorization: Bearer <token>` to every API call. The API's `authenticate` middleware (`apps/api/src/middleware/authenticate.ts`) verifies the token via `verifyToken` (HS256 with `JWT_SECRET`), attaches `req.user`, and calls `next()`.
5. **Permission gate.** Routes that need permissions wrap with `requirePermission('can_xyz', ...)` (`middleware/authorize.ts`), which 403s if any are missing.
6. **API-key auth (Lolo only).** `/api/public/respond/*` is gated by `authenticateApiKey` (`X-API-Key` header), checked with `crypto.timingSafeEqual`. Different mechanism, same goal.
7. **Session expiry.** Tokens expire at 24h. There is no refresh — user re-logs in. Any 401 from a non-`/auth/login` endpoint triggers `useAuthStore.logout()` on the client.

### 12.2 Authorisation model

Permissions are strings, defined in `packages/shared/src/constants/permissions.ts`:

| Permission constant | DB string | What it allows |
|---|---|---|
| `Permission.ViewInbox` | `can_view_inbox` | View `orders_raw` queue + active/completed orders + customer detail |
| `Permission.ViewActive` | `can_view_active` | View active orders |
| `Permission.ViewCompleted` | `can_view_completed` | View completed orders |
| `Permission.EditOrders` | `can_edit_orders` | Process / activate / modify / settle / collect payments |
| `Permission.CancelOrders` | `can_cancel_orders` | Cancel orders (in inbox or active) |
| `Permission.ViewFleet` | `can_view_fleet` | View fleet list / Gantt |
| `Permission.EditFleet` | `can_edit_fleet` | Edit fleet records, purchases, sales |
| `Permission.ViewFleetBookValue` | `can_view_fleet_book_value` | Utilisation + asset register (financial) |
| `Permission.ViewMaintenance` | `can_view_maintenance` | View maintenance + create entries |
| `Permission.EditMaintenance` | `can_edit_maintenance` | Edit existing maintenance records |
| `Permission.ViewTransfers` | `can_view_transfers` | View transfers list |
| `Permission.EditTransfers` | `can_edit_transfers` | Create + edit + driver settlement |
| `Permission.ViewCardSettlements` | `can_view_cardsettlements` | View + match card settlements |
| `Permission.ViewExpenses` | `can_view_expenses` | View expenses |
| `Permission.EditExpenses` | `can_edit_expenses` | Create + edit + delete + pay expenses |
| `Permission.ViewTimesheets` | `can_view_timesheets` | View timesheets |
| `Permission.SubmitTimesheets` | `can_submit_timesheets` | Submit own timesheet |
| `Permission.EditTimesheets` | `can_edit_timesheets` | Edit submitted timesheets (mig 20260505023000) |
| `Permission.ApproveTimesheets` | `can_approve_timesheets` | Approve timesheets for payroll |
| `Permission.ViewPayroll` | `can_view_payroll` | View + run payroll |
| `Permission.ViewAccounts` | `can_view_accounts` | View chart of accounts + journal |
| `Permission.EditAccounts` | `can_edit_accounts` | Manual journal entries + COA edits + roles + users |
| `Permission.ViewCashup` | `can_view_cashup` | View + reconcile cash-up |
| `Permission.OverrideCashup` | `can_override_cashup` | Re-open locked reconciliations |
| `Permission.ViewMiscSales` | `can_view_miscsales` | View misc sales |
| `Permission.ViewLostOpportunity` | `can_view_lostopportunity` | View lost opportunity log |
| `Permission.ViewTodo` | `can_view_todo` | View + comment on to-do tasks |
| `Permission.ManageTodo` | `can_manage_todo` | Create + assign + delete to-do tasks |
| `Permission.ManageEmployees` | `can_manage_employees` | Employee CRUD |
| `Permission.EditSettings` | `can_edit_settings` | Settings (locations, addons, pricing, payment methods, etc.) |
| `Permission.ViewDashboard` | `can_view_dashboard` | Owner KPI dashboard |
| `Permission.ViewUIErrors` | `can_view_uierrors` | UI error log |

Roles are configured in `/settings` (Roles & Users) and stored in `roles` + `role_permissions`. Typical roles in production:

- **Admin** — every permission.
- **Manager** — most permissions excluding `can_edit_accounts`, `can_manage_employees`, `can_view_payroll`, `can_view_fleet_book_value`.
- **Frontline staff** — `can_view_inbox`, `can_view_active`, `can_view_completed`, `can_edit_orders`, `can_view_fleet`, `can_view_transfers`, `can_view_cashup`, `can_view_maintenance`.
- **Driver** — minimal; mostly receives Telegram messages, doesn't log in.

### 12.3 RLS as defence in depth

The API uses the service-role key, which bypasses RLS. RLS is the second line of defence. See §6.4 for the policy summary. Most policies were tightened in `058_rls_missing_tables.sql`, `066_security_and_schema_fixes.sql`, and `072_remaining_security_fixes.sql`.

### 12.4 Other security controls

- **Rate limiting.** `loginLimiter` (5/15min on `/auth`), `publicLimiter` (60/min on `/public`), `apiLimiter` (200/min default), plus per-route limiters (`holdLimiter` 20/10min, `cancelLimiter` 10/h, `bookingLimiter`, `lookupLimiter`, `enrollLimiter` 8/15min on partner enrollment, `waiverLimiter` 20/15min). Trust proxy is set so Render's `X-Forwarded-For` is honoured.
- **CORS.** Allow-list built in `server.ts:buildCorsAllowedOrigins`. Requires `CORS_ORIGIN` (primary) and optional `ALLOWED_ORIGIN` (CSV). Localhost is auto-added in non-production.
- **Helmet.** Default config (no custom CSP yet; pushed to post-launch — see V10 S-15).
- **Input validation.** All POST/PATCH bodies use `validateBody(zodSchema)` from `middleware/validate.ts`. All query params use `validateQuery`. Errors are 400 with `VALIDATION_ERROR` code.
- **HTML escaping.** `escapeHtml` in `services/email.ts` is used in every email template.
- **Secrets.** All secrets are env vars. No hardcoded API keys in source.
- **Single-use cancellation tokens.** Mig 073 enforces `cancellation_token_used` flag. Token is also length-checked (≥16 chars).
- **Maya webhook verification.** HMAC-SHA256 with `crypto.timingSafeEqual`; rejects on signature length mismatch.

### 12.5 Known security gaps (specific)

- **JWT in localStorage.** `apps/web/src/stores/auth-store.ts:30–34` persists the JWT to localStorage. Any XSS on the SPA can exfiltrate it. The intended fix is httpOnly cookies + CSRF; not implemented yet. Risk is mitigated by SPA being React + sanitised by default, no `dangerouslySetInnerHTML` in our codebase.
- **Order reference brute-force.** Order references are 4-hex (~65k space). Customer self-cancel and self-extend rely on order reference + email. The email check is the gate. Acceptable today; increase entropy in a future migration.
- **No JWT revocation.** Tokens are valid for 24h regardless of password change / role change. No deny-list. If you rotate a user's permissions, they may keep elevated access until their JWT expires.
- **Static respond.io API key.** Compromise = full read access to internal data via Lolo endpoints. Rotate periodically; support per-conversation auth in the future.
- **CORS fallback.** `server.ts:79` falls back to `https://lolas-rentals-management-web.vercel.app` if `CORS_ORIGIN` is unset. In production this must be set explicitly to the live origin.
- **No CSP.** Helmet is at defaults. Define a CSP once you've audited inline styles.
- **No CSRF tokens.** We rely on CORS + JWT-in-Authorization-header (not cookies), which is the standard SPA mitigation. If you ever move to cookie auth, you must add CSRF.

`SECURITY.md` documents the previous full audit (37 findings, 36 closed; the one open is a manual storage-bucket policy step in Supabase dashboard).

---

## 13. Known Issues & Technical Debt

This is a current, post-V10 view. Items the V10 audit flagged that have been **closed** are noted as ✅ at the end of the section. Read this list before starting any non-trivial work — many of the issues here will surface when you touch their area of the code.

### 🔴 CRITICAL

> **Status update.** The five "no DB transactions on critical operations" items the prompt asks me to verify are **closed in code today**. They were the V10 audit's main concern and were resolved by migrations 077–081, 092–093, 098–099, plus the corresponding use-case rewrites. Verification details below.

**C-01 — Order activation has no DB transaction (resolved in code).** ✅
- **Resolution.** `activate_order_atomic` (mig 049, 067, 079, 098, 099) wraps the order + items + addons + fleet status updates + journal legs in one PG transaction; charity legs are folded in (mig 079). `process_raw_order_atomic` (mig 077, 090) extends this to the full Inbox-process flow including customer upsert, payments, transfers, and `orders_raw.status` flip. The use-case files `apps/api/src/use-cases/orders/activate-order.ts:167–177` and `apps/api/src/use-cases/orders/process-raw-order.ts` (whole file) call exactly one RPC each.
- **Verify in your environment.** `SELECT proname FROM pg_proc WHERE proname IN ('activate_order_atomic','process_raw_order_atomic') ORDER BY 1;` should return both. If either is missing, your DB is behind. Apply migrations 049, 067, 077, 079, 090, 098, 099.

**C-02 — Cashup submit has no DB transaction (resolved in code).** ✅
- **Resolution.** `reconcile_cash_atomic` (mig 047) inserts/updates `cash_reconciliation` and posts journal legs in one transaction. The `cashReconciliationRepo.reconcileAtomic` adapter calls only this RPC. See `apps/api/src/use-cases/cashup/reconcile-cash.ts:85`.

**C-03 — Expense create / delete have no DB transaction (resolved in code).** ✅
- **Resolution.** Mig 045 (`pay_expenses_atomic`) wraps creation with journal posting; the `expenseRepo.createWithJournal` and `expenseRepo.deleteWithJournal` methods are single atomic writes. See `apps/api/src/use-cases/expenses/create-expense.ts:89` and `delete-expense.ts:20`. Note: `delete-expense.ts` deletes the row; consider posting a reversal journal instead in a future enhancement.

**C-04 — Payroll run has no DB transaction (resolved in code).** ✅
- **Resolution.** `run_payroll_atomic` (mig 048, 080) inserts a `payroll_runs` header (UNIQUE constraint on `store_id+period_start+period_end` for idempotency) followed by all journal legs in one transaction. Second invocation for the same period throws `unique_violation`, surfaced to the API as HTTP 409 `PAYROLL_ALREADY_RUN`. See `apps/api/src/use-cases/payroll/run-payroll.ts:225`.

**C-05 — Card settlement match has no DB transaction (resolved in code).** ✅
- **Resolution.** `match_card_settlement_atomic` (mig 046) inserts journal legs + flips `card_settlements.is_paid + date_settled + net_amount + fee_expense + batch_no` in one transaction. The `cardSettlementRepo.matchWithTransaction` adapter calls this RPC. See `apps/api/src/use-cases/card-settlements/match-settlement.ts:89`.

**C-06 — Maya production payments blocked by `K004` error.** 🔴 OPEN
- **What.** Maya rejects our merchant account onboarding with error code K004 ("merchant account verification incomplete or rejected"). The integration is fully built but cannot transact production money.
- **Where.** External — Maya merchant dashboard. The platform code is in `apps/api/src/services/maya.ts` + `apps/api/src/routes/maya.ts` and is feature-complete (Zod payload validation, signature verify, amount-parity check, journal posting via `accountingPort.createTransaction`, `orders_raw` fallback for pre-activation payments).
- **Impact.** Customers cannot pay online; "Pay online" is hidden from the website checkout. Cash-on-arrival and Maya-sandbox are the only payment paths.
- **Fix.** Resolve K004 with Maya's onboarding team (owner is the contact). Then follow the production-switch checklist in `docs/OPS_RUNBOOK.md`.

### 🟠 HIGH

**H-01 — Hardcoded payroll account IDs.** `apps/api/src/use-cases/payroll/run-payroll.ts:17` hardcodes `PAYROLL_JOURNAL_STORE = 'store-lolas'`; lines 28–29 hardcode `'GCASH-store-lolas'` and `'BANK-UNION-BANK-store-lolas'` as the credit accounts for GCash/Bank-Transfer payment methods. Renaming any of these accounts in the COA (or adding a third store) silently posts to the wrong place. Fix: resolve everything via `resolvePayrollAccounts(storeId)` which already exists in `adapters/supabase/config-repo.ts` — extend it to return GCash and Bank account IDs as well.

**H-02 — Driver Telegram for transfers can mislabel pickup/dropoff for inbound runs.** `apps/api/src/services/email-templates/driver.ts driverNotificationHtml` and `apps/api/src/routes/transfers.ts:84–95` use `transfer.serviceDate` as pickupTime and `transfer.accommodation` as pickupLocation regardless of direction. For IAO→GL (arrival), the accommodation is the customer's drop-off, not pickup — the driver receives "Pickup at [hotel]" wrongly. Fix: derive direction from the route string and swap, or add explicit `pickup_location` / `pickup_time` columns.

**H-03 — `BookingModal.tsx` is 1,424 lines.** `apps/web/src/components/orders/BookingModal.tsx` mixes availability + pricing + persistence. Hard to review, hard to test. Split into `BookingModalSteps`, `BookingModalSummary`, `BookingModalSubmit`. Same applies to `CashupPage.tsx` (1,536), `BudgetPage.tsx` (1,217), `HomePage.tsx` (1,024), `WalkInBookingModal.tsx` (903), `OrderDetailSummaryTab.tsx` (830), `BasketPage.tsx` (791).

**H-04 — `apps/api/src/services/email-templates/customer.ts` is 53 KB / ~1,500 lines.** Every customer email template lives in one file. Extract per-event files and re-export from `email.ts`.

**H-05 — Render free tier risk if downgraded.** Today we're on the paid Starter plan, so cold starts are not a real issue. If the plan is ever downgraded for cost reasons, requests after 15 min idle take ~40s. UptimeRobot pings `/health` every 5 minutes already, but that only helps with the warmth, not first-request latency.

**H-06 — No structured Sentry breadcrumbs in API.** `@sentry/node` is wired (`instrument.ts`, `lib/sentry.ts`), but pino logs are not piped to Sentry as breadcrumbs. When an error reaches Sentry, you see the stack but not the request context. Add a `Sentry.addBreadcrumb` integration on the pino-http logger.

**H-07 — Customer-facing Active orders page mobile UX.** `apps/web/src/pages/transfers/TransfersPage.tsx:289–442` has 16 columns inside a horizontal-scroll container. On iPhone Safari the inner action buttons sometimes register as scroll gestures. Convert to a card view at `< md` breakpoint with sticky action buttons.

### 🟡 MEDIUM

**M-01 — `as unknown` / `as Record<string, unknown>` casts on Supabase results.** Examples: `apps/api/src/routes/maya.ts:143`, `apps/api/src/routes/public-waiver.ts`, several places in `routes/orders.ts:48`. A schema drift will corrupt at runtime without TypeScript catching it. Fix: define per-table Zod schemas in `apps/api/src/adapters/supabase/db-schemas.ts` and `.parse()` every Supabase response.

**M-02 — `process-raw-order.ts` has duplicated card vs non-card payment paths.** `apps/api/src/use-cases/orders/process-raw-order.ts:183–263`. Refactor into a single `buildRentalPayment` helper.

**M-03 — `console.error` scattered through routes.** `apps/api/src/routes/auth.ts:29`, `routes/maya.ts:80–81`, several places. Should use the pino logger so they're structured and filterable in Render logs.

**M-04 — Mobile responsiveness of backoffice operational pages.** Specifically:
- `OrderDetailModal` 5-tab header wraps to two lines on a 375px iPhone (`apps/web/src/components/orders/OrderDetailModal.tsx`).
- `CashupPage.tsx` denomination inputs are 60px wide; cramped on mobile.
- `WalkInBookingModal.tsx` 3-column step indicator overflows.
- `InboxPage.tsx` Activate modal radio groups extend off-screen.
- `ExpensesPage.tsx` row dropdown clipped by `overflow-hidden` on the table wrapper.
- Many backoffice buttons use `px-3 py-1.5 text-xs` (~32×24px tap target). Apple HIG recommends 44×44.
- `DashboardPage.tsx` chart heights are fixed `h-96`; on iPhone SE the KPIs are pushed off-screen.

**M-05 — Fire-and-forget operations have no recovery.** Email sends, Telegram notifications, and `settleCashAdvances` (post-payroll cash advance reduction in `apps/api/src/use-cases/payroll/run-payroll.ts:261–315`) all swallow errors after logging them. There's no retry queue, no alerting beyond pino logs. Build a small `notification_outbox` table with retry-with-backoff for the email + Telegram cases. For `settleCashAdvances`, document the "non-fatal — payroll has already committed" story for ops, or move it inside the same RPC.

**M-06 — No automated tests of the atomic RPCs.** The `process_raw_order_atomic`, `settle_order_atomic`, `collect_payment_atomic`, `run_payroll_atomic` RPCs are critical. There are some Vitest unit tests in `apps/api/tests/` but no full integration tests against a temporary Postgres / Supabase. Use [pgTAP](https://pgtap.org) or a docker-compose with `supabase start` for CI.

**M-07 — Public input validation on respond.io endpoints relies on the API key alone.** Many `/api/public/respond/*` handlers accept query parameters without strong Zod schemas — they trust that Lolo only calls them with sane values. Tighten with `validateQuery(...)` for each.

**M-08 — Hardcoded `STORE_ID = 'store-lolas'` in `apps/api/src/routes/public-respond.ts:11`.** Lolo can't quote for `store-bass`. Either add a `?storeId=` parameter and an allow-list, or document that Lolo is Lola's-brand-only.

**M-09 — Hardcoded `CALLOUT_CHARGE` in `apps/api/src/routes/public-respond.ts:17`.** Should live in a config table.

**M-10 — `transfer-booking` `contactNumber` schema.** `packages/shared/src/schemas/transfer-schemas.ts CreateTransferRequestSchema` allows `contactNumber: z.string().nullable().default(null)` for token-flow bookings. Without a number the driver can't reach the customer. Tighten to `z.string().min(7)` (the public no-token schema already does this).

**M-11 — Booking holds can grow stale.** `booking_holds` rows expire by client logic only; there's no Postgres-side cleanup job. Add a daily cron to delete expired holds.

**M-12 — Realtime subscriptions never re-subscribe on reconnect.** `apps/web/src/stores/realtime.ts` and `useTaskRealtime.ts` subscribe once on mount. On WiFi flap the subscription dies silently. Add a heartbeat / re-subscribe on visibilitychange.

### 🟢 LOW

**L-01 — Stray file `package-lock-DESKTOP-3J45FU7.json`.** Empty 99-byte OneDrive sync conflict at repo root. Delete it.
**L-02 — `_stitch_export/` legacy folder.** Move out of repo or document retention reason.
**L-03 — TransfersPage React fragment key warning.** `apps/web/src/pages/transfers/TransfersPage.tsx:324–437` uses bare `<>...</>` inside `.map()`. Use `<React.Fragment key={t.id}>...</React.Fragment>`.
**L-04 — Several customer pages missing `<SEO/>`.** `BasketPage`, `CancelBookingPage`, `PrivacyPage`. Add components/seo for each.
**L-05 — `apps/api/src/services/email.ts:43` defaults `EMAIL_FROM_BOOKINGS` to `bookings@lolasrentals.com` even if env unset.** Fail-fast in production startup if these aren't set, to catch typos.
**L-06 — Inter-store transfer can target the same store on both sides.** `apps/web/src/pages/cashup/CashupPage.tsx` (inter-store-transfer section). The backend RPC will accept it and post a wash. Add client-side `fromStoreId !== toStoreId` check.
**L-07 — `paw_card_entries.email` and `customers.email` lookups use `ilike` without a `lower(email)` index.** Sequential scans at scale. Add `CREATE INDEX … ON paw_card_entries(lower(email))` and same for `customers`.
**L-08 — No image optimisation pipeline.** Customer-facing images are full-size JPEGs from Cloudinary. Use Cloudinary's `f_auto,q_auto,w_<…>` transformations + `<picture>` srcsets.
**L-09 — No DMARC record.** Recommend `p=quarantine; rua=mailto:postmaster@lolasrentals.com`. SPF + DKIM are already set.
**L-10 — No GA / Meta Pixel cookie banner.** Add when analytics is wired.

### Summary of resolved V10 items

The following V10 audit items have been resolved (in the sense above — code or migration in place, not formally re-audited end-to-end):

✅ AC-01 Maya webhook journal posting — `routes/maya.ts:251–314` posts DR clearing/CR receivable.
✅ AC-02 `/transfers/:id/collect` posts journal — confirm by reading `routes/transfers.ts /collect` handler against the use case.
✅ AC-03 `process-raw-order` atomic + idempotent — `process_raw_order_atomic` (mig 077, 090).
✅ AC-04 `settle-order` atomic — `settle_order_atomic` (mig 078, 092, 093, 125).
✅ AC-05 walk-in-direct payments + charity in `activate_order_atomic` — mig 079 folds charity in.
✅ AC-06 Payroll idempotency — `payroll_runs` UNIQUE constraint (mig 080).
✅ AC-07 `collect_payment_atomic` (mig 081, 120, 122).
✅ AC-08 Maya webhook accepts `orders_raw` matches — mig 083 + `routes/maya.ts:189–197`.
✅ AC-09 Charity always posted — `apps/api/src/use-cases/orders/activate-order.ts:138–163` regardless of payment method.
✅ AC-10 `assert_balanced_legs` guard — mig 076, 124 + called inside every posting RPC.
✅ S-02 Maya webhook Zod-validated — `services/maya.ts:21–33`.
✅ S-03 Maya amount parity — `routes/maya.ts:163–175`.
✅ S-04 Maya secret-prefix log line removed — confirm via grep on `MAYA_SECRET_KEY?.slice`.
✅ S-06 Cancellation token single-use — mig 073.
✅ Top-establishments RPC — mig 084.
✅ Transfer summary RPC — mig 088.
✅ Performance indexes — mig 085.

---

## 14. Deployment Guide

### 14.1 Architecture

- **Vercel** hosts the React SPA. Domain: `lolasrentals.com` + `www`. Auto-deploys from `main`.
- **Render** hosts the Express API. Domain: `api.lolasrentals.com`. Auto-deploys from `main`. Plan: paid Starter (no cold starts).
- **Supabase** hosts Postgres + Storage. Pro plan recommended for daily PITR backups.
- **Hostinger** registers the domain. DNS:
  - `A @ → 76.76.21.21` (Vercel)
  - `CNAME www → cname.vercel-dns.com`
  - `CNAME api → lolas-rentals.onrender.com`
  - SPF, DKIM, DMARC TXT records for Resend (see `docs/DELIVERABILITY_CHECKLIST.md`).

### 14.2 First-time deployment from scratch

If you ever need to recreate everything:

1. **Supabase.** Create a new project. Note the URL + anon key + service role key.
2. **Apply migrations.** `npx supabase link --project-ref <ref>` then `npx supabase db push`. Or paste each `.sql` into the SQL editor in lexical order.
3. **Seed.** Run `supabase/seed.sql` in the SQL editor. Then add a `stores` row, `roles` + `role_permissions`, an admin `employees` row, and an admin `users` row with a bcrypt-hashed PIN.
4. **Render.** Create a Web Service from the GitHub repo. Root: `apps/api`. Build: `npm install && npm run build:render-api`. Start: `node --import ./apps/api/dist/instrument.js ./apps/api/dist/server.js`. Health check: `/health`. Add all env vars from §4.1.
5. **Vercel.** Import the repo. Build: `npm run build:vercel`. Output: `apps/web/dist`. Install: `npm install`. Add env vars from §4.2.
6. **DNS.** Add the records above on Hostinger. Wait for propagation (5–30 min).
7. **Verify.** Hit `https://lolasrentals.com` (web), `https://api.lolasrentals.com/health` (API → 200), `https://lolasrentals.com/login` (login flow against the new admin user).
8. **Telegram.** Register webhook: `curl https://api.telegram.org/bot$TOKEN/setWebhook -d url=https://api.lolasrentals.com/api/public/telegram`.
9. **UptimeRobot.** Add a monitor on `https://api.lolasrentals.com/health` (5-min interval).
10. **Resend.** Verify the `lolasrentals.com` domain in Resend; add DKIM/SPF/DMARC TXT records on Hostinger.
11. **Maya.** Set webhook URL `https://api.lolasrentals.com/api/payments/maya/webhook` in the Maya merchant dashboard.

### 14.3 Update deployment (normal day)

**Backend update.** Push to `main`. Render auto-builds and rolls. Watch the Render dashboard for build failure. Visit `/health` to confirm. Tail Render logs for the first few requests.

**Frontend update.** Push to `main`. Vercel auto-builds. Vercel keeps prior deploys live so rollback is one click.

**Backend-only or frontend-only.** Both apps build from the same monorepo on the same commit. There's no way to deploy one without the other unless you skip CI manually. In practice both rebuild on every push; the no-op one is fast.

### 14.4 Apply a new Supabase migration

1. Author the migration locally:
   ```bash
   npx supabase migration new short_description_in_snake_case
   # Edit the generated file under supabase/migrations/
   ```
2. Test against a personal Supabase project: `npx supabase db push` (you must be `supabase link`-ed to it).
3. Commit + push (just the SQL file, no auto-deploy of migrations to prod).
4. **Apply to production manually.** Either:
   - `npx supabase link --project-ref <prod-ref>` then `npx supabase db push` (verify the diff first), or
   - Paste the migration into the Supabase SQL editor for the prod project.
5. Verify with `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5`.
6. If the migration changed an existing function signature, watch for runtime errors (CREATE OR REPLACE can't change argument lists — you must DROP first; the `080_payroll_runs_header.sql` file is a worked example).

### 14.5 Promotion checklist

After every deploy:

- [ ] `https://api.lolasrentals.com/health` returns `200 {"status":"ok"}`.
- [ ] `https://lolasrentals.com` loads the homepage; navigate to `/book/reserve` and confirm vehicles populate.
- [ ] Login at `/login` with a real account; confirm sidebar populates per role.
- [ ] Open `/orders/active`; confirm orders populate.
- [ ] Open `/cashup`; confirm reconciliation page renders.
- [ ] Send a test booking from `/book/reserve` (use a sandbox payment method or a test customer); confirm:
  - `orders_raw` row appears.
  - Confirmation email arrives.
  - Telegram Ops + Paid Orders messages appear.
- [ ] If the deploy touched email templates: send a test of every changed template via `npm run email:test -w apps/api`.
- [ ] If the deploy touched migrations: spot-check the relevant table or RPC behaviour.
- [ ] Render logs show no errors above warn for the first 5 minutes.

---

## 15. Operational Runbook

### 15.1 Add a new vehicle to the fleet

1. Navigate to **Fleet** in the sidebar.
2. Click **Add Vehicle** (requires `can_edit_fleet`).
3. Choose model (must already exist in `vehicle_models`); enter name (e.g. "Pikachu"), plate, engine #, chassis #, GPS ID, current mileage.
4. Set status to **Available** (or **Pending ORCR** if registration isn't yet complete).
5. For owner-tracked accounting, enter purchase price, purchase date, useful life (months), salvage value. The system auto-computes `book_value` on save and (when scheduled) posts depreciation via `post_batch_depreciation`.
6. If the vehicle should appear on the public website, ensure there is at least one `vehicle_model_pricing` row for the model + store and that the model has a Cloudinary image referenced in its `metadata`.

### 15.2 Onboard a new staff member

1. **Settings → Roles & Users → Add User**. Username (lowercase, no spaces), role (pick from existing), assign one or more stores. Enter an initial 4-digit PIN.
2. The system creates an `employees` row (or links an existing one) and a `users` row with the bcrypt-hashed PIN.
3. Tell the staff member to log in at `/login` and immediately change their PIN via the user dropdown.
4. If the staff member is a driver who needs Telegram notifications, set `employees.telegram_user_id` (mig 02 May 2026) — this enables direct chat-id lookups.
5. If the staff member is a payroll-paid employee, set `pay_rate`, `rate_type`, `payment_method`, plus any cash advance schedules.

### 15.3 Process a manual refund or booking correction

**Refund.**
1. Open the relevant order in `/orders/completed` (or `/orders/active` if not yet settled).
2. Click **Refund** (requires `can_edit_orders`). Enter amount and account to refund from.
3. The system inserts a `payments` row with `payment_type='refund'` and posts `DR Income, CR Cash` (or appropriate accounts).
4. The refund is **not** reversed on the receivable side automatically. If the refund is for a deposit that was already applied, you may also need to reverse the deposit-applied entry via **Manual Journal**.

**Booking correction (wrong vehicle, wrong dates, wrong total).**
1. If activated already: open the order, use **Adjust Dates**, **Swap Vehicle**, **Modify Add-Ons** as appropriate. The system recalculates totals and posts adjustment journals automatically.
2. If wholly wrong: cancel the order (refund any payments first) and create a new one via Walk-In Direct.

### 15.4 Run a daily cashup

1. Navigate to **Cashup**. Pick the date and store.
2. The "Expected" column shows what the journal entries say should be on hand.
3. Click **Before Close** to see a snapshot of every cash-affecting transaction for the day. Cross-reference against your physical receipts.
4. Use the denomination counter (top of the till section) to count physical notes/coins; the form sums them automatically.
5. Variance highlights in red (short) or green (over). Zero is best.
6. Click **Submit Reconciliation**. The form locks (`is_locked=true`).
7. If you need to deposit cash to safe before submitting, use **Deposit to Safe** on the same page (atomic).
8. If you discover an error after locking, an admin can use **Override** (`can_override_cashup`) to re-open and correct.

### 15.5 Handle a failed Telegram or email notification

**Telegram.**
1. First check Render logs for the request: search `Telegram alert skipped` or `Telegram sendMessage failed`. The logged context will tell you whether the bot token is missing, the chat ID is wrong, or Telegram returned an error.
2. If the bot is silent in a channel: confirm the bot is added to that channel and has permission to post (group settings in Telegram).
3. If the Confirm button is dead: the message may have been edited already (button removed). Look for `editMessageReplyMarkup failed` in logs. If the driver has clearly tapped but nothing happened, re-trigger via `POST /api/transfers/:id/notify-driver`.
4. To register the webhook fresh: `curl https://api.telegram.org/bot$TOKEN/setWebhook -d url=https://api.lolasrentals.com/api/public/telegram` and check it with `getWebhookInfo`.

**Email.**
1. Check Resend dashboard for the message in the activity log. Filter by recipient.
2. If marked "Bounced," the recipient is bouncing — check the `email_opt_out` table to see if they unsubscribed; otherwise verify the address.
3. If marked "Failed," look at Resend's error reason. Most common is rate-limiting on free tiers.
4. If the message never reaches Resend: check Render logs for `Email send failed` or `RESEND_API_KEY not set — skipping email`.
5. If many bookings around the same time bounced: check Hostinger DNS for SPF/DKIM/DMARC records (they can drift if anyone edits DNS by hand). Use [mail-tester.com](https://www.mail-tester.com).
6. To resend a one-off: trigger the relevant route again (e.g. for a booking confirmation, manually re-process the inbox row; for a waiver reminder, the next cron tick will pick it up because the dedupe table only marks rows as sent on success).

### 15.6 Quick reference: where do I look when something is wrong?

| Symptom | First check |
|---|---|
| Web app doesn't load | Vercel deployment status; browser console |
| API returns 5xx | Render logs (latest deploy logs + runtime logs) |
| Login fails for one user | `users.is_active`, `pin_hash` non-null |
| Login fails for everyone | `JWT_SECRET` env var present and ≥32 chars; Supabase service role key valid |
| Order activation fails with "no receivable account" | `chart_of_accounts` seed; check `AR-RENTAL-store-lolas` exists |
| Telegram silent | Bot token present, chat IDs present, bot in channel |
| Emails not arriving | Resend API key, Resend dashboard log, Hostinger DNS |
| Maya webhook 401 | `MAYA_WEBHOOK_SECRET` matches Maya dashboard; signature header `X-Maya-Signature` present |
| Customer can't cancel via link | Token already used (`cancellation_token_used = true`); customer must contact staff |
| Realtime to-do not updating | Browser network tab → confirm Supabase realtime websocket connected; check `VITE_SUPABASE_ANON_KEY` |

---

## 16. What to Build Next

Honest, prioritised. The platform is operationally complete; the items below are the highest-leverage improvements.

### 🔴 Must fix before scaling

1. **Resolve the Maya K004 blocker** (or pick an alternative payment provider). Without online card payments the platform is leaving real revenue on the table and forcing every booking to be confirmed via cash-on-arrival. (See §11.5 / §13 C-06.)
2. **De-hardcode payroll account IDs.** `PAYROLL_JOURNAL_STORE`, `GCASH-store-lolas`, `BANK-UNION-BANK-store-lolas` in `apps/api/src/use-cases/payroll/run-payroll.ts`. (§13 H-01.)
3. **Notification recovery / outbox.** Build a `notification_outbox` table with a small worker to retry failed emails / Telegrams with backoff. The fire-and-forget pattern is correct for latency, but right now a transient Resend outage during peak booking time loses customer confirmations forever. (§13 M-05.)
4. **Sentry breadcrumbs from pino-http.** Today an API exception in Sentry has no request context. Wire up `Sentry.addBreadcrumb` from the pino-http middleware so each Sentry issue includes the full request trail. (§13 H-06.)
5. **Apply pending migrations 091/092/093 to every environment.** Confirm via `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('confirm_extend_order_atomic','settle_order_atomic')`. (See `supabase/migrations/PENDING_MIGRATIONS_README.md`.)
6. **JWT in localStorage → httpOnly cookie + CSRF.** Single XSS would compromise every staff token. (§12.5.)
7. **Stand up a staging environment.** Today every push to `main` deploys to production. A Vercel preview branch + a separate Render service + a separate Supabase project (linked via `npx supabase link`) would let you validate non-trivial changes before they hit live customer traffic.

### 🟡 Important improvements (within the first month)

8. **Customer-facing transfer booking page (revisit and ship).** The pricing logic for fixed vs per-head transfers exists in the backend (`transfer_routes.pricing_type`, `submit-direct-booking.ts`, public-transfers routes). The page itself (`apps/web/src/pages/TransferBookingPage.tsx`) is functional but dated — 644 lines in one component, no SEO, mobile experience is rough. Rebuild it as a multi-step flow that mirrors the rental booking UX, surface live pricing, add the same SEO/OG tags as `/book/reserve`. There is an execution plan stub in `.cursor/plans/transfer_section_rebuild_8c64e014.plan.md`.
9. **Mobile-first refactor of `TransfersPage`, `OrderDetailModal`, `CashupPage`.** The three highest-traffic operational screens. Convert tables to card views below `md`, bump tap targets to 44×44, fix the modal overflows. (§13 M-04.)
10. **Split the four monolith files.** `BookingModal.tsx` (1,424), `CashupPage.tsx` (1,536), `BudgetPage.tsx` (1,217), `customer.ts` email templates (~1,500). Aim for sub-500-line files. (§13 H-03 / H-04.)
11. **Zod-parse every Supabase response.** Replace `as unknown` casts in `routes/maya.ts:143`, `routes/orders.ts:48`, `routes/public-waiver.ts`, etc. (§13 M-01.)
12. **`pgTAP` integration tests for the four atomic RPCs.** With docker-compose `supabase start`, run a fresh DB through migrations and exercise `process_raw_order_atomic`, `settle_order_atomic`, `collect_payment_atomic`, `run_payroll_atomic` end-to-end. (§13 M-06.)
13. **Add `<SEO/>` to `BasketPage`, `CancelBookingPage`, `PrivacyPage`.** Trivial but visible. (§13 L-04.)
14. **Image optimisation.** Switch all `<img src>` for customer-facing images to Cloudinary `f_auto,q_auto,w_<…>` transformations + `<picture>` srcsets. (§13 L-08.)
15. **Cron cleanup of `booking_holds`.** Daily delete-where-expired job. (§13 M-11.)
16. **Add `lower(email)` indexes on `customers` and `paw_card_entries`.** (§13 L-07.)
17. **Document the COA conventions.** A short `docs/CHART_OF_ACCOUNTS.md` describing why account IDs are formatted `<TYPE>-<DESCRIPTOR>-<store-id>`, what each well-known account does, and how `'company'`-store accounts work.

### 🟢 Future roadmap (low urgency, high value)

18. **CSP via Helmet.** Audit inline styles, define a CSP, ship.
19. **JWT refresh tokens.** Today tokens are 24h with no revocation. Add refresh + a deny-list table for password changes / role downgrades.
20. **Structured logger across the API.** Replace remaining `console.error` calls with `logger.error`. (§13 M-03.)
21. **Lolo respond.io endpoints — add per-store quoting.** Remove the `STORE_ID = 'store-lolas'` hardcode. (§13 M-08.)
22. **Lolo respond.io `CALLOUT_CHARGE` config table.** (§13 M-09.)
23. **Granular Supabase realtime reconnection.** Make `useTaskRealtime` resilient to WiFi flap. (§13 M-12.)
24. **Customer accounts.** Today every customer interaction is anonymous — name + email per booking. Letting customers sign in (Supabase Auth + OTP) would let them see their booking history, manage saved payment methods, automate Paw Card lookup.
25. **Native payment-method options beyond Maya.** PayPal, Stripe (Stripe Atlas now supports Philippine merchants), GCash direct.
26. **Multi-language polish.** `i18next` is wired with `en` and partial `tl` (Tagalog). Audit every customer-facing string.
27. **Accommodation-partner self-service portal.** Today partners email the owner to update their listing. A small portal with `auth/magic-link` would offload that.
28. **Fleet predictive maintenance.** Use mileage trends to flag vehicles due for service before they fail.
29. **Better dashboard.** `DashboardPage` is 692 lines of sequential queries. Build a single `/dashboard/summary` endpoint returning one JSON blob, and render with Recharts components that are memoised properly. (§13 / V10 P-03.)
30. **Automated security scanning in CI.** Snyk, Dependabot, or `npm audit --audit-level=high` on every PR.

---

## 17. Contacts & Credentials Reference

Service inventory. **No secret values are written here**; ask the owner for access.

| Service | Used for | Who to ask |
|---|---|---|
| **GitHub** | Repo hosting; auto-deploy triggers | Owner |
| **Vercel** | Frontend hosting (`lolasrentals.com`) | Owner |
| **Render** | API hosting (`api.lolasrentals.com`) | Owner |
| **Supabase** | Postgres + Storage + realtime | Owner |
| **Hostinger** | Domain registrar + DNS for `lolasrentals.com` | Owner |
| **Resend** | Transactional email (`bookings@lolasrentals.com`, `hello@…`, `maintenance@…`) | Owner |
| **Telegram BotFather** | Bot token + channel IDs | Owner |
| **Cloudinary** | Image CDN (cloud name `lolas-rentals`) | Owner |
| **Maya Business** | Card / GCash payments (currently K004-blocked for production) | Owner |
| **respond.io** | Lolo AI chat platform + API key | Owner |
| **Aerodatabox** | Flight lookup API (used by Lolo transfer flow) | Owner |
| **Sentry** | Error monitoring (web + api) | Owner |
| **UptimeRobot** | `/health` keep-warm + downtime alerting | Owner |
| **Google Cloud (Sheets API)** | Read-only mirror background sync (legacy) | Owner |
| **Cursor + AI agents** | The development environment used to build this codebase | Owner / your own subscription |

When you arrive, the owner will share via 1Password (or equivalent) every secret listed in §4.

---

*End of handover. If you find anything in this document that's wrong, update it the same day. The next person depends on it being current.*
