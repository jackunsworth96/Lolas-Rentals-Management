import { Router, type Request } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import {
  Permission,
  DecideDayOffPickSchema,
  PublishRotaSchema,
  SendRotaToTimesheetsSchema,
  SetCoverOverrideSchema,
  SetRotaActualsSchema,
  SetRotaCellsSchema,
  SetRotaDutySchema,
  UpdateRotaSettingsSchema,
  UpdateWorkPatternSchema,
} from '@lolas/shared';
import { rotaWeekStart } from '@lolas/domain';
import { formatManilaDate } from '../utils/manila-date.js';
import type { RotaViewer } from '../use-cases/hr/rota.js';

// Mutations also check that the employee is a named rota approver (see rota_settings).
const router = Router();
router.use(authenticate, requirePermission(Permission.ManageRota));

function viewer(req: Request): RotaViewer {
  const employeeId = req.user?.employeeId;
  if (!employeeId) throw Object.assign(new Error('Your login is not linked to an employee profile'), { statusCode: 403 });
  return { employeeId, hasManagePermission: true };
}

async function storeOf(req: Request): Promise<string> {
  const { storeForEmployee } = await import('../use-cases/hr/rota.js');
  return storeForEmployee(viewer(req).employeeId);
}

const weekParam = (v: unknown): string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? rotaWeekStart(v) : rotaWeekStart(formatManilaDate());

router.get('/', async (req, res, next) => {
  try {
    const { getRotaWeek } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await getRotaWeek(await storeOf(req), weekParam(req.query.weekStart), viewer(req), 'manager') });
  } catch (err) { next(err); }
});

router.put('/cells', validateBody(SetRotaCellsSchema), async (req, res, next) => {
  try {
    const { setRotaCells } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await setRotaCells(await storeOf(req), viewer(req), req.body) });
  } catch (err) { next(err); }
});

router.put('/actuals', validateBody(SetRotaActualsSchema), async (req, res, next) => {
  try {
    const { setRotaActuals } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await setRotaActuals(await storeOf(req), viewer(req), req.body) });
  } catch (err) { next(err); }
});

router.get('/timesheet-preview', async (req, res, next) => {
  try {
    const { previewRotaTimesheets } = await import('../use-cases/hr/rota-timesheets.js');
    res.json({ success: true, data: await previewRotaTimesheets(await storeOf(req), viewer(req), weekParam(req.query.weekStart)) });
  } catch (err) { next(err); }
});

router.post('/send-to-timesheets', requirePermission(Permission.SubmitTimesheets), validateBody(SendRotaToTimesheetsSchema), async (req, res, next) => {
  try {
    const { sendRotaToTimesheets } = await import('../use-cases/hr/rota-timesheets.js');
    const result = await sendRotaToTimesheets(await storeOf(req), viewer(req), req.user!.userId, req.body, { timesheets: req.app.locals.deps.timesheetRepo });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/picks/:id/decide', validateBody(DecideDayOffPickSchema), async (req, res, next) => {
  try {
    const { decideDayOffPick } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await decideDayOffPick(await storeOf(req), String(req.params.id), viewer(req), req.body) });
  } catch (err) { next(err); }
});

router.put('/cover-override', validateBody(SetCoverOverrideSchema), async (req, res, next) => {
  try {
    const { setCoverOverride } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await setCoverOverride(await storeOf(req), viewer(req), req.body) });
  } catch (err) { next(err); }
});

router.put('/duties', validateBody(SetRotaDutySchema), async (req, res, next) => {
  try {
    const { setRotaDuty } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await setRotaDuty(await storeOf(req), viewer(req), req.body) });
  } catch (err) { next(err); }
});

router.post('/publish', validateBody(PublishRotaSchema), async (req, res, next) => {
  try {
    const { publishRotaWeek } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await publishRotaWeek(await storeOf(req), viewer(req), req.body.weekStart) });
  } catch (err) { next(err); }
});

router.get('/people', async (req, res, next) => {
  try {
    const { listRotaPeople } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await listRotaPeople(await storeOf(req)) });
  } catch (err) { next(err); }
});

router.put('/people/:employeeId', validateBody(UpdateWorkPatternSchema), async (req, res, next) => {
  try {
    const { updateWorkPattern } = await import('../use-cases/hr/rota.js');
    await updateWorkPattern(await storeOf(req), viewer(req), String(req.params.employeeId), req.body);
    res.json({ success: true, data: { employeeId: req.params.employeeId } });
  } catch (err) { next(err); }
});

router.put('/settings', validateBody(UpdateRotaSettingsSchema), async (req, res, next) => {
  try {
    const { updateRotaSettings } = await import('../use-cases/hr/rota.js');
    res.json({ success: true, data: await updateRotaSettings(await storeOf(req), viewer(req), req.body) });
  } catch (err) { next(err); }
});

export { router as rotaRoutes };
