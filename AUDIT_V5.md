# Lola's Rentals Platform — Full Audit V5

**Date:** April 7, 2026  
**Auditor:** AI-assisted comprehensive codebase review  
**Scope:** Every file across API, web, domain, shared, and migrations

---

## 1. Platform Overview

Lola's Rentals & Tours Inc. operates two brands on Siargao Island, Philippines:

- **Lola's Rentals** — premium motorbike and tuk-tuk rentals
- **Bass Bikes** — budget-friendly scooter rentals

The platform is a full-stack monorepo powering:

- **Customer-facing website** — vehicle browsing, date selection, online booking with hold system, basket/checkout, rental extensions, Paw Card loyalty program, airport transfer bookings, repair cost transparency
- **Backoffice application** — order inbox (WooCommerce + direct bookings), fleet management, daily cash-up, expenses, payroll/HR, accounting (double-entry GL), card settlements, task management, maintenance, merchandise, budget, settings/configuration, lost opportunity tracking, directory

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 18 |
| **Routing** | react-router-dom | ^7 |
| **Backend** | Express.js | 5.0.1 |
| **Database** | Supabase (PostgreSQL) | @supabase/supabase-js (latest) |
| **State** | Zustand | latest |
| **Server state** | @tanstack/react-query | latest |
| **Animation** | Framer Motion, GSAP | latest |
| **Validation** | Zod | latest |
| **Icons** | Lucide React | latest |
| **Charts** | Recharts | latest |
| **Auth** | JWT (jsonwebtoken + bcrypt) | — |
| **Build** | Vite (web), TSC (api) | latest |
| **Language** | TypeScript | ^5.7 |
| **Monorepo** | npm workspaces | — |
| **Testing** | Vitest + Testing Library | ^3 / latest |
| **Deploy (web)** | Vercel | — |
| **Deploy (API)** | Render | — |
| **Rate limiting** | express-rate-limit | — |
| **File upload** | Multer | — |
| **External APIs** | Google Sheets (googleapis), AeroDataBox (flight lookup) | — |

### Monorepo Structure

```
├── packages/domain/     # Business logic, entities, value objects, ports
├── packages/shared/     # Zod schemas, constants, API types
├── apps/api/            # Express REST API
├── apps/web/            # React SPA (Vite)
└── supabase/migrations/ # 57 migration files
```

---

## 3. Architecture

### Hexagonal (Ports & Adapters)

The backend follows a hexagonal architecture:

- **Domain layer** (`packages/domain`) — pure TypeScript entities, value objects, and port interfaces. Zero framework dependencies. Business rules live here (order status transitions, payroll calculations, depreciation, double-entry validation).
- **Shared layer** (`packages/shared`) — Zod schemas, permission constants, store mapping, API envelope types. Consumed by both API and web.
- **API adapters** (`apps/api/src/adapters/supabase/`) — Supabase implementations of domain ports. Handle snake_case ↔ camelCase mapping.
- **Use cases** (`apps/api/src/use-cases/`) — orchestrate domain logic with injected dependencies.
- **Routes** (`apps/api/src/routes/`) — Express routers; validate with Zod, call use cases, return API envelope.

### Frontend State Management

- **Zustand stores** — `auth-store` (JWT + permissions, persisted to localStorage), `bookingStore` (customer booking flow), `ui-store` (selected store, sidebar, filters), `realtime` (Supabase subscriptions), `task-notification-store` (banner queue)
- **React Query** — all API data fetching via hooks in `apps/web/src/api/`. The `client.ts` wrapper strips the `{ success, data }` envelope automatically.
- **No Redux** — clean separation between server state (React Query) and UI state (Zustand).

---

## 4. Database State

**Current migration:** 057 (`057_reviews_cms.sql`)  
**Total migrations:** 55 files (gaps at 028, 029)

### Complete Migration List

| # | File | Purpose |
|---|------|---------|
| 001 | `001_initial_schema.sql` | `stores`, `roles`, `role_permissions`, `employees`, `users`, `update_updated_at()` trigger fn |
| 002 | `002_config_tables.sql` | `chart_of_accounts`, `addons`, `locations`, `payment_methods`, `vehicle_models`, `vehicle_model_pricing`, `fleet_statuses`, `expense_categories`, `transfer_routes`, `day_types`, `paw_card_establishments`, `maintenance_work_types`, `leave_config` |
| 003 | `003_core_entities.sql` | `customers`, `fleet`, `orders`, `order_items`, `order_addons` |
| 004 | `004_payments_and_accounting.sql` | `payments`, `vehicle_swaps`, `journal_entries`, `cash_reconciliation`, `card_settlements` |
| 005 | `005_hr_and_operations.sql` | `timesheets`, `cash_advance_schedules`, `maintenance`, `expenses`, `transfers` |
| 006 | `006_remaining_tables.sql` | `misc_sales`, `lost_opportunity`, `todo_tasks`, `todo_comments`, `paw_card_entries`, `ui_errors` |
| 007 | `007_new_functionality.sql` | `merchandise`, `reviews`, `recurring_bills`, `directory` |
| 008 | `008_triggers_and_indexes.sql` | Bulk `updated_at` triggers + performance indexes |
| 009 | `009_rls_policies.sql` | RLS policies, `user_store_ids()`, `has_permission()` |
| 010 | `010_enable_realtime.sql` | Realtime publication |
| 011 | `011_orders_raw.sql` | `orders_raw` table for WooCommerce payloads |
| 012 | `012_payment_surcharge.sql` | `payment_methods.surcharge_percent` |
| 013 | `013_order_payments.sql` | `order_payments` (dropped in 015) |
| 014 | `014_orders_woo_order_id.sql` | `orders.woo_order_id` |
| 015 | `015_consolidate_payments.sql` | Consolidate into `payments` table, drops `order_payments` |
| 016 | `016_fix_fleet_statuses.sql` | Reseed canonical fleet statuses |
| 017 | `017_store_default_float.sql` | `stores.default_float_amount` |
| 018 | `018_card_settlements_update.sql` | Card settlement PK + `payment_id` |
| 019 | `019_store_booking_token.sql` | `stores.booking_token`, `public_booking_enabled` |
| 020 | `020_stores_default_float_if_missing.sql` | Idempotent float amount |
| 021 | `021_merchandise_low_stock_threshold.sql` | `merchandise.low_stock_threshold` |
| 022 | `022_payment_routing_rules.sql` | `payment_routing_rules`, store default accounts |
| 023 | `023_drop_routing_income_account.sql` | Drop `income_account_id` from routing rules |
| 024 | `024_task_accountability.sql` | `task_categories`, `task_events`, `task_notifications` + extends `todo_tasks` |
| 025 | `025_leave_reset_log.sql` | `leave_reset_log` |
| 026 | `026_company_store.sql` | Insert `company` store |
| 027 | `027_consolidate_company_accounts.sql` | Remap duplicate COA entries |
| 030 | `030_paw_card_enhancements.sql` | `receipt_url` + storage bucket |
| 031 | `031_paw_card_savings_logs_view_rls.sql` | Savings view + RLS |
| 032 | `032_paw_card_establishments_public_read.sql` | Anon read on establishments |
| 033 | `033_paw_card_order_id_default.sql` | Auto `PAW-` order ID trigger |
| 034 | `034_paw_card_paw_reference_and_order_lookup_rls.sql` | `paw_reference` + order lookup policies |
| 035 | `035_orders_raw_direct_booking_columns.sql` | `booking_channel`, structured columns on `orders_raw` |
| 036 | `036_booking_holds.sql` | `booking_holds` table |
| 037 | `037_vehicle_models_security_deposit.sql` | `vehicle_models.security_deposit` |
| 038 | `038_orders_raw_transfer_fields.sql` | Transfer columns on `orders_raw` |
| 039 | `039_repair_costs.sql` | `repair_costs` + seed data |
| 040 | `040_addons_applicable_model_ids.sql` | `addons.applicable_model_ids` |
| 041 | `041_charity_donation.sql` | `charity_donation` + COA row |
| 042 | `042_orders_raw_web_payment_method.sql` | `web_payment_method` |
| 043 | `043_edit_permissions.sql` | Admin/manager edit permissions |
| 044 | `044_dashboard_permission.sql` | `can_view_dashboard` |
| 045 | `045_expense_transactions.sql` | RPCs `create_expense_with_journal`, `delete_expense_with_journal` |
| 046 | `046_card_settlement_transaction.sql` | RPC `match_card_settlement` |
| 047 | `047_cashup_transaction.sql` | RPC `reconcile_cash_atomic` |
| 048 | `048_payroll_transaction.sql` | RPC `run_payroll_atomic` |
| 049 | `049_order_activation_transaction.sql` | RPC `activate_order_atomic` |
| 050 | `050_expense_status.sql` | `expenses.status/paid_at` + RPC `pay_expenses_atomic` |
| 051 | `051_directory_columns.sql` | Extra directory columns |
| 052 | `052_transfer_routes_pricing_type.sql` | `pricing_type` on transfer routes |
| 053 | `053_before_close_tables.sql` | `late_return_assignments` + `employees.default_payment_method` |
| 054 | `054_budget.sql` | `budget_periods`, `budget_lines` |
| 055 | `055_atomic_extend_cancel.sql` | RPCs `cancel_order_raw_atomic`, `confirm_extend_raw_atomic`, `confirm_extend_order_atomic` |
| 056 | `056_cancel_orders_permission.sql` | `can_cancel_orders` permission |
| 057 | `057_reviews_cms.sql` | `reviews.is_active`, `reviewer_role`, `sort_order` |

### Supabase RPC Functions

| Function | Migration | Purpose |
|----------|-----------|---------|
| `create_expense_with_journal` | 045/050 | Atomic expense + journal creation |
| `delete_expense_with_journal` | 045 | Atomic expense + journal deletion |
| `pay_expenses_atomic` | 050 | Batch mark expenses paid + journal |
| `match_card_settlement` | 046 | Card settlement → journal matching |
| `reconcile_cash_atomic` | 047 | Cash reconciliation upsert + lock |
| `run_payroll_atomic` | 048 | Payroll run with timesheets + journals |
| `activate_order_atomic` | 049 | Order activation bundle (order + items + addons + fleet + journal) |
| `cancel_order_raw_atomic` | 055 | Cancel raw order + release holds |
| `confirm_extend_raw_atomic` | 055 | Extend via raw order path |
| `confirm_extend_order_atomic` | 055 | Extend active order |

### Core Tables (30+)

**Operational:** `stores`, `customers`, `orders`, `order_items`, `order_addons`, `orders_raw`, `payments`, `fleet`, `vehicle_swaps`, `booking_holds`, `transfers`, `maintenance`, `merchandise`, `misc_sales`, `lost_opportunity`  
**HR:** `employees`, `users`, `roles`, `role_permissions`, `timesheets`, `cash_advance_schedules`, `leave_config`, `leave_reset_log`  
**Finance:** `chart_of_accounts`, `journal_entries`, `cash_reconciliation`, `card_settlements`, `expenses`, `payment_routing_rules`, `budget_periods`, `budget_lines`  
**Config:** `addons`, `locations`, `payment_methods`, `vehicle_models`, `vehicle_model_pricing`, `fleet_statuses`, `expense_categories`, `transfer_routes`, `day_types`, `task_categories`, `maintenance_work_types`, `repair_costs`  
**Features:** `todo_tasks`, `todo_comments`, `task_events`, `task_notifications`, `paw_card_entries`, `paw_card_establishments`, `reviews`, `recurring_bills`, `directory`, `ui_errors`, `late_return_assignments`

---

## 5. API Routes — Complete Inventory

### `auth.ts` — `/api/auth` (public)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/login` | Username/PIN login, returns JWT | None |

### `accounting.ts` — `/api/accounting`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/balances` | Trial-style balances | ViewAccounts |
| GET | `/balances-v2` | Half-month balance summary | ViewAccounts |
| GET | `/account-ledger` | Journal lines for account | ViewAccounts |
| GET | `/entries` | Entries by store + period | ViewAccounts |
| POST | `/journal` | Create journal entry | EditAccounts |
| POST | `/drawings` | Owner drawings | EditAccounts |
| POST | `/transfer` | Inter-account transfer | EditAccounts |

### `budget.ts` — `/api/budget`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/` | Budget lines + actuals | ViewAccounts |
| POST | `/lines` | Upsert budget lines | ViewAccounts |
| GET | `/autofill` | Last-year actuals as draft | ViewAccounts |

### `card-settlements.ts` — `/api/card-settlements`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/pending` | Pending settlements | ViewCardSettlements |
| GET | `/settled` | Settled list | ViewCardSettlements |
| GET | `/balance` | Pending totals | ViewCardSettlements |
| POST | `/match` | Match to bank | ViewCardSettlements |
| POST | `/batch-edit` | Batch metadata update | ViewCardSettlements |
| POST | `/combine` | Assign batch number | ViewCardSettlements |

### `cashup.ts` — `/api/cashup`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/summary` | Aggregated cash-up payload | ViewCashup |
| GET | `/` | Reconciliation by date | ViewCashup |
| POST | `/deposit` | Bank deposit journal | ViewCashup |
| POST | `/inter-store-transfer` | Inter-store cash transfer | ViewCashup |
| POST | `/reconcile` | Reconcile/lock day | ViewCashup |
| POST | `/override` | Override locked recon | OverrideCashup |
| GET | `/late-returns-check` | Late returns after 20:00 | ViewCashup |
| GET | `/late-return-assignment` | Read assignment | ViewCashup |
| POST | `/late-return-assignment` | Upsert assignment | ViewCashup |

### `config.ts` — `/api/config` (60+ endpoints)
Full CRUD for: stores, addons, locations, payment methods, vehicle models, model pricing, fleet statuses, expense categories, task categories, transfer routes, day types, chart of accounts, paw card establishments, maintenance work types, repair costs, leave config, roles, permissions, users, employees, payment routing, reviews.  
**Read operations:** authenticated only (no specific permission).  
**Write operations:** `EditSettings` permission.

### `dashboard.ts` — `/api/dashboard`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/summary` | Store KPIs + financials | ViewDashboard (financial block) |
| GET | `/charity-impact` | Charity totals | Authenticated only |

### `directory.ts` — `/api/directory`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST/PUT/DELETE | `/`, `/:id` | Contact directory CRUD | Authenticated only |

### `expenses.ts` — `/api/expenses`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/` | List expenses | ViewExpenses |
| POST | `/` | Create expense | EditExpenses |
| PUT | `/:id` | Update expense | EditExpenses |
| DELETE | `/:id` | Delete expense | EditExpenses |
| POST | `/pay` | Batch pay via RPC | EditExpenses |

### `fleet.ts` — `/api/fleet`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/` | List vehicles | ViewFleet |
| POST | `/sync` | Fleet status sync job | ViewFleet |
| GET | `/utilization` | Utilization metrics | ViewFleet |
| GET | `/calendar` | Fleet calendar | ViewFleet |
| POST | `/` | Create vehicle | EditFleet |
| GET | `/available` | Available in date window | ViewFleet |
| GET | `/:id` | Vehicle detail | ViewFleet |
| PUT | `/:id` | Update vehicle | EditFleet |
| POST | `/purchase` | Capitalize purchase | EditFleet |
| POST | `/sale` | Record sale | EditFleet |
| POST | `/depreciation` | Batch depreciation | EditFleet |

### `hr.ts` — `/api/hr`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/timesheets` | Timesheets in period | ViewTimesheets |
| GET | `/timesheets/check-duplicates` | Duplicate check | ViewTimesheets |
| POST | `/timesheets` | Submit timesheet | SubmitTimesheets |
| POST | `/timesheets/approve` | Approve timesheets | ApproveTimesheets |
| POST | `/leave` | Submit leave | SubmitTimesheets |
| GET/POST/PUT/DELETE | `/employees`, `/:id` | Employee CRUD | ViewTimesheets / ManageEmployees |

### `lost-opportunity.ts` — `/api/lost-opportunities`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST/PUT/DELETE | `/`, `/:id` | Lost sales CRUD | ViewLostOpportunity |

### `maintenance.ts` — `/api/maintenance`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/`, `/:id` | List/detail | ViewMaintenance |
| POST | `/` | Log maintenance | EditMaintenance |
| PUT | `/:id` | Save | EditMaintenance |
| DELETE | `/:id` | Delete | EditMaintenance |
| POST | `/:id/complete` | Complete | EditMaintenance |

### `merchandise.ts` — `/api/merchandise`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST/PUT/DELETE | `/`, `/:sku`, `/adjust-stock` | Merch CRUD + stock | ViewMiscSales |

### `misc-sales.ts` — `/api/misc-sales`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST/PUT/DELETE | `/`, `/:id` | Misc sales CRUD | ViewMiscSales |

### `orders.ts` — `/api/orders`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/`, `/enriched`, `/:id`, `/:id/items`, `/:id/payments`, `/:id/addons`, `/:id/history`, `/:id/swaps` | Read orders | ViewInbox |
| POST | `/:id/activate` | Activate order | EditOrders |
| POST | `/:id/settle` | Settle rental | EditOrders |
| POST | `/:id/payment` | Record payment | EditOrders |
| POST | `/:id/modify-addons` | Modify addons | EditOrders |
| POST | `/:id/adjust-dates` | Adjust dates | EditOrders |
| POST | `/:id/swap-vehicle` | Swap vehicle | EditOrders |

### `orders-raw.ts` — `/api/orders-raw`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| POST | `/walk-in` | Create walk-in (to inbox) | EditOrders |
| POST | `/walk-in-direct` | Create + activate walk-in | EditOrders |
| GET | `/`, `/:id` | List/detail raw orders | ViewInbox |
| POST | `/:id/process` | Process raw order | EditOrders |
| POST | `/:id/collect-payment` | Collect payment | EditOrders |
| PATCH | `/:id/cancel` | Cancel raw order | CancelOrders |

### `paw-card.ts` — `/api/paw-card` (mostly public)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/lookup`, `/establishments`, `/customer-savings`, `/lifetime`, `/company-impact`, `/my-submissions`, `/leaderboard` | Paw Card reads | None |
| POST | `/submit`, `/register`, `/upload-receipt` | Paw Card writes | None |

### `payroll.ts` — `/api/payroll`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| POST | `/payslip` | Calculate payslip | ViewPayroll |
| POST | `/preview` | Payroll preview | ViewPayroll |
| POST | `/run` | Run payroll | ViewPayroll |

### `todo.ts` — `/api/todo`
Full task management: CRUD, lifecycle (claim/start/submit/verify/reject/escalate), comments, notifications, reporting. Mixed ViewTodo/ManageTodo permissions.

### `transfers.ts` — `/api/transfers`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/`, `/:id` | List/detail | ViewTransfers |
| POST | `/`, `/payment`, `/driver-payment` | Create + payments | EditTransfers |

### `ui-errors.ts` — `/api/ui-errors`
| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET/POST/PUT | `/`, `/:id` | UI error tracking | ViewUIErrors |

### Public Routes (no authentication)
- **`/api/public/booking`** — model pricing, availability, quote, hold CRUD, submit booking, addons, locations, payment methods, order lookup, transfer routes, charity impact
- **`/api/public/extend`** — rental extension lookup/preview/confirm
- **`/api/public/paw-card`** — email lookup, entries, rental orders
- **`/api/public/repairs`** — repair cost list
- **`/api/public/reviews`** — active reviews
- **`/api/public/transfer-routes`**, `/store-info`, `/transfer-booking`, `/public-transfer-booking`, `/flight-lookup` — transfer booking

---

## 6. Frontend Pages — Complete Inventory

### Customer-Facing
| Route | Page | Key Hooks |
|-------|------|-----------|
| `/book` | `HomePage` | `useIsTouchDevice`, child: `usePublicReviews` |
| `/book/reserve` | `BrowseBookPage` | `api.get` (availability/models) |
| `/book/basket` | `BasketPage` | `api` (checkout) |
| `/book/confirmation/:reference` | `ConfirmationPage` | `api` (order lookup) |
| `/book/extend` | `ExtendPage` | `api` (extend flow) |
| `/book/paw-card` | `PawCardPage` | Paw Card hooks + Supabase queries |
| `/book/transfers` | `TransferBookingPage` | Direct `fetch` |
| `/book/repairs` | `RepairsPage` | `api.get` (repair costs) |
| `/book/about` | `AboutPage` | None |
| `/book/privacy` | `PrivacyPage` | None |
| `/book/transfer/:token` | `PublicBookingPage` | `api` |

### Backoffice
| Route | Page | Key Hooks |
|-------|------|-----------|
| `/login` | `LoginPage` | `api.post` (auth) |
| `/dashboard` | `DashboardPage` | `useDashboardSummary`, `useCharityImpact`, `useLostOpportunities` |
| `/orders/inbox` | `InboxPage` | `useOrdersRaw`, `useStores` |
| `/orders/active` | `ActivePage` | `useEnrichedOrders` |
| `/orders/completed` | `CompletedPage` | `useEnrichedOrders` |
| `/fleet` | `FleetPage` | `useFleet`, `useFleetSync`, `useVehicleModels` |
| `/fleet/utilization` | `UtilizationDashboard` | `useFleetUtilization` (permission-gated) |
| `/maintenance` | `MaintenancePage` | `useMaintenanceRecords` |
| `/transfers` | `TransfersPage` | `useTransfers` |
| `/accounts` | `AccountsPage` | `useBalancesV2`, `useChartOfAccounts` |
| `/accounts/:id` | `AccountDetailPage` | Account ledger query |
| `/budget` | `BudgetPage` | `useBudget`, `useAutofill` |
| `/card-settlements` | `CardSettlementsPage` | Card settlement hooks |
| `/cashup` | `CashupPage` | Cashup hooks |
| `/hr/employees` | `EmployeesPage` | `useAllEmployees` |
| `/hr/timesheets` | `TimesheetsPage` | Timesheet hooks |
| `/hr/payroll` | `PayrollPage` | `useEmployees` |
| `/expenses` | `ExpensesPage` | Expense hooks + config |
| `/todo` | `TodoPage` | `useTasks` + full lifecycle |
| `/misc-sales` | `MiscSalesPage` | Misc sale hooks |
| `/merchandise` | `MerchandisePage` | Merchandise hooks |
| `/lost-opportunity` | `LostOpportunityPage` | Lost opportunity hooks |
| `/settings` | `SettingsPage` | Config tab components |
| `/ui-errors` | `UIErrorsPage` | UI error hooks |
| `/directory` | `DirectoryPage` | Directory hooks |

---

## 7. Frontend Components — Key Components

**Layout:** `AppLayout` (backoffice shell), `Sidebar`, `Header`, `TopNav` (customer), `PageLayout`, `StoreFilter`, `TaskBanners`  
**Common:** `Modal`, `Table`, `Badge`, `Button`, `DatePicker`, `ErrorBoundary`, `Select`  
**Home:** `FleetPreviewSection`, `ReviewsSection`, `BePawsitiveMeter`, `HowItWorksSection`, `BorderGlow`, `TiltedCard`, `Stepper`, `CircularGallery`, `DomeGallery`  
**Public:** `FadeUpSection`, `PrimaryCtaButton`, `PrimaryCtaLink`, `BrandCard`, `PageHero`  
**Booking:** `SearchBar`, `VehicleCard`, `HoldCountdown`  
**Basket:** `AddOnsSection`, `BasketVehicleCard`, `OrderSummaryPanel`, `RenterDetailsForm`, `TransferSection`  
**Orders:** `BookingModal`, `WalkInBookingModal`, `OrderDetailModal`, `CancelOrderModal`, `ExtendOrderModal`  
**Fleet:** `AddVehicleModal`, `AssetManagementModal`, `FleetCalendar`, `VehicleModal`, `ServiceHistoryModal`  
**Settings:** 19 tab components covering all configuration areas

---

## 8. Domain Model

### Entities
| Entity | Key Properties | Business Rules |
|--------|---------------|----------------|
| **Order** | status, finalTotal, balanceDue, addons[] | Status machine (Unprocessed→Active→Completed/Cancelled); vehicle count validation; mutual exclusivity groups for addons |
| **Vehicle** | bookValue, salvageValue, usefulLifeMonths | Protected/non-rentable statuses; depreciation with salvage floor |
| **Employee** | hourlyRate, monthlyBasic, leaveBalances | PH deduction tiers (SSS/PhilHealth/Pag-IBIG); holiday/sick leave tracking |
| **Timesheet** | hoursRegular, hoursOvertime, status | 8h split (regular/OT); overnight handling; Pending→Approved→Paid |
| **JournalTransaction** | legs[] | Debit XOR credit per leg; balanced or rejected |
| **MaintenanceRecord** | status, partsCost, laborCost | Reported→In Progress→Completed lifecycle |
| **Transfer** | totalPrice, driverFee, paidAmount | Payment status derivation; net profit calculation |

### Value Objects
| VO | Rules |
|----|-------|
| **Money** | PHP currency, 2dp rounding, finite validation |
| **OrderStatus** | Enumerated states with allowed transition map |
| **DateRange** | end ≥ start; overlap detection; ceil day duration |
| **Period** | First/second half of month; contains check |
| **StoreId** | Non-empty string identity |

### Services
| Service | Purpose |
|---------|---------|
| **PayrollCalculator** | Daily/monthly pay, OT, PH deductions, 13th month accrual |
| **DepreciationService** | Straight-line monthly depreciation |
| **DepositCalculator** | Refundable deposit formula |

---

## 9. Permissions System

All permissions from `packages/shared/src/constants/permissions.ts`:

`ViewInbox`, `EditOrders`, `CancelOrders`, `ViewFleet`, `EditFleet`, `ViewMaintenance`, `EditMaintenance`, `ViewTransfers`, `EditTransfers`, `ViewCashup`, `OverrideCashup`, `ViewExpenses`, `EditExpenses`, `ViewAccounts`, `EditAccounts`, `ViewTimesheets`, `SubmitTimesheets`, `ApproveTimesheets`, `ViewPayroll`, `ManageEmployees`, `ViewMiscSales`, `ViewCardSettlements`, `ViewTodo`, `ManageTodo`, `ViewLostOpportunity`, `ViewDashboard`, `ViewUIErrors`, `EditSettings`

Roles are database-driven (`roles` + `role_permissions` tables). Migration 043 grants edit permissions to admin/manager; migration 044 adds `can_view_dashboard` for admin; migration 056 adds `can_cancel_orders`.

---

## 10. Known Bugs & Issues

| Severity | File | Issue | Suggested Fix |
|----------|------|-------|---------------|
| **Critical** | `routes/public-paw-card.ts` | `GET /entries` returns ALL `paw_card_entries` without filtering by customer email after lookup — data exposure | Add `.eq('customer_id', customer.id)` filter to entries query |
| **High** | `routes/paw-card.ts` | Most routes have no `authenticate` middleware — receipt uploads, submissions, registration all public | Add authentication or rate limiting; validate file types on upload |
| **High** | `routes/orders-raw.ts` | `POST /walk-in-direct` — 500 error on activation (reported in session) | Debug `activate_order_atomic` RPC input shape; add better error logging |
| **High** | `routes/card-settlements.ts` | Mutations (match, batch-edit, combine) use `ViewCardSettlements` instead of a write permission | Create `EditCardSettlements` permission |
| **High** | `routes/payroll.ts` | `POST /run` (payroll execution) uses `ViewPayroll` not an edit permission | Create `RunPayroll` permission |
| **Medium** | `routes/directory.ts` | Full CRUD with no `requirePermission` — any authenticated user can modify | Add `EditDirectory` or `ManageDirectory` permission |
| **Medium** | `routes/config.ts` | All read operations accessible to any authenticated user | Consider `ViewSettings` permission for sensitive config (users, roles, COA) |
| **Medium** | `routes/accounting.ts` | `POST /drawings` uses hardcoded account IDs | Make configurable via store settings |
| **Medium** | `routes/cashup.ts` | Hardcoded `GCASH_IDS`, `DEPOSIT_TYPES`, default float `3000` | Move to config or store settings |
| **Medium** | `routes/dashboard.ts` | `CHARITY_OPENING_BALANCE`, `CHARITY_PENDING_LEGACY`, `annualCap: 100000` hardcoded | Move to database config |
| **Medium** | `routes/public-transfers.ts` | `storeId: 'store-lolas'` hardcoded in `public-transfer-booking` | Resolve from booking token or route |
| **Medium** | `routes/fleet.ts` | `vehicleToDto(v: any)` + `as unknown as OrderItemRow[]` | Add proper types |
| **Medium** | `components/orders/OrderDetailModal.tsx` | `console.log` left in settle button handler | Remove |
| **Medium** | `adapters/supabase/budget-repo.ts` | 3 TODO comments (replace JS aggregation with RPC) | Implement RPCs for budget actuals |
| **Low** | `components/layout/TopNav.tsx` | Paw icon PNG not loading (reported) | Fix asset path or switch to SVG |
| **Low** | `pages/TransferBookingPage.tsx` | `SHARED_PRICE = 330`, `PRIVATE_PRICE = 2500` hardcoded | Move to transfer_routes config |
| **Low** | `pages/privacy/PrivacyPage.tsx` | "Last updated: March 2026" hardcoded | Dynamically populate or update |
| **Low** | `components/home/BePawsitiveMeter.tsx` | `FALLBACK_TOTAL = 282995` hardcoded | Fetch from API only; remove fallback or update periodically |
| **Low** | `tsconfig` (api + web) | `noImplicitAny: false`, `strict: false` on web | Tighten gradually |

---

## 11. Security Audit

| Area | Status | Notes |
|------|--------|-------|
| **Authentication** | Good | JWT via `authenticate` middleware on all backoffice routes |
| **Authorization** | Gaps | Directory CRUD has no permission check; card settlement/payroll mutations use view-only permissions; config reads accessible to all authenticated users |
| **Public surface** | Risky | Paw Card routes largely unauthenticated including file upload; public-paw-card entries endpoint leaks data |
| **SQL injection** | Low risk | Supabase client parameterizes queries; Zod validates inputs |
| **Secrets in code** | None found | All secrets via environment variables |
| **CORS** | Configured | Via `cors` middleware in `server.ts` |
| **Rate limiting** | Present | Login: 5/15min, public: 60/min, API: 200/min. Paw Card upload has no specific limit |
| **RLS** | Comprehensive | Migration 009 sets up RLS on all tables with `user_store_ids()` and `has_permission()` |
| **File uploads** | Concern | Paw Card receipt upload via Multer to Supabase bucket with public URLs — no file type/size validation in route |

---

## 12. Performance Considerations

| Area | Concern | Impact |
|------|---------|--------|
| **Cashup summary** | Single endpoint runs 10+ parallel Supabase queries | Slow on large data; consider materialized views |
| **Dashboard summary** | Multiple sequential queries per sub-metric | Could timeout with growth |
| **Budget actuals** | JavaScript-side aggregation instead of SQL | 3 TODO comments to replace with RPCs |
| **Fleet calendar** | Fetches all orders + raw orders for date range | Could benefit from dedicated view |
| **Missing pagination** | Fleet list, expense list, config reads return all rows | Add pagination for stores with growing data |
| **Bundle size** | GSAP, OGL (WebGL), Framer Motion, Recharts all in main bundle | Consider code-splitting; lazy-load customer vs backoffice |
| **N+1 queries** | Order enrichment fetches items/payments per order in some flows | Use joined queries or batch fetching |
| **Missing indexes** | `orders_raw` searches by `status` + `store_id` — covered by 011 | Generally well-indexed from migration 008 |

---

## 13. Critical Technical Debt

1. **Public Paw Card data exposure** — `GET /entries` returns all entries regardless of customer (Critical)
2. **Permission gaps on mutations** — card settlements, payroll run, directory CRUD (High)
3. **Walk-in direct 500 error** — blocking core operational flow (High)
4. **TypeScript strictness** — `noImplicitAny: false` and `strict: false` on web; `noImplicitAny: false` on API (Medium, accumulating)
5. **Hardcoded business values** — charity caps, transfer prices, account IDs scattered across routes (Medium)
6. **Budget RPCs** — JS-side aggregation should move to PostgreSQL (Medium)
7. **Font loading** — multiple font families (Alegreya Sans, Plus Jakarta Sans, Lato, Nunito, Playfair Display) create loading waterfall (Low)
8. **Dead code / unused features** — `recurring_bills` table exists but no CRUD routes; `sheet-sync-port` defined but unused (Low)

---

## 14. Completed Features — Full List

### Operations
- WooCommerce order inbox with search, pagination, status filtering
- Order processing workflow (raw → active → completed/cancelled)
- Walk-in booking modal with direct activation flow
- Order detail: payments, addons, date adjustments, vehicle swaps
- Rental extension (public + backoffice)
- Order cancellation with atomic RPC
- Fleet calendar view

### Fleet
- Vehicle CRUD with status management
- Automatic fleet status sync
- Available vehicles endpoint for walk-in bookings
- Utilization dashboard with analytics
- Asset management: purchase capitalization, sale recording, batch depreciation
- Service history tracking
- Vehicle model/pricing configuration

### Finance
- Double-entry general ledger with journal entries
- Daily cash-up with reconciliation and locking
- Cash-up override for managers
- Expense management with paid/unpaid workflow + atomic journal creation
- Card settlement matching and batch management
- Inter-store cash transfers
- Owner drawings
- Budget editor with autofill from prior year
- Payment routing rules (per store, per method → GL accounts)
- Account ledger drill-down

### HR
- Employee CRUD with PH-specific deductions (SSS, PhilHealth, Pag-IBIG)
- Timesheet submission and approval workflow
- Leave management (holiday/sick)
- Payroll calculator with daily/monthly modes
- Payroll preview and atomic run
- Late return assignment tracking

### Customer Website
- Marketing homepage with animations (Framer Motion, GSAP)
- Vehicle browsing with date/store selection
- Basket with add-ons, transfer section, renter details
- Online booking with hold system (15-min countdown)
- Booking confirmation with WhatsApp share
- Rental extension self-service
- Paw Card loyalty program (savings tracking, leaderboard, receipt upload)
- Airport transfer booking (shared/private)
- Repair cost transparency page
- About and Privacy pages
- Public reviews section

### Settings & Config
- 19 settings tabs covering all configurable entities
- Role-based permission management
- User management with PIN authentication
- Store management with booking tokens
- Payment method configuration
- Addon management with model-specific filtering

### Dashboard
- Revenue KPIs (daily/monthly)
- Operational metrics (active rentals, fleet utilization)
- Charity impact (Be Pawsitive program)
- Lost opportunity tracking

### Other
- Task management system with full lifecycle (create/claim/start/submit/verify/reject/escalate)
- Real-time task notifications via Supabase
- Merchandise/stock management
- Misc sales recording
- Contact directory
- UI error tracking system
- Rate limiting on all routes

---

## 15. Pending To-Do List

### Critical (blocking production)
- Fix `public-paw-card.ts` GET `/entries` data exposure — filter by customer
- Fix walk-in direct booking 500 error on activation
- Add permission checks to directory CRUD
- Add proper write permissions for card settlement and payroll mutations

### High Priority
- Email automation (Resend integration) — booking confirmations, reminders
- Digital waiver system — pre-rental waiver capture
- Payment gateway integration — online payments for website bookings
- Transfer customer booking page — dedicated transfer booking flow
- TopNav paw icon — fix PNG loading or replace with SVG

### Medium Priority
- Dashboard revenue widgets — expand financial KPIs
- Paw Card improvements — better receipt validation, entry filtering
- Replace hardcoded business values with database config
- Implement budget SQL RPCs (3 TODOs in budget-repo.ts)
- Add pagination to fleet, expenses, config endpoints
- Tighten TypeScript strict mode (`noImplicitAny`, `strict`)
- Remove `console.log` from `OrderDetailModal.tsx`
- Code-split customer vs backoffice bundles

### Low Priority / Backlog
- Font loading optimization (reduce font families or use `font-display: swap`)
- Dead bundle weight audit (OGL, GSAP tree-shaking)
- `recurring_bills` — implement CRUD or remove table
- `sheet-sync-port` — implement Google Sheets sync or remove
- Transfer pricing from config instead of hardcoded
- Privacy page date automation
- BePawsitiveMeter fallback removal

---

## 16. Brand & Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `teal-brand` | `#00577C` | Primary headings, CTAs, links |
| `gold-brand` | `#FCBC5A` | Accent, CTA buttons, highlights |
| `sand-brand` | `#f1e6d6` | Warm backgrounds |
| `cream-brand` | `#FAF6F0` | Page backgrounds |
| `charcoal-brand` | `#363737` | Body text, borders |

### Typography
| Font | Class | Usage |
|------|-------|-------|
| Alegreya Sans | `font-headline` | Navigation, headings |
| Plus Jakarta Sans | `font-body` | Body copy |
| Lato | `font-lato` | Labels, backoffice forms |
| Nunito | — | Secondary UI text |
| Playfair Display | `font-display` | Reserved display text |

### Component Patterns
- Gold skeuomorphic CTAs with charcoal border and offset shadow
- `PageLayout` / `FadeUpSection` / `BorderGlow` / `TiltedCard` for customer pages
- `PrimaryCtaButton` / `PrimaryCtaLink` for consistent call-to-action styling
- Hero floating clouds with parallax
- Section dividers (wave/paw patterns)
- Spacing: `64px 5%` padding, `max-w-7xl` container

### Backoffice
- Teal-600 primary, gray-* neutral palette
- `font-lato` for all form labels and inputs
- Rounded-lg borders, consistent padding/spacing
- Modal-based workflows

---

## 17. Environment Variables

### API (`apps/api`)
| Variable | Purpose | Required |
|----------|---------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `PORT` | API server port | No (default 3001) |
| `CORS_ORIGIN` | Allowed origins | Yes |
| `GOOGLE_SHEETS_CREDENTIALS` | Google Sheets API credentials | For sheet sync |
| `AERODATABOX_API_KEY` | Flight lookup API key | For transfer booking |
| `NODE_ENV` | Environment flag | Recommended |

### Web (`apps/web`)
| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_API_URL` | API base URL | Yes |
| `VITE_SUPABASE_URL` | Supabase project URL (for realtime) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Yes |
| `VITE_SITE_URL` | Public site URL (for share links) | Yes |

---

## 18. Deployment Configuration

### Web → Vercel
- **Build command:** `npm run build:vercel` (domain → shared → web)
- **Output:** `apps/web/dist`
- **Framework:** Vite
- **Known issues:** Font loading may need `@vercel/edge` config for cross-origin fonts

### API → Render
- **Build command:** `npm run build:render-api` (domain → shared → api + verify dist/server.js)
- **Start command:** `npm run start` (from `apps/api`)
- **Output:** `apps/api/dist/server.js`
- **Known issues:** Cold starts on free tier; ensure health check endpoint

---

## 19. Agent Selection Guide

| Task Type | Recommended Agent | Why |
|-----------|------------------|-----|
| Complex multi-file architectural changes (new feature spanning API + domain + web) | Most capable model | Needs to hold full context across layers |
| Default for most tasks (single feature, bug fix, refactor) | Standard model | Good balance of speed and quality |
| Single-file targeted changes (fix a CSS class, update a constant, tweak a query) | Fast model | Quick turnaround, minimal context needed |
| Broad codebase exploration (understanding a flow, finding dependencies) | Explore agent | Optimized for fast file discovery and search |

---

## 20. Session Handoff Notes

### What Was Built — April 7, 2026
1. **Walk-in direct booking** — new `POST /walk-in-direct` endpoint + frontend `useCreateWalkInDirect` hook + full modal rebuild with vehicle selection, addon filtering, quote calculation, payment section
2. **WalkInBookingModal UX fixes:**
   - Location fees and addon costs now compute locally (instant, no API roundtrip lag)
   - Location dropdowns show fees inline and are now mandatory
   - Deposit is mandatory by default with "Waive deposit" checkbox
   - "Today" and "Now" quick-set buttons for pickup date/time
   - "+1 Day" button for return date (increments from pickup)
   - Timezone-safe date formatting (fixed UTC drift in Philippines timezone)
   - Rental days display uses local `Math.ceil` for instant updates
3. **Fleet availability** — `GET /fleet/available` endpoint
4. **Cashup fixes** — paid-only expense filter, cash expense subtraction
5. **Multiple bug fixes** — quote race condition (AbortController), location auto-set guards, addon quantity in URL params, deposit leading zero

### What Was Left Incomplete
- Walk-in direct 500 error on activation — needs debugging of `activate_order_atomic` RPC input
- TopNav paw icon not loading

### What to Tackle First Next Session
1. Debug the walk-in direct 500 error — check RPC parameter shape
2. Fix public Paw Card data exposure (security critical)
3. Add missing permission checks (directory, card settlements, payroll)

### Gotchas
- `todayDate()` was using `toISOString()` which returns UTC — fixed to use local date methods. Watch for similar patterns elsewhere.
- Quote fetch uses `AbortController` — don't add dependencies that trigger unnecessary re-fetches
- The `addons.applicable_model_ids` column is all null in the database; addon filtering uses name-based matching instead
- `activate_order_atomic` RPC has a complex parameter shape — cross-reference migration 049 with the use-case input
