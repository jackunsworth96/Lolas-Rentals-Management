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

  it('creates a missing booking contact and retries the template once', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RESPOND_IO_API_URL = 'https://api.respond.io';
    process.env.RESPOND_IO_OUTBOUND_TOKEN = 'test-token';

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ code: 404, message: 'Contact not found!' }),
        { status: 404 },
      ))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await sendRespondIoTemplateMessage({
      phone: '09369945652',
      channelId: 501809,
      templateName: 'booking_recieved',
      bodyText: 'Hi {{1}}, your booking is confirmed.',
      parameters: ['Michael'],
      createContactIfMissing: {
        firstName: 'Michael',
        lastName: 'Wildman',
        email: 'michael@example.com',
      },
      logContext: { orderReference: 'LR-0806-F4ED' },
    });

    expect(result).toEqual({ delivered: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const [firstUrl] = fetchSpy.mock.calls[0];
    expect(firstUrl).toBe('https://api.respond.io/v2/contact/phone:%2B639369945652/message');

    const [createUrl, createInit] = fetchSpy.mock.calls[1];
    expect(createUrl).toBe('https://api.respond.io/v2/contact/create_or_update/phone:%2B639369945652');
    expect(createInit).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(createInit?.body))).toEqual({
      firstName: 'Michael',
      lastName: 'Wildman',
      email: 'michael@example.com',
      phone: '+639369945652',
    });

    const [retryUrl] = fetchSpy.mock.calls[2];
    expect(retryUrl).toBe(firstUrl);
  });

  it('does not create a contact unless the caller explicitly opts in', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RESPOND_IO_API_URL = 'https://api.respond.io';
    process.env.RESPOND_IO_OUTBOUND_TOKEN = 'test-token';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 404, message: 'Contact not found!' }), { status: 404 }),
    );

    await expect(sendRespondIoTemplateMessage({
      phone: '+639369945652',
      channelId: 501809,
      templateName: 'booking_recieved',
      bodyText: 'Booking confirmed.',
      parameters: [],
    })).rejects.toThrow('respond.io API error 404');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
