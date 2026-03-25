import { Router } from 'express';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  PawCardLookupQuerySchema,
  PawCardSubmitRequestSchema,
  PawCardMySubmissionsQuerySchema,
} from '@lolas/shared';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ success: true, data: { service: 'paw-card', status: 'active' } });
});

router.get('/lookup', validateQuery(PawCardLookupQuerySchema), async (req, res, next) => {
  try {
    const { email, mobile, orderId } = req.query as Record<string, string>;
    const query = email || mobile || orderId || '';
    const { lookupCustomer } = await import('../use-cases/paw-card/lookup-customer.js');
    const result = await lookupCustomer({ query }, { pawCard: req.app.locals.deps.pawCardPort });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/establishments', async (req, res, next) => {
  try {
    const storeId = (req.query.storeId as string) || 'default';
    const establishments = await req.app.locals.deps.pawCardPort.getEstablishments(storeId);
    res.json({ success: true, data: establishments });
  } catch (err) { next(err); }
});

router.get('/lifetime', async (req, res, next) => {
  try {
    const email = req.query.email as string;
    if (!email) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'email is required' } }); return; }
    const customers = await req.app.locals.deps.pawCardPort.lookupCustomer(email);
    if (customers.length === 0) { res.json({ success: true, data: { totalSaved: 0, totalVisits: 0, averageSavingsPerVisit: 0 } }); return; }
    const savings = await req.app.locals.deps.pawCardPort.getLifetimeSavings(customers[0].id);
    res.json({ success: true, data: savings });
  } catch (err) { next(err); }
});

router.post('/submit', validateBody(PawCardSubmitRequestSchema), async (req, res, next) => {
  try {
    const { logSavings } = await import('../use-cases/paw-card/log-savings.js');
    const result = await logSavings(
      { ...req.body, submittedBy: 'public' },
      { pawCard: req.app.locals.deps.pawCardPort },
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/company-impact', async (req, res, next) => {
  try {
    const establishmentId = (req.query.establishmentId as string) || 'all';
    const { getCompanyImpact } = await import('../use-cases/paw-card/company-impact.js');
    const result = await getCompanyImpact({ establishmentId }, { pawCard: req.app.locals.deps.pawCardPort });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/my-submissions', validateQuery(PawCardMySubmissionsQuerySchema), async (req, res, next) => {
  try {
    const email = req.query.email as string;
    const customers = await req.app.locals.deps.pawCardPort.lookupCustomer(email);
    if (customers.length === 0) { res.json({ success: true, data: [] }); return; }
    const submissions = await req.app.locals.deps.pawCardPort.getMySubmissions(customers[0].id);
    res.json({ success: true, data: submissions });
  } catch (err) { next(err); }
});

export { router as pawCardRoutes };
