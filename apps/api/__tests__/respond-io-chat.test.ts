import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendRespondIoChat } from '../src/services/respond-io-chat.js';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('sendRespondIoChat', () => {
  it('throws when webhook url is missing', async () => {
    delete process.env.RESPOND_IO_CHAT_WEBHOOK_URL;

    await expect(
      sendRespondIoChat({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('RESPOND_IO_CHAT_WEBHOOK_URL is not set');
  });

  it('reads direct text response', async () => {
    process.env.RESPOND_IO_CHAT_WEBHOOK_URL = 'https://example.test/chat';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: 'Hello from respond.io' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await sendRespondIoChat({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.text).toBe('Hello from respond.io');
  });

  it('reads nested response message payload', async () => {
    process.env.RESPOND_IO_CHAT_WEBHOOK_URL = 'https://example.test/chat';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { reply: 'Nested reply' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await sendRespondIoChat({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.text).toBe('Nested reply');
  });

  it('reads last message text from array payload', async () => {
    process.env.RESPOND_IO_CHAT_WEBHOOK_URL = 'https://example.test/chat';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            { text: 'First' },
            { content: 'Final assistant reply' },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await sendRespondIoChat({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.text).toBe('Final assistant reply');
  });

  it('throws on non-2xx upstream response', async () => {
    process.env.RESPOND_IO_CHAT_WEBHOOK_URL = 'https://example.test/chat';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream failed', { status: 500 }),
    );

    await expect(
      sendRespondIoChat({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('respond.io chat endpoint error 500');
  });
});
