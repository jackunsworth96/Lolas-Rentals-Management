/**
 * High-level Telegram service for driver-channel transfer notifications.
 *
 * All functions are fire-and-forget safe: errors are logged but never thrown,
 * so a failed Telegram send can never break the booking confirmation flow.
 *
 * Channel routing by vehicle type:
 *   tuktuk      → TELEGRAM_TUKTUK_CHAT_ID
 *   shared_van  → TELEGRAM_VAN_CHAT_ID
 *   private_van → TELEGRAM_VAN_CHAT_ID
 *   (fallback)  → TELEGRAM_DRIVER_CHAT_ID (backward compatible when van/tuktuk IDs unset)
 *
 * Webhook URL must not return 301 — use API host (e.g. api.lolasrentals.com) or Render URL, not a domain that redirects. See telegram.webhook.ts.
 */

import { getTelegramChatId, sendTelegramMessage } from '../lib/telegram.js';
import { logger } from '../lib/logger.js';
import type { TransferForTemplate } from './telegram.templates.js';
import {
  buildNewBookingMessage,
  buildReminderMessage,
  buildAmendmentMessage,
} from './telegram.templates.js';

export type { TransferForTemplate };

/**
 * Returns the driver channel chat ID for the given vehicle type.
 * Tuktuk bookings go to TELEGRAM_TUKTUK_CHAT_ID.
 * All van types go to TELEGRAM_VAN_CHAT_ID.
 * Falls back to TELEGRAM_DRIVER_CHAT_ID when the vehicle-specific IDs are unset.
 */
export function getDriverChatIdForVanType(vanType: string | null): string | undefined {
  if (vanType === 'tuktuk') {
    return getTelegramChatId('tuktuk') ?? getTelegramChatId('driver');
  }
  return getTelegramChatId('van') ?? getTelegramChatId('driver');
}

/** Inline keyboard with a single Confirm button bearing the transfer ID. */
function confirmKeyboard(transferId: string) {
  return {
    inline_keyboard: [[
      { text: '✅ Confirm', callback_data: `confirm_transfer_${transferId}` },
    ]],
  };
}

/**
 * Posts a new-booking notification to the correct driver channel.
 * Returns the Telegram message_id string, or null on failure.
 */
export async function notifyNewTransfer(transfer: TransferForTemplate): Promise<string | null> {
  const chatId = getDriverChatIdForVanType(transfer.vanType);
  if (!chatId) {
    logger.warn('notifyNewTransfer skipped: no driver chat ID configured');
    return null;
  }

  try {
    const text = buildNewBookingMessage(transfer);
    return await sendTelegramMessage(text, chatId, confirmKeyboard(transfer.id));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'notifyNewTransfer failed');
    return null;
  }
}

/**
 * Posts a reminder notification for an unconfirmed transfer.
 * Returns the Telegram message_id string, or null on failure.
 */
export async function notifyReminderTransfer(transfer: TransferForTemplate): Promise<string | null> {
  const chatId = getDriverChatIdForVanType(transfer.vanType);
  if (!chatId) {
    logger.warn('notifyReminderTransfer skipped: no driver chat ID configured');
    return null;
  }

  try {
    const text = buildReminderMessage(transfer);
    return await sendTelegramMessage(text, chatId, confirmKeyboard(transfer.id));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'notifyReminderTransfer failed');
    return null;
  }
}

/**
 * Posts an amendment notification when a transfer's flight time changes.
 * Returns the Telegram message_id string, or null on failure.
 */
export async function notifyAmendedTransfer(
  transfer: TransferForTemplate,
  oldPickupTime: string,
): Promise<string | null> {
  const chatId = getDriverChatIdForVanType(transfer.vanType);
  if (!chatId) {
    logger.warn('notifyAmendedTransfer skipped: no driver chat ID configured');
    return null;
  }

  try {
    const text = buildAmendmentMessage(transfer, oldPickupTime);
    return await sendTelegramMessage(text, chatId, confirmKeyboard(transfer.id));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'notifyAmendedTransfer failed');
    return null;
  }
}
