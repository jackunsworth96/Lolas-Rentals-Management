import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

// ── GET / — Business analytics metrics ───────────────────────────────────────
// Query params:
//   storeId  — specific store or omit/all for combined
//   days     — lookback window in days (default 30, max 365)

router.get('/', async (req, res, next) => {
  try {
    const user = (req as { user?: { permissions?: string[] } }).user;
    if (!user?.permissions?.includes(Permission.ViewDashboard)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Requires ViewDashboard permission' } });
      return;
    }

    const { storeId, days: daysParam } = req.query as { storeId?: string; days?: string };
    const days = Math.min(Math.max(parseInt(daysParam ?? '30', 10) || 30, 1), 365);

    const now = new Date();
    const from = new Date(now.getTime() - days * MS_PER_DAY).toISOString();
    const to = now.toISOString();
    const filterByStore = storeId && storeId !== 'all';

    const sb = getSupabaseClient();
    const activeStoreIds = filterByStore
      ? []
      : (await req.app.locals.deps.configRepo.getStores('active'))
          .filter((store: { id: string }) => store.id !== 'company')
          .map((store: { id: string }) => store.id);

    // ── Parallel fetches ──────────────────────────────────────────────────────

    let fleetQ = sb.from('fleet').select('id, store_id, model_id, status');
    if (filterByStore) fleetQ = fleetQ.eq('store_id', storeId);
    else fleetQ = fleetQ.in('store_id', activeStoreIds);

    let orderItemsQ = sb
      .from('order_items')
      .select(
        'id, vehicle_id, vehicle_model_id, rental_days, rental_days_count, daily_rate, rental_rate, pickup_datetime, dropoff_datetime, original_dropoff_datetime, order_id, store_id',
      )
      .gte('pickup_datetime', from)
      .lte('pickup_datetime', to);
    if (filterByStore) orderItemsQ = orderItemsQ.eq('store_id', storeId);
    else orderItemsQ = orderItemsQ.in('store_id', activeStoreIds);

    let ordersQ = sb
      .from('orders')
      .select('id, status, customer_id, store_id, created_at')
      .gte('created_at', from)
      .lte('created_at', to);
    if (filterByStore) ordersQ = ordersQ.eq('store_id', storeId);
    else ordersQ = ordersQ.in('store_id', activeStoreIds);

    let ordersRawQ = sb
      .from('orders_raw')
      .select('id, booking_channel, pickup_datetime, dropoff_datetime, created_at, status, store_id, vehicle_model_id, partner_ref')
      .gte('created_at', from)
      .lte('created_at', to)
      .neq('status', 'cancelled');
    if (filterByStore) ordersRawQ = ordersRawQ.eq('store_id', storeId);
    else ordersRawQ = ordersRawQ.in('store_id', activeStoreIds);

    let waiversQ = sb
      .from('waivers')
      .select('referral_source, store_id')
      .eq('status', 'signed')
      .gte('created_at', from)
      .lte('created_at', to);
    if (filterByStore) waiversQ = waiversQ.eq('store_id', storeId);
    else waiversQ = waiversQ.in('store_id', activeStoreIds);

    let partnersQ = sb
      .from('accommodation_partners')
      .select('id, name, slug, store_id')
      .eq('active', true)
      .eq('status', 'active');
    if (filterByStore) partnersQ = partnersQ.eq('store_id', storeId);
    else partnersQ = partnersQ.in('store_id', activeStoreIds);

    let addonsQ = sb
      .from('order_addons')
      .select('order_id, store_id')
      .gte('added_at', from)
      .lte('added_at', to);
    if (filterByStore) addonsQ = addonsQ.eq('store_id', storeId);
    else addonsQ = addonsQ.in('store_id', activeStoreIds);

    const [
      fleetRes,
      vehicleModelsRes,
      orderItemsRes,
      ordersRes,
      ordersRawRes,
      addonsRes,
      waiversRes,
      partnersRes,
    ] = await Promise.all([
      fleetQ,
      sb.from('vehicle_models').select('id, name, type').eq('is_active', true),
      orderItemsQ,
      ordersQ,
      ordersRawQ,
      addonsQ,
      waiversQ,
      partnersQ,
    ]);

    for (const r of [fleetRes, vehicleModelsRes, orderItemsRes, ordersRes, ordersRawRes, addonsRes, waiversRes, partnersRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    type FleetRow = { id: string; store_id: string; model_id: string | null; status: string };
    type ModelRow = { id: string; name: string; type: string | null };
    type OrderItemRow = {
      id: string; vehicle_id: string | null; vehicle_model_id: string | null;
      rental_days: number | null; rental_days_count: number;
      daily_rate: number | null; rental_rate: number;
      pickup_datetime: string | null; dropoff_datetime: string | null;
      original_dropoff_datetime: string | null; order_id: string; store_id: string;
    };
    type OrderRow = { id: string; status: string; customer_id: string | null; store_id: string; created_at: string };
    type OrderRawRow = {
      id: string; booking_channel: string | null; pickup_datetime: string | null; dropoff_datetime: string | null;
      created_at: string; status: string; store_id: string; vehicle_model_id: string | null; partner_ref: string | null;
    };
    type AddonRow = { order_id: string; store_id: string };
    type WaiverRow = { referral_source: string | null; store_id: string };
    type PartnerRow = { id: string; name: string; slug: string; store_id: string };

    const fleet = (fleetRes.data ?? []) as FleetRow[];
    const vehicleModels = (vehicleModelsRes.data ?? []) as ModelRow[];
    const orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
    const orders = (ordersRes.data ?? []) as OrderRow[];
    const ordersRaw = (ordersRawRes.data ?? []) as OrderRawRow[];
    const addons = (addonsRes.data ?? []) as AddonRow[];
    const waivers = (waiversRes.data ?? []) as WaiverRow[];
    const partners = (partnersRes.data ?? []) as PartnerRow[];

    // ── Fleet lifecycle — what counts as part of the operating fleet ─────────
    // `fleet.status` is a free-text label (e.g. "Available", "Active", "Sold",
    // "Closed", "Under Maintenance"). Only "Sold" and "Closed" mean the unit has
    // permanently left the business — everything else (including "Active", i.e.
    // currently out on a rental) is still an owned, working vehicle and must
    // count toward fleet size. Using "currently idle" as a proxy for "fleet
    // size" made utilisation swing with every checkout/return.
    const RETIRED_STATUSES = new Set(['sold', 'closed']);
    const isOperatingFleet = (status: string) => !RETIRED_STATUSES.has(status.toLowerCase().trim());

    // ── Vehicle model lookup ─────────────────────────────────────────────────
    const modelMap = new Map<string, string>(vehicleModels.map((m) => [m.id, m.name]));
    const modelTypeMap = new Map<string, string>(
      vehicleModels.filter((m) => m.type).map((m) => [m.id, m.type as string]),
    );

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

    function resolveModelId(item: { vehicle_model_id: string | null; vehicle_id: string | null }): string | null {
      return item.vehicle_model_id ?? (item.vehicle_id ? fleetModelById.get(item.vehicle_id) ?? null : null);
    }

    // ── Order items: filter to active/confirmed/completed via separate orders query
    // (order_items query above is not joined — we need to filter by order status)
    const activeOrderIds = new Set(
      orders.filter((o) => ['active', 'confirmed', 'completed'].includes(o.status)).map((o) => o.id),
    );
    const activeItems = orderItems.filter((i) => activeOrderIds.has(i.order_id));

    // ── Per-model aggregations ────────────────────────────────────────────────
    const modelStats = new Map<string, {
      rentalDaysUsed: number;
      rentalRevenue: number;
      totalItems: number;
      extendedItems: number;
      durationSum: number;
    }>();

    for (const item of activeItems) {
      const modelId = resolveModelId(item);
      if (!modelId) continue;

      const d = computeRentalDays(item.pickup_datetime, item.dropoff_datetime, item.rental_days, item.rental_days_count);
      const rate = item.daily_rate ?? item.rental_rate ?? 0;
      const revenue = rate * d;
      const isExtended =
        item.original_dropoff_datetime != null &&
        item.dropoff_datetime != null &&
        new Date(item.dropoff_datetime) > new Date(item.original_dropoff_datetime);

      const prev = modelStats.get(modelId) ?? { rentalDaysUsed: 0, rentalRevenue: 0, totalItems: 0, extendedItems: 0, durationSum: 0 };
      modelStats.set(modelId, {
        rentalDaysUsed: prev.rentalDaysUsed + d,
        rentalRevenue: prev.rentalRevenue + revenue,
        totalItems: prev.totalItems + 1,
        extendedItems: prev.extendedItems + (isExtended ? 1 : 0),
        durationSum: prev.durationSum + d,
      });
    }

    // ── Build per-model fleet metrics ─────────────────────────────────────────
    const allModelIds = new Set([...fleetSizeByModel.keys(), ...modelStats.keys()]);
    const TARGET_UTILISATION = 0.80;

    const byModel = Array.from(allModelIds)
      .map((modelId) => {
        const modelName = modelMap.get(modelId) ?? modelId;
        const currentFleetSize = fleetSizeByModel.get(modelId) ?? 0;
        const stats = modelStats.get(modelId);
        const rentalDaysUsed = stats?.rentalDaysUsed ?? 0;
        const rentalRevenue = stats?.rentalRevenue ?? 0;
        const totalItems = stats?.totalItems ?? 0;
        const extendedItems = stats?.extendedItems ?? 0;
        const availableFleetDays = currentFleetSize * days;
        const utilisationRate = availableFleetDays > 0 ? rentalDaysUsed / availableFleetDays : 0;
        const recommendedFleetSize = rentalDaysUsed > 0
          ? Math.ceil(rentalDaysUsed / (days * TARGET_UTILISATION))
          : currentFleetSize;
        const fleetDelta = recommendedFleetSize - currentFleetSize;
        const avgRentalDuration = totalItems > 0 ? Math.round((stats!.durationSum / totalItems) * 10) / 10 : 0;
        const revPAB = availableFleetDays > 0 ? Math.round((rentalRevenue / availableFleetDays) * 100) / 100 : 0;
        const extensionRate = totalItems > 0 ? Math.round((extendedItems / totalItems) * 1000) / 1000 : 0;

        return {
          modelId, modelName, currentFleetSize,
          rentalDaysUsed, availableFleetDays,
          utilisationRate: Math.round(utilisationRate * 1000) / 1000,
          recommendedFleetSize, fleetDelta,
          avgRentalDuration, revPAB, extensionRate,
          totalRentals: totalItems,
        };
      })
      .filter((m) => m.currentFleetSize > 0 || m.totalRentals > 0)
      .sort((a, b) => b.totalRentals - a.totalRentals);

    // ── Overall fleet metrics ─────────────────────────────────────────────────
    const totalActiveItems = activeItems.length;
    const totalFleetDays = Array.from(fleetSizeByModel.values()).reduce((s, c) => s + c * days, 0);
    const totalRentalDaysUsed = Array.from(modelStats.values()).reduce((s, m) => s + m.rentalDaysUsed, 0);
    const totalExtended = activeItems.filter(
      (i) => i.original_dropoff_datetime != null && i.dropoff_datetime != null && new Date(i.dropoff_datetime) > new Date(i.original_dropoff_datetime),
    ).length;
    const totalRevenue = Array.from(modelStats.values()).reduce((s, m) => s + m.rentalRevenue, 0);
    const overallUtilisation = totalFleetDays > 0 ? Math.round((totalRentalDaysUsed / totalFleetDays) * 1000) / 1000 : 0;
    const overallRevPAB = totalFleetDays > 0 ? Math.round((totalRevenue / totalFleetDays) * 100) / 100 : 0;
    const overallExtensionRate = totalActiveItems > 0 ? Math.round((totalExtended / totalActiveItems) * 1000) / 1000 : 0;

    const totalOrders = orders.length;
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;
    const cancellationRate = totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 1000) / 1000 : 0;

    // ── Booking patterns ──────────────────────────────────────────────────────

    // Channel split — system channel the booking was created through.
    // WooCommerce was retired (1 of 462 bookings ever recorded); legacy rows
    // are excluded rather than shown as a live channel.
    const channelCounts: Record<string, number> = { walk_in: 0, direct: 0 };
    for (const raw of ordersRaw) {
      const ch = raw.booking_channel ?? 'direct';
      if (ch !== 'walk_in' && ch !== 'direct') continue;
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
    }

    // Real walk-in share — self-reported by the customer on the rental waiver.
    // `booking_channel` above only reflects which internal tool staff used to
    // create the booking (almost every walk-in is keyed into the same "direct"
    // flow), so it dramatically undercounts actual walk-ins.
    const walkInResponses = waivers.filter((w) => w.referral_source).length;
    const walkInCount = waivers.filter((w) => w.referral_source === 'walk_in').length;
    const walkInShare = walkInResponses > 0 ? Math.round((walkInCount / walkInResponses) * 1000) / 1000 : 0;

    // Lead time buckets (days from booking to pickup)
    const leadTimeBuckets = { same_day: 0, one_to_three: 0, four_to_seven: 0, seven_plus: 0 };
    for (const raw of ordersRaw) {
      if (!raw.pickup_datetime) continue;
      const leadDays = (new Date(raw.pickup_datetime).getTime() - new Date(raw.created_at).getTime()) / MS_PER_DAY;
      if (leadDays < 1) leadTimeBuckets.same_day++;
      else if (leadDays <= 3) leadTimeBuckets.one_to_three++;
      else if (leadDays <= 7) leadTimeBuckets.four_to_seven++;
      else leadTimeBuckets.seven_plus++;
    }

    // Add-on attach rate
    const ordersWithAddons = new Set(addons.map((a) => a.order_id));
    const completedOrderIds = new Set(
      orders.filter((o) => ['active', 'confirmed', 'completed'].includes(o.status)).map((o) => o.id),
    );
    const addonAttachRate = completedOrderIds.size > 0
      ? Math.round(
          ([...ordersWithAddons].filter((id) => completedOrderIds.has(id)).length / completedOrderIds.size) * 1000,
        ) / 1000
      : 0;

    // Repeat customer rate
    const periodCustomerIds = Array.from(
      new Set(
        orders
          .filter((o) => o.status !== 'cancelled' && o.customer_id)
          .map((o) => o.customer_id as string),
      ),
    );

    let returningCustomers = 0;
    if (periodCustomerIds.length > 0) {
      const priorOrdersQ = filterByStore
        ? sb.from('orders').select('customer_id').eq('store_id', storeId).lt('created_at', from).neq('status', 'cancelled').in('customer_id', periodCustomerIds)
        : sb.from('orders').select('customer_id').lt('created_at', from).neq('status', 'cancelled').in('customer_id', periodCustomerIds);

      const { data: priorRows } = await priorOrdersQ;
      returningCustomers = new Set((priorRows ?? []).map((r) => r.customer_id as string)).size;
    }

    const repeatCustomerRate = periodCustomerIds.length > 0
      ? Math.round((returningCustomers / periodCustomerIds.length) * 1000) / 1000
      : 0;

    // ── Affiliate attribution ────────────────────────────────────────────────
    // `orders_raw.partner_ref` (the partner's slug) links a booking to an
    // accommodation_partners row. Unlike order_items.vehicle_model_id, this
    // column is reliably populated (~99.8% of recent bookings), so vehicle-type
    // demand per partner can be computed directly from orders_raw.
    const partnerBySlug = new Map<string, PartnerRow>(partners.map((p) => [p.slug, p]));

    function rentalDaysBetween(pickupIso: string | null, dropoffIso: string | null): number {
      if (!pickupIso || !dropoffIso) return 0;
      const d = Math.ceil((new Date(dropoffIso).getTime() - new Date(pickupIso).getTime()) / MS_PER_DAY);
      return d > 0 ? d : 0;
    }

    const partnerStats = new Map<string, {
      partnerId: string; partnerName: string; slug: string;
      bookings: number; scooterDays: number; tuktukDays: number; otherDays: number;
    }>();

    let attributedBookings = 0;
    for (const raw of ordersRaw) {
      if (!raw.partner_ref) continue;
      const partner = partnerBySlug.get(raw.partner_ref);
      if (!partner) continue; // unattributed / retired / unknown ref — not shown

      attributedBookings++;
      const prev = partnerStats.get(partner.id) ?? {
        partnerId: partner.id, partnerName: partner.name, slug: partner.slug,
        bookings: 0, scooterDays: 0, tuktukDays: 0, otherDays: 0,
      };
      prev.bookings += 1;

      const vehicleType = raw.vehicle_model_id ? modelTypeMap.get(raw.vehicle_model_id) : undefined;
      const rentalDays = rentalDaysBetween(raw.pickup_datetime, raw.dropoff_datetime);
      if (vehicleType === 'scooter') prev.scooterDays += rentalDays;
      else if (vehicleType === 'tuktuk') prev.tuktukDays += rentalDays;
      else prev.otherDays += rentalDays;

      partnerStats.set(partner.id, prev);
    }

    const MIN_BOOKINGS_FOR_DAILY_AVG = 5;
    const byPartner = Array.from(partnerStats.values())
      .map((p) => ({
        partnerId: p.partnerId,
        partnerName: p.partnerName,
        slug: p.slug,
        bookings: p.bookings,
        // Below the volume threshold, a "units/day" average is more noise than
        // signal (e.g. 1 booking/month rounds to ~0.03/day) — surface the raw
        // day counts instead and let the UI show counts, not a false-precision average.
        scooterAvgPerDay: p.bookings >= MIN_BOOKINGS_FOR_DAILY_AVG ? Math.round((p.scooterDays / days) * 100) / 100 : null,
        tuktukAvgPerDay: p.bookings >= MIN_BOOKINGS_FOR_DAILY_AVG ? Math.round((p.tuktukDays / days) * 100) / 100 : null,
        scooterDays: p.scooterDays,
        tuktukDays: p.tuktukDays,
      }))
      .sort((a, b) => b.bookings - a.bookings);

    const totalBookingsInPeriod = ordersRaw.length;
    const attributedSharePct = totalBookingsInPeriod > 0
      ? Math.round((attributedBookings / totalBookingsInPeriod) * 1000) / 1000
      : 0;

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
      success: true,
      data: {
        period: { days, from, to },
        fleet: {
          byModel,
          overall: {
            utilisationRate: overallUtilisation,
            revPAB: overallRevPAB,
            extensionRate: overallExtensionRate,
            cancellationRate,
            totalRentals: totalActiveItems,
          },
        },
        bookings: {
          channelSplit: channelCounts,
          leadTimeBuckets,
          addonAttachRate,
          repeatCustomerRate,
          totalUniqueCustomers: periodCustomerIds.length,
          returningCustomers,
          walkInShare,
          walkInResponses,
        },
        affiliates: {
          totalBookings: totalBookingsInPeriod,
          attributedBookings,
          attributedSharePct,
          minBookingsForDailyAvg: MIN_BOOKINGS_FOR_DAILY_AVG,
          byPartner,
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
    const user = (req as { user?: { permissions?: string[] } }).user;
    if (!user?.permissions?.includes(Permission.ViewDashboard)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Requires ViewDashboard permission' } });
      return;
    }

    const { storeId } = req.query as { storeId?: string };
    const filterByStore = storeId && storeId !== 'all';
    const sb = getSupabaseClient();
    const activeStoreIds = filterByStore
      ? []
      : (await req.app.locals.deps.configRepo.getStores('active'))
          .filter((store: { id: string }) => store.id !== 'company')
          .map((store: { id: string }) => store.id);

    const MAX_QUARTERS = 8;
    const TARGET_LOW = 0.70;
    const TARGET_MID = 0.75;
    const TARGET_HIGH = 0.80;

    let fleetQ = sb.from('fleet').select('id, store_id, model_id, status');
    if (filterByStore) fleetQ = fleetQ.eq('store_id', storeId);
    else fleetQ = fleetQ.in('store_id', activeStoreIds);

    let ordersQ = sb
      .from('orders')
      .select('id, store_id, status')
      .in('status', ['active', 'confirmed', 'completed']);
    if (filterByStore) ordersQ = ordersQ.eq('store_id', storeId);
    else ordersQ = ordersQ.in('store_id', activeStoreIds);

    let itemsQ = sb
      .from('order_items')
      .select('vehicle_id, vehicle_model_id, pickup_datetime, dropoff_datetime, rental_days, rental_days_count, order_id, store_id');
    if (filterByStore) itemsQ = itemsQ.eq('store_id', storeId);
    else itemsQ = itemsQ.in('store_id', activeStoreIds);

    const [fleetRes, vehicleModelsRes, ordersRes, itemsRes] = await Promise.all([
      fleetQ,
      sb.from('vehicle_models').select('id, name').eq('is_active', true),
      ordersQ,
      itemsQ,
    ]);
    for (const r of [fleetRes, vehicleModelsRes, ordersRes, itemsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    type FleetRow = { id: string; store_id: string; model_id: string | null; status: string };
    type ModelRow = { id: string; name: string };
    type ItemRow = {
      vehicle_id: string | null; vehicle_model_id: string | null;
      pickup_datetime: string | null; dropoff_datetime: string | null;
      rental_days: number | null; rental_days_count: number; order_id: string; store_id: string;
    };

    const fleet = (fleetRes.data ?? []) as FleetRow[];
    const vehicleModels = (vehicleModelsRes.data ?? []) as ModelRow[];
    const validOrderIds = new Set(((ordersRes.data ?? []) as Array<{ id: string }>).map((o) => o.id));
    const items = ((itemsRes.data ?? []) as ItemRow[]).filter(
      (i) => validOrderIds.has(i.order_id) && i.pickup_datetime,
    );

    const modelMap = new Map(vehicleModels.map((m) => [m.id, m.name]));

    const RETIRED_STATUSES = new Set(['sold', 'closed']);
    const isOperatingFleet = (status: string) => !RETIRED_STATUSES.has(status.toLowerCase().trim());
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
      (min, i) => Math.min(min, new Date(i.pickup_datetime as string).getTime()),
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
        const pickupMs = new Date(item.pickup_datetime as string).getTime();
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

export { router as analyticsRoutes };
