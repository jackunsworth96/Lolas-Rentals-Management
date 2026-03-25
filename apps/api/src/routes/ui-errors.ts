import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  CreateUiErrorRequestSchema,
  UpdateUiErrorRequestSchema,
  UiErrorListQuerySchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

const perm = requirePermission(Permission.ViewUIErrors);

type Row = {
  id: string;
  page: string;
  error_description: string;
  idea_and_improvements: string | null;
  employee_id: string | null;
  fixed: boolean;
  created_at: string;
};

router.get('/', perm, validateQuery(UiErrorListQuerySchema), async (req, res, next) => {
  try {
    const parsed = UiErrorListQuerySchema.safeParse(req.query);
    const status = parsed.success ? (parsed.data.status ?? 'all') : 'all';

    const sb = getSupabaseClient();
    let q = sb.from('ui_errors').select('*').order('created_at', { ascending: false });

    if (status === 'outstanding') q = q.eq('fixed', false);
    else if (status === 'fixed') q = q.eq('fixed', true);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to fetch UI errors: ${error.message}`);

    const rows = (data ?? []) as Row[];
    const empIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] as string[];

    let empMap = new Map<string, string>();
    if (empIds.length > 0) {
      const { data: emps, error: eErr } = await sb
        .from('employees')
        .select('id, full_name')
        .in('id', empIds);
      if (!eErr && emps) {
        empMap = new Map((emps as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));
      }
    }

    const out = rows.map((r) => ({
      id: r.id,
      page: r.page,
      errorDescription: r.error_description,
      ideaAndImprovements: r.idea_and_improvements,
      employeeId: r.employee_id,
      employeeName: r.employee_id ? (empMap.get(r.employee_id) ?? null) : null,
      fixed: r.fixed,
      createdAt: r.created_at,
    }));

    res.json({ success: true, data: out });
  } catch (err) {
    next(err);
  }
});

router.post('/', perm, validateBody(CreateUiErrorRequestSchema), async (req, res, next) => {
  try {
    const body = req.body as {
      page: string;
      errorDescription: string;
      ideaAndImprovements?: string | null;
    };
    const employeeId = req.user?.employeeId?.trim() || null;

    const sb = getSupabaseClient();
    const id = randomUUID();
    const { data, error } = await sb
      .from('ui_errors')
      .insert({
        id,
        page: body.page,
        error_description: body.errorDescription,
        idea_and_improvements: body.ideaAndImprovements ?? null,
        employee_id: employeeId,
        fixed: false,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create UI error: ${error.message}`);

    const r = data as Row;
    res.status(201).json({
      success: true,
      data: {
        id: r.id,
        page: r.page,
        errorDescription: r.error_description,
        ideaAndImprovements: r.idea_and_improvements,
        employeeId: r.employee_id,
        employeeName: null,
        fixed: r.fixed,
        createdAt: r.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', perm, validateBody(UpdateUiErrorRequestSchema), async (req, res, next) => {
  try {
    const body = req.body as { fixed: boolean };
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('ui_errors')
      .update({ fixed: body.fixed })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update UI error: ${error.message}`);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'UI error not found' } });
      return;
    }

    const r = data as Row;
    res.json({
      success: true,
      data: {
        id: r.id,
        page: r.page,
        errorDescription: r.error_description,
        ideaAndImprovements: r.idea_and_improvements,
        employeeId: r.employee_id,
        employeeName: null,
        fixed: r.fixed,
        createdAt: r.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as uiErrorsRoutes };
