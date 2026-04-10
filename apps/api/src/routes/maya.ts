import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  createMayaCheckout,
  verifyMayaWebhook,
  parseMayaWebhookPayload,
} from '../services/maya.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();

// POST /api/payments/maya/checkout
router.post('/checkout', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId, amountPHP, description } = req.body as {
      orderId?: string;
      amountPHP?: number;
      description?: string;
    };

    if (!orderId || amountPHP == null || amountPHP <= 0) {
      res.status(400).json({ error: 'orderId and a positive amountPHP are required' });
      return;
    }

    const centavos = Math.round(amountPHP * 100);
    const supabase = getSupabaseClient();

    const { data: order } = await supabase
      .from('orders')
      .select('id, booking_token, store_id')
      .eq('id', orderId)
      .single();

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const webUrl = process.env.WEB_URL ?? '';
    const token = (order as { booking_token?: string }).booking_token;
    const redirectBase = `${webUrl}/book/confirmation/${token}`;
    const redirectSuccess = redirectBase;
    const redirectFailure = `${redirectBase}?payment=failed`;
    const redirectCancel = `${redirectBase}?payment=cancelled`;

    const result = await createMayaCheckout({
      orderId,
      orderReference: token ?? orderId,
      amountInCentavos: centavos,
      description: description ?? "Lola's Rentals \u2013 Payment",
      redirectSuccess,
      redirectFailure,
      redirectCancel,
    });

    await supabase.from('maya_checkouts').insert({
      checkout_id: result.checkoutId,
      order_id: orderId,
      store_id: (order as { store_id?: string }).store_id,
      amount_php: amountPHP,
      status: 'pending',
      redirect_url: result.redirectUrl,
      created_by: req.user!.employeeId,
    });

    res.status(200).json({ checkoutId: result.checkoutId, redirectUrl: result.redirectUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/payments/maya/webhook  (no auth — Maya calls this directly)
router.post(
  '/webhook',
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req: Request, res: Response) => {
    const signature = req.headers['x-maya-signature'] as string | undefined;

    if (!signature) {
      res.status(400).json({ error: 'Missing signature' });
      return;
    }

    const rawBody = (req.body as Buffer).toString('utf8');

    const valid = verifyMayaWebhook(rawBody, signature);
    if (!valid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = parseMayaWebhookPayload(JSON.parse(rawBody));

    if (payload.status === 'PAYMENT_SUCCESS') {
      const supabase = getSupabaseClient();

      const { data: checkout } = await supabase
        .from('maya_checkouts')
        .select('*')
        .eq('checkout_id', payload.checkoutId)
        .single();

      const record = checkout as
        | { status: string; store_id: string; order_id: string; amount_php: number }
        | null;

      if (record && record.status !== 'paid') {
        await supabase
          .from('maya_checkouts')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('checkout_id', payload.checkoutId);

        const paymentId = `PAY-MAYA-${Date.now()}`;
        await supabase.from('payments').insert({
          id: paymentId,
          store_id: record.store_id,
          order_id: record.order_id,
          payment_type: 'card_maya',
          amount: record.amount_php,
          payment_method_id: 'Card',
          transaction_date: new Date().toISOString().split('T')[0],
          settlement_status: 'pending',
          settlement_ref: payload.checkoutId,
          created_at: new Date().toISOString(),
        });

        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount, payment_type')
          .eq('order_id', record.order_id);

        const { data: order } = await supabase
          .from('orders')
          .select('final_total, security_deposit')
          .eq('id', record.order_id)
          .single();

        const orderRow = order as { final_total: number; security_deposit: number } | null;
        const payments = allPayments as Array<{ amount: number; payment_type: string }> | null;

        if (orderRow && payments) {
          const totalPaid = payments
            .filter((p) => p.payment_type !== 'deposit')
            .reduce((sum, p) => sum + Number(p.amount), 0);
          const newBalance = Math.max(0, Number(orderRow.final_total) - totalPaid);
          await supabase
            .from('orders')
            .update({ balance_due: newBalance })
            .eq('id', record.order_id);
        }
      }
    }

    if (payload.status === 'PAYMENT_FAILED' || payload.status === 'PAYMENT_EXPIRED') {
      await getSupabaseClient()
        .from('maya_checkouts')
        .update({ status: payload.status.toLowerCase() })
        .eq('checkout_id', payload.checkoutId);
    }

    res.status(200).json({ received: true });
  },
);

export default router;
