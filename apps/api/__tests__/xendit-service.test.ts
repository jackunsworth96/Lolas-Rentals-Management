import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelXenditPaymentSession,
  createXenditReturnState,
  getXenditPaymentSession,
  createXenditPaymentSession,
  isXenditDashboardTestWebhook,
  parseXenditWebhookPayload,
  verifyXenditCallbackToken,
  verifyXenditReturnState,
} from '../src/services/xendit.js';

const originalEnv = { ...process.env };

describe('Xendit service', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      XENDIT_SECRET_KEY: 'xnd_development_test-secret',
      XENDIT_CALLBACK_TOKEN: 'callback-test-token',
      XENDIT_BASE_URL: 'https://api.xendit.test/',
      XENDIT_ALLOWED_PAYMENT_CHANNELS: 'GCASH, CARD',
      XENDIT_RETURN_STATE_SECRET: 'return-state-secret-for-tests',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a PAY payment-link session with basic authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      payment_session_id: 'ps-test-1',
      reference_id: 'XEN123',
      status: 'ACTIVE',
      payment_link_url: 'https://checkout.xendit.test/ps-test-1',
      expires_at: '2026-08-05T12:00:00.000Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createXenditPaymentSession({
      referenceId: 'XEN123',
      amountPHP: 1050,
      description: 'Booking ABC123',
      successReturnUrl: 'https://example.test/success',
      cancelReturnUrl: 'https://example.test/cancel',
      items: [{ referenceId: 'ABC123', name: 'Vehicle rental ABC123', amountPHP: 1050 }],
    });

    expect(result).toEqual({
      paymentSessionId: 'ps-test-1',
      checkoutUrl: 'https://checkout.xendit.test/ps-test-1',
      expiresAt: '2026-08-05T12:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.xendit.test/sessions');
    expect(request.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('xnd_development_test-secret:').toString('base64')}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      reference_id: 'XEN123',
      session_type: 'PAY',
      mode: 'PAYMENT_LINK',
      capture_method: 'AUTOMATIC',
      amount: 1050,
      currency: 'PHP',
      country: 'PH',
      allowed_payment_channels: ['GCASH', 'CARD'],
    });
  });

  it('surfaces the Xendit error code and message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error_code: 'INVALID_REQUEST',
      message: 'The request is invalid',
    }), { status: 400, statusText: 'Bad Request', headers: { 'Content-Type': 'application/json' } })));

    await expect(createXenditPaymentSession({
      referenceId: 'XEN123',
      amountPHP: 100,
      description: 'Test',
      successReturnUrl: 'https://example.test/success',
      cancelReturnUrl: 'https://example.test/cancel',
      items: [{ referenceId: 'ABC', name: 'Test', amountPHP: 100 }],
    })).rejects.toThrow('Xendit API error (INVALID_REQUEST): The request is invalid');
  });

  it('cancels an active payment session with the same authenticated API client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      payment_session_id: 'ps-test-1',
      status: 'CANCELED',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await cancelXenditPaymentSession('ps-test-1');

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.xendit.test/sessions/ps-test-1/cancel');
    expect(request).toMatchObject({
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from('xnd_development_test-secret:').toString('base64')}` },
    });
  });

  it('rejects cancellation failures without including credentials in the error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error_code: 'INVALID_SESSION_STATUS',
      message: 'Session is not active',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })));

    await expect(cancelXenditPaymentSession('ps-test-1')).rejects
      .toThrow('Xendit session cancellation failed (INVALID_SESSION_STATUS): Session is not active');
  });

  it('loads provider session status for cancellation diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'COMPLETED' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await expect(getXenditPaymentSession('ps-test-1')).resolves.toEqual({ status: 'COMPLETED' });
  });

  it('aborts a cancellation request that exceeds the provider timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, request: RequestInit) => new Promise((_, reject) => {
      (request.signal as AbortSignal).addEventListener('abort', () => reject(new Error('request aborted')));
    })));

    const cancellation = cancelXenditPaymentSession('ps-test-1').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(cancellation).resolves.toMatchObject({ message: 'request aborted' });
    vi.useRealTimers();
  });

  it('verifies callback tokens without accepting missing or partial values', () => {
    expect(verifyXenditCallbackToken('callback-test-token')).toBe(true);
    expect(verifyXenditCallbackToken('callback-test')).toBe(false);
    expect(verifyXenditCallbackToken(undefined)).toBe(false);
  });

  it('signs return state for only the intended non-expired session', () => {
    const token = createXenditReturnState({
      sessionId: 'b31b3cd7-544d-43c4-9794-0574c3db069e',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(verifyXenditReturnState(token, 'b31b3cd7-544d-43c4-9794-0574c3db069e')).toBe(true);
    expect(verifyXenditReturnState(token, 'e5a4c1b1-5b5b-42ca-89ae-fd4a534c8c5a')).toBe(false);
    expect(verifyXenditReturnState(`${token}x`, 'b31b3cd7-544d-43c4-9794-0574c3db069e')).toBe(false);
  });

  it('requires a payment id on completed webhook events', () => {
    expect(() => parseXenditWebhookPayload({
      event: 'payment_session.completed',
      business_id: 'business-1',
      created: '2026-08-05T12:00:00.000Z',
      data: {
        payment_session_id: 'ps-test-1',
        reference_id: 'XEN123',
        payment_request_id: 'pr-test-1',
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        currency: 'PHP',
        amount: 100,
        status: 'COMPLETED',
      },
    })).toThrow('Completed Xendit session is missing a completed payment');
  });

  it('recognizes the authenticated Xendit dashboard verification fixture', () => {
    expect(isXenditDashboardTestWebhook({
      event: 'payment_session.completed',
      business_id: '5781d19b2e2385880609791c',
      created: '2020-04-20T16:25:52Z',
      data: {
        id: 'ps-579c8d61f23fa4ca35e52da4',
        reference_id: 'test_session',
        session_type: 'SAVE',
        mode: 'PAYMENT_LINK',
        country: 'ID',
        currency: 'IDR',
        status: 'COMPLETED',
      },
    })).toBe(true);
  });

  it('does not treat malformed production payment events as dashboard verification', () => {
    expect(isXenditDashboardTestWebhook({
      event: 'payment_session.completed',
      business_id: 'business-1',
      created: '2026-08-21T12:00:00Z',
      data: {
        id: 'ps-test-1',
        reference_id: 'XEN123',
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        country: 'PH',
        currency: 'PHP',
        status: 'COMPLETED',
      },
    })).toBe(false);
  });
});
