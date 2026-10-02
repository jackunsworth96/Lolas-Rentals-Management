import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { logger } from '../../lib/logger.js';

export type TelegramAcknowledgeDeliveryReminderResult =
  | { ok: true; acknowledgedBy: string }
  | { ok: false; reason: 'already_acknowledged'; acknowledgedBy: string | null }
  | { ok: false; reason: 'db_error' };

/**
 * Marks an off-site pickup/dropoff event as acknowledged when an ops staffer
 * taps the "✓ Acknowledge" inline button on the Telegram escalation message.
 *
 * This exists because the on-screen backoffice modal requires someone to be
 * actively looking at an open, foregrounded browser tab — which historically
 * never happened (100% of delivery_reminder_log rows had acknowledged_at = null).
 * Telegram is where ops actually watches, so acknowledgment needs to be
 * possible from there directly, without requiring the web app at all.
 *
 * Unlike `telegramCompleteTask`, this is intentionally NOT restricted to a
 * single assignee — the Telegram message goes to a group (`ops`) chat, and
 * anyone on duty who sees it should be able to acknowledge it.
 */
export async function telegramAcknowledgeDeliveryReminder(input: {
  orderItemId: string;
  eventType: 'pickup' | 'dropoff';
  telegramUserId: string;
  /** Fallback label when the tapper isn't a linked employee (e.g. Telegram first name/username). */
  tapperLabel: string;
}): Promise<TelegramAcknowledgeDeliveryReminderResult> {
  const sb = getSupabaseClient();
  const now = new Date().toISOString();

  // Check current state first so double-taps (or a second person tapping
  // after someone else already did) get a clear "already handled" toast
  // instead of silently overwriting who gets credit.
  const { data: existing, error: fetchErr } = await sb
    .from('delivery_reminder_log')
    .select('acknowledged_at, acknowledged_by')
    .eq('order_item_id', input.orderItemId)
    .eq('event_type', input.eventType)
    .maybeSingle();

  if (fetchErr) {
    logger.warn(
      { err: fetchErr.message },
      'telegramAcknowledgeDeliveryReminder: lookup failed',
    );
    return { ok: false, reason: 'db_error' };
  }

  if (existing?.acknowledged_at) {
    return {
      ok: false,
      reason: 'already_acknowledged',
      acknowledgedBy: (existing.acknowledged_by as string | null) ?? null,
    };
  }

  // Resolve a human-readable name: prefer a linked employee record, else
  // fall back to whatever Telegram gave us (first name / username).
  let acknowledgedBy = input.tapperLabel;
  const { data: empRow } = await sb
    .from('employees')
    .select('full_name')
    .eq('telegram_user_id', input.telegramUserId)
    .maybeSingle();
  if (empRow?.full_name) {
    acknowledgedBy = empRow.full_name as string;
  }

  const { error: upsertErr } = await sb.from('delivery_reminder_log').upsert(
    {
      order_item_id: input.orderItemId,
      event_type: input.eventType,
      acknowledged_at: now,
      acknowledged_by: acknowledgedBy,
    },
    { onConflict: 'order_item_id,event_type' },
  );

  if (upsertErr) {
    logger.warn(
      { err: upsertErr.message },
      'telegramAcknowledgeDeliveryReminder: upsert failed',
    );
    return { ok: false, reason: 'db_error' };
  }

  logger.info(
    { orderItemId: input.orderItemId, eventType: input.eventType, acknowledgedBy },
    'telegramAcknowledgeDeliveryReminder: acknowledged via Telegram',
  );

  return { ok: true, acknowledgedBy };
}
