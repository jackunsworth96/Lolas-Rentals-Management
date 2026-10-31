import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { getSurfRackAvailability } from '../use-cases/surf-racks/get-surf-rack-availability.js';

const router = Router();
router.use(authenticate);

const AvailabilityQuery = z.object({
  storeId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  vehicleModelId: z.string().optional(),
  excludeOrderId: z.string().optional(),
  excludeRawOrderId: z.string().optional(),
});

router.get('/availability', requirePermission(Permission.ViewOrders), validateQuery(AvailabilityQuery), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof AvailabilityQuery>;
    const data = await getSurfRackAvailability(getSupabaseClient(), {
      storeId: q.storeId,
      pickupDatetime: q.pickupDatetime,
      dropoffDatetime: q.dropoffDatetime,
      vehicleModelId: q.vehicleModelId ?? null,
      excludeOrderId: q.excludeOrderId ?? null,
      excludeRawOrderId: q.excludeRawOrderId ?? null,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

const ALLOCATION_SELECT = `
  id, store_id, order_id, order_item_id, vehicle_id, quantity,
  starts_at, ends_at, released_at, released_reason, created_at,
  fleet!vehicle_id(name),
  orders!order_id(booking_token, booking_customer_name, customers!customer_id(name))
`;

type AllocationRow = {
  id: string; store_id: string; order_id: string; order_item_id: string | null; vehicle_id: string | null;
  quantity: number; starts_at: string; ends_at: string; released_at: string | null;
  released_reason: string | null; created_at: string;
  fleet: { name: string } | null;
  orders: { booking_token: string | null; booking_customer_name: string | null; customers: { name: string } | null } | null;
};

function toDto(r: AllocationRow) {
  return {
    id: r.id,
    storeId: r.store_id,
    orderId: r.order_id,
    orderReference: r.orders?.booking_token ?? null,
    customerName: r.orders?.customers?.name ?? r.orders?.booking_customer_name ?? null,
    vehicleId: r.vehicle_id,
    vehicleName: r.fleet?.name ?? null,
    quantity: Number(r.quantity) || 1,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    releasedAt: r.released_at,
    releasedReason: r.released_reason,
  };
}

const AllocationsQuery = z.object({
  storeId: z.string().optional(),
  orderId: z.string().optional(),
});

/** Active allocations for a store (ending in the future, not released), or every allocation for one order. */
router.get('/allocations', requirePermission(Permission.ViewOrders), validateQuery(AllocationsQuery), async (req, res, next) => {
  try {
    const { storeId, orderId } = req.query as z.infer<typeof AllocationsQuery>;
    if (!storeId && !orderId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'storeId or orderId is required' } });
      return;
    }
    const sb = getSupabaseClient();
    let query = sb.from('surf_rack_allocations').select(ALLOCATION_SELECT).order('starts_at');
    if (orderId) {
      query = query.eq('order_id', orderId);
    } else {
      query = query.eq('store_id', storeId!).is('released_at', null).gt('ends_at', new Date().toISOString());
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load surf rack allocations: ${error.message}`);
    const allocations = ((data ?? []) as unknown as AllocationRow[]).map(toDto);

    if (orderId) {
      res.json({ success: true, data: { allocations } });
      return;
    }

    const { data: store, error: storeErr } = await sb.from('stores').select('surf_rack_count').eq('id', storeId!).maybeSingle();
    if (storeErr) throw new Error(storeErr.message);
    const total = Number((store as { surf_rack_count?: number } | null)?.surf_rack_count ?? 0);
    const now = Date.now();
    const outNow = allocations
      .filter((a) => new Date(a.startsAt).getTime() <= now)
      .reduce((s, a) => s + a.quantity, 0);
    res.json({
      success: true,
      data: { total, outNow, freeNow: Math.max(0, total - outNow), allocations },
    });
  } catch (err) { next(err); }
});

const ReleaseBody = z.object({
  reason: z.enum(['returned_early', 'removed']).default('returned_early'),
});

router.post('/allocations/:id/release', requirePermission(Permission.EditOrders), async (req, res, next) => {
  try {
    const parsed = ReleaseBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid release reason' } });
      return;
    }
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('surf_rack_allocations')
      .update({ released_at: new Date().toISOString(), released_reason: parsed.data.reason })
      .eq('id', req.params.id as string)
      .is('released_at', null)
      .select(ALLOCATION_SELECT)
      .maybeSingle();
    if (error) throw new Error(`Failed to release surf rack: ${error.message}`);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active surf rack allocation not found' } });
      return;
    }
    res.json({ success: true, data: toDto(data as unknown as AllocationRow) });
  } catch (err) { next(err); }
});

export { router as surfRackRoutes };
