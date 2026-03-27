import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  PawCardLookupQuerySchema,
  PawCardSubmitRequestSchema,
  PawCardMySubmissionsQuerySchema,
  PawCardRegisterSchema,
  PawCardLeaderboardQuerySchema,
} from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, HEIC`));
    }
  },
});

async function resolvePrimaryStoreId(): Promise<string> {
  const sb = getSupabaseClient();
  const { data } = await sb.from('stores').select('id').order('name').limit(1).single();
  return data?.id ?? 'store-lolas';
}

const router = Router();

router.get('/', (_req, res) => {
  res.json({ success: true, data: { service: 'paw-card', status: 'active' } });
});

router.get('/lookup', validateQuery(PawCardLookupQuerySchema), async (req, res, next) => {
  try {
    const { email, mobile, orderId, q } = req.query as Record<string, string>;
    const query = q || email || mobile || orderId || '';
    const { lookupCustomer } = await import('../use-cases/paw-card/lookup-customer.js');
    const result = await lookupCustomer({ query }, { pawCard: req.app.locals.deps.pawCardPort });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/establishments', async (req, res, next) => {
  try {
    const rawStoreId = req.query.storeId as string | undefined;
    const storeId = rawStoreId && rawStoreId !== 'default' ? rawStoreId : await resolvePrimaryStoreId();
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
    const bodyStoreId = req.body.storeId;
    const storeId = bodyStoreId && bodyStoreId !== 'default' ? bodyStoreId : await resolvePrimaryStoreId();
    const result = await logSavings(
      { ...req.body, storeId, submittedBy: 'public' },
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

router.get('/leaderboard', validateQuery(PawCardLeaderboardQuerySchema), async (req, res, next) => {
  try {
    const email = (req.query.email as string) || undefined;
    const result = await req.app.locals.deps.pawCardPort.getLeaderboard(email);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/register', validateBody(PawCardRegisterSchema), async (req, res, next) => {
  try {
    const result = await req.app.locals.deps.pawCardPort.registerCustomer({
      name: req.body.fullName,
      email: req.body.email,
      mobile: req.body.mobile,
      orderId: req.body.orderId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/upload-receipt', (req, res, next) => {
  upload.single('receipt')(req, res, async (err) => {
    if (err) {
      const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Maximum size is 5 MB.'
        : err.message || 'Upload failed';
      res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message } });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: 'No file provided' } });
      return;
    }

    try {
      const sb = getSupabaseClient();
      const ext = req.file.originalname.split('.').pop() ?? 'jpg';
      const filename = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;

      const { error: uploadErr } = await sb.storage
        .from('paw-card-receipts')
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data: urlData } = sb.storage
        .from('paw-card-receipts')
        .getPublicUrl(filename);

      res.json({ success: true, data: { url: urlData.publicUrl } });
    } catch (uploadError) { next(uploadError); }
  });
});

export { router as pawCardRoutes };
