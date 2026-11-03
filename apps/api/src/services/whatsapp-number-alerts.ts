import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logger } from '../lib/logger.js';
import { getTelegramChatId, sendTelegramAlert } from '../lib/telegram.js';

export interface InvalidWhatsAppNumberContext {
  /** Automation that tried to send, e.g. `return_reminder`. */
  automation: string;
  bookingReference?: string | null;
  customerName?: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Records a skipped WhatsApp send, flags the customer for review and alerts
 * staff on Telegram the first time a booking/automation/number combination fails.
 * Never throws.
 */
export async function reportInvalidWhatsAppNumber(
  rawPhone: string,
  context: InvalidWhatsAppNumberContext,
): Promise<void> {
  const reference = context.bookingReference ?? null;
  logger.warn(
    { automation: context.automation, ref: reference, rawPhone },
    '[whatsapp] Invalid WhatsApp number — message not sent',
  );

  try {
    const sb = getSupabaseClient();

    const { data: inserted, error: insertErr } = await sb
      .from('whatsapp_send_failures')
      .upsert(
        {
          booking_reference: reference ?? '',
          automation: context.automation,
          raw_phone: rawPhone,
          reason: 'invalid_phone',
        },
        { onConflict: 'booking_reference,automation,raw_phone', ignoreDuplicates: true },
      )
      .select('id');
    if (insertErr) {
      logger.warn({ error: insertErr.message }, '[whatsapp] Could not record send failure');
    }

    const { error: flagErr } = await sb
      .from('customers')
      .update({ mobile_needs_review: true })
      .eq('mobile', rawPhone);
    if (flagErr) {
      logger.warn({ error: flagErr.message }, '[whatsapp] Could not flag customer mobile for review');
    }

    const isFirstFailure = !insertErr && (inserted?.length ?? 0) > 0;
    if (!isFirstFailure) return;

    const lines = [
      '⚠️ <b>WhatsApp message not sent — invalid number</b>',
      context.customerName ? `Customer: ${escapeHtml(context.customerName)}` : null,
      reference ? `Booking: ${escapeHtml(reference)}` : null,
      `Number on file: <code>${escapeHtml(rawPhone)}</code>`,
      `Automation: ${escapeHtml(context.automation)}`,
      'Fix it from the order screen (pencil next to the number).',
    ].filter(Boolean);
    await sendTelegramAlert(lines.join('\n'), getTelegramChatId('ops'));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[whatsapp] Failed to report invalid number',
    );
  }
}
