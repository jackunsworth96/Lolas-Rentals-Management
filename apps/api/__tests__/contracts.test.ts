import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: {},
}));

vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/email.js')>()),
  sendEmail: mocks.sendEmail,
}));

vi.mock('../src/lib/telegram.js', () => ({
  sendTelegramAlert: vi.fn(async () => undefined),
  getTelegramChatId: vi.fn(() => 'chat'),
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.WEB_URL = 'https://lolas.test';

const { publicContractRoutes } = await import('../src/routes/public-contracts.js');
const { contractRoutes } = await import('../src/routes/contracts.js');
const lib = await import('../src/lib/contracts.js');
const { buildContractPdf } = await import('../src/lib/contract-pdf.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TOKEN = 'A'.repeat(43);

type Row = Record<string, unknown>;

function contractRow(overrides: Row = {}): Row {
  return {
    id: 'c1', template_id: null, template_version: null, title: 'Paw Card Partner Agreement', category: 'paw_card_partner',
    counterparty_type: 'external', counterparty_id: null, recipient_name: 'Ana', recipient_email: 'ana@example.com',
    values: {}, rendered_body: '# Agreement\n\nHello Ana.', body_sha256: 'abc', status: 'sent',
    access_token_hash: lib.sha256Hex(TOKEN), token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    sent_at: new Date().toISOString(), viewed_at: null, lola_signer_user_id: 'u1', lola_signer_name: 'Jack',
    lola_signer_title: null, lola_signature_path: 'contracts/c1/lola-signature.png', lola_signed_at: new Date().toISOString(),
    signer_name: null, signer_signature_path: null, signer_ip: null, signer_user_agent: null, signed_at: null, pdf_path: null,
    voided_at: null, void_reason: null, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Minimal PostgREST stand-in: every chain method returns the builder;
 * `maybeSingle`/`single` and awaiting the builder consume queued results per table.
 */
function fakeSupabase(results: Record<string, unknown[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const next = (table: string) => (results[table]?.length ? results[table]!.shift() : { data: null, error: null });
  const builder = (table: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'in', 'or', 'order', 'limit', 'neq']) {
      b[m] = (...args: unknown[]) => { calls.push({ table, method: m, args }); return b; };
    }
    b.maybeSingle = async () => next(table);
    b.single = async () => next(table);
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(next(table)).then(resolve);
    return b;
  };
  const storage = {
    upload: vi.fn(async () => ({ error: null })),
    download: vi.fn(async () => ({ data: new Blob([Buffer.from(PNG.split(',')[1]!, 'base64')]), error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed' }, error: null })),
  };
  return {
    calls,
    storage: { from: () => storage },
    storageApi: storage,
    from: (table: string) => builder(table),
  };
}

type Handler = (req: unknown, res: unknown, next: (err?: unknown) => void) => Promise<void> | void;

function routeHandler(router: unknown, method: string, path: string): Handler {
  const layer = (router as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] } }[] }).stack
    .find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.at(-1)!.handle;
}

async function invoke(handler: Handler, req: Row) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader: vi.fn(),
    send: vi.fn(),
  };
  let error: (Error & { statusCode?: number }) | undefined;
  await handler({ headers: {}, socket: {}, ip: '1.2.3.4', params: {}, query: {}, body: {}, ...req }, res, (err) => { error = err as Error; });
  return { res, error };
}

describe('contract helpers', () => {
  it('treats sent or viewed links past expiry as expired', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(lib.effectiveStatus({ status: 'sent', token_expires_at: past })).toBe('expired');
    expect(lib.effectiveStatus({ status: 'viewed', token_expires_at: past })).toBe('expired');
    expect(lib.effectiveStatus({ status: 'completed', token_expires_at: past })).toBe('completed');
    expect(lib.effectiveStatus({ status: 'draft', token_expires_at: null })).toBe('draft');
  });

  it('keeps staff contracts behind the HR permission', () => {
    expect(lib.permissionForCategory('staff')).toBe('can_manage_staff_contracts');
    expect(lib.permissionForCategory('paw_card_partner')).toBe('can_manage_contracts');
    expect(lib.allowedCategories(['can_manage_staff_contracts'])).toEqual(['staff']);
    expect(lib.allowedCategories(['can_manage_contracts'])).toEqual(['accommodation_partner', 'paw_card_partner', 'other']);
  });

  it('stores only a hash of the link token', () => {
    const { token, hash } = lib.newAccessToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(lib.sha256Hex(token));
    expect(hash).not.toContain(token);
    expect(lib.signingUrl(token)).toBe(`https://lolas.test/contract/${token}`);
  });

  it('builds a PDF', () => {
    const sig = { heading: "For Lola's Rentals", name: 'Jack', signedAt: '12 Nov 2026', signatureDataUrl: PNG };
    const pdf = buildContractPdf({
      contractId: 'c1', title: 'Agreement', renderedBody: '# Title\n\n**Bold** and *italic* text.\n\n- item', bodySha256: 'f'.repeat(64),
      lola: sig, recipient: { ...sig, heading: 'Ana', name: 'Ana' },
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('public contract link', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects malformed tokens without querying', async () => {
    const sb = fakeSupabase({});
    mocks.getSupabaseClient.mockReturnValue(sb);
    const { error } = await invoke(routeHandler(publicContractRoutes, 'get', '/:token'), { params: { token: 'short' } });
    expect(error?.statusCode).toBe(404);
    expect(sb.calls).toHaveLength(0);
  });

  it('marks a sent contract as viewed and hides internal fields', async () => {
    const sb = fakeSupabase({ contracts: [{ data: contractRow(), error: null }, { error: null }] });
    mocks.getSupabaseClient.mockReturnValue(sb);
    const { res, error } = await invoke(routeHandler(publicContractRoutes, 'get', '/:token'), { params: { token: TOKEN } });
    expect(error).toBeUndefined();
    const data = (res.body as { data: Row }).data;
    expect(data.status).toBe('awaiting_signature');
    expect(data).not.toHaveProperty('access_token_hash');
    expect(data).not.toHaveProperty('recipientEmail');
    expect(sb.calls).toContainEqual({ table: 'contracts', method: 'update', args: [expect.objectContaining({ status: 'viewed' })] });
  });

  it('returns 410 for an expired link', async () => {
    const expired = contractRow({ token_expires_at: new Date(Date.now() - 1000).toISOString() });
    mocks.getSupabaseClient.mockReturnValue(fakeSupabase({ contracts: [{ data: expired, error: null }] }));
    const { error } = await invoke(routeHandler(publicContractRoutes, 'get', '/:token'), { params: { token: TOKEN } });
    expect(error?.statusCode).toBe(410);
  });

  it('treats voided contracts as invalid links', async () => {
    mocks.getSupabaseClient.mockReturnValue(fakeSupabase({ contracts: [{ data: contractRow({ status: 'voided' }), error: null }] }));
    const { error } = await invoke(routeHandler(publicContractRoutes, 'get', '/:token'), { params: { token: TOKEN } });
    expect(error?.statusCode).toBe(404);
  });

  it('refuses to sign twice', async () => {
    mocks.getSupabaseClient.mockReturnValue(fakeSupabase({ contracts: [{ data: contractRow({ status: 'completed' }), error: null }] }));
    const { error } = await invoke(routeHandler(publicContractRoutes, 'post', '/:token/sign'), {
      params: { token: TOKEN }, body: { signerName: 'Ana Cruz', signatureDataUrl: PNG, agreed: true },
    });
    expect(error?.statusCode).toBe(409);
  });

  it('completes the contract, stores the PDF and emails both sides', async () => {
    const signed = contractRow({ status: 'completed', signer_name: 'Ana Cruz', signer_signature_path: 'contracts/c1/recipient-signature.png', signed_at: new Date().toISOString() });
    const sb = fakeSupabase({
      contracts: [{ data: contractRow({ status: 'viewed' }), error: null }, { data: signed, error: null }, { error: null }],
      contract_events: [{ error: null }, { error: null }],
    });
    mocks.getSupabaseClient.mockReturnValue(sb);
    const { res, error } = await invoke(routeHandler(publicContractRoutes, 'post', '/:token/sign'), {
      params: { token: TOKEN }, body: { signerName: 'Ana Cruz', signatureDataUrl: PNG, agreed: true },
    });
    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect((res.body as { data: Row }).data.status).toBe('completed');
    const uploads = sb.storageApi.upload.mock.calls.map((c) => c[0]);
    expect(uploads).toEqual(['contracts/c1/recipient-signature.png', 'contracts/c1/signed.pdf']);
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalled());
    const mail = mocks.sendEmail.mock.calls[0]![0] as { to: string[]; attachments: { filename: string }[] };
    expect(mail.to).toContain('ana@example.com');
    expect(mail.attachments[0]!.filename).toMatch(/\.pdf$/);
  });
});

describe('staff contract routes', () => {
  beforeEach(() => vi.clearAllMocks());

  function gate() {
    const layers = (contractRoutes as unknown as { stack: { route?: unknown; handle: Handler }[] }).stack.filter((l) => !l.route);
    return layers[1]!.handle;
  }

  it('blocks users without either contract permission', async () => {
    const next = vi.fn();
    const res = { status: vi.fn(() => res), json: vi.fn() };
    await gate()({ user: { permissions: ['can_edit_orders'] } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets HR-only users in but not into partner contracts', async () => {
    const next = vi.fn();
    await gate()({ user: { permissions: ['can_manage_staff_contracts'] } }, {}, next);
    expect(next).toHaveBeenCalled();

    mocks.getSupabaseClient.mockReturnValue(fakeSupabase({ contracts: [{ data: contractRow(), error: null }] }));
    const { error } = await invoke(routeHandler(contractRoutes, 'get', '/:id'), {
      params: { id: 'c1' }, user: { permissions: ['can_manage_staff_contracts'], storeIds: [], username: 'hr' },
    });
    expect(error?.statusCode).toBe(403);
  });

  it('will not send while template placeholders are unfilled', async () => {
    const draft = contractRow({ status: 'draft', rendered_body: 'Offer for {{partner_name}} on {{today}}' });
    const sb = fakeSupabase({ contracts: [{ data: draft, error: null }] });
    mocks.getSupabaseClient.mockReturnValue(sb);
    const { error } = await invoke(routeHandler(contractRoutes, 'post', '/:id/send'), {
      params: { id: 'c1' },
      user: { userId: 'u1', permissions: ['can_manage_contracts'], storeIds: [], username: 'jack' },
      body: { lolaSignerName: 'Jack', lolaSignerTitle: null, signatureDataUrl: PNG, sendEmail: false, expiresInDays: 30 },
    });
    expect(error?.statusCode).toBe(400);
    expect(error?.message).toContain('{{partner_name}}');
    expect(error?.message).not.toContain('{{today}}');
    expect(sb.storageApi.upload).not.toHaveBeenCalled();
  });

  it('locks the text, fills built-ins and returns a one-time link on send', async () => {
    const draft = contractRow({ status: 'draft', rendered_body: 'Signed on {{today}} by {{lola_signer_name}} for {{recipient_name}}' });
    const sb = fakeSupabase({ contracts: [{ data: draft, error: null }, { data: contractRow(), error: null }] });
    mocks.getSupabaseClient.mockReturnValue(sb);
    const { res, error } = await invoke(routeHandler(contractRoutes, 'post', '/:id/send'), {
      params: { id: 'c1' },
      user: { userId: 'u1', permissions: ['can_manage_contracts'], storeIds: [], username: 'jack' },
      body: { lolaSignerName: 'Jack', lolaSignerTitle: 'Owner', signatureDataUrl: PNG, sendEmail: true, expiresInDays: 30 },
    });
    expect(error).toBeUndefined();
    const update = sb.calls.find((c) => c.table === 'contracts' && c.method === 'update')!.args[0] as Row;
    expect(update.status).toBe('sent');
    expect(update.rendered_body).toMatch(/^Signed on \d{1,2} \w+ \d{4} by Jack for Ana$/);
    expect(update.body_sha256).toBe(lib.sha256Hex(update.rendered_body as string));
    const data = (res.body as { data: { signingUrl: string; emailed: boolean } }).data;
    expect(data.emailed).toBe(true);
    const token = data.signingUrl.split('/').pop()!;
    expect(update.access_token_hash).toBe(lib.sha256Hex(token));
  });
});
