import crypto from 'crypto';
import { z } from 'zod';

const XenditSessionResponseSchema = z.object({
  payment_session_id: z.string().min(1),
  reference_id: z.string().min(1),
  status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELED']),
  payment_link_url: z.string().url(),
  expires_at: z.string().datetime(),
});

const XenditWebhookSchema = z.object({
  event: z.enum(['payment_session.completed', 'payment_session.expired']),
  business_id: z.string().min(1),
  created: z.string().datetime(),
  data: z.object({
    payment_session_id: z.string().min(1),
    reference_id: z.string().min(1).max(64),
    payment_request_id: z.string().nullable().optional(),
    payment_id: z.string().nullable().optional(),
    session_type: z.literal('PAY'),
    mode: z.literal('PAYMENT_LINK'),
    currency: z.literal('PHP'),
    amount: z.number().positive(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELED']),
  }).passthrough(),
}).passthrough();

const XenditDashboardTestWebhookSchema = z.object({
  event: z.enum(['payment_session.completed', 'payment_session.expired']),
  business_id: z.string().min(1),
  created: z.string().datetime(),
  data: z.object({
    id: z.string().min(1),
    reference_id: z.literal('test_session'),
    session_type: z.literal('SAVE'),
    mode: z.literal('PAYMENT_LINK'),
    country: z.literal('ID'),
    currency: z.literal('IDR'),
    status: z.enum(['COMPLETED', 'EXPIRED']),
  }).passthrough(),
}).passthrough();

const XenditDashboardRefundTestWebhookSchema = z.object({
  event: z.enum(['refund.succeeded', 'refund.failed']),
  business_id: z.literal('sample_business_id'),
  created: z.string().datetime(),
  data: z.object({
    id: z.string().startsWith('rfd-'),
    reference_id: z.string().min(1),
    payment_id: z.string().min(1),
    currency: z.literal('IDR'),
    status: z.enum(['SUCCEEDED', 'FAILED']),
  }).passthrough(),
}).passthrough();

export interface XenditSessionItem {
  referenceId: string;
  name: string;
  amountPHP: number;
}

export interface CreateXenditSessionParams {
  referenceId: string;
  amountPHP: number;
  description: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  items: XenditSessionItem[];
  allowedPaymentChannels?: string[];
  manualCapture?: boolean;
}

export interface XenditSessionResult {
  paymentSessionId: string;
  checkoutUrl: string;
  expiresAt: string;
}

export class XenditSessionValidationError extends Error {}
export class XenditSessionNotActiveError extends Error {}

type ReturnStatePayload = { sessionId: string; expiresAt: string };

function returnStateSecret(): string {
  const secret = process.env.XENDIT_RETURN_STATE_SECRET?.trim();
  if (!secret) throw new Error('XENDIT_RETURN_STATE_SECRET environment variable is not set');
  return secret;
}

export function createXenditReturnState(payload: ReturnStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', returnStateSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyXenditReturnState(token: string | undefined, sessionId: string): boolean {
  if (!token) return false;
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) return false;
  const expected = crypto.createHmac('sha256', returnStateSecret()).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ReturnStatePayload;
    return payload.sessionId === sessionId && new Date(payload.expiresAt).getTime() >= Date.now();
  } catch {
    return false;
  }
}

export type XenditWebhookPayload = z.infer<typeof XenditWebhookSchema>;

export function isXenditEnabled(): boolean {
  return process.env.XENDIT_ENABLED === 'true';
}

export async function createXenditPaymentSession(
  params: CreateXenditSessionParams,
): Promise<XenditSessionResult> {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('XENDIT_SECRET_KEY environment variable is not set');
  const baseUrl = (process.env.XENDIT_BASE_URL ?? 'https://api.xendit.co').replace(/\/+$/, '');

  const configuredChannels = process.env.XENDIT_ALLOWED_PAYMENT_CHANNELS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedChannels = params.manualCapture ? ['CARDS'] : params.allowedPaymentChannels ?? configuredChannels;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: params.referenceId,
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        capture_method: params.manualCapture ? 'MANUAL' : 'AUTOMATIC',
        allow_save_payment_method: 'DISABLED',
        amount: params.amountPHP,
        currency: 'PHP',
        country: 'PH',
        locale: 'en',
        description: params.description,
        success_return_url: params.successReturnUrl,
        cancel_return_url: params.cancelReturnUrl,
        ...(allowedChannels && allowedChannels.length > 0
          ? { allowed_payment_channels: allowedChannels }
          : {}),
        items: params.items.map((item) => ({
          reference_id: item.referenceId,
          name: item.name,
          type: 'PHYSICAL_SERVICE',
          category: 'VEHICLE_RENTAL',
          net_unit_amount: item.amountPHP,
          quantity: 1,
          currency: 'PHP',
        })),
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const errorBody = body as { error_code?: string; message?: string } | null;
      const code = errorBody?.error_code ? ` (${errorBody.error_code})` : '';
      const message = `Xendit API error${code}: ${errorBody?.message ?? response.statusText}`;
      if (params.manualCapture && response.status === 400
        && ['API_VALIDATION_ERROR', 'INVALID_PAYMENT_CHANNEL', 'INVALID_AMOUNT'].includes(errorBody?.error_code ?? '')) {
        throw new XenditSessionValidationError(message);
      }
      throw new Error(message);
    }

    const parsed = XenditSessionResponseSchema.parse(body);
    if (parsed.reference_id !== params.referenceId) {
      throw new Error('Xendit returned a mismatched reference id');
    }

    return {
      paymentSessionId: parsed.payment_session_id,
      checkoutUrl: parsed.payment_link_url,
      expiresAt: parsed.expires_at,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Invalidates an active hosted checkout that was created but could not be
 * persisted locally. Callers must keep their local draft locked if this fails.
 */
export async function cancelXenditPaymentSession(paymentSessionId: string): Promise<void> {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('XENDIT_SECRET_KEY environment variable is not set');
  const baseUrl = (process.env.XENDIT_BASE_URL ?? 'https://api.xendit.co').replace(/\/+$/, '');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}/sessions/${encodeURIComponent(paymentSessionId)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const errorBody = body as { error_code?: string; message?: string } | null;
      const code = errorBody?.error_code ? ` (${errorBody.error_code})` : '';
      const message = `Xendit session cancellation failed${code}: ${errorBody?.message ?? response.statusText}`;
      if (response.status === 422 && errorBody?.error_code === 'INVALID_SESSION_STATUS') {
        throw new XenditSessionNotActiveError(message);
      }
      throw new Error(message);
    }
  } finally {
    clearTimeout(timeout);
  }
}

const XenditSessionStatusSchema = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELED']) });

export async function getXenditPaymentSession(paymentSessionId: string) {
  return XenditSessionStatusSchema.parse(await fetchXenditSession(paymentSessionId));
}

export async function getXenditHoldSession(paymentSessionId: string) {
  return XenditSessionStatusSchema.extend({
    payment_session_id: z.string(),
    reference_id: z.string(),
    business_id: z.string(),
    amount: z.number(),
    currency: z.string(),
    capture_method: z.string().optional(),
    payment_id: z.string().nullish(),
    payment_request_id: z.string().nullish(),
    latest_payment_request_id: z.string().nullish(),
    payment_link_url: z.string().url().nullish(),
    expires_at: z.string().datetime({ offset: true }).nullish(),
  }).parse(await fetchXenditSession(paymentSessionId));
}

async function fetchXenditSession(paymentSessionId: string): Promise<unknown> {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('XENDIT_SECRET_KEY environment variable is not set');
  const baseUrl = (process.env.XENDIT_BASE_URL ?? 'https://api.xendit.co').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}/sessions/${encodeURIComponent(paymentSessionId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new Error(`Xendit session lookup failed: ${response.statusText}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

const XenditCardPaymentSchema = z.object({
  payment_id: z.string().min(1),
  payment_request_id: z.string().min(1),
  business_id: z.string().min(1),
  currency: z.string(),
  request_amount: z.number(),
  capture_method: z.string(),
  channel_code: z.string(),
  status: z.string(),
  captures: z.array(z.object({
    capture_id: z.string().min(1),
    capture_amount: z.number().positive(),
    capture_timestamp: z.string().datetime({ offset: true }),
  })).nullish(),
});

export async function getXenditCardPayment(paymentId: string) {
  return XenditCardPaymentSchema.parse(await xenditCardPaymentRequest(paymentId));
}

export async function requestXenditHoldAction(paymentId: string, captureAmount?: number) {
  await xenditCardPaymentRequest(paymentId, captureAmount === undefined ? 'cancel' : 'capture', captureAmount);
}

async function xenditCardPaymentRequest(paymentId: string, action?: 'capture' | 'cancel', amount?: number) {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('XENDIT_SECRET_KEY environment variable is not set');
  const baseUrl = (process.env.XENDIT_BASE_URL ?? 'https://api.xendit.co').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/v3/payments/${encodeURIComponent(paymentId)}${action ? '/' + action : ''}`, {
    method: action ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'api-version': '2024-11-11',
      ...(amount === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(amount === undefined ? {} : { body: JSON.stringify({ capture_amount: amount }) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Xendit card payment request failed: HTTP ${response.status}`);
  if (!action) return response.json() as Promise<unknown>;
}

export async function getXenditPaymentRequest(paymentRequestId: string): Promise<{
  paymentRequestId: string;
  businessId: string;
  channelCode: string | null;
  currency: string;
  amount: number;
  latestPaymentId?: string | null;
  status?: string;
}> {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('XENDIT_SECRET_KEY environment variable is not set');
  const baseUrl = (process.env.XENDIT_BASE_URL ?? 'https://api.xendit.co').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}/v3/payment_requests/${encodeURIComponent(paymentRequestId)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'api-version': '2024-11-11',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Xendit payment request lookup failed: HTTP ${response.status}`);
    const body = await response.json();
    const parsed = z.object({
      payment_request_id: z.string(),
      business_id: z.string(),
      channel_code: z.string().nullable().optional(),
      currency: z.string(),
      request_amount: z.number(),
      latest_payment_id: z.string().nullish(),
      status: z.string().optional(),
    }).parse(body);
    if (parsed.payment_request_id !== paymentRequestId) throw new Error('Xendit returned a mismatched payment request');
    return {
      paymentRequestId: parsed.payment_request_id,
      businessId: parsed.business_id,
      channelCode: parsed.channel_code ?? null,
      currency: parsed.currency,
      amount: parsed.request_amount,
      ...(parsed.latest_payment_id === undefined ? {} : { latestPaymentId: parsed.latest_payment_id }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyXenditCallbackToken(token: string | undefined): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN?.trim();
  if (!expected) throw new Error('XENDIT_CALLBACK_TOKEN environment variable is not set');
  if (!token) return false;

  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isXenditDashboardTestWebhook(body: unknown): boolean {
  const parsed = XenditDashboardTestWebhookSchema.safeParse(body);
  if (!parsed.success) return false;
  return parsed.data.event === 'payment_session.completed'
    ? parsed.data.data.status === 'COMPLETED'
    : parsed.data.data.status === 'EXPIRED';
}

export function isXenditDashboardRefundTestWebhook(body: unknown): boolean {
  const parsed = XenditDashboardRefundTestWebhookSchema.safeParse(body);
  if (!parsed.success) return false;
  return parsed.data.event === 'refund.succeeded'
    ? parsed.data.data.status === 'SUCCEEDED'
    : parsed.data.data.status === 'FAILED';
}

export function parseXenditWebhookPayload(body: unknown): XenditWebhookPayload {
  const parsed = XenditWebhookSchema.parse(body);
  if (parsed.event === 'payment_session.completed') {
    if (parsed.data.status !== 'COMPLETED') {
      throw new Error('Completed Xendit event has an invalid status');
    }
  }
  if (parsed.event === 'payment_session.expired' && parsed.data.status !== 'EXPIRED') {
    throw new Error('Expired Xendit event has an invalid status');
  }
  return parsed;
}

const XenditRefundSchema = z.object({
  id: z.string().min(1),
  reference_id: z.string().min(1),
  payment_request_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.literal('PHP'),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
});

export type XenditRefundResult = z.infer<typeof XenditRefundSchema>;

export async function createXenditRefund(input: {
  referenceId: string; paymentRequestId: string; amountPHP: number;
  reason: 'CANCELLATION' | 'REQUESTED_BY_CUSTOMER' | 'OTHERS';
}): Promise<XenditRefundResult> {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('XENDIT_SECRET_KEY environment variable is not set');
  const baseUrl = (process.env.XENDIT_BASE_URL ?? 'https://api.xendit.co').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: input.referenceId,
        payment_request_id: input.paymentRequestId,
        currency: 'PHP', amount: input.amountPHP, reason: input.reason,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Xendit refund request failed: HTTP ${response.status}`);
    const refund = XenditRefundSchema.parse(await response.json());
    if (refund.reference_id !== input.referenceId
      || refund.payment_request_id !== input.paymentRequestId
      || refund.amount !== input.amountPHP) {
      throw new Error('Xendit refund response differs from the reserved request');
    }
    return refund;
  } finally {
    clearTimeout(timeout);
  }
}

export const XenditRefundWebhookSchema = z.object({
  event: z.enum(['refund.succeeded', 'refund.failed']),
  business_id: z.string().min(1),
  created: z.string().datetime(),
  data: XenditRefundSchema.extend({
    payment_id: z.string().nullable().optional(),
    payment_request_id: z.string().min(1).nullable().optional(),
  }).passthrough(),
}).passthrough();
