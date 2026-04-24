/**
 * High-level Telegram service for driver-channel transfer notifications.
 *
 * All functions are fire-and-forget safe: errors are logged but never thrown,
 * so a failed Telegram send can never break the booking confirmation flow.
 *
 * Webhook setup (one-time, run manually):
 *   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
 *     -d "url=https://<render-backend>.onrender.com/api/public/telegram"
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

/** Returns the driver channel chat ID from env, or undefined if not configured. */
export function getDriverChatId(): string | undefined {
  return getTelegramChatId('driver');
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
 * Posts a new-booking notification to the driver channel.
 * Returns the Telegram message_id string, or null on failure.
 */
export async function notifyNewTransfer(transfer: TransferForTemplate): Promise<string | null> {
  const chatId = getDriverChatId();
  if (!chatId) {
    logger.warn('notifyNewTransfer skipped: TELEGRAM_DRIVER_CHAT_ID not set');
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
  const chatId = getDriverChatId();
  if (!chatId) {
    logger.warn('notifyReminderTransfer skipped: TELEGRAM_DRIVER_CHAT_ID not set');
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
  const chatId = getDriverChatId();
  if (!chatId) {
    logger.warn('notifyAmendedTransfer skipped: TELEGRAM_DRIVER_CHAT_ID not set');
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
