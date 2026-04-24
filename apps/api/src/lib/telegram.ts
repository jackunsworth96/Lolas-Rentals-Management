/**
 * Optional env:
 *   TELEGRAM_BOT_TOKEN           — bot auth token (one bot handles all channels)
 *   TELEGRAM_CHAT_ID             — default personal/owner chat (fallback)
 *   TELEGRAM_OPS_CHAT_ID         — Lola's Ops channel (order lifecycle events)
 *   TELEGRAM_FLEET_CHAT_ID       — Lola's Fleet channel (vehicle status changes)
 *   TELEGRAM_DAILY_CHAT_ID       — Lola's Daily Updates channel (morning summary)
 *   TELEGRAM_MAINTENANCE_CHAT_ID — Lola's Maintenance channel (jobs & inspections)
 *   TELEGRAM_DRIVER_CHAT_ID      — Driver channel for transfer notifications
 *
 * When the bot token or a given chat id is unset, alerts targeting that
 * channel are silently skipped. Failures never throw — callers can treat
 * sendTelegramAlert as fire-and-forget.
 */
import { logger } from './logger.js';

export function getTelegramChatId(kind: 'default' | 'ops' | 'fleet' | 'daily' | 'maintenance' | 'driver' | 'feedback'): string | undefined {
  switch (kind) {
    case 'ops':         return process.env.TELEGRAM_OPS_CHAT_ID;
    case 'fleet':       return process.env.TELEGRAM_FLEET_CHAT_ID;
    case 'daily':       return process.env.TELEGRAM_DAILY_CHAT_ID;
    case 'maintenance': return process.env.TELEGRAM_MAINTENANCE_CHAT_ID;
    case 'driver':      return process.env.TELEGRAM_DRIVER_CHAT_ID;
    case 'feedback':    return process.env.TELEGRAM_FEEDBACK_CHAT_ID;
    case 'default':
    default:            return process.env.TELEGRAM_CHAT_ID;
  }
}

export async function sendTelegramAlert(message: string, chatId?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !targetChatId) {
    logger.warn(
      { hasToken: Boolean(token), hasChatId: Boolean(targetChatId), overrideProvided: Boolean(chatId) },
      'Telegram alert skipped: missing TELEGRAM_BOT_TOKEN and/or chat id',
    );
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const raw = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = { parseError: true, raw: raw.slice(0, 500) };
    }

    const ok =
      typeof parsed === 'object' &&
      parsed !== null &&
      'ok' in parsed &&
      (parsed as { ok: boolean }).ok === true;

    if (!res.ok || !ok) {
      logger.warn(
        {
          httpStatus: res.status,
          telegram: parsed,
        },
        'Telegram sendMessage failed',
      );
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Telegram sendMessage request failed',
    );
  }
}

type InlineKeyboardButton = { text: string; callback_data: string };
type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };

/**
 * Sends a message to a specific chat and returns the Telegram message_id,
 * or null if the call fails. Supports optional inline keyboard markup.
 * Never throws — failures are logged and null is returned.
 */
export async function sendTelegramMessage(
  text: string,
  chatId: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    logger.warn(
      { hasToken: Boolean(token), hasChatId: Boolean(chatId) },
      'sendTelegramMessage skipped: missing token or chatId',
    );
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(raw) as unknown; } catch { parsed = { parseError: true }; }

    const isOk =
      typeof parsed === 'object' && parsed !== null &&
      'ok' in parsed && (parsed as { ok: boolean }).ok === true;

    if (!res.ok || !isOk) {
      logger.warn({ httpStatus: res.status, telegram: parsed }, 'sendTelegramMessage failed');
      return null;
    }

    const messageId = (parsed as { result?: { message_id?: number } }).result?.message_id;
    return messageId != null ? String(messageId) : null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'sendTelegramMessage request failed',
    );
    return null;
  }
}

/**
 * Dismisses the loading spinner on a Telegram inline button after the driver taps it.
 * Fire-and-forget — never throws.
 */
export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'answerCallbackQuery request failed',
    );
  }
}
