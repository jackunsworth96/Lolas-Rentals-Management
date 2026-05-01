/**
 * Telegram webhook endpoint — receives callback_query events from inline buttons.
 *
 * This route must be public (no authentication) because requests come directly
 * from Telegram's servers. Telegram retries non-2xx responses; we still return
 * 200 after handling so duplicate deliveries do not spam errors.
 *
 * Important: we **finish** `answerCallbackQuery` (and DB work) **before**
 * sending HTTP 200. Responding immediately then firing `void answerCallbackQuery`
 * caused inline buttons to spin forever on hosts that tear down the request
 * right after the response (and still races on long-lived Node).
 *
 * Webhook URL must respond with 200 directly — Telegram does not follow redirects.
 * Do not use the marketing site apex (e.g. lolasrentals.com) if it 301s to www;
 * use the API host instead, e.g. https://api.lolasrentals.com/api/public/telegram
 * or your Render URL https://<service>.onrender.com/api/public/telegram
 *
 * One-time registration. Bash:
 *   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
 *     -d "url=https://api.lolasrentals.com/api/public/telegram"
 * Windows PowerShell (use curl.exe):
 *   curl.exe -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://api.lolasrentals.com/api/public/telegram"
 */

import { Router, type Request, type Response } from 'express';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { answerCallbackQuery, editMessageReplyMarkup } from '../lib/telegram.js';
import { logger } from '../lib/logger.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  let callbackQueryId = '';

  try {
    const body = req.body as Record<string, unknown>;
    const callbackQuery = body.callback_query as Record<string, unknown> | undefined;
    if (!callbackQuery) {
      res.sendStatus(200);
      return;
    }

    callbackQueryId = String(callbackQuery.id ?? '');
    const data = String(callbackQuery.data ?? '');

    // Extract the originating message so we can edit it after processing.
    const message = callbackQuery.message as Record<string, unknown> | undefined;
    const rawMessageId = (message?.message_id as number | undefined) ?? 0;
    const chatId = message
      ? String(((message.chat as Record<string, unknown> | undefined)?.id) ?? '')
      : '';

    const match = data.match(/^confirm_transfer_(.+)$/);
    if (!match) {
      // Not a transfer confirmation — still answer so Telegram clears any spinner.
      await answerCallbackQuery(callbackQueryId);
      res.sendStatus(200);
      return;
    }

    const transferId = match[1];
    const sb = getSupabaseClient();

    const { error } = await sb
      .from('transfers')
      .update({
        driver_confirmed: true,
        driver_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transferId);

    if (error) {
      logger.warn({ transferId, error: error.message }, 'telegram.webhook: failed to update driver_confirmed');
      await answerCallbackQuery(callbackQueryId, 'Something went wrong — please try again.');
      res.sendStatus(200);
      return;
    }

    logger.info({ transferId }, 'telegram.webhook: driver confirmed transfer');

    // Answer first so the loading spinner clears immediately; then update the keyboard.
    await answerCallbackQuery(callbackQueryId, 'Confirmed!');
    if (chatId && rawMessageId) {
      await editMessageReplyMarkup(chatId, String(rawMessageId), {
        inline_keyboard: [[{ text: '✅ Confirmed', callback_data: 'noop' }]],
      });
    }

    res.sendStatus(200);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'telegram.webhook: unhandled error',
    );
    if (callbackQueryId) await answerCallbackQuery(callbackQueryId);
    res.sendStatus(200);
  }
});

export { router as telegramWebhookRouter };
