import { Router, Request, Response } from 'express';
import { verifyUnsubscribeToken } from '../utils/unsubscribe-token.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const unsubscribeRouter = Router();

unsubscribeRouter.get('/', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;

  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  const customerId = verifyUnsubscribeToken(token);
  if (!customerId) {
    res.status(400).json({ error: 'Invalid or tampered token' });
    return;
  }

  const sb = getSupabaseClient();
  const { error } = await sb
    .from('customers')
    .update({ email_opt_out: true })
    .eq('id', customerId);

  if (error) {
    console.error('[unsubscribe] Failed to update customer:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  console.log(`[unsubscribe] Customer opted out: ${customerId}`);
  res.status(200).json({ success: true });
});

export { unsubscribeRouter };
