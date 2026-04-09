# SYSTEM_AUDIT_v4.md — Lola's Rentals Platform

> **Audit Date:** 2026-04-06
> **Auditor:** AI Architect (Forensic Codebase Audit, v4)
> **Scope:** `apps/api`, `apps/web`, `packages/domain`, `packages/shared`, `supabase/migrations` (001–053+), `supabase/functions`, root configuration
> **Purpose:** Master reference for architecture, schema, APIs, UI, security, and prioritized gaps. **Supersedes v3 for active use**; `SYSTEM_AUDIT_v3.md` is retained for history.
> **Delta from v3:**
> - **Migrations 053+:** `late_return_assignments` table; `orders_raw.cancelled_at / cancelled_reason`; `orders_raw` status check extended to include `'cancelled'`; `paw_card_establishments` +14 columns; `employees.default_payment_method`; `repair_costs` (already existed, no schema change in v4).
> - **New API endpoints (15):** cancel order, walk-in booking, extend preview, repair costs CRUD, charity impact (dashboard + public), paw-card customer savings, cashup late-return assignment, cashup late-returns-check, accounting drawings, payroll preview.
> - **New frontend components (14):** `PageHeader`, `BrandCard`, `BePawsitiveMeter`, `BeforeCloseModal`, `MidayLostOpportunityBanner`, `CancelOrderModal`, `WalkInBookingModal`, `ExtendOrderModal`, `OwnerDrawingsModal`, `Aurora`, `RepairCostsTab`; RepairsPage + RepairCostsSection rebuilt.
> - **Key logic:** Per-employee payroll payment methods, payroll inflators (holiday/SIL/POM/9pm bonus), owner drawings exclusion; maintenance pay-later + downtime redesign; cashup Before Close Modal (gates submission); midday lost-opportunity banner; two-step extend flow; walk-in + cancel from inbox; Be Pawsitive meter; Manila timezone fix for direct booking datetimes; inbox pickup shows date + time; typography system-wide audit (font-lato / font-headline enforcement, brand color corrections); global `.font-headline` CSS color rule; `DESIGN_SYSTEM.md` created.

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
│   │   │   ├── use-cases/          ← 60+ files across 17 domain areas
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
│       │   ├── index.css           ← Tailwind layers; @keyframes; borderPulse; marqueeScroll; font-headline global color
│       │   ├── api/                ← 20 client modules (React Query hooks)
│       │   ├── stores/             ← auth, ui, booking, realtime, task-notification
│       │   ├── pages/              ← 46+ page TSX files across ~25 route areas
│       │   ├── components/         ← 100+ files across layout, home, backoffice sections
│       │   ├── hooks/              ← useIsTouchDevice, useToast, useTaskRealtime, use-payment-routing
│       │   └── utils/
│       ├── DESIGN_SYSTEM.md        ← *** NEW (v4) — complete brand reference ***
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
│   ├── migrations/                 ← SQL files numbered 001–053+ (gaps: 028–030)
│   └── functions/
│       └── order-webhook/          ← Deno edge function (WooCommerce → orders_raw)
│
├── package.json                    ← workspaces, build/dev/test scripts
├── SYSTEM_AUDIT v1                 ← Historical (retained)
├── SYSTEM_AUDIT_v2.md              ← Historical (retained)
├── SYSTEM_AUDIT_v3.md              ← Historical (retained)
├── SYSTEM_AUDIT_v4.md              ← This document
├── docs/architecture.md
└── tsconfig.json, eslint, etc.
```

### 1.2 Route Files — `apps/api/src/routes/` (27 modules)

`accounting.ts`, `auth.ts`, `card-settlements.ts`, `cashup.ts`, `config.ts`, `dashboard.ts`, `directory.ts`, `expenses.ts`, `fleet.ts`, `hr.ts`, `index.ts`, `lost-opportunity.ts`, `maintenance.ts`, `merchandise.ts`, `misc-sales.ts`, `orders-raw.ts`, `orders.ts`, `paw-card.ts`, `payroll.ts`, `public-booking.ts`, `public-extend.ts`, `public-paw-card.ts`, `public-repairs.ts`, `public-transfers.ts`, `todo.ts`, `transfers.ts`, `ui-errors.ts`

### 1.3 Use-Case Files — `apps/api/src/use-cases/` (60+ files)

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
- **Design system:** `apps/web/DESIGN_SYSTEM.md` — brand reference for all future page builds (v4 new).

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
| Animation | **framer-motion 12.x** | Homepage hero, tiles, scroll, BrandCard tilt |
| Animation | **GSAP 3.14.x** | PillNav hover pill animations |
| Gestures | **@use-gesture/react 10.x** | DomeGallery drag |
| WebGL | **ogl 1.x** | CircularGallery (currently unused in live pages) |
| Icons | lucide-react | Backoffice sidebar |
| Language | TypeScript strict | |
| Realtime | Supabase JS 2.x | Todo / task notifications |

**Typography (v4 state — after typography audit)**

| Tailwind token | Font | Usage |
|----------------|------|-------|
| `font-headline` / `font-sans` | **Alegreya Sans** | All headings; global `color: #00577C` set in `index.css` |
| `font-lato` | **Lato** (+ Nunito fallback) | Body copy, labels, captions, CTA text, UI copy — explicitly required on all non-heading text |
| `font-display` | **Playfair Display** | Display headings (hero, reserved) |
| `font-body` | Plus Jakarta Sans | Root `<div>` default only; not a substitute for `font-lato` |
| CSS `font-family: Roboto Flex` | **Roboto Flex** (variable) | `VariableProximity` component only |

> **v4 change:** Global `.font-headline { color: #00577C }` + `.font-headline .accent, .font-headline span.gold { color: #FCBC5A; font-style: italic }` rules added to `index.css`. Typography audit corrected `font-body` bleed into labels/captions across VehicleCard, RentalSummaryCard, BasketVehicleCard, RepairCostsSection, ConfirmationPage, ExtendPage ConfirmedView, PawCardPage. `#1A7A6E` instances in PawCardPage corrected to `#00577C` (teal-brand). `bg-teal-700` / `text-teal-700` corrected to `bg-teal-brand` / `text-teal-brand` in VehicleCard.

**Brand tokens (v4 confirmed)**

| Token | Hex | Usage |
|-------|-----|-------|
| `teal-brand` | `#00577C` | Nav, accents, headings, overlines |
| `gold-brand` | `#FCBC5A` | Buttons, glows, CTAs, italic accent spans |
| `cream-brand` | `#FAF6F0` | Card backgrounds |
| `sand-brand` | `#f1e6d6` | Hero + section backgrounds, `PageHeader` background |
| `charcoal-brand` | `#363737` | Dark text, borders, button text on gold |

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
| Cron | `node-cron` (sheets-sync, recurring-bills, fleet-status-sync, leave-reset) |
| External | `googleapis` (Google Sheets sync) |

### 2.3 Database & Infrastructure

| Component | Technology |
|-----------|------------|
| Database | Supabase (PostgreSQL) |
| Migrations | SQL files through **053+** (gaps: 028–030) |
| RLS | Enabled; `user_store_ids()`, `has_permission()` helpers — **bypassed by API service role** |
| Edge | Supabase Edge Function `order-webhook` (Deno) |
| External | Google Sheets sync; WooCommerce webhooks |

### 2.4 Environment Variables

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ALLOWED_ORIGIN` (comma-separated CORS list), `GOOGLE_SHEETS_*`, `PORT` (default 3001), `VITE_API_URL` (frontend proxy target).

---

## 3. Database Schema

### 3.1 Complete Table Catalog

Tables introduced across migrations 001–053+:

| Table | Description |
|-------|-------------|
| `stores` | Physical rental locations |
| `roles` | Staff roles |
| `role_permissions` | Role → permission mapping |
| `employees` | Staff records (+ `default_payment_method` from v4) |
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
| `paw_card_establishments` | Partner businesses for Paw Card (+ 14 new cols v4) |
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
| `orders_raw` | Raw WooCommerce/webhook orders (+ `cancelled_at`, `cancelled_reason` v4) |
| `order_payments` | Payments linked to orders_raw |
| `payment_routing_rules` | Payment routing configuration |
| `task_categories` | Todo task categories |
| `task_events` | Task event log |
| `task_notifications` | Realtime task notifications |
| `leave_reset_log` | Annual leave reset audit |
| `booking_holds` | Temporary inventory holds |
| `repair_costs` | Published repair cost catalog |
| **`late_return_assignments`** | **NEW v4** — daily late-return vehicle-to-employee assignment |

### 3.2 Migration Index (001–053+)

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
| **052** | `transfer_routes.pricing_type` `text NOT NULL DEFAULT 'fixed' CHECK ('fixed','per_head')` |
| **053+** | **`late_return_assignments`** (store_id, date, employee_id, note, UNIQUE(store_id, date)); `orders_raw.cancelled_at timestamptz`, `orders_raw.cancelled_reason text`; `orders_raw` status check extended to include `'cancelled'`; `paw_card_establishments` +14 columns; `employees.default_payment_method text` |

### 3.3 Column Detail — Key Tables (v4 additions)

#### `orders_raw` (v4 state)

| Column | Type | Notes |
|--------|------|-------|
| (existing cols) | | |
| `web_payment_method` | text | From 042 |
| `cancelled_at` | timestamptz | **NEW v4** — set on soft-cancel |
| `cancelled_reason` | text | **NEW v4** — reason string on cancel |
| `status` | text CHECK | Extended in v4: now includes `'cancelled'` in addition to prior values |

#### `late_return_assignments` (v4 — new table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `store_id` | uuid FK stores | |
| `date` | date | Assignment date |
| `employee_id` | uuid FK employees | Assigned employee |
| `note` | text | Optional note |
| (timestamps) | | |
| **UNIQUE** | `(store_id, date)` | One assignment per store per day |

#### `employees` (v4 addition)

| Column | Type | Notes |
|--------|------|-------|
| (existing cols) | | |
| `default_payment_method` | text | **NEW v4** — per-employee default payment method for payroll |

#### `paw_card_establishments` (v4 addition)

14 new columns added (exact column names stored in migration; cover details such as extended business info, operating hours, discount details, etc. — refer to the specific migration file for authoritative column list).

#### `expenses` (unchanged from v3 — shown for reference)

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

#### `transfer_routes` (unchanged from v3)

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
| `/dashboard` | dashboard.ts | Yes | `GET /summary` — store-filtered KPIs, cash balances incl. deposits-held, pie charts by country/continent; financial blocks gated by `can_view_dashboard`; **NEW v4:** `GET /charity-impact` |
| `/directory` | directory.ts | Yes | `GET /` list, `POST /` create, `PUT /:id`, `DELETE /:id` |
| `/orders-raw` | orders-raw.ts | Yes | Raw inbox, process, sync; **NEW v4:** `PATCH /:id/cancel`, `POST /walk-in` |
| `/orders` | orders.ts | Yes | List, enriched, `/:id`, activate, settle, payment, modify-addons, adjust-dates, swap-vehicle |
| `/fleet` | fleet.ts | Yes | CRUD, utilization (`can_view_fleet_book_value`), calendar, depreciation |
| `/accounting` | accounting.ts | Yes | Balances, entries, fund transfers; **NEW v4:** `POST /drawings` |
| `/transfers` | transfers.ts | Yes | CRUD + payments; `EditTransfers` for mutations |
| `/hr` | hr.ts | Yes | Timesheets (All-Stores option, UTC fix), leave, employees |
| `/payroll` | payroll.ts | Yes | Payslip calc, `POST /run` → `run_payroll_atomic`; **NEW v4:** `POST /preview` |
| `/cashup` | cashup.ts | Yes | `GET /summary`, `POST /deposit`, `POST /inter-store-transfer`, `POST /reconcile` → `reconcile_cash_atomic`, `POST /override` (needs `OverrideCashup`); **NEW v4:** `POST /late-return-assignment`, `GET /late-return-assignment`, `GET /late-returns-check` |
| `/expenses` | expenses.ts | Yes | CRUD (`EditExpenses`); `POST /pay` → `pay_expenses_atomic` |
| `/todo` | todo.ts | Yes | Full task lifecycle (create, claim, start, submit, verify, reject, escalate, comment, mark-seen) |
| `/maintenance` | maintenance.ts | Yes | CRUD + complete; `EditMaintenance` for mutations |
| `/config` | config.ts | Yes (`EditSettings`) | Stores, addons, locations, payment methods, vehicle models, pricing, transfer routes, COA, roles, users, routing rules; **NEW v4:** `GET /repair-costs` (auth only, no EditSettings), `POST /repair-costs`, `PUT /repair-costs/:id`, `DELETE /repair-costs/:id` (all three require EditSettings) |
| `/paw-card` | paw-card.ts | Mixed | `GET /`, `/lookup`, `/establishments`, `/lifetime`, `POST /submit`, `/register`, `/upload-receipt` (Multer → Supabase storage); `GET /company-impact`, `/my-submissions`, `/leaderboard`; **NEW v4:** `GET /customer-savings?email=` |
| `/misc-sales` | misc-sales.ts | Yes | CRUD misc revenue |
| `/merchandise` | merchandise.ts | Yes | Inventory CRUD |
| `/card-settlements` | card-settlements.ts | Yes | Pending/settled, `match_card_settlement`, batch, combine |
| `/lost-opportunities` | lost-opportunity.ts | Yes | Lost booking log |
| `/ui-errors` | ui-errors.ts | Yes | UI error reporting |
| `/public` | public-transfers.ts | No | `GET /transfer-routes`, `GET /store-info`, `POST /transfer-booking` (token auth) |
| `/public/booking` | public-booking.ts | No | See §4.4 |
| `/public/paw-card` | public-paw-card.ts | No | `POST /lookup`, `GET /entries`, `GET /rental-orders` |
| `/public/extend` | public-extend.ts | No | `POST /lookup`, `POST /confirm`; **NEW v4:** `GET /preview` |
| `/public/repairs` | public-repairs.ts | No | `GET /costs?vehicleType=` |

**Health:** `GET /health` → `{ status: 'ok' }` (not under `/api`).

### 4.4 Public Booking Endpoints — `/api/public/booking`

All rate-limited by `publicLimiter`. No `authenticate` middleware.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/model-pricing` | `storeId` + `vehicleModelId` → `minDailyRate` + pricing tiers |
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
| GET | `/transfer-routes` | Transfer routes for store |
| **GET** | **`/charity-impact`** | **NEW v4** — public Be Pawsitive donation aggregate for meter widget |

### 4.5 Public Extend Endpoints — `/api/public/extend`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/lookup` | Look up order by email + reference |
| POST | `/confirm` | Confirm extension |
| **GET** | **`/preview`** | **NEW v4** — preview extension cost before confirm; params: `orderReference`, `email`, `newDropoffDatetime` |

### 4.6 Dependency Injection (`server.ts → app.locals.deps`)

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
| `/book` | `HomePage` | Full rebuilt homepage |
| `/book/reserve` | `BrowseBookPage` | Vehicle selection + basket; v4: quantity selector, BrandCard tiles, gold skeuomorphic buttons |
| `/book/basket` | `BasketPage` | Review + checkout |
| `/book/confirmation` | `ConfirmationPage` | v4: Lola video, two-column desktop layout, Stepper replaces QuickTipsCard |
| `/book/confirmation/:reference` | `ConfirmationPage` | Named reference variant |
| `/book/extend` | `ExtendPage` | v4: two-step flow, rate protection, no-downgrade |
| `/book/paw-card` | `PawCardPage` | v4: PageHeader, brand color fix |
| `/book/repairs` | `RepairsPage` | v4: rebuilt with PageHeader + RepairCostsSection |
| `/book/about` | `AboutPage` | About Lola's |
| `/book/privacy` | `PrivacyPage` | Privacy policy |
| `/book/transfer/:token` | `PublicBookingPage` | Token-based transfer |
| `/login` | `LoginPage` | Staff PIN login |

### 5.3 Backoffice Route Map (JWT required, `AppLayout` + `Sidebar`)

| Path | Page | Permission |
|------|------|------------|
| `/dashboard` | `DashboardPage` | All authenticated; financial blocks need `ViewDashboard` |
| `/orders/inbox` | `InboxPage` | `ViewInbox`; v4: search, cancel, walk-in, date+time pickup display |
| `/orders/active` | `ActivePage` | `ViewActive`; v4: Paw Card savings panel, extend modal |
| `/orders/completed` | `CompletedPage` | `ViewCompleted` |
| `/fleet` | `FleetPage` | `ViewFleet` |
| `/fleet/utilization` | `UtilizationDashboard` | `ViewFleetBookValue` |
| `/maintenance` | `MaintenancePage` | `ViewMaintenance`; v4: pay-later, downtime redesign, Today button |
| `/transfers` | `TransfersPage` | `ViewTransfers` |
| `/accounts` | `AccountsPage` | `ViewAccounts` |
| `/accounts/:id` | `AccountDetailPage` | `ViewAccounts` |
| `/card-settlements` | `CardSettlementsPage` | `ViewCardSettlements` |
| `/cashup` | `CashupPage` | `ViewCashup`; v4: BeforeCloseModal gates submission |
| `/hr/employees` | `EmployeesPage` | `ManageEmployees`; v4: default_payment_method |
| `/hr/timesheets` | `TimesheetsPage` | `ViewTimesheets` |
| `/hr/payroll` | `PayrollPage` | `ViewPayroll`; v4: per-employee methods, inflators, drawings |
| `/expenses` | `ExpensesPage` | `ViewExpenses` |
| `/todo` | `TodoPage` | `ViewTodo` |
| `/misc-sales` | `MiscSalesPage` | `ViewMiscSales` |
| `/merchandise` | `MerchandisePage` | — |
| `/lost-opportunity` | `LostOpportunityPage` | `ViewLostOpportunity` |
| `/settings` | `SettingsPage` | `EditSettings`; v4: Repair Costs tab added |
| `/ui-errors` | `UIErrorsPage` | `ViewUIErrors` |
| `/directory` | `DirectoryPage` | Any authenticated (no perm gate) |

### 5.4 PageLayout + Navigation (v4)

**`PageLayout.tsx`**
- Top bar: `PillNav` with logo, `NAV_ITEMS` (Home, Reserve, Repairs, About, **My Rental** dropdown → Paw Card + Extend).
- Optional floral decorations.
- Mobile bottom tab bar (`BOTTOM_NAV`) — emoji icons, active routing state.
  - **v4:** Mobile nav rounded corners removed from active tab indicator.
- `ClickSpark` applied globally.
- Footer: quick links + social icons.
- **Sidebar:** width reduced from `w-64` → `w-52` (v4).

**`PillNav.tsx`**
- GSAP timeline animations; pill hover; "My Rental" dropdown.
- `sand-brand` (`#f1e6d6`) background strip.

**`MidayLostOpportunityBanner.tsx` (NEW v4)**
- Displayed at midday when there are open lost-opportunity entries.
- Shown in backoffice layout above main content.
- Links to `/lost-opportunity` page.

### 5.5 Homepage Sections (unchanged from v3)

See §5.5 of SYSTEM_AUDIT_v3.md. No structural changes in v4.

> **v4 addition:** `BePawsitiveMeter.tsx` — live donation counter widget using `GET /public/booking/charity-impact`; shown as a progress/animated bar on homepage (or embedded in relevant sections).

### 5.6 Home Components (`apps/web/src/components/home/`)

All v3 components retained. **v4 addition:**

| Component | Purpose | API |
|-----------|---------|-----|
| `BePawsitiveMeter.tsx` | **NEW v4** — animated Be Pawsitive fundraising meter with live data | `GET /public/booking/charity-impact` |

### 5.7 Public Components (`apps/web/src/components/public/`)

| Component | Purpose | Notes |
|-----------|---------|-------|
| `FadeUpSection.tsx` | Scroll-in fade-up wrapper | Existing |
| `PrimaryCtaButton.tsx` | Gold skeuomorphic CTA button | Existing |
| `PrimaryCtaLink.tsx` | Anchor CTA variant | Existing |
| **`PageHeader.tsx`** | **NEW v4** — simple centered sand-background header block: eyebrow, teal heading + gold italic accent, subheading; no clouds/florals/animations | — |
| **`BrandCard.tsx`** | **NEW v4** — reusable card wrapper: `BorderGlow` + framer-motion 3D tilt on desktop (damping 30, stiffness 100, mass 2, 8° amplitude); `whileInView` fade-in + `borderPulse` on touch; `glowColor` + `disableTilt` props | — |

> **PageHeader applied to:** `RepairsPage`, `ExtendPage`, `PawCardPage`.
> **BrandCard applied to:** `VehicleCard` (reserve page), `RepairCostsSection` (both vehicle columns).

### 5.8 UI Components (`apps/web/src/components/ui/`)

| Component | Purpose |
|-----------|---------|
| `HeroFloatingClouds.tsx` | Floating cloud layer (existing) |
| **`Aurora.tsx`** | **NEW v4** — animated aurora/gradient background effect |
| **`Aurora.css`** | Styles for Aurora component |

### 5.9 Order Components (`apps/web/src/components/orders/`)

| Component | Purpose | v4 Status |
|-----------|---------|-----------|
| `BookingModal.tsx` | Process raw order into activated order | Updated; pickup/dropoff now uses `formatPickupDatetimeManila` (date + time) |
| `OrderDetailModal.tsx` | View/manage activated order | Updated |
| **`CancelOrderModal.tsx`** | **NEW v4** — double-confirmation cancel flow for orders_raw; calls `PATCH /orders-raw/:id/cancel` | New |
| **`WalkInBookingModal.tsx`** | **NEW v4** — create a walk-in booking directly from inbox; calls `POST /orders-raw/walk-in` | New |
| **`ExtendOrderModal.tsx`** | **NEW v4** — two-step extend flow from active order modal: preview (`GET /public/extend/preview`) + confirm; rate protection, no-downgrade rule | New |

### 5.10 Cashup Components

| Component | Purpose | v4 Status |
|-----------|---------|-----------|
| Existing cashup components | — | Unchanged |
| **`BeforeCloseModal.tsx`** | **NEW v4** — pre-cashup gate: checks for late returns (via `GET /cashup/late-returns-check`), open tasks, and logged lost opportunities before allowing submission | New |

### 5.11 Accounting Components

| Component | Purpose | v4 Status |
|-----------|---------|-----------|
| Existing accounting modals | — | Unchanged |
| **`OwnerDrawingsModal.tsx`** | **NEW v4** — record owner drawings; calls `POST /accounting/drawings`; excluded from payroll `run_payroll_atomic` (monthly `rate_type` filter) | New |

### 5.12 Settings Tabs

| Tab | Component | v4 Status |
|-----|-----------|-----------|
| General, addons, locations, etc. | Existing tabs | Unchanged |
| **Repair Costs** | **`RepairCostsTab.tsx`** (NEW v4) | Two sections (Scooter Honda Beat, TukTuk); table with item name / cost / sort order / edit / delete; add-item modal; `vehicle_type: 'honda_beat' \| 'tuk_tuk'`; uses `useRepairCosts`, `useSaveRepairCost`, `useDeleteRepairCost` hooks |

### 5.13 Repairs Page (v4 rebuilt)

`RepairsPage.tsx` and `RepairCostsSection.tsx` completely rebuilt:
- `RepairsPage` uses `PageHeader` for hero (no clouds/florals); retains sub-sections (WhatToDoSection, EmergencyContactsSection, CommonIssuesSection, SafetyTipsSection) connected by `PawDivider`.
- `RepairCostsSection` uses `useQueries` to fetch both vehicle types concurrently; each column wrapped in `BrandCard`; two-column grid on desktop; disclaimer at bottom.

### 5.14 Confirmation Page (v4)

`ConfirmationPage.tsx` redesigned:
- **Two-column desktop grid** (`md:grid-cols-2 max-w-4xl mx-auto`): left = sticky hero (Lola video circle, "Booking Confirmed!" pill, heading, reference + copy, paw divider, charity block); right = `RentalSummaryCard`.
- **Full-width below grid:** `Stepper` (5 steps: deposit, find us, licence, gear, paw card), "Back to Home" button, WhatsApp help line.
- Lola video (`Checkout_Lola.mp4`) replaces static image.
- `QuickTipsCard` removed; replaced by `Stepper` with deposit amount dynamically calculated (`vehicleModelName.includes('tuktuk')` → ₱2,000 vs ₱1,000).
- Vertical spacing tightened ~30% from v3.

### 5.15 Reserve Page (v4)

`BrowseBookPage` + `VehicleCard` updates:
- `VehicleCard`: wrapped in `BrandCard` (replaces `TiltableCard` + `BorderGlow`); gold skeuomorphic "Add to Basket" button; quantity stepper (−/count/+) replaces single add; `teal-700` tokens corrected to `teal-brand`.
- `BrowseBookPage`: goes straight to `SearchBar` under `HeroFloatingClouds variant="functional"` — no hero section.

### 5.16 Hooks (`apps/web/src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useIsTouchDevice.ts` | Detects `(hover: none)` media query; drives animation swap on mobile |
| `useToast.ts` | Local toast list with auto-dismiss |
| `use-payment-routing.ts` | Config + helpers for card/cash/GCash/receivable/deposit routing |
| `useTaskRealtime.ts` | Supabase realtime on `task_notifications`; invalidates React Query todo keys |

### 5.17 Zustand Stores (`apps/web/src/stores/`)

| Store | Persistence | Purpose |
|-------|-------------|---------|
| `auth-store` | localStorage | JWT token, user profile, `hasPermission()` |
| `bookingStore` | Session | Session token, dates, locations, basket items |
| `ui-store` | sessionStorage | Selected store, sidebar state, filters |
| `task-notification-store` | Memory | In-app task banners |
| `realtime` | Memory | Generic Supabase subscription map |

### 5.18 API Client Modules (`apps/web/src/api/` — 20 files)

`client.ts`, `accounting.ts`, `card-settlements.ts`, `cashup.ts`, `config.ts` (**updated v4:** repair-costs CRUD hooks), `dashboard.ts`, `directory.ts`, `expenses.ts`, `fleet.ts`, `hr.ts`, `lost-opportunity.ts`, `maintenance.ts`, `merchandise.ts`, `misc-sales.ts`, `orders.ts`, `orders-raw.ts` (**updated v4:** cancel + walk-in hooks), `paw-card.ts`, `todo.ts`, `transfers.ts`, `ui-errors.ts`.

### 5.19 Utility: `apps/web/src/utils/date.ts` (v4)

| Export | Purpose |
|--------|---------|
| `formatDate` | Short `en-PH` date in Manila timezone |
| `formatDateTime` | Full date + time `en-PH` Manila |
| `formatTime` | Time only `en-PH` Manila |
| `toISODate` | Date → ISO `YYYY-MM-DD` |
| `today` | Today as ISO date string |
| `currentPeriod` | Current `YYYY-MM` string |
| **`formatPickupDatetimeManila`** | **NEW v4** — `"Apr 6, 09:15 AM"` format (short month + day + time, Manila timezone); used in InboxPage PICKUP column and BookingModal pickup/dropoff display |

### 5.20 Tailwind Config (v4)

**Keyframes defined (additions in v4):**

| Name | Use |
|------|-----|
| (all v3 keyframes retained) | |
| Global CSS: `.font-headline` color | `#00577C` auto-applied to all headline elements; `.font-headline .accent, .font-headline span.gold` → `#FCBC5A` italic |

### 5.21 Design System Reference (v4 NEW)

**`apps/web/DESIGN_SYSTEM.md`** — comprehensive brand reference document covering:
- Typography tokens and usage rules
- Brand color palette with semantic rules
- Button variants (skeuomorphic gold, standard, PrimaryCtaButton)
- Card patterns (BorderGlow, BrandCard, TiltedCard)
- Section structure patterns (eyebrow → heading → subheading)
- Component inventory with API and animation notes
- Layout patterns (two-column, hero, full-bleed)
- Spacing conventions and opacity variants in use

> All future page builds and component designs should reference `DESIGN_SYSTEM.md` as the single source of truth.

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

### 6.5 Ports (30 interfaces)

`OrderRepository`, `OrderItemRepository`, `OrderAddonRepository`, `PaymentRepository`, `CustomerRepository`, `FleetRepository`, `AccountingPort`, `EmployeeRepository`, `TimesheetRepository`, `LeaveBalancePort`, `PayrollPort`, `TransferRepository`, `MaintenanceRepository`, `ExpenseRepository`, `CashReconciliationRepository`, `CardSettlementRepository`, `TodoRepository`, `ConfigRepository` (**updated v4:** + `RepairCostConfig` interface, `getRepairCosts`, `saveRepairCost`, `deleteRepairCost` methods), `AuthPort`, `SheetSyncPort`, `RecurringBillsPort`, `PawCardPort`, `MiscSaleRepository`, `MerchandiseRepository`, `PaymentRoutingRepository`, `ReviewRepository`, `DirectoryRepository`, `BookingPort`, `RepairsPort`

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

`auth-schemas`, `order-schemas`, `orders-raw-schemas` (**updated v4:** cancel + walk-in schemas), `fleet-schemas`, `accounting-schemas`, `config-schemas`, `hr-schemas`, `transfer-schemas`, `payroll-schemas`, `cashup-schemas`, `expense-schemas`, `todo-schemas`, `paw-card-schemas`, `maintenance-schemas`, `misc-sales-schemas`, `merchandise-schemas`, `payment-routing-schemas`, `ui-errors-schemas`, `lost-opportunity-schemas`, `extend-schemas` (**updated v4:** preview endpoint schema), `directory-schemas`

### 7.3 Constants

| File | Contents |
|------|----------|
| `constants/permissions.ts` | `Permission` object + `ALL_PERMISSIONS` array |
| `constants/order-status.ts` | Order status string literals (+ `'cancelled'` v4) |
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
  → Add to basket → /book/basket (quantity selector)
  → BasketPage: POST /public/booking/hold
  → Continue → payment method selection
  → POST /public/booking/submit → orders_raw insert
    (pickupDatetime / dropoffDatetime sent with +08:00 Manila offset — v4 fix)
  → Redirect to /book/confirmation/:reference
    (Lola video + two-column layout + Stepper — v4)
```

> **v4 timezone fix:** `SearchBar.tsx` and `VehicleCard.tsx` both append `:00+08:00` to datetime strings before sending to API, so PostgreSQL/Supabase stores correct UTC. Previously submitted as naive local strings causing 8-hour shift in backoffice display.

### 8.2 Order Activation (Backoffice)

```
InboxPage: GET /orders-raw (unprocessed)
  → Staff reviews → BookingModal → POST /orders-raw/process
    → activate_order_atomic RPC:
      INSERT orders, order_items, order_addons
      UPDATE fleet status
      Optional journal legs
  → Order appears in /orders/active

  v4 additions:
  → Walk-in: WalkInBookingModal → POST /orders-raw/walk-in
  → Cancel: CancelOrderModal → PATCH /orders-raw/:id/cancel
    (sets cancelled_at, cancelled_reason; status → 'cancelled')
  → Inbox PICKUP column now shows "Apr 6, 09:15 AM" (date + time)
```

### 8.3 Extend Booking (v4 — two-step)

```
Active order → ExtendOrderModal
  Step 1 — Preview:
    GET /public/extend/preview?orderReference=&email=&newDropoffDatetime=
    → Shows cost diff; validates no rate downgrade
  Step 2 — Confirm:
    POST /public/extend/confirm
    → Updates dropoff_datetime; journals extension charge
    → Math.round day count (prevents sub-day rounding errors)
```

### 8.4 Cash-Up (v4)

```
CashupPage: GET /cashup/summary (store-filtered, incl. deposits-held)
  → BeforeCloseModal pre-check (v4 new):
    GET /cashup/late-returns-check → open late returns?
    GET /todo/open-count → open tasks?
    GET /lost-opportunity → unlogged lost bookings?
    → Gates cashup submission if any pre-check fails
  → Staff resolves outstanding items
  → Staff enters counted cash
  → POST /cashup/reconcile → reconcile_cash_atomic RPC
  → POST /cashup/override (OverrideCashup permission)
  → POST /cashup/late-return-assignment → upsert late_return_assignments
```

### 8.5 Payroll (v4)

```
TimesheetsPage (All-Stores option, UTC date fix)
  → Staff submits → ApproveTimesheets
  → PayrollPage: GET /payroll/payslip (calc preview)
    v4 inflators applied:
    - Per-employee default_payment_method from employees table
    - Holiday/SIL day rate multiplier
    - POM commission calculation
    - 9pm late-shift bonus
    - Cash advance deduction from cash_advance_schedules
    - Owner drawings excluded (monthly rate_type entries not included)
  → POST /payroll/preview → dry-run totals (v4)
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

ExpensesPage chart: Last Month
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
  v4 additions:
  → GET /paw-card/customer-savings?email= (per-customer total shown in active order modal)
  → BePawsitiveMeter on homepage: GET /public/booking/charity-impact → live animated widget
```

### 8.9 Repair Costs (v4 — CRUD)

```
Public:
  GET /public/repairs/costs?vehicleType=honda_beat|tuk_tuk
    → RepairCostsSection renders two-column BrandCard table

Backoffice Settings (Repair Costs tab):
  GET /config/repair-costs (auth only)
  POST /config/repair-costs (EditSettings)
  PUT /config/repair-costs/:id (EditSettings)
  DELETE /config/repair-costs/:id (EditSettings)
  → configRepo.getRepairCosts / saveRepairCost / deleteRepairCost
  → Supabase: SELECT/INSERT/UPDATE/DELETE on repair_costs table
```

### 8.10 Dashboard

```
GET /api/dashboard/summary?storeId=
  → Cash balances: store-filtered + deposits-held included
  → Customer breakdown: parseCountryFromMobile → pie charts
  → Expenses chart: Last Month only
  → Financial blocks gated by can_view_dashboard

v4 addition:
GET /api/dashboard/charity-impact
  → Aggregate Be Pawsitive donations from order totals
  → Used by BePawsitiveMeter widget
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

### 9.2 Security Assessment (v4)

| Area | Status | Notes |
|------|--------|-------|
| JWT verification | ✅ PASS | `jsonwebtoken` verify |
| Permission checks | ✅ PASS | Edit* split for expenses/maintenance/transfers; settings + fleet book value gated; repair costs read vs write split (v4) |
| Rate limiting | ✅ PASS | Login / public / API tiers in place |
| RLS vs service role | ⚠️ WARN | API service role bypasses RLS — Express is enforcement boundary |
| Public endpoints | ⚠️ WARN | Unauthenticated but rate-limited; charity-impact + extend preview new endpoints same tier |
| CORS | ⚠️ WARN | `ALLOWED_ORIGIN` env var allowlist |
| File upload | ✅ PASS | Multer limits; Supabase storage policies (030) |
| Health endpoint | ✅ PASS | `/health` exists |
| PIN hardening | ⚠️ WARN | No complexity/rotation policy enforced |
| API versioning | ⚠️ WARN | No `/v1/` prefix |
| Audit logging | ❌ OPEN | No audit trail for mutations |
| Cancel/walk-in access | ⚠️ WARN | `PATCH /orders-raw/:id/cancel` and `POST /orders-raw/walk-in` require authentication but no dedicated fine-grained permission |

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
| 6 | `CircularGallery.tsx` + `DomeGallery.tsx` bundled but unused | Low | OGL + gesture weight in bundle |
| 7 | Cancel/walk-in endpoints lack dedicated permission | Medium | v4 new — any authenticated user can cancel or create walk-in |

### 11.2 Type Safety

- Pervasive `Record<string, unknown>` / casting in dashboard, fleet, cashup, card-settlements routes.
- Dashboard `summary` endpoint constructs many raw SQL strings with type assertions.
- `config-repo.ts`: `snakeToCamel(r) as unknown as RepairCostConfig` double-cast required due to generic return type of `snakeToCamel`.

### 11.3 Bundle Size

Build output flags several chunks >500 KB (noted in Rollup warnings):
- `index-*.js` ~517 KB gzip ~148 KB
- `DashboardPage-*.js` ~400 KB gzip ~117 KB
- `HomePage-*.js` ~43 KB gzip ~14 KB
- Large SVG assets (Paw Divider, Paw Print) loaded as static assets

### 11.4 Performance

- Dashboard runs many parallel Supabase queries per request — monitor load.
- React Query 30s staleTime: multi-user data may be stale.
- `Be Pawsitive/` folder: 50 PNG images (~75 MB total) loaded as static imports in `HomePage.tsx` — all 50 bundled eagerly.
- Plus Jakarta Sans declared in Tailwind `font-body` but not loaded via `<link>` in `index.html` — silent fallback.

### 11.5 UX / Accessibility

- `VariableProximity` headline is mouse-only; touch fallback uses `useIsTouchDevice`.
- `BorderGlow` edge glow: pointer-only; touch shows `borderPulse` CSS animation.
- `CircularGallery` / `DomeGallery` have no accessible alternatives.
- No `aria-live` regions for toast notifications.
- Mobile nav rounded corners removed (v4) — intentional UX change.

### 11.6 Data / Concurrency

- Public extend and some multi-step flows lack DB-level locking (RPC coverage partial).
- `booking_holds` TTL/cleanup not verified in active cron schedule.
- No optimistic concurrency control on fleet swaps.
- `late_return_assignments` UNIQUE(store_id, date) prevents duplicates but no rollback path if BeforeCloseModal check fails mid-flow.

---

## 12. Gap Analysis (Prioritized)

### CRITICAL

| ID | Gap | v4 Status |
|----|-----|-----------|
| C1 | ~~No rate limiting~~ | ✅ **Done** — login/public/API tiers |
| C2 | DB transactions | ✅ **Largely mitigated** — 7 atomic RPCs; extend + cancel still partial |
| C3 | Audit logging | ❌ **Open** — no mutation audit trail |
| C4 | Extension hold races | ❌ **Open** — extend flow lacks DB lock; two-step preview/confirm helps UX but not concurrency |
| C5 | Backup / DR documentation | ❌ **Open** — operational responsibility |

### HIGH

| ID | Gap | v4 Status |
|----|-----|-----------|
| H1 | Coarse permissions | ✅ **Improved** — Edit* split; settings + fleet-book-value gated; repair costs read/write split (v4); cancel/walk-in still open |
| H2 | Pagination on lists | ❌ **Open** — most list endpoints return all rows |
| H3 | Repository consistency | ❌ **Open** — directory still direct client |
| H4 | Integration tests | ❌ **Open** |
| H5 | ~~Health check~~ | ✅ **Done** |
| H6 | PIN hardening | ❌ **Open** — no rotation/complexity policy |
| H7 | Google Sheets legacy dependency | ❌ **Open** |
| H8 | HTTPS / HSTS | ⚠️ **Hosting concern** |
| H9 | 50 Be Pawsitive PNGs eager import | ❌ **Open** — large bundle; should be lazy-loaded or CDN |
| H10 | No ViewDirectory permission | ❌ **Open** — directory visible to all authenticated users |
| H11 | Cancel/walk-in no dedicated permission | 🆕 **New v4** — any authenticated user can access; should be gated |
| H12 | Auto email receipt | ❌ **Open** — waiting on email service integration |

### MEDIUM

| ID | Gap | v4 Status |
|----|-----|-----------|
| M1 | OpenAPI / Swagger documentation | ❌ Open |
| M2 | Structured logging (API) | ❌ Open |
| M3 | CSV/PDF export for key reports | ❌ Open |
| M4 | CI/CD pipeline | ❌ Open |
| M5 | Realtime breadth (orders, fleet) | ❌ Open — only todo has realtime |
| M6 | ~~No dashboard~~ | ✅ Done |
| M7 | ~~Directory unused~~ | ✅ Done |
| M8 | Plus Jakarta Sans not loaded | ❌ **Open** — Tailwind `font-body` references unloaded font |
| M9 | `CircularGallery` + `DomeGallery` dead weight | ❌ **Open** — OGL + gesture in bundle for unused components |
| M10 | Reviews section is static hardcoded | ❌ Open — no API; `ReviewsSection.tsx` uses static array |
| M11 | WhatsApp API for walk-in notifications | 🆕 **New v4** — walk-in created but no WhatsApp notification to staff |
| M12 | Walk-in booking WhatsApp notification | 🆕 **New v4** — same as M11 |
| M13 | Google Reviews API integration | 🆕 **New v4** — Reviews section currently static |

### LOW

| ID | Gap | Notes |
|----|-----|-------|
| L1 | i18n / localization | No multi-language support |
| L2 | Recurring bills UI | Exists in backend/DB but no dedicated UI page |
| L3 | `booking_holds` cleanup verification | Holds may persist if TTL job not confirmed |
| L4 | `ogl` package bundled for unused component | Can remove if `CircularGallery` stays unused |
| L5 | Accessibility audit | No WCAG audit completed |

### FUTURE / BACKLOG

| ID | Feature | Status |
|----|---------|--------|
| W1 | About page | Waiting on illustrator assets |
| W2 | Transfer booking public page | In backlog |
| W3 | Paw Card discount catalog page | In backlog |
| W4 | Footer redesign | Waiting on illustrator |
| W5 | Digital signatures at pickup | Future |
| W6 | Payment gateway integration | Future |
| W7 | Dashboard widgets: daily revenue chart (B27), vehicle utilization by model (B34), staff performance (B35) | Backlog |
| W8 | Timezone display fix for backoffice order datetimes | ⚠️ **Partial** — booking submission now correctly stores UTC via +08:00 offset; backoffice display uses Manila locale but some raw datetime fields may still show UTC |

### COMPLETED SINCE v3

| Item | Done |
|------|------|
| Repair costs CRUD (settings + public) | ✅ v4 |
| Walk-in booking from inbox | ✅ v4 |
| Cancel order from inbox | ✅ v4 |
| Extend booking from active order modal | ✅ v4 |
| Per-employee payroll payment methods | ✅ v4 |
| Payroll inflators (holiday/SIL/POM/9pm/cash advance/drawings) | ✅ v4 |
| Before Close Modal (cashup gate) | ✅ v4 |
| Late return assignments | ✅ v4 |
| Midday lost opportunity banner | ✅ v4 |
| Be Pawsitive donation meter (live) | ✅ v4 |
| Paw Card savings on active order | ✅ v4 |
| Typography system-wide audit + fixes | ✅ v4 |
| DESIGN_SYSTEM.md | ✅ v4 |
| PageHeader + BrandCard global components | ✅ v4 |
| Manila timezone fix for direct booking datetimes | ✅ v4 |
| Inbox PICKUP column shows date + time | ✅ v4 |
| Reserve page: quantity selector + BrandCard | ✅ v4 |
| Confirmation page: two-column layout + Stepper | ✅ v4 |

---

## Summary Statistics (v4)

| Metric | Count / Value |
|--------|---------------|
| SQL migration files | **51+** (numbers 001–053+, gaps 028–030) |
| Database tables | **53** named tables (+ `late_return_assignments`) |
| Atomic PostgreSQL RPCs | **7** |
| API route modules (excl. index) | **27** |
| Estimated API surface | **125+** endpoints |
| Frontend page TSX files | **46+** |
| Frontend component files | **105+** |
| Home-specific components | **21** (16 active + `BePawsitiveMeter`, 2 unused) |
| Public components (`components/public/`) | **5** (`FadeUpSection`, `PrimaryCtaButton`, `PrimaryCtaLink`, `PageHeader`, `BrandCard`) |
| Web API client modules | **20** |
| Zustand stores | **5** |
| Frontend hooks | **4** |
| Domain entities | **7** |
| Domain ports | **30** |
| Zod schema modules | **21** |
| Permission strings | **28** (+ `EditSettings`, `ViewFleetBookValue`) |
| Use-case TS files | **60+** |
| Animation libraries | **3** (framer-motion, GSAP, CSS) |
| Be Pawsitive photo assets | **50 PNGs** |
| Google Fonts loaded | **4** (Alegreya Sans, Lato, Playfair Display, Roboto Flex) |
| Design system documents | **1** (`apps/web/DESIGN_SYSTEM.md`) |

---

> **End of SYSTEM_AUDIT_v4.md.**
> SYSTEM_AUDIT_v3.md retained at repo root for history.
> Update this document when migrations, routes, or major UI flows change.
> Track Section 12 items in project management tooling.
