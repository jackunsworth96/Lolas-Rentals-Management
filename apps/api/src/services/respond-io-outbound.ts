import { logger } from '../lib/logger.js';

export interface RespondIoTextMessageInput {
  phone: string;
  text: string;
  logContext?: Record<string, unknown>;
}

export function sanitisePhilippinePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return `+63${digits}`;
}

export async function sendRespondIoTextMessage({
  phone,
  text,
  logContext,
}: RespondIoTextMessageInput): Promise<{ delivered: boolean }> {
  const normalizedPhone = sanitisePhilippinePhone(phone);

  if (process.env.NODE_ENV === 'development') {
    logger.info(
      { phone: normalizedPhone, text, ...logContext },
      '[respond-io-outbound] Development mode: simulated text send',
    );
    return { delivered: false };
  }

  const baseUrl = process.env.RESPOND_IO_API_URL;
  const token = process.env.RESPOND_IO_OUTBOUND_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('Missing RESPOND_IO_API_URL or RESPOND_IO_OUTBOUND_TOKEN environment variable');
  }

  const url = `${baseUrl}/v2/contact/phone:${encodeURIComponent(normalizedPhone)}/message`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: { type: 'text', text } }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`respond.io API error ${res.status}: ${body}`);
  }

  return { delivered: true };
}
