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
 * One-time webhook registration (run manually after deploy):
 *   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
 *     -d "url=https://<render-backend>.onrender.com/api/public/telegram"
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
