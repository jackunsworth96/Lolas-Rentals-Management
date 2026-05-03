import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { sendEmail, bookingCancellationHtml, escapeHtml } from '../services/email.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { SubmitDirectBookingRequestSchema, type SubmitDirectBookingInput } from '@lolas/shared';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { createHold } from '../use-cases/booking/create-hold.js';
import { releaseHold } from '../use-cases/booking/release-hold.js';
import { submitDirectBooking, type SubmitDirectBookingResult } from '../use-cases/booking/submit-direct-booking.js';

const holdLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many hold requests. Please try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const cancelLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many cancel attempts. Please try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const router = Router();

const AvailabilityQuerySchema = z.object({
  storeId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
});

router.get('/model-pricing', async (req, res, next) => {
  try {
    const { storeId, vehicleModelId } = req.query as {
      storeId?: string;
      vehicleModelId?: string;
    };
    if (!storeId || !vehicleModelId) {
      res.status(400).json({ success: false, error: 'storeId and vehicleModelId required' });
      return;
    }
    const { configRepo } = req.app.locals.deps;
    const tiers = await configRepo.getModelPricing(vehicleModelId, storeId);
    const minRate = tiers.length > 0
      ? Math.min(...tiers.map((t: { dailyRate: number }) => Number(t.dailyRate)))
      : null;
    res.json({ success: true, data: { minDailyRate: minRate, tiers } });
  } catch (err) { next(err); }
});

router.get('/models', async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId?: string };
    if (!storeId) {
      res.status(400).json({ success: false, error: 'storeId required' });
      return;
    }
    const { configRepo, fleetRepo } = req.app.locals.deps;
    const [vehicles, models, pricingRows] = await Promise.all([
      fleetRepo.findByStore(storeId) as Promise<Array<{ modelId: string | null }>>,
      configRepo.getVehicleModels() as Promise<Array<{ id: string; name: string }>>,
      configRepo.getStorePricing(storeId) as Promise<Array<{ modelId: string; dailyRate: number }>>,
    ]);
    // Only include models that have at least one fleet vehicle at this store
    const storeModelIds = new Set(
      vehicles.filter((v) => v.modelId != null).map((v) => v.modelId as string),
    );
    const result = models
      .filter((m) => storeModelIds.has(m.id))
      .map((m) => {
        const rows = pricingRows.filter((p) => p.modelId === m.id);
        const minRate = rows.length > 0 ? Math.min(...rows.map((r) => Number(r.dailyRate))) : null;
        return { id: m.id, name: m.name, minDailyRate: minRate };
      });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/availability', validateQuery(AvailabilityQuerySchema), async (req, res, next) => {
  try {
    const { storeId, pickupDatetime, dropoffDatetime } = req.query as {
      storeId: string;
      pickupDatetime: string;
      dropoffDatetime: string;
    };

    const data = await checkAvailability(
      { bookingPort: req.app.locals.deps.bookingPort },
      { storeId, pickupDatetime, dropoffDatetime },
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const QuoteQuerySchema = z.object({
  storeId: z.string().min(1),
  vehicleModelId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  pickupLocationId: z.coerce.number().int().positive(),
  dropoffLocationId: z.coerce.number().int().positive(),
  addonIds: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : undefined,
    ),
});

router.get('/quote', validateQuery(QuoteQuerySchema), async (req, res, next) => {
  try {
    const {
      storeId,
      vehicleModelId,
      pickupDatetime,
      dropoffDatetime,
      pickupLocationId,
      dropoffLocationId,
      addonIds,
    } = req.query as unknown as {
      storeId: string;
      vehicleModelId: string;
      pickupDatetime: string;
      dropoffDatetime: string;
      pickupLocationId: number;
      dropoffLocationId: number;
      addonIds?: number[];
    };

    const data = await computeQuote(
      { configRepo: req.app.locals.deps.configRepo },
      {
        storeId,
        vehicleModelId,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId,
        dropoffLocationId,
        addonIds,
      },
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── Holds ──

const CreateHoldBodySchema = z.object({
  vehicleModelId: z.string().min(1),
  storeId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  sessionToken: z.string().min(20),
});

router.post('/hold', holdLimiter, validateBody(CreateHoldBodySchema), async (req, res, next) => {
  try {
    const { vehicleModelId, storeId, pickupDatetime, dropoffDatetime, sessionToken } = req.body as {
      vehicleModelId: string;
      storeId: string;
      pickupDatetime: string;
      dropoffDatetime: string;
      sessionToken: string;
    };

    const hold = await createHold(
      { bookingPort: req.app.locals.deps.bookingPort },
      { vehicleModelId, storeId, pickupDatetime, dropoffDatetime, sessionToken },
    );

    res.status(201).json({
      success: true,
      data: {
        holdId: hold.id,
        sessionToken: hold.sessionToken,
        expiresAt: hold.expiresAt,
      },
    });

    void (async () => {
      try {
        const { getSupabaseClient } = await import('../adapters/supabase/client.js');
        const sb = getSupabaseClient();
        const deviceType = detectDeviceType(req.headers['user-agent']);

        const { data: existing } = await sb
          .from('booking_sessions')
          .select('basket_items')
          .eq('session_token', sessionToken)
          .maybeSingle();

        const currentItems: string[] = Array.isArray(existing?.basket_items) ? existing.basket_items as string[] : [];
        const updatedItems = currentItems.includes(vehicleModelId)
          ? currentItems
          : [...currentItems, vehicleModelId];

        await sb.from('booking_sessions').upsert(
          {
            session_token: sessionToken,
            store_id: storeId,
            pickup_datetime: pickupDatetime,
            dropoff_datetime: dropoffDatetime,
            basket_items: updatedItems,
            device_type: deviceType,
          },
          { onConflict: 'session_token' },
        );
        await sb.rpc('increment_booking_interaction', { p_session_token: sessionToken });
      } catch (err) {
        console.error('[booking_sessions] hold upsert failed:', err);
      }
    })();
  } catch (err) {
    next(err);
  }
});

const ReleaseHoldBodySchema = z.object({
  sessionToken: z.string().min(1),
});

router.delete('/hold/:holdId', validateBody(ReleaseHoldBodySchema), async (req, res, next) => {
  try {
    const deleted = await releaseHold(
      { bookingPort: req.app.locals.deps.bookingPort },
      { holdId: req.params.holdId as string, sessionToken: req.body.sessionToken },
    );

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Hold not found or session token mismatch' },
      });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/hold/:sessionToken', async (req, res, next) => {
  try {
    const holds = await req.app.locals.deps.bookingPort.findActiveHoldsBySession(
      req.params.sessionToken,
    );

    res.json({ success: true, data: holds });
  } catch (err) {
    next(err);
  }
});

// ── Session tracking ──

const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many session updates.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const UpdateSessionBodySchema = z.object({
  sessionToken: z.string().min(20),
  basketViewed: z.boolean().optional(),
  renterDetailsStarted: z.boolean().optional(),
  renterDetails: z
    .object({
      fullName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      nationality: z.string().optional(),
      accommodationName: z.string().optional(),
      company: z.string().optional(),
      extraComments: z.string().optional(),
    })
    .optional(),
});

router.patch('/session', sessionLimiter, validateBody(UpdateSessionBodySchema), async (req, res, next) => {
  try {
    const { sessionToken, basketViewed, renterDetailsStarted, renterDetails } =
      req.body as z.infer<typeof UpdateSessionBodySchema>;

    const updates: Record<string, unknown> = {};
    if (basketViewed) updates.basket_viewed_at = new Date().toISOString();
    if (renterDetailsStarted) updates.renter_details_started_at = new Date().toISOString();
    if (renterDetails !== undefined) updates.renter_details = renterDetails;

    if (Object.keys(updates).length === 0) {
      res.json({ success: true });
      return;
    }

    const { getSupabaseClient } = await import('../adapters/supabase/client.js');
    const sb = getSupabaseClient();

    await sb
      .from('booking_sessions')
      .update(updates)
      .eq('session_token', sessionToken);

    if (basketViewed || renterDetailsStarted) {
      void sb.rpc('increment_booking_interaction', { p_session_token: sessionToken });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Submit ──

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many booking submissions. Please try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function detectDeviceType(userAgent: string | undefined): 'mobile' | 'desktop' {
  if (!userAgent) return 'desktop';
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone|Opera Mini|IEMobile/i.test(userAgent)
    ? 'mobile'
    : 'desktop';
}

router.post('/submit', submitLimiter, validateBody(SubmitDirectBookingRequestSchema), async (req, res, next) => {
  try {
    const deviceType = detectDeviceType(req.headers['user-agent']);
    const body = req.body as SubmitDirectBookingInput;
    const result: SubmitDirectBookingResult = await submitDirectBooking(
      {
        bookingPort: req.app.locals.deps.bookingPort,
        configRepo: req.app.locals.deps.configRepo,
        transferRepo: req.app.locals.deps.transferRepo,
        accountingPort: req.app.locals.deps.accountingPort,
      },
      body,
      { deviceType },
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        orderReference: result.orderReference,
        serverQuote: result.serverQuote ?? null,
        charityDonation: result.charityDonation,
      },
    });

    void (async () => {
      try {
        const sessionToken = (body as Record<string, unknown>).sessionToken as string | undefined;
        if (!sessionToken) return;
        const { getSupabaseClient } = await import('../adapters/supabase/client.js');
        const sb = getSupabaseClient();
        await Promise.all([
          sb
            .from('booking_sessions')
            .update({ submitted_at: new Date().toISOString() })
            .eq('session_token', sessionToken)
            .is('submitted_at', null),
          sb.rpc('increment_booking_interaction', { p_session_token: sessionToken }),
        ]);
      } catch (err) {
        console.error('[booking_sessions] submit update failed:', err);
      }
    })();
  } catch (err) {
    next(err);
  }
});

// ── Cancel (rollback for partial multi-vehicle failures) ──

router.patch('/cancel/:orderReference', cancelLimiter, async (req, res, next) => {
  try {
    const orderReference = req.params.orderReference as string;
    const { token } = req.query as { token?: string };
    if (!token || token.trim().length === 0) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Cancellation token is required.' },
      });
      return;
    }

    const { getSupabaseClient } = await import('../adapters/supabase/client.js');
    const sb = getSupabaseClient();

    const { data: orderRow, error: fetchErr } = await sb
      .from('orders_raw')
      .select('id, cancellation_token, cancellation_token_used, status')
      .eq('order_reference', orderReference)
      .eq('booking_channel', 'direct')
      .single();

    if (fetchErr || !orderRow) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
      return;
    }

    if (!orderRow.cancellation_token || orderRow.cancellation_token !== token.trim()) {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid cancellation token.' } });
      return;
    }

    if (orderRow.cancellation_token_used) {
      res.status(400).json({ success: false, error: { code: 'TOKEN_ALREADY_USED', message: 'This cancellation link has already been used.' } });
      return;
    }

    if (orderRow.status !== 'unprocessed') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_PROCESSED', message: 'This booking cannot be cancelled.' } });
      return;
    }

    const { data: updatedRow, error } = await sb
      .from('orders_raw')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: 'customer_request',
        cancellation_token_used: true,
      })
      .eq('id', orderRow.id)
      .eq('status', 'unprocessed')
      .eq('cancellation_token_used', false)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(`Cancel failed: ${error.message}`);
    if (!updatedRow) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TOKEN_ALREADY_USED',
          message: 'This cancellation link has already been used or the booking could not be found.',
        },
      });
      return;
    }
    res.json({ success: true });

    void (async () => {
      try {
        const formatManila = (iso: string) =>
          new Date(iso).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            dateStyle: 'medium',
            timeStyle: 'short',
          });

        const sb2 = getSupabaseClient();
        const { data: order } = await sb2
          .from('orders_raw')
          .select(`
            customer_name,
            customer_email,
            vehicle_model_id,
            pickup_datetime,
            dropoff_datetime,
            order_reference
          `)
          .eq('order_reference', orderReference)
          .single();

        // Fire-and-forget Ops channel Telegram alert (public self-service cancel).
        void sendTelegramAlert(
          `❌ <b>Order Cancelled</b>\n` +
            `Reference: ${escapeHtml(orderReference)}\n` +
            `Customer: ${escapeHtml(order?.customer_name ?? '—')}\n` +
            `Reason: customer_request`,
          getTelegramChatId('ops'),
        );

        if (!order?.customer_email) return;

        let vehicleName = order.vehicle_model_id;
        try {
          const { data: vm } = await sb2
            .from('vehicle_models')
            .select('name')
            .eq('id', order.vehicle_model_id)
            .single();
          if (vm?.name) vehicleName = vm.name;
        } catch { /* non-critical */ }

        void sendEmail({
          to: order.customer_email,
          subject: `Booking Cancelled — ${orderReference} | Lola's Rentals`,
          html: bookingCancellationHtml({
            orderReference,
            vehicleName,
            pickupDatetime: order.pickup_datetime
              ? formatManila(order.pickup_datetime)
              : undefined,
            dropoffDatetime: order.dropoff_datetime
              ? formatManila(order.dropoff_datetime)
              : undefined,
            whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
          }),
        });
      } catch (err) {
        console.error('[cancel-email] Public path:', err);
      }
    })();
  } catch (err) {
    next(err);
  }
});

// ── Addons (public) ──

const AddonsQuerySchema = z.object({
  storeId: z.string().min(1),
  vehicleModelId: z.string().optional(),
});

router.get('/addons', validateQuery(AddonsQuerySchema), async (req, res, next) => {
  try {
    const { storeId, vehicleModelId } = req.query as { storeId: string; vehicleModelId?: string };
    const allAddons = await req.app.locals.deps.configRepo.getAddons(storeId);
    const filtered = vehicleModelId
      ? allAddons.filter((a: { applicableModelIds?: string[] | null }) => {
          const ids = a.applicableModelIds;
          return !ids || ids.length === 0 || ids.includes(vehicleModelId);
        })
      : allAddons;
    res.json({ success: true, data: filtered });
  } catch (err) {
    next(err);
  }
});

// ── Locations (public) ──

const LocationsQuerySchema = z.object({
  storeId: z.string().min(1),
});

router.get('/locations', validateQuery(LocationsQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    const locations = await req.app.locals.deps.configRepo.getLocations(storeId);
    res.json({ success: true, data: locations });
  } catch (err) {
    next(err);
  }
});

// ── Payment Methods (public — id, name, surcharge only) ──

router.get('/payment-methods', async (req, res, next) => {
  try {
    const methods = await req.app.locals.deps.configRepo.getPaymentMethods();
    const publicMethods = methods
      .filter((m: { id: string; name: string; surchargePercent?: number; showOnCustomerWebsite?: boolean }) =>
        m.showOnCustomerWebsite !== false,
      )
      .map((m: { id: string; name: string; surchargePercent?: number }) => ({
        id: m.id,
        name: m.name,
        surchargePercent: m.surchargePercent ?? 0,
      }));
    res.json({ success: true, data: publicMethods });
  } catch (err) {
    next(err);
  }
});

// ── Order Lookup (public) ──

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  const first = parts[0];
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1][0]}.`;
}

router.get('/order/:reference', async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const email = req.query.email as string | undefined;

    if (!email) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'email is required' },
      });
      return;
    }

    const configRepo = req.app.locals.deps.configRepo;

    const { getSupabaseClient } = await import('../adapters/supabase/client.js');
    const supabase = getSupabaseClient();

    const { data: rows, error } = await supabase
      .from('orders_raw')
      .select('id, order_reference, customer_email, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, pickup_location_id, dropoff_location_id, addon_ids, transfer_type, flight_number, transfer_route, charity_donation, booking_channel, store_id, status')
      .eq('order_reference', reference)
      .eq('booking_channel', 'direct')
      .limit(1);

    if (error) throw new Error(`Order lookup failed: ${error.message}`);
    if (!rows || rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Booking not found' },
      });
      return;
    }

    const row = rows[0] as Record<string, unknown>;

    const storedEmail = ((row.customer_email as string) ?? '').trim().toLowerCase();
    if (storedEmail !== email.trim().toLowerCase()) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Booking not found' },
      });
      return;
    }

    const pickupDt = row.pickup_datetime as string;
    const dropoffDt = row.dropoff_datetime as string;
    const diffMs = new Date(dropoffDt).getTime() - new Date(pickupDt).getTime();
    const rentalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    let vehicleModelName = '';
    if (row.vehicle_model_id) {
      const { data: vm } = await supabase
        .from('vehicle_models')
        .select('name')
        .eq('id', row.vehicle_model_id as string)
        .single();
      if (vm) vehicleModelName = (vm as { name: string }).name;
    }

    let grandTotal = 0;
    let depositAmount = 0;
    try {
      const storeId = row.store_id as string;
      const modelId = row.vehicle_model_id as string;
      const pickupLocId = row.pickup_location_id as number;
      const dropoffLocId = row.dropoff_location_id as number;
      const quote = await computeQuote(
        { configRepo },
        { storeId, vehicleModelId: modelId, pickupDatetime: pickupDt, dropoffDatetime: dropoffDt, pickupLocationId: pickupLocId, dropoffLocationId: dropoffLocId },
      );
      grandTotal = quote.grandTotal ?? 0;
      depositAmount = quote.securityDeposit ?? 0;
    } catch { /* quote may fail for edge cases */ }

    const addonNames: string[] = [];
    const addonIds = row.addon_ids as number[] | null;
    if (addonIds && addonIds.length > 0) {
      const { data: addons } = await supabase
        .from('addons')
        .select('name')
        .in('id', addonIds);
      if (addons) {
        for (const a of addons as { name: string }[]) addonNames.push(a.name);
      }
    }

    res.json({
      success: true,
      data: {
        orderReferences: [row.order_reference as string],
        customerName: maskName(row.customer_name as string),
        customerEmail: maskEmail(row.customer_email as string),
        vehicleModelName,
        pickupDatetime: pickupDt,
        dropoffDatetime: dropoffDt,
        rentalDays,
        grandTotal,
        depositAmount,
        addonNames,
        transferType: row.transfer_type ?? null,
        flightNumber: row.flight_number ?? null,
        transferRoute: row.transfer_route ?? null,
        charityDonation: Number(row.charity_donation ?? 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Transfer Routes (public) ──

const TransferRoutesQuerySchema = z.object({
  storeId: z.string().min(1),
});

router.get('/transfer-routes', validateQuery(TransferRoutesQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    const routes = await req.app.locals.deps.configRepo.getTransferRoutes(storeId);
    res.json({ success: true, data: routes });
  } catch (err) {
    next(err);
  }
});

// ── POST /feedback (public — no auth) ────────────────────────────────────────

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many feedback submissions. Please try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const FeedbackSchema = z.object({
  orderReference: z.string().min(1).max(50),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  customerName: z.string().max(100).optional(),
  vehicleModelName: z.string().max(100).optional(),
});

router.post('/feedback', feedbackLimiter, validateBody(FeedbackSchema), async (req, res, next) => {
  try {
    const { orderReference, rating, comment, customerName, vehicleModelName } = req.body as z.infer<typeof FeedbackSchema>;

    const filledStar = '⭐';
    const emptyStar = '✩';
    const stars = filledStar.repeat(rating) + emptyStar.repeat(5 - rating);

    const lines: string[] = [
      `📝 <b>New Booking Feedback</b>`,
      `Reference: <code>${escapeHtml(orderReference)}</code>`,
    ];
    if (customerName) lines.push(`Customer: ${escapeHtml(customerName)}`);
    if (vehicleModelName) lines.push(`Vehicle: ${escapeHtml(vehicleModelName)}`);
    lines.push(`Rating: ${stars} (${rating}/5)`);
    if (comment?.trim()) lines.push(`\n💬 "${escapeHtml(comment.trim())}"`);

    void sendTelegramAlert(lines.join('\n'), getTelegramChatId('feedback'));

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /charity-impact (public — no auth) ───────────────────────────────────
router.get('/charity-impact', async (req, res, next) => {
  try {
    const { queryCharityImpact } = await import('./dashboard.js');
    const { getSupabaseClient } = await import('../adapters/supabase/client.js');
    const sb = getSupabaseClient();
    const impact = await queryCharityImpact(sb);
    res.json({ success: true, data: impact });
  } catch (err) {
    next(err);
  }
});

export { router as publicBookingRoutes };
