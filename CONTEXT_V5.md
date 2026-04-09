# Lola's Rentals — Context V5 (April 7, 2026)

## What This Is
Full-stack rental platform for Lola's Rentals + Bass Bikes on Siargao Island, Philippines. Monorepo: `packages/domain` (entities/ports), `packages/shared` (Zod schemas/constants), `apps/api` (Express 5 + Supabase), `apps/web` (React 18 + Vite + Zustand + React Query). Deployed: web → Vercel, API → Render.

## Architecture
Hexagonal: domain ports → Supabase adapters → use-cases → Express routes. Frontend: React Query for server state, Zustand for UI state. Double-entry GL. 57 migrations, 10 atomic RPCs. RLS on all tables.

## What Was Just Built (April 7)
- `POST /walk-in-direct` endpoint — creates + activates booking in one step
- `WalkInBookingModal.tsx` major rebuild: vehicle availability, local fee/addon computation, mandatory locations (with fee labels), deposit mandatory by default (waive option), Today/Now/+1 Day buttons, timezone-safe dates, AbortController for quote race conditions
- `GET /fleet/available` endpoint for walk-in vehicle selection
- Cashup: paid-only expense filter, cash-only expense subtraction

## Critical Issues to Fix First
1. **Security: `routes/public-paw-card.ts` GET `/entries`** — returns ALL paw card entries without filtering by customer. Add `.eq('customer_id', customer.id)`.
2. **Walk-in direct 500 error** — `activate_order_atomic` RPC fails. Debug parameter shape vs migration 049.
3. **Permission gaps** — directory CRUD has no permission check; card settlement/payroll mutations use view-only permissions.

## Key Gotchas
- `todayDate()` was using UTC `toISOString()` — fixed to local methods. Watch for same pattern elsewhere.
- `addons.applicable_model_ids` is all NULL in DB — addon filtering uses name-based matching (tuktuk/scooter keywords).
- Quote fetch uses `AbortController` to prevent race conditions — don't add unstable dependencies.
- TypeScript is NOT strict (`noImplicitAny: false`, `strict: false` on web).
- `as unknown as` casts in fleet.ts, config-repo.ts, several components.

## Key Files
- `apps/api/src/routes/orders-raw.ts` — walk-in + walk-in-direct endpoints
- `apps/web/src/components/orders/WalkInBookingModal.tsx` — walk-in booking UI
- `apps/api/src/use-cases/orders/activate-order.ts` — activation logic
- `apps/api/src/adapters/supabase/order-repo.ts` — `activateOrderAtomic` RPC call
- `supabase/migrations/049_order_activation_transaction.sql` — RPC definition
- `apps/api/src/use-cases/booking/compute-quote.ts` — quote calculation (Math.ceil days)
- `packages/shared/src/constants/permissions.ts` — all permission keys
- `apps/web/DESIGN_SYSTEM.md` — brand tokens (teal #00577C, gold #FCBC5A, cream #FAF6F0)

## Pending Features
Email automation (Resend), digital waiver, payment gateway, transfer booking page, dashboard revenue widgets, Paw Card improvements, budget RPCs, pagination, TypeScript strictness.
