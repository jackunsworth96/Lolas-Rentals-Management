import crypto from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { COMPANY_STORE_ID, ExtensionPaymentAccessSchema, Permission } from '@lolas/shared';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { logger } from '../lib/logger.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { escapeIlike, orderReferenceLookupVariants } from './public-extend-helpers.js';
import {
  createXenditPaymentSession,
  getXenditPaymentSession,
  cancelXenditPaymentSession,
  createXenditReturnState,
  isXenditDashboardTestWebhook,
  isXenditEnabled,
  parseXenditWebhookPayload,
  verifyXenditCallbackToken,
  verifyXenditReturnState,
  type XenditSessionResult,
} from '../services/xendit.js';

const publicXenditRouter = Router();
const staffXenditRouter = Router();

const publicSessionSchema = z.object({
  paymentMethodId: z.string().min(1),
  orders: z.array(z.object({
    id: z.string().uuid(),
    cancellationToken: z.string().regex(/^[a-f0-9]{64}$/i),
  })).min(1).max(10),
}).superRefine((value, ctx) => {
  if (new Set(value.orders.map((order) => order.id)).size !== value.orders.length) {
    ctx.addIssue({ code: 'custom', path: ['orders'], message: 'Duplicate booking ids are not allowed' });
  }
});

const staffSessionSchema = z.object({
  orderId: z.string().min(1),
  principalAmountPHP: z.number().positive(),
  paymentMethodId: z.string().min(1),
  description: z.string().trim().min(1).max(200).optional(),
});

const reconciliationReleaseSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

type PaymentMethodRow = {
  id: string;
  name: string;
  is_active: boolean;
  surcharge_percent: number | null;
  gateway_provider: string | null;
};

type RawOrderRow = {
  id: string;
  order_reference: string;
  cancellation_token: string;
  booking_channel: string | null;
  status: string | null;
  store_id: string;
  customer_email: string | null;
  customer_mobile: string | null;
  pickup_datetime: string;
  dropoff_datetime: string;
  web_quote_raw: number | null;
  web_card_fee_surcharge: number | null;
  web_payment_method: string | null;
  xendit_payment_session_id: string | null;
};

type ExistingSessionRow = {
  id: string;
  target_type?: string;
  status: string;
  payment_link_url: string | null;
  expires_at: string | null;
  created_at: string;
  amount_php: number;
};

type ExtensionOrderRow = {
  id: string;
  store_id: string;
  booking_token: string | null;
};

type ExtensionDraftResult = {
  principal_amount_php: number | string;
  surcharge_amount_php: number | string;
  amount_php: number | string;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function loadXenditPaymentMethod(id: string): Promise<PaymentMethodRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, name, is_active, surcharge_percent, gateway_provider')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load payment method: ${error.message}`);
  const method = data as PaymentMethodRow | null;
  if (!method || !method.is_active || method.gateway_provider !== 'xendit') return null;
  return method;
}

async function loadPublicXenditPaymentMethod(): Promise<PaymentMethodRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, name, is_active, surcharge_percent, gateway_provider')
    .eq('gateway_provider', 'xendit')
    .eq('is_active', true)
    .eq('show_on_customer_website', true)
    .order('id')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load public Xendit payment method: ${error.message}`);
  return data as PaymentMethodRow | null;
}

async function loadActiveExtensionOrder(
  orderReference: string,
  email: string,
): Promise<ExtensionOrderRow | null> {
  const supabase = getSupabaseClient();
  const { data: customers, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .ilike('email', escapeIlike(email))
    .limit(10);
  if (customerError) throw new Error(`Failed to verify extension customer: ${customerError.message}`);

  const customerIds = (customers ?? []).map((customer: { id: string }) => customer.id);
  if (customerIds.length === 0) return null;

  const { data, error } = await supabase
    .from('orders')
    .select('id, store_id, booking_token')
    .in('booking_token', orderReferenceLookupVariants(orderReference))
    .in('customer_id', customerIds)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`Failed to verify active extension order: ${error.message}`);
  return data as ExtensionOrderRow | null;
}

async function closeFailedDraft(sessionId: string, error: unknown): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const { error: closeError } = await getSupabaseClient().rpc(
    'close_xendit_session_without_payment',
    {
      p_session_id: sessionId,
      p_status: 'failed',
      p_processing_error: message.slice(0, 1000),
    },
  );
  if (closeError) {
    logger.error({ sessionId, closeError }, 'Failed to close Xendit session draft');
    return false;
  }
  return true;
}

function isStaleSession(session: ExistingSessionRow): boolean {
  if (session.status === 'creating') return false;
  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) return true;
  return ['expired', 'cancelled', 'failed'].includes(session.status);
}

async function activateXenditSession(
  sessionId: string,
  checkout: XenditSessionResult,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await getSupabaseClient()
      .from('xendit_payment_sessions')
      .update({
        payment_session_id: checkout.paymentSessionId,
        payment_link_url: checkout.checkoutUrl,
        expires_at: checkout.expiresAt,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (!error) return;
    lastError = error;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  throw new Error(`Failed to activate Xendit checkout locally: ${String(lastError)}`);
}

function returnUrl(base: string, path: string, payment: 'processing' | 'cancelled', sessionId: string, expiresAt: string): string {
  const state = createXenditReturnState({ sessionId, expiresAt });
  return `${base}${path}${path.includes('?') ? '&' : '?'}payment=${payment}&paymentSession=${sessionId}&paymentState=${encodeURIComponent(state)}`;
}

async function cancelCheckoutAfterActivationFailure(
  sessionId: string,
  referenceId: string,
  checkout: XenditSessionResult,
  activationError: unknown,
): Promise<boolean> {
  try {
    await cancelXenditPaymentSession(checkout.paymentSessionId);
    const closed = await closeFailedDraft(sessionId, activationError);
    if (closed) return true;

    logger.error({
      sessionId,
      referenceId,
      providerSessionId: checkout.paymentSessionId,
    }, 'Xendit checkout was cancelled but the local draft could not be closed; local draft remains locked');
    return false;
  } catch (cancelError) {
    logger.error({
      sessionId,
      referenceId,
      providerSessionId: checkout.paymentSessionId,
      activationError,
      cancelError,
    }, 'Xendit checkout could not be persisted or safely cancelled; local draft remains locked');
    return false;
  }
}

publicXenditRouter.post(
  '/extension-sessions',
  async (req: Request, res: Response, next: NextFunction) => {
    let sessionId: string | null = null;
    let closeDraftOnFailure = true;
    try {
      if (!isXenditEnabled()) {
        res.status(503).json({
          success: false,
          error: { code: 'XENDIT_DISABLED', message: 'Online payment is temporarily unavailable' },
        });
        return;
      }

      const parsed = ExtensionPaymentAccessSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid extension payment request', details: parsed.error.flatten() },
        });
        return;
      }

      const order = await loadActiveExtensionOrder(parsed.data.orderReference, parsed.data.email);
      if (!order) {
        res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Active booking not found' },
        });
        return;
      }

      const paymentMethod = await loadPublicXenditPaymentMethod();
      if (!paymentMethod) {
        res.status(503).json({
          success: false,
          error: { code: 'XENDIT_PAYMENT_METHOD_UNAVAILABLE', message: 'Online payment is temporarily unavailable' },
        });
        return;
      }

      const supabase = getSupabaseClient();
      const { data: existingData, error: existingError } = await supabase
        .from('xendit_payment_sessions')
        .select('id, target_type, status, payment_link_url, expires_at, created_at, amount_php')
        .eq('order_id', order.id)
        .in('status', ['creating', 'active'])
        .maybeSingle();
      if (existingError) throw new Error(`Failed to inspect existing extension payment session: ${existingError.message}`);

      const existing = existingData as ExistingSessionRow | null;
      if (existing?.target_type === 'public_extension'
        && existing.status === 'active'
        && existing.payment_link_url
        && !isStaleSession(existing)) {
        res.json({
          success: true,
          data: {
            sessionId: existing.id,
            checkoutUrl: existing.payment_link_url,
            expiresAt: existing.expires_at,
            amountPHP: Number(existing.amount_php),
          },
        });
        return;
      }

      if (existing && isStaleSession(existing)) {
        const { error: closeError } = await supabase.rpc('close_xendit_session_without_payment', {
          p_session_id: existing.id,
          p_status: existing.status === 'active' ? 'expired' : 'failed',
          p_processing_error: 'Closed stale session before extension payment retry',
        });
        if (closeError) throw new Error(`Failed to close stale extension payment session: ${closeError.message}`);
      } else if (existing) {
        res.status(409).json({
          success: false,
          error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A payment is already in progress for this booking' },
        });
        return;
      }

      sessionId = crypto.randomUUID();
      const referenceId = `XEN${sessionId.replaceAll('-', '')}`;
      const { data: draftData, error: draftError } = await supabase.rpc(
        'create_xendit_extension_session_draft',
        {
          p_session_id: sessionId,
          p_reference_id: referenceId,
          p_order_id: order.id,
          p_payment_method_id: paymentMethod.id,
        },
      );
      if (draftError) {
        const normalizedMessage = draftError.message.toLowerCase();
        if (normalizedMessage.includes('no pending extension payments')) {
          res.status(409).json({
            success: false,
            error: { code: 'NO_PENDING_EXTENSION_BALANCE', message: 'There is no pending extension balance for this booking' },
          });
          return;
        }
        if (normalizedMessage.includes('already claimed') || normalizedMessage.includes('active xendit session')) {
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A payment is already in progress for this booking' },
          });
          return;
        }
        throw new Error(`Failed to reserve extension payment session: ${draftError.message}`);
      }

      const draft = draftData as ExtensionDraftResult;
      const principalAmountPHP = Number(draft.principal_amount_php);
      const amountPHP = Number(draft.amount_php);
      const reference = order.booking_token ?? parsed.data.orderReference;
      const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
      const paymentPath = `/book/extend/pay?ref=${encodeURIComponent(reference)}`;
      const xenditSession = await createXenditPaymentSession({
        referenceId,
        amountPHP,
        description: `Lola's Rentals extension - ${reference}`,
        successReturnUrl: returnUrl(webOrigin, paymentPath, 'processing', sessionId, new Date(Date.now() + 86_400_000).toISOString()),
        cancelReturnUrl: returnUrl(webOrigin, paymentPath, 'cancelled', sessionId, new Date(Date.now() + 86_400_000).toISOString()),
        items: [{
          referenceId: reference,
          name: `Rental extension ${reference}`,
          amountPHP,
        }],
      });
      closeDraftOnFailure = false;
      try {
        await activateXenditSession(sessionId, xenditSession);
      } catch (activationError) {
        const cancelled = await cancelCheckoutAfterActivationFailure(
          sessionId,
          referenceId,
          xenditSession,
          activationError,
        );
        if (cancelled) sessionId = null;
        throw activationError;
      }

      // The provider expiry is authoritative for customer return-state expiry.
      // Recreate the checkout only after local persistence, preserving the token
      // contract without exposing a status endpoint to arbitrary UUID holders.

      res.status(201).json({
        success: true,
        data: {
          sessionId,
          checkoutUrl: xenditSession.checkoutUrl,
          expiresAt: xenditSession.expiresAt,
          amountPHP,
          principalAmountPHP,
        },
      });
    } catch (error) {
      if (sessionId && closeDraftOnFailure) await closeFailedDraft(sessionId, error);
      logger.error({ error, sessionId }, 'Extension Xendit payment session creation failed');
      next(error);
    }
  },
);

publicXenditRouter.post(
  '/sessions',
  async (req: Request, res: Response, next: NextFunction) => {
    let sessionId: string | null = null;
    let closeDraftOnFailure = true;
    try {
      if (!isXenditEnabled()) {
        res.status(503).json({
          success: false,
          error: { code: 'XENDIT_DISABLED', message: 'Online payment is temporarily unavailable' },
        });
        return;
      }

      const parsed = publicSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payment request', details: parsed.error.flatten() },
        });
        return;
      }

      const paymentMethod = await loadXenditPaymentMethod(parsed.data.paymentMethodId);
      if (!paymentMethod) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PAYMENT_METHOD', message: 'This payment method is not available online' },
        });
        return;
      }

      const supabase = getSupabaseClient();
      const ids = parsed.data.orders.map((order) => order.id);
      const { data, error } = await supabase
        .from('orders_raw')
        .select('id, order_reference, cancellation_token, booking_channel, status, store_id, customer_email, customer_mobile, pickup_datetime, dropoff_datetime, web_quote_raw, web_card_fee_surcharge, web_payment_method, xendit_payment_session_id')
        .in('id', ids);
      if (error) throw new Error(`Failed to load bookings for payment: ${error.message}`);

      const rows = (data ?? []) as RawOrderRow[];
      if (rows.length !== ids.length) {
        res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'One or more bookings were not found' } });
        return;
      }

      const requestById = new Map(parsed.data.orders.map((order) => [order.id, order]));
      const first = rows[0]!;
      const invalidBooking = rows.some((row) => {
        const requestOrder = requestById.get(row.id);
        return !requestOrder
          || !secureEqual(requestOrder.cancellationToken, row.cancellation_token)
          || row.booking_channel !== 'direct'
          || row.status !== 'unprocessed'
          || row.store_id !== first.store_id
          || row.customer_email?.toLowerCase() !== first.customer_email?.toLowerCase()
          || row.customer_mobile !== first.customer_mobile
          || row.pickup_datetime !== first.pickup_datetime
          || row.dropoff_datetime !== first.dropoff_datetime
          || row.web_payment_method !== paymentMethod.id;
      });
      if (invalidBooking) {
        res.status(409).json({
          success: false,
          error: { code: 'BOOKING_NOT_PAYABLE', message: 'The selected bookings cannot be paid together' },
        });
        return;
      }

      const claimedSessionIds = [...new Set(rows
        .map((row) => row.xendit_payment_session_id)
        .filter((id): id is string => Boolean(id)))];
      if (claimedSessionIds.length > 0) {
        if (claimedSessionIds.length !== 1 || rows.some((row) => !row.xendit_payment_session_id)) {
          res.status(409).json({ success: false, error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'These bookings already have different payment sessions' } });
          return;
        }
        const { data: existingData, error: existingError } = await supabase
          .from('xendit_payment_sessions')
          .select('id, status, payment_link_url, expires_at, created_at, amount_php')
          .eq('id', claimedSessionIds[0]!)
          .maybeSingle();
        if (existingError) throw new Error(`Failed to inspect existing payment session: ${existingError.message}`);
        const existing = existingData as ExistingSessionRow | null;
        if (existing?.status === 'completed') {
          res.status(409).json({ success: false, error: { code: 'BOOKING_ALREADY_PAID', message: 'These bookings have already been paid' } });
          return;
        }
        if (existing?.status === 'active' && existing.payment_link_url && !isStaleSession(existing)) {
          res.json({ success: true, data: { sessionId: existing.id, checkoutUrl: existing.payment_link_url, expiresAt: existing.expires_at, amountPHP: Number(existing.amount_php) } });
          return;
        }
        if (existing && isStaleSession(existing)) {
          const { error: closeError } = await supabase.rpc('close_xendit_session_without_payment', {
            p_session_id: existing.id,
            p_status: existing.status === 'active' ? 'expired' : 'failed',
            p_processing_error: 'Closed stale session before retry',
          });
          if (closeError) throw new Error(`Failed to close stale payment session: ${closeError.message}`);
        } else {
          res.status(409).json({ success: false, error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A payment session is already being created' } });
          return;
        }
      }

      const allocations = rows.map((row) => {
        const amount = roundMoney(Number(row.web_quote_raw ?? 0));
        const surcharge = roundMoney(Number(row.web_card_fee_surcharge ?? 0));
        const principal = roundMoney(amount - surcharge);
        if (amount <= 0 || principal <= 0 || surcharge < 0) {
          throw new Error(`Booking ${row.order_reference} has an invalid payment amount`);
        }
        return {
          raw_order_id: row.id,
          referenceId: row.order_reference,
          principal_amount_php: principal,
          surcharge_amount_php: surcharge,
          amount_php: amount,
        };
      });
      const principalAmountPHP = roundMoney(allocations.reduce((sum, item) => sum + item.principal_amount_php, 0));
      const surchargeAmountPHP = roundMoney(allocations.reduce((sum, item) => sum + item.surcharge_amount_php, 0));
      const amountPHP = roundMoney(allocations.reduce((sum, item) => sum + item.amount_php, 0));

      sessionId = crypto.randomUUID();
      const referenceId = `XEN${sessionId.replaceAll('-', '')}`;
      const { error: draftError } = await supabase.rpc('create_xendit_session_draft', {
        p_session_id: sessionId,
        p_reference_id: referenceId,
        p_target_type: 'public_booking_group',
        p_order_id: null,
        p_store_id: first.store_id,
        p_payment_method_id: paymentMethod.id,
        p_principal_amount_php: principalAmountPHP,
        p_surcharge_amount_php: surchargeAmountPHP,
        p_amount_php: amountPHP,
        p_created_by: null,
        p_allocations: allocations.map(({ referenceId: _referenceId, ...allocation }) => allocation),
      });
      if (draftError) throw new Error(`Failed to reserve payment session: ${draftError.message}`);

      const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
      const confirmationPath = `/book/confirmation/${encodeURIComponent(first.order_reference)}`;
      const xenditSession = await createXenditPaymentSession({
        referenceId,
        amountPHP,
        description: `Lola's Rentals - ${rows.map((row) => row.order_reference).join(', ')}`,
        successReturnUrl: returnUrl(webOrigin, confirmationPath, 'processing', sessionId, new Date(Date.now() + 86_400_000).toISOString()),
        cancelReturnUrl: returnUrl(webOrigin, confirmationPath, 'cancelled', sessionId, new Date(Date.now() + 86_400_000).toISOString()),
        items: allocations.map((allocation) => ({
          referenceId: allocation.referenceId,
          name: `Vehicle rental ${allocation.referenceId}`,
          amountPHP: allocation.amount_php,
        })),
      });
      closeDraftOnFailure = false;
      try {
        await activateXenditSession(sessionId, xenditSession);
      } catch (activationError) {
        const cancelled = await cancelCheckoutAfterActivationFailure(
          sessionId,
          referenceId,
          xenditSession,
          activationError,
        );
        if (cancelled) sessionId = null;
        throw activationError;
      }

      res.status(201).json({
        success: true,
        data: {
          sessionId,
          checkoutUrl: xenditSession.checkoutUrl,
          expiresAt: xenditSession.expiresAt,
          amountPHP,
        },
      });
    } catch (error) {
      if (sessionId && closeDraftOnFailure) await closeFailedDraft(sessionId, error);
      logger.error({ error, sessionId }, 'Public Xendit payment session creation failed');
      next(error);
    }
  },
);

staffXenditRouter.post(
  '/sessions',
  authenticate,
  requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    let sessionId: string | null = null;
    let closeDraftOnFailure = true;
    try {
      if (!isXenditEnabled()) {
        res.status(503).json({ success: false, error: { code: 'XENDIT_DISABLED', message: 'Xendit is disabled' } });
        return;
      }

      const parsed = staffSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payment request', details: parsed.error.flatten() } });
        return;
      }

      const paymentMethod = await loadXenditPaymentMethod(parsed.data.paymentMethodId);
      if (!paymentMethod) {
        res.status(400).json({ success: false, error: { code: 'INVALID_PAYMENT_METHOD', message: 'Select an active Xendit payment method' } });
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('orders')
        .select('id, store_id, booking_token, balance_due, status')
        .eq('id', parsed.data.orderId)
        .maybeSingle();
      if (error) throw new Error(`Failed to load order: ${error.message}`);
      const order = data as { id: string; store_id: string; booking_token: string | null; balance_due: number; status: string } | null;
      if (!order || ['completed', 'cancelled', 'refunded'].includes(order.status.toLowerCase())) {
        res.status(404).json({ success: false, error: { code: 'ORDER_NOT_PAYABLE', message: 'Order is not available for payment' } });
        return;
      }
      const staffStoreIds = req.user?.storeIds ?? [];
      if (!staffStoreIds.includes(COMPANY_STORE_ID) && !staffStoreIds.includes(order.store_id)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You cannot create a payment session for this order' },
        });
        return;
      }

      const principalAmountPHP = roundMoney(parsed.data.principalAmountPHP);
      if (principalAmountPHP > roundMoney(Number(order.balance_due ?? 0))) {
        res.status(422).json({ success: false, error: { code: 'AMOUNT_EXCEEDS_BALANCE', message: 'Payment amount exceeds the order balance' } });
        return;
      }
      const surchargeAmountPHP = roundMoney(principalAmountPHP * Number(paymentMethod.surcharge_percent ?? 0) / 100);
      const amountPHP = roundMoney(principalAmountPHP + surchargeAmountPHP);

      const { data: existingData, error: existingError } = await supabase
        .from('xendit_payment_sessions')
        .select('id, status, payment_link_url, expires_at, created_at, amount_php')
        .eq('order_id', order.id)
        .in('status', ['creating', 'active'])
        .maybeSingle();
      if (existingError) throw new Error(`Failed to inspect existing payment session: ${existingError.message}`);
      const existing = existingData as ExistingSessionRow | null;
      if (existing?.status === 'active'
        && existing.payment_link_url
        && Number(existing.amount_php) === amountPHP
        && !isStaleSession(existing)) {
        res.json({ success: true, data: { sessionId: existing.id, checkoutUrl: existing.payment_link_url, expiresAt: existing.expires_at, amountPHP: Number(existing.amount_php) } });
        return;
      }
      if (existing && isStaleSession(existing)) {
        const { error: closeError } = await supabase.rpc('close_xendit_session_without_payment', {
          p_session_id: existing.id,
          p_status: existing.status === 'active' ? 'expired' : 'failed',
          p_processing_error: 'Closed stale session before retry',
        });
        if (closeError) throw new Error(`Failed to close stale payment session: ${closeError.message}`);
      } else if (existing) {
        res.status(409).json({ success: false, error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A payment session is already being created' } });
        return;
      }

      sessionId = crypto.randomUUID();
      const referenceId = `XEN${sessionId.replaceAll('-', '')}`;
      const { error: draftError } = await supabase.rpc('create_xendit_session_draft', {
        p_session_id: sessionId,
        p_reference_id: referenceId,
        p_target_type: 'staff_order',
        p_order_id: order.id,
        p_store_id: order.store_id,
        p_payment_method_id: paymentMethod.id,
        p_principal_amount_php: principalAmountPHP,
        p_surcharge_amount_php: surchargeAmountPHP,
        p_amount_php: amountPHP,
        p_created_by: req.user!.employeeId,
        p_allocations: [],
      });
      if (draftError) throw new Error(`Failed to reserve payment session: ${draftError.message}`);

      const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
      const reference = order.booking_token ?? order.id;
      const xenditSession = await createXenditPaymentSession({
        referenceId,
        amountPHP,
        description: parsed.data.description ?? `Lola's Rentals - ${reference}`,
        successReturnUrl: returnUrl(webOrigin, `/book/confirmation/${encodeURIComponent(reference)}`, 'processing', sessionId, new Date(Date.now() + 86_400_000).toISOString()),
        cancelReturnUrl: returnUrl(webOrigin, `/book/confirmation/${encodeURIComponent(reference)}`, 'cancelled', sessionId, new Date(Date.now() + 86_400_000).toISOString()),
        items: [{ referenceId: reference, name: `Vehicle rental ${reference}`, amountPHP }],
      });
      closeDraftOnFailure = false;
      try {
        await activateXenditSession(sessionId, xenditSession);
      } catch (activationError) {
        const cancelled = await cancelCheckoutAfterActivationFailure(
          sessionId,
          referenceId,
          xenditSession,
          activationError,
        );
        if (cancelled) sessionId = null;
        throw activationError;
      }

      res.status(201).json({ success: true, data: { sessionId, checkoutUrl: xenditSession.checkoutUrl, expiresAt: xenditSession.expiresAt, amountPHP } });
    } catch (error) {
      if (sessionId && closeDraftOnFailure) await closeFailedDraft(sessionId, error);
      logger.error({ error, sessionId }, 'Staff Xendit payment session creation failed');
      next(error);
    }
  },
);

publicXenditRouter.get(
  '/sessions/:id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payment session id' } });
        return;
      }

      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      if (!verifyXenditReturnState(state, id.data)) {
        res.status(401).json({ success: false, error: { code: 'INVALID_RETURN_STATE', message: 'Invalid payment return state' } });
        return;
      }

      const { data, error } = await getSupabaseClient()
        .from('xendit_payment_sessions')
        .select('status')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`Failed to load payment status: ${error.message}`);
      if (!data) {
        res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } });
        return;
      }

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

staffXenditRouter.post(
  '/sessions/:id/cancel',
  authenticate,
  requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payment session id' } });
        return;
      }
      const { data, error } = await getSupabaseClient()
        .from('xendit_payment_sessions')
        .select('id, status, payment_session_id, store_id')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Xendit session: ${error.message}`);
      const session = data as { id: string; status: string; payment_session_id: string | null; store_id: string } | null;
      const stores = req.user?.storeIds ?? [];
      if (!session || (!stores.includes(COMPANY_STORE_ID) && !stores.includes(session.store_id))) {
        res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } });
        return;
      }
      if (session.status !== 'active' || !session.payment_session_id) {
        res.status(409).json({ success: false, error: { code: 'SESSION_NOT_CANCELLABLE', message: 'Only an active hosted checkout can be cancelled' } });
        return;
      }
      try {
        await cancelXenditPaymentSession(session.payment_session_id);
      } catch (cancelError) {
        const providerSession = await getXenditPaymentSession(session.payment_session_id).catch(() => null);
        logger.error({ sessionId: session.id, providerSessionId: session.payment_session_id, providerStatus: providerSession?.status, cancelError }, 'Xendit hosted checkout cancellation failed');
        throw cancelError;
      }
      const { error: closeError } = await getSupabaseClient().rpc('close_xendit_session_without_payment', {
        p_session_id: session.id,
        p_status: 'cancelled',
        p_processing_error: 'Cancelled by authorized staff before booking change',
      });
      if (closeError) throw new Error(`Failed to close cancelled Xendit session: ${closeError.message}`);
      res.json({ success: true, data: { status: 'cancelled' } });
    } catch (error) { next(error); }
  },
);

staffXenditRouter.post(
  '/sessions/:id/release-creating',
  authenticate,
  requirePermission(Permission.ReconcileOnlinePayments),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().safeParse(req.params.id);
      const parsed = reconciliationReleaseSchema.safeParse(req.body);
      if (!id.success || !parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A valid session id and 10-500 character reason are required' } });
        return;
      }
      const { data, error } = await getSupabaseClient()
        .from('xendit_payment_sessions')
        .select('id, status, payment_session_id, store_id')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Xendit session: ${error.message}`);
      const session = data as { id: string; status: string; payment_session_id: string | null; store_id: string } | null;
      const stores = req.user?.storeIds ?? [];
      if (!session || (!stores.includes(COMPANY_STORE_ID) && !stores.includes(session.store_id))) {
        res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } });
        return;
      }
      if (session.status !== 'creating' || session.payment_session_id) {
        res.status(409).json({ success: false, error: { code: 'SESSION_NOT_RELEASABLE', message: 'Only an unresolved creating session can be released' } });
        return;
      }
      const { error: closeError } = await getSupabaseClient().rpc('release_xendit_creating_session', {
        p_session_id: session.id,
        p_employee_id: req.user!.employeeId,
        p_reason: parsed.data.reason,
      });
      if (closeError) throw new Error(`Failed to release creating Xendit session: ${closeError.message}`);
      res.json({ success: true, data: { status: 'failed' } });
    } catch (error) { next(error); }
  },
);

publicXenditRouter.post(
  '/webhook',
  async (req: Request, res: Response) => {
    try {
      const token = req.headers['x-callback-token'];
      if (!verifyXenditCallbackToken(Array.isArray(token) ? token[0] : token)) {
        res.status(401).json({ success: false, error: { code: 'INVALID_CALLBACK_TOKEN', message: 'Invalid callback token' } });
        return;
      }

      if (isXenditDashboardTestWebhook(req.body)) {
        logger.info('Acknowledged Xendit dashboard webhook verification');
        res.json({ success: true, data: { received: true, verification: true } });
        return;
      }

      const payload = parseXenditWebhookPayload(req.body);
      const expectedBusinessId = process.env.XENDIT_BUSINESS_ID?.trim();
      if (!expectedBusinessId) {
        throw new Error('XENDIT_BUSINESS_ID environment variable is not set');
      }
      if (!secureEqual(payload.business_id, expectedBusinessId)) {
        res.status(401).json({ success: false, error: { code: 'INVALID_BUSINESS_ID', message: 'Invalid Xendit business id' } });
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('xendit_payment_sessions')
        .select('id, payment_session_id')
        .eq('reference_id', payload.data.reference_id)
        .maybeSingle();
      if (error) throw new Error(`Failed to locate Xendit session: ${error.message}`);
      const session = data as { id: string; payment_session_id: string | null } | null;
      const webhookIdHeader = req.headers['webhook-id'];
      const webhookId = Array.isArray(webhookIdHeader) ? webhookIdHeader[0] : webhookIdHeader;
      const eventKey = webhookId?.trim()
        ? `xendit:${webhookId.trim()}`
        : `${payload.event}:${payload.data.payment_session_id}:${payload.created}`;

      if (!session) {
        await supabase.from('xendit_webhook_events').upsert({
          event_key: eventKey,
          event_type: payload.event,
          session_id: null,
          payload,
          processing_status: 'rejected',
          processing_error: 'Unknown reference id',
          processed_at: new Date().toISOString(),
        }, { onConflict: 'event_key', ignoreDuplicates: true });
        logger.error({ referenceId: payload.data.reference_id }, 'Xendit webhook has unknown reference id');
        res.json({ success: true, data: { received: true } });
        return;
      }

      if (session.payment_session_id && session.payment_session_id !== payload.data.payment_session_id) {
        res.status(409).json({ success: false, error: { code: 'SESSION_MISMATCH', message: 'Payment session id mismatch' } });
        return;
      }

      if (payload.event === 'payment_session.expired') {
        const { error: closeError } = await supabase.rpc('close_xendit_session_without_payment', {
          p_session_id: session.id,
          p_status: 'expired',
          p_processing_error: null,
          p_event_key: eventKey,
          p_event_type: payload.event,
          p_payload: payload,
        });
        if (closeError) throw new Error(`Failed to expire Xendit session: ${closeError.message}`);
        res.json({ success: true, data: { received: true } });
        return;
      }

      const { error: completeError } = await supabase.rpc('complete_xendit_session_atomic', {
        p_session_id: session.id,
        p_event_key: eventKey,
        p_event_type: payload.event,
        p_payload: payload,
        p_payment_session_id: payload.data.payment_session_id,
        p_payment_request_id: payload.data.payment_request_id ?? null,
        p_payment_id: payload.data.payment_id!,
        p_amount_php: payload.data.amount,
        p_currency: payload.data.currency,
      });
      if (completeError) throw new Error(`Failed to complete Xendit payment: ${completeError.message}`);

      res.json({ success: true, data: { received: true } });
    } catch (error) {
      logger.error({ error }, 'Xendit webhook processing failed');
      const status = error instanceof z.ZodError ? 400 : 500;
      res.status(status).json({
        success: false,
        error: { code: status === 400 ? 'INVALID_PAYLOAD' : 'WEBHOOK_PROCESSING_FAILED', message: status === 400 ? 'Invalid webhook payload' : 'Webhook processing failed' },
      });
    }
  },
);

export { publicXenditRouter, staffXenditRouter, roundMoney };
