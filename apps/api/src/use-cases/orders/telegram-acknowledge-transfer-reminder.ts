import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { logger } from '../../lib/logger.js';

export type TelegramAcknowledgeTransferReminderResult =
  | { ok: true; acknowledgedBy: string }
  | { ok: false; reason: 'already_acknowledged'; acknowledgedBy: string | null }
  | { ok: false; reason: 'db_error' };

/**
 * Marks an airport-transfer reminder as acknowledged when an ops staffer
 * taps the "✓ Acknowledge" inline button on the Telegram escalation message.
 *
 * Mirrors telegramAcknowledgeDeliveryReminder — see that file for why this
 * needs to work directly from Telegram rather than only via the on-screen
 * modal.
 */
export async function telegramAcknowledgeTransferReminder(input: {
  transferId: string;
  telegramUserId: string;
  tapperLabel: string;
}): Promise<TelegramAcknowledgeTransferReminderResult> {
  const sb = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: existing, error: fetchErr } = await sb
    .from('transfer_reminder_log')
    .select('acknowledged_at, acknowledged_by')
    .eq('transfer_id', input.transferId)
    .maybeSingle();

  if (fetchErr) {
    logger.warn({ err: fetchErr.message }, 'telegramAcknowledgeTransferReminder: lookup failed');
    return { ok: false, reason: 'db_error' };
  }

  if (existing?.acknowledged_at) {
    return {
      ok: false,
      reason: 'already_acknowledged',
      acknowledgedBy: (existing.acknowledged_by as string | null) ?? null,
    };
  }

  let acknowledgedBy = input.tapperLabel;
  const { data: empRow } = await sb
    .from('employees')
    .select('full_name')
    .eq('telegram_user_id', input.telegramUserId)
    .maybeSingle();
  if (empRow?.full_name) {
    acknowledgedBy = empRow.full_name as string;
  }

  const { error: upsertErr } = await sb.from('transfer_reminder_log').upsert(
    { transfer_id: input.transferId, acknowledged_at: now, acknowledged_by: acknowledgedBy },
    { onConflict: 'transfer_id' },
  );

  if (upsertErr) {
    logger.warn({ err: upsertErr.message }, 'telegramAcknowledgeTransferReminder: upsert failed');
    return { ok: false, reason: 'db_error' };
  }

  logger.info(
    { transferId: input.transferId, acknowledgedBy },
    'telegramAcknowledgeTransferReminder: acknowledged via Telegram',
  );

  return { ok: true, acknowledgedBy };
}
