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
  getXenditPaymentRequest,
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

const rawStaffSessionSchema = z.object({
  rawOrderId: z.string().uuid(),
  acknowledgePriceChange: z.boolean().default(false),
});

type RawStaffBooking = {
  id: string;
  store_id: string;
  status: string;
  booking_channel: string | null;
  order_reference: string;
  web_payment_method: string | null;
  web_quote_raw: number | null;
  web_card_fee_surcharge: number | null;
  transfer_amount: number | null;
  charity_donation: number | null;
};

const onlineAddonsSchema = z.object({
  addons: z.array(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(1).max(20) }))
    .min(1).max(20),
});

function staffRawQuote(booking: RawStaffBooking, method: PaymentMethodRow) {
  const originalQuotePHP = roundMoney(Number(booking.web_quote_raw ?? 0));
  const principalPHP = roundMoney(originalQuotePHP - Number(booking.web_card_fee_surcharge ?? 0));
  const surchargePHP = booking.web_payment_method === method.id
    ? roundMoney(Number(booking.web_card_fee_surcharge ?? 0))
    : roundMoney(Math.max(0, principalPHP - Number(booking.transfer_amount ?? 0)
      - Number(booking.charity_donation ?? 0)) * Number(method.surcharge_percent ?? 0) / 100);
  return { originalQuotePHP, principalPHP, surchargePHP, amountPHP: roundMoney(principalPHP + surchargePHP),
    requiresAcknowledgement: booking.web_payment_method !== method.id && roundMoney(principalPHP + surchargePHP) > originalQuotePHP };
}

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
  payment_session_id: string | null;
  store_id: string;
  created_at: string;
  amount_php: number;
};

type XenditSessionStatus = 'creating' | 'active' | 'completed' | 'expired' | 'cancelled' | 'failed' | 'reconciliation_required';

type CheckedCloseResult = {
  status: XenditSessionStatus;
  closed: boolean;
  claimsReleased: boolean;
  providerSessionMatched: boolean;
};

const RETURN_STATE_TTL_MS = 24 * 60 * 60 * 1000;

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

function hasExpiredLocally(session: ExistingSessionRow): boolean {
  return session.status === 'active'
    && !!session.expires_at
    && new Date(session.expires_at).getTime() <= Date.now();
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

function returnUrl(base: string, path: string, payment: 'processing' | 'cancelled', sessionId: string): string {
  // This is a short-lived authorization token for public status polling, not
  // the provider checkout expiry. The provider remains authoritative for that.
  const state = createXenditReturnState({
    sessionId,
    expiresAt: new Date(Date.now() + RETURN_STATE_TTL_MS).toISOString(),
  });
  return `${base}${path}${path.includes('?') ? '&' : '?'}payment=${payment}&paymentSession=${sessionId}&paymentState=${encodeURIComponent(state)}`;
}

async function markSessionReconciliationRequired(
  sessionId: string,
  reason: string,
  providerStatus: string | null,
  employeeId: string | null = null,
): Promise<'completed' | 'reconciliation_required'> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('mark_xendit_session_reconciliation_required', {
    p_session_id: sessionId,
    p_employee_id: employeeId,
    p_reason: reason,
    p_provider_status: providerStatus,
  });
  if (error) throw new Error(`Failed to mark Xendit session for reconciliation: ${error.message}`);

  const { data, error: statusError } = await supabase
    .from('xendit_payment_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle();
  if (statusError) throw new Error(`Failed to confirm Xendit reconciliation state: ${statusError.message}`);
  const status = (data as { status?: XenditSessionStatus } | null)?.status;
  if (status === 'completed' || status === 'reconciliation_required') return status;
  throw new Error('Xendit reconciliation did not produce a terminal state');
}

async function closeProviderTerminalSession(
  session: ExistingSessionRow,
  reason: string,
  employeeId: string | null = null,
): Promise<'closed' | 'completed' | 'reconciliation_required' | 'still_active'> {
  if (!session.payment_session_id) return 'still_active';
  const provider = await getXenditPaymentSession(session.payment_session_id);
  if (provider.status === 'ACTIVE') return 'still_active';
  if (provider.status === 'COMPLETED') {
    return markSessionReconciliationRequired(
      session.id,
      `${reason}: Xendit reports the hosted checkout completed.`,
      provider.status,
      employeeId,
    );
  }
  const status = provider.status === 'EXPIRED' ? 'expired' : 'cancelled';
  const { data, error } = await getSupabaseClient().rpc('close_xendit_session_after_provider_terminal', {
    p_session_id: session.id,
    p_expected_payment_session_id: session.payment_session_id,
    p_status: status,
    p_processing_error: `${reason}: Xendit reports ${provider.status}.`,
  });
  if (error) throw new Error(`Failed to close provider-terminal Xendit session: ${error.message}`);
  const result = data as CheckedCloseResult | null;
  if (!result) throw new Error('Provider-terminal Xendit session closure returned no result');
  if (result.status === 'reconciliation_required') return 'reconciliation_required';
  if (result.status === 'completed') return 'completed';
  return result.closed ? 'closed' : 'still_active';
}

function isRetryableDraftError(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === '40P01'
    || error.code === '40001'
    || /deadlock detected|could not serialize/i.test(error.message ?? '');
}

function isBlockingSessionError(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === '23505'
    || /unresolved Xendit session|already has an unresolved Xendit session|idx_xendit_blocking_order/i.test(error.message ?? '');
}

function xenditOperatorMessage(status: XenditSessionStatus): string {
  switch (status) {
    case 'creating':
      return 'Checkout creation is unresolved. An authorized reconciler must verify and release it before changing this order.';
    case 'active':
      return 'A customer can still pay through Xendit. Cancel or reconcile the checkout before changing this order.';
    case 'reconciliation_required':
      return 'Xendit payment verification is required. Finance must resolve this before changing this order.';
    case 'completed':
      return 'The Xendit payment was completed.';
    default:
      return 'This Xendit checkout is no longer active.';
  }
}

async function resolveExpiredActiveSession(session: ExistingSessionRow, reason: string): Promise<boolean> {
  if (!hasExpiredLocally(session)) return false;
  try {
    return (await closeProviderTerminalSession(session, reason)) === 'closed';
  } catch (error) {
    logger.error({ sessionId: session.id, error }, 'Could not confirm Xendit session state before retry');
    return false;
  }
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
        .select('id, target_type, status, payment_link_url, expires_at, payment_session_id, store_id, created_at, amount_php')
        .eq('order_id', order.id)
        .in('status', ['creating', 'active', 'reconciliation_required'])
        .maybeSingle();
      if (existingError) throw new Error(`Failed to inspect existing extension payment session: ${existingError.message}`);

      const existing = existingData as ExistingSessionRow | null;
      if (existing?.target_type === 'public_extension'
        && existing.status === 'active'
        && existing.payment_link_url
        && !hasExpiredLocally(existing)) {
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

      if (existing && await resolveExpiredActiveSession(existing, 'Extension checkout retry requested after local expiry')) {
        // Provider confirmed expiry/cancellation and the local claim was released.
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
        if (isRetryableDraftError(draftError)) {
          sessionId = null;
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_SESSION_RETRY', message: 'Payment setup conflicted with another request. Please try again.' },
          });
          return;
        }
        const normalizedMessage = draftError.message.toLowerCase();
        if (normalizedMessage.includes('no pending extension payments')) {
          res.status(409).json({
            success: false,
            error: { code: 'NO_PENDING_EXTENSION_BALANCE', message: 'There is no pending extension balance for this booking' },
          });
          return;
        }
        if (normalizedMessage.includes('already claimed')
          || normalizedMessage.includes('active xendit session')
          || isBlockingSessionError(draftError)) {
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
        successReturnUrl: returnUrl(webOrigin, paymentPath, 'processing', sessionId),
        cancelReturnUrl: returnUrl(webOrigin, paymentPath, 'cancelled', sessionId),
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
          .select('id, status, payment_link_url, expires_at, payment_session_id, store_id, created_at, amount_php')
          .eq('id', claimedSessionIds[0]!)
          .maybeSingle();
        if (existingError) throw new Error(`Failed to inspect existing payment session: ${existingError.message}`);
        const existing = existingData as ExistingSessionRow | null;
        if (existing?.status === 'completed') {
          res.status(409).json({ success: false, error: { code: 'BOOKING_ALREADY_PAID', message: 'These bookings have already been paid' } });
          return;
        }
        if (existing?.status === 'reconciliation_required') {
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_VERIFICATION_REQUIRED', message: 'Payment verification is in progress. Please contact Lola\'s Rentals before trying again.' },
          });
          return;
        }
        if (existing?.status === 'active' && existing.payment_link_url && !hasExpiredLocally(existing)) {
          res.json({ success: true, data: { sessionId: existing.id, checkoutUrl: existing.payment_link_url, expiresAt: existing.expires_at, amountPHP: Number(existing.amount_php) } });
          return;
        }
        if (existing && await resolveExpiredActiveSession(existing, 'Public checkout retry requested after local expiry')) {
          // Provider confirmed expiry/cancellation and the local claim was released.
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
      if (draftError) {
        if (isRetryableDraftError(draftError)) {
          sessionId = null;
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_SESSION_RETRY', message: 'Payment setup conflicted with another request. Please try again.' },
          });
          return;
        }
        if (isBlockingSessionError(draftError)) {
          sessionId = null;
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A payment session is already in progress for this order' },
          });
          return;
        }
        throw new Error(`Failed to reserve payment session: ${draftError.message}`);
      }

      const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
      const confirmationPath = `/book/confirmation/${encodeURIComponent(first.order_reference)}`;
      const xenditSession = await createXenditPaymentSession({
        referenceId,
        amountPHP,
        description: `Lola's Rentals - ${rows.map((row) => row.order_reference).join(', ')}`,
        successReturnUrl: returnUrl(webOrigin, confirmationPath, 'processing', sessionId),
        cancelReturnUrl: returnUrl(webOrigin, confirmationPath, 'cancelled', sessionId),
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

async function loadStaffRawBooking(rawOrderId: string): Promise<RawStaffBooking | null> {
  const { data, error } = await getSupabaseClient().from('orders_raw')
    .select('id, store_id, status, booking_channel, order_reference, web_payment_method, web_quote_raw, web_card_fee_surcharge, transfer_amount, charity_donation')
    .eq('id', rawOrderId).maybeSingle();
  if (error) throw new Error(`Failed to load raw booking: ${error.message}`);
  return data as RawStaffBooking | null;
}

function canAccessStaffBooking(req: Request, storeId: string): boolean {
  const stores = req.user?.storeIds ?? [];
  return stores.includes(COMPANY_STORE_ID) || stores.includes(storeId);
}

staffXenditRouter.get('/raw-orders/:rawOrderId/preview', authenticate, requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z.string().uuid().safeParse(req.params.rawOrderId);
      if (!parsed.success) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid booking ID' } }); return; }
      const booking = await loadStaffRawBooking(parsed.data);
      if (!booking) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }); return; }
      if (!canAccessStaffBooking(req, booking.store_id)) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot access this booking' } }); return; }
      const method = await loadXenditPaymentMethod('xendit');
      if (!method || booking.status !== 'unprocessed' || !['direct', 'walk_in'].includes(booking.booking_channel ?? '')) {
        res.status(409).json({ success: false, error: { code: 'BOOKING_NOT_PAYABLE', message: 'This booking cannot use a card payment link' } }); return;
      }
      const { data: existingPayments, error: paymentError } = await getSupabaseClient().from('payments')
        .select('id').eq('raw_order_id', booking.id).eq('payment_type', 'card_xendit').limit(1);
      if (paymentError) throw new Error(`Failed to inspect booking payment: ${paymentError.message}`);
      if (existingPayments && existingPayments.length > 0) {
        res.status(409).json({ success: false, error: { code: 'BOOKING_ALREADY_PAID', message: 'This booking has already been paid online' } }); return;
      }
      res.json({ success: true, data: staffRawQuote(booking, method) });
    } catch (error) { next(error); }
  });

staffXenditRouter.post('/raw-orders/sessions', authenticate, requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    let sessionId: string | null = null;
    let closeDraftOnFailure = true;
    try {
      if (!isXenditEnabled()) { res.status(503).json({ success: false, error: { code: 'XENDIT_DISABLED', message: 'Card payment is unavailable' } }); return; }
      const parsed = rawStaffSessionSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid booking request' } }); return; }
      const booking = await loadStaffRawBooking(parsed.data.rawOrderId);
      if (!booking) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }); return; }
      if (!canAccessStaffBooking(req, booking.store_id)) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot create a link for this booking' } }); return; }
      const method = await loadXenditPaymentMethod('xendit');
      if (!method || booking.status !== 'unprocessed' || !['direct', 'walk_in'].includes(booking.booking_channel ?? '')) {
        res.status(409).json({ success: false, error: { code: 'BOOKING_NOT_PAYABLE', message: 'This booking cannot use a card payment link' } }); return;
      }
      const quote = staffRawQuote(booking, method);
      if (quote.principalPHP <= 0) { res.status(409).json({ success: false, error: { code: 'BOOKING_NOT_PAYABLE', message: 'The booking quote is not payable' } }); return; }

      const { data: claim, error: claimError } = await getSupabaseClient().from('orders_raw')
        .select('xendit_payment_session_id').eq('id', booking.id).single();
      if (claimError) throw new Error(`Failed to inspect booking checkout: ${claimError.message}`);
      if (claim?.xendit_payment_session_id) {
        const { data: existing, error: existingError } = await getSupabaseClient().from('xendit_payment_sessions')
          .select('id, status, payment_link_url, expires_at, payment_session_id, store_id, created_at, amount_php')
          .eq('id', claim.xendit_payment_session_id).maybeSingle();
        if (existingError) throw new Error(`Failed to inspect booking checkout: ${existingError.message}`);
        const session = existing as ExistingSessionRow | null;
        if (session?.status === 'completed') {
          res.status(409).json({ success: false, error: { code: 'BOOKING_ALREADY_PAID', message: 'This booking has already been paid online' } }); return;
        }
        if (session?.status === 'reconciliation_required') {
          res.status(409).json({ success: false, error: { code: 'PAYMENT_VERIFICATION_REQUIRED', message: 'Finance must verify this checkout before another link is created' } }); return;
        }
        if (session?.status === 'active' && session.payment_link_url && !hasExpiredLocally(session)) {
          res.json({ success: true, data: { sessionId: session.id, checkoutUrl: session.payment_link_url, expiresAt: session.expires_at, amountPHP: Number(session.amount_php) } });
          return;
        }
        if (!session || !(await resolveExpiredActiveSession(session, 'Staff raw-booking checkout retry after local expiry'))) {
          res.status(409).json({ success: false, error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A checkout is already attached to this booking' } }); return;
        }
      }

      if (quote.requiresAcknowledgement && !parsed.data.acknowledgePriceChange) {
        res.status(409).json({ success: false, error: { code: 'PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED', message: 'Confirm the revised card-payment total before creating a link' } }); return;
      }
      sessionId = crypto.randomUUID();
      const referenceId = `XEN${sessionId.replaceAll('-', '')}`;
      const draftRpc = booking.booking_channel === 'walk_in'
        ? 'create_xendit_walkin_staff_session_draft'
        : 'create_xendit_raw_staff_session_draft';
      const { data: frozen, error: draftError } = await getSupabaseClient().rpc(draftRpc, {
        p_session_id: sessionId, p_reference_id: referenceId, p_raw_order_id: booking.id,
        p_store_id: booking.store_id, p_payment_method_id: method.id, p_created_by: req.user!.employeeId,
        p_expected_amount_php: quote.amountPHP,
      });
      if (draftError) {
        sessionId = null;
        if (isRetryableDraftError(draftError) || isBlockingSessionError(draftError)
          || /no longer payable|total changed/i.test(draftError.message ?? '')) {
          res.status(409).json({ success: false, error: { code: 'PAYMENT_SESSION_RETRY', message: 'Booking payment state changed. Refresh and try again.' } }); return;
        }
        throw new Error(`Failed to reserve raw-booking session: ${draftError.message}`);
      }
      const amountPHP = Number((frozen as { amountPHP: number }).amountPHP);
      const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
      const path = `/book/payment-return/${encodeURIComponent(booking.order_reference)}`;
      const checkout = await createXenditPaymentSession({
        referenceId, amountPHP, description: `Lola's Rentals - ${booking.order_reference}`,
        successReturnUrl: returnUrl(webOrigin, path, 'processing', sessionId),
        cancelReturnUrl: returnUrl(webOrigin, path, 'cancelled', sessionId),
        items: [{ referenceId: booking.order_reference, name: `Vehicle rental ${booking.order_reference}`, amountPHP }],
      });
      closeDraftOnFailure = false;
      try { await activateXenditSession(sessionId, checkout); }
      catch (error) {
        if (await cancelCheckoutAfterActivationFailure(sessionId, referenceId, checkout, error)) sessionId = null;
        throw error;
      }
      res.status(201).json({ success: true, data: { sessionId, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt, amountPHP } });
    } catch (error) {
      if (sessionId && closeDraftOnFailure) await closeFailedDraft(sessionId, error);
      logger.error({ error, sessionId }, 'Staff raw-booking Xendit session creation failed');
      next(error);
    }
  });

staffXenditRouter.post('/orders/:orderId/online-addons', authenticate, requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = onlineAddonsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Select configured add-ons and quantities' } });
        return;
      }
      const orderId = req.params.orderId as string;
      const { data: order, error: orderError } = await getSupabaseClient().from('orders')
        .select('store_id').eq('id', orderId).maybeSingle();
      if (orderError) throw new Error(`Failed to verify order store: ${orderError.message}`);
      if (!order) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
        return;
      }
      if (!canAccessStaffBooking(req, order.store_id)) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot modify this order' } });
        return;
      }
      if (!isXenditEnabled()) {
        res.status(503).json({ success: false, error: { code: 'XENDIT_DISABLED', message: 'Card payment is unavailable' } });
        return;
      }
      const { data: method, error: methodError } = await getSupabaseClient().from('payment_methods')
        .select('is_active,gateway_provider').eq('id', 'xendit').maybeSingle();
      if (methodError) throw new Error(`Failed to verify Xendit payment method: ${methodError.message}`);
      if (method?.is_active !== true || method.gateway_provider !== 'xendit') {
        res.status(503).json({ success: false, error: { code: 'PAYMENT_METHOD_UNAVAILABLE', message: 'Card payment method is unavailable' } });
        return;
      }
      const { data, error } = await getSupabaseClient().rpc('create_online_addons_atomic', {
        p_order_id: orderId, p_store_id: order.store_id, p_addons: parsed.data.addons,
      });
      if (error) {
        if (isBlockingSessionError(error)) {
          res.status(409).json({ success: false, error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A checkout is already active for this order' } });
          return;
        }
        throw new Error(`Failed to create online add-ons: ${error.message}`);
      }
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  });

staffXenditRouter.get('/orders/:orderId/:kind-preview', authenticate, requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kind = req.params.kind;
      if (kind !== 'rental' && kind !== 'addon') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment preview not found' } });
        return;
      }
      const supabase = getSupabaseClient();
      const { data: order, error: orderError } = await supabase.from('orders')
        .select('id,store_id,status,balance_due,payment_method_id')
        .eq('id', req.params.orderId).maybeSingle();
      if (orderError) throw new Error(`Failed to load order: ${orderError.message}`);
      if (!order || order.status !== 'active') {
        res.status(404).json({ success: false, error: { code: 'ORDER_NOT_PAYABLE', message: 'Active order not found' } });
        return;
      }
      if (!canAccessStaffBooking(req, order.store_id)) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot access this order' } });
        return;
      }
      const method = await loadXenditPaymentMethod('xendit');
      if (!method) {
        res.status(503).json({ success: false, error: { code: 'XENDIT_PAYMENT_METHOD_UNAVAILABLE', message: 'Card payment is unavailable' } });
        return;
      }
      const { data: pending, error: paymentError } = await supabase.from('payments')
        .select('id,amount,order_addon_id,payment_type,settlement_status,payment_method_id')
        .eq('order_id', order.id);
      if (paymentError) throw new Error(`Failed to load order payments: ${paymentError.message}`);
      const payments = pending ?? [];
      let principal: number;
      if (kind === 'rental') {
        if (order.payment_method_id !== method.id
          || payments.some((payment) => ['rental', 'card_xendit'].includes(payment.payment_type))
          || payments.some((payment) => payment.payment_type === 'addon' && payment.settlement_status === 'pending')) {
          res.status(409).json({ success: false, error: { code: 'RENTAL_LINK_UNAVAILABLE', message: 'This order needs staff review before a full-rental link' } });
          return;
        }
        principal = roundMoney(Number(order.balance_due ?? 0));
      } else {
        const addons = payments.filter((payment) => payment.payment_type === 'addon' && payment.settlement_status === 'pending');
        if (addons.some((payment) => !payment.order_addon_id || payment.payment_method_id !== method.id)) {
          res.status(409).json({ success: false, error: { code: 'ADDON_REVIEW_REQUIRED', message: 'A legacy add-on balance needs staff review' } });
          return;
        }
        principal = roundMoney(addons.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0));
      }
      if (principal <= 0 || principal > roundMoney(Number(order.balance_due ?? 0))) {
        res.status(409).json({ success: false, error: { code: 'NO_PAYABLE_BALANCE', message: 'There is no payable balance for this link' } });
        return;
      }
      const surcharge = roundMoney(principal * Number(method.surcharge_percent ?? 0) / 100);
      res.json({ success: true, data: {
        principalPHP: principal, surchargePHP: surcharge, amountPHP: roundMoney(principal + surcharge),
      } });
    } catch (error) { next(error); }
  });

async function createStaffDerivedSession(
  req: Request, res: Response, next: NextFunction,
  target: 'staff_addon' | 'staff_order',
): Promise<void> {
  let sessionId: string | null = null;
  let closeDraftOnFailure = true;
  try {
    if (!isXenditEnabled()) {
      res.status(503).json({ success: false, error: { code: 'XENDIT_DISABLED', message: 'Card payment is unavailable' } });
      return;
    }
    const orderId = z.string().min(1).safeParse(req.params.orderId);
    if (!orderId.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid order ID' } });
      return;
    }
    const supabase = getSupabaseClient();
    const { data: order, error: orderError } = await supabase.from('orders')
      .select('id,store_id,booking_token,status,balance_due')
      .eq('id', orderId.data).maybeSingle();
    if (orderError) throw new Error(`Failed to load order: ${orderError.message}`);
    if (!order || order.status !== 'active') {
      res.status(404).json({ success: false, error: { code: 'ORDER_NOT_PAYABLE', message: 'Active order not found' } });
      return;
    }
    if (!canAccessStaffBooking(req, order.store_id)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You cannot create a link for this order' } });
      return;
    }
    const method = await loadXenditPaymentMethod('xendit');
    if (!method) {
      res.status(503).json({ success: false, error: { code: 'XENDIT_PAYMENT_METHOD_UNAVAILABLE', message: 'Card payment is unavailable' } });
      return;
    }
    const { data: existingData, error: existingError } = await supabase.from('xendit_payment_sessions')
      .select('id,target_type,status,payment_link_url,expires_at,payment_session_id,store_id,created_at,amount_php')
      .eq('order_id', order.id).in('status', ['creating','active','reconciliation_required']).maybeSingle();
    if (existingError) throw new Error(`Failed to inspect checkout: ${existingError.message}`);
    const existing = existingData as ExistingSessionRow | null;
    if (existing?.target_type === target && existing.status === 'active'
        && existing.payment_link_url && !hasExpiredLocally(existing)) {
      res.json({ success: true, data: {
        sessionId: existing.id, checkoutUrl: existing.payment_link_url,
        expiresAt: existing.expires_at, amountPHP: Number(existing.amount_php),
      } });
      return;
    }
    if (existing && !(await resolveExpiredActiveSession(existing, 'Staff checkout retry after local expiry'))) {
      res.status(409).json({ success: false, error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A checkout is already attached to this order' } });
      return;
    }

    sessionId = crypto.randomUUID();
    const referenceId = `XEN${sessionId.replaceAll('-', '')}`;
    const rpc = target === 'staff_addon'
      ? 'create_xendit_addon_session_draft' : 'create_xendit_full_rental_session_draft';
    const { data: frozen, error: draftError } = await supabase.rpc(rpc, {
      p_session_id: sessionId, p_reference_id: referenceId, p_order_id: order.id,
      p_store_id: order.store_id, p_payment_method_id: method.id,
      p_created_by: req.user!.employeeId,
    });
    if (draftError) {
      sessionId = null;
      if (isRetryableDraftError(draftError) || isBlockingSessionError(draftError)) {
        res.status(409).json({ success: false, error: { code: 'PAYMENT_SESSION_RETRY', message: 'Payment state changed. Refresh and try again.' } });
        return;
      }
      throw new Error(`Failed to reserve ${target} checkout: ${draftError.message}`);
    }
    const amountPHP = Number((frozen as { amountPHP: number }).amountPHP);
    const reference = order.booking_token ?? order.id;
    const path = `/book/payment-return/${encodeURIComponent(reference)}`;
    const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
    const checkout = await createXenditPaymentSession({
      referenceId, amountPHP,
      description: `Lola's Rentals ${target === 'staff_addon' ? 'add-ons' : 'rental'} - ${reference}`,
      successReturnUrl: returnUrl(webOrigin, path, 'processing', sessionId),
      cancelReturnUrl: returnUrl(webOrigin, path, 'cancelled', sessionId),
      items: [{ referenceId: reference, name: target === 'staff_addon' ? 'Rental add-ons' : 'Vehicle rental', amountPHP }],
    });
    closeDraftOnFailure = false;
    try { await activateXenditSession(sessionId, checkout); }
    catch (error) {
      if (await cancelCheckoutAfterActivationFailure(sessionId, referenceId, checkout, error)) sessionId = null;
      throw error;
    }
    res.status(201).json({ success: true, data: {
      sessionId, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt,
      amountPHP, principalAmountPHP: Number((frozen as { principalPHP: number }).principalPHP),
      surchargeAmountPHP: Number((frozen as { surchargePHP: number }).surchargePHP),
    } });
  } catch (error) {
    if (sessionId && closeDraftOnFailure) await closeFailedDraft(sessionId, error);
    logger.error({ error, sessionId, target }, 'Staff derived Xendit session creation failed');
    next(error);
  }
}

staffXenditRouter.post('/orders/:orderId/addon-session', authenticate, requirePermission(Permission.EditOrders),
  async (req, res, next) => createStaffDerivedSession(req, res, next, 'staff_addon'));
staffXenditRouter.post('/orders/:orderId/rental-session', authenticate, requirePermission(Permission.EditOrders),
  async (req, res, next) => createStaffDerivedSession(req, res, next, 'staff_order'));

staffXenditRouter.get('/sessions/:id/status', authenticate, requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payment session id' } });
        return;
      }
      const { data, error } = await getSupabaseClient().from('xendit_payment_sessions')
        .select('status,store_id').eq('id', id.data).maybeSingle();
      if (error) throw new Error(`Failed to load staff checkout status: ${error.message}`);
      if (!data || !canAccessStaffBooking(req, data.store_id)) {
        res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } });
        return;
      }
      res.json({ success: true, data: { status: data.status } });
    } catch (error) { next(error); }
  });

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

      const { data: pendingAddons, error: addonError } = await supabase.from('payments')
        .select('id').eq('order_id', order.id).eq('payment_type', 'addon')
        .eq('settlement_status', 'pending').limit(1);
      if (addonError) throw new Error(`Failed to verify pending add-ons: ${addonError.message}`);
      if (pendingAddons && pendingAddons.length > 0) {
        res.status(409).json({ success: false, error: {
          code: 'ADDON_LINK_REQUIRED', message: 'Pending add-ons need a dedicated card payment link',
        } });
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
        .select('id, status, payment_link_url, expires_at, payment_session_id, store_id, created_at, amount_php')
        .eq('order_id', order.id)
        .in('status', ['creating', 'active', 'reconciliation_required'])
        .maybeSingle();
      if (existingError) throw new Error(`Failed to inspect existing payment session: ${existingError.message}`);
      const existing = existingData as ExistingSessionRow | null;
      if (existing?.status === 'active'
        && existing.payment_link_url
        && Number(existing.amount_php) === amountPHP
        && !hasExpiredLocally(existing)) {
        res.json({ success: true, data: { sessionId: existing.id, checkoutUrl: existing.payment_link_url, expiresAt: existing.expires_at, amountPHP: Number(existing.amount_php) } });
        return;
      }
      if (existing && await resolveExpiredActiveSession(existing, 'Staff checkout retry requested after local expiry')) {
        // Provider confirmed expiry/cancellation and the local claim was released.
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
      if (draftError) {
        if (isRetryableDraftError(draftError)) {
          sessionId = null;
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_SESSION_RETRY', message: 'Payment setup conflicted with another request. Please try again.' },
          });
          return;
        }
        if (isBlockingSessionError(draftError)) {
          sessionId = null;
          res.status(409).json({
            success: false,
            error: { code: 'PAYMENT_ALREADY_IN_PROGRESS', message: 'A payment session is already in progress for this order' },
          });
          return;
        }
        throw new Error(`Failed to reserve payment session: ${draftError.message}`);
      }

      const webOrigin = publicWebOriginFromEnv(process.env.WEB_URL);
      const reference = order.booking_token ?? order.id;
      const xenditSession = await createXenditPaymentSession({
        referenceId,
        amountPHP,
        description: parsed.data.description ?? `Lola's Rentals - ${reference}`,
        successReturnUrl: returnUrl(webOrigin, `/book/payment-return/${encodeURIComponent(reference)}`, 'processing', sessionId),
        cancelReturnUrl: returnUrl(webOrigin, `/book/payment-return/${encodeURIComponent(reference)}`, 'cancelled', sessionId),
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

staffXenditRouter.get(
  '/orders/:orderId/session',
  authenticate,
  requirePermission(Permission.EditOrders),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderId = z.string().min(1).safeParse(req.params.orderId);
      if (!orderId.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid order id' } });
        return;
      }

      const supabase = getSupabaseClient();
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, store_id')
        .eq('id', orderId.data)
        .maybeSingle();
      if (orderError) throw new Error(`Failed to load order payment session: ${orderError.message}`);
      const order = orderData as { id: string; store_id: string } | null;
      const stores = req.user?.storeIds ?? [];
      if (!order || (!stores.includes(COMPANY_STORE_ID) && !stores.includes(order.store_id))) {
        res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from('xendit_payment_sessions')
        .select('id, status, payment_link_url')
        .eq('order_id', order.id)
        .in('target_type', ['staff_order', 'staff_addon'])
        .in('status', ['creating', 'active', 'reconciliation_required'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sessionError) throw new Error(`Failed to load Xendit payment session: ${sessionError.message}`);

      const session = sessionData as { id: string; status: XenditSessionStatus; payment_link_url: string | null } | null;
      res.json({
        success: true,
        data: session
          ? {
              id: session.id,
              status: session.status,
              operatorMessage: xenditOperatorMessage(session.status),
              checkoutUrl: session.status === 'active' ? session.payment_link_url : null,
            }
          : null,
      });
    } catch (error) { next(error); }
  },
);

staffXenditRouter.get(
  '/sessions/:id/provider-details',
  authenticate,
  requirePermission(Permission.ViewCashup),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid session id' } });
        return;
      }
      const { data, error } = await getSupabaseClient()
        .from('xendit_payment_sessions')
        .select('id, store_id, status, payment_id, payment_request_id, payment_session_id, reference_id, amount_php')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Xendit transaction: ${error.message}`);
      const session = data as {
        id: string; store_id: string; status: string; payment_id: string | null;
        payment_request_id: string | null; payment_session_id: string | null;
        reference_id: string; amount_php: number | string;
      } | null;
      const stores = req.user?.storeIds ?? [];
      if (!session || (!stores.includes(COMPANY_STORE_ID) && !stores.includes(session.store_id))) {
        res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } });
        return;
      }
      let channelCode: string | null = null;
      if (session.status === 'completed' && session.payment_request_id) {
        const provider = await getXenditPaymentRequest(session.payment_request_id);
        const businessId = process.env.XENDIT_BUSINESS_ID?.trim();
        if (!businessId || !secureEqual(provider.businessId, businessId)
          || provider.currency !== 'PHP'
          || roundMoney(provider.amount) !== roundMoney(Number(session.amount_php))) {
          throw new Error('Xendit payment request differs from the stored session');
        }
        channelCode = provider.channelCode;
      }
      res.json({ success: true, data: {
        sessionId: session.id,
        status: session.status,
        providerSessionId: session.payment_session_id,
        providerPaymentId: session.payment_id,
        providerReferenceId: session.reference_id,
        channelCode,
      } });
    } catch (error) { next(error); }
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
        .select('id, status, payment_session_id, payment_link_url, expires_at, created_at, amount_php, store_id')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Xendit session: ${error.message}`);
      const session = data as ExistingSessionRow | null;
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
        try {
          const outcome = await closeProviderTerminalSession(
            session,
            'Staff cancellation encountered a provider error',
            req.user!.employeeId,
          );
          if (outcome !== 'still_active') {
            res.json({ success: true, data: { status: outcome === 'closed' ? 'cancelled' : outcome } });
            return;
          }
        } catch (recoveryError) {
          logger.error({ sessionId: session.id, providerSessionId: session.payment_session_id, cancelError, recoveryError }, 'Xendit hosted checkout cancellation recovery failed');
        }
        logger.error({ sessionId: session.id, providerSessionId: session.payment_session_id, cancelError }, 'Xendit hosted checkout cancellation failed while provider still reports it active');
        throw cancelError;
      }
      const outcome = await closeProviderTerminalSession(
        session,
        'Staff cancelled the hosted checkout',
        req.user!.employeeId,
      );
      if (outcome === 'still_active') {
        res.status(409).json({ success: false, error: { code: 'SESSION_STILL_ACTIVE', message: 'Xendit still reports this checkout as active' } });
        return;
      }
      res.json({ success: true, data: { status: outcome === 'closed' ? 'cancelled' : outcome } });
    } catch (error) { next(error); }
  },
);

staffXenditRouter.post(
  '/sessions/:id/reconcile-terminal',
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
        .select('id, status, payment_session_id, payment_link_url, expires_at, created_at, amount_php, store_id')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Xendit session: ${error.message}`);
      const session = data as ExistingSessionRow | null;
      const stores = req.user?.storeIds ?? [];
      if (!session || (!stores.includes(COMPANY_STORE_ID) && !stores.includes(session.store_id))) {
        res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Payment session not found' } });
        return;
      }
      if (session.status !== 'active' || !session.payment_session_id) {
        res.status(409).json({ success: false, error: { code: 'SESSION_NOT_RECONCILABLE', message: 'Only an active provider-backed checkout can be reconciled here' } });
        return;
      }
      const outcome = await closeProviderTerminalSession(session, parsed.data.reason, req.user!.employeeId);
      if (outcome === 'still_active') {
        res.status(409).json({ success: false, error: { code: 'SESSION_STILL_ACTIVE', message: 'Xendit still reports this checkout as active' } });
        return;
      }
      res.json({ success: true, data: { status: outcome === 'closed' ? 'closed' : outcome } });
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

      if (payload.event === 'payment_session.expired') {
        const { error: closeError } = await supabase.rpc('close_xendit_session_after_provider_terminal', {
          p_session_id: session.id,
          p_expected_payment_session_id: payload.data.payment_session_id,
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
        // The SQL RPC records a known completed event without a payment id as
        // reconciliation_required before it can create any financial records.
        p_payment_id: payload.data.payment_id ?? null,
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
