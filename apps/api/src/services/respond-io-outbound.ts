import { logger } from '../lib/logger.js';

export interface RespondIoTextMessageInput {
  phone: string;
  text: string;
  logContext?: Record<string, unknown>;
}

export interface RespondIoTemplateMessageInput {
  phone: string;
  channelId: number;
  templateName: string;
  languageCode?: string;
  bodyText: string;
  parameters: string[];
  createContactIfMissing?: {
    firstName: string;
    lastName?: string;
    email?: string;
  };
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

export async function sendRespondIoTemplateMessage({
  phone,
  channelId,
  templateName,
  languageCode = 'en',
  bodyText,
  parameters,
  createContactIfMissing,
  logContext,
}: RespondIoTemplateMessageInput): Promise<{ delivered: boolean }> {
  const normalizedPhone = sanitisePhilippinePhone(phone);
  const payload = {
    channelId,
    message: {
      type: 'whatsapp_template',
      template: {
        name: templateName,
        languageCode,
        components: [
          {
            type: 'body',
            text: bodyText,
            parameters: parameters.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    logger.info(
      { phone: normalizedPhone, payload, ...logContext },
      '[respond-io-outbound] Development mode: simulated template send',
    );
    return { delivered: false };
  }

  const baseUrl = process.env.RESPOND_IO_API_URL;
  const token = process.env.RESPOND_IO_OUTBOUND_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('Missing RESPOND_IO_API_URL or RESPOND_IO_OUTBOUND_TOKEN environment variable');
  }

  const contactUrl = `${baseUrl}/v2/contact/phone:${encodeURIComponent(normalizedPhone)}`;
  const contactUpsertUrl = `${baseUrl}/v2/contact/create_or_update/phone:${encodeURIComponent(normalizedPhone)}`;
  const messageUrl = `${contactUrl}/message`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const sendTemplate = () => fetch(messageUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  let res = await sendTemplate();
  let body = res.ok ? '' : await res.text().catch(() => '');

  if (
    res.status === 404
    && body.toLowerCase().includes('contact not found')
    && createContactIfMissing
  ) {
    const contactPayload = {
      firstName: createContactIfMissing.firstName,
      ...(createContactIfMissing.lastName ? { lastName: createContactIfMissing.lastName } : {}),
      ...(createContactIfMissing.email ? { email: createContactIfMissing.email } : {}),
      phone: normalizedPhone,
    };
    const createRes = await fetch(contactUpsertUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(contactPayload),
    });
    if (!createRes.ok) {
      const createBody = await createRes.text().catch(() => '');
      throw new Error(`respond.io contact creation error ${createRes.status}: ${createBody}`);
    }

    logger.info(
      { phoneLast4: normalizedPhone.replace(/\D/g, '').slice(-4), ...logContext },
      '[respond-io-outbound] Missing contact upserted; retrying template',
    );
    res = await sendTemplate();
    body = res.ok ? '' : await res.text().catch(() => '');
  }

  if (!res.ok) {
    throw new Error(`respond.io API error ${res.status}: ${body}`);
  }

  logger.info(
    { phoneLast4: normalizedPhone.replace(/\D/g, '').slice(-4), ...logContext },
    '[respond-io-outbound] Template message sent',
  );

  return { delivered: true };
}
