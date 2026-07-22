import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';
import { evaluateAvailability } from '../adapters/supabase/booking-adapter.js';

const router = Router();
router.use(authenticate);

type FleetUnavailabilityRow = {
  id: string;
  vehicle_id: string;
  store_id: string;
  type: 'owner_use';
  starts_at: string;
  ends_at: string;
  note: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
};

const unavailabilityFields = z.object({
  vehicleId: z.string().min(1),
  storeId: z.string().min(1),
  type: z.literal('owner_use').default('owner_use'),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(500).nullable().optional(),
});

const unavailabilityBody = unavailabilityFields.refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
  message: 'Owner use end must be after its start',
  path: ['endsAt'],
});

function unavailabilityToDto(row: FleetUnavailabilityRow) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    storeId: row.store_id,
    type: row.type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    note: row.note,
    createdBy: row.created_by,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertStoreAccess(req: { user?: { storeIds: string[] } }, storeId: string): void {
  const stores = req.user?.storeIds ?? [];
  if (stores.includes(storeId) || stores.includes('company')) return;
  const error = new Error('You do not have access to this store') as Error & { statusCode?: number };
  error.statusCode = 403;
  throw error;
}

async function assertNoOwnerUseOverlap(
  vehicleId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string,
): Promise<void> {
  const sb = getSupabaseClient();
  let query = sb.from('fleet_unavailability').select('id')
    .eq('vehicle_id', vehicleId).eq('type', 'owner_use').is('cancelled_at', null)
    .lt('starts_at', endsAt).gt('ends_at', startsAt);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(`Owner use overlap check failed: ${error.message}`);
  if ((data ?? []).length > 0) {
    const conflict = new Error('This vehicle already has an overlapping owner-use period') as Error & { statusCode?: number };
    conflict.statusCode = 409;
    throw conflict;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vehicleToDto(v: any) {
  return {
    id: v.id,
    name: v.name,
    storeId: v.storeId,
    modelId: v.modelId,
    plateNumber: v.plateNumber,
    engineNumber: v.engineNumber ?? null,
    chassisNumber: v.chassisNumber ?? null,
    gpsId: v.gpsId,
    status: v.status,
    currentMileage: v.currentMileage,
    orcrExpiryDate: v.orcrExpiryDate,
    surfRack: v.surfRack,
    purchasePrice: v.purchasePrice ?? null,
    purchaseDate: v.purchaseDate ?? null,
    usefulLifeMonths: v.usefulLifeMonths ?? null,
    salvageValue: v.salvageValue ?? 0,
    accumulatedDepreciation: v.accumulatedDepreciation ?? 0,
    bookValue: v.bookValue ?? 0,
    totalBikeCost: v.totalBikeCost ?? 0,
    setUpCosts: v.setUpCosts ?? 0,
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
    const vehicleIds = dtos.map((vehicle) => vehicle.id);
    if (vehicleIds.length > 0) {
      const nowIso = new Date().toISOString();
      const { data: periods, error } = await getSupabaseClient()
        .from('fleet_unavailability').select('*')
        .in('vehicle_id', vehicleIds).eq('type', 'owner_use').is('cancelled_at', null)
        .gt('ends_at', nowIso).order('starts_at');
      if (error) throw new Error(`Fleet owner-use query failed: ${error.message}`);
      const byVehicle = new Map<string, ReturnType<typeof unavailabilityToDto>[]>();
      for (const row of (periods ?? []) as FleetUnavailabilityRow[]) {
        const list = byVehicle.get(row.vehicle_id) ?? [];
        list.push(unavailabilityToDto(row));
        byVehicle.set(row.vehicle_id, list);
      }
      for (const dto of dtos) {
        const ownerUsePeriods = byVehicle.get(dto.id) ?? [];
        const now = Date.now();
        Object.assign(dto, {
          ownerUsePeriods,
          activeOwnerUse: ownerUsePeriods.find((period) =>
            new Date(period.startsAt).getTime() <= now && new Date(period.endsAt).getTime() > now,
          ) ?? null,
        });
      }
    }
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

router.get('/unavailability', requirePermission(Permission.ViewFleet), validateQuery(z.object({
  storeId: z.string().min(1),
  vehicleId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})), async (req, res, next) => {
  try {
    const { storeId, vehicleId, from, to } = req.query as { storeId: string; vehicleId?: string; from?: string; to?: string };
    assertStoreAccess(req, storeId);
    let query = getSupabaseClient().from('fleet_unavailability').select('*')
      .eq('store_id', storeId).eq('type', 'owner_use').is('cancelled_at', null).order('starts_at');
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (from) query = query.gt('ends_at', from);
    if (to) query = query.lt('starts_at', to);
    const { data, error } = await query;
    if (error) throw new Error(`Owner use list failed: ${error.message}`);
    res.json({ success: true, data: ((data ?? []) as FleetUnavailabilityRow[]).map(unavailabilityToDto) });
  } catch (err) { next(err); }
});

router.post('/unavailability', requirePermission(Permission.EditFleet), validateBody(unavailabilityBody), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof unavailabilityBody>;
    assertStoreAccess(req, body.storeId);
    const sb = getSupabaseClient();
    const { data: vehicle, error: vehicleError } = await sb.from('fleet').select('id, store_id')
      .eq('id', body.vehicleId).maybeSingle();
    if (vehicleError) throw new Error(`Vehicle lookup failed: ${vehicleError.message}`);
    if (!vehicle || vehicle.store_id !== body.storeId) {
      const error = new Error('Vehicle was not found in the selected store') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    await assertNoOwnerUseOverlap(body.vehicleId, body.startsAt, body.endsAt);
    const { data, error } = await sb.from('fleet_unavailability').insert({
      vehicle_id: body.vehicleId,
      store_id: body.storeId,
      type: body.type,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      note: body.note || null,
      created_by: req.user!.employeeId,
    }).select('*').single();
    if (error) throw new Error(`Owner use create failed: ${error.message}`);
    res.status(201).json({ success: true, data: unavailabilityToDto(data as FleetUnavailabilityRow) });
  } catch (err) { next(err); }
});

router.put('/unavailability/:unavailabilityId', requirePermission(Permission.EditFleet), validateBody(
  unavailabilityFields.pick({ startsAt: true, endsAt: true, note: true })
    .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
      message: 'Owner use end must be after its start', path: ['endsAt'],
    }),
), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const id = req.params.unavailabilityId as string;
    const { data: existing, error: findError } = await sb.from('fleet_unavailability').select('*')
      .eq('id', id).is('cancelled_at', null).maybeSingle();
    if (findError) throw new Error(`Owner use lookup failed: ${findError.message}`);
    if (!existing) {
      const error = new Error('Owner-use period not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    const row = existing as FleetUnavailabilityRow;
    assertStoreAccess(req, row.store_id);
    const body = req.body as { startsAt: string; endsAt: string; note?: string | null };
    await assertNoOwnerUseOverlap(row.vehicle_id, body.startsAt, body.endsAt, id);
    const { data, error } = await sb.from('fleet_unavailability').update({
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      note: body.note || null,
    }).eq('id', id).select('*').single();
    if (error) throw new Error(`Owner use update failed: ${error.message}`);
    res.json({ success: true, data: unavailabilityToDto(data as FleetUnavailabilityRow) });
  } catch (err) { next(err); }
});

router.delete('/unavailability/:unavailabilityId', requirePermission(Permission.EditFleet), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const id = req.params.unavailabilityId as string;
    const { data: existing, error: findError } = await sb.from('fleet_unavailability').select('store_id')
      .eq('id', id).is('cancelled_at', null).maybeSingle();
    if (findError) throw new Error(`Owner use lookup failed: ${findError.message}`);
    if (!existing) {
      const error = new Error('Owner-use period not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    assertStoreAccess(req, existing.store_id as string);
    const { error } = await sb.from('fleet_unavailability').update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: req.user!.employeeId,
    }).eq('id', id);
    if (error) throw new Error(`Owner use cancellation failed: ${error.message}`);
    res.json({ success: true, data: { id, cancelled: true } });
  } catch (err) { next(err); }
});

router.get('/availability-explanation', requirePermission(Permission.ViewFleet), validateQuery(z.object({
  storeId: z.string().min(1),
  pickupDatetime: z.string().datetime({ offset: true }),
  dropoffDatetime: z.string().datetime({ offset: true }),
}).refine((value) => new Date(value.pickupDatetime) < new Date(value.dropoffDatetime), {
  message: 'Dropoff must be after pickup', path: ['dropoffDatetime'],
})), async (req, res, next) => {
  try {
    const { storeId, pickupDatetime, dropoffDatetime } = req.query as {
      storeId: string; pickupDatetime: string; dropoffDatetime: string;
    };
    assertStoreAccess(req, storeId);
    const result = await evaluateAvailability({ storeId, pickupDatetime, dropoffDatetime });
    res.json({ success: true, data: result.explanation });
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
    const today = formatManilaDate();
    if (from && to) {
      fromDate = from;
      toDate = to;
    } else if (period === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      fromDate = formatManilaDate(d);
      toDate = today;
    } else if (period === '90d') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      fromDate = formatManilaDate(d);
      toDate = today;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      fromDate = formatManilaDate(d);
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
    let fleetQuery = sb.from('fleet').select('id, name, model_id, plate_number, store_id, status, surf_rack').order('name');
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
      original_dropoff_datetime: string | null;
    };
    let itemRows: OrderItemRow[] = [];
    const ownerUseByVehicle = new Map<string, ReturnType<typeof unavailabilityToDto>[]>();
    if (vehicleIds.length > 0) {
      const [itemsResult, ownerUseResult] = await Promise.all([
        sb.from('order_items')
          .select('id, order_id, vehicle_id, vehicle_name, pickup_datetime, dropoff_datetime, original_dropoff_datetime')
          .in('vehicle_id', vehicleIds)
          .lte('pickup_datetime', `${to}T23:59:59+08:00`)
          .gte('dropoff_datetime', `${from}T00:00:00+08:00`),
        sb.from('fleet_unavailability').select('*')
          .in('vehicle_id', vehicleIds).eq('type', 'owner_use').is('cancelled_at', null)
          .lt('starts_at', `${to}T23:59:59+08:00`)
          .gt('ends_at', `${from}T00:00:00+08:00`)
          .order('starts_at'),
      ]);
      if (itemsResult.error) throw new Error(`Order items query failed: ${itemsResult.error.message}`);
      if (ownerUseResult.error) throw new Error(`Owner use query failed: ${ownerUseResult.error.message}`);
      itemRows = (itemsResult.data ?? []) as unknown as OrderItemRow[];
      for (const row of (ownerUseResult.data ?? []) as FleetUnavailabilityRow[]) {
        const periods = ownerUseByVehicle.get(row.vehicle_id) ?? [];
        periods.push(unavailabilityToDto(row));
        ownerUseByVehicle.set(row.vehicle_id, periods);
      }
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

    const vehicles = (fleetRows ?? []).map((v: { id: string; name: string; model_id: string | null; plate_number: string | null; store_id: string; status: string; surf_rack: boolean | null }) => {
      const vItems = itemsByVehicle.get(v.id) ?? [];
      return {
        vehicleId: v.id,
        vehicleName: v.name,
        modelName: modelMap.get(v.model_id ?? '') ?? '—',
        plateNumber: v.plate_number,
        storeId: v.store_id,
        storeName: storeMap.get(v.store_id) ?? v.store_id,
        status: v.status,
        surfRack: v.surf_rack ?? false,
        ownerUsePeriods: ownerUseByVehicle.get(v.id) ?? [],
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
            originalDropoffDatetime: item.original_dropoff_datetime ?? null,
            status: calStatus,
          };
        }),
      };
    });

    // 6. Load orders_raw rows in the date window (unassigned + walk-in reserved)
    let rawQuery = sb
      .from('orders_raw')
      .select('id, order_reference, customer_name, vehicle_model_id, vehicle_id, booking_channel, store_id, pickup_datetime, dropoff_datetime, status')
      .in('status', ['unprocessed', 'processed'])
      .lte('pickup_datetime', `${to}T23:59:59`)
      .gte('dropoff_datetime', `${from}T00:00:00`);
    if (storeId && storeId !== 'all') rawQuery = rawQuery.eq('store_id', storeId);
    const { data: rawRows, error: rawErr } = await rawQuery;
    if (rawErr) throw new Error(`orders_raw query failed: ${rawErr.message}`);

    // Walk-in reserved rows have a specific vehicle_id — inject them into the vehicle's bookings.
    // Everything else (no vehicle_id) goes into unassignedBookings.
    const walkInReservedByVehicle = new Map<string, Array<Record<string, unknown>>>();
    const unassignedRawRows: Array<Record<string, unknown>> = [];

    for (const r of (rawRows ?? []) as Array<Record<string, unknown>>) {
      const vid = r.vehicle_id as string | null;
      const channel = r.booking_channel as string | null;
      if (vid && channel === 'walk_in') {
        const list = walkInReservedByVehicle.get(vid) ?? [];
        list.push(r);
        walkInReservedByVehicle.set(vid, list);
      } else {
        unassignedRawRows.push(r);
      }
    }

    // Append walk-in reserved entries to each vehicle's bookings array
    const vehiclesWithReserved = vehicles.map((v) => {
      const reserved = walkInReservedByVehicle.get(v.vehicleId) ?? [];
      const reservedBookings = reserved.map((r) => ({
        orderId: null,
        orderItemId: null,
        orderReference: r.order_reference as string | null,
        customerName: (r.customer_name as string) ?? '—',
        pickupDatetime: r.pickup_datetime as string,
        dropoffDatetime: r.dropoff_datetime as string,
        originalDropoffDatetime: null,
        status: 'pending' as const,
        rawOrderId: r.id as string,
      }));
      return {
        ...v,
        bookings: [...v.bookings, ...reservedBookings],
      };
    });

    const unassignedBookings = unassignedRawRows.map((r) => ({
      rawOrderId: r.id as string,
      orderReference: r.order_reference as string | null,
      customerName: (r.customer_name as string) ?? '—',
      vehicleModelName: modelMap.get(r.vehicle_model_id as string) ?? '—',
      storeId: r.store_id as string,
      pickupDatetime: r.pickup_datetime as string,
      dropoffDatetime: r.dropoff_datetime as string,
      status: 'unprocessed' as const,
    }));

    res.json({
      success: true,
      data: { vehicles: vehiclesWithReserved, unassignedBookings, dateRange: { from, to } },
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
        .select('id, name, model_id, status, store_id, surf_rack')
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

      // 3b. Also exclude vehicles held by unprocessed walk-in reservations
      const { data: reservedRows, error: reservedErr } = await sb
        .from('orders_raw')
        .select('vehicle_id')
        .eq('store_id', storeId)
        .eq('booking_channel', 'walk_in')
        .eq('status', 'unprocessed')
        .not('vehicle_id', 'is', null)
        .lt('pickup_datetime', dropoffDatetime)
        .gt('dropoff_datetime', pickupDatetime);
      if (reservedErr) throw new Error(`Walk-in reserved query failed: ${reservedErr.message}`);

      for (const row of (reservedRows ?? []) as Array<{ vehicle_id: string }>) {
        bookedVehicleIds.add(row.vehicle_id);
      }

      // 3c. Exclude exact vehicles with an overlapping owner-use period.
      const { data: ownerUseRows, error: ownerUseErr } = await sb
        .from('fleet_unavailability').select('vehicle_id')
        .eq('store_id', storeId).eq('type', 'owner_use').is('cancelled_at', null)
        .lt('starts_at', dropoffDatetime).gt('ends_at', pickupDatetime);
      if (ownerUseErr) throw new Error(`Owner use query failed: ${ownerUseErr.message}`);
      for (const row of (ownerUseRows ?? []) as Array<{ vehicle_id: string }>) {
        bookedVehicleIds.add(row.vehicle_id);
      }

      // 4. Filter fleet to only vehicles not in the booked set
      type FleetRow = { id: string; name: string; model_id: string | null; status: string; store_id: string; surf_rack: boolean | null };
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
          surfRack: v.surf_rack ?? false,
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
  engineNumber: z.string().nullable().optional(), chassisNumber: z.string().nullable().optional(),
  gpsId: z.string().nullable().optional(), status: z.string().optional(),
  currentMileage: z.number().optional(), orcrExpiryDate: z.string().nullable().optional(),
  surfRack: z.boolean().optional(), owner: z.string().nullable().optional(),
  storeId: z.string().optional(), modelId: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const vehicleId = req.params.id as string;
    // Capture old status before the update so we can detect the specific
    // transition Available → non-Available without a second full refetch.
    const priorVehicle = req.body?.status !== undefined
      ? await req.app.locals.deps.fleetRepo.findById(vehicleId)
      : null;
    const oldStatus = priorVehicle?.status ?? null;

    const { updateVehicle } = await import('../use-cases/fleet/update-vehicle.js');
    const result = await updateVehicle({ fleetRepo: req.app.locals.deps.fleetRepo }, { vehicleId, ...req.body });
    res.json({ success: true, data: result });

    // Fleet channel Telegram alerts — fired on significant status transitions.
    // Transitions between two non-available statuses are intentionally silent.
    const newStatus = result.status;

    if (oldStatus === 'Available' && newStatus !== 'Available') {
      // Vehicle left the available pool → out-of-service alert.
      void (async () => {
        try {
          let modelName = '—';
          if (result.modelId) {
            const sb = getSupabaseClient();
            const { data: model } = await sb
              .from('vehicle_models')
              .select('name')
              .eq('id', result.modelId)
              .maybeSingle();
            if (model && typeof (model as { name?: string }).name === 'string') {
              modelName = (model as { name: string }).name;
            }
          }
          const vehicleLabel = result.plateNumber && result.name && result.name !== result.plateNumber
            ? `${escapeHtml(result.name)} (${escapeHtml(result.plateNumber)})`
            : escapeHtml(result.plateNumber ?? result.name ?? vehicleId);
          const updatedBy = req.user?.username ?? 'unknown';
          await sendTelegramAlert(
            `🔧 <b>Vehicle Out of Service</b>\n` +
              `Vehicle: ${vehicleLabel} — ${escapeHtml(modelName)}\n` +
              `Status: ${escapeHtml(newStatus)}\n` +
              `Store: ${escapeHtml(result.storeId)}\n` +
              `Updated by: ${escapeHtml(updatedBy)}\n` +
              `Please action promptly to return to circulation.`,
            getTelegramChatId('fleet'),
          );
        } catch (tgErr) {
          console.error('[fleet-telegram] out-of-service notify error:', tgErr);
        }
      })();
    } else if (oldStatus !== null && oldStatus !== 'Available' && newStatus === 'Available') {
      // Vehicle returned to the available pool → back-in-service alert.
      void (async () => {
        try {
          let modelName = '—';
          if (result.modelId) {
            const sb = getSupabaseClient();
            const { data: model } = await sb
              .from('vehicle_models')
              .select('name')
              .eq('id', result.modelId)
              .maybeSingle();
            if (model && typeof (model as { name?: string }).name === 'string') {
              modelName = (model as { name: string }).name;
            }
          }
          const vehicleLabel = result.plateNumber && result.name && result.name !== result.plateNumber
            ? `${escapeHtml(result.name)} (${escapeHtml(result.plateNumber)})`
            : escapeHtml(result.plateNumber ?? result.name ?? vehicleId);
          const updatedBy = req.user?.username ?? 'unknown';
          await sendTelegramAlert(
            `🟢 <b>Vehicle Back in Service</b>\n` +
              `Vehicle: ${vehicleLabel} — ${escapeHtml(modelName)}\n` +
              `Status: Available\n` +
              `Store: ${escapeHtml(result.storeId)}\n` +
              `Updated by: ${escapeHtml(updatedBy)}`,
            getTelegramChatId('fleet'),
          );
        } catch (tgErr) {
          console.error('[fleet-telegram] back-in-service notify error:', tgErr);
        }
      })();
    }
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
  storeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
  depreciationExpenseAccountId: z.string().min(1),
  accDepreciationAccountId: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { batchDepreciation } = await import('../use-cases/fleet/batch-depreciation.js');
    const result = await batchDepreciation(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as fleetRoutes };
