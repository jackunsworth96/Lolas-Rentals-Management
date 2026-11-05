# Inventory availability bug — root cause and fix plan

**Status:** Not started — review/analysis complete, no code changed yet.
**Severity:** High — causes real, in-stock vehicles to appear unbookable on the website *and* in the staff walk-in tool, and separately allows staff to double-book a vehicle that's already out on a rental.
**Reported by:** Ops, after a walk-in customer was physically handed "Barrel" (a free Honda Beat) while both the website and the back-office walk-in tool said "0 / no vehicles available" for the exact same dates.

---

## 1. Symptom

Search window used for repro: **store-lolas, Honda Beat, pickup 24 Oct 2026 09:15 → dropoff 30 Oct 2026 16:45** (Asia/Manila).

- Public website (`/book/reserve`): shows the model as **Unavailable**, suggests "Try dates from Oct 24 at 2:15 PM."
- Back-office walk-in modal: shows **"No vehicles available for selected dates."**
- Reality: at least **10 Honda Beats are physically free** in the yard for this exact window (confirmed against `order_items`, `booking_holds`, and `fleet_unavailability` — zero conflicts on any of them). One of them, **Barrel**, was handed to the walk-in customer and could not be entered into the system.

Live API checks at the time of investigation confirmed this wasn't a one-off:

```
GET /api/public/booking/availability?storeId=store-lolas&pickupDatetime=2026-10-24T09:15:00+08:00&dropoffDatetime=2026-10-30T16:45:00+08:00
→ {"modelId":"Honda Beat V3","modelName":"Honda Beat","availableCount":0, ...}

GET /api/public/booking/quote?...  (same dates)
→ {"rentalDays":7,"dailyRate":465,"rentalSubtotal":3255, ...}   // quote math is correct, not part of this bug
```

---

## 2. Root cause

### 2.1 The shared function everything depends on

`evaluateAvailability()` in `apps/api/src/adapters/supabase/booking-adapter.ts` computes a **pooled, model-level** count:

```
availableCount =
    (vehicles of this model in the yard, not individually blocked)
  − (every "direct"/"walk_in" orders_raw row with status='unprocessed'
      whose pickup/dropoff OVERLAPS ANY PART of the requested window)
  − (live cart holds overlapping the window)
```

The bug: that middle term treats **every** overlapping reservation as if it needs a physical bike for the *entire* requested span, regardless of when its own pickup actually falls inside that span. For a long, multi-day search window, this massively over-counts simultaneous demand.

**What actually happened in the repro case:**

| Pool | Count |
|---|---|
| Honda Beats physically free in the yard (not out on a rental, not on owner-use) | 10 |
| Unprocessed web ("direct") reservations whose pickup/dropoff overlaps *some part* of 24–30 Oct | 10 |
| → pooled result | **10 − 10 = 0** |

But of those 10 pending reservations, only **one** (`LR-1023-C171`, pickup 24 Oct 09:15) actually needs a bike at the same moment as the new walk-in. The other 9 don't pick up until 26–30 Oct — by which point several of the 19 currently-active rentals will already have returned (13 of the 19 Beats out right now return before 30 Oct). The pooled subtraction doesn't account for that turnover at all; it just nets total demand against total current free stock as if every date in the range were "now."

The correct model is a **sweep-line / peak-concurrency check**: walk every event (pickup, dropoff) across the window for every blocker type, track how many units are simultaneously claimed at any instant, and set `availableCount = totalUnits − peakConcurrentDemand` (never below 0). That correctly reflects that demand spread across different days doesn't collide.

### 2.2 Why this affects almost every booking surface

`evaluateAvailability()` is wrapped by `bookingPort.checkAvailability()` (which also combines it with the `allocation_availability` SQL RPC via `Math.min`, but that RPC was **not** the binding constraint in the repro — the physical pool was). `checkAvailability()` is called from every one of these entry points:

| Entry point | File | Customer or staff |
|---|---|---|
| Website model search | `apps/api/src/routes/public-booking.ts` (`/public/booking/availability`) | Customer |
| Add-to-cart hold | `apps/api/src/use-cases/booking/create-hold.ts` | Customer |
| Checkout race-guard | `apps/api/src/use-cases/booking/submit-direct-booking.ts` | Customer |
| Self-service extend | `apps/api/src/routes/public-extend.ts`, `public-extend-helpers.ts` | Customer |
| WhatsApp/chat handoff | `apps/api/src/routes/public-respond.ts` (`/public/respond/availability`) | Staff (via bot) |
| Partner portal booking | `apps/api/src/routes/partner-portal.ts` | Partner |
| Walk-in vehicle picker | `apps/api/src/routes/fleet.ts` (`/fleet/available`) | Staff |
| Reserve-for-later modal | `apps/web/src/components/orders/ReserveForLaterModal.tsx` (same `/fleet/available` call) | Staff |

Fixing `evaluateAvailability()` once cascades correctly to **all** of these, because they all route through it. This is the highest-priority fix.

The diagnostic-only caller — `apps/api/src/routes/fleet.ts` line ~303, used by `AvailabilityExplanationModal.tsx` — is fine to leave as-is; it's meant to expose the raw physical blockers to staff for troubleshooting, not to gate a booking.

---

## 3. Two additional, separate bugs found on top of the root cause

### 3.1 Bug #2 — the walk-in tool re-clamps an already-correct result

`GET /fleet/available` (`apps/api/src/routes/fleet.ts`, lines ~648–712) does two things:

1. **Steps 1–4 (correct):** builds the exact list of vehicles with no conflicting `order_items`, no conflicting `orders_raw` walk-in holds, and no conflicting `fleet_unavailability` (owner-use) rows. This step alone correctly includes Barrel.
2. **Then (the bug), lines ~705–712:** calls `bookingPort.checkAvailability(...)` — the *same pooled model count described above* — and filters the already-correct per-vehicle list down to that pooled number:

```ts
// apps/api/src/routes/fleet.ts (current code)
const allocationModels = await req.app.locals.deps.bookingPort.checkAvailability({ storeId, pickupDatetime, dropoffDatetime, partnerRef });
const remaining = new Map<string, number>(allocationModels.map((m) => [m.modelId, m.availableCount]));
const bookableVehicles = availableVehicles.filter((v) => {
  const count = remaining.get(v.model_id ?? '') ?? 0;
  if (count < 1) return false;
  remaining.set(v.model_id!, count - 1);
  return true;
});
```

Since the pooled count was 0, this wipes out Barrel and every other correctly-free vehicle. **Fixing bug #1 (above) will raise the pooled number and incidentally unblock this too** — but the clamp is redundant and wrong in principle for a tool where staff pick one named vehicle that's already been proven conflict-free. Recommend removing the clamp entirely (see Fix Plan below) rather than relying on fix #1 alone to paper over it.

### 3.2 Bug #3 — `BookingModal` (processing an existing raw order) doesn't check real conflicts at all

`apps/web/src/components/orders/BookingModal.tsx` is the tool staff use to process a raw order (e.g. assigning a vehicle to an existing web booking like Kenneth Lin's `LR-1023-C171`). Its vehicle picker (~line 1282) only excludes vehicles on **owner-use**:

```ts
const ownerUseVehicles = availableVehicles.filter((fv) => ownerUseOverlapsBooking(...));
const selectableVehicles = availableVehicles.filter((fv) => !ownerUseVehicles.some((blocked) => blocked.id === fv.id));
```

It never checks `order_items` or `booking_holds`. A staff member could select a vehicle that is, in fact, still out on another active rental for the chosen dates, and the UI would not warn them. This is the opposite failure mode from bug #2 (under-blocking instead of over-blocking) and should be fixed as part of the same pass so both staff tools share one trustworthy "is this exact vehicle free" check.

---

## 4. Fix plan

| # | File(s) | Change |
|---|---|---|
| **1 (root cause, do first)** | `apps/api/src/adapters/supabase/booking-adapter.ts` — `evaluateAvailability()` | Replace the flat "subtract every overlapping reservation" logic with a sweep-line over all blocker start/end events (exact vehicle blocks from `order_items`/`orders_raw` walk-in/`fleet_unavailability`, pooled `direct` reservations, `booking_holds`) inside `[pickupDatetime, dropoffDatetime]`. Track peak concurrent demand; `availableCount = totalUnits − peakConcurrentDemand`, floored at 0. |
| **2** | `apps/api/src/routes/fleet.ts`, lines ~705–712 | Delete the `allocationModels` / `remaining` / `bookableVehicles` clamp. Return `availableVehicles` directly (already correctly computed in steps 1–4). If partner-tier stock protection for walk-ins is still wanted, implement it as its own exact per-vehicle/partner-allocation check — not the generic pooled subtraction. |
| **3** | `apps/web/src/components/orders/BookingModal.tsx`, vehicle picker (~line 1282) | Extend the vehicle-selectability check to also exclude vehicles with a conflicting `order_items` row or `booking_holds` row for the chosen dates, not just owner-use. (Likely needs a small supporting endpoint/field, since this is a web component checking against fleet data already loaded via `useFleet`.) |

### Suggested sequencing

1. Implement fix #1 in isolation, on a branch, with new/extended tests (see below). This is the one with the broadest blast radius (website, cart holds, checkout, extend, chat, partner portal) so it deserves its own review cycle.
2. Re-verify against the real repro case: Honda Beat, store-lolas, 24–30 Oct 2026 — should now report a realistic free count (not 0), and `nextAvailablePickup`/`firstConflictAt` metadata should remain sane.
3. Regression-check the genuinely-oversold case still reports 0 — e.g. a window where every unit really is claimed at the same instant with no spare capacity. The sweep-line must not under-protect against real overbooking.
4. Implement fix #2 (delete the redundant clamp) — small, isolated, low risk.
5. Implement fix #3 (add the missing conflict check to `BookingModal`) — closes the opposite-direction gap.

### Tests to add/extend

- `apps/api/__tests__/booking-availability-owner-use.test.ts`
- `apps/api/__tests__/check-availability-exclude-session.test.ts`
- `apps/api/__tests__/public-availability-route.test.ts`
- New case: N currently-active rentals returning on staggered dates + M pending unprocessed reservations with staggered future pickups, none of which are ever simultaneously claimed above total fleet size → `availableCount` should reflect true free stock, not `totalUnits − M`.
- New case: confirm a genuinely oversold instant (all units claimed at the same exact moment) still correctly returns 0.

---

## 5. Appendix — repro data (as observed, Oct 23 2026)

- Store: `store-lolas`. Model: `Honda Beat V3`.
- Rentable fleet: 30 (19 currently out on active rentals, 11 in the yard).
- Of the 11 yard bikes: **Lima** was on an owner-use period (22 Oct 12:15 PM – 29 Oct 12:15 PM, "To Sir, John") — correctly excluded. The remaining 10 (**Alon, Alpha, Barrel, Daku, Dax, Lemon, Newuba, Pumpkin, Sydney, Tanggol**) had zero conflicts in `order_items`, `booking_holds`, or `fleet_unavailability` for the 24–30 Oct window.
- 10 unprocessed `direct` reservations overlapped some part of 24–30 Oct (verified as genuine bookings with real customer names/emails/payment methods — not duplicates/test data), with pickups spread from 24 Oct through 30 Oct. Only one of them (`LR-1023-C171`) shares the 9:15 AM slot that triggered this investigation.
- Of the 19 currently-active rentals, 13 return before 30 Oct 4:45 PM (the remaining 6 — Chocomucho, Ginger, Patatas, Reymar, Shadow, Toffee — return after).
