# SYSTEM_AUDIT_v2.md — Lola's Rentals Backoffice

> **Audit Date:** 2026-04-01  
> **Auditor:** AI Architect (Forensic Codebase Audit, v2)  
> **Scope:** `apps/api`, `apps/web`, `packages/domain`, `packages/shared`, `supabase/migrations` (001–051), `supabase/functions`, root configuration  
> **Purpose:** Master reference for architecture, schema, APIs, UI, security, and prioritized gaps. **Supersedes operational use of v1**; `SYSTEM_AUDIT v1` is retained for history only.  
> **Delta from v1:** Migrations through **051**; **`/dashboard`** and **`/directory`** (API + UI); **express-rate-limit** on auth/public/API; **`expenses.status` / `paid_at`**; **directory** extended columns; **PostgreSQL atomic RPCs** for key financial flows; **`RunPayrollModal`**; **Sidebar** grouped nav + Lucide icons; primary UI font **Alegreya Sans**; brand teal **`#00577C`** (`teal-brand`); **`EditExpenses` / `EditMaintenance` / `EditTransfers`** permission splits where implemented.

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)  
2. [Tech Stack](#2-tech-stack)  
3. [Database Schema (Supabase / PostgreSQL)](#3-database-schema-supabase--postgresql)  
4. [API Layer (Backend)](#4-api-layer-backend)  
5. [Frontend Architecture](#5-frontend-architecture)  
6. [Domain Model (packages/domain)](#6-domain-model-packagesdomain)  
7. [Shared Contracts (packages/shared)](#7-shared-contracts-packagesshared)  
8. [Data Flows](#8-data-flows)  
9. [Authentication & Security](#9-authentication--security)  
10. [Edge Functions & Webhooks](#10-edge-functions--webhooks)  
11. [Known Issues & Code Smells](#11-known-issues--code-smells)  
12. [Gap Analysis (Prioritized)](#12-gap-analysis-prioritized)  

---

## 1. Repository Structure

### 1.1 Top-Level Layout

```
User Interface/                    ← Monorepo root (npm workspaces: lolas-backoffice)
├── apps/
│   ├── api/                       ← Express REST API (Node ESM, TypeScript strict)
│   │   ├── src/
│   │   │   ├── server.ts          ← Entry: dotenv, CORS, JSON, app.locals.deps, /health, /api/*
│   │   │   ├── routes/            ← 26 route modules (+ index.ts registry)
│   │   │   │   ├── index.ts       ← Mounts routes; applies rate limiters
│   │   │   │   ├── auth.ts
│   │   │   │   ├── dashboard.ts   ← GET /summary (store metrics, financial aggregates)
│   │   │   │   ├── directory.ts   ← CRUD directory contacts (authenticated)
│   │   │   │   ├── orders.ts, orders-raw.ts, fleet.ts, cashup.ts, config.ts
│   │   │   │   ├── expenses.ts    ← List/create/update/delete + POST /pay (batch pay unpaid)
│   │   │   │   ├── hr.ts, payroll.ts, accounting.ts, card-settlements.ts
│   │   │   │   ├── todo.ts, maintenance.ts, transfers.ts, merchandise.ts, misc-sales.ts
│   │   │   │   ├── paw-card.ts, lost-opportunity.ts, ui-errors.ts
│   │   │   │   ├── public-booking.ts, public-extend.ts, public-transfers.ts
│   │   │   │   ├── public-paw-card.ts, public-repairs.ts
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts, authorize.ts, validate.ts, error-handler.ts
│   │   │   │   ├── rate-limit.ts  ← loginLimiter, publicLimiter, apiLimiter
│   │   │   ├── adapters/          ← supabase/*, auth/jwt, google-sheets
│   │   │   └── use-cases/         ← ~17 topical areas, 58+ TS files
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                       ← React 18 + Vite SPA
│       ├── src/
│       │   ├── App.tsx              ← QueryClientProvider, BrowserRouter, ErrorBoundary, AppRouter
│       │   ├── router.tsx           ← Public /book/* + protected backoffice routes
│       │   ├── main.tsx, index.css  ← Tailwind layers; @keyframes cloudDrift, scooterDrive (hero)
│       │   ├── api/                 ← 20 client modules (React Query hooks)
│       │   ├── stores/            ← auth, ui, booking, realtime, task-notification
│       │   ├── pages/             ← 46+ page TSX files across ~25 route areas
│       │   ├── components/        ← 87+ files (layout, hero, hr, settings tabs, orders, fleet, …)
│       │   ├── hooks/, utils/
│       ├── vite.config.ts         ← Dev server (e.g. :3002), proxy /api → API
│       ├── tailwind.config.ts     ← teal-brand #00577C, Alegreya Sans, animations
│       ├── index.html             ← Google Fonts: Alegreya Sans (+ Inter/Playfair for hero copy)
│       └── package.json
│
├── packages/
│   ├── domain/                    ← Pure domain: entities, value-objects, services, errors, ports
│   └── shared/                    ← Permissions, constants, Zod schemas, API types
│
├── supabase/
│   ├── migrations/                ← 49 SQL files (numbered 001–051; gaps: 028–030 absent)
│   └── functions/
│       └── order-webhook/         ← WooCommerce → orders_raw
│
├── package.json                   ← workspaces, build/dev scripts
├── SYSTEM_AUDIT v1                ← Historical audit (not deleted)
├── SYSTEM_AUDIT_v2.md             ← This document
└── tsconfig.json, eslint, etc.
```

### 1.2 Notable Path Conventions

- **ESM everywhere:** imports use `.js` extensions in TypeScript source where required by `moduleResolution`.  
- **Customer site:** routes under `/book`; **Backoffice:** `/dashboard`, `/orders/*`, `/fleet`, … (relative to host; `AppLayout` uses non-absolute child paths in `router.tsx` under protected layout).  
- **Assets typo:** WordPress-era folder `apps/web/src/assets/Original Assests/` (double “s”) used for hero SVGs / road.svg.

---

## 2. Tech Stack

### 2.1 Frontend

| Component | Technology | Notes |
|-----------|------------|--------|
| Framework | React 18.x | |
| Build | Vite 6.x | |
| Routing | React Router 7.x | |
| State | Zustand 5.x | Auth persisted to localStorage |
| Data | TanStack React Query 5.x | Default `staleTime: 30_000` in `App.tsx` |
| Styling | **Tailwind CSS 3.4.x** | Extended with `teal-brand`, `gold-brand`, custom keyframes |
| Charts | Recharts | `DashboardPage` bar charts |
| Language | TypeScript strict | |
| Realtime | Supabase JS 2.x | Todo / task notifications where wired |

**Branding / typography**

- **Primary sans / UI font:** **Alegreya Sans** (Google Fonts in `index.html`; `fontFamily.sans` and `font-headline` in Tailwind).  
- **Brand teal:** **`#00577C`** — Tailwind `teal-brand` (nav, accents).  
- **Supporting tokens:** `gold-brand` `#FCBC5A`, `cream-brand` `#FAF6F0`, `sand-brand` `#f1e6d6`, `charcoal-brand` `#363737`.  
- **Body (tailwind `font-body`):** Plus Jakarta Sans (declared; ensure font loading if used heavily).

### 2.2 Backend

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (ESM) |
| HTTP | Express 5.x |
| Validation | Zod (via `@lolas/shared` + route validators) |
| DB client | Supabase JS 2.x (service role) |
| Auth | JWT (`jsonwebtoken`), PIN login |
| Uploads | Multer (memory; Paw Card receipts) |
| Rate limiting | **express-rate-limit** (`middleware/rate-limit.ts`) |

### 2.3 Database & Infra

| Component | Technology |
|-----------|------------|
| Database | Supabase (PostgreSQL) |
| Migrations | 49 SQL files through **051** |
| RLS | Enabled; helpers `user_store_ids()`, `has_permission()` — **bypassed by API service role** |
| Edge | Supabase Edge Function `order-webhook` |
| External | Google Sheets sync adapter; WooCommerce webhooks |

### 2.4 Environment Variables (representative)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ALLOWED_ORIGIN` (comma-separated CORS), `GOOGLE_SHEETS_*`, `PORT` (default 3001), `VITE_API_URL` (frontend).

---

## 3. Database Schema (Supabase / PostgreSQL)

### 3.1 Table Catalog (v1 baseline + v2 notes)

The **core catalog** remains as documented in **SYSTEM_AUDIT v1 §3.1** (stores, roles, employees, users, orders, fleet, payments, journal_entries, cash_reconciliation, timesheets, maintenance, expenses, transfers, todo_*, paw_card_*, merchandise, directory, etc.). Below are **v2 additive / corrective** items.

#### 3.1.1 `expenses` (migrations 045, 050)

| Column | Type | Notes |
|--------|------|--------|
| `status` | `text` NOT NULL DEFAULT `'paid'` | CHECK: `'paid' \| 'unpaid'` |
| `paid_at` | `timestamptz` | Set when marked paid / batch pay |

**RPC / logic:** `create_expense_with_journal` accepts status; **unpaid** skips journal creation. **`pay_expenses_atomic`** (050) batch-pays unpaid rows and posts journals in one transaction.

#### 3.1.2 `directory` (051)

Adds optional fields:

- `category`, `bank_name`, `bank_account_number`, `address`, `notes` (all `text`, IF NOT EXISTS).

### 3.2 Migration Index (files present: 001–027, 031–051)

| Range | Themes |
|-------|--------|
| 001–006 | Initial schema, config, core entities, payments/accounting, HR/ops, remaining tables |
| 007–022 | Features: payments, orders_raw, surcharges, settlements, stores, merchandise, payment routing, etc. |
| 023–027 | Accounting/company store consolidation, task accountability, leave reset |
| 031–034 | Paw Card RLS, triggers, references |
| 035–041 | Direct booking columns, holds, vehicle security deposit, transfers, charity, addons, repair costs |
| **042** | `orders_raw` web payment method |
| **043** | Edit permissions (`EditExpenses`, `EditMaintenance`, `EditTransfers`, etc.) |
| **044** | Dashboard permission: `can_view_dashboard` for `role-admin` |
| **045** | Expense transactions: `create_expense_with_journal`, `delete_expense_with_journal` |
| **046** | `match_card_settlement` RPC |
| **047** | `reconcile_cash_atomic` RPC |
| **048** | `run_payroll_atomic` RPC |
| **049** | `activate_order_atomic` RPC |
| **050** | Expense `status`/`paid_at`, updated `create_expense_with_journal`, **`pay_expenses_atomic`** |
| **051** | Directory column additions |

> **Note:** Migration sequence **028–030** are not present in the repository (numbering jump).

### 3.3 PostgreSQL Atomic RPCs (financial / critical writes)

These encapsulate multi-step writes in **single database transactions** (reducing partial-failure risk vs. multiple round-trips):

| Function | Migration | Purpose |
|----------|-----------|---------|
| `create_expense_with_journal` | 045, updated 050 | Insert expense + optional journal legs |
| `delete_expense_with_journal` | 045 | Delete expense + reverse journals |
| `match_card_settlement` | 046 | Settlement matching + ledger effects |
| `reconcile_cash_atomic` | 047 | Cash-up reconciliation atomically |
| `run_payroll_atomic` | 048 | Payroll run + postings |
| `activate_order_atomic` | 049 | Order activation from raw / booking pipeline |
| `pay_expenses_atomic` | 050 | Batch pay unpaid expenses + journals |

**Five “transaction” RPCs** often referenced in planning: **`activate_order_atomic`**, **`run_payroll_atomic`**, **`reconcile_cash_atomic`**, **`match_card_settlement`**, plus **expense path** (`create_expense_with_journal` / `delete_expense_with_journal` / `pay_expenses_atomic`) — **seven** named functions total; **049–047–048–046–045/050** cover the main business closures.

### 3.4 RLS, Indexes, Constraints

Unchanged in principle from v1: debit/credit XOR on `journal_entries`, store-scoped policies, service-role bypass for API. Re-verify **051** columns in any RLS policy if policies are table-wide SELECT.

---

## 4. API Layer (Backend)

### 4.1 Request Pipeline

```
Request → CORS → express.json → Rate limit (per router tier) → Route → [authenticate] → [requirePermission] → [validate] → Handler → JSON
                                                                                                    ↓
                                                                                          errorHandler (domain → HTTP)
```

**Rate limiting** (`routes/index.ts`):

- **`loginLimiter`:** `/auth` — 5 requests / 15 minutes per IP.  
- **`publicLimiter`:** `/public` subtree — 60 req / minute.  
- **`apiLimiter`:** all routes on this router — **200 req / minute** (includes authenticated API after the more specific limiters).

### 4.2 Dependency Injection (`server.ts` → `app.locals.deps`)

Repositories / ports: order, orderItem, orderAddon, payment, customer, fleet, employee, config, accounting, timesheet, transfer, maintenance, expense, todo, cashReconciliation, cardSettlement, miscSale, merchandise, paymentRouting, leaveBalance, payroll, pawCard, **booking**, **repairs** (no separate directory repo in deps — **directory** route uses `getSupabaseClient()` directly).

### 4.3 Route Registry (`/api` prefix)

| Mount | Module | Auth | Summary |
|-------|--------|------|---------|
| `/auth` | auth | No (login) | PIN login, JWT |
| `/dashboard` | dashboard | Yes | **`GET /summary`** — operational + financial metrics, store filter |
| `/directory` | directory | Yes | **GET /** list, **POST /** create, **PUT /:id**, **DELETE /:id** |
| `/orders-raw` | orders-raw | Yes | Raw inbox, process, sync |
| `/orders` | orders | Yes | List, enriched, detail, activate, settle, payment, addons, dates, swap |
| `/fleet` | fleet | Yes | CRUD, utilization, calendar, depreciation |
| `/accounting` | accounting | Yes | Balances, entries, transfers |
| `/transfers` | transfers | Yes | CRUD, payments (uses **EditTransfers**) |
| `/hr` | hr | Yes | Timesheets, leave, employees |
| `/payroll` | payroll | Yes | Payslip calc, **run** |
| `/cashup` | cashup | Yes | Summary, submit, override, locks |
| `/expenses` | expenses | Yes | CRUD + **POST /pay** |
| `/todo` | todo | Yes | Full task lifecycle |
| `/maintenance` | maintenance | Yes | CRUD + complete (**EditMaintenance**) |
| `/config` | config | Yes | Stores, addons, COA, routing, roles, users, … |
| `/paw-card` | paw-card | Mixed | Backoffice + uploads |
| `/misc-sales` | misc-sales | Yes | Misc revenue |
| `/merchandise` | merchandise | Yes | Inventory |
| `/card-settlements` | card-settlements | Yes | Pending/settled, match, batch, combine |
| `/public` | public-transfers | No | Token-based transfer booking |
| `/ui-errors` | ui-errors | Yes | UI feedback |
| `/lost-opportunities` | lost-opportunity | Yes | Lost booking tracking |
| `/public/booking` | public-booking | No | Availability, quote, hold, submit, … |
| `/public/paw-card` | public-paw-card | No | Public paw card |
| `/public/extend` | public-extend | No | Extension flow |
| `/public/repairs` | public-repairs | No | Repair costs |

**Health:** `GET /health` → `{ status: 'ok' }` (no `/api` prefix).

### 4.4 Middleware

- **authenticate:** Bearer JWT → `req.user` (permissions, storeIds, …).  
- **authorize:** `requirePermission(Permission.*)`.  
- **validate:** Zod body/query.  
- **error-handler:** Maps domain errors to status codes; sanitizes messages in production.

### 4.5 Use-Case Layer

Organized under `use-cases/` by domain (**orders**, **booking**, **cashup**, **expenses**, **payroll**, **card-settlements**, **todo**, **fleet**, **hr**, **accounting**, **paw-card**, **misc-sales**, **transfers**, **maintenance**, **config**, **settings**, **repairs**). Handlers typically **dynamic-import** use-cases to keep cold-start modularization (trade-off: first-hit latency).

---

## 5. Frontend Architecture

### 5.1 Shell

`App.tsx` → `QueryClientProvider` → `BrowserRouter` → `ErrorBoundary` → `AppRouter` (lazy routes + `Suspense`).

### 5.2 Route Map (current)

#### Public (customer)

| Path | Page | Notes |
|------|------|--------|
| `/` | Navigate → `/book` | |
| `/book` | HomePage | **HeroSection** + sections; hero uses **HeroHomeDriftClouds**, **ScooterRoad** |
| `/book/reserve` | BrowseBookPage | |
| `/book/basket` | BasketPage | |
| `/book/confirmation` | ConfirmationPage | |
| `/book/extend` | ExtendPage | |
| `/book/paw-card` | PawCardPage | |
| `/book/repairs` | RepairsPage | |
| `/book/about` | AboutPage | |
| `/book/privacy` | PrivacyPage | |
| `/book/transfer/:token` | PublicBookingPage | |
| `/login` | LoginPage | |

#### Backoffice (JWT required, `AppLayout` + **Sidebar**)

| Path | Page |
|------|------|
| **`/dashboard`** | **DashboardPage** — KPIs, Recharts (revenue / expenses), lost opp widget. **API:** `GET /dashboard/summary` returns full metrics for all authenticated users; **financial** blocks (revenue, expenses charts, cash, addons) are **omitted unless** `req.user.permissions` includes **`can_view_dashboard`** (`Permission.ViewDashboard`). Sidebar shows Dashboard link to all users (`perm: null`). |
| `/orders/inbox` | InboxPage |
| `/orders/active` | ActivePage |
| `/orders/completed` | CompletedPage |
| `/fleet`, `/fleet/utilization` | FleetPage, UtilizationDashboard |
| `/maintenance` | MaintenancePage |
| `/transfers` | TransfersPage |
| `/accounts`, `/accounts/:id` | AccountsPage, AccountDetailPage |
| `/card-settlements` | CardSettlementsPage |
| `/cashup` | CashupPage |
| `/hr/employees`, `/hr/timesheets`, **`/hr/payroll`** | EmployeesPage, TimesheetsPage, **PayrollPage** (+ **`RunPayrollModal`**) |
| `/expenses` | ExpensesPage |
| `/todo` | TodoPage |
| `/misc-sales` | MiscSalesPage |
| `/merchandise` | MerchandisePage |
| `/lost-opportunity` | LostOpportunityPage |
| `/settings` | SettingsPage |
| `/ui-errors` | UIErrorsPage |
| **`/directory`** | **DirectoryPage** |

### 5.3 Sidebar (v2)

`components/layout/Sidebar.tsx`:

- **Grouped navigation:** Operations, Fleet, Finance, HR, Business, Admin.  
- **Lucide icons** per item (`LayoutDashboard`, `Inbox`, `Car`, …).  
- **Dashboard** first under Operations (`/dashboard`).  
- **Directory** under Business (`/directory`) — **no permission gate** in sidebar (`perm: null`); API still requires authentication.  
- Store-based logo (Lola’s / BASS / combined).  
- Collapsible width (`w-64` / `w-16`), todo unseen badge support.

### 5.4 API Client Modules (`apps/web/src/api/` — 20 files)

`client.ts`, `accounting`, `card-settlements`, `cashup`, `config`, **`dashboard`**, **`directory`**, `expenses`, `fleet`, `hr`, `lost-opportunity`, `maintenance`, `merchandise`, `misc-sales`, `orders`, `orders-raw`, `paw-card`, `todo`, `transfers`, `ui-errors`.

### 5.5 Components (representative)

- **Layout:** `AppLayout`, `Sidebar`, `Header` (**`relative z-50`**), `PageLayout` (public teal header **`fixed z-50`**), `StoreFilter`, `PawDivider`.  
- **Hero:** `components/hero/HeroSection.tsx`, `ui/HeroFloatingClouds.tsx` (default drift clouds + **named** `HeroFloatingClouds({ variant })` for other pages), `ui/ScooterRoad.tsx`.  
- **HR:** **`RunPayrollModal.tsx`** — period half, working days, COA picks, calls **`useRunPayroll`** → `POST /api/payroll/run`.  
- **Settings:** many `settings/tabs/*` (roles include **ViewDashboard** via migration 044 / Roles UI).  
- **Orders / fleet / cashup / card settlements:** large modals and tables as in v1.

### 5.6 State Stores

Same five-store pattern as v1: `auth-store`, `ui-store`, `bookingStore`, realtime, task-notification-store.

---

## 6. Domain Model (packages/domain)

| Area | Contents |
|------|----------|
| **Entities (7)** | `order`, `vehicle`, `employee`, `journal-transaction`, `timesheet`, `transfer`, `maintenance-record` |
| **Value objects (5)** | `money`, `store-id`, `period`, `date-range`, `order-status` |
| **Services (3)** | `deposit-calculator`, `depreciation-service`, `payroll-calculator` |
| **Ports (29)** | Including `booking-port`, `repairs-port`, `directory-repository`, `paw-card-port`, repositories for orders, fleet, expenses, payroll, etc. |

Directory persistence is modeled in **`directory-repository` port**; the live **directory** route currently bypasses a dedicated adapter in `app.locals.deps` and uses Supabase client directly (**consistency gap**).

---

## 7. Shared Contracts (packages/shared)

### 7.1 Permissions (28 keys in `Permission` object)

Includes **`ViewDashboard: 'can_view_dashboard'`** and split edit permissions:

- **`EditExpenses`**, **`EditMaintenance`**, **`EditTransfers`** (introduced in migration **043**; routes use these for mutations).

Full list: `ViewInbox`, `ViewActive`, `ViewCompleted`, `ViewFleet`, `ViewMaintenance`, `EditMaintenance`, `ViewTransfers`, `EditTransfers`, `ViewCardSettlements`, `ViewExpenses`, `EditExpenses`, `ViewTimesheets`, `SubmitTimesheets`, `ViewTodo`, `ViewLostOpportunity`, `ViewCashup`, `EditOrders`, `EditFleet`, `ViewUIErrors`, `ViewMiscSales`, `ApproveTimesheets`, `EditAccounts`, `ViewPayroll`, `ViewAccounts`, **`ViewDashboard`**, `ViewFleetBookValue`, `OverrideCashup`, `ManageTodo`, `ManageEmployees`, `EditSettings`.

### 7.2 Zod Schema Modules (**21** files)

All exported from `packages/shared/src/index.ts`, including **`directory-schemas.ts`**, `expense-schemas` (pay batch, status), plus auth, orders, fleet, accounting, config, hr, payroll, cashup, todo, paw-card, maintenance, merchandise, misc-sales, payment-routing, ui-errors, lost-opportunity, extend, orders-raw, transfer, order.

---

## 8. Data Flows

### 8.1 Order Lifecycle

Unchanged at a high level from v1: WooCommerce / direct booking → `orders_raw` → process → active → payments / addons → settle → journals. **Activation** can use **`activate_order_atomic`** (049) from use-case layer when invoked via RPC-backed path.

### 8.2 Cash-Up

`GET /cashup/summary` → submit → **`reconcile_cash_atomic`** (047) where integrated — confirm in `cashup` route + `reconcile-cash` use-case.

### 8.3 Payroll

HR UI → **`RunPayrollModal`** → `POST /api/payroll/run` → **`run_payroll_atomic`** (048) / payroll use-case.

### 8.4 Expenses

Create/update/delete with **`EditExpenses`**. **Unpaid** expenses: no journal until paid; **`POST /api/expenses/pay`** batch → **`pay_expenses_atomic`**.

### 8.5 Dashboard

`GET /api/dashboard/summary?storeId=` → aggregates orders, fleet, maintenance, payments, expenses (this month + **prior calendar month** for expense comparison chart), journal slices, Paw Card–related metrics where enabled — **see `dashboard.ts` for exact queries**.

### 8.6 Directory

Backoffice **DirectoryPage** → `GET/POST/PUT/DELETE /api/directory` → `directory` table with extended columns (051).

---

## 9. Authentication & Security

### 9.1 Auth Flow

Same PIN → JWT flow as v1; token in `Authorization: Bearer`; persisted in Zustand/localStorage.

### 9.2 Security Assessment (v2 updates)

| Area | Status | Notes |
|------|--------|--------|
| JWT verification | PASS | |
| Permission checks | PASS | **Edit*** permissions for sensitive writes (expenses, maintenance, transfers) |
| Rate limiting | **PASS (v2)** | Login / public / API tiers |
| RLS vs service role | WARN | Unchanged — API bypasses RLS |
| Public endpoints | WARN | Still unauthenticated; now **rate-limited** |
| CORS | WARN | Allowlist + `ALLOWED_ORIGIN` |
| File upload | PASS | Multer limits / MIME |
| Health | PASS | **`/health`** exists (v1 gap H5 closed) |

---

## 10. Edge Functions & Webhooks

### 10.1 `supabase/functions/order-webhook/index.ts`

Unchanged purpose: WooCommerce webhook → validate signature → insert **`orders_raw`**.

### 10.2 Google Sheets

Still used from **orders-raw** sync paths (adapter under `adapters/google-sheets/`).

---

## 11. Known Issues & Code Smells

### 11.1 Architecture

| # | Issue | Severity | Notes |
|---|--------|----------|--------|
| 1 | Service role bypasses RLS | High | Security boundary = Express + permissions |
| 2 | **Directory** + some routes use **raw `getSupabaseClient()`** | Medium | Bypasses `app.locals.deps` pattern |
| 3 | Dynamic import per request for use-cases | Low | Latency / cold path |
| 4 | No API versioning | Medium | |
| 5 | Monolith Express | Low | |

### 11.2 Type Safety

Extensive `Record<string, unknown>` / casting in routes (dashboard, fleet, cashup, etc.) — unchanged trend from v1.

### 11.3 Permission / UX

- **Directory** visible to all authenticated users in sidebar (`perm: null`); consider **`ViewDirectory`** or reuse an existing permission.  
- **Todo** create still tied to **ManageTodo** / **ViewTodo** patterns — verify alignment with product intent.

### 11.4 Data / Concurrency

- **Public extend** and other multi-step flows may still lack DB-level locking — RPC coverage is **partial** (not every flow is atomic).  
- **Journal integrity** improved for specific flows via RPCs; not universal.

### 11.5 Performance

- **Dashboard** runs **many parallel queries** per request — watch Supabase load.  
- **Cashup** / **expenses** list patterns remain heavy as in v1.  
- React Query **30s** staleTime — multi-user staleness.

---

## 12. Gap Analysis (Prioritized)

### CRITICAL

| ID | Gap | v2 note |
|----|-----|---------|
| C1 | ~~No rate limiting~~ | **Mitigated:** login + public + API limiters |
| C2 | DB transactions | **Partially mitigated:** atomic RPCs for activation, payroll, cashup, card match, expenses (create/delete/pay) |
| C3 | Audit logging | Still open |
| C4 | Extension races | Still open |
| C5 | Backup / DR | Operational — still required |

### HIGH

| ID | Gap | v2 note |
|----|-----|---------|
| H1 | Coarse permissions | **Improved** for expenses, maintenance, transfers (**Edit*** split) |
| H2 | Pagination | Still open on many lists |
| H3 | Repository consistency | **Directory** direct client is a regression example |
| H4 | Integration tests | Still open |
| H5 | ~~Health check~~ | **Done:** `/health` |
| H6 | PIN hardening | Still open |
| H7 | Google Sheets legacy | Still open |
| H8 | HTTPS / HSTS | Hosting concern |

### MEDIUM

| ID | Gap | v2 note |
|----|-----|---------|
| M6 | ~~No dashboard~~ | **Done:** `/dashboard` + charts + API |
| M7 | ~~Directory unused~~ | **Done:** `/directory` + API + schema 051 |
| M1–M5, M8–M12 | OpenAPI, logging, exports, CI, realtime breadth, etc. | Largely unchanged from v1 |

### LOW

Reviews / recurring bills / i18n / polish — same themes as v1; **hero** and **font** work addressed; **road.gif** vs `road.svg` may remain a content swap.

---

## Summary Statistics (v2)

| Metric | Count / value |
|--------|----------------|
| SQL migration files | **49** (numbers up to **051**) |
| API route modules (excl. index) | **26** |
| API surface | **100+** endpoints (approx.; grep `router.` in `routes/`) |
| Frontend page TSX files | **46+** |
| Frontend component files | **87+** |
| Web API client modules | **20** |
| Zustand stores | **5** |
| Domain entities | **7** |
| Domain ports | **29** |
| Zod schema modules | **21** |
| Permission strings | **28** |
| Use-case TS files | **58+** |
| Atomic business RPCs (named) | **7** (see §3.3) |

---

> **End of SYSTEM_AUDIT_v2.md.** Update this document when migrations, routes, or major UI flows change. Track Section 12 items in your project tool of choice.
