import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { createHash, randomBytes } from 'node:crypto';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { lookupPawCardPublicAccess } from '../use-cases/paw-card/lookup-paw-card-public.js';
import {
  authenticatePawCardAccess,
  generatePawCardAccessToken,
} from '../auth/paw-card-access.js';

const ALLOWED_RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_RECEIPT_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Allowed: JPEG, PNG, WebP, HEIC'));
  },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many Paw Card requests' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function receiptOwnerKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
}

async function resolvePrimaryStoreId(): Promise<string> {
  const sb = getSupabaseClient();
  const { data } = await sb.from('stores').select('id').order('name').limit(1).single();
  return data?.id ?? 'store-lolas';
}

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many lookup requests' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

const router = Router();

const LookupBodySchema = z.object({
  email: z.string().email(),
});

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

router.post('/lookup', lookupLimiter, validateBody(LookupBodySchema), async (req, res, next) => {
  try {
    const { email } = req.body as { email: string };
    const data = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    if (!data.found) {
      res.json({ success: true, data });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const accessToken = generatePawCardAccessToken({
      email: normalizedEmail,
      customerId: data.customerId,
      customerName: data.customerName,
    });
    res.json({ success: true, data: { ...data, accessToken } });
  } catch (err) {
    next(err);
  }
});

const PublicSubmitSchema = z.object({
  establishmentId: z.string().trim().min(1),
  discountAmount: z.number().positive(),
  visitDate: z.string().trim().min(1),
  receiptPath: z.string().trim().min(1).optional(),
  numberOfPeople: z.number().int().positive().optional(),
});

router.post(
  '/upload-receipt',
  writeLimiter,
  authenticatePawCardAccess,
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, async (err) => {
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
        const owner = receiptOwnerKey(req.pawCardAccess!.email);
        const originalExt = req.file.originalname.split('.').pop()?.toLowerCase();
        const ext = originalExt && /^[a-z0-9]{2,5}$/.test(originalExt) ? originalExt : 'jpg';
        const receiptPath = `${owner}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
        const sb = getSupabaseClient();
        const { error: uploadError } = await sb.storage
          .from('paw-card-receipts')
          .upload(receiptPath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });
        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
        res.json({ success: true, data: { receiptPath } });
      } catch (uploadError) {
        next(uploadError);
      }
    });
  },
);

router.post(
  '/submit',
  writeLimiter,
  authenticatePawCardAccess,
  validateBody(PublicSubmitSchema),
  async (req, res, next) => {
    try {
      const access = req.pawCardAccess!;
      const { establishmentId, discountAmount, visitDate, receiptPath, numberOfPeople } = req.body;
      let receiptUrl: string | undefined;
      if (receiptPath) {
        const expectedPrefix = `${receiptOwnerKey(access.email)}/`;
        if (!receiptPath.startsWith(expectedPrefix) || receiptPath.includes('..')) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Receipt does not belong to this Paw Card session' },
          });
          return;
        }
        receiptUrl = getSupabaseClient().storage
          .from('paw-card-receipts')
          .getPublicUrl(receiptPath).data.publicUrl;
      }

      const { logSavings } = await import('../use-cases/paw-card/log-savings.js');
      const result = await logSavings(
        {
          customerId: access.customerId ?? access.email,
          email: access.email,
          fullName: access.customerName ?? access.email.split('@')[0] ?? 'Member',
          establishmentId,
          discountAmount,
          visitDate,
          receiptUrl,
          numberOfPeople,
          storeId: await resolvePrimaryStoreId(),
          submittedBy: 'public',
        },
        { pawCard: req.app.locals.deps.pawCardPort },
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

const EntriesQuerySchema = z.object({
  email: z.string().email(),
  period: z.enum(['month', 'all']),
});

router.get('/entries', lookupLimiter, validateQuery(EntriesQuerySchema), async (req, res, next) => {
  try {
    const { email, period } = req.query as { email: string; period: 'month' | 'all' };
    const access = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    if (!access.found) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Email not recognised for Paw Card access.' },
      });
      return;
    }

    const sb = getSupabaseClient();
    let q = sb.from('paw_card_entries').select('*').ilike('email', escapeIlike(email));
    if (period === 'month') {
      q = q.gte('created_at', startOfCurrentMonthIso());
    }
    q = q.order('created_at', { ascending: false }).limit(200);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

const RentalOrdersQuerySchema = z.object({
  email: z.string().email(),
});

router.get('/rental-orders', lookupLimiter, validateQuery(RentalOrdersQuerySchema), async (req, res, next) => {
  try {
    const email = (req.query.email as string).trim().toLowerCase();
    const access = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    if (!access.found) {
      res.json({ success: true, data: [] });
      return;
    }

    const sb = getSupabaseClient();
    const { data: custRows, error: cErr } = await sb
      .from('customers')
      .select('id')
      .ilike('email', escapeIlike(email))
      .limit(10);
    if (cErr) throw new Error(cErr.message);

    const customerIds = [...new Set((custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean))];
    if (customerIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const { data: orders, error: oErr } = await sb
      .from('orders')
      .select('id, order_date, status, order_reference')
      .in('customer_id', customerIds)
      .order('order_date', { ascending: false })
      .limit(30);
    if (oErr) throw new Error(oErr.message);
    res.json({ success: true, data: orders ?? [] });
  } catch (err) {
    next(err);
  }
});

const LeaderboardQuerySchema = z.object({
  email: z.string().email(),
  period: z.enum(['month', 'all']),
});

/**
 * Returns ALL users' entries for the given period (no email filter).
 * The requesting email is only used to verify the caller has Paw Card access.
 * Raw rows are returned so the client can aggregate/anonymise them.
 */
router.get('/leaderboard', lookupLimiter, validateQuery(LeaderboardQuerySchema), async (req, res, next) => {
  try {
    const { email, period } = req.query as { email: string; period: 'month' | 'all' };
    const access = await lookupPawCardPublicAccess(
      { customerRepo: req.app.locals.deps.customerRepo },
      { email },
    );
    if (!access.found) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Email not recognised for Paw Card access.' },
      });
      return;
    }

    const sb = getSupabaseClient();
    let q = sb.from('paw_card_entries').select('id, created_at, full_name, email, amount_saved');
    if (period === 'month') {
      q = q.gte('created_at', startOfCurrentMonthIso());
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get('/establishments', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('paw_card_establishments')
      .select(`
        id,
        name,
        category,
        discount_headline,
        discount_conditions,
        description,
        opening_hours,
        saving_solo,
        saving_group,
        google_rating,
        google_maps_url,
        instagram_url,
        is_favourite,
        is_high_value,
        time_of_day,
        discount_code,
        cloudinary_public_id
      `)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get('/top-establishments', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.rpc('top_paw_card_establishments', { p_limit: 10 });
    if (error) throw new Error(error.message);
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

export { router as publicPawCardRoutes };
