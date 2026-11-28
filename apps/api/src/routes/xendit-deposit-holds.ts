import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { COMPANY_STORE_ID, Permission } from '@lolas/shared';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logger } from '../lib/logger.js';
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  cancelXenditPaymentSession, createXenditPaymentSession, getXenditCardPayment,
  getXenditPaymentRequest, getXenditHoldSession, isXenditEnabled, requestXenditHoldAction,
  XenditSessionNotActiveError, XenditSessionValidationError,
} from '../services/xendit.js';

const router = Router();
const holdReference = /^XH[0-9a-f]{32}$/;
const terminal = ['captured', 'released', 'expired', 'failed'];
const closedRequestStatuses = ['CANCELED', 'EXPIRED', 'FAILED'];
const isTestKey = () => process.env.XENDIT_SECRET_KEY?.trim().startsWith('xnd_development_') === true;
const canCreate = () => isXenditEnabled() && isTestKey() && process.env.XENDIT_DEPOSIT_HOLDS_ENABLED === 'true';
const basePath = '/orders/:orderId/deposit-holds';
const staff = [authenticate, requirePermission(Permission.EditOrders)];
const creationRecoveryDelayMs = 120_000;

type Hold = {
  id: string;
  reference_id: string;
  order_id: string;
  amount_php: number;
  captured_php: number | null;
  status: string;
  created_at: string;
  release_step: 'session' | 'session_rejected' | 'payment' | null;
  provider_session_id: string | null;
  provider_payment_id: string | null;
  provider_request_id: string | null;
  provider_capture_id: string | null;
  recovered_at: string | null;
  authorization_expires_at: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
};

const holdFields = 'id,reference_id,order_id,amount_php,captured_php,status,created_at,release_step,provider_session_id,provider_payment_id,provider_request_id,provider_capture_id,recovered_at,authorization_expires_at,checkout_url,checkout_expires_at';
const db = getSupabaseClient;
const staleCreation = (hold: Hold) => hold.status === 'creating'
  && Date.now() - Date.parse(hold.created_at) >= creationRecoveryDelayMs;
const missingCheckout = (hold: Hold) => (hold.status === 'reconciliation_required' || staleCreation(hold)) && !hold.recovered_at
  && !hold.provider_session_id && !hold.provider_payment_id && !hold.provider_request_id && !hold.provider_capture_id;
const canContinueRelease = (hold: Hold) => hold.release_step === 'session_rejected'
  && ['release_pending', 'reconciliation_required'].includes(hold.status);

function reject(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ success: false, error: { code, message } });
}

function success(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data });
}

async function staffOrder(req: Request, res: Response) {
  const { data, error } = await db().from('orders').select('id,store_id,status')
    .eq('id', req.params.orderId).maybeSingle();
  if (error) throw new Error(`Failed to read hold order: ${error.message}`);
  const stores = req.user?.storeIds ?? [];
  if (!data || (!stores.includes(data.store_id) && !stores.includes(COMPANY_STORE_ID))) {
    reject(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
    return null;
  }
  return data as { id: string; store_id: string; status: string };
}

async function findHold(column: 'id' | 'reference_id' | 'provider_payment_id', value: string, orderId?: string) {
  const query = db().from('xendit_deposit_holds').select(holdFields).eq(column, value);
  if (orderId) query.eq('order_id', orderId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to find Xendit deposit hold: ${error.message}`);
  return data as Hold | null;
}

async function observe(id: string, observation: Record<string, unknown>) {
  const { error } = await db().rpc('observe_xendit_deposit_hold', { p_id: id, p_observation: observation });
  if (error) throw new Error(`Failed to update Xendit deposit hold: ${error.message}`);
}

type ProviderHoldSession = Awaited<ReturnType<typeof getXenditHoldSession>>;

function matchesHoldSession(hold: Hold, sessionId: string, session: ProviderHoldSession) {
  const businessId = process.env.XENDIT_BUSINESS_ID?.trim();
  return !!businessId && session.business_id === businessId && session.payment_session_id === sessionId
    && session.reference_id === hold.reference_id && session.currency === 'PHP' && session.amount === Number(hold.amount_php)
    && session.capture_method === 'MANUAL' && (!hold.provider_session_id || hold.provider_session_id === sessionId);
}

async function refreshHold(hold: Hold, sessionId: string, options: {
  webhookPaymentId?: string | null; webhookEvent?: string; verifiedSession?: ProviderHoldSession;
} = {}) {
  const { webhookPaymentId, webhookEvent, verifiedSession } = options;
  const session = verifiedSession ?? await getXenditHoldSession(sessionId);
  const businessId = process.env.XENDIT_BUSINESS_ID?.trim();
  const amount = Number(hold.amount_php);
  const conflict = () => observe(hold.id, { state: 'conflict' });
  if (!matchesHoldSession(hold, sessionId, session)) {
    await conflict();
    return;
  }
  if (webhookEvent?.startsWith('payment_session.') && !hold.provider_session_id) {
    await observe(hold.id, { state: 'session_identified', sessionId });
  }
  if (session.status === 'ACTIVE' && webhookEvent?.startsWith('payment_session.')) {
    throw new Error('Xendit session status has not caught up with the terminal callback');
  }

  const requestId = session.payment_request_id ?? session.latest_payment_request_id ?? hold.provider_request_id;
  const closedState = session.status === 'EXPIRED' ? 'expired' : session.status === 'CANCELED' ? 'released' : null;
  const matchesRequest = (request: Awaited<ReturnType<typeof getXenditPaymentRequest>>) =>
    request.paymentRequestId === requestId && request.businessId === businessId
    && request.amount === amount && request.currency === 'PHP';
  let paymentId = session.payment_id ?? hold.provider_payment_id;
  let request: Awaited<ReturnType<typeof getXenditPaymentRequest>> | undefined;
  if (!paymentId && requestId && session.status !== 'ACTIVE') {
    request = await getXenditPaymentRequest(requestId);
    if (!matchesRequest(request)) {
      await conflict();
      return;
    }
    paymentId = request.latestPaymentId ?? null;
  }
  if (webhookPaymentId && paymentId !== webhookPaymentId) {
    // A failed card attempt may arrive after another payment already became canonical.
    if (webhookEvent === 'payment.failure' && (paymentId || session.status === 'ACTIVE')) return;
    // Session and payment endpoints can lag an authenticated callback. Let Xendit retry.
    if (!paymentId) throw new Error('Xendit session has not linked the webhook payment yet');
    await conflict();
    return;
  }
  if (paymentId) {
    const payment = await getXenditCardPayment(paymentId);
    if (!requestId || payment.payment_id !== paymentId || payment.payment_request_id !== requestId
      || payment.business_id !== businessId || payment.currency !== 'PHP' || payment.request_amount !== amount
      || payment.channel_code !== 'CARDS' || payment.capture_method !== 'MANUAL') {
      await conflict();
      return;
    }
    const capture = payment.captures?.[0];
    const identity = { sessionId, paymentId, requestId };
    if ((['payment.capture','payment.expiry'].includes(webhookEvent ?? '')
      && ['PENDING','AUTHORIZED'].includes(payment.status))
      || (webhookEvent === 'payment.authorization' && payment.status === 'PENDING')) {
      throw new Error('Xendit payment status has not caught up with the terminal callback');
    }
    switch (payment.status) {
      case 'AUTHORIZED':
        if (capture) { await conflict(); return; }
        await observe(hold.id, { ...identity, state: 'authorized' });
        return session.status === 'COMPLETED' ? paymentId : undefined;
      case 'CANCELED':
      case 'EXPIRED':
        if (payment.captures?.length) { await conflict(); return; }
        await observe(hold.id, { ...identity, state: payment.status === 'EXPIRED' ? 'expired' : 'released' });
        return;
      case 'SUCCEEDED':
        if (!capture || payment.captures?.length !== 1) { await conflict(); return; }
        await observe(hold.id, { ...identity, state: 'captured', captureId: capture.capture_id,
          capturedPHP: capture.capture_amount, capturedAt: capture.capture_timestamp });
        return;
      case 'PENDING':
        await observe(hold.id, { ...identity, state: 'pending' });
        return;
      case 'FAILED':
        if (capture || webhookEvent === 'payment.capture') { await conflict(); return; }
        // A failed attempt does not close a hosted checkout that can still accept a retry.
        if (session.status === 'ACTIVE') return;
        if (!closedState) { await conflict(); return; }
        request ??= await getXenditPaymentRequest(requestId);
        if (!matchesRequest(request) || !closedRequestStatuses.includes(request.status ?? '')
          || (request.latestPaymentId && request.latestPaymentId !== paymentId)) {
          await conflict();
          return;
        }
        await observe(hold.id, { ...identity, state: closedState });
        return;
      default:
        await conflict();
        return;
    }
  }
  if (session.status === 'ACTIVE' && session.payment_link_url?.startsWith('https://') && session.expires_at) {
    await observe(hold.id, { state: 'awaiting_authorization', sessionId,
      checkoutUrl: session.payment_link_url, checkoutExpiresAt: session.expires_at });
  } else if (closedState) {
    if (requestId && !closedRequestStatuses.includes(request?.status ?? '')) {
      await conflict();
      return;
    }
    await observe(hold.id, { sessionId, state: closedState });
  } else {
    throw new Error('Xendit has not confirmed the authorization yet');
  }
}

async function continueCheckoutRelease(hold: Hold, sessionId: string, storeId: string) {
  let paymentId: string | undefined;
  try {
    paymentId = await refreshHold(hold, sessionId);
  } catch (cause) {
    logger.warn({ cause, holdId: hold.id }, 'Checkout release needs another Xendit status check');
    return;
  }
  if (!paymentId) return;
  const { data, error } = await db().rpc('reserve_xendit_deposit_hold_release_void', {
    p_id: hold.id, p_order_id: hold.order_id, p_store_id: storeId, p_payment_id: paymentId,
  });
  if (error) throw new Error(`Failed to reserve Xendit hold release: ${error.message}`);
  if (data !== true) return;
  try {
    await requestXenditHoldAction(paymentId);
    await refreshHold(hold, sessionId);
  } catch (cause) {
    logger.warn({ cause, holdId: hold.id }, 'Xendit deposit hold void needs verification');
    await observe(hold.id, { state: 'uncertain', expectedStatus: 'release_pending' });
  }
}

export function holdCoverage(expiresAt: string | null, through: string | null, now = Date.now()) {
  if (!expiresAt || !through || !Number.isFinite(Date.parse(expiresAt)) || !Number.isFinite(Date.parse(through))) {
    return 'unverified';
  }
  return Date.parse(expiresAt) > Math.max(Date.parse(through), now) ? 'verified' : 'insufficient';
}

async function view(hold: Hold | null, user: Request['user']) {
  if (!hold) return { enabled: canCreate(), hold: null };
  let through: string | null = null;
  if (hold.authorization_expires_at) {
    const { data, error } = await db().from('order_items').select('dropoff_datetime').eq('order_id', hold.order_id);
    if (error) throw new Error(`Failed to verify deposit hold coverage: ${error.message}`);
    if (data?.length && data.every((item) => item.dropoff_datetime)) {
      through = data.map((item) => item.dropoff_datetime as string)
        .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
    }
  }
  return { enabled: canCreate(), hold: {
    id: hold.id, reference: hold.reference_id, status: hold.status,
    amountPHP: Number(hold.amount_php), capturedPHP: hold.captured_php,
    authorizationExpiresAt: hold.authorization_expires_at,
    coverage: holdCoverage(hold.authorization_expires_at, through),
    checkoutUrl: hold.status === 'awaiting_authorization' &&
      Date.parse(hold.checkout_expires_at ?? '') > Date.now() ? hold.checkout_url : null,
    blocking: !terminal.includes(hold.status),
    canRelease: isTestKey() && ['awaiting_authorization','authorized'].includes(hold.status),
    canCapture: canCreate() && user?.roleId === 'role-admin' && hold.status === 'authorized',
    canRefresh: isTestKey() && !!hold.provider_session_id && !terminal.includes(hold.status),
    canRecover: isTestKey() && user?.roleId === 'role-admin' && missingCheckout(hold),
    canContinueRelease: isTestKey() && canContinueRelease(hold),
  } };
}

router.get(basePath, ...staff, async (req, res, next) => {
  try {
    const order = await staffOrder(req, res);
    if (!order) return;
    const { data, error } = await db().from('xendit_deposit_holds').select(holdFields)
      .eq('order_id', order.id).order('created_at', { ascending: false });
    if (error) {
      if (!canCreate() && ['42P01','PGRST205'].includes(error.code)) { success(res, await view(null, req.user)); return; }
      throw new Error(`Failed to read deposit hold status: ${error.message}`);
    }
    const holds = (data ?? []) as Hold[];
    success(res, await view(holds.find((hold) => !terminal.includes(hold.status)) ?? holds[0] ?? null, req.user));
  } catch (error) { next(error); }
});

router.post(basePath, ...staff, async (req, res, next) => {
  try {
    if (!canCreate()) { reject(res, 503, 'HOLDS_DISABLED', 'Card holds are available only in enabled test mode'); return; }
    const order = await staffOrder(req, res);
    if (!order) return;
    const returnUrl = new URL('/book/deposit-hold-return', publicWebOriginFromEnv(process.env.WEB_URL)).href;
    const { data, error } = await db().rpc('create_xendit_deposit_hold', {
      p_id: randomUUID(), p_order_id: order.id, p_store_id: order.store_id, p_employee_id: req.user!.employeeId,
    });
    if (error) { reject(res, 409, 'HOLD_UNAVAILABLE', error.message); return; }
    const hold = data as Hold;
    const amountPHP = Number(hold.amount_php);
    let sessionId: string | undefined;
    try {
      if (staleCreation(hold)) throw new Error('Xendit checkout creation window elapsed before dispatch');
      const checkout = await createXenditPaymentSession({
        referenceId: hold.reference_id, amountPHP, manualCapture: true,
        description: "Lola's Rentals security deposit card hold",
        successReturnUrl: returnUrl, cancelReturnUrl: returnUrl,
        items: [{ referenceId: hold.reference_id, name: 'Security deposit authorization', amountPHP }],
      });
      sessionId = checkout.paymentSessionId;
      await refreshHold(hold, sessionId);
    } catch (cause) {
      if (!sessionId && cause instanceof XenditSessionValidationError) {
        await observe(hold.id, { state: 'creation_rejected' });
        reject(res, 422, 'HOLD_PROVIDER_REJECTED', 'Xendit rejected the test checkout. Check card authorization support.');
        return;
      }
      logger.warn({ cause, holdId: hold.id }, 'Xendit deposit hold creation needs verification');
      await observe(hold.id, { state: 'uncertain', expectedStatus: 'creating', sessionId });
    }
    success(res, await view(await findHold('id', hold.id, order.id), req.user), 201);
  } catch (error) { next(error); }
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('capture'), amountPHP: z.number().positive()
    .refine((amount) => Number(amount.toFixed(2)) === amount), reason: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal('release') }),
  z.object({ action: z.literal('continue_release') }),
  z.object({ action: z.literal('refresh') }),
  z.object({ action: z.literal('recover_session'), sessionId: z.string().trim().regex(/^ps-[A-Za-z0-9]{1,125}$/) }),
  z.object({ action: z.literal('confirm_no_session'), supportCaseId: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(10).max(500), confirmed: z.literal(true) }),
]);

router.post(`${basePath}/:holdId/actions`, ...staff, async (req, res, next) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    const id = z.string().uuid().safeParse(req.params.holdId);
    if (!parsed.success || !id.success) { reject(res, 400, 'INVALID_HOLD_ACTION', 'Invalid deposit hold action'); return; }
    const action = parsed.data;
    const recovery = action.action === 'recover_session' || action.action === 'confirm_no_session';
    if ((recovery || action.action === 'capture') && req.user?.roleId !== 'role-admin') {
      reject(res, 403, 'FORBIDDEN', recovery ? 'Only an administrator can resolve a missing checkout'
        : 'Only an administrator can capture a card hold'); return;
    }
    if (!isTestKey() || (action.action === 'capture' && !canCreate())) {
      reject(res, 503, 'HOLDS_DISABLED', 'Card hold action is not available'); return;
    }
    const order = await staffOrder(req, res);
    if (!order) return;
    const hold = await findHold('id', id.data, order.id);
    if (recovery) {
      if (!hold || order.status !== 'active' || !missingCheckout(hold)) {
        reject(res, 409, 'HOLD_UNAVAILABLE', 'Hold is no longer eligible for missing checkout recovery'); return;
      }
      const sessionId = action.action === 'recover_session' ? action.sessionId : null;
      let verifiedSession: ProviderHoldSession | undefined;
      if (sessionId) {
        try {
          verifiedSession = await getXenditHoldSession(sessionId);
        } catch (cause) {
          logger.warn({ cause, holdId: hold.id }, 'Xendit session lookup failed during hold recovery');
          reject(res, 502, 'HOLD_LOOKUP_FAILED', 'Could not verify this checkout with Xendit'); return;
        }
        if (!matchesHoldSession(hold, sessionId, verifiedSession)) {
          reject(res, 409, 'HOLD_SESSION_MISMATCH', 'Xendit checkout does not match this hold'); return;
        }
      }
      const { data, error } = await db().rpc('recover_xendit_deposit_hold', {
        p_id: hold.id, p_order_id: order.id, p_store_id: order.store_id, p_employee_id: req.user!.employeeId,
        p_session_id: sessionId, p_support_case_id: action.action === 'confirm_no_session' ? action.supportCaseId : null,
        p_reason: action.action === 'confirm_no_session' ? action.reason : null,
      });
      if (error) { reject(res, 409, 'HOLD_RECOVERY_UNAVAILABLE', error.message); return; }
      if (sessionId) {
        try {
          await refreshHold(data as Hold, sessionId, { verifiedSession });
        } catch (cause) {
          logger.warn({ cause, holdId: hold.id }, 'Attached Xendit deposit hold needs a refresh');
        }
      }
      success(res, await view(await findHold('id', hold.id, order.id), req.user));
      return;
    }
    if (!hold?.provider_session_id) { reject(res, 409, 'HOLD_UNAVAILABLE', 'Deposit hold has no verified checkout'); return; }
    if (action.action === 'refresh') {
      await refreshHold(hold, hold.provider_session_id);
    } else if (action.action === 'continue_release') {
      if (!canContinueRelease(hold)) {
        reject(res, 409, 'HOLD_ACTION_UNAVAILABLE', 'Hold has no checkout release to finish'); return;
      }
      await continueCheckoutRelease(hold, hold.provider_session_id, order.store_id);
    } else {
      const { data, error } = await db().rpc('reserve_xendit_deposit_hold_action', {
        p_id: hold.id, p_order_id: order.id, p_store_id: order.store_id, p_employee_id: req.user!.employeeId,
        p_kind: action.action, p_amount: action.action === 'capture' ? action.amountPHP : null,
        p_reason: action.action === 'capture' ? action.reason : null,
      });
      if (error) { reject(res, 409, 'HOLD_ACTION_UNAVAILABLE', error.message); return; }
      const reserved = data as Hold;
      try {
        if (reserved.provider_payment_id) {
          await requestXenditHoldAction(reserved.provider_payment_id, action.action === 'capture' ? action.amountPHP : undefined);
        } else {
          await cancelXenditPaymentSession(hold.provider_session_id);
        }
        await refreshHold(reserved, hold.provider_session_id);
      } catch (cause) {
        if (action.action === 'release' && reserved.release_step === 'session' && cause instanceof XenditSessionNotActiveError) {
          await observe(hold.id, { state: 'session_cancel_rejected', sessionId: hold.provider_session_id });
          await continueCheckoutRelease(reserved, hold.provider_session_id, order.store_id);
        } else {
          logger.warn({ cause, holdId: hold.id }, 'Xendit deposit hold action needs verification');
          await observe(hold.id, { state: 'uncertain', expectedStatus: `${action.action}_pending` });
        }
      }
    }
    success(res, await view(await findHold('id', hold.id, order.id), req.user));
  } catch (error) { next(error); }
});

const paymentEvents = ['payment.authorization', 'payment.capture', 'payment.expiry', 'payment.failure'];

// The caller verifies the callback token. Match durable targets, not the
// callback's optional capture_method or a customer return URL.
export async function handleXenditHoldWebhook(body: unknown, res: Response): Promise<boolean> {
  const event = z.object({
    event: z.string(),
    data: z.object({ reference_id: z.string().optional(), payment_id: z.string().nullish() }).passthrough(),
    business_id: z.string().optional(),
  }).safeParse(body);
  if (!event.success) return false;
  const { data, business_id, event: kind } = event.data;
  const sessionEvent = ['payment_session.completed', 'payment_session.expired'].includes(kind);
  const reference = data.reference_id && holdReference.test(data.reference_id) ? data.reference_id : null;
  if (!(sessionEvent && reference) && !paymentEvents.includes(kind)) return false;
  if (!business_id || business_id !== process.env.XENDIT_BUSINESS_ID?.trim()) {
    reject(res, 401, 'INVALID_BUSINESS_ID', 'Invalid Xendit business id');
    return true;
  }
  let hold: Hold | null = null;
  if (reference) {
    hold = await findHold('reference_id', reference);
    if (!hold) throw new Error('Xendit deposit hold reference is unknown');
  } else if (data.payment_id && isTestKey()) {
    const { data: found, error } = await db().from('xendit_deposit_holds').select(holdFields)
      .eq('provider_payment_id', data.payment_id).maybeSingle();
    if (error && (canCreate() || !['42P01','PGRST205'].includes(error.code))) {
      throw new Error(`Failed to match Xendit payment to a hold: ${error.message}`);
    }
    hold = found as Hold | null;
  }
  if (hold) {
    const sessionId = sessionEvent ? z.string().min(1).parse(data.payment_session_id) : hold.provider_session_id;
    if (!sessionId) throw new Error('Awaiting Xendit session identity');
    try {
      await refreshHold(hold, sessionId, { webhookPaymentId: data.payment_id, webhookEvent: kind });
    } catch (cause) {
      throw new Error('Could not verify the Xendit deposit hold callback', { cause });
    }
  }
  success(res, { received: true });
  return true;
}

export const staffXenditDepositHoldRouter = router;
