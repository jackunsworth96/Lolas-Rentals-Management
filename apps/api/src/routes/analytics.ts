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

    // ── Parallel fetches ──────────────────────────────────────────────────────

    let fleetQ = sb.from('fleet').select('id, store_id, model_id, status');
    if (filterByStore) fleetQ = fleetQ.eq('store_id', storeId);

    let orderItemsQ = sb
      .from('order_items')
      .select(
        'id, vehicle_model_id, rental_days, rental_days_count, daily_rate, rental_rate, pickup_datetime, dropoff_datetime, original_dropoff_datetime, order_id, store_id',
      )
      .gte('pickup_datetime', from)
      .lte('pickup_datetime', to);
    if (filterByStore) orderItemsQ = orderItemsQ.eq('store_id', storeId);

    let ordersQ = sb
      .from('orders')
      .select('id, status, customer_id, store_id, created_at')
      .gte('created_at', from)
      .lte('created_at', to);
    if (filterByStore) ordersQ = ordersQ.eq('store_id', storeId);

    let ordersRawQ = sb
      .from('orders_raw')
      .select('id, booking_channel, pickup_datetime, created_at, status, store_id')
      .gte('created_at', from)
      .lte('created_at', to)
      .neq('status', 'cancelled');
    if (filterByStore) ordersRawQ = ordersRawQ.eq('store_id', storeId);

    let addonsQ = sb
      .from('order_addons')
      .select('order_id, store_id')
      .gte('added_at', from)
      .lte('added_at', to);
    if (filterByStore) addonsQ = addonsQ.eq('store_id', storeId);

    const [
      fleetRes,
      fleetStatusesRes,
      vehicleModelsRes,
      orderItemsRes,
      ordersRes,
      ordersRawRes,
      addonsRes,
    ] = await Promise.all([
      fleetQ,
      sb.from('fleet_statuses').select('id, name, is_rentable'),
      sb.from('vehicle_models').select('id, name').eq('is_active', true),
      orderItemsQ,
      ordersQ,
      ordersRawQ,
      addonsQ,
    ]);

    for (const r of [fleetRes, fleetStatusesRes, vehicleModelsRes, orderItemsRes, ordersRes, ordersRawRes, addonsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    type FleetRow = { id: string; store_id: string; model_id: string | null; status: string };
    type FleetStatusRow = { id: string; name: string; is_rentable: boolean };
    type ModelRow = { id: string; name: string };
    type OrderItemRow = {
      id: string; vehicle_model_id: string | null;
      rental_days: number | null; rental_days_count: number;
      daily_rate: number | null; rental_rate: number;
      pickup_datetime: string | null; dropoff_datetime: string | null;
      original_dropoff_datetime: string | null; order_id: string; store_id: string;
    };
    type OrderRow = { id: string; status: string; customer_id: string | null; store_id: string; created_at: string };
    type OrderRawRow = { id: string; booking_channel: string | null; pickup_datetime: string | null; created_at: string; status: string; store_id: string };
    type AddonRow = { order_id: string; store_id: string };

    const fleet = (fleetRes.data ?? []) as FleetRow[];
    const fleetStatuses = (fleetStatusesRes.data ?? []) as FleetStatusRow[];
    const vehicleModels = (vehicleModelsRes.data ?? []) as ModelRow[];
    const orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
    const orders = (ordersRes.data ?? []) as OrderRow[];
    const ordersRaw = (ordersRawRes.data ?? []) as OrderRawRow[];
    const addons = (addonsRes.data ?? []) as AddonRow[];

    // ── Fleet statuses — determine what counts as "rentable" ─────────────────
    const rentableStatusIds = new Set(fleetStatuses.filter((s) => s.is_rentable).map((s) => s.id));
    const rentableStatusNames = new Set(fleetStatuses.filter((s) => s.is_rentable).map((s) => s.name));
    const isRentable = (status: string) => rentableStatusIds.has(status) || rentableStatusNames.has(status);

    // ── Vehicle model lookup ─────────────────────────────────────────────────
    const modelMap = new Map<string, string>(vehicleModels.map((m) => [m.id, m.name]));

    // ── Fleet size per model (rentable units only) ───────────────────────────
    const fleetSizeByModel = new Map<string, number>();
    for (const unit of fleet) {
      if (!unit.model_id || !isRentable(unit.status)) continue;
      fleetSizeByModel.set(unit.model_id, (fleetSizeByModel.get(unit.model_id) ?? 0) + 1);
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
      const modelId = item.vehicle_model_id;
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

    // Channel split
    const channelCounts: Record<string, number> = { walk_in: 0, direct: 0, woocommerce: 0 };
    for (const raw of ordersRaw) {
      const ch = raw.booking_channel ?? 'direct';
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
    }

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
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as analyticsRoutes };
