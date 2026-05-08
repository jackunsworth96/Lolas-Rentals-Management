/**
 * High-level Telegram service for driver-channel transfer notifications.
 *
 * All functions are fire-and-forget safe: errors are logged but never thrown,
 * so a failed Telegram send can never break the booking confirmation flow.
 *
 * Channel routing by vehicle type:
 *   tuktuk      → TELEGRAM_TUKTUK_CHAT_ID (group info) / TELEGRAM_TUKTUK_DRIVER_CHAT_ID (confirm button)
 *   shared_van  → TELEGRAM_VAN_CHAT_ID (group info)    / TELEGRAM_VAN_DRIVER_CHAT_ID (confirm button)
 *   private_van → TELEGRAM_VAN_CHAT_ID (group info)    / TELEGRAM_VAN_DRIVER_CHAT_ID (confirm button)
 *   (fallback)  → TELEGRAM_DRIVER_CHAT_ID (backward compatible when specific IDs are unset)
 *
 * When a driver-specific chat ID is configured (TELEGRAM_VAN_DRIVER_CHAT_ID /
 * TELEGRAM_TUKTUK_DRIVER_CHAT_ID), the group chat receives an info-only message
 * (no confirm button) and the driver's personal chat receives the message with
 * the ✅ Confirm button. The returned message_id tracks the driver's message so
 * the webhook can update it on confirmation.
 *
 * When no driver-specific chat ID is configured, the confirm button falls back
 * to the group chat (backward-compatible behaviour).
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
 * Returns the group/broadcast chat ID for the given vehicle type.
 * This chat receives info-only messages without a confirm button.
 */
export function getGroupChatIdForVanType(vanType: string | null): string | undefined {
  if (vanType === 'tuktuk') {
    return getTelegramChatId('tuktuk') ?? getTelegramChatId('driver');
  }
  return getTelegramChatId('van') ?? getTelegramChatId('driver');
}

/**
 * Returns the driver's personal chat ID for the given vehicle type.
 * This chat receives the ✅ Confirm button message.
 * Returns undefined when no driver-specific chat is configured (fall back to group chat).
 */
function getDriverConfirmChatIdForVanType(vanType: string | null): string | undefined {
  if (vanType === 'tuktuk') {
    return getTelegramChatId('tuktuk_driver');
  }
  return getTelegramChatId('van_driver');
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
 * Sends notifications for a new transfer booking.
 *
 * - If a driver-specific confirm chat is configured: the group chat receives an
 *   info-only message (no button) and the driver chat receives the confirm button.
 * - Otherwise (backward compat): the group chat receives the confirm button.
 *
 * Returns the Telegram message_id of the message that carries the confirm button,
 * or null on failure.
 */
export async function notifyNewTransfer(transfer: TransferForTemplate): Promise<string | null> {
  const groupChatId = getGroupChatIdForVanType(transfer.vanType);
  if (!groupChatId) {
    logger.warn('notifyNewTransfer skipped: no driver chat ID configured');
    return null;
  }

  const driverChatId = getDriverConfirmChatIdForVanType(transfer.vanType);
  const text = buildNewBookingMessage(transfer);

  try {
    if (driverChatId) {
      // Send info-only to the group chat (no confirm button).
      void sendTelegramMessage(text, groupChatId);
      // Send with confirm button to the driver's personal chat; track this message ID.
      return await sendTelegramMessage(text, driverChatId, confirmKeyboard(transfer.id));
    } else {
      // Backward compat: single message with confirm button goes to the group chat.
      return await sendTelegramMessage(text, groupChatId, confirmKeyboard(transfer.id));
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'notifyNewTransfer failed');
    return null;
  }
}

/**
 * Sends a reminder notification for an unconfirmed transfer.
 * Follows the same dual-chat split as notifyNewTransfer.
 * Returns the Telegram message_id of the message carrying the confirm button, or null.
 */
export async function notifyReminderTransfer(transfer: TransferForTemplate): Promise<string | null> {
  const groupChatId = getGroupChatIdForVanType(transfer.vanType);
  if (!groupChatId) {
    logger.warn('notifyReminderTransfer skipped: no driver chat ID configured');
    return null;
  }

  const driverChatId = getDriverConfirmChatIdForVanType(transfer.vanType);
  const text = buildReminderMessage(transfer);

  try {
    if (driverChatId) {
      void sendTelegramMessage(text, groupChatId);
      return await sendTelegramMessage(text, driverChatId, confirmKeyboard(transfer.id));
    } else {
      return await sendTelegramMessage(text, groupChatId, confirmKeyboard(transfer.id));
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'notifyReminderTransfer failed');
    return null;
  }
}

/**
 * Sends an amendment notification when a transfer's flight time changes.
 * Follows the same dual-chat split as notifyNewTransfer.
 * Returns the Telegram message_id of the message carrying the confirm button, or null.
 */
export async function notifyAmendedTransfer(
  transfer: TransferForTemplate,
  oldPickupTime: string,
): Promise<string | null> {
  const groupChatId = getGroupChatIdForVanType(transfer.vanType);
  if (!groupChatId) {
    logger.warn('notifyAmendedTransfer skipped: no driver chat ID configured');
    return null;
  }

  const driverChatId = getDriverConfirmChatIdForVanType(transfer.vanType);
  const text = buildAmendmentMessage(transfer, oldPickupTime);

  try {
    if (driverChatId) {
      void sendTelegramMessage(text, groupChatId);
      return await sendTelegramMessage(text, driverChatId, confirmKeyboard(transfer.id));
    } else {
      return await sendTelegramMessage(text, groupChatId, confirmKeyboard(transfer.id));
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'notifyAmendedTransfer failed');
    return null;
  }
}
