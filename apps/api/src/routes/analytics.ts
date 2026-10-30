import { Router, type Request } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const LIVE_ORDER_STATUSES = ['active', 'confirmed', 'completed'];

// `fleet.status` is a free-text label (e.g. "Available", "Active", "Sold",
// "Closed", "Retired", "Under Maintenance"). Sold/Closed/Retired units have left
// the rental fleet — everything else (including "Active", i.e. currently out on a
// rental) is an owned, working vehicle and counts toward fleet size.
const RETIRED_STATUSES = new Set(['sold', 'closed', 'retired']);
const isOperatingFleet = (status: string) => !RETIRED_STATUSES.has(status.toLowerCase().trim());

function computeRentalDays(
  pickupIso: string | null,
  dropoffIso: string | null,
  rentalDaysFallback: number | null,
  rentalDaysCountFallback: number,
): number {
  if (pickupIso && dropoffIso) {
    const days = Math.ceil(
      (new Date(dropoffIso).getTime() - new Date(pickupIso).getTime()) / MS_PER_DAY,
    );
    if (days > 0) return days;
  }
  return rentalDaysFallback ?? rentalDaysCountFallback ?? 0;
}

/** Days of [pickup, dropoff) that fall inside [fromMs, toMs). */
function overlapDays(pickupIso: string, dropoffIso: string, fromMs: number, toMs: number): number {
  const start = Math.max(new Date(pickupIso).getTime(), fromMs);
  const end = Math.min(new Date(dropoffIso).getTime(), toMs);
  return end > start ? (end - start) / MS_PER_DAY : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const rate3 = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 1000 : 0);

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
}
function addQuarters(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n * 3, 1));
}
function quarterLabel(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

type ModelRow = { id: string; name: string; type: string | null };
type VehicleKind = 'scooter' | 'tuktuk' | 'other';

// `vehicle_models.type` is inconsistent in practice ('scooter' on the Beat V2,
// 'bike' on the Beat V3, null on the TVS TukTuk), so normalise it here.
function vehicleKind(model: ModelRow | undefined): VehicleKind {
  if (!model) return 'other';
  const type = (model.type ?? '').toLowerCase().trim();
  if (type === 'tuktuk') return 'tuktuk';
  if (type === 'scooter' || type === 'bike') return 'scooter';
  if (/tuk\s*tuk/i.test(`${model.id} ${model.name}`)) return 'tuktuk';
  return 'other';
}

// ── Query helpers ────────────────────────────────────────────────────────────

type StoreScope = { storeId: string | null; storeIds: string[] };

async function resolveStoreScope(req: Request): Promise<StoreScope> {
  const { storeId } = req.query as { storeId?: string };
  if (storeId && storeId !== 'all') return { storeId, storeIds: [storeId] };
  const stores = await req.app.locals.deps.configRepo.getStores('active');
  return {
    storeId: null,
    storeIds: stores.filter((s: { id: string }) => s.id !== 'company').map((s: { id: string }) => s.id),
  };
}

function inScope<Q>(query: Q, scope: StoreScope): Q {
  return (query as unknown as { in: (column: string, values: string[]) => Q }).in('store_id', scope.storeIds);
}

type PageQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

// PostgREST caps a single response at 1,000 rows, so any query that can grow past
// that (all-time order history in particular) must be paged or it silently truncates.
async function fetchAll<T>(makeQuery: () => PageQuery): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

function requireDashboard(req: Request): boolean {
  const user = (req as { user?: { permissions?: string[] } }).user;
  return Boolean(user?.permissions?.includes(Permission.ViewDashboard));
}

const FORBIDDEN = { success: false, error: { code: 'FORBIDDEN', message: 'Requires ViewDashboard permission' } };

// ── GET / — Business analytics metrics ───────────────────────────────────────
// Query params:
//   storeId  — specific store or omit/all for combined
//   days     — lookback window in days (default 30, max 365)

router.get('/', async (req, res, next) => {
  try {
    if (!requireDashboard(req)) { res.status(403).json(FORBIDDEN); return; }

    const days = Math.min(Math.max(parseInt((req.query.days as string) ?? '30', 10) || 30, 1), 365);
    const now = new Date();
    const toMs = now.getTime();
    const fromMs = toMs - days * MS_PER_DAY;
    const from = new Date(fromMs).toISOString();
    const to = now.toISOString();

    const sb = getSupabaseClient();
    const scope = await resolveStoreScope(req);

    type FleetRow = { id: string; store_id: string; model_id: string | null; status: string };
    type OrderItemRow = {
      id: string; vehicle_id: string | null; vehicle_model_id: string | null;
      rental_days: number | null; rental_days_count: number;
      daily_rate: number | null; rental_rate: number;
      pickup_datetime: string; dropoff_datetime: string;
      original_dropoff_datetime: string | null; order_id: string;
    };
    type OrderRow = { id: string; status: string; customer_id: string | null };
    type BookingRow = { id: string; status: string; pickup_datetime: string | null; created_at: string };
    type RentalBookingRow = {
      id: string; pickup_datetime: string; dropoff_datetime: string;
      vehicle_model_id: string | null; partner_ref: string | null;
    };
    type AddonRow = { order_id: string };
    type WaiverRow = { referral_source: string | null };
    type PartnerRow = { id: string; name: string; slug: string };
    type DemandMissRow = {
      vehicle_model_id: string; source: 'website' | 'partner_portal' | 'walk_in';
      pickup_datetime: string | null; dropoff_datetime: string | null;
    };

    const [
      fleet, vehicleModels, rentalItems, ordersPlaced, bookingsPlaced,
      rentalBookings, addons, waivers, partners, demandMisses, firstDemandMiss,
    ] = await Promise.all([
      fetchAll<FleetRow>(() => inScope(sb.from('fleet').select('id, store_id, model_id, status'), scope).order('id')),
      fetchAll<ModelRow>(() => sb.from('vehicle_models').select('id, name, type').order('id')),
      // Every live rental that overlaps the window — including ones booked before it
      // or picked up before it — so utilisation reflects bikes actually out on hire.
      fetchAll<OrderItemRow>(() => inScope(
        sb.from('order_items')
          .select('id, vehicle_id, vehicle_model_id, rental_days, rental_days_count, daily_rate, rental_rate, pickup_datetime, dropoff_datetime, original_dropoff_datetime, order_id, orders!inner(status)')
          .in('orders.status', LIVE_ORDER_STATUSES)
          .lt('pickup_datetime', to)
          .gt('dropoff_datetime', from),
        scope,
      ).order('id')),
      fetchAll<OrderRow>(() => inScope(
        sb.from('orders').select('id, status, customer_id').gte('created_at', from).lte('created_at', to),
        scope,
      ).order('id')),
      // Every booking request placed in the window, cancelled ones included —
      // cancellations only ever live on orders_raw, never on orders.
      fetchAll<BookingRow>(() => inScope(
        sb.from('orders_raw').select('id, status, pickup_datetime, created_at').gte('created_at', from).lte('created_at', to),
        scope,
      ).order('id')),
      fetchAll<RentalBookingRow>(() => inScope(
        sb.from('orders_raw')
          .select('id, pickup_datetime, dropoff_datetime, vehicle_model_id, partner_ref')
          .neq('status', 'cancelled')
          .lt('pickup_datetime', to)
          .gt('dropoff_datetime', from),
        scope,
      ).order('id')),
      fetchAll<AddonRow>(() => inScope(
        sb.from('order_addons').select('order_id').gte('added_at', from).lte('added_at', to),
        scope,
      ).order('order_id')),
      fetchAll<WaiverRow>(() => inScope(
        sb.from('waivers').select('referral_source').eq('status', 'signed').gte('created_at', from).lte('created_at', to),
        scope,
      ).order('id')),
      fetchAll<PartnerRow>(() => inScope(
        sb.from('accommodation_partners').select('id, name, slug').eq('active', true).eq('status', 'active'),
        scope,
      ).order('id')),
      fetchAll<DemandMissRow>(() => inScope(
        sb.from('demand_misses')
          .select('vehicle_model_id, source, pickup_datetime, dropoff_datetime')
          .gte('created_at', from)
          .lte('created_at', to),
        scope,
      ).order('id')),
      inScope(sb.from('demand_misses').select('created_at'), scope).order('created_at').limit(1),
    ]);
    if (firstDemandMiss.error) throw new Error(firstDemandMiss.error.message);

    // ── Vehicle model lookups (all models — retired ones still need a name) ──
    const modelById = new Map<string, ModelRow>(vehicleModels.map((m) => [m.id, m]));
    const modelName = (id: string) => modelById.get(id)?.name ?? id;

    // ── Fleet size per model (owned units, not just currently-idle ones) ────
    const fleetSizeByModel = new Map<string, number>();
    // `order_items.vehicle_model_id` is essentially never populated by the
    // booking flow — every real row carries `vehicle_id` instead. Resolve the
    // model through the fleet unit so per-model metrics aren't silently zeroed.
    const fleetModelById = new Map<string, string>();
    for (const unit of fleet) {
      if (unit.model_id) fleetModelById.set(unit.id, unit.model_id);
      if (!unit.model_id || !isOperatingFleet(unit.status)) continue;
      fleetSizeByModel.set(unit.model_id, (fleetSizeByModel.get(unit.model_id) ?? 0) + 1);
    }
    const resolveModelId = (item: { vehicle_model_id: string | null; vehicle_id: string | null }) =>
      item.vehicle_model_id ?? (item.vehicle_id ? fleetModelById.get(item.vehicle_id) ?? null : null);

    // ── Per-model aggregations ────────────────────────────────────────────────
    // Rental-days and revenue count only the part of each rental inside the window.
    // Rental counts, durations and extensions count rentals *picked up* in the window.
    const modelStats = new Map<string, {
      rentalDaysUsed: number; rentalRevenue: number;
      totalItems: number; extendedItems: number; durationSum: number;
    }>();

    for (const item of rentalItems) {
      const modelId = resolveModelId(item);
      if (!modelId) continue;
      const stats = modelStats.get(modelId)
        ?? { rentalDaysUsed: 0, rentalRevenue: 0, totalItems: 0, extendedItems: 0, durationSum: 0 };

      const daysInWindow = overlapDays(item.pickup_datetime, item.dropoff_datetime, fromMs, toMs);
      stats.rentalDaysUsed += daysInWindow;
      stats.rentalRevenue += (item.daily_rate ?? item.rental_rate ?? 0) * daysInWindow;

      if (new Date(item.pickup_datetime).getTime() >= fromMs) {
        stats.totalItems += 1;
        stats.durationSum += computeRentalDays(item.pickup_datetime, item.dropoff_datetime, item.rental_days, item.rental_days_count);
        const extended = item.original_dropoff_datetime != null
          && new Date(item.dropoff_datetime) > new Date(item.original_dropoff_datetime);
        if (extended) stats.extendedItems += 1;
      }
      modelStats.set(modelId, stats);
    }

    const TARGET_UTILISATION = 0.80;
    const byModel = Array.from(new Set([...fleetSizeByModel.keys(), ...modelStats.keys()]))
      .map((modelId) => {
        const currentFleetSize = fleetSizeByModel.get(modelId) ?? 0;
        const s = modelStats.get(modelId);
        const rentalDaysUsed = s?.rentalDaysUsed ?? 0;
        const totalItems = s?.totalItems ?? 0;
        const availableFleetDays = currentFleetSize * days;
        const recommendedFleetSize = rentalDaysUsed > 0
          ? Math.ceil(rentalDaysUsed / (days * TARGET_UTILISATION))
          : currentFleetSize;
        return {
          modelId,
          modelName: modelName(modelId),
          currentFleetSize,
          rentalDaysUsed: round1(rentalDaysUsed),
          availableFleetDays,
          utilisationRate: rate3(rentalDaysUsed, availableFleetDays),
          recommendedFleetSize,
          fleetDelta: recommendedFleetSize - currentFleetSize,
          avgRentalDuration: totalItems > 0 ? round1(s!.durationSum / totalItems) : 0,
          revPAB: availableFleetDays > 0 ? Math.round(((s?.rentalRevenue ?? 0) / availableFleetDays) * 100) / 100 : 0,
          extensionRate: rate3(s?.extendedItems ?? 0, totalItems),
          totalRentals: totalItems,
        };
      })
      .filter((m) => m.currentFleetSize > 0 || m.totalRentals > 0)
      .sort((a, b) => b.totalRentals - a.totalRentals);

    // ── Overall fleet metrics ─────────────────────────────────────────────────
    const allStats = Array.from(modelStats.values());
    const totalFleetDays = Array.from(fleetSizeByModel.values()).reduce((s, c) => s + c * days, 0);
    const totalRentalDaysUsed = allStats.reduce((s, m) => s + m.rentalDaysUsed, 0);
    const totalRevenue = allStats.reduce((s, m) => s + m.rentalRevenue, 0);
    const totalRentals = allStats.reduce((s, m) => s + m.totalItems, 0);
    const totalExtended = allStats.reduce((s, m) => s + m.extendedItems, 0);

    const cancelledBookings = bookingsPlaced.filter((b) => b.status === 'cancelled').length;

    // ── Booking patterns ──────────────────────────────────────────────────────

    // Walk-in share — self-reported by the customer on the rental waiver.
    // `orders_raw.booking_channel` only records which internal tool created the
    // booking (virtually always 'direct'), so it can't distinguish walk-ins.
    const walkInResponses = waivers.filter((w) => w.referral_source).length;
    const walkInCount = waivers.filter((w) => w.referral_source === 'walk_in').length;

    // Lead time buckets (days from booking to pickup)
    const leadTimeBuckets = { same_day: 0, one_to_three: 0, four_to_seven: 0, seven_plus: 0 };
    for (const b of bookingsPlaced) {
      if (b.status === 'cancelled' || !b.pickup_datetime) continue;
      const leadDays = (new Date(b.pickup_datetime).getTime() - new Date(b.created_at).getTime()) / MS_PER_DAY;
      if (leadDays < 1) leadTimeBuckets.same_day++;
      else if (leadDays <= 3) leadTimeBuckets.one_to_three++;
      else if (leadDays <= 7) leadTimeBuckets.four_to_seven++;
      else leadTimeBuckets.seven_plus++;
    }

    // Add-on attach rate
    const liveOrderIds = new Set(
      ordersPlaced.filter((o) => LIVE_ORDER_STATUSES.includes(o.status)).map((o) => o.id),
    );
    const ordersWithAddons = new Set(addons.map((a) => a.order_id).filter((id) => liveOrderIds.has(id)));

    // Repeat customer rate
    const periodCustomerIds = Array.from(
      new Set(
        ordersPlaced
          .filter((o) => o.status !== 'cancelled' && o.customer_id)
          .map((o) => o.customer_id as string),
      ),
    );

    let returningCustomers = 0;
    if (periodCustomerIds.length > 0) {
      let priorOrdersQ = sb.from('orders').select('customer_id').lt('created_at', from).neq('status', 'cancelled').in('customer_id', periodCustomerIds);
      if (scope.storeId) priorOrdersQ = priorOrdersQ.eq('store_id', scope.storeId);
      const { data: priorRows, error: priorErr } = await priorOrdersQ;
      if (priorErr) throw new Error(priorErr.message);
      returningCustomers = new Set((priorRows ?? []).map((r) => r.customer_id as string)).size;
    }

    // ── Affiliate attribution ────────────────────────────────────────────────
    // `orders_raw.partner_ref` (the partner's slug) links a booking to an
    // accommodation_partners row and is reliably populated, as is
    // `orders_raw.vehicle_model_id`. Units needed per day = rental-days inside the
    // window ÷ window length, so it's comparable with fleet utilisation.
    const partnerBySlug = new Map<string, PartnerRow>(partners.map((p) => [p.slug, p]));
    const partnerStats = new Map<string, {
      partnerId: string; partnerName: string; slug: string;
      bookings: number; scooterDays: number; tuktukDays: number;
    }>();

    let attributedBookings = 0;
    for (const b of rentalBookings) {
      const partner = b.partner_ref ? partnerBySlug.get(b.partner_ref) : undefined;
      if (!partner) continue; // unattributed / retired / unknown ref — not shown

      attributedBookings++;
      const stats = partnerStats.get(partner.id) ?? {
        partnerId: partner.id, partnerName: partner.name, slug: partner.slug,
        bookings: 0, scooterDays: 0, tuktukDays: 0,
      };
      stats.bookings += 1;
      const kind = vehicleKind(b.vehicle_model_id ? modelById.get(b.vehicle_model_id) : undefined);
      const d = overlapDays(b.pickup_datetime, b.dropoff_datetime, fromMs, toMs);
      if (kind === 'scooter') stats.scooterDays += d;
      else if (kind === 'tuktuk') stats.tuktukDays += d;
      partnerStats.set(partner.id, stats);
    }

    const MIN_BOOKINGS_FOR_DAILY_AVG = 5;
    const byPartner = Array.from(partnerStats.values())
      .map((p) => ({
        partnerId: p.partnerId,
        partnerName: p.partnerName,
        slug: p.slug,
        bookings: p.bookings,
        // Below the volume threshold, a "units/day" average is more noise than
        // signal — surface the raw day counts instead.
        scooterAvgPerDay: p.bookings >= MIN_BOOKINGS_FOR_DAILY_AVG ? Math.round((p.scooterDays / days) * 100) / 100 : null,
        tuktukAvgPerDay: p.bookings >= MIN_BOOKINGS_FOR_DAILY_AVG ? Math.round((p.tuktukDays / days) * 100) / 100 : null,
        scooterDays: round1(p.scooterDays),
        tuktukDays: round1(p.tuktukDays),
      }))
      .sort((a, b) => b.bookings - a.bookings);

    // ── Demand we couldn't serve ─────────────────────────────────────────────
    const missesByModel = new Map<string, { website: number; partnerPortal: number; walkIn: number; requestedDays: number }>();
    for (const m of demandMisses) {
      const row = missesByModel.get(m.vehicle_model_id) ?? { website: 0, partnerPortal: 0, walkIn: 0, requestedDays: 0 };
      if (m.source === 'website') row.website++;
      else if (m.source === 'partner_portal') row.partnerPortal++;
      else row.walkIn++;
      if (m.pickup_datetime && m.dropoff_datetime) {
        row.requestedDays += computeRentalDays(m.pickup_datetime, m.dropoff_datetime, null, 0);
      }
      missesByModel.set(m.vehicle_model_id, row);
    }
    const demandByModel = Array.from(missesByModel.entries())
      .map(([modelId, r]) => ({
        modelId,
        modelName: modelName(modelId),
        ...r,
        total: r.website + r.partnerPortal + r.walkIn,
      }))
      .sort((a, b) => b.total - a.total);
    const firstMissAt = (firstDemandMiss.data?.[0] as { created_at: string } | undefined)?.created_at ?? null;

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
      success: true,
      data: {
        period: { days, from, to },
        fleet: {
          byModel,
          overall: {
            utilisationRate: rate3(totalRentalDaysUsed, totalFleetDays),
            revPAB: totalFleetDays > 0 ? Math.round((totalRevenue / totalFleetDays) * 100) / 100 : 0,
            extensionRate: rate3(totalExtended, totalRentals),
            cancellationRate: rate3(cancelledBookings, bookingsPlaced.length),
            cancelledBookings,
            bookingsPlaced: bookingsPlaced.length,
            totalRentals,
          },
        },
        bookings: {
          leadTimeBuckets,
          addonAttachRate: rate3(ordersWithAddons.size, liveOrderIds.size),
          repeatCustomerRate: rate3(returningCustomers, periodCustomerIds.length),
          totalUniqueCustomers: periodCustomerIds.length,
          returningCustomers,
          walkInShare: rate3(walkInCount, walkInResponses),
          walkInResponses,
        },
        affiliates: {
          totalBookings: rentalBookings.length,
          attributedBookings,
          attributedSharePct: rate3(attributedBookings, rentalBookings.length),
          minBookingsForDailyAvg: MIN_BOOKINGS_FOR_DAILY_AVG,
          byPartner,
        },
        unmetDemand: {
          trackingSince: firstMissAt,
          total: demandMisses.length,
          website: demandMisses.filter((m) => m.source === 'website').length,
          partnerPortal: demandMisses.filter((m) => m.source === 'partner_portal').length,
          walkIn: demandMisses.filter((m) => m.source === 'walk_in').length,
          byModel: demandByModel,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /fleet-forecast — quarterly fleet-sizing projection ─────────────────
// Uses the same "target utilisation" idea as the main endpoint, but per
// calendar quarter, and adds a next-quarter projection based on the trailing
// quarters' demand. Historical quarters are sized against *today's* fleet
// (we don't have historical fleet-composition snapshots), so this measures
// "would today's fleet have kept up with that quarter's demand", not a true
// point-in-time utilisation. With only a handful of quarters of clean data,
// this is a trend projection, not a seasonal forecast — confidence is capped
// at "medium" until at least 3 fully-elapsed quarters of history exist.
router.get('/fleet-forecast', async (req, res, next) => {
  try {
    if (!requireDashboard(req)) { res.status(403).json(FORBIDDEN); return; }

    const sb = getSupabaseClient();
    const scope = await resolveStoreScope(req);

    const MAX_QUARTERS = 8;
    const TARGET_LOW = 0.70;
    const TARGET_MID = 0.75;
    const TARGET_HIGH = 0.80;

    type FleetRow = { id: string; model_id: string | null; status: string };
    type ItemRow = {
      vehicle_id: string | null; vehicle_model_id: string | null;
      pickup_datetime: string; dropoff_datetime: string | null;
      rental_days: number | null; rental_days_count: number;
    };

    const [fleet, vehicleModels, items] = await Promise.all([
      fetchAll<FleetRow>(() => inScope(sb.from('fleet').select('id, model_id, status'), scope).order('id')),
      fetchAll<ModelRow>(() => sb.from('vehicle_models').select('id, name, type').order('id')),
      fetchAll<ItemRow>(() => inScope(
        sb.from('order_items')
          .select('vehicle_id, vehicle_model_id, pickup_datetime, dropoff_datetime, rental_days, rental_days_count, orders!inner(status)')
          .in('orders.status', LIVE_ORDER_STATUSES)
          .not('pickup_datetime', 'is', null),
        scope,
      ).order('id')),
    ]);

    const modelMap = new Map(vehicleModels.map((m) => [m.id, m.name]));

    const fleetModelById = new Map<string, string>();
    const fleetSizeByModel = new Map<string, number>();
    for (const unit of fleet) {
      if (unit.model_id) fleetModelById.set(unit.id, unit.model_id);
      if (!unit.model_id || !isOperatingFleet(unit.status)) continue;
      fleetSizeByModel.set(unit.model_id, (fleetSizeByModel.get(unit.model_id) ?? 0) + 1);
    }

    function resolveModelId(item: { vehicle_model_id: string | null; vehicle_id: string | null }): string | null {
      return item.vehicle_model_id ?? (item.vehicle_id ? fleetModelById.get(item.vehicle_id) ?? null : null);
    }

    if (items.length === 0) {
      res.json({ success: true, data: { fleetSizeBasis: 'current', target: { low: TARGET_LOW, mid: TARGET_MID, high: TARGET_HIGH }, quarters: [], projection: null } });
      return;
    }

    const now = new Date();
    const earliestPickupMs = items.reduce(
      (min, i) => Math.min(min, new Date(i.pickup_datetime).getTime()),
      Date.now(),
    );
    const firstQuarterStart = quarterStart(new Date(earliestPickupMs));
    const currentQuarterStart = quarterStart(now);

    const allQuarterStarts: Date[] = [];
    for (let cursor = firstQuarterStart; cursor.getTime() <= currentQuarterStart.getTime(); cursor = addQuarters(cursor, 1)) {
      allQuarterStarts.push(cursor);
    }
    const quarterStarts = allQuarterStarts.slice(-MAX_QUARTERS);

    function fleetRangeFor(rentalDaysUsed: number, elapsedDays: number, currentFleetSize: number) {
      if (elapsedDays <= 0 || rentalDaysUsed <= 0) {
        return { low: currentFleetSize, mid: currentFleetSize, high: currentFleetSize };
      }
      const low = Math.ceil(rentalDaysUsed / (elapsedDays * TARGET_HIGH));
      const mid = Math.ceil(rentalDaysUsed / (elapsedDays * TARGET_MID));
      const high = Math.max(Math.floor(rentalDaysUsed / (elapsedDays * TARGET_LOW)), low);
      return { low, mid, high };
    }

    const quarters = quarterStarts.map((qStart) => {
      const qEndExclusive = addQuarters(qStart, 1);
      const isCurrentQuarter = qStart.getTime() === currentQuarterStart.getTime();
      const windowEnd = isCurrentQuarter ? now : qEndExclusive;
      const elapsedDays = Math.max(1, Math.round((windowEnd.getTime() - qStart.getTime()) / MS_PER_DAY));

      const modelDayTotals = new Map<string, number>();
      for (const item of items) {
        const pickupMs = new Date(item.pickup_datetime).getTime();
        if (pickupMs < qStart.getTime() || pickupMs >= qEndExclusive.getTime()) continue;
        const modelId = resolveModelId(item);
        if (!modelId) continue;
        const d = computeRentalDays(item.pickup_datetime, item.dropoff_datetime, item.rental_days, item.rental_days_count);
        modelDayTotals.set(modelId, (modelDayTotals.get(modelId) ?? 0) + d);
      }

      const allModelIds = new Set([...fleetSizeByModel.keys(), ...modelDayTotals.keys()]);
      const byModel = Array.from(allModelIds).map((modelId) => {
        const currentFleetSize = fleetSizeByModel.get(modelId) ?? 0;
        const rentalDaysUsed = modelDayTotals.get(modelId) ?? 0;
        const utilisationRate = currentFleetSize > 0
          ? Math.round((rentalDaysUsed / (currentFleetSize * elapsedDays)) * 1000) / 1000
          : 0;
        const perDay = Math.round((rentalDaysUsed / elapsedDays) * 100) / 100;
        return {
          modelId,
          modelName: modelMap.get(modelId) ?? modelId,
          currentFleetSize,
          rentalDaysUsed,
          elapsedDays,
          utilisationRate,
          perDay,
          recommendedFleetRange: fleetRangeFor(rentalDaysUsed, elapsedDays, currentFleetSize),
        };
      });

      return {
        label: quarterLabel(qStart),
        start: qStart.toISOString(),
        end: qEndExclusive.toISOString(),
        isCurrentQuarter,
        elapsedDays,
        byModel,
      };
    });

    // ── Next-quarter projection — average daily demand over the trailing
    // quarters (including the current, partial one), extended flat across a
    // standard ~91-day quarter. No seasonality — see caveat above.
    const trendWindow = quarters.slice(-3);
    const modelIdsForProjection = new Set<string>();
    quarters.forEach((q) => q.byModel.forEach((m) => modelIdsForProjection.add(m.modelId)));

    const NEXT_QUARTER_DAYS = 91;
    const projectionByModel = Array.from(modelIdsForProjection).map((modelId) => {
      const perDayValues = trendWindow
        .map((q) => q.byModel.find((m) => m.modelId === modelId)?.perDay)
        .filter((v): v is number => v !== undefined);
      const projectedPerDay = perDayValues.length > 0
        ? Math.round((perDayValues.reduce((s, v) => s + v, 0) / perDayValues.length) * 100) / 100
        : 0;
      const projectedRentalDays = Math.round(projectedPerDay * NEXT_QUARTER_DAYS);
      const currentFleetSize = fleetSizeByModel.get(modelId) ?? 0;
      return {
        modelId,
        modelName: modelMap.get(modelId) ?? modelId,
        currentFleetSize,
        projectedPerDay,
        projectedRentalDays,
        recommendedFleetRange: fleetRangeFor(projectedRentalDays, NEXT_QUARTER_DAYS, currentFleetSize),
      };
    });

    const fullyElapsedQuarterCount = quarters.filter((q) => !q.isCurrentQuarter).length;
    const confidence: 'low' | 'medium' = fullyElapsedQuarterCount >= 3 ? 'medium' : 'low';
    const nextQuarterStart = addQuarters(currentQuarterStart, 1);

    res.json({
      success: true,
      data: {
        fleetSizeBasis: 'current',
        target: { low: TARGET_LOW, mid: TARGET_MID, high: TARGET_HIGH },
        quarters,
        projection: {
          label: quarterLabel(nextQuarterStart),
          confidence,
          basedOnQuarters: trendWindow.map((q) => q.label),
          byModel: projectionByModel,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /confidence-report — quarterly issue-free / breakdown stats ─────────
// A rental is attributed to the quarter of its first pickup. It counts as
// "had an issue" if, at any point, it has an accident report, a breakdown
// report (other than user error), or a vehicle swap categorised as a vehicle
// fault. Swaps matter because before breakdown reports existed (Oct 2026),
// a mid-rental fault was only ever recorded as the reason for a swap.
// Event counts (accidents, breakdowns) are bucketed by when they happened.
router.get('/confidence-report', async (req, res, next) => {
  try {
    if (!requireDashboard(req)) { res.status(403).json(FORBIDDEN); return; }

    const sb = getSupabaseClient();
    const scope = await resolveStoreScope(req);
    const MAX_QUARTERS = 8;

    type ItemRow = { order_id: string; pickup_datetime: string; orders: { customer_id: string | null } | null };
    type AccidentRow = { order_id: string; accident_at: string | null };
    type BreakdownRow = { order_id: string; breakdown_at: string | null; issue_type: string; resolved_at: string | null };
    type SwapRow = { order_id: string; swap_date: string; swap_time: string | null };

    const [items, accidentRows, breakdownRows, faultSwaps] = await Promise.all([
      fetchAll<ItemRow>(() => inScope(
        sb.from('order_items')
          .select('order_id, pickup_datetime, orders!inner(status, customer_id)')
          .in('orders.status', LIVE_ORDER_STATUSES)
          .not('pickup_datetime', 'is', null),
        scope,
      ).order('id')),
      fetchAll<AccidentRow>(() => inScope(sb.from('accident_reports').select('order_id, accident_at'), scope).order('id')),
      fetchAll<BreakdownRow>(() => inScope(
        sb.from('breakdown_reports').select('order_id, breakdown_at, issue_type, resolved_at'),
        scope,
      ).order('id')),
      fetchAll<SwapRow>(() => inScope(
        sb.from('vehicle_swaps').select('order_id, swap_date, swap_time').eq('reason_category', 'vehicle_fault'),
        scope,
      ).order('id')),
    ]);

    const accidents = accidentRows
      .filter((a) => a.accident_at)
      .map((a) => ({ orderId: a.order_id, atMs: new Date(a.accident_at as string).getTime() }));
    const breakdowns = breakdownRows
      .filter((b) => b.breakdown_at)
      .map((b) => ({ ...b, atMs: new Date(b.breakdown_at as string).getTime() }));
    // swap_date / swap_time are Manila wall-clock values.
    const swaps = faultSwaps.map((s) => ({
      orderId: s.order_id,
      atMs: new Date(`${s.swap_date}T${(s.swap_time ?? '12:00:00').slice(0, 8)}+08:00`).getTime(),
    }));

    const rentalByOrder = new Map<string, { pickupMs: number; customerId: string | null }>();
    for (const item of items) {
      const ms = new Date(item.pickup_datetime).getTime();
      const prev = rentalByOrder.get(item.order_id);
      if (!prev || ms < prev.pickupMs) {
        rentalByOrder.set(item.order_id, { pickupMs: ms, customerId: item.orders?.customer_id ?? null });
      }
    }

    const breakdownOrderIds = new Set(breakdowns.map((b) => b.order_id));
    const issueOrderIds = new Set([
      ...accidents.map((a) => a.orderId),
      ...breakdowns.filter((b) => b.issue_type !== 'user_error').map((b) => b.order_id),
      ...swaps.map((s) => s.orderId),
    ]);

    const now = new Date();
    const currentQuarterStart = quarterStart(now);
    const earliestMs = [
      ...Array.from(rentalByOrder.values()).map((r) => r.pickupMs),
      ...accidents.map((a) => a.atMs),
      ...breakdowns.map((b) => b.atMs),
    ];
    const firstQuarterStart = earliestMs.length > 0
      ? quarterStart(new Date(Math.min(...earliestMs)))
      : currentQuarterStart;

    const allQuarterStarts: Date[] = [];
    for (let cursor = firstQuarterStart; cursor.getTime() <= currentQuarterStart.getTime(); cursor = addQuarters(cursor, 1)) {
      allQuarterStarts.push(cursor);
    }
    const quarterStarts = allQuarterStarts.slice(-MAX_QUARTERS);

    const ISSUE_TYPES = ['flat_tyre', 'flat_battery', 'engine_mechanical', 'electrical', 'user_error', 'other'] as const;

    const quarters = quarterStarts.map((qStart) => {
      const qStartMs = qStart.getTime();
      const qEndMs = addQuarters(qStart, 1).getTime();
      const inQuarter = (ms: number) => ms >= qStartMs && ms < qEndMs;

      const rentalOrderIds: string[] = [];
      const customerKeys = new Set<string>();
      for (const [orderId, r] of rentalByOrder) {
        if (!inQuarter(r.pickupMs)) continue;
        rentalOrderIds.push(orderId);
        customerKeys.add(r.customerId ?? `order:${orderId}`);
      }
      const affectedRentals = rentalOrderIds.filter((id) => issueOrderIds.has(id)).length;

      const issueTypeSplit: Record<(typeof ISSUE_TYPES)[number], number> = {
        flat_tyre: 0, flat_battery: 0, engine_mechanical: 0, electrical: 0, user_error: 0, other: 0,
      };
      const resolvedMinutes: number[] = [];
      let breakdownCount = 0;
      for (const b of breakdowns) {
        if (!inQuarter(b.atMs)) continue;
        breakdownCount += 1;
        const key = (ISSUE_TYPES as readonly string[]).includes(b.issue_type)
          ? (b.issue_type as (typeof ISSUE_TYPES)[number])
          : 'other';
        issueTypeSplit[key] += 1;
        if (b.resolved_at) {
          resolvedMinutes.push(Math.max(0, Math.round((new Date(b.resolved_at).getTime() - b.atMs) / 60000)));
        }
      }

      // Fault swaps on rentals that also have a breakdown report are the same
      // incident — only count the ones nobody wrote a report for.
      const unreportedFaultSwaps = swaps.filter((s) => inQuarter(s.atMs) && !breakdownOrderIds.has(s.orderId)).length;

      return {
        label: quarterLabel(qStart),
        start: qStart.toISOString(),
        end: new Date(qEndMs).toISOString(),
        isCurrentQuarter: qStartMs === currentQuarterStart.getTime(),
        totalRentals: rentalOrderIds.length,
        uniqueCustomers: customerKeys.size,
        affectedRentals,
        issueFreeRate: rentalOrderIds.length > 0
          ? Math.round((1 - affectedRentals / rentalOrderIds.length) * 1000) / 1000
          : 1,
        accidentCount: accidents.filter((a) => inQuarter(a.atMs)).length,
        breakdownCount,
        unreportedFaultSwaps,
        issueTypeSplit,
        avgResolutionMinutes: resolvedMinutes.length > 0
          ? Math.round(resolvedMinutes.reduce((s, v) => s + v, 0) / resolvedMinutes.length)
          : null,
        pctResolvedWithin30Min: resolvedMinutes.length > 0
          ? Math.round((resolvedMinutes.filter((m) => m <= 30).length / resolvedMinutes.length) * 1000) / 1000
          : null,
        resolvedBreakdowns: resolvedMinutes.length,
      };
    });

    res.json({ success: true, data: { quarters } });
  } catch (err) {
    next(err);
  }
});

export { router as analyticsRoutes };
