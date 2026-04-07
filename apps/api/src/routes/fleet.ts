import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vehicleToDto(v: any) {
  return {
    id: v.id,
    name: v.name,
    storeId: v.storeId,
    modelId: v.modelId,
    plateNumber: v.plateNumber,
    gpsId: v.gpsId,
    status: v.status,
    currentMileage: v.currentMileage,
    orcrExpiryDate: v.orcrExpiryDate,
    surfRack: v.surfRack,
  };
}

function vehicleToFullDto(v: ReturnType<typeof vehicleToDto> & Record<string, unknown>) {
  const vv = v as Record<string, unknown>;
  return {
    ...vehicleToDto(v as Parameters<typeof vehicleToDto>[0]),
    owner: vv.owner ?? null,
    rentableStartDate: vv.rentableStartDate ?? null,
    registrationDate: vv.registrationDate ?? null,
    purchasePrice: vv.purchasePrice ?? null,
    purchaseDate: vv.purchaseDate ?? null,
    setUpCosts: vv.setUpCosts ?? 0,
    totalBikeCost: vv.totalBikeCost ?? 0,
    usefulLifeMonths: vv.usefulLifeMonths ?? null,
    salvageValue: vv.salvageValue ?? 0,
    accumulatedDepreciation: vv.accumulatedDepreciation ?? 0,
    bookValue: vv.bookValue ?? 0,
    dateSold: vv.dateSold ?? null,
    soldPrice: vv.soldPrice ?? null,
    profitLoss: vv.profitLoss ?? null,
  };
}

router.get('/', requirePermission(Permission.ViewFleet), validateQuery(z.object({ storeId: z.string().optional() })), async (req, res, next) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const vehicles = !storeId || storeId === 'all'
      ? await req.app.locals.deps.fleetRepo.findAll()
      : await req.app.locals.deps.fleetRepo.findByStore(storeId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dtos = vehicles.map((v: any) => vehicleToDto(v));
    res.json({ success: true, data: dtos });
  } catch (err) { next(err); }
});

router.post('/sync', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const { syncFleetStatuses } = await import('../jobs/fleet-status-sync.js');
    await syncFleetStatuses();
    res.json({ success: true, data: { ok: true } });
  } catch (err) { next(err); }
});

router.get('/utilization', requirePermission(Permission.ViewFleet), validateQuery(z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.enum(['7d', '30d', '90d']).optional(),
  storeId: z.string().optional(),
})), async (req, res, next) => {
  try {
    const { getFleetUtilization } = await import('../use-cases/fleet/get-utilization.js');
    const { from, to, period, storeId } = req.query as { from?: string; to?: string; period?: string; storeId?: string };
    let fromDate: string;
    let toDate: string;
    const today = new Date().toISOString().slice(0, 10);
    if (from && to) {
      fromDate = from;
      toDate = to;
    } else if (period === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      fromDate = d.toISOString().slice(0, 10);
      toDate = today;
    } else if (period === '90d') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      fromDate = d.toISOString().slice(0, 10);
      toDate = today;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      fromDate = d.toISOString().slice(0, 10);
      toDate = today;
    }
    const result = await getFleetUtilization(fromDate, toDate, storeId, true);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/calendar', requirePermission(Permission.ViewFleet), validateQuery(z.object({
  storeId: z.string().optional(),
  from: z.string(),
  to: z.string(),
})), async (req, res, next) => {
  try {
    const { storeId, from, to } = req.query as { storeId?: string; from: string; to: string };
    const { supabase } = await import('../adapters/supabase/client.js');
    const sb = supabase;
    const now = new Date();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    // 1. Load fleet vehicles
    let fleetQuery = sb.from('fleet').select('id, name, model_id, plate_number, store_id, status').order('name');
    if (storeId && storeId !== 'all') fleetQuery = fleetQuery.eq('store_id', storeId);
    const { data: fleetRows, error: fleetErr } = await fleetQuery;
    if (fleetErr) throw new Error(`Fleet query failed: ${fleetErr.message}`);

    // 2. Load stores + models for name resolution
    const { data: storeRows } = await sb.from('stores').select('id, name');
    const storeMap = new Map((storeRows ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    const { data: modelRows } = await sb.from('vehicle_models').select('id, name');
    const modelMap = new Map((modelRows ?? []).map((m: { id: string; name: string }) => [m.id, m.name]));

    // 3. Load order_items overlapping [from, to]; orders loaded separately (see orderMap)
    const vehicleIds = (fleetRows ?? []).map((v: { id: string }) => v.id);
    type OrderItemRow = {
      id: string;
      order_id: string;
      vehicle_id: string;
      vehicle_name: string | null;
      pickup_datetime: string;
      dropoff_datetime: string;
    };
    let itemRows: OrderItemRow[] = [];
    if (vehicleIds.length > 0) {
      const { data, error } = await sb
        .from('order_items')
        .select('id, order_id, vehicle_id, vehicle_name, pickup_datetime, dropoff_datetime')
        .in('vehicle_id', vehicleIds)
        .lte('pickup_datetime', `${to}T23:59:59`)
        .gte('dropoff_datetime', `${from}T00:00:00`);
      if (error) throw new Error(`Order items query failed: ${error.message}`);
      itemRows = (data ?? []) as unknown as OrderItemRow[];
    }

    const orderIds = [...new Set(itemRows.map((i) => i.order_id))];

    const orderMap = new Map<string, {
      status: string;
      customer_id: string;
      raw_order_id: string | null;
    }>();

    if (orderIds.length > 0) {
      const { data: orderRows } = await sb
        .from('orders')
        .select('id, status, customer_id, raw_order_id')
        .in('id', orderIds);

      for (const o of (orderRows ?? []) as Array<{
        id: string;
        status: string;
        customer_id: string;
        raw_order_id: string | null;
      }>) {
        orderMap.set(o.id, {
          status: o.status,
          customer_id: o.customer_id,
          raw_order_id: o.raw_order_id,
        });
      }
    }

    const rawOrderIds = [...orderMap.values()]
      .map((o) => o.raw_order_id)
      .filter((id): id is string => Boolean(id));

    const refMap = new Map<string, string>();
    if (rawOrderIds.length > 0) {
      const { data: rawRows } = await sb
        .from('orders_raw')
        .select('id, order_reference')
        .in('id', rawOrderIds);
      for (const r of (rawRows ?? []) as Array<{
        id: string;
        order_reference: string | null;
      }>) {
        if (r.order_reference) refMap.set(r.id, r.order_reference);
      }
    }

    // Filter to relevant statuses
    itemRows = itemRows.filter((i) => {
      const s = orderMap.get(i.order_id)?.status;
      return s && !['cancelled', 'skipped'].includes(s);
    });

    // 4. Resolve customer names
    const customerIds = [...new Set(
      itemRows
        .map((i) => orderMap.get(i.order_id)?.customer_id)
        .filter((cid): cid is string => Boolean(cid)),
    )];
    const custMap = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: custRows } = await sb.from('customers').select('id, name').in('id', customerIds);
      for (const c of (custRows ?? []) as Array<{ id: string; name: string }>) custMap.set(c.id, c.name);
    }

    // 5. Build vehicle rows with bookings
    const itemsByVehicle = new Map<string, OrderItemRow[]>();
    for (const item of itemRows) {
      const list = itemsByVehicle.get(item.vehicle_id) ?? [];
      list.push(item);
      itemsByVehicle.set(item.vehicle_id, list);
    }

    const vehicles = (fleetRows ?? []).map((v: { id: string; name: string; model_id: string | null; plate_number: string | null; store_id: string; status: string }) => {
      const vItems = itemsByVehicle.get(v.id) ?? [];
      return {
        vehicleId: v.id,
        vehicleName: v.name,
        modelName: modelMap.get(v.model_id ?? '') ?? '—',
        plateNumber: v.plate_number,
        storeId: v.store_id,
        storeName: storeMap.get(v.store_id) ?? v.store_id,
        status: v.status,
        bookings: vItems.map((item) => {
          const orderStatus = orderMap.get(item.order_id)?.status ?? 'active';
          const custId = orderMap.get(item.order_id)?.customer_id;
          const dropoff = new Date(item.dropoff_datetime);
          let calStatus: string;
          if (orderStatus === 'active') {
            if (dropoff.getTime() < now.getTime()) calStatus = 'overdue';
            else if (dropoff.getTime() - now.getTime() <= TWO_HOURS_MS) calStatus = 'due-soon';
            else calStatus = 'active';
          } else if (orderStatus === 'completed') {
            calStatus = 'completed';
          } else {
            calStatus = 'confirmed';
          }
          return {
            orderId: item.order_id,
            orderItemId: item.id,
            orderReference: (() => {
              const rawId = orderMap.get(item.order_id)?.raw_order_id;
              return rawId ? (refMap.get(rawId) ?? null) : null;
            })(),
            customerName: custId ? (custMap.get(custId) ?? '—') : '—',
            pickupDatetime: item.pickup_datetime,
            dropoffDatetime: item.dropoff_datetime,
            status: calStatus,
          };
        }),
      };
    });

    // 6. Load unassigned bookings from orders_raw
    let rawQuery = sb
      .from('orders_raw')
      .select('id, order_reference, customer_name, vehicle_model_id, store_id, pickup_datetime, dropoff_datetime, status')
      .in('status', ['unprocessed', 'processed'])
      .lte('pickup_datetime', `${to}T23:59:59`)
      .gte('dropoff_datetime', `${from}T00:00:00`);
    if (storeId && storeId !== 'all') rawQuery = rawQuery.eq('store_id', storeId);
    const { data: rawRows, error: rawErr } = await rawQuery;
    if (rawErr) throw new Error(`orders_raw query failed: ${rawErr.message}`);

    const unassignedBookings = (rawRows ?? []).map((r: Record<string, unknown>) => ({
      rawOrderId: r.id as string,
      orderReference: r.order_reference as string | null,
      customerName: r.customer_name as string ?? '—',
      vehicleModelName: modelMap.get(r.vehicle_model_id as string) ?? '—',
      storeId: r.store_id as string,
      pickupDatetime: r.pickup_datetime as string,
      dropoffDatetime: r.dropoff_datetime as string,
      status: 'unprocessed' as const,
    }));

    res.json({
      success: true,
      data: { vehicles, unassignedBookings, dateRange: { from, to } },
    });
  } catch (err) { next(err); }
});

router.post('/', requirePermission(Permission.EditFleet), validateBody(z.object({
  name: z.string().min(1),
  modelId: z.string().nullable().optional(),
  plateNumber: z.string().nullable().optional(),
  storeId: z.string().min(1),
  gpsId: z.string().nullable().optional(),
  surfRack: z.boolean().optional(),
  rentableStartDate: z.string().nullable().optional(),
  registrationDate: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { createVehicle } = await import('../use-cases/fleet/create-vehicle.js');
    const result = await createVehicle(
      { fleetRepo: req.app.locals.deps.fleetRepo },
      {
        name: req.body.name,
        modelId: req.body.modelId ?? null,
        plateNumber: req.body.plateNumber ?? null,
        storeId: req.body.storeId,
        gpsId: req.body.gpsId ?? null,
        surfRack: req.body.surfRack ?? false,
        rentableStartDate: req.body.rentableStartDate ?? null,
        registrationDate: req.body.registrationDate ?? null,
      },
    );
    res.status(201).json({ success: true, data: vehicleToDto(result) });
  } catch (err) { next(err); }
});

router.get(
  '/available',
  requirePermission(Permission.ViewFleet),
  validateQuery(z.object({
    storeId: z.string().min(1),
    pickupDatetime: z.string().min(1),
    dropoffDatetime: z.string().min(1),
  })),
  async (req, res, next) => {
    try {
      const { storeId, pickupDatetime, dropoffDatetime } = req.query as {
        storeId: string;
        pickupDatetime: string;
        dropoffDatetime: string;
      };
      const sb = getSupabaseClient();

      // 1. Fetch all active fleet vehicles for the store
      const { data: fleetRows, error: fleetErr } = await sb
        .from('fleet')
        .select('id, name, model_id, status, store_id')
        .eq('store_id', storeId)
        .not('status', 'in', '("Sold","Maintenance","Inactive")');
      if (fleetErr) throw new Error(`Fleet query failed: ${fleetErr.message}`);

      // 2. Find vehicles booked via order_items in the requested window
      const { data: bookedItemRows, error: bookedErr } = await sb
        .from('order_items')
        .select('vehicle_id, orders!inner(status)')
        .eq('orders.status', 'active')
        .eq('store_id', storeId)
        .lt('pickup_datetime', dropoffDatetime)
        .gt('dropoff_datetime', pickupDatetime);
      if (bookedErr) throw new Error(`Booked vehicles query failed: ${bookedErr.message}`);

      // 3. Combine booked vehicle IDs from order_items into a Set
      const bookedVehicleIds = new Set<string>();
      for (const row of (bookedItemRows ?? []) as Array<{ vehicle_id: string }>) {
        bookedVehicleIds.add(row.vehicle_id);
      }

      // 4. Filter fleet to only vehicles not in the booked set
      type FleetRow = { id: string; name: string; model_id: string | null; status: string; store_id: string };
      const availableVehicles = ((fleetRows ?? []) as FleetRow[]).filter(
        (v) => !bookedVehicleIds.has(v.id),
      );

      // 5. Return available vehicles
      res.json({
        success: true,
        data: availableVehicles.map((v) => ({
          id: v.id,
          name: v.name,
          modelId: v.model_id,
          status: v.status,
          storeId: v.store_id,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const vehicle = await req.app.locals.deps.fleetRepo.findById(req.params.id);
    if (!vehicle) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } }); return; }
    const dto = vehicleToFullDto({
      ...vehicleToDto(vehicle),
      owner: vehicle.owner,
      rentableStartDate: vehicle.rentableStartDate,
      registrationDate: vehicle.registrationDate,
      purchasePrice: vehicle.purchasePrice,
      purchaseDate: vehicle.purchaseDate,
      setUpCosts: vehicle.setUpCosts,
      totalBikeCost: vehicle.totalBikeCost,
      usefulLifeMonths: vehicle.usefulLifeMonths,
      salvageValue: vehicle.salvageValue,
      accumulatedDepreciation: vehicle.accumulatedDepreciation,
      bookValue: vehicle.bookValue,
      dateSold: vehicle.dateSold,
      soldPrice: vehicle.soldPrice,
      profitLoss: vehicle.profitLoss,
    });
    res.json({ success: true, data: dto });
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission(Permission.EditFleet), validateBody(z.object({
  name: z.string().optional(), plateNumber: z.string().nullable().optional(),
  gpsId: z.string().nullable().optional(), status: z.string().optional(),
  currentMileage: z.number().optional(), orcrExpiryDate: z.string().nullable().optional(),
  surfRack: z.boolean().optional(), owner: z.string().nullable().optional(),
  storeId: z.string().optional(), modelId: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { updateVehicle } = await import('../use-cases/fleet/update-vehicle.js');
    const result = await updateVehicle({ fleetRepo: req.app.locals.deps.fleetRepo }, { vehicleId: req.params.id, ...req.body });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/purchase', requirePermission(Permission.EditFleet), validateBody(z.object({
  vehicleId: z.string(), purchasePrice: z.number().positive(), purchaseDate: z.string(),
  setUpCosts: z.number().nonnegative(), usefulLifeMonths: z.number().int().positive(),
  salvageValue: z.number().nonnegative(), fixedAssetAccountId: z.string(), cashAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { recordPurchase } = await import('../use-cases/fleet/record-purchase.js');
    const result = await recordPurchase(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/sale', requirePermission(Permission.EditFleet), validateBody(z.object({
  vehicleId: z.string(), saleDate: z.string(), salePrice: z.number().nonnegative(),
  cashAccountId: z.string(), fixedAssetAccountId: z.string(), accDepreciationAccountId: z.string(), gainLossAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { recordSale } = await import('../use-cases/fleet/record-sale.js');
    const result = await recordSale(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/depreciation', requirePermission(Permission.EditFleet), validateBody(z.object({
  vehicleIds: z.array(z.string()).min(1), depreciationAccountId: z.string(), accumulatedAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { batchDepreciation } = await import('../use-cases/fleet/batch-depreciation.js');
    const result = await batchDepreciation(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as fleetRoutes };
