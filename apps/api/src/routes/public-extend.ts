import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ExtendLookupRequestSchema, PublicExtendConfirmSchema, StaffExtendConfirmSchema, Permission } from '@lolas/shared';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { logger } from '../lib/logger.js';
import { sendRespondIoTemplateMessage } from '../services/respond-io-outbound.js';
import {
  escapeIlike,
  extDayCount,
  orderReferenceLookupVariants,
  resolveExtensionForRaw,
  resolveExtensionForActive,
} from './public-extend-helpers.js';

const router = Router();
const staffRouter = Router();
const EXTENSION_PAYMENT_ORIGIN = publicWebOriginFromEnv(
  process.env.WEB_URL,
  'http://localhost:3002',
);
const EXTENSION_TEMPLATE_CHANNEL_ID = Number(
  process.env.RESPOND_IO_EXTENSION_TEMPLATE_CHANNEL_ID ?? process.env.RESPOND_IO_WHATSAPP_CHANNEL_ID ?? 501809,
);
const EXTENSION_TEMPLATE_NAME = process.env.RESPOND_IO_EXTENSION_TEMPLATE_NAME ?? 'extension_recieved';
const EXTENSION_TEMPLATE_LANGUAGE = process.env.RESPOND_IO_EXTENSION_TEMPLATE_LANGUAGE ?? 'en';
const EXTENSION_TEMPLATE_BODY =
  "Hey {{1}}! Thanks so much for extending with us. More island time is always a good idea! 🌴\n\nYour new return date and time is {{2}}.\n\nYour extension has an outstanding balance of {{3}}. You're welcome to drop by and settle it with us, or we can send you a Wise payment link if that's easier.\n\nThanks again for extending. See you soon!";

const extendLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many extend lookup attempts. Please try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const extendConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many extend confirm attempts. Please try again later.' } },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// ── Shared helpers ──

function getDayBracketLabel(days: number): string {
  if (days <= 2) return '1–2 day rate';
  if (days <= 6) return '3–6 day rate';
  return '7+ day rate';
}

function buildExtensionPaymentUrl(orderReference: string): string {
  return `${EXTENSION_PAYMENT_ORIGIN}/book/extend/pay?ref=${encodeURIComponent(orderReference)}`;
}

function formatManilaDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatPhp(amount: number): string {
  return `PHP ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

async function sendExtensionReceivedMessage({
  orderReference,
  email,
  newDropoffDatetime,
  outstandingBalance,
}: {
  orderReference: string;
  email: string;
  newDropoffDatetime: string;
  outstandingBalance: number;
}): Promise<void> {
  const sb = getSupabaseClient();
  const refVariants = orderReferenceLookupVariants(orderReference);
  const trimmedEmail = email.trim().toLowerCase();

  const { data: existingLog } = await sb
    .from('extension_message_log')
    .select('id')
    .in('booking_reference', refVariants)
    .eq('new_dropoff_datetime', newDropoffDatetime)
    .limit(1);

  if (existingLog && existingLog.length > 0) {
    logger.info({ orderReference, newDropoffDatetime }, '[extend-whatsapp] Already sent - skipping');
    return;
  }

  let contact:
    | { bookingReference: string; customerName: string; customerMobile: string }
    | null = null;

  const { data: activeOrder } = await sb
    .from('orders')
    .select('booking_token, customers!inner(name, email, mobile)')
    .in('booking_token', refVariants)
    .maybeSingle();

  if (activeOrder) {
    const customer = Array.isArray(activeOrder.customers)
      ? activeOrder.customers[0]
      : activeOrder.customers;
    const customerEmail = (customer?.email as string | null | undefined)?.trim().toLowerCase();
    const name = (customer?.name as string | null | undefined)?.trim();
    const mobile = (customer?.mobile as string | null | undefined)?.trim();
    const ref = activeOrder.booking_token as string | null;
    if (customerEmail === trimmedEmail && name && mobile && ref) {
      contact = { bookingReference: ref, customerName: name, customerMobile: mobile };
    }
  }

  if (!contact) {
    const { data: rawOrder } = await sb
      .from('orders_raw')
      .select('order_reference, customer_name, customer_email, customer_mobile')
      .in('order_reference', refVariants)
      .ilike('customer_email', escapeIlike(trimmedEmail))
      .maybeSingle();

    const name = (rawOrder?.customer_name as string | null | undefined)?.trim();
    const mobile = (rawOrder?.customer_mobile as string | null | undefined)?.trim();
    const ref = rawOrder?.order_reference as string | null | undefined;
    if (name && mobile && ref) {
      contact = { bookingReference: ref, customerName: name, customerMobile: mobile };
    }
  }

  if (!contact) {
    logger.info({ orderReference, email }, '[extend-whatsapp] No customer mobile found - skipping');
    return;
  }

  const result = await sendRespondIoTemplateMessage({
    phone: contact.customerMobile,
    channelId: EXTENSION_TEMPLATE_CHANNEL_ID,
    templateName: EXTENSION_TEMPLATE_NAME,
    languageCode: EXTENSION_TEMPLATE_LANGUAGE,
    bodyText: EXTENSION_TEMPLATE_BODY,
    parameters: [
      contact.customerName,
      formatManilaDateTime(newDropoffDatetime),
      formatPhp(Math.max(0, outstandingBalance)),
    ],
    logContext: { ref: contact.bookingReference, newDropoffDatetime },
  });

  if (result.delivered) {
    await sb.from('extension_message_log').insert({
      booking_reference: contact.bookingReference,
      new_dropoff_datetime: newDropoffDatetime,
      sent_at: new Date().toISOString(),
    });
  }

  logger.info(
    { ref: contact.bookingReference, delivered: result.delivered },
    result.delivered ? '[extend-whatsapp] Extension message sent' : '[extend-whatsapp] Extension message simulated',
  );
}

// ── Public addon catalog (no auth — only returns id, name, price_one_time for active addons) ──

router.get('/addons', async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId?: string };
    if (!storeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'storeId is required' } });
      return;
    }
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('addons')
      .select('id, name, addon_type, price_one_time')
      .eq('is_active', true)
      .or(`store_id.eq.${storeId},store_id.is.null`);
    if (error) throw new Error(`Addon lookup failed: ${error.message}`);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

// ── Extension Payment Placeholder Summary ──

router.get('/payment-summary', extendLookupLimiter, async (req, res, next) => {
  try {
    const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    if (!ref) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'ref is required' },
      });
      return;
    }

    const sb = getSupabaseClient();
    const refVariants = orderReferenceLookupVariants(ref);
    let target: { source: 'active' | 'raw'; id: string; orderReference: string } | null = null;

    const { data: order } = await sb
      .from('orders')
      .select('id, booking_token')
      .in('booking_token', refVariants)
      .maybeSingle();

    if (order) {
      target = {
        source: 'active',
        id: (order as { id: string }).id,
        orderReference: (order as { booking_token: string | null }).booking_token ?? ref,
      };
    } else {
      const { data: rawOrder } = await sb
        .from('orders_raw')
        .select('id, order_reference')
        .in('order_reference', refVariants)
        .maybeSingle();
      if (rawOrder) {
        target = {
          source: 'raw',
          id: (rawOrder as { id: string }).id,
          orderReference: (rawOrder as { order_reference: string }).order_reference,
        };
      }
    }

    if (!target) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Booking not found' },
      });
      return;
    }

    let query = sb
      .from('payments')
      .select('amount')
      .eq('payment_type', 'extension')
      .eq('settlement_status', 'pending');

    query = target.source === 'active'
      ? query.eq('order_id', target.id)
      : query.eq('raw_order_id', target.id);

    const { data: payments, error } = await query;
    if (error) throw new Error(`Extension payment lookup failed: ${error.message}`);

    const pendingAmount = (payments ?? []).reduce(
      (sum, payment: { amount: number | string | null }) => sum + Number(payment.amount ?? 0),
      0,
    );

    res.json({
      success: true,
      data: {
        found: true,
        orderReference: target.orderReference,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        paymentAvailable: false,
        provider: 'xendit',
        message: 'Online extension payment is coming soon. You can still pay this balance when you return.',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Lookup ──

router.post('/lookup', extendLookupLimiter, validateBody(ExtendLookupRequestSchema), async (req, res, next) => {
  try {
    const { email, orderReference } = req.body as { email: string; orderReference: string };
    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    const refVariants = orderReferenceLookupVariants(orderReference);

    // 1. Block extensions on raw (unactivated) bookings — the rental
    // hasn't started yet, so there is nothing to extend.
    const { data: rawRows, error: rawErr } = await sb
      .from('orders_raw')
      .select('id')
      .in('order_reference', refVariants)
      .ilike('customer_email', escapeIlike(trimmedEmail))
      .in('status', ['unprocessed']);

    if (rawErr) throw new Error(`orders_raw lookup failed: ${rawErr.message}`);

    if (rawRows && rawRows.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_NOT_ACTIVE',
          message: 'Extensions are only available once your rental has started. Please contact us if you need to make changes to your booking.',
        },
      });
      return;
    }

    // 2. Check processed orders via orders + customers
    const { data: custRows, error: cErr } = await sb
      .from('customers').select('id, name').ilike('email', escapeIlike(trimmedEmail)).limit(10);
    if (cErr) throw new Error(`customer lookup failed: ${cErr.message}`);
    const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);
    const custNameById = new Map<string, string>();
    for (const c of (custRows ?? []) as Array<{ id: string; name?: string | null }>) {
      if (c.name) custNameById.set(c.id, c.name);
    }

    if (custIds.length > 0) {
      const { data: orderRows, error: oErr } = await sb
        .from('orders')
        .select('id, order_date, status, customer_id, booking_token, final_total')
        .in('customer_id', custIds)
        .eq('status', 'active')
        .in('booking_token', refVariants);
      if (oErr) throw new Error(`orders lookup failed: ${oErr.message}`);

      for (const ord of (orderRows ?? []) as Array<Record<string, unknown>>) {
        const { data: items } = await sb
          .from('order_items')
          .select('vehicle_id, pickup_datetime, dropoff_datetime, store_id, rental_days_count, pickup_location_id, dropoff_location_id, dropoff_fee')
          .eq('order_id', ord.id as string)
          .not('pickup_datetime', 'is', null);

        if (!items || items.length === 0) continue;
        const item = items[0] as Record<string, unknown>;

        const storeId = item.store_id as string;
        let modelName = 'Vehicle';
        let modelId = '';

        if (item.vehicle_id) {
          const { data: veh } = await sb.from('fleet').select('model_id').eq('id', item.vehicle_id as string).single();
          if (veh) {
            modelId = (veh as { model_id: string }).model_id;
            const { data: mdl } = await sb.from('vehicle_models').select('name').eq('id', modelId).single();
            if (mdl) modelName = (mdl as { name: string }).name;
          }
        }

        const pickup = new Date(item.pickup_datetime as string);
        const dropoff = new Date(item.dropoff_datetime as string);
        const days = (item.rental_days_count as number) ?? Math.max(1, Math.ceil((dropoff.getTime() - pickup.getTime()) / 86400000));

        // Fetch all active locations for the store (matching config-repo: includes store_id=null global locs)
        const { data: allLocs } = await sb
          .from('locations')
          .select('id, name, delivery_cost, collection_cost, location_type')
          .eq('is_active', true)
          .or(`store_id.eq.${storeId},store_id.is.null`)
          .order('name');

        const locsArr = (allLocs ?? []) as Array<{ id: number; name: string; delivery_cost: number; collection_cost: number; location_type: string | null }>;
        const locsById = new Map(locsArr.map((l) => [l.id, l]));

        // Resolve pickup location name from actual pickup_location_id on the order item
        const pickupLocId = item.pickup_location_id != null ? Number(item.pickup_location_id) : null;
        const pickupLocationName = (pickupLocId != null ? locsById.get(pickupLocId)?.name : null) ?? 'General Luna';

        // Resolve current dropoff location. Some older orders have dropoff_location_id = null
        // (location wasn't recorded at activation). In that case, fall back to the store location
        // (collection_cost = 0, location_type = 'store') so the picker shows a sensible default.
        const rawDropoffLocId = item.dropoff_location_id != null ? Number(item.dropoff_location_id) : null;
        const storeLoc = locsArr.find(
          (l) => Number(l.collection_cost) === 0 && (l.location_type === 'store' || l.location_type === null),
        );
        const currentDropoffLocationId = rawDropoffLocId ?? storeLoc?.id ?? null;

        // Fetch existing order add-ons
        const { data: orderAddons } = await sb
          .from('order_addons')
          .select('addon_name, addon_price, addon_type, quantity, total_amount')
          .eq('order_id', ord.id as string);

        const currentOrderAddons = ((orderAddons ?? []) as Array<Record<string, unknown>>).map((a) => ({
          addonName: a.addon_name as string,
          addonPrice: Number(a.addon_price ?? 0),
          addonType: (a.addon_type as 'per_day' | 'one_time') ?? 'one_time',
          quantity: Number(a.quantity ?? 1),
          totalAmount: Number(a.total_amount ?? 0),
        }));

        res.json({
          success: true,
          data: {
            found: true,
            order: {
              orderReference: (ord.booking_token as string) || orderReference,
              customerName: custNameById.get(ord.customer_id as string) ?? null,
              vehicleModelName: modelName,
              vehicleModelId: modelId,
              storeId,
              currentDropoffDatetime: item.dropoff_datetime as string,
              pickupLocationName,
              originalTotal: Number((ord as Record<string, unknown>).final_total ?? 0),
              rentalDays: days,
              currentOrderAddons,
              currentDropoffLocationId,
              currentDropoffFee: Number(item.dropoff_fee ?? 0),
              availableLocations: locsArr.map((l) => ({
                id: l.id,
                name: l.name,
                deliveryCost: Number(l.delivery_cost ?? 0),
                collectionCost: Number(l.collection_cost ?? 0),
                locationType: l.location_type ?? null,
              })),
            },
          },
        });
        return;
      }
    }

    res.json({ success: true, data: { found: false } });
  } catch (err) {
    next(err);
  }
});

// ── Preview Extension (read-only, no DB writes) ──

router.get('/preview', extendLookupLimiter, async (req, res, next) => {
  try {
    const { orderReference, email, newDropoffDatetime } = req.query as {
      orderReference?: string; email?: string; newDropoffDatetime?: string;
    };

    if (!orderReference || !email || !newDropoffDatetime) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'orderReference, email, and newDropoffDatetime are required' } });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    const newDropoff = new Date(newDropoffDatetime);
    const refVariants = orderReferenceLookupVariants(orderReference);

    // ── Block extensions on raw (unactivated) bookings ──
    const { data: rawRows } = await sb
      .from('orders_raw')
      .select('id')
      .in('order_reference', refVariants)
      .ilike('customer_email', escapeIlike(trimmedEmail))
      .in('status', ['unprocessed']);

    if (rawRows && rawRows.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_NOT_ACTIVE',
          message: 'Extensions are only available once your rental has started. Please contact us if you need to make changes to your booking.',
        },
      });
      return;
    }

    // ── Try processed orders ──
    const { data: custRows } = await sb.from('customers').select('id').ilike('email', escapeIlike(trimmedEmail)).limit(10);
    const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);

    if (custIds.length > 0) {
      const { data: orderRows } = await sb
        .from('orders')
        .select('id, customer_id, store_id, booking_token')
        .in('customer_id', custIds)
        .eq('status', 'active')
        .in('booking_token', refVariants);

      for (const ord of (orderRows ?? []) as Array<{ id: string; customer_id: string; store_id: string }>) {
        const { data: items } = await sb
          .from('order_items')
          .select('id, vehicle_id, pickup_datetime, dropoff_datetime, store_id, rental_days_count, rental_rate')
          .eq('order_id', ord.id).not('pickup_datetime', 'is', null);

        const item = (items ?? [])[0] as Record<string, unknown> | undefined;
        if (!item) continue;

        const currentDropoff = new Date(item.dropoff_datetime as string);
        if (newDropoff <= currentDropoff) {
          res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'New return date must be after the current return date.' } });
          return;
        }

        let modelId = '';
        if (item.vehicle_id) {
          const { data: veh } = await sb.from('fleet').select('model_id').eq('id', item.vehicle_id as string).single();
          if (veh) modelId = (veh as { model_id: string }).model_id;
        }

        if (modelId) {
          const avail = await checkAvailability(
            { bookingPort: req.app.locals.deps.bookingPort },
            {
              storeId: item.store_id as string,
              pickupDatetime: item.dropoff_datetime as string,
              dropoffDatetime: newDropoffDatetime,
              excludeOrderItemId: item.id as string,
            },
          );
          const m = avail.find((a) => a.modelId === modelId);
          if (!m || m.availableCount === 0) {
            res.status(409).json({ success: false, error: { code: 'NOT_AVAILABLE', message: 'Sorry, this vehicle is not available for the extended dates.' } });
            return;
          }
        }

        const storeId = item.store_id as string;
        const locRows = await req.app.locals.deps.configRepo.getLocations(storeId);
        const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
          Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
        );
        const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);

        const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());
        const origDailyRate = Number(item.rental_rate ?? 0);
        let dailyRate = 0;

        if (modelId) {
          const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
            storeId, vehicleModelId: modelId,
            pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
            pickupLocationId: locId, dropoffLocationId: locId,
          });
          const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
          // Daily rate = bracket rate for extension days, capped at the original rate
          // (never higher), but if the extension bracket is cheaper the customer keeps it.
          dailyRate = Math.round((origDailyRate > 0 ? Math.min(computedExtDailyRate, origDailyRate) : computedExtDailyRate) * 100) / 100;
        } else if (origDailyRate > 0) {
          // Model ID unavailable (e.g. fleet record missing model_id) — fall back to the
          // stored original daily rate so the preview shows the correct charge instead of ₱0.
          dailyRate = origDailyRate;
        }

        res.json({
          success: true,
          data: {
            extensionDays: extDays,
            dailyRate,
            extensionTotal: Math.round(dailyRate * extDays * 100) / 100,
            bracketLabel: getDayBracketLabel(extDays),
          },
        });
        return;
      }
    }

    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found. Please check the order reference and email.' } });
  } catch (err) {
    next(err);
  }
});

// ── Confirm Extension (public) ──

router.post('/confirm', extendConfirmLimiter, validateBody(PublicExtendConfirmSchema), async (req, res, next) => {
  try {
    const {
      orderReference, email, newDropoffDatetime, ninePmAddonId,
      newOneTimeAddonIds, newDropoffLocationId, newDropoffLocationAddress,
    } = req.body as {
      orderReference: string;
      email: string;
      newDropoffDatetime: string;
      ninePmAddonId?: number;
      newOneTimeAddonIds?: number[];
      newDropoffLocationId?: number;
      newDropoffLocationAddress?: string;
    };
    const trimmedEmail = email.trim().toLowerCase();
    const deps = req.app.locals.deps;

    // Block extensions on raw (unactivated) bookings — the rental hasn't
    // started yet, so there is nothing to extend.
    const sb = getSupabaseClient();
    const refVariants = orderReferenceLookupVariants(orderReference);
    const { data: rawMatches } = await sb
      .from('orders_raw')
      .select('id')
      .in('order_reference', refVariants)
      .ilike('customer_email', escapeIlike(trimmedEmail))
      .in('status', ['unprocessed']);
    if (rawMatches && rawMatches.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORDER_NOT_ACTIVE',
          message: 'Extensions are only available once your rental has started. Please contact us if you need to make changes to your booking.',
        },
      });
      return;
    }

    // Try active (orders table) first — an activated order always has an
    // orders_raw row with status 'processed', so checking raw first would
    // write to the wrong table and leave the backoffice out of sync.
    const activeOutcome = await resolveExtensionForActive({
      orderReference,
      trimmedEmail,
      newDropoffDatetime,
      overrideDailyRate: undefined,
      isPaid: false,
      paymentMethodId: 'pending',
      emailErrorLabel: '[extend-email] Active path error:',
      ninePmAddonId,
      newOneTimeAddonIds,
      newDropoffLocationId,
      newDropoffLocationAddress,
      deps,
    });
    if (activeOutcome.kind === 'error') {
      res.json({ success: true, data: { success: false, reason: activeOutcome.reason } });
      return;
    }
    if (activeOutcome.kind === 'success') {
      void sendExtensionReceivedMessage({
        orderReference,
        email: trimmedEmail,
        newDropoffDatetime: activeOutcome.newDropoffDatetime,
        outstandingBalance: activeOutcome.outstandingBalance,
      }).catch((err) => {
        logger.warn(
          { orderReference, error: err instanceof Error ? err.message : String(err) },
          '[extend-whatsapp] Failed to send active extension message',
        );
      });

      res.json({
        success: true,
        data: {
          success: true,
          newDropoffDatetime: activeOutcome.newDropoffDatetime,
          extensionCost: activeOutcome.extensionCost,
          extensionDays: activeOutcome.extensionDays,
          paymentUrl: buildExtensionPaymentUrl(orderReference),
        },
      });
      return;
    }

    // Fall back to raw path (booking made on website but not yet activated).
    const rawOutcome = await resolveExtensionForRaw({
      orderReference,
      trimmedEmail,
      newDropoffDatetime,
      overrideDailyRate: undefined,
      isPaid: false,
      paymentMethodId: 'pending',
      emailErrorLabel: '[extend-email] Raw path error:',
      deps,
    });
    if (rawOutcome.kind === 'error') {
      res.json({ success: true, data: { success: false, reason: rawOutcome.reason } });
      return;
    }
    if (rawOutcome.kind === 'success') {
      void sendExtensionReceivedMessage({
        orderReference,
        email: trimmedEmail,
        newDropoffDatetime: rawOutcome.newDropoffDatetime,
        outstandingBalance: rawOutcome.outstandingBalance,
      }).catch((err) => {
        logger.warn(
          { orderReference, error: err instanceof Error ? err.message : String(err) },
          '[extend-whatsapp] Failed to send raw extension message',
        );
      });

      res.json({
        success: true,
        data: {
          success: true,
          newDropoffDatetime: rawOutcome.newDropoffDatetime,
          extensionCost: rawOutcome.extensionCost,
          paymentUrl: buildExtensionPaymentUrl(orderReference),
        },
      });
      return;
    }

    res.json({ success: true, data: { success: false, reason: 'Booking not found. Please check your details and try again.' } });
  } catch (err) {
    next(err);
  }
});

// ── Staff Extend Confirm (authenticated, supports overrideDailyRate + payment) ──

staffRouter.post(
  '/confirm',
  authenticate,
  requirePermission(Permission.EditOrders),
  validateBody(StaffExtendConfirmSchema),
  async (req, res, next) => {
    try {
      const {
        orderReference,
        email,
        newDropoffDatetime,
        overrideDailyRate,
        paymentStatus,
        paymentMethod,
        newOneTimeAddonIds,
        newPerDayAddonIds,
        newDropoffLocationId,
        newDropoffLocationAddress,
      } = req.body as {
        orderReference: string;
        email: string;
        newDropoffDatetime: string;
        overrideDailyRate?: number;
        paymentStatus?: 'paid' | 'unpaid';
        paymentMethod?: string;
        paymentAccountId?: string;
        newOneTimeAddonIds?: number[];
        newPerDayAddonIds?: number[];
        newDropoffLocationId?: number;
        newDropoffLocationAddress?: string;
      };

      const isPaid = paymentStatus === 'paid';
      const effectivePaymentMethodId = isPaid && paymentMethod ? paymentMethod : 'pending';

      const trimmedEmail = email.trim().toLowerCase();
      const deps = req.app.locals.deps;

      const activeOutcome = await resolveExtensionForActive({
        orderReference,
        trimmedEmail,
        newDropoffDatetime,
        overrideDailyRate,
        isPaid,
        paymentMethodId: effectivePaymentMethodId,
        emailErrorLabel: '[extend-email] Staff active path error:',
        newOneTimeAddonIds,
        newPerDayAddonIds,
        newDropoffLocationId,
        newDropoffLocationAddress,
        deps,
      });
      if (activeOutcome.kind === 'error') {
        res.json({ success: true, data: { success: false, reason: activeOutcome.reason } });
        return;
      }
      if (activeOutcome.kind === 'success') {
        void sendExtensionReceivedMessage({
          orderReference,
          email: trimmedEmail,
          newDropoffDatetime: activeOutcome.newDropoffDatetime,
          outstandingBalance: activeOutcome.outstandingBalance,
        }).catch((err) => {
          logger.warn(
            { orderReference, error: err instanceof Error ? err.message : String(err) },
            '[extend-whatsapp] Failed to send staff active extension message',
          );
        });

        res.json({
          success: true,
          data: {
            success: true,
            newDropoffDatetime: activeOutcome.newDropoffDatetime,
            extensionCost: activeOutcome.extensionCost,
            extensionDays: activeOutcome.extensionDays,
          },
        });
        return;
      }

      const rawOutcome = await resolveExtensionForRaw({
        orderReference,
        trimmedEmail,
        newDropoffDatetime,
        overrideDailyRate,
        isPaid,
        paymentMethodId: effectivePaymentMethodId,
        emailErrorLabel: '[extend-email] Staff raw path error:',
        deps,
      });
      if (rawOutcome.kind === 'error') {
        res.json({ success: true, data: { success: false, reason: rawOutcome.reason } });
        return;
      }
      if (rawOutcome.kind === 'success') {
        void sendExtensionReceivedMessage({
          orderReference,
          email: trimmedEmail,
          newDropoffDatetime: rawOutcome.newDropoffDatetime,
          outstandingBalance: rawOutcome.outstandingBalance,
        }).catch((err) => {
          logger.warn(
            { orderReference, error: err instanceof Error ? err.message : String(err) },
            '[extend-whatsapp] Failed to send staff raw extension message',
          );
        });

        res.json({ success: true, data: { success: true, newDropoffDatetime: rawOutcome.newDropoffDatetime, extensionCost: rawOutcome.extensionCost } });
        return;
      }

      res.json({ success: true, data: { success: false, reason: 'Booking not found. Please check your details and try again.' } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as publicExtendRoutes, staffRouter as staffExtendRoutes };
