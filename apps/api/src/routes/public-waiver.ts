import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { sendEmail, waiverConfirmationHtml } from '../services/email.js';

const waiverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const LICENCE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_LICENCE_BYTES = 5 * 1024 * 1024;

const licenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LICENCE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (LICENCE_IMAGE_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WebP`));
    }
  },
});

const WaiverSignBodySchema = z.object({
  driverName: z.string().min(1),
  driverEmail: z.string().email().optional(),
  driverMobile: z.string().optional(),
  agreedToTerms: z.boolean().refine((v) => v === true),
  driverSignatureDataUrl: z.string().min(1),
  licenceFrontUrl: z.string().optional(),
  licenceBackUrl: z.string().optional(),
  passengerSignatures: z.array(z.string()).max(4).optional(),
});

const SendLinkBodySchema = z.object({
  orderReference: z.string().min(1),
});

function routeParamString(p: string | string[] | undefined): string {
  if (p == null) return '';
  return Array.isArray(p) ? (p[0] ?? '') : p;
}

function safeStorageSegment(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function fetchOrdersRawByReference(orderReference: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('orders_raw')
    .select(
      'order_reference, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, store_id, status',
    )
    .eq('order_reference', orderReference)
    .in('status', ['unprocessed', 'processed'])
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`orders_raw lookup failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

async function fetchVehicleModelName(modelId: string | null | undefined): Promise<string> {
  if (!modelId) return 'Vehicle';
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('vehicle_models').select('name').eq('id', modelId).maybeSingle();
  if (error) throw new Error(`vehicle_models lookup failed: ${error.message}`);
  return (data as { name?: string } | null)?.name ?? 'Vehicle';
}

const waiverRouter = Router();
waiverRouter.use(waiverLimiter);

// Register before /:orderReference so "send-link" is not captured as a reference.
waiverRouter.post(
  '/send-link',
  authenticate,
  requirePermission(Permission.EditOrders),
  validateBody(SendLinkBodySchema),
  async (req, res, next) => {
    try {
      const { orderReference } = req.body as z.infer<typeof SendLinkBodySchema>;
      const order = await fetchOrdersRawByReference(orderReference);
      if (!order) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
        return;
      }

      const base = (process.env.WEB_URL ?? '').replace(/\/$/, '');
      if (!base) {
        res.status(500).json({
          success: false,
          error: { code: 'CONFIG_ERROR', message: 'WEB_URL is not configured' },
        });
        return;
      }

      res.json({
        url: `${base}/waiver/${encodeURIComponent(orderReference)}`,
      });
    } catch (err) {
      next(err);
    }
  },
);

waiverRouter.get('/:orderReference', async (req, res, next) => {
  try {
    const orderReference = routeParamString(req.params.orderReference);
    const order = await fetchOrdersRawByReference(orderReference);
    if (!order) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }

    const sb = getSupabaseClient();
    const { data: waiverRows, error: wErr } = await sb
      .from('waivers')
      .select('status, agreed_at')
      .eq('order_reference', orderReference)
      .order('created_at', { ascending: false })
      .limit(1);

    if (wErr) throw new Error(`waivers lookup failed: ${wErr.message}`);

    const waiver = (waiverRows?.[0] ?? null) as { status?: string; agreed_at?: string } | null;
    const isSigned = waiver?.status === 'signed';

    const vehicleModelName = await fetchVehicleModelName(order.vehicle_model_id as string | undefined);

    res.json({
      orderReference,
      customerName: (order.customer_name as string) ?? '',
      vehicleModelName,
      pickupDatetime: order.pickup_datetime as string,
      dropoffDatetime: order.dropoff_datetime as string,
      waiverStatus: isSigned ? 'signed' : 'pending',
      signedAt: isSigned && waiver?.agreed_at ? String(waiver.agreed_at) : null,
    });
  } catch (err) {
    next(err);
  }
});

waiverRouter.post('/:orderReference/sign', validateBody(WaiverSignBodySchema), async (req, res, next) => {
  try {
    const orderReference = routeParamString(req.params.orderReference);
    const body = req.body as z.infer<typeof WaiverSignBodySchema>;

    const order = await fetchOrdersRawByReference(orderReference);
    if (!order) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }

    const sb = getSupabaseClient();
    const { data: signedExisting, error: signedErr } = await sb
      .from('waivers')
      .select('id')
      .eq('order_reference', orderReference)
      .eq('status', 'signed')
      .limit(1)
      .maybeSingle();

    if (signedErr) throw new Error(`waivers check failed: ${signedErr.message}`);
    if (signedExisting) {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'A signed waiver already exists for this order' },
      });
      return;
    }

    const ip = req.ip ?? (req.socket.remoteAddress as string | undefined) ?? null;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    const passengerSigs = body.passengerSignatures ?? [];

    const { data: inserted, error: insErr } = await sb
      .from('waivers')
      .insert({
        order_reference: orderReference,
        store_id: order.store_id as string,
        driver_name: body.driverName,
        driver_email: body.driverEmail ?? null,
        driver_mobile: body.driverMobile ?? null,
        agreed_to_terms: true,
        agreed_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
        licence_front_url: body.licenceFrontUrl ?? null,
        licence_back_url: body.licenceBackUrl ?? null,
        driver_signature_url: body.driverSignatureDataUrl,
        passenger_signatures: passengerSigs,
        status: 'signed',
      })
      .select('id, agreed_at')
      .single();

    if (insErr) throw new Error(`waivers insert failed: ${insErr.message}`);

    const row = inserted as { id: string; agreed_at: string };

    // Fire-and-forget confirmation email — never block the response.
    void (async () => {
      if (!body.driverEmail) return;
      await sendEmail({
        to: body.driverEmail,
        subject: `Waiver Signed — ${orderReference} | Lola's Rentals`,
        html: waiverConfirmationHtml({
          driverName: body.driverName,
          orderReference,
          signedAt: new Date().toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          hasLicence: !!(body.licenceFrontUrl),
          whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
        }),
      });
    })();

    res.status(201).json({
      success: true,
      waiverId: row.id,
      signedAt: row.agreed_at,
    });
  } catch (err) {
    next(err);
  }
});

waiverRouter.post('/:orderReference/upload-licence', (req, res, next) => {
  const sideRaw = typeof req.query.side === 'string' ? req.query.side.toLowerCase() : '';
  if (sideRaw !== 'front' && sideRaw !== 'back') {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Query parameter side must be "front" or "back"' },
    });
    return;
  }

  licenceUpload.single('file')(req, res, async (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
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
      const orderReference = routeParamString(req.params.orderReference);
      const order = await fetchOrdersRawByReference(orderReference);
      if (!order) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
        return;
      }

      const sb = getSupabaseClient();
      const safeRef = safeStorageSegment(orderReference);
      const ts = Date.now();
      const ext = extForMime(req.file.mimetype);
      const objectPath = `waiver-licence/${safeRef}/${sideRaw}-${ts}.${ext}`;

      const { error: uploadErr } = await sb.storage
        .from('waiver-documents')
        .upload(objectPath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data: signed, error: signErr } = await sb.storage
        .from('waiver-documents')
        .createSignedUrl(objectPath, 60 * 60 * 24 * 7);

      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message ?? 'Could not create signed URL');
      }

      res.json({ url: signed.signedUrl });
    } catch (uploadError) {
      next(uploadError);
    }
  });
});

export { waiverRouter };
