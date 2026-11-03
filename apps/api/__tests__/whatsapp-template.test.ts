import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  reportInvalidWhatsAppNumber: vi.fn(),
}));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('../src/services/whatsapp-number-alerts.js', () => ({
  reportInvalidWhatsAppNumber: mocks.reportInvalidWhatsAppNumber,
}));

const { InvalidWhatsAppNumberError, renderTemplate, retryLoloDeskReports, sendWhatsAppTemplate } = await import('../src/services/whatsapp-template.js');
const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('direct WhatsApp templates', () => {
  it('renders the final body and rejects mismatched parameters', () => {
    expect(renderTemplate('Hi {{1}}, return at {{2}}. {{1}}', ['Ada', '9 PM']))
      .toBe('Hi Ada, return at 9 PM. Ada');
    expect(() => renderTemplate('Hi {{2}}', ['Ada'])).toThrow();
  });

  it.each([
    { accountId: undefined },
    { accountId: '1829458421577802' },
  ])('sends once with Messaging account $accountId and retries only the LoloDesk report', async ({ accountId }) => {
    process.env.NODE_ENV = 'test';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    if (accountId) process.env.META_WHATSAPP_MESSAGING_ACCOUNT_ID = accountId;
    else delete process.env.META_WHATSAPP_MESSAGING_ACCOUNT_ID;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.META_GRAPH_API_VERSION = 'v25.0';
    process.env.LOLODESK_API_URL = 'https://desk.example';
    process.env.LOLODESK_INTEGRATION_TOKEN = 'desk-token';

    let row: Record<string, unknown> | null = null;
    const from = vi.fn(() => ({
      insert: async (value: Record<string, unknown>) => {
        if (row) return { error: { code: '23505', message: 'duplicate' } };
        row = { ...value, external_message_id: null, reported_at: null };
        return { error: null };
      },
      update: (value: Record<string, unknown>) => ({
        eq: () => ({ select: () => ({ single: async () => {
          row = { ...row, ...value };
          return { data: row, error: null };
        } }) }),
      }),
      select: () => ({
        eq: () => ({ single: async () => ({ data: row, error: null }) }),
        not: () => ({ is: () => ({ order: () => ({
          limit: async () => ({ data: row && !row.reported_at ? [row] : [], error: null }),
        }) }) }),
      }),
    }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { pending_review: true } }), { status: 202 }));

    const input = {
      operationKey: 'booking:LR-123', phone: '09171234567', templateName: 'booking_recieved',
      bodyText: 'Hi {{1}}, your booking {{2}} is confirmed.', parameters: ['Ada', 'LR-123'],
    };
    expect(await sendWhatsAppTemplate(input)).toEqual({ delivered: true });
    expect(row).toMatchObject({ external_message_id: 'wamid.123', reported_at: null });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/1234567890/messages');
    const payload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      to: '639171234567', type: 'template', template: { name: 'booking_recieved' },
    });
    if (accountId) expect(payload.messaging_account_id).toBe(accountId);
    else expect(payload).not.toHaveProperty('messaging_account_id');

    await retryLoloDeskReports();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2][0]).toBe('https://desk.example/api/integrations/whatsapp/outbound-messages');
    expect(JSON.parse(String(fetchSpy.mock.calls[2][1]?.body))).toMatchObject({
      recipient: '+639171234567', external_message_id: 'wamid.123',
      body: 'Hi Ada, your booking LR-123 is confirmed.',
    });
    expect(row?.reported_at).toBeTruthy();
    expect(await sendWhatsAppTemplate(input)).toEqual({ delivered: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('rejects an invalid Messaging account ID before reserving or sending a message', async () => {
    process.env.NODE_ENV = 'test';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.META_WHATSAPP_MESSAGING_ACCOUNT_ID = 'not-an-account';
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.META_GRAPH_API_VERSION = 'v25.0';
    mocks.getSupabaseClient.mockClear();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));

    await expect(sendWhatsAppTemplate({
      operationKey: 'invalid-account', phone: '+639171234567', templateName: 'test',
      bodyText: 'Hi {{1}}', parameters: ['Ada'],
    })).rejects.toThrow('Invalid Meta WhatsApp Messaging account ID');
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('recovers a German number missing its + instead of prefixing +63', async () => {
    process.env.NODE_ENV = 'development';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));

    await expect(sendWhatsAppTemplate({
      operationKey: 'recovery',
      phone: '04915228502404',
      templateName: 'test',
      bodyText: 'Hi {{1}}',
      parameters: ['Moritz'],
    })).resolves.toEqual({ delivered: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.reportInvalidWhatsAppNumber).not.toHaveBeenCalled();
  });

  it('does not send when the number cannot be resolved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));

    await expect(sendWhatsAppTemplate({
      operationKey: 'invalid-phone',
      phone: 'not-a-number',
      templateName: 'test',
      bodyText: 'Hi {{1}}',
      parameters: ['Ada'],
      failureContext: { automation: 'return_reminder', bookingReference: 'LR-1', customerName: 'Ada' },
    })).rejects.toBeInstanceOf(InvalidWhatsAppNumberError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.reportInvalidWhatsAppNumber).toHaveBeenCalledWith(
      'not-a-number',
      { automation: 'return_reminder', bookingReference: 'LR-1', customerName: 'Ada' },
    );
  });
});
