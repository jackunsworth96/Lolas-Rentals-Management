import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ExtendLookupRequestSchema, PublicExtendConfirmSchema, StaffExtendConfirmSchema, Permission } from '@lolas/shared';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import {
  escapeIlike,
  extDayCount,
  orderReferenceLookupVariants,
  resolveExtensionForRaw,
  resolveExtensionForActive,
} from './public-extend-helpers.js';

const router = Router();
const staffRouter = Router();

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
      .eq('store_id', storeId)
      .eq('is_active', true);
    if (error) throw new Error(`Addon lookup failed: ${error.message}`);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
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
          .select('vehicle_id, pickup_datetime, dropoff_datetime, store_id, rental_days_count')
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

        const { data: locs } = await sb.from('locations').select('name').eq('store_id', storeId).limit(1);

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
              pickupLocationName: (locs as { name: string }[] | null)?.[0]?.name ?? 'General Luna',
              originalTotal: Number((ord as Record<string, unknown>).final_total ?? 0),
              rentalDays: days,
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
          .select('vehicle_id, pickup_datetime, dropoff_datetime, store_id, rental_days_count, rental_rate')
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
            { storeId: item.store_id as string, pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime },
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
        let dailyRate = 0;

        if (modelId) {
          const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
            storeId, vehicleModelId: modelId,
            pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
            pickupLocationId: locId, dropoffLocationId: locId,
          });
          const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
          const origDailyRate = Number(item.rental_rate ?? 0);
          // Daily rate = bracket rate for extension days, capped at the original rate
          // (never higher), but if the extension bracket is cheaper the customer keeps it.
          dailyRate = Math.round((origDailyRate > 0 ? Math.min(computedExtDailyRate, origDailyRate) : computedExtDailyRate) * 100) / 100;
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
    const { orderReference, email, newDropoffDatetime, ninePmAddonId } = req.body as {
      orderReference: string;
      email: string;
      newDropoffDatetime: string;
      ninePmAddonId?: number;
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
      deps,
    });
    if (activeOutcome.kind === 'error') {
      res.json({ success: true, data: { success: false, reason: activeOutcome.reason } });
      return;
    }
    if (activeOutcome.kind === 'success') {
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
      res.json({ success: true, data: { success: true, newDropoffDatetime: rawOutcome.newDropoffDatetime, extensionCost: rawOutcome.extensionCost } });
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
      } = req.body as {
        orderReference: string;
        email: string;
        newDropoffDatetime: string;
        overrideDailyRate?: number;
        paymentStatus?: 'paid' | 'unpaid';
        paymentMethod?: string;
        paymentAccountId?: string;
      };

      const isPaid = paymentStatus === 'paid';
      const effectivePaymentMethodId = isPaid && paymentMethod ? paymentMethod : 'pending';

      const trimmedEmail = email.trim().toLowerCase();
      const deps = req.app.locals.deps;

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
        res.json({ success: true, data: { success: true, newDropoffDatetime: rawOutcome.newDropoffDatetime, extensionCost: rawOutcome.extensionCost } });
        return;
      }

      const activeOutcome = await resolveExtensionForActive({
        orderReference,
        trimmedEmail,
        newDropoffDatetime,
        overrideDailyRate,
        isPaid,
        paymentMethodId: effectivePaymentMethodId,
        emailErrorLabel: '[extend-email] Staff active path error:',
        deps,
      });
      if (activeOutcome.kind === 'error') {
        res.json({ success: true, data: { success: false, reason: activeOutcome.reason } });
        return;
      }
      if (activeOutcome.kind === 'success') {
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

      res.json({ success: true, data: { success: false, reason: 'Booking not found. Please check your details and try again.' } });
    } catch (err) {
      next(err);
    }
  },
);

export { router as publicExtendRoutes, staffRouter as staffExtendRoutes };
