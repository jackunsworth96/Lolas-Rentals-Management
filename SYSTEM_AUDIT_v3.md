# SYSTEM_AUDIT_v3.md — Lola's Rentals Platform

> **Audit Date:** 2026-04-05
> **Auditor:** AI Architect (Forensic Codebase Audit, v3)
> **Scope:** `apps/api`, `apps/web`, `packages/domain`, `packages/shared`, `supabase/migrations` (001–052), `supabase/functions`, root configuration
> **Purpose:** Master reference for architecture, schema, APIs, UI, security, and prioritized gaps. **Supersedes v2 for active use**; `SYSTEM_AUDIT_v2.md` is retained for history.
> **Delta from v2:** Migration **052** (`transfer_routes.pricing_type`); **Customer website completely rebuilt** (new homepage, PillNav, 16+ new home components, framer-motion animations, GSAP nav, OGL gallery, touch fallbacks); Dashboard cash balances store-filtered with deposits-held; expenses chart = Last Month; fleet calendar query fix; timesheets All-Stores + UTC fix; settings + fleet utilization gated behind new permissions; new `GET /public/booking/model-pricing` API endpoint; `useIsTouchDevice` hook; gold glow tokens; `borderPulse` animation.

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema](#3-database-schema)
4. [API Layer](#4-api-layer)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Domain Model](#6-domain-model)
7. [Shared Contracts](#7-shared-contracts)
8. [Data Flows](#8-data-flows)
9. [Authentication & Security](#9-authentication--security)
10. [Edge Functions & Webhooks](#10-edge-functions--webhooks)
11. [Known Issues & Code Smells](#11-known-issues--code-smells)
12. [Gap Analysis (Prioritized)](#12-gap-analysis-prioritized)

---

## 1. Repository Structure

### 1.1 Top-Level Layout

```
User Interface/                     ← Monorepo root (npm workspaces)
├── apps/
│   ├── api/                        ← Express REST API (Node ESM, TypeScript strict)
│   │   ├── src/
│   │   │   ├── server.ts           ← Entry: dotenv, CORS, JSON, app.locals.deps, /health, /api/*
│   │   │   ├── routes/             ← 27 modules (+ index.ts registry)
│   │   │   ├── middleware/         ← authenticate, authorize, validate, error-handler, rate-limit
│   │   │   ├── adapters/           ← supabase repos, auth/jwt, google-sheets
│   │   │   ├── use-cases/          ← 58 files across 17 domain areas
│   │   │   ├── jobs/               ← cron: sheets-sync, recurring-bills, fleet-status-sync, leave-reset
│   │   │   └── lib/                ← supabase-log.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                        ← React 18 + Vite 6 SPA
│       ├── src/
│       │   ├── App.tsx             ← QueryClientProvider, BrowserRouter, ErrorBoundary, AppRouter
│       │   ├── router.tsx          ← Public /book/* + protected backoffice routes
│       │   ├── main.tsx
│       │   ├── index.css           ← Tailwind layers; @keyframes; borderPulse; marqueeScroll
│       │   ├── api/                ← 20 client modules (React Query hooks)
│       │   ├── stores/             ← auth, ui, booking, realtime, task-notification
│       │   ├── pages/              ← 46+ page TSX files across ~25 route areas
│       │   ├── components/         ← 90+ files across layout, home, backoffice sections
│       │   ├── hooks/              ← useIsTouchDevice, useToast, useTaskRealtime, use-payment-routing
│       │   └── utils/
│       ├── vite.config.ts          ← Dev server :3002, proxy /api → API :3001
│       ├── tailwind.config.ts      ← Brand tokens, font families, keyframes
│       ├── index.html              ← Google Fonts: Alegreya Sans, Lato, Playfair Display, Roboto Flex
│       └── package.json
│
├── packages/
│   ├── domain/                     ← Pure domain: entities, value-objects, services, errors, ports
│   └── shared/                     ← Permissions, constants, Zod schemas, API types
│
├── supabase/
│   ├── migrations/                 ← 50 SQL files numbered 001–052 (gaps: 028–030)
│   └── functions/
│       └── order-webhook/          ← Deno edge function (WooCommerce → orders_raw)
│
├── package.json                    ← workspaces, build/dev/test scripts
├── SYSTEM_AUDIT v1                 ← Historical (retained)
├── SYSTEM_AUDIT_v2.md              ← Historical (retained)
├── SYSTEM_AUDIT_v3.md              ← This document
├── docs/architecture.md
└── tsconfig.json, eslint, etc.
```

### 1.2 Route Files — `apps/api/src/routes/` (27 modules)

`accounting.ts`, `auth.ts`, `card-settlements.ts`, `cashup.ts`, `config.ts`, `dashboard.ts`, `directory.ts`, `expenses.ts`, `fleet.ts`, `hr.ts`, `index.ts`, `lost-opportunity.ts`, `maintenance.ts`, `merchandise.ts`, `misc-sales.ts`, `orders-raw.ts`, `orders.ts`, `paw-card.ts`, `payroll.ts`, `public-booking.ts`, `public-extend.ts`, `public-paw-card.ts`, `public-repairs.ts`, `public-transfers.ts`, `todo.ts`, `transfers.ts`, `ui-errors.ts`

### 1.3 Use-Case Files — `apps/api/src/use-cases/` (58 files)

| Area | Files |
|------|-------|
| accounting | `create-journal-entry.ts`, `transfer-funds.ts`, `calculate-balances.ts` |
| booking | `check-availability.ts`, `compute-quote.ts`, `create-hold.ts`, `release-hold.ts`, `submit-direct-booking.ts` |
| card-settlements | `match-settlement.ts` |
| cashup | `reconcile-cash.ts`, `override-reconciliation.ts` |
| config | `crud-config.ts` |
| expenses | `create-expense.ts`, `delete-expense.ts`, `update-expense.ts` |
| fleet | `batch-depreciation.ts`, `create-vehicle.ts`, `get-utilization.ts`, `record-purchase.ts`, `record-sale.ts`, `update-vehicle.ts` |
| hr | `approve-timesheets.ts`, `submit-leave.ts`, `submit-timesheet.ts` |
| maintenance | `complete-maintenance.ts`, `log-maintenance.ts`, `save-maintenance.ts` |
| misc-sales | `delete-sale.ts`, `record-sale.ts`, `update-sale.ts` |
| orders | `activate-order.ts`, `adjust-dates.ts`, `collect-payment.ts`, `modify-addons.ts`, `process-raw-order.ts`, `settle-order.ts`, `swap-vehicle.ts` |
| paw-card | `company-impact.ts`, `log-savings.ts`, `lookup-customer.ts`, `lookup-paw-card-public.ts` |
| payroll | `calculate-payslip.ts`, `run-payroll.ts` |
| repairs | `list-repair-costs.ts` |
| settings | `save-user.ts` |
| todo | `add-comment.ts`, `claim-task.ts`, `create-task.ts`, `escalate-task.ts`, `mark-seen.ts`, `reject-task.ts`, `start-task.ts`, `submit-task.ts`, `update-task.ts`, `verify-task.ts` |
| transfers | `create-transfer.ts`, `record-driver-payment.ts`, `record-payment.ts` |

### 1.4 Notable Path Conventions

- **ESM everywhere:** imports use `.js` extensions in TypeScript source.
- **Customer site:** all routes under `/book`; **Backoffice:** `/dashboard`, `/orders/*`, `/fleet`, etc.
- **Assets typo:** folder `apps/web/src/assets/Original Assests/` (double "s") retained for road SVGs.
- **Be Pawsitive images:** `apps/web/src/assets/Be Pawsitive/1.png` … `50.png` — 50 animal photos.
- **Hero assets:** `apps/web/src/assets/Hero/` — flowers, clouds.
- **Hand Drawn Assets:** `apps/web/src/assets/Hand Drawn Assets/` — gecko illustration etc.

---

## 2. Tech Stack

### 2.1 Frontend

| Component | Technology | Notes |
|-----------|------------|-------|
| Framework | React 18.x | |
| Build | Vite 6.x | Dev server port 3002 |
| Routing | React Router 7.x | Lazy routes + Suspense |
| State | Zustand 5.x | Auth persisted to localStorage |
| Data | TanStack React Query 5.x | Default `staleTime: 30_000` |
| Styling | Tailwind CSS 3.4.x | Extended tokens; custom keyframes |
| Charts | Recharts 3.x | Dashboard bar charts, pie charts |
| Animation | **framer-motion 12.x** | Homepage hero, tiles, scroll |
| Animation | **GSAP 3.14.x** | PillNav hover pill animations |
| Gestures | **@use-gesture/react 10.x** | DomeGallery drag |
| WebGL | **ogl 1.x** | CircularGallery (currently unused in live pages) |
| Icons | lucide-react | Backoffice sidebar |
| Language | TypeScript strict | |
| Realtime | Supabase JS 2.x | Todo / task notifications |

**Typography (v3 additions)**

| Tailwind token | Font | Usage |
|----------------|------|-------|
| `font-headline` / `font-sans` | **Alegreya Sans** | Primary UI headings |
| `font-lato` | **Lato** (+ Nunito fallback) | Body copy, buttons |
| `font-display` | **Playfair Display** | Display headings (hero) |
| `font-body` | Plus Jakarta Sans | Extended; check load |
| CSS `font-family: Roboto Flex` | **Roboto Flex** (variable) | `VariableProximity` component |

**Brand tokens (v3 confirmed)**

| Token | Hex | Usage |
|-------|-----|-------|
| `teal-brand` | `#00577C` | Nav, accents, headings |
| `gold-brand` | `#FCBC5A` | Buttons, glows, CTAs |
| `cream-brand` | `#FAF6F0` | Card backgrounds |
| `sand-brand` | `#f1e6d6` | Hero + section backgrounds |
| `charcoal-brand` | `#363737` | Dark text, borders |

### 2.2 Backend

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (ESM) |
| HTTP | Express 5.x |
| Validation | Zod (via `@lolas/shared` + route validators) |
| DB client | Supabase JS 2.x (service role key) |
| Auth | JWT (`jsonwebtoken`), PIN login, `bcrypt` |
| Uploads | Multer (memory; Paw Card receipts) |
| Rate limiting | `express-rate-limit` (`middleware/rate-limit.ts`) |
| Cron | `node-cron` (sheets-sync, fleet-status, leave-reset) |
| External | `googleapis` (Google Sheets sync) |

### 2.3 Database & Infrastructure

| Component | Technology |
|-----------|------------|
| Database | Supabase (PostgreSQL) |
| Migrations | 50 SQL files through **052** (gaps: 028–030) |
| RLS | Enabled; `user_store_ids()`, `has_permission()` helpers — **bypassed by API service role** |
| Edge | Supabase Edge Function `order-webhook` (Deno) |
| External | Google Sheets sync; WooCommerce webhooks |

### 2.4 Environment Variables

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ALLOWED_ORIGIN` (comma-separated CORS list), `GOOGLE_SHEETS_*`, `PORT` (default 3001), `VITE_API_URL` (frontend proxy target).

---

## 3. Database Schema

### 3.1 Complete Table Catalog

Tables introduced across migrations 001–052:

| Table | Description |
|-------|-------------|
| `stores` | Physical rental locations |
| `roles` | Staff roles |
| `role_permissions` | Role → permission mapping |
| `employees` | Staff records |
| `users` | Auth/PIN credentials |
| `customers` | Customer records |
| `fleet` | Individual vehicles |
| `orders` | Activated rental orders |
| `order_items` | Line items per order |
| `order_addons` | Add-on selections per order |
| `payments` | Payment records |
| `vehicle_swaps` | Vehicle swap history |
| `journal_entries` | Double-entry accounting ledger |
| `cash_reconciliation` | Daily cash-up records |
| `card_settlements` | Card payment settlement records |
| `chart_of_accounts` | COA entries |
| `addons` | Add-on catalog (+ `applicable_model_ids text[]` from 040) |
| `locations` | Pickup/dropoff locations |
| `payment_methods` | Payment method config |
| `vehicle_models` | Vehicle model catalog |
| `vehicle_model_pricing` | Tiered pricing per model/store |
| `fleet_statuses` | Vehicle availability status |
| `expense_categories` | Expense category catalog |
| `transfer_routes` | Transfer route catalog (+ `pricing_type` from 052) |
| `day_types` | Work day type config |
| `paw_card_establishments` | Partner businesses for Paw Card |
| `maintenance_work_types` | Maintenance work type catalog |
| `leave_config` | Leave entitlement configuration |
| `timesheets` | Employee timesheets |
| `cash_advance_schedules` | Employee cash advance deductions |
| `maintenance` | Vehicle maintenance records |
| `expenses` | Business expenses (+ `status`/`paid_at` from 050) |
| `transfers` | Transfer bookings |
| `misc_sales` | Miscellaneous revenue |
| `lost_opportunity` | Lost booking log |
| `todo_tasks` | Task tracker |
| `todo_comments` | Task comments |
| `paw_card_entries` | Customer Paw Card savings log |
| `ui_errors` | Frontend error log |
| `merchandise` | Merchandise inventory |
| `reviews` | Customer reviews |
| `recurring_bills` | Scheduled recurring expenses |
| `directory` | Business/contact directory (+ extended cols from 051) |
| `orders_raw` | Raw WooCommerce/webhook orders |
| `order_payments` | Payments linked to orders_raw |
| `payment_routing_rules` | Payment routing configuration |
| `task_categories` | Todo task categories |
| `task_events` | Task event log |
| `task_notifications` | Realtime task notifications |
| `leave_reset_log` | Annual leave reset audit |
| `booking_holds` | Temporary inventory holds |
| `repair_costs` | Published repair cost catalog |

### 3.2 Migration Index (001–052)

| Range | Key Themes |
|-------|-----------|
| 001–006 | Initial schema, config, core entities, payments/accounting, HR/ops, remaining tables |
| 007–022 | Payments, orders_raw, surcharges, settlements, stores, merchandise, payment routing |
| 023–027 | Accounting/company store consolidation, task accountability, leave reset |
| 028–030 | **Not present** in repo (numbering gap) |
| 031–034 | Paw Card RLS, triggers, references, storage policies |
| 035–041 | Direct booking columns, holds, vehicle security deposit, transfers, charity, addons, repair costs |
| 042 | `orders_raw.web_payment_method text` |
| 043 | Edit permissions: `EditExpenses`, `EditMaintenance`, `EditTransfers`, etc. |
| 044 | `can_view_dashboard` permission for role-admin |
| 045 | `create_expense_with_journal` + `delete_expense_with_journal` RPCs |
| 046 | `match_card_settlement` RPC |
| 047 | `reconcile_cash_atomic` RPC |
| 048 | `run_payroll_atomic` RPC |
| 049 | `activate_order_atomic` RPC |
| 050 | `expenses.status` / `paid_at`; updated `create_expense_with_journal`; `pay_expenses_atomic` RPC |
| 051 | `directory`: `category`, `bank_name`, `bank_account_number`, `address`, `notes` columns |
| **052** | **`transfer_routes.pricing_type`** `text NOT NULL DEFAULT 'fixed' CHECK ('fixed','per_head')` |

### 3.3 Column Detail — Key Tables (v3 additions)

#### `expenses` (v3 state after 050)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `store_id` | uuid FK stores | |
| `category_id` | uuid FK expense_categories | |
| `amount` | numeric | |
| `description` | text | |
| `date` | date | |
| `created_by` | uuid FK users | |
| `status` | text NOT NULL DEFAULT `'paid'` | CHECK: `'paid' \| 'unpaid'` |
| `paid_at` | timestamptz | Set on payment |
| (+ other standard cols) | | |

#### `directory` (v3 state after 051)

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `name` | text |
| `phone` | text |
| `email` | text |
| `category` | text (new 051) |
| `bank_name` | text (new 051) |
| `bank_account_number` | text (new 051) |
| `address` | text (new 051) |
| `notes` | text (new 051) |
| (+ standard store, timestamps) | |

#### `transfer_routes` (v3 state after 052)

| Column | Type | Notes |
|--------|------|-------|
| (existing cols) | | |
| `pricing_type` | text NOT NULL DEFAULT `'fixed'` | CHECK: `'fixed' \| 'per_head'` |

### 3.4 Atomic PostgreSQL RPCs

| Function | Migration | Purpose |
|----------|-----------|---------|
| `create_expense_with_journal` | 045, 050 | Insert expense + optional journal legs |
| `delete_expense_with_journal` | 045 | Delete expense + reverse journals |
| `match_card_settlement` | 046 | Settlement matching + ledger effects |
| `reconcile_cash_atomic` | 047 | Cash-up reconciliation atomically |
| `run_payroll_atomic` | 048 | Payroll run + journal postings |
| `activate_order_atomic` | 049 | Order activation + fleet status + journals |
| `pay_expenses_atomic` | 050 | Batch pay unpaid expenses + post journals |

### 3.5 RLS Summary

- RLS enabled broadly via `009_rls_policies.sql`.
- Store-scoped access via `user_store_ids()` PostgreSQL helper.
- Permission-gated mutations via `has_permission()`.
- Config/catalog tables: `SELECT` open to authenticated users.
- Paw Card: tightened in 030–034 (storage, entries, lookup).
- Orders raw: insert/select for anonymous pipeline.
- **API service role bypasses all RLS** — Express middleware is the enforcement layer.

---

## 4. API Layer

### 4.1 Request Pipeline

```
Request → CORS → express.json → Rate limit (per router tier)
        → Route handler
          → [authenticate]           ← Bearer JWT → req.user
          → [requirePermission]      ← checks req.user.permissions
          → [validate]               ← Zod body/query
          → Business logic / use-case
          → JSON response
                    ↓ errors
              errorHandler (domain → HTTP status)
```

### 4.2 Rate Limiting (`routes/index.ts`)

| Limiter | Applied to | Limit |
|---------|------------|-------|
| `loginLimiter` | `/auth` | 5 requests / 15 min / IP |
| `publicLimiter` | `/public/*` | 60 requests / min / IP |
| `apiLimiter` | all routes on router | 200 requests / min / IP |

### 4.3 Full Route Registry (`/api` prefix)

| Mount | Module | Auth | Key Endpoints |
|-------|--------|------|---------------|
| `/auth` | auth.ts | No | `POST /login` (PIN → JWT) |
| `/dashboard` | dashboard.ts | Yes | `GET /summary` — store-filtered KPIs, cash balances incl. deposits-held, pie charts by country/continent; financial blocks gated by `can_view_dashboard` |
| `/directory` | directory.ts | Yes | `GET /` list, `POST /` create, `PUT /:id`, `DELETE /:id` |
| `/orders-raw` | orders-raw.ts | Yes | Raw inbox, process, sync |
| `/orders` | orders.ts | Yes | List, enriched, `/:id`, activate, settle, payment, modify-addons, adjust-dates, swap-vehicle |
| `/fleet` | fleet.ts | Yes | CRUD, utilization (`can_view_fleet_book_value`), calendar, depreciation |
| `/accounting` | accounting.ts | Yes | Balances, entries, fund transfers |
| `/transfers` | transfers.ts | Yes | CRUD + payments; `EditTransfers` for mutations |
| `/hr` | hr.ts | Yes | Timesheets (All-Stores option, UTC fix), leave, employees |
| `/payroll` | payroll.ts | Yes | Payslip calc, `POST /run` → `run_payroll_atomic` |
| `/cashup` | cashup.ts | Yes | `GET /summary`, `POST /deposit`, `POST /inter-store-transfer`, `POST /reconcile` → `reconcile_cash_atomic`, `POST /override` (needs `OverrideCashup`) |
| `/expenses` | expenses.ts | Yes | CRUD (`EditExpenses`); `POST /pay` → `pay_expenses_atomic`; chart now shows Last Month |
| `/todo` | todo.ts | Yes | Full task lifecycle (create, claim, start, submit, verify, reject, escalate, comment, mark-seen) |
| `/maintenance` | maintenance.ts | Yes | CRUD + complete; `EditMaintenance` for mutations |
| `/config` | config.ts | Yes (`EditSettings`) | Stores, addons, locations, payment methods, vehicle models, pricing, transfer routes (with `pricing_type`), COA, roles, users, routing rules |
| `/paw-card` | paw-card.ts | Mixed | `GET /`, `/lookup`, `/establishments`, `/lifetime`, `POST /submit`, `/register`, `/upload-receipt` (Multer → Supabase storage); `GET /company-impact`, `/my-submissions`, `/leaderboard` |
| `/misc-sales` | misc-sales.ts | Yes | CRUD misc revenue |
| `/merchandise` | merchandise.ts | Yes | Inventory CRUD |
| `/card-settlements` | card-settlements.ts | Yes | Pending/settled, `match_card_settlement`, batch, combine |
| `/lost-opportunities` | lost-opportunity.ts | Yes | Lost booking log |
| `/ui-errors` | ui-errors.ts | Yes | UI error reporting |
| `/public` | public-transfers.ts | No | `GET /transfer-routes`, `GET /store-info`, `POST /transfer-booking` (token auth) |
| `/public/booking` | public-booking.ts | No | See §4.4 |
| `/public/paw-card` | public-paw-card.ts | No | `POST /lookup`, `GET /entries`, `GET /rental-orders` |
| `/public/extend` | public-extend.ts | No | `POST /lookup`, `POST /confirm` |
| `/public/repairs` | public-repairs.ts | No | `GET /costs?vehicleType=` |

**Health:** `GET /health` → `{ status: 'ok' }` (not under `/api`).

### 4.4 Public Booking Endpoints — `/api/public/booking`

All rate-limited by `publicLimiter`. No `authenticate` middleware.

| Method | Path | Description |
|--------|------|-------------|
| **GET** | `/model-pricing` | **NEW (v3)** — `storeId` + `vehicleModelId` query params → `minDailyRate` + pricing tiers from `configRepo.getModelPricing` |
| GET | `/availability` | Available vehicle models for date range |
| GET | `/quote` | Price quote (locations, optional addons) |
| POST | `/hold` | Create booking hold (inventory lock) |
| DELETE | `/hold/:holdId` | Release hold (session token body) |
| GET | `/hold/:sessionToken` | Active holds for session |
| POST | `/submit` | Submit direct booking (`SubmitDirectBookingRequestSchema`) |
| GET | `/addons` | Add-ons filtered by optional `vehicleModelId` |
| GET | `/locations` | Pickup/dropoff locations for store |
| GET | `/payment-methods` | Public payment method list + surcharge |
| GET | `/order/:reference` | Lookup `orders_raw` booking + enriched totals |
| GET | `/transfer-routes` | Transfer routes for store (includes `pricing_type` after 052) |

### 4.5 Dependency Injection (`server.ts → app.locals.deps`)

Repositories/ports injected: `order`, `orderItem`, `orderAddon`, `payment`, `customer`, `fleet`, `employee`, `config`, `accounting`, `timesheet`, `transfer`, `maintenance`, `expense`, `todo`, `cashReconciliation`, `cardSettlement`, `miscSale`, `merchandise`, `paymentRouting`, `leaveBalance`, `payroll`, `pawCard`, `booking`, `repairs`.

> **Gap:** `directory` route uses raw `getSupabaseClient()` — not via `app.locals.deps` pattern.

---

## 5. Frontend Architecture

### 5.1 Shell

```
App.tsx
└── QueryClientProvider (staleTime: 30s)
    └── BrowserRouter
        └── ErrorBoundary
            └── AppRouter (lazy routes + Suspense)
                ├── Public: /book/* → PageLayout + home components
                └── Protected: ProtectedRoute → AppLayout + Sidebar + page
```

### 5.2 Public Route Map (`/book/*`)

| Path | Page | Notes |
|------|------|-------|
| `/` | Navigate → `/book` | |
| `/book` | `HomePage` | Full rebuilt homepage — see §5.5 |
| `/book/reserve` | `BrowseBookPage` | Vehicle selection + basket |
| `/book/basket` | `BasketPage` | Review + checkout |
| `/book/confirmation` | `ConfirmationPage` | Order confirmed |
| `/book/confirmation/:reference` | `ConfirmationPage` | Named reference variant |
| `/book/extend` | `ExtendPage` | Rental extension flow |
| `/book/paw-card` | `PawCardPage` | Paw Card logging |
| `/book/repairs` | `RepairsPage` | Repair cost calculator |
| `/book/about` | `AboutPage` | About Lola's |
| `/book/privacy` | `PrivacyPage` | Privacy policy |
| `/book/transfer/:token` | `PublicBookingPage` | Token-based transfer |
| `/login` | `LoginPage` | Staff PIN login |

### 5.3 Backoffice Route Map (JWT required, `AppLayout` + `Sidebar`)

| Path | Page | Permission |
|------|------|------------|
| `/dashboard` | `DashboardPage` | All authenticated; financial blocks need `ViewDashboard` |
| `/orders/inbox` | `InboxPage` | `ViewInbox` |
| `/orders/active` | `ActivePage` | `ViewActive` |
| `/orders/completed` | `CompletedPage` | `ViewCompleted` |
| `/fleet` | `FleetPage` | `ViewFleet` |
| `/fleet/utilization` | `UtilizationDashboard` | `ViewFleetBookValue` (**v3: gated**) |
| `/maintenance` | `MaintenancePage` | `ViewMaintenance` |
| `/transfers` | `TransfersPage` | `ViewTransfers` |
| `/accounts` | `AccountsPage` | `ViewAccounts` |
| `/accounts/:id` | `AccountDetailPage` | `ViewAccounts` |
| `/card-settlements` | `CardSettlementsPage` | `ViewCardSettlements` |
| `/cashup` | `CashupPage` | `ViewCashup` |
| `/hr/employees` | `EmployeesPage` | `ManageEmployees` |
| `/hr/timesheets` | `TimesheetsPage` | `ViewTimesheets` |
| `/hr/payroll` | `PayrollPage` | `ViewPayroll` |
| `/expenses` | `ExpensesPage` | `ViewExpenses` |
| `/todo` | `TodoPage` | `ViewTodo` |
| `/misc-sales` | `MiscSalesPage` | `ViewMiscSales` |
| `/merchandise` | `MerchandisePage` | — |
| `/lost-opportunity` | `LostOpportunityPage` | `ViewLostOpportunity` |
| `/settings` | `SettingsPage` | `EditSettings` (**v3: gated**) |
| `/ui-errors` | `UIErrorsPage` | `ViewUIErrors` |
| `/directory` | `DirectoryPage` | Any authenticated (no perm gate) |

### 5.4 PageLayout + Navigation (v3)

**`PageLayout.tsx`**
- Top bar: `PillNav` with logo, `NAV_ITEMS` (Home, Reserve, Repairs, About, **My Rental** dropdown → Paw Card + Extend).
- Optional floral decorations (`fullBleed` prop removes side padding for homepage hero).
- Mobile bottom tab bar (`BOTTOM_NAV`) — emoji icons, active routing state.
- `ClickSpark` applied globally for tap/click particle effect.
- Footer: quick links + social icons.

**`PillNav.tsx`**
- **GSAP** timeline animations: pill hover — circle expands, label swaps.
- Desktop: pill links + animated "My Rental" dropdown.
- Mobile: hamburger menu; closes on route change.
- Active state: teal background on current route.
- `sand-brand` (`#f1e6d6`) background strip.

### 5.5 Homepage Sections (v3 — `HomePage.tsx`)

The homepage is **fully rebuilt** in v3. Section order:

| # | Section | Component(s) | Key features |
|---|---------|-------------|--------------|
| 1 | **Hero** | Inline `HeroSection` | `VariableProximity` headline (desktop); animated `motion.h1` (touch/reduced-motion); framer-motion parallax clouds (5 clouds, mouse-driven on desktop, figure-8 float on touch); flowers (framer-motion float); scroll CTA; fade-up subheadline + button |
| 2 | Divider | `SectionDivider variant="dash"` | Road SVG divider |
| 3 | **Fleet Preview** | `FleetPreviewSection` | Honda Beat + TukTuk cards; `BorderGlow` + `TiltableCard`; real pricing from `/model-pricing` API; touch: scroll-in animation |
| 4 | Divider | `SectionDivider variant="bold" flip` | Scooter road SVG |
| 5 | **What's Included** | `InclusionMarquee` | Scrolling marquee of inclusion icons |
| 6 | Divider | `SectionDivider variant="dash" flip` | |
| 7 | **Why Choose Us** | Three `TiltedCard` | 3D tilt on desktop; `whileInView` fade-in on touch |
| 8 | Divider | `SectionDivider variant="bold" flip` | |
| 9 | **Be Pawsitive** | `Stack` (50 images) + `CountUp` | All 50 animal photos rotate; animated ₱282,995 counter; paw divider; Facebook CTA |
| 10 | **Paw Card + Stepper** | `PawCardCallout` + `Stepper` | Side-by-side grid; teal card with gold CTA; 4-step Paw Card explainer |
| 11 | Divider | `SectionDivider variant="dash"` | |
| 12 | **Reviews** | `ReviewsSection` | Static review cards |

### 5.6 Home Components (`apps/web/src/components/home/`)

| Component | Purpose | Animation | API |
|-----------|---------|-----------|-----|
| `BorderGlow.tsx` | Edge-glow card wrapper; pointer CSS vars; **HSL-based conic gradient**; gold default | CSS conic; pointer vars | None |
| `BorderGlow.css` | Glow styles | — | — |
| `CircularGallery.tsx` | WebGL curved image gallery (OGL/shaders) | OGL scroll | None |
| `ClickSpark.tsx` | Click/tap particle burst | CSS transforms | None |
| `CountUp.tsx` | Animated number counter | framer-motion spring | None |
| `DomeGallery.tsx` | 3D dome image gallery | @use-gesture drag | None |
| `FleetPreviewSection.tsx` | Vehicle cards with pricing | framer-motion tilt / touch scroll-in | `/public/booking/availability`, `/locations`, `/quote`, `/model-pricing` |
| `InclusionIcon.tsx` | Icon atom | None | None |
| `InclusionMarquee.tsx` | Auto-scrolling inclusions strip | CSS marqueeScroll | None |
| `PawCardCallout.tsx` | Paw Card teal marketing card | None | None |
| `ReviewsSection.tsx` | Static review cards | FadeUpSection | None |
| `SectionDivider.tsx` | Road SVG dividers (`dash`/`bold`, `flip` prop) | None | None |
| `SpotlightCard.tsx` | Mouse-spotlight card wrapper | CSS radial gradient | None |
| `SpotlightCard.css` | Spotlight styles | — | — |
| `Stack.tsx` | Draggable/autoplay card stack | framer-motion spring | None |
| `Stack.css` | Stack + gold shadow styles | — | — |
| `Stepper.tsx` | Multi-step Paw Card walkthrough | framer-motion slide | None |
| `Stepper.css` | Brand-styled stepper | — | — |
| `TiltedCard.tsx` | "Why Choose Us" 3D tilt tiles; **gold glow**; `whileInView` on touch | framer-motion spring; CSS box-shadow | None |
| `VariableProximity.tsx` | Variable-font weight by mouse proximity | CSS font-variation-settings | None |
| `VariableProximity.css` | Roboto Flex font face | — | — |

> **Unused in live pages:** `CircularGallery.tsx` (OGL WebGL), `DomeGallery.tsx` — both exist in source but not referenced by any active page route.

### 5.7 Hooks (`apps/web/src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useIsTouchDevice.ts` | **v3 new** — detects `(hover: none)` media query; drives animation swap on mobile |
| `useToast.ts` | Local toast list with auto-dismiss |
| `use-payment-routing.ts` | Config + helpers for card/cash/GCash/receivable/deposit routing |
| `useTaskRealtime.ts` | Supabase realtime on `task_notifications`; invalidates React Query todo keys |

### 5.8 Zustand Stores (`apps/web/src/stores/`)

| Store | Persistence | Purpose |
|-------|-------------|---------|
| `auth-store` | localStorage | JWT token, user profile, `hasPermission()` |
| `bookingStore` | Session | Session token, dates, locations, basket items |
| `ui-store` | sessionStorage | Selected store, sidebar state, filters |
| `task-notification-store` | Memory | In-app task banners |
| `realtime` | Memory | Generic Supabase subscription map |

### 5.9 API Client Modules (`apps/web/src/api/` — 20 files)

`client.ts`, `accounting.ts`, `card-settlements.ts`, `cashup.ts`, `config.ts`, `dashboard.ts`, `directory.ts`, `expenses.ts`, `fleet.ts`, `hr.ts`, `lost-opportunity.ts`, `maintenance.ts`, `merchandise.ts`, `misc-sales.ts`, `orders.ts`, `orders-raw.ts`, `paw-card.ts`, `todo.ts`, `transfers.ts`, `ui-errors.ts`.

### 5.10 Tailwind Config (v3)

**Keyframes defined:**

| Name | Use |
|------|-----|
| `slide-up` | Toast |
| `page-fade-in` | Page transitions |
| `fade-up` | `FadeUpSection` entrance |
| `toast-slide-up` | Toast |
| `card-enter` | Fleet card entrance (`animate-card-enter`) |
| `badge-pop` | Badge scale |
| `float-slow/medium/fast` | Cloud idle float |
| `cloudDriftLegacy` | Legacy cloud drift (retained) |
| `scooterDrive` | Scooter marquee |

**`index.css` additional keyframes (v3):**

| Name | Use |
|------|-----|
| `marqueeScroll` | `InclusionMarquee` scroll strip |
| `borderPulse` | **v3** — gold (`rgba(252,188,90,…)`) pulsing glow for `BorderGlow` on touch |
| `lolaRide` | Lola scooter animation |

---

## 6. Domain Model (`packages/domain`)

### 6.1 Entities (7)

`Order`, `Vehicle`, `Employee`, `JournalTransaction`, `Timesheet`, `Transfer`, `MaintenanceRecord`

### 6.2 Value Objects (5)

`Money`, `StoreId`, `Period`, `DateRange`, `OrderStatus`

### 6.3 Services (3)

`DepositCalculator`, `DepreciationService`, `PayrollCalculator`

### 6.4 Errors

`DomainError` (base class used by all domain throws)

### 6.5 Ports (29 interfaces)

`OrderRepository`, `OrderItemRepository`, `OrderAddonRepository`, `PaymentRepository`, `CustomerRepository`, `FleetRepository`, `AccountingPort`, `EmployeeRepository`, `TimesheetRepository`, `LeaveBalancePort`, `PayrollPort`, `TransferRepository`, `MaintenanceRepository`, `ExpenseRepository`, `CashReconciliationRepository`, `CardSettlementRepository`, `TodoRepository`, `ConfigRepository`, `AuthPort`, `SheetSyncPort`, `RecurringBillsPort`, `PawCardPort`, `MiscSaleRepository`, `MerchandiseRepository`, `PaymentRoutingRepository`, `ReviewRepository`, `DirectoryRepository`, `BookingPort`, `RepairsPort`

> **Gap:** `DirectoryRepository` port exists but the live `directory` route uses raw Supabase client, not the port/adapter pattern.

---

## 7. Shared Contracts (`packages/shared`)

### 7.1 Permission Strings (28 keys)

```typescript
ViewInbox, ViewActive, ViewCompleted, ViewFleet, ViewMaintenance,
EditMaintenance, ViewTransfers, EditTransfers, ViewCardSettlements,
ViewExpenses, EditExpenses, ViewTimesheets, SubmitTimesheets,
ViewTodo, ViewLostOpportunity, ViewCashup, EditOrders, EditFleet,
ViewUIErrors, ViewMiscSales, ApproveTimesheets, EditAccounts,
ViewPayroll, ViewAccounts, ViewDashboard, ViewFleetBookValue,
OverrideCashup, ManageTodo, ManageEmployees, EditSettings
```

### 7.2 Zod Schema Modules (21 files)

`auth-schemas`, `order-schemas`, `orders-raw-schemas`, `fleet-schemas`, `accounting-schemas`, `config-schemas`, `hr-schemas`, `transfer-schemas`, `payroll-schemas`, `cashup-schemas`, `expense-schemas`, `todo-schemas`, `paw-card-schemas`, `maintenance-schemas`, `misc-sales-schemas`, `merchandise-schemas`, `payment-routing-schemas`, `ui-errors-schemas`, `lost-opportunity-schemas`, `extend-schemas`, `directory-schemas`

### 7.3 Constants

| File | Contents |
|------|----------|
| `constants/permissions.ts` | `Permission` object + `ALL_PERMISSIONS` array |
| `constants/order-status.ts` | Order status string literals |
| `constants/reference-types.ts` | Reference prefix conventions |
| `constants/store-mapping.ts` | Store ID → slug mapping |

### 7.4 API Types

`ApiResponse<T>`, `PaginatedResponse<T>` in `types/api-types.ts`.

---

## 8. Data Flows

### 8.1 Direct Booking (Customer Website)

```
Customer visits /book
  → FleetPreviewSection calls GET /public/booking/availability
  → GET /public/booking/model-pricing per model (minDailyRate)
  → Customer selects vehicle → /book/reserve
  → BrowseBookPage: GET /locations, GET /quote
  → Add to basket → /book/basket
  → BasketPage: POST /public/booking/hold
  → Continue → payment method selection
  → POST /public/booking/submit → orders_raw insert
  → Redirect to /book/confirmation/:reference
```

### 8.2 Order Activation (Backoffice)

```
InboxPage: GET /orders-raw (unprocessed)
  → Staff reviews → POST /orders-raw/process
    → activate_order_atomic RPC:
      INSERT orders, order_items, order_addons
      UPDATE fleet status
      Optional journal legs
  → Order appears in /orders/active
```

### 8.3 Payment Collection

```
ActivePage → collect payment modal
  → POST /orders/:id/payment (collect-payment use-case)
    → INSERT payments
    → Optional journal legs (revenue, deposit)
  → Order moves to completed when fully settled
```

### 8.4 Cash-Up

```
CashupPage: GET /cashup/summary (store-filtered, incl. deposits-held)
  → Staff enters counted cash
  → POST /cashup/reconcile
    → reconcile_cash_atomic RPC:
      UPSERT cash_reconciliation
      Lock/journal entry
  → POST /cashup/override (OverrideCashup permission)
```

### 8.5 Payroll

```
TimesheetsPage (All-Stores option, UTC date fix)
  → Staff submits → ApproveTimesheets
  → PayrollPage: GET /payroll/payslip (calc preview)
  → RunPayrollModal: POST /payroll/run
    → run_payroll_atomic RPC:
      INSERT journal_entries from p_transactions jsonb
      UPDATE timesheets.payroll_status
```

### 8.6 Expenses

```
Create: POST /expenses → create_expense_with_journal
  → If status='unpaid': expense recorded, no journal yet
  → If status='paid': expense + journal legs

Pay batch: POST /expenses/pay → pay_expenses_atomic
  → Batch journals for all unpaid rows

ExpensesPage chart: Last Month (v3 change from Last 30 Days)
```

### 8.7 Transfer Booking (Public)

```
Customer receives transfer token
  → GET /public/transfer-routes (includes pricing_type: fixed|per_head)
  → POST /public/transfer-booking with token
  → Transfer record created; staff notified
```

### 8.8 Paw Card

```
Customer visits /book/paw-card
  → POST /public/paw-card/lookup (email → customer)
  → POST /paw-card/submit (savings entry + receipt upload)
  → Staff reviews in backoffice /paw-card
  → GET /paw-card/company-impact (aggregate donation)
```

### 8.9 Dashboard (v3 updates)

```
GET /api/dashboard/summary?storeId=
  → Cash balances: now store-filtered + deposits-held included
  → Customer breakdown: parseCountryFromMobile → pie charts
    (by country AND continent)
  → Expenses chart: Last Month only
  → Financial blocks gated by can_view_dashboard
```

---

## 9. Authentication & Security

### 9.1 Auth Flow

1. Staff submits PIN at `/login`
2. `POST /api/auth/login` validates PIN hash (bcrypt) against `users` table
3. JWT issued with `{ userId, storeIds, permissions }` payload
4. Token stored in Zustand `auth-store` (localStorage)
5. All backoffice API calls: `Authorization: Bearer <token>`
6. `authenticate.ts` middleware verifies JWT, attaches `req.user`
7. `authorize.ts` + `requirePermission` checks permission string

### 9.2 Security Assessment (v3)

| Area | Status | Notes |
|------|--------|-------|
| JWT verification | ✅ PASS | `jsonwebtoken` verify |
| Permission checks | ✅ PASS | Edit* split for expenses/maintenance/transfers; settings + fleet book value gated (v3) |
| Rate limiting | ✅ PASS | Login / public / API tiers in place |
| RLS vs service role | ⚠️ WARN | API service role bypasses RLS — Express is enforcement boundary |
| Public endpoints | ⚠️ WARN | Unauthenticated but rate-limited; model-pricing new endpoint same tier |
| CORS | ⚠️ WARN | `ALLOWED_ORIGIN` env var allowlist |
| File upload | ✅ PASS | Multer limits; Supabase storage policies (030) |
| Health endpoint | ✅ PASS | `/health` exists |
| PIN hardening | ⚠️ WARN | No complexity/rotation policy enforced |
| API versioning | ⚠️ WARN | No `/v1/` prefix |
| Audit logging | ❌ OPEN | No audit trail for mutations |

---

## 10. Edge Functions & Webhooks

### 10.1 `supabase/functions/order-webhook/index.ts`

- **Runtime:** Deno (Supabase Edge Function)
- **Trigger:** WooCommerce `order.created` webhook → HTTPS POST
- **Validation:** HMAC signature check (`X-WC-Webhook-Signature`)
- **Action:** Parse WooCommerce order payload → INSERT into `orders_raw`
- **Client:** Supabase JS with service role key from env

### 10.2 Google Sheets

- **Adapter:** `apps/api/src/adapters/google-sheets/`
- **Cron job:** `jobs/sheets-sync.ts` — syncs order/fleet data to Google Sheets
- **Auth:** Service account via `googleapis`
- **Status:** Operational; legacy integration retained

### 10.3 Background Jobs (`node-cron`)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `sheets-sync` | Periodic | Sync records to Google Sheets |
| `recurring-bills` | Daily | Auto-create recurring expense entries |
| `fleet-status-sync` | Periodic | Reconcile vehicle availability |
| `leave-reset` | Annual | Reset employee leave balances |

---

## 11. Known Issues & Code Smells

### 11.1 Architecture

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | Service role bypasses RLS | High | All RLS is decorative for API paths |
| 2 | `directory` route uses raw Supabase client | Medium | Breaks `app.locals.deps` pattern; `DirectoryRepository` port unused |
| 3 | Dynamic `import()` per request in use-cases | Low | Cold-start latency; minor |
| 4 | No API versioning (`/v1/` prefix absent) | Medium | Breaking changes risk |
| 5 | Monolith Express (not microservices) | Low | Acceptable at current scale |
| 6 | `CircularGallery.tsx` + `DomeGallery.tsx` bundled but unused | Low | ~OGL + gesture weight in bundle |

### 11.2 Type Safety

- Pervasive `Record<string, unknown>` / casting in dashboard, fleet, cashup, card-settlements routes.
- Dashboard `summary` endpoint constructs many raw SQL strings with type assertions.

### 11.3 Bundle Size

Build output flags several chunks >500 KB (noted in Rollup warnings):
- `index-*.js` ~510 KB gzip ~146 KB
- `DashboardPage-*.js` ~398 KB gzip ~117 KB
- `HomePage-*.js` ~180 KB gzip ~59 KB
- Large SVG assets (Paw Divider, Paw Print ~1.4 MB each) loaded as static assets

### 11.4 Performance

- Dashboard runs many parallel Supabase queries per request — monitor load.
- React Query 30s staleTime: multi-user data may be stale.
- `Be Pawsitive/` folder: 50 PNG images (~75 MB total) loaded as static imports in `HomePage.tsx` — all 50 bundled eagerly.
- Plus Jakarta Sans declared in Tailwind `font-body` but not loaded via `<link>` in `index.html` — silent fallback.

### 11.5 UX / Accessibility

- `VariableProximity` headline is mouse-only; touch fallback added (v3) via `useIsTouchDevice`.
- `BorderGlow` edge glow: pointer-only; touch shows `borderPulse` CSS animation (v3).
- `CircularGallery` / `DomeGallery` have no accessible alternatives.
- No `aria-live` regions for toast notifications.

### 11.6 Data / Concurrency

- Public extend and some multi-step flows lack DB-level locking (RPC coverage partial).
- `booking_holds` TTL/cleanup not verified in active cron schedule.
- No optimistic concurrency control on fleet swaps.

---

## 12. Gap Analysis (Prioritized)

### CRITICAL

| ID | Gap | v3 Status |
|----|-----|-----------|
| C1 | ~~No rate limiting~~ | ✅ **Done** — login/public/API tiers |
| C2 | DB transactions | ✅ **Largely mitigated** — 7 atomic RPCs cover activation, payroll, cashup, card, expenses; transfer + extend flows still partial |
| C3 | Audit logging | ❌ **Open** — no mutation audit trail |
| C4 | Extension hold races | ❌ **Open** — extend flow lacks DB lock |
| C5 | Backup / DR documentation | ❌ **Open** — operational responsibility |

### HIGH

| ID | Gap | v3 Status |
|----|-----|-----------|
| H1 | Coarse permissions | ✅ **Improved** — Edit* split; settings + fleet-book-value gated (v3) |
| H2 | Pagination on lists | ❌ **Open** — most list endpoints return all rows |
| H3 | Repository consistency | ❌ **Open** — directory still direct client |
| H4 | Integration tests | ❌ **Open** |
| H5 | ~~Health check~~ | ✅ **Done** |
| H6 | PIN hardening | ❌ **Open** — no rotation/complexity policy |
| H7 | Google Sheets legacy dependency | ❌ **Open** |
| H8 | HTTPS / HSTS | ⚠️ **Hosting concern** |
| H9 | **50 Be Pawsitive PNGs eager import** | 🆕 **New** — large bundle; should be lazy-loaded or served from CDN |
| H10 | **No ViewDirectory permission** | 🆕 **New** — directory visible to all authenticated users; should have own perm |

### MEDIUM

| ID | Gap | v3 Status |
|----|-----|-----------|
| M1 | OpenAPI / Swagger documentation | ❌ Open |
| M2 | Structured logging (API) | ❌ Open |
| M3 | CSV/PDF export for key reports | ❌ Open |
| M4 | CI/CD pipeline | ❌ Open |
| M5 | Realtime breadth (orders, fleet) | ❌ Open — only todo has realtime |
| M6 | ~~No dashboard~~ | ✅ Done |
| M7 | ~~Directory unused~~ | ✅ Done |
| M8 | Plus Jakarta Sans not loaded | 🆕 **New** — Tailwind `font-body` references unloaded font |
| M9 | `CircularGallery` + `DomeGallery` dead weight | 🆕 **New** — OGL + gesture in bundle for unused components |
| M10 | Reviews section is static hardcoded | ❌ Open — no API; `ReviewsSection.tsx` uses static array |

### LOW

| ID | Gap | Notes |
|----|-----|-------|
| L1 | i18n / localization | No multi-language support |
| L2 | Recurring bills UI | Exists in backend/DB but no dedicated UI page |
| L3 | `booking_holds` cleanup verification | Holds may persist if TTL job not confirmed |
| L4 | `ogl` package bundled for unused component | Can remove if `CircularGallery` stays unused |
| L5 | Accessibility audit | No WCAG audit completed |

---

## Summary Statistics (v3)

| Metric | Count / Value |
|--------|---------------|
| SQL migration files | **50** (numbers 001–052, gaps 028–030) |
| Database tables | **52** named tables |
| Atomic PostgreSQL RPCs | **7** |
| API route modules (excl. index) | **27** |
| Estimated API surface | **110+** endpoints |
| Frontend page TSX files | **46+** |
| Frontend component files | **90+** |
| Home-specific components | **20** (16 active, 2 unused) |
| Web API client modules | **20** |
| Zustand stores | **5** |
| Frontend hooks | **4** |
| Domain entities | **7** |
| Domain ports | **29** |
| Zod schema modules | **21** |
| Permission strings | **28** (+ `EditSettings`, `ViewFleetBookValue`) |
| Use-case TS files | **58+** |
| Animation libraries | **3** (framer-motion, GSAP, CSS) |
| Be Pawsitive photo assets | **50 PNGs** |
| Google Fonts loaded | **4** (Alegreya Sans, Lato, Playfair Display, Roboto Flex) |

---

> **End of SYSTEM_AUDIT_v3.md.**
> SYSTEM_AUDIT_v2.md retained at repo root for history.
> Update this document when migrations, routes, or major UI flows change.
> Track Section 12 items in project management tooling.
