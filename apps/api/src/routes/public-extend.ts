import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  COMPANY_STORE_ID,
  ExtendLookupRequestSchema,
  ExtensionPaymentAccessSchema,
  PublicExtendConfirmSchema,
  StaffExtendOrderSchema,
  Permission,
} from '@lolas/shared';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { logger } from '../lib/logger.js';
import { sendRespondIoTemplateMessage } from '../services/respond-io-outbound.js';
import { isXenditEnabled } from '../services/xendit.js';
import {
  escapeIlike,
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

// ── Extension Payment Summary ──

router.post(
  '/payment-summary',
  extendLookupLimiter,
  validateBody(ExtensionPaymentAccessSchema),
  async (req, res, next) => {
  try {
    const { orderReference, email } = req.body as { orderReference: string; email: string };

    const sb = getSupabaseClient();
    const refVariants = orderReferenceLookupVariants(orderReference);
    const { data: customers, error: customerError } = await sb
      .from('customers')
      .select('id')
      .ilike('email', escapeIlike(email))
      .limit(10);
    if (customerError) throw new Error(`Extension customer lookup failed: ${customerError.message}`);

    const customerIds = (customers ?? []).map((customer: { id: string }) => customer.id);
    if (customerIds.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Active booking not found' },
      });
      return;
    }

    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('id, booking_token, store_id')
      .in('booking_token', refVariants)
      .in('customer_id', customerIds)
      .eq('status', 'active')
      .maybeSingle();
    if (orderError) throw new Error(`Extension order lookup failed: ${orderError.message}`);

    if (!order) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Active booking not found' },
      });
      return;
    }

    const typedOrder = order as { id: string; booking_token: string | null; store_id: string };
    const { data: payments, error: paymentsError } = await sb
      .from('payments')
      .select('amount')
      .eq('payment_type', 'extension')
      .eq('settlement_status', 'pending')
      .eq('order_id', typedOrder.id)
      .gt('amount', 0);
    if (paymentsError) throw new Error(`Extension payment lookup failed: ${paymentsError.message}`);

    const principalAmountPHP = Math.round((payments ?? []).reduce(
      (sum, payment: { amount: number | string | null }) => sum + Number(payment.amount ?? 0),
      0,
    ) * 100) / 100;

    const { data: paymentMethod, error: paymentMethodError } = await sb
      .from('payment_methods')
      .select('id, surcharge_percent')
      .eq('gateway_provider', 'xendit')
      .eq('is_active', true)
      .eq('show_on_customer_website', true)
      .order('id')
      .limit(1)
      .maybeSingle();
    if (paymentMethodError) throw new Error(`Xendit payment method lookup failed: ${paymentMethodError.message}`);

    const surchargePercent = Number(
      (paymentMethod as { surcharge_percent?: number | string | null } | null)?.surcharge_percent ?? 0,
    );
    const surchargeAmountPHP = Math.round(principalAmountPHP * surchargePercent) / 100;
    const totalAmountPHP = Math.round((principalAmountPHP + surchargeAmountPHP) * 100) / 100;
    const paymentAvailable = principalAmountPHP > 0 && Boolean(paymentMethod) && isXenditEnabled();

    res.json({
      success: true,
      data: {
        found: true,
        orderReference: typedOrder.booking_token ?? orderReference,
        principalAmountPHP,
        surchargeAmountPHP,
        totalAmountPHP,
        surchargePercent,
        paymentAvailable,
        provider: 'xendit',
        message: principalAmountPHP <= 0
          ? 'There is no pending extension balance for this booking.'
          : paymentAvailable
            ? 'Continue to Xendit to securely pay your extension balance.'
            : 'Online payment is temporarily unavailable. You can still pay when you return your rental.',
      },
    });
  } catch (err) {
    next(err);
  }
  },
);

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

router.post('/preview', extendLookupLimiter, validateBody(PublicExtendConfirmSchema), async (req, res, next) => {
  try {
    const { orderReference, email, newDropoffDatetime, ninePmAddonId,
      newOneTimeAddonIds, newDropoffLocationId } = req.body as {
      orderReference: string; email: string; newDropoffDatetime: string;
      ninePmAddonId?: number; newOneTimeAddonIds?: number[]; newDropoffLocationId?: number;
    };
    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    const refVariants = orderReferenceLookupVariants(orderReference);
    const { data: rawRows } = await sb
      .from('orders_raw').select('id').in('order_reference', refVariants)
      .ilike('customer_email', escapeIlike(trimmedEmail)).in('status', ['unprocessed']);
    if (rawRows && rawRows.length > 0) {
      res.status(400).json({ success: false, error: { code: 'ORDER_NOT_ACTIVE',
        message: 'Extensions are only available once your rental has started.' } });
      return;
    }
    const outcome = await resolveExtensionForActive({
      orderReference, trimmedEmail, newDropoffDatetime, ninePmAddonId,
      newOneTimeAddonIds, newDropoffLocationId, overrideDailyRate: undefined,
      previewOnly: true, isPaid: false, paymentMethodId: 'pending',
      emailErrorLabel: '[extend-preview]', deps: req.app.locals.deps,
    });
    if (outcome.kind === 'not_found') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
    } else if (outcome.kind === 'error') {
      res.status(409).json({ success: false, error: { code: 'EXTENSION_UNAVAILABLE', message: outcome.reason } });
    } else {
      res.json({ success: true, data: {
        extensionDays: outcome.extensionDays, dailyRate: outcome.dailyRate,
        extensionTotal: outcome.extensionCost, bracketLabel: getDayBracketLabel(outcome.extensionDays),
      } });
    }
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
      expectedCurrentDropoffDatetime, expectedExtensionTotal,
    } = req.body as {
      orderReference: string;
      email: string;
      newDropoffDatetime: string;
      ninePmAddonId?: number;
      newOneTimeAddonIds?: number[];
      newDropoffLocationId?: number;
      newDropoffLocationAddress?: string;
      expectedCurrentDropoffDatetime?: string;
      expectedExtensionTotal?: number;
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
      expectedCurrentDropoffDatetime,
      expectedExtensionTotal,
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

async function loadStaffExtensionTarget(orderId: string) {
  const sb = getSupabaseClient();
  const { data: order, error } = await sb.from('orders')
    .select('id,store_id,booking_token,customer_id,status').eq('id', orderId).maybeSingle();
  if (error) throw new Error(`Failed to load extension order: ${error.message}`);
  if (!order || order.status !== 'active') return null;
  const { data: customer, error: customerError } = await sb.from('customers')
    .select('email').eq('id', order.customer_id).maybeSingle();
  if (customerError) throw new Error(`Failed to load extension customer: ${customerError.message}`);
  return { ...order, email: String(customer?.email ?? '').trim().toLowerCase() };
}

staffRouter.post('/preview', authenticate, requirePermission(Permission.EditOrders),
  validateBody(StaffExtendOrderSchema), async (req, res, next) => {
    try {
      const body = req.body as {
        orderId: string; newDropoffDatetime: string; overrideDailyRate?: number;
        discountType?: 'percentage' | 'fixed'; discountValue?: number;
        newOneTimeAddonIds?: number[]; newPerDayAddonIds?: number[];
        newDropoffLocationId?: number;
      };
      const order = await loadStaffExtensionTarget(body.orderId);
      if (!order) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active order not found.' } });
        return;
      }
      if (!req.user!.storeIds.includes(COMPANY_STORE_ID) && !req.user!.storeIds.includes(order.store_id)) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store access required.' } });
        return;
      }
      const outcome = await resolveExtensionForActive({
        ...body, orderReference: order.booking_token ?? order.id, orderId: order.id,
        expectedStoreId: order.store_id, trimmedEmail: order.email,
        overrideDailyRate: body.overrideDailyRate, previewOnly: true,
        isPaid: false, paymentMethodId: 'pending',
        emailErrorLabel: '[extend-staff-preview]', deps: req.app.locals.deps,
      });
      if (outcome.kind !== 'success') {
        res.status(409).json({ success: false, error: { code: 'EXTENSION_UNAVAILABLE',
          message: outcome.kind === 'error' ? outcome.reason : 'Active order not found.' } });
        return;
      }
      res.json({ success: true, data: {
        extensionDays: outcome.extensionDays, dailyRate: outcome.dailyRate,
        extensionTotal: outcome.extensionCost, bracketLabel: getDayBracketLabel(outcome.extensionDays),
      } });
    } catch (err) { next(err); }
  });

// ── Staff Extend Confirm (authenticated, order-ID based) ──

staffRouter.post(
  '/confirm',
  authenticate,
  requirePermission(Permission.EditOrders),
  validateBody(StaffExtendOrderSchema),
  async (req, res, next) => {
    try {
      const {
        orderId,
        newDropoffDatetime,
        overrideDailyRate,
        discountType,
        discountValue,
        paymentStatus,
        paymentMethod,
        newOneTimeAddonIds,
        newPerDayAddonIds,
        newDropoffLocationId,
        newDropoffLocationAddress,
      } = req.body as {
        orderId: string;
        newDropoffDatetime: string;
        overrideDailyRate?: number;
        discountType?: 'percentage' | 'fixed';
        discountValue?: number;
        paymentStatus?: 'paid' | 'unpaid';
        paymentMethod?: string;
        newOneTimeAddonIds?: number[];
        newPerDayAddonIds?: number[];
        newDropoffLocationId?: number;
        newDropoffLocationAddress?: string;
      };

      const isPaid = paymentStatus === 'paid';
      const effectivePaymentMethodId = isPaid && paymentMethod ? paymentMethod : 'pending';
      const order = await loadStaffExtensionTarget(orderId);
      if (!order) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active order not found.' } });
        return;
      }
      if (!req.user!.storeIds.includes(COMPANY_STORE_ID) && !req.user!.storeIds.includes(order.store_id)) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store access required.' } });
        return;
      }
      const orderReference = order.booking_token ?? order.id;
      const trimmedEmail = order.email;
      const deps = req.app.locals.deps;

      const activeOutcome = await resolveExtensionForActive({
        orderReference,
        orderId,
        expectedStoreId: order.store_id,
        trimmedEmail,
        newDropoffDatetime,
        overrideDailyRate,
        discountType,
        discountValue,
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
        if (trimmedEmail) void sendExtensionReceivedMessage({
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

      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active order not found.' } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as publicExtendRoutes, staffRouter as staffExtendRoutes };
