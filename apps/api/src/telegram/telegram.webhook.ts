/**
 * Telegram webhook endpoint — receives callback_query events from inline buttons.
 *
 * This route must be public (no authentication) because requests come directly
 * from Telegram's servers.  Telegram retries on any non-2xx response, so we
 * always return 200, even when we cannot process the update.
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
  // Always respond 200 immediately so Telegram does not retry.
  res.sendStatus(200);

  let callbackQueryId = '';

  try {
    const body = req.body as Record<string, unknown>;
    const callbackQuery = body.callback_query as Record<string, unknown> | undefined;
    if (!callbackQuery) return;

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
      // Not a transfer confirmation — ignore silently.
      void answerCallbackQuery(callbackQueryId);
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
      // Still dismiss the spinner even on failure.
      void answerCallbackQuery(callbackQueryId, 'Something went wrong — please try again.');
      return;
    }

    logger.info({ transferId }, 'telegram.webhook: driver confirmed transfer');

    // Replace the Confirm button with a static "Confirmed" label so the driver
    // gets clear visual feedback and cannot accidentally tap it again.
    // message_id must be passed as an integer to the Telegram API.
    if (chatId && rawMessageId) {
      void editMessageReplyMarkup(chatId, String(rawMessageId), {
        inline_keyboard: [[{ text: '✅ Confirmed', callback_data: 'noop' }]],
      });
    }

    // Show a brief toast notification to the driver who tapped.
    void answerCallbackQuery(callbackQueryId, 'Confirmed!');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'telegram.webhook: unhandled error',
    );
    // Always answer the callback query so Telegram clears the loading spinner,
    // even when an unexpected error occurs.
    if (callbackQueryId) void answerCallbackQuery(callbackQueryId);
  }
});

export { router as telegramWebhookRouter };
