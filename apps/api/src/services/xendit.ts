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
}

export interface XenditSessionResult {
  paymentSessionId: string;
  checkoutUrl: string;
  expiresAt: string;
}

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

  const allowedChannels = process.env.XENDIT_ALLOWED_PAYMENT_CHANNELS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

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
        capture_method: 'AUTOMATIC',
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
      throw new Error(`Xendit API error${code}: ${errorBody?.message ?? response.statusText}`);
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
      throw new Error(`Xendit session cancellation failed${code}: ${errorBody?.message ?? response.statusText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function getXenditPaymentSession(paymentSessionId: string): Promise<{ status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELED' }> {
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
    const parsed = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELED']) }).parse(body);
    return parsed;
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

export function parseXenditWebhookPayload(body: unknown): XenditWebhookPayload {
  const parsed = XenditWebhookSchema.parse(body);
  if (parsed.event === 'payment_session.completed') {
    if (parsed.data.status !== 'COMPLETED' || !parsed.data.payment_id) {
      throw new Error('Completed Xendit session is missing a completed payment');
    }
  }
  if (parsed.event === 'payment_session.expired' && parsed.data.status !== 'EXPIRED') {
    throw new Error('Expired Xendit event has an invalid status');
  }
  return parsed;
}
