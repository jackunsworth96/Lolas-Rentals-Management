import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendRespondIoTemplateMessage } from '../src/services/respond-io-outbound.js';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('sendRespondIoTemplateMessage', () => {
  it('sends an approved WhatsApp template payload rather than free-form text', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RESPOND_IO_API_URL = 'https://api.respond.io';
    process.env.RESPOND_IO_OUTBOUND_TOKEN = 'test-token';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const result = await sendRespondIoTemplateMessage({
      phone: '+61 476 238 958',
      channelId: 501809,
      templateName: 'post_rental_review',
      languageCode: 'en',
      bodyText: 'Hey {{1}}! Please leave us a review.',
      parameters: ['Marnie Vimpany'],
    });

    expect(result).toEqual({ delivered: true });
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.respond.io/v2/contact/phone:%2B61476238958/message');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      channelId: 501809,
      message: {
        type: 'whatsapp_template',
        template: {
          name: 'post_rental_review',
          languageCode: 'en',
          components: [
            {
              type: 'body',
              text: 'Hey {{1}}! Please leave us a review.',
              parameters: [{ type: 'text', text: 'Marnie Vimpany' }],
            },
          ],
        },
      },
    });
  });
});
