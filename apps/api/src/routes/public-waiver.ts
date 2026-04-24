import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { sendEmail, waiverConfirmationHtml, escapeHtml } from '../services/email.js';
import { normalizePublicWebOrigin, publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { formatManilaDateTime } from '../utils/manila-date.js';

const waiverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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
  driverEmail: z.string().email({ message: 'A valid email address is required' }),
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
      'order_reference, customer_name, customer_email, vehicle_model_id, pickup_datetime, dropoff_datetime, store_id, status',
    )
    .eq('order_reference', orderReference)
    .in('status', ['unprocessed', 'processed'])
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`orders_raw lookup failed: ${error.message}`);
  return data as Record<string, unknown> | null;
}

/**
 * Fallback for orders created via walk-in-direct, which bypass orders_raw entirely
 * and are stored directly in the orders + order_items + customers tables.
 */
async function fetchDirectOrderByBookingToken(bookingToken: string) {
  const sb = getSupabaseClient();
  const { data: orderRow, error: orderErr } = await sb
    .from('orders')
    .select('id, store_id, customer_id, status, booking_token')
    .eq('booking_token', bookingToken)
    .not('status', 'in', '("cancelled","completed")')
    .limit(1)
    .maybeSingle();

  if (orderErr) throw new Error(`orders lookup failed: ${orderErr.message}`);
  if (!orderRow) return null;

  const row = orderRow as { id: string; store_id: string; customer_id: string | null; status: string; booking_token: string };

  const [custResult, itemResult] = await Promise.all([
    row.customer_id
      ? sb.from('customers').select('name, email').eq('id', row.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb
      .from('order_items')
      .select('vehicle_name, pickup_datetime, dropoff_datetime')
      .eq('order_id', row.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (custResult.error) throw new Error(`customers lookup failed: ${custResult.error.message}`);
  if (itemResult.error) throw new Error(`order_items lookup failed: ${itemResult.error.message}`);

  const cust = custResult.data as { name?: string; email?: string | null } | null;
  const item = itemResult.data as { vehicle_name?: string | null; pickup_datetime?: string | null; dropoff_datetime?: string | null } | null;

  return {
    order_reference: row.booking_token,
    customer_name: cust?.name ?? '',
    customer_email: cust?.email ?? null,
    vehicle_model_id: null,
    vehicle_name_direct: item?.vehicle_name ?? null,
    pickup_datetime: item?.pickup_datetime ?? null,
    dropoff_datetime: item?.dropoff_datetime ?? null,
    store_id: row.store_id,
    status: row.status,
  };
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

async function resolveOrder(orderReference: string) {
  const raw = await fetchOrdersRawByReference(orderReference);
  if (raw) return raw;
  return fetchDirectOrderByBookingToken(orderReference);
}

// Register before /:orderReference so "send-link" is not captured as a reference.
waiverRouter.post(
  '/send-link',
  authenticate,
  requirePermission(Permission.EditOrders),
  validateBody(SendLinkBodySchema),
  async (req, res, next) => {
    try {
      const { orderReference } = req.body as z.infer<typeof SendLinkBodySchema>;
      const order = await resolveOrder(orderReference);
      if (!order) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
        return;
      }

      const rawWeb = process.env.WEB_URL;
      if (!rawWeb?.trim()) {
        res.status(500).json({
          success: false,
          error: { code: 'CONFIG_ERROR', message: 'WEB_URL is not configured' },
        });
        return;
      }

      const base = normalizePublicWebOrigin(rawWeb);
      res.json({
        success: true,
        data: { url: `${base}/waiver/${encodeURIComponent(orderReference)}` },
      });
    } catch (err) {
      next(err);
    }
  },
);

waiverRouter.get('/:orderReference', async (req, res, next) => {
  try {
    const orderReference = routeParamString(req.params.orderReference);
    const order = await resolveOrder(orderReference);
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

    const orderWithDirect = order as typeof order & { vehicle_name_direct?: string | null };
    const vehicleModelName = orderWithDirect.vehicle_name_direct
      ? String(orderWithDirect.vehicle_name_direct)
      : await fetchVehicleModelName(order.vehicle_model_id as string | undefined);

    res.json({
      success: true,
      data: {
        orderReference,
        customerName: (order.customer_name as string) ?? '',
        customerEmail: (order.customer_email as string | null) ?? null,
        vehicleModelName,
        pickupDatetime: order.pickup_datetime as string,
        dropoffDatetime: order.dropoff_datetime as string,
        waiverStatus: isSigned ? 'signed' : 'pending',
        signedAt: isSigned && waiver?.agreed_at ? String(waiver.agreed_at) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

waiverRouter.post('/:orderReference/sign', validateBody(WaiverSignBodySchema), async (req, res, next) => {
  try {
    const orderReference = routeParamString(req.params.orderReference);
    const body = req.body as z.infer<typeof WaiverSignBodySchema>;

    const order = await resolveOrder(orderReference);
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

    // Fire-and-forget Ops channel Telegram alert.
    void sendTelegramAlert(
      `📋 <b>Waiver Signed</b>\n` +
        `Reference: ${escapeHtml(orderReference)}\n` +
        `Customer: ${escapeHtml(body.driverName)}\n` +
        `Signed at: ${escapeHtml(formatManilaDateTime(row.agreed_at))}`,
      getTelegramChatId('ops'),
    );

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
          waiverAgreementUrl: `${publicWebOriginFromEnv(process.env.WEB_URL)}/book/waiver-agreement`,
        }),
      });
    })();

    res.status(201).json({
      success: true,
      data: { waiverId: row.id, signedAt: row.agreed_at },
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
      const order = await resolveOrder(orderReference);
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

      res.json({ success: true, data: { url: signed.signedUrl } });
    } catch (uploadError) {
      next(uploadError);
    }
  });
});

export { waiverRouter };
