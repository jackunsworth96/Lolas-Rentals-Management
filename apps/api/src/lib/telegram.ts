/**
 * Optional env:
 *   TELEGRAM_BOT_TOKEN       — bot auth token (one bot handles all channels)
 *   TELEGRAM_CHAT_ID         — default personal/owner chat (fallback)
 *   TELEGRAM_OPS_CHAT_ID     — Lola's Ops channel (order lifecycle events)
 *   TELEGRAM_FLEET_CHAT_ID   — Lola's Fleet channel (vehicle status changes)
 *   TELEGRAM_DAILY_CHAT_ID   — Lola's Daily Updates channel (morning summary)
 *
 * When the bot token or a given chat id is unset, alerts targeting that
 * channel are silently skipped. Failures never throw — callers can treat
 * sendTelegramAlert as fire-and-forget.
 */
import { logger } from './logger.js';

export function getTelegramChatId(kind: 'default' | 'ops' | 'fleet' | 'daily'): string | undefined {
  switch (kind) {
    case 'ops':   return process.env.TELEGRAM_OPS_CHAT_ID;
    case 'fleet': return process.env.TELEGRAM_FLEET_CHAT_ID;
    case 'daily': return process.env.TELEGRAM_DAILY_CHAT_ID;
    case 'default':
    default:      return process.env.TELEGRAM_CHAT_ID;
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
