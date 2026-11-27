import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: vi.fn(), create: vi.fn(), session: vi.fn(), payment: vi.fn(), paymentRequest: vi.fn(),
  mutate: vi.fn(), cancelSession: vi.fn(),
}));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.db }));
vi.mock('../src/services/xendit.js', async (original) => ({
  ...await original<typeof import('../src/services/xendit.js')>(),
  createXenditPaymentSession: mocks.create,
  getXenditHoldSession: mocks.session,
  getXenditCardPayment: mocks.payment,
  getXenditPaymentRequest: mocks.paymentRequest,
  requestXenditHoldAction: mocks.mutate,
  cancelXenditPaymentSession: mocks.cancelSession,
}));
vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
const { holdCoverage, staffXenditDepositHoldRouter } = await import('../src/routes/xendit-deposit-holds.js');
const { publicXenditRouter } = await import('../src/routes/xendit.js');
const { XenditSessionNotActiveError, XenditSessionValidationError } = await import('../src/services/xendit.js');

const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const reference = 'XH' + id.replaceAll('-', '');
const orderPath = '/orders/:orderId/deposit-holds';
const actionPath = orderPath + '/:holdId/actions';
const future = '2099-01-01T00:00:00.000Z';

type Handler = (...args: any[]) => Promise<void>;
function handlers(router: unknown, path: string) {
  const { stack } = router as { stack: Array<{ route?: { path: string; methods: { post?: boolean }; stack: Array<{ handle: Handler }> } }> };
  return stack.find((layer) => layer.route?.path === path && layer.route.methods.post)!.route!.stack;
}
function handler(path: string) {
  return handlers(staffXenditDepositHoldRouter, path).at(-1)!.handle;
}
function response() {
  const json = vi.fn();
  return { json, status: vi.fn(() => ({ json })) };
}
function request(body: object, roleId = 'role-admin', storeIds = ['store-lolas']) {
  return { params: { holdId: id, orderId: 'order-1' }, body, user: { roleId, storeIds, employeeId: 'emp-1' } };
}

function fixture(status = 'authorized') {
  const hold = {
    id, order_id: 'order-1', reference_id: reference, amount_php: 1000, captured_php: null,
    created_at: future, release_step: null as 'session' | 'session_rejected' | 'payment' | null,
    status, provider_session_id: 'ps-1' as string | null, provider_request_id: 'pr-1' as string | null,
    provider_payment_id: 'py-1' as string | null, provider_capture_id: null, recovered_at: null as string | null,
    authorization_expires_at: null, checkout_url: null, checkout_expires_at: future,
  };
  const rpc = vi.fn((method: string, args: any): any => {
    if (method === 'create_xendit_deposit_hold') {
      hold.status = 'creating';
      hold.provider_payment_id = null;
      hold.provider_request_id = null;
      return Promise.resolve({ data: { ...hold }, error: null });
    }
    if (method === 'observe_xendit_deposit_hold') {
      const snapshot = args.p_observation;
      hold.provider_session_id = snapshot.sessionId ?? hold.provider_session_id;
      hold.provider_request_id = snapshot.requestId ?? hold.provider_request_id;
      hold.provider_payment_id = snapshot.paymentId ?? hold.provider_payment_id;
      if (snapshot.state === 'session_identified') return Promise.resolve({ error: null });
      if (snapshot.state === 'session_cancel_rejected') {
        if (hold.release_step === 'session') hold.release_step = 'session_rejected';
        return Promise.resolve({ error: null });
      }
      if (snapshot.state === 'uncertain') hold.status = 'reconciliation_required';
      else if (snapshot.state === 'conflict') hold.status = 'reconciliation_required';
      else if (snapshot.state !== 'authorized' || !hold.status.endsWith('_pending')) hold.status = snapshot.state;
      hold.checkout_url = snapshot.checkoutUrl ?? null;
      return Promise.resolve({ error: null });
    }
    if (method === 'recover_xendit_deposit_hold') {
      if (hold.provider_session_id || hold.recovered_at || !['creating','reconciliation_required'].includes(hold.status)) {
        return Promise.resolve({ data: null, error: { message: 'Hold is no longer eligible' } });
      }
      hold.recovered_at = future;
      hold.provider_session_id = args.p_session_id;
      if (!args.p_session_id) hold.status = 'failed';
      return Promise.resolve({ data: { ...hold }, error: null });
    }
    if (method === 'reserve_xendit_deposit_hold_action') {
      const error = ['authorized','awaiting_authorization'].includes(hold.status)
        ? null : { message: 'Hold is not eligible for this action' };
      if (!error) {
        hold.status = args.p_kind + '_pending';
        if (args.p_kind === 'release') hold.release_step = hold.provider_payment_id ? 'payment' : 'session';
      }
      return Promise.resolve({ data: { ...hold }, error });
    }
    if (method === 'reserve_xendit_deposit_hold_release_void') {
      const eligible = hold.release_step === 'session_rejected' && hold.provider_payment_id === args.p_payment_id
        && ['release_pending','reconciliation_required'].includes(hold.status);
      if (eligible) {
        hold.release_step = 'payment';
        hold.status = 'release_pending';
      }
      return Promise.resolve({ data: eligible, error: null });
    }
    throw new Error('Unexpected financial RPC: ' + method);
  });
  const from = vi.fn((table) => {
    const q = { select: vi.fn(() => q), eq: vi.fn(() => q), maybeSingle: async () => ({
      data: table === 'orders' ? { id: 'order-1', store_id: 'store-lolas', status: 'active' } : { ...hold },
      error: null,
    }) };
    return q;
  });
  mocks.db.mockReturnValue({ from, rpc });
  return { from, rpc, hold };
}

function missingCheckoutFixture() {
  const result = fixture('reconciliation_required');
  result.hold.provider_session_id = null;
  result.hold.provider_request_id = null;
  result.hold.provider_payment_id = null;
  return result;
}

const verifiedSession = {
  status: 'COMPLETED', payment_session_id: 'ps-1', reference_id: reference, business_id: 'biz-1',
  currency: 'PHP', amount: 1000, capture_method: 'MANUAL', payment_id: 'py-1', payment_request_id: 'pr-1',
  expires_at: future,
};
const verifiedPayment = {
  status: 'AUTHORIZED', payment_id: 'py-1', payment_request_id: 'pr-1', business_id: 'biz-1',
  currency: 'PHP', request_amount: 1000, capture_method: 'MANUAL', channel_code: 'CARDS',
};
const closedPaymentRequest = {
  paymentRequestId: 'pr-1', businessId: 'biz-1', currency: 'PHP', amount: 1000,
  latestPaymentId: 'py-1', status: 'FAILED',
};

async function webhook(data: object, event = 'payment_session.completed') {
  const res = response();
  await handlers(publicXenditRouter, '/webhook').at(-1)!.handle({
    headers: { 'x-callback-token': 'callback' }, body: { event, business_id: 'biz-1', data },
  }, res);
  return res;
}

describe('Xendit deposit hold lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('XENDIT_ENABLED', 'true');
    vi.stubEnv('XENDIT_DEPOSIT_HOLDS_ENABLED', 'true');
    vi.stubEnv('XENDIT_SECRET_KEY', 'xnd_development_test');
    vi.stubEnv('XENDIT_CALLBACK_TOKEN', 'callback');
    vi.stubEnv('XENDIT_BUSINESS_ID', 'biz-1');
    vi.stubEnv('WEB_URL', 'https://web.example.test');
    mocks.session.mockResolvedValue(verifiedSession);
    mocks.payment.mockResolvedValue(verifiedPayment);
    mocks.paymentRequest.mockResolvedValue(closedPaymentRequest);
    mocks.mutate.mockResolvedValue(undefined);
    mocks.cancelSession.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ paymentSessionId: 'ps-1' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reserves the server-calculated amount before creating a manual checkout', async () => {
    const { rpc } = fixture();
    mocks.session.mockResolvedValue({ ...verifiedSession, status: 'ACTIVE', payment_id: null,
      payment_request_id: null, payment_link_url: 'https://checkout.example.test/hold' });
    const res = response();
    const next = vi.fn();
    await handler(orderPath)(request({ amountPHP: 0.01 }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0]).toEqual(['create_xendit_deposit_hold', {
      p_id: expect.any(String), p_order_id: 'order-1', p_store_id: 'store-lolas', p_employee_id: 'emp-1',
    }]);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]!);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amountPHP: 1000, manualCapture: true }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([undefined, 'MANUAL'])('routes a stored authorization without captured-payment completion (%s)', async (capture_method) => {
    const { rpc } = fixture('creating');
    const payload = { reference_id: reference, payment_session_id: 'ps-1', payment_id: 'py-1', capture_method };
    expect((await webhook(payload)).status).toHaveBeenCalledWith(200);
    expect((await webhook(payload)).status).toHaveBeenCalledWith(200);
    expect(rpc.mock.calls).toEqual(Array(2).fill(['observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'authorized', sessionId: 'ps-1', paymentId: 'py-1', requestId: 'pr-1' },
    }]));
  });

  it.each([1000, 275.50])('records only a verified capture observation for %s', async (amountPHP) => {
    const { rpc } = fixture();
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'SUCCEEDED', captures: [
      { capture_id: 'cap-1', capture_amount: amountPHP, capture_timestamp: '2026-11-28T00:00:00.000Z' },
    ] });
    const res = response();
    await handler(actionPath)(request({ action: 'capture', amountPHP, reason: 'Test collection' }), res, vi.fn());
    expect(rpc.mock.calls[0]?.[0]).toBe('reserve_xendit_deposit_hold_action');
    expect(mocks.mutate).toHaveBeenCalledWith('py-1', amountPHP);
    expect(rpc.mock.calls[1]).toEqual(['observe_xendit_deposit_hold', { p_id: id,
      p_observation: expect.objectContaining({ state: 'captured', captureId: 'cap-1', capturedPHP: amountPHP }) }]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('allows only one provider action when reservation rejects a concurrent action', async () => {
    fixture();
    const first = response();
    const second = response();
    const next = vi.fn();
    await Promise.all([
      handler(actionPath)(request({ action: 'capture', amountPHP: 1000, reason: 'Test' }), first, next),
      handler(actionPath)(request({ action: 'release' }), second, next),
    ]);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(second.status).toHaveBeenCalledWith(409);
  });

  it('keeps a timed-out capture locked and rejects repeat provider calls', async () => {
    const { rpc } = fixture();
    mocks.mutate.mockRejectedValue(new Error('timeout'));
    const next = vi.fn();
    const body = request({ action: 'capture', amountPHP: 100, reason: 'Test' });
    await handler(actionPath)(body, response(), next);
    const second = response();
    await handler(actionPath)(body, second, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('observe_xendit_deposit_hold', { p_id: id,
      p_observation: { state: 'uncertain', expectedStatus: 'capture_pending' } });
    expect(second.status).toHaveBeenCalledWith(409);
  });

  it('keeps creation timeouts locked without providing a checkout URL', async () => {
    const { rpc } = fixture();
    mocks.create.mockRejectedValue(new Error('timeout'));
    const res = response();
    await handler(orderPath)(request({}), res, vi.fn());
    expect(rpc).toHaveBeenCalledWith('observe_xendit_deposit_hold', { p_id: id,
      p_observation: expect.objectContaining({ state: 'uncertain', expectedStatus: 'creating' }) });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
      hold: expect.objectContaining({ blocking: true, checkoutUrl: null }),
    }) });
  });

  it('distinguishes a definitive validation rejection from a creation timeout', async () => {
    const { rpc } = fixture();
    mocks.create.mockRejectedValue(new XenditSessionValidationError('Invalid payment channel'));
    const res = response();
    await handler(orderPath)(request({}), res, vi.fn());
    expect(rpc).toHaveBeenLastCalledWith('observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'creation_rejected' },
    });
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('allows a same-store non-admin to release an authorization', async () => {
    const { rpc } = fixture();
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'CANCELED' });
    await handler(actionPath)(request({ action: 'release' }, 'role-staff'), response(), vi.fn());
    expect(mocks.mutate).toHaveBeenCalledWith('py-1', undefined);
    expect(rpc).toHaveBeenLastCalledWith('observe_xendit_deposit_hold', { p_id: id,
      p_observation: expect.objectContaining({ state: 'released' }) });
  });

  it('voids an unused checkout without treating link cancellation as an authorization release', async () => {
    const { rpc, hold } = fixture('awaiting_authorization');
    hold.provider_payment_id = null;
    hold.provider_request_id = null;
    mocks.session.mockResolvedValue({ ...verifiedSession, status: 'CANCELED', payment_id: null, payment_request_id: null });
    await handler(actionPath)(request({ action: 'release' }, 'role-staff'), response(), vi.fn());
    expect(mocks.cancelSession).toHaveBeenCalledWith('ps-1');
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith('observe_xendit_deposit_hold', { p_id: id,
      p_observation: { state: 'released', sessionId: 'ps-1' } });
  });

  it('voids only the verified authorization after a definitive checkout cancellation rejection', async () => {
    const { rpc, hold } = fixture('awaiting_authorization');
    hold.provider_payment_id = null;
    hold.provider_request_id = null;
    mocks.cancelSession.mockRejectedValueOnce(new XenditSessionNotActiveError('Session completed'));
    mocks.payment.mockResolvedValueOnce(verifiedPayment).mockResolvedValueOnce({ ...verifiedPayment, status: 'CANCELED' });
    await handler(actionPath)(request({ action: 'release' }, 'role-staff'), response(), vi.fn());
    expect(mocks.cancelSession).toHaveBeenCalledExactlyOnceWith('ps-1');
    expect(rpc.mock.calls).toEqual([
      ['reserve_xendit_deposit_hold_action', expect.objectContaining({ p_kind: 'release' })],
      ['observe_xendit_deposit_hold', { p_id: id, p_observation: { state: 'session_cancel_rejected', sessionId: 'ps-1' } }],
      ['observe_xendit_deposit_hold', expect.objectContaining({ p_observation: expect.objectContaining({ state: 'authorized' }) })],
      ['reserve_xendit_deposit_hold_release_void', { p_id: id, p_order_id: 'order-1', p_store_id: 'store-lolas', p_payment_id: 'py-1' }],
      ['observe_xendit_deposit_hold', expect.objectContaining({ p_observation: expect.objectContaining({ state: 'released' }) })],
    ]);
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith('py-1');
    expect(rpc.mock.invocationCallOrder[3]).toBeLessThan(mocks.mutate.mock.invocationCallOrder[0]!);
    expect(hold.status).toBe('released');
  });

  it('allows one explicit continuation after the first status read fails, without retrying an ambiguous void', async () => {
    const { hold } = fixture('awaiting_authorization');
    hold.provider_payment_id = null;
    hold.provider_request_id = null;
    mocks.cancelSession.mockRejectedValueOnce(new XenditSessionNotActiveError('Session completed'));
    mocks.session.mockRejectedValueOnce(new Error('status lookup failed'));
    const initial = response();
    await handler(actionPath)(request({ action: 'release' }, 'role-staff'), initial, vi.fn());
    expect(initial.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
      hold: expect.objectContaining({ blocking: true, canContinueRelease: true }),
    }) });
    expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.mutate.mockRejectedValueOnce(new Error('void response lost'));
    const next = vi.fn();
    const body = request({ action: 'continue_release' }, 'role-staff');
    await Promise.all([handler(actionPath)(body, response(), next), handler(actionPath)(body, response(), next)]);
    expect(next).not.toHaveBeenCalled();
    expect(hold.status).toBe('reconciliation_required');
    const duplicate = response();
    await handler(actionPath)(body, duplicate, next);
    expect(duplicate.status).toHaveBeenCalledWith(409);
    expect(mocks.cancelSession).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith('py-1');
  });

  it('does not switch to void after an ambiguous checkout cancellation', async () => {
    const { hold } = fixture('awaiting_authorization');
    hold.provider_payment_id = null;
    hold.provider_request_id = null;
    mocks.cancelSession.mockRejectedValueOnce(new Error('cancellation timeout'));
    await handler(actionPath)(request({ action: 'release' }, 'role-staff'), response(), vi.fn());
    expect(hold.status).toBe('reconciliation_required');
    const res = response();
    await handler(actionPath)(request({ action: 'continue_release' }, 'role-staff'), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('routes expiry by the persisted provider payment ID', async () => {
    const { rpc } = fixture();
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'EXPIRED' });
    await webhook({ payment_id: 'py-1' }, 'payment.expiry');
    expect(rpc).toHaveBeenCalledWith('observe_xendit_deposit_hold', { p_id: id,
      p_observation: expect.objectContaining({ state: 'expired', paymentId: 'py-1' }) });
  });

  it('keeps the link open after a declined attempt and accepts a retry with a new payment ID', async () => {
    const { rpc, hold } = fixture('awaiting_authorization');
    hold.provider_payment_id = null;
    hold.provider_request_id = null;
    mocks.session.mockResolvedValueOnce({ ...verifiedSession, status: 'ACTIVE' });
    mocks.payment.mockResolvedValueOnce({ ...verifiedPayment, status: 'FAILED' });
    const next = vi.fn();
    await handler(actionPath)(request({ action: 'refresh' }), response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(hold.status).toBe('awaiting_authorization');

    mocks.session.mockResolvedValue({ ...verifiedSession, payment_id: 'py-2', payment_request_id: 'pr-2' });
    mocks.payment.mockResolvedValue({ ...verifiedPayment, payment_id: 'py-2', payment_request_id: 'pr-2' });
    await webhook({ reference_id: reference, payment_session_id: 'ps-1', payment_id: 'py-2' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('observe_xendit_deposit_hold', { p_id: id,
      p_observation: { state: 'authorized', sessionId: 'ps-1', paymentId: 'py-2', requestId: 'pr-2' } });
  });

  it('ignores a late decline from the attempt that preceded the captured retry', async () => {
    const { rpc, hold } = fixture('awaiting_authorization');
    hold.provider_request_id = null;
    hold.provider_payment_id = null;
    mocks.session.mockResolvedValueOnce({ ...verifiedSession, status: 'ACTIVE', payment_id: null });
    expect((await webhook({ reference_id: reference, payment_id: 'py-declined' }, 'payment.failure')).status)
      .toHaveBeenCalledWith(200);
    expect(rpc).not.toHaveBeenCalled();
    await webhook({ reference_id: reference, payment_session_id: 'ps-1', payment_id: 'py-1' });
    expect(hold.status).toBe('authorized');
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'SUCCEEDED', captures: [
      { capture_id: 'cap-1', capture_amount: 275.50, capture_timestamp: '2026-11-28T00:00:00.000Z' },
    ] });
    await handler(actionPath)(request({ action: 'capture', amountPHP: 275.50, reason: 'Test capture' }), response(), vi.fn());
    expect(hold.status).toBe('captured');
    rpc.mockClear();
    expect((await webhook({ reference_id: reference, payment_id: 'py-declined' }, 'payment.failure')).status)
      .toHaveBeenCalledWith(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(hold.status).toBe('captured');
  });

  it('still observes a conflict involving the current payment', async () => {
    const { rpc } = fixture('captured');
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'FAILED', captures: [
      { capture_id: 'cap-1', capture_amount: 1000, capture_timestamp: '2026-11-28T00:00:00.000Z' },
    ] });
    await webhook({ reference_id: reference, payment_id: 'py-1' }, 'payment.failure');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'conflict' },
    });
  });

  it('attaches a verified checkout while paused and retains its ID after a refresh failure', async () => {
    vi.stubEnv('XENDIT_DEPOSIT_HOLDS_ENABLED', 'false');
    const { rpc, hold } = missingCheckoutFixture();
    mocks.payment.mockRejectedValueOnce(new Error('Xendit payment read unavailable'));
    const res = response();
    const next = vi.fn();
    await handler(actionPath)(request({ action: 'recover_session', sessionId: 'ps-1' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith('recover_xendit_deposit_hold', {
      p_id: id, p_order_id: 'order-1', p_store_id: 'store-lolas', p_employee_id: 'emp-1',
      p_session_id: 'ps-1', p_support_case_id: null, p_reason: null,
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { enabled: false, hold: expect.objectContaining({
      status: 'reconciliation_required', canRefresh: true, canRecover: false, blocking: true,
    }) } });
    expect(hold.provider_session_id).toBe('ps-1');
    await handler(actionPath)(request({ action: 'refresh' }), response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(hold.status).toBe('authorized');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it.each([null, { reference_id: 'other' }, { amount: 500 }, { currency: 'USD' },
    { business_id: 'other' }, { capture_method: 'AUTOMATIC' }, { payment_session_id: 'ps-other' },
  ])('does not attach an unverified checkout (%j)', async (evidence) => {
    const { rpc } = missingCheckoutFixture();
    if (evidence) mocks.session.mockResolvedValue({ ...verifiedSession, ...evidence });
    else mocks.session.mockRejectedValue(new Error('404'));
    const res = response();
    await handler(actionPath)(request({ action: 'recover_session', sessionId: 'ps-1' }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(evidence ? 409 : 502);
    expect(rpc).not.toHaveBeenCalled();
  });

  const noSession = { action: 'confirm_no_session', supportCaseId: 'CASE-123',
    reason: 'Xendit confirmed this reference has no session', confirmed: true };
  it('requires evidence to recover abandoned creation and does not let staff recover while it may be in flight', async () => {
    const { rpc, hold } = missingCheckoutFixture();
    hold.status = 'creating';
    hold.created_at = new Date().toISOString();
    const fresh = response();
    await handler(actionPath)(request(noSession), fresh, vi.fn());
    expect(fresh.status).toHaveBeenCalledWith(409);
    hold.created_at = new Date(Date.now() - 130_000).toISOString();
    const withoutEvidence = response();
    await handler(actionPath)(request({ ...noSession, confirmed: false }), withoutEvidence, vi.fn());
    expect(withoutEvidence.status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
    const recovered = response();
    await handler(actionPath)(request(noSession), recovered, vi.fn());
    expect(hold.status).toBe('failed');
    expect(recovered.status).toHaveBeenCalledWith(200);
  });

  it('does not dispatch a checkout when the creation window has already elapsed', async () => {
    const { hold } = missingCheckoutFixture();
    hold.created_at = new Date(Date.now() - 130_000).toISOString();
    await handler(orderPath)(request({}), response(), vi.fn());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(hold.status).toBe('reconciliation_required');
  });
  it('closes a missing checkout only once using the Admin attestation', async () => {
    const { rpc, hold } = missingCheckoutFixture();
    const res = response();
    await handler(actionPath)(request(noSession), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(hold.status).toBe('failed');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('recover_xendit_deposit_hold', {
      p_id: id, p_order_id: 'order-1', p_store_id: 'store-lolas', p_employee_id: 'emp-1',
      p_session_id: null, p_support_case_id: 'CASE-123', p_reason: noSession.reason,
    });
    const duplicate = response();
    await handler(actionPath)(request(noSession), duplicate, vi.fn());
    expect(duplicate.status).toHaveBeenCalledWith(409);
    expect(rpc).toHaveBeenCalledOnce();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('records the provider session from a callback even before authorization can be verified', async () => {
    const { rpc, hold } = missingCheckoutFixture();
    mocks.session.mockResolvedValue({ ...verifiedSession, payment_id: null, payment_request_id: null });
    const callback = await webhook({ reference_id: reference, payment_session_id: 'ps-1' });
    expect(callback.status).toHaveBeenCalledWith(500);
    expect(hold.provider_session_id).toBe('ps-1');
    const res = response();
    await handler(actionPath)(request(noSession), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'session_identified', sessionId: 'ps-1' },
    });
  });

  it('requires Admin, store access, a support case and explicit confirmation', async () => {
    const { rpc } = missingCheckoutFixture();
    for (const [req, status] of [
      [request(noSession, 'role-staff'), 403],
      [request(noSession, 'role-admin', ['store-other']), 404],
      [request({ ...noSession, confirmed: false }), 400],
      [request({ ...noSession, supportCaseId: '' }), 400],
      [request({ ...noSession, reason: '' }), 400],
    ] as const) {
      const res = response();
      await handler(actionPath)(req, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(status);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['EXPIRED', 'expired', null],
    ['CANCELED', 'released', 'py-1'],
  ] as const)('unblocks a closed %s checkout after a verified decline', async (status, state, paymentId) => {
    const { rpc, hold } = fixture('awaiting_authorization');
    hold.provider_payment_id = null;
    hold.provider_request_id = null;
    mocks.session.mockResolvedValue({ ...verifiedSession, status, payment_id: paymentId });
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'FAILED', captures: [] });
    const next = vi.fn();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (status === 'EXPIRED') {
        const res = await webhook({ reference_id: reference, payment_session_id: 'ps-1' }, 'payment_session.expired');
        expect(res.status).toHaveBeenCalledWith(200);
      } else {
        await handler(actionPath)(request({ action: 'refresh' }), response(), next);
      }
    }
    expect(next).not.toHaveBeenCalled();
    expect(hold.status).toBe(state);
    expect(mocks.paymentRequest).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls).toEqual(Array(2).fill(['observe_xendit_deposit_hold', { p_id: id,
      p_observation: { state, sessionId: 'ps-1', paymentId: 'py-1', requestId: 'pr-1' } }]));
  });

  it.each([
    { status: 'REQUIRES_ACTION' }, { status: undefined },
    { latestPaymentId: 'py-other' }, { paymentRequestId: 'pr-other' },
  ])('keeps a declined checkout blocked when request evidence is %j', async (requestEvidence) => {
    const { rpc, hold } = fixture('awaiting_authorization');
    mocks.session.mockResolvedValue({ ...verifiedSession, status: 'EXPIRED' });
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'FAILED' });
    mocks.paymentRequest.mockResolvedValue({ ...closedPaymentRequest, ...requestEvidence });
    await webhook({ reference_id: reference, payment_session_id: 'ps-1' }, 'payment_session.expired');
    expect(hold.status).toBe('reconciliation_required');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'conflict' },
    });
  });

  it('keeps a declined checkout blocked when the payment reports a capture', async () => {
    const { rpc, hold } = fixture('awaiting_authorization');
    mocks.session.mockResolvedValue({ ...verifiedSession, status: 'EXPIRED' });
    mocks.payment.mockResolvedValue({ ...verifiedPayment, status: 'FAILED', captures: [
      { capture_id: 'cap-1', capture_amount: 1000, capture_timestamp: '2026-11-28T00:00:00.000Z' },
    ] });
    await webhook({ reference_id: reference, payment_session_id: 'ps-1' }, 'payment_session.expired');
    expect(hold.status).toBe('reconciliation_required');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'conflict' },
    });
  });

  it('keeps conflicting provider details in finance review', async () => {
    const { rpc } = fixture();
    mocks.payment.mockResolvedValue({ ...verifiedPayment, currency: 'USD' });
    await webhook({ reference_id: reference, payment_session_id: 'ps-1' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('observe_xendit_deposit_hold', {
      p_id: id, p_observation: { state: 'conflict' },
    });
  });

  it('lets Xendit retry when a capture event precedes the provider status update', async () => {
    const { rpc } = fixture();
    expect((await webhook({ payment_id: 'py-1' }, 'payment.capture')).status).toHaveBeenCalledWith(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lets Xendit retry a completed callback while the provider session is still active', async () => {
    const { rpc } = fixture('awaiting_authorization');
    mocks.session.mockResolvedValue({ ...verifiedSession, status: 'ACTIVE', payment_id: null });
    const result = await webhook({ reference_id: reference, payment_session_id: 'ps-1' });
    expect(result.status).toHaveBeenCalledWith(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks non-admin capture, missing EditOrders, and cross-store release', async () => {
    const { rpc } = fixture();
    const res = response();
    const next = vi.fn();
    await handler(actionPath)(request({ action: 'capture', amountPHP: 10, reason: 'Test' }, 'role-staff'), res, next);
    expect(res.status).toHaveBeenLastCalledWith(403);
    const permission = handlers(staffXenditDepositHoldRouter, actionPath)[1]!.handle;
    await permission(request({}), res, next);
    expect(res.status).toHaveBeenLastCalledWith(403);
    await handler(actionPath)(request({ action: 'release' }, 'role-staff', ['store-other']), res, next);
    expect(res.status).toHaveBeenLastCalledWith(404);
    expect(next).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it.each([['false','xnd_development_test'], ['true','xnd_production_test']])
  ('rejects creation when flag/key is %s/%s', async (flag, key) => {
    vi.stubEnv('XENDIT_DEPOSIT_HOLDS_ENABLED', flag);
    vi.stubEnv('XENDIT_SECRET_KEY', key);
    const res = response();
    await handler(orderPath)(request({}), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('never infers coverage from checkout expiry or a fixed authorization window', () => {
    expect(holdCoverage(null, future)).toBe('unverified');
    expect(holdCoverage(future, '2099-01-02T00:00:00.000Z')).toBe('insufficient');
    expect(holdCoverage(future, '2098-12-31T00:00:00.000Z')).toBe('verified');
  });
});
