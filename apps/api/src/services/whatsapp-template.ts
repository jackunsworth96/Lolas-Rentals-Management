import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logger } from '../lib/logger.js';

export interface WhatsAppTemplateInput {
  operationKey: string;
  phone: string;
  templateName: string;
  languageCode?: string;
  bodyText: string;
  parameters: string[];
  logContext?: Record<string, unknown>;
}

interface SendRecord {
  operation_key: string;
  phone_number_id: string;
  recipient: string;
  external_message_id: string;
  body: string;
  template_name: string;
  template_language: string;
  sent_at: string;
}

function normalisePhone(raw: string): string {
  const phone = raw.replace(/[\s\-().]/g, '');
  if (phone.startsWith('+')) return phone;
  if (phone.startsWith('0')) return `+63${phone.slice(1)}`;
  if (phone.startsWith('63')) return `+${phone}`;
  return `+63${phone}`;
}

export function renderTemplate(body: string, parameters: string[]): string {
  const indexes = [...body.matchAll(/{{(\d+)}}/g)].map((match) => Number(match[1]));
  if (indexes.some((index) => index < 1 || index > parameters.length)
    || parameters.some((_, index) => !indexes.includes(index + 1))) {
    throw new Error('Template parameters do not match body placeholders');
  }
  return body.replace(/{{(\d+)}}/g, (_, index: string) => parameters[Number(index) - 1]);
}

function loloDeskConfig(): { url: string; token: string } {
  const base = process.env.LOLODESK_API_URL;
  const token = process.env.LOLODESK_INTEGRATION_TOKEN;
  if (!base || !token) throw new Error('Missing LOLODESK_API_URL or LOLODESK_INTEGRATION_TOKEN');
  const url = new URL('/api/integrations/whatsapp/outbound-messages', `${base.replace(/\/$/, '')}/`);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('LOLODESK_API_URL must use HTTPS outside local development');
  }
  return { url: url.toString(), token };
}

async function reportToLoloDesk(record: SendRecord): Promise<void> {
  const { url, token } = loloDeskConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      phone_number_id: record.phone_number_id,
      recipient: record.recipient,
      external_message_id: record.external_message_id,
      body: record.body,
      template_name: record.template_name,
      template_language: record.template_language,
      sent_at: record.sent_at,
    }),
  });
  if (response.status !== 202) throw new Error(`LoloDesk report error ${response.status}`);
  const result = await response.json().catch(() => null) as { data?: { pending_review?: boolean } } | null;
  if (result?.data?.pending_review) {
    logger.warn({ operationKey: record.operation_key }, '[whatsapp-template] Contact needs matching in LoloDesk');
  }
  const { data, error } = await getSupabaseClient().from('whatsapp_template_sends')
    .update({ reported_at: new Date().toISOString() })
    .eq('operation_key', record.operation_key)
    .select('operation_key')
    .single();
  if (error || !data) throw new Error(`Could not mark report complete: ${error?.message ?? 'missing record'}`);
}

export async function retryLoloDeskReports(): Promise<void> {
  const { data, error } = await getSupabaseClient().from('whatsapp_template_sends')
    .select('operation_key, phone_number_id, recipient, external_message_id, body, template_name, template_language, sent_at')
    .not('external_message_id', 'is', null)
    .is('reported_at', null)
    .order('sent_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`Could not load pending reports: ${error.message}`);
  for (const record of (data ?? []) as SendRecord[]) {
    try { await reportToLoloDesk(record); }
    catch (err) { logger.warn({ err, operationKey: record.operation_key }, '[whatsapp-template] LoloDesk report retry failed'); }
  }
}

export function startLoloDeskReportJob(): void {
  cron.schedule('*/5 * * * *', () => {
    void retryLoloDeskReports().catch((err) => logger.error({ err }, '[whatsapp-template] Report job failed'));
  });
}

export async function sendWhatsAppTemplate({
  operationKey, phone, templateName, languageCode = 'en', bodyText, parameters, logContext,
}: WhatsAppTemplateInput): Promise<{ delivered: boolean }> {
  const recipient = normalisePhone(phone);
  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) throw new Error('Invalid WhatsApp recipient');
  const body = renderTemplate(bodyText, parameters);
  if (process.env.NODE_ENV === 'development') {
    logger.info({ recipient, templateName, body, ...logContext }, '[whatsapp-template] Simulated send');
    return { delivered: false };
  }

  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;
  if (!phoneNumberId || !token || !version || !/^v\d+\.\d+$/.test(version)) {
    throw new Error('Missing or invalid Meta WhatsApp configuration');
  }
  loloDeskConfig();

  const sb = getSupabaseClient();
  // shortcut: a claimed send without a Meta ID needs manual review; automatic retry could duplicate a timed-out send.
  const { error: claimError } = await sb.from('whatsapp_template_sends').insert({
    operation_key: operationKey, phone_number_id: phoneNumberId, recipient, body,
    template_name: templateName, template_language: languageCode,
  });
  if (claimError) {
    if (claimError.code !== '23505') throw new Error(`Could not reserve send: ${claimError.message}`);
    const { data: existing, error } = await sb.from('whatsapp_template_sends')
      .select('external_message_id').eq('operation_key', operationKey).single();
    if (error || !existing) throw new Error(`Could not inspect existing send: ${error?.message ?? 'missing record'}`);
    if (!existing.external_message_id) throw new Error(`Send ${operationKey} has an uncertain outcome; inspect before retrying`);
    return { delivered: true };
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: recipient.slice(1), type: 'template',
      template: {
        name: templateName, language: { code: languageCode },
        ...(parameters.length ? { components: [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] } : {}),
      },
    }),
  });
  if (!response.ok) throw new Error(`Meta template send error ${response.status}: ${await response.text()}`);
  const result = await response.json() as { messages?: Array<{ id?: string }> };
  const messageId = result.messages?.[0]?.id;
  if (!messageId) throw new Error(`Meta returned no message ID for ${operationKey}; inspect before retrying`);

  const sentAt = new Date().toISOString();
  const { data: saved, error: saveError } = await sb.from('whatsapp_template_sends')
    .update({ external_message_id: messageId, sent_at: sentAt })
    .eq('operation_key', operationKey).select('operation_key').single();
  if (saveError || !saved) throw new Error(`Meta accepted ${messageId}, but saving its ID failed: ${saveError?.message ?? 'missing record'}`);

  try {
    await reportToLoloDesk({
      operation_key: operationKey, phone_number_id: phoneNumberId, recipient,
      external_message_id: messageId, body, template_name: templateName,
      template_language: languageCode, sent_at: sentAt,
    });
  } catch (err) {
    logger.warn({ err, operationKey, messageId }, '[whatsapp-template] Meta accepted; LoloDesk report queued');
  }
  return { delivered: true };
}
