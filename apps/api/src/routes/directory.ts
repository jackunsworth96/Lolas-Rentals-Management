import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { DirectoryContactSchema, Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);
const edit = requirePermission(Permission.EditSettings);

// ── GET / — list contacts with optional search ──
router.get('/', async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const sb = getSupabaseClient();

    let query = sb
      .from('directory')
      .select('*')
      .order('name', { ascending: true });

    if (search && search.trim().length > 0) {
      const s = search.trim().replace(/[%_\\,()]/g, '\\$&');
      query = query.or(
        `name.ilike.%${s}%,number.ilike.%${s}%,email.ilike.%${s}%,category.ilike.%${s}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch directory: ${error.message}`);

    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

// ── POST / — create contact ──
router.post('/', edit, validateBody(DirectoryContactSchema), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('directory')
      .insert(req.body)
      .select()
      .single();
    if (error) throw new Error(`Failed to create contact: ${error.message}`);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── PUT /:id — update contact ──
router.put('/:id', edit, validateBody(DirectoryContactSchema), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('directory')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update contact: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DELETE /:id — delete contact ──
router.delete('/:id', edit, async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('directory')
      .delete()
      .eq('id', req.params.id);
    if (error) throw new Error(`Failed to delete contact: ${error.message}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export { router as directoryRoutes };
