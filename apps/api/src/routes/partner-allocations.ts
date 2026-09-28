import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@lolas/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { allocationReport } from '../lib/partner-allocation-report.js';

const router = Router();
router.use(authenticate);
router.use('/:partnerId', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.partnerId).success) { res.status(400).json({ success: false, error: { message: 'Invalid partner ID' } }); return; }
    const { data, error } = await getSupabaseClient().from('accommodation_partners').select('id,store_id').eq('id', req.params.partnerId).single();
    if (error || !data || !req.user!.storeIds.includes(data.store_id)) { res.status(403).json({ success: false, error: { message: 'Partner store access required' } }); return; }
    res.locals.allocationStore = data.store_id;
    next();
  } catch (err) { next(err); }
});
const type = z.enum(['bike', 'tuktuk']);
const date = z.string().date();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tiers'), data: z.object({ vehicleType: type, tiers: z.array(z.object({ name: z.string().trim().min(1).max(80), qty: z.number().int().min(0).max(10000), startMonth: z.number().int().min(1).max(12), endMonth: z.number().int().min(1).max(12) })).min(1).max(12) }) }),
  z.object({ action: z.literal('override'), data: z.object({ vehicleType: type, startsOn: date, endsBefore: date, qty: z.number().int().min(0).max(10000), reason: z.string().trim().min(1).max(1000) }).refine((d) => d.endsBefore > d.startsOn, 'End must follow start') }),
  z.object({ action: z.literal('revoke'), data: z.object({ id: z.string().uuid() }) }),
  z.object({ action: z.literal('classify'), data: z.object({ modelId: z.string().min(1), modelType: z.enum(['scooter','bike','motorcycle','tuktuk']) }) }),
  z.object({ action: z.enum(['preview', 'activate']), data: z.object({}) }),
]);
router.get('/:partnerId', async (req, res, next) => {
  try {
    const sb = getSupabaseClient(), partner = req.params.partnerId, store = res.locals.allocationStore;
    const results = await Promise.all([
      sb.from('partner_allocation_tiers').select('*').eq('partner_id', partner),
      sb.from('partner_allocations').select('*').eq('partner_id', partner).order('effective_month'),
      sb.from('partner_allocation_overrides').select('*').eq('partner_id', partner).is('revoked_at', null).order('starts_on'),
      sb.from('partner_allocation_settings').select('*').eq('store_id', store).maybeSingle(),
      sb.from('fleet').select('model_id,vehicle_models(id,name,type)').eq('store_id', store),
      sb.from('partner_allocation_shortfalls').select('message,detected_at').eq('store_id', store).maybeSingle(),
    ]);
    for (const result of results) if (result.error) throw new Error(result.error.message);
    res.json({ success: true, data: { tiers: results[0].data, baselines: results[1].data, overrides: results[2].data, settings: results[3].data, models: results[4].data, shortfall: results[5].data } });
  } catch (err) { next(err); }
});
router.post('/:partnerId', requirePermission(Permission.EditSettings), async (req, res, next) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: { message: parsed.error.message } }); return; }
    const { data, error } = await getSupabaseClient().rpc('allocation_configure', { p_store: res.locals.allocationStore, p_partner: req.params.partnerId, p_actor: req.user!.userId, p_action: parsed.data.action, p_data: parsed.data.data });
    if (error) { console.warn('[allocation-config]', error.message); res.status(409).json({ success: false, error: { code: 'ALLOCATION_CONFLICT', message: error.message } }); return; }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.get('/:partnerId/utilization', async (req, res, next) => {
  try {
    const parsed = z.object({ vehicleType: type, from: date, to: date }).refine((d) => d.to > d.from && Date.parse(d.to) - Date.parse(d.from) <= 366 * 86_400_000, 'Choose up to one year').safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ success: false, error: { message: parsed.error.message } }); return; }
    const { vehicleType, from, to } = parsed.data, sb = getSupabaseClient(), partner = req.params.partnerId;
    const now = Date.now();
    const alertFrom = new Date(now + 8 * 3_600_000 - 21 * 86_400_000).toISOString().slice(0, 10);
    const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
    const effectiveFrom = from < alertFrom ? from : alertFrom;
    const effectiveTo = to > today ? to : today;
    const [baselines, overrides, reservations] = await Promise.all([
      sb.from('partner_allocations').select('effective_month,scheduled_qty').eq('partner_id', partner).eq('vehicle_type', vehicleType),
      sb.from('partner_allocation_overrides').select('starts_on,ends_before,qty').eq('partner_id', partner).eq('vehicle_type', vehicleType).is('revoked_at', null),
      sb.from('capacity_reservations').select('id,actual_start,actual_end,ends_at,capacity_reservation_segments(reservation_id,starts_at,ends_at,pool)').eq('partner_id', partner).eq('vehicle_type', vehicleType).not('actual_start', 'is', null)
        .lt('starts_at', `${effectiveTo}T00:00:00+08:00`).gt('ends_at', `${effectiveFrom}T00:00:00+08:00`),
    ]);
    for (const result of [baselines, overrides, reservations]) if (result.error) throw new Error(result.error.message);
    const common = { now, baselines: baselines.data ?? [], overrides: overrides.data ?? [], reservations: reservations.data ?? [], segments: (reservations.data ?? []).flatMap((r) => r.capacity_reservation_segments) };
    const report = allocationReport({ ...common, from, to });
    report.underutilized = allocationReport({ ...common, from: alertFrom, to: today }).underutilized;
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});
export { router as partnerAllocationRoutes };
