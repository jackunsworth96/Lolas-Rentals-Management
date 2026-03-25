import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateLostOpportunitySchema,
  UpdateLostOpportunitySchema,
  LostOpportunityQuerySchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

const perm = requirePermission(Permission.ViewLostOpportunity);

type Row = {
  id: number;
  store_id: string;
  date: string;
  time: string | null;
  vehicle_requested: string | null;
  quantity: number;
  duration_days: number | null;
  est_value: number | string | null;
  reason: string | null;
  outcome: string | null;
  staff_notes: string | null;
  created_at: string;
};

function toDto(r: Row) {
  return {
    id: r.id,
    storeId: r.store_id,
    date: r.date,
    time: r.time,
    vehicleRequested: r.vehicle_requested,
    quantity: r.quantity,
    durationDays: r.duration_days,
    estValue: r.est_value != null ? Number(r.est_value) : null,
    reason: r.reason,
    outcome: r.outcome,
    staffNotes: r.staff_notes,
    createdAt: r.created_at,
  };
}

router.get('/', perm, validateQuery(LostOpportunityQuerySchema), async (req, res, next) => {
  try {
    const { storeId, date } = req.query as { storeId: string; date: string };
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('lost_opportunity')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch lost opportunities: ${error.message}`);
    const rows = ((data ?? []) as Row[]).map(toDto);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', perm, validateBody(CreateLostOpportunitySchema), async (req, res, next) => {
  try {
    const b = req.body as {
      storeId: string;
      date: string;
      time?: string | null;
      vehicleRequested?: string | null;
      quantity: number;
      durationDays?: number | null;
      estValue?: number | null;
      reason: string;
      outcome?: string | null;
      staffNotes?: string | null;
    };

    const sb = getSupabaseClient();
    const insertRow = {
      store_id: b.storeId,
      date: b.date,
      time: b.time && b.time.length > 0 ? b.time : null,
      vehicle_requested: b.vehicleRequested?.trim() || null,
      quantity: b.quantity,
      duration_days: b.durationDays ?? null,
      est_value: b.estValue ?? null,
      reason: b.reason.trim(),
      outcome: b.outcome?.trim() || null,
      staff_notes: b.staffNotes?.trim() || null,
    };

    const { data, error } = await sb.from('lost_opportunity').insert(insertRow).select('*').single();
    if (error) throw new Error(`Failed to create lost opportunity: ${error.message}`);
    res.status(201).json({ success: true, data: toDto(data as Row) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', perm, validateBody(UpdateLostOpportunitySchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id' } });
      return;
    }

    const b = req.body as {
      storeId: string;
      date?: string;
      time?: string | null;
      vehicleRequested?: string | null;
      quantity?: number;
      durationDays?: number | null;
      estValue?: number | null;
      reason?: string;
      outcome?: string | null;
      staffNotes?: string | null;
    };

    const sb = getSupabaseClient();
    const { data: existing, error: fetchErr } = await sb
      .from('lost_opportunity')
      .select('store_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    if ((existing as { store_id: string }).store_id !== b.storeId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Wrong store' } });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (b.date !== undefined) patch.date = b.date;
    if (b.time !== undefined) patch.time = b.time && String(b.time).length > 0 ? b.time : null;
    if (b.vehicleRequested !== undefined) patch.vehicle_requested = b.vehicleRequested?.trim() || null;
    if (b.quantity !== undefined) patch.quantity = b.quantity;
    if (b.durationDays !== undefined) patch.duration_days = b.durationDays;
    if (b.estValue !== undefined) patch.est_value = b.estValue;
    if (b.reason !== undefined) patch.reason = b.reason.trim();
    if (b.outcome !== undefined) patch.outcome = b.outcome?.trim() || null;
    if (b.staffNotes !== undefined) patch.staff_notes = b.staffNotes?.trim() || null;

    const { data, error } = await sb.from('lost_opportunity').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(`Failed to update: ${error.message}`);
    res.json({ success: true, data: toDto(data as Row) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', perm, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const storeId = String(req.query.storeId ?? '');
    if (!Number.isFinite(id) || !storeId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id or store' } });
      return;
    }

    const sb = getSupabaseClient();
    const { data: existing, error: fetchErr } = await sb
      .from('lost_opportunity')
      .select('store_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    if ((existing as { store_id: string }).store_id !== storeId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Wrong store' } });
      return;
    }

    const { error } = await sb.from('lost_opportunity').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete: ${error.message}`);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

export { router as lostOpportunityRoutes };
