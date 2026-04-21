/**
 * Optional env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * When unset, alerts are skipped. Failures never throw.
 */
import { logger } from './logger.js';

export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    logger.warn(
      { hasToken: Boolean(token), hasChatId: Boolean(chatId) },
      'Telegram alert skipped: missing TELEGRAM_BOT_TOKEN and/or TELEGRAM_CHAT_ID',
    );
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
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
