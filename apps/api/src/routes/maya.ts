import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger.js';
import { Money, type JournalLeg } from '@lolas/domain';
import { authenticate } from '../middleware/authenticate.js';
import {
  createMayaCheckout,
  verifyMayaWebhook,
  parseMayaWebhookPayload,
} from '../services/maya.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

const router = Router();

// POST /api/payments/maya/checkout
router.post(
  '/checkout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
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

      // Resolve the booking target. Direct bookings live in orders_raw
      // until staff activate them; walk-ins and re-payments live in
      // orders. We accept either and route the checkout accordingly.
      const { data: order } = await supabase
        .from('orders')
        .select('id, booking_token, store_id')
        .eq('id', orderId)
        .single();

      const orderRow = order as
        | { id: string; booking_token?: string; store_id?: string }
        | null;

      let rawOrderRow:
        | { id: string; order_reference: string; store_id: string }
        | null = null;

      if (!orderRow) {
        const { data: rawOrder } = await supabase
          .from('orders_raw')
          .select('id, order_reference, store_id')
          .eq('id', orderId)
          .single();
        rawOrderRow = rawOrder as
          | { id: string; order_reference: string; store_id: string }
          | null;
      }

      if (!orderRow && !rawOrderRow) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const webUrl = process.env.WEB_URL ?? '';
      const token = orderRow?.booking_token ?? rawOrderRow?.order_reference;
      const storeId = orderRow?.store_id ?? rawOrderRow?.store_id;
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
        order_id: orderRow ? orderRow.id : null,
        raw_order_id: rawOrderRow ? rawOrderRow.id : null,
        store_id: storeId,
        amount_php: amountPHP,
        status: 'pending',
        redirect_url: result.redirectUrl,
        created_by: req.user!.employeeId,
      });

      res.status(200).json({ checkoutId: result.checkoutId, redirectUrl: result.redirectUrl });
    } catch (err: unknown) {
      logger.error({ err }, 'Maya checkout error');
      next(err);
    }
  },
);

// POST /api/payments/maya/webhook  (no auth — Maya calls this directly)
router.post(
  '/webhook',
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req: Request, res: Response) => {
    const signature = req.headers['x-maya-signature'] as string | undefined;

    if (!signature) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_SIGNATURE', message: 'Missing signature' },
      });
      return;
    }

    const rawBody = (req.body as Buffer).toString('utf8');

    const valid = verifyMayaWebhook(rawBody, signature);
    if (!valid) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' },
      });
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
        | {
            status: string;
            store_id: string;
            order_id: string | null;
            raw_order_id: string | null;
            amount_php: number;
          }
        | null;

      if (!record) {
        // Unknown checkout — can't reconcile. Return 200 so Maya stops
        // retrying, but surface the anomaly in the logs.
        logger.error({ checkoutId: payload.checkoutId }, '[maya-webhook] checkout not found');
        res.status(200).json({ received: true });
        return;
      }

      if (record.status !== 'paid') {
        // Amount parity: webhook payload must match stored checkout exactly.
        if (
          payload.totalAmount.currency !== 'PHP' ||
          Number(payload.totalAmount.value) !== Number(record.amount_php)
        ) {
          res.status(400).json({
            success: false,
            error: {
              code: 'AMOUNT_MISMATCH',
              message: 'Webhook amount does not match stored checkout',
            },
          });
          return;
        }

        // Resolve the target booking: canonical orders first, then
        // orders_raw fallback for pre-activation payments (AC-08).
        let order: { final_total: number; security_deposit: number } | null = null;
        if (record.order_id) {
          const { data } = await supabase
            .from('orders')
            .select('final_total, security_deposit')
            .eq('id', record.order_id)
            .single();
          order = data as { final_total: number; security_deposit: number } | null;
        }

        let rawOrder: { id: string; status: string } | null = null;
        if (!order && record.raw_order_id) {
          const { data } = await supabase
            .from('orders_raw')
            .select('id, status')
            .eq('id', record.raw_order_id)
            .single();
          rawOrder = data as { id: string; status: string } | null;
        }

        if (!order && !rawOrder) {
          // Neither an activated order nor a raw order exists for this
          // checkout. Log and ack — Maya needs a 200 to stop retrying.
          logger.error(
            { checkoutId: payload.checkoutId, orderId: record.order_id, rawOrderId: record.raw_order_id },
            '[maya-webhook] no order or orders_raw row for checkout',
          );
          res.status(200).json({ received: true });
          return;
        }

        await supabase
          .from('maya_checkouts')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('checkout_id', payload.checkoutId);

        const paymentId = `PAY-MAYA-${Date.now()}`;

        if (order && record.order_id) {
          // ── Activated-order path: existing behaviour ──────────────
          await supabase.from('payments').insert({
            id: paymentId,
            store_id: record.store_id,
            order_id: record.order_id,
            payment_type: 'card_maya',
            amount: record.amount_php,
            payment_method_id: 'Card',
            transaction_date: formatManilaDate(),
            settlement_status: 'pending',
            settlement_ref: payload.checkoutId,
            created_at: new Date().toISOString(),
          });

          const { data: allPayments } = await supabase
            .from('payments')
            .select('amount, payment_type')
            .eq('order_id', record.order_id);

          const payments = allPayments as Array<{ amount: number; payment_type: string }> | null;

          if (payments) {
            const totalPaid = payments
              .filter((p) => p.payment_type !== 'deposit')
              .reduce((sum, p) => sum + Number(p.amount), 0);
            const newBalance = Math.max(0, Number(order.final_total) - totalPaid);
            await supabase
              .from('orders')
              .update({ balance_due: newBalance })
              .eq('id', record.order_id);
          }

          // AC-01: post a balanced journal entry — DR Maya/card clearing, CR Receivable.
          const { data: acctData, error: acctErr } = await supabase
            .from('chart_of_accounts')
            .select('id, name, account_type')
            .in('store_id', [record.store_id, 'company'])
            .eq('is_active', true);
          if (acctErr) {
            throw new Error(`Maya webhook account lookup failed: ${acctErr.message}`);
          }
          const accounts = (acctData ?? []) as Array<{
            id: string;
            name: string;
            account_type: string;
          }>;

          const clearingAccount =
            accounts.find(
              (a) =>
                a.account_type === 'Asset' &&
                (a.name.toLowerCase().includes('maya') ||
                  a.name.toLowerCase().includes('card')),
            ) ??
            accounts.find(
              (a) => a.account_type === 'Asset' && a.name.toLowerCase().includes('bank'),
            );

          const receivableAccount = accounts.find(
            (a) => a.account_type === 'Asset' && a.name.toLowerCase().includes('receivable'),
          );

          if (!clearingAccount) {
            throw new Error(
              'Maya webhook: no Maya/card/bank clearing asset account found in chart_of_accounts',
            );
          }
          if (!receivableAccount) {
            throw new Error(
              'Maya webhook: no receivable asset account found in chart_of_accounts',
            );
          }

          const amount = Money.php(Number(record.amount_php));
          const description = `Order ${record.order_id} Maya payment ${payload.checkoutId}`;
          const legs: JournalLeg[] = [
            {
              entryId: crypto.randomUUID(),
              accountId: clearingAccount.id,
              debit: amount,
              credit: Money.zero(),
              description,
              referenceType: 'payment',
              referenceId: paymentId,
            },
            {
              entryId: crypto.randomUUID(),
              accountId: receivableAccount.id,
              debit: Money.zero(),
              credit: amount,
              description,
              referenceType: 'payment',
              referenceId: paymentId,
            },
          ];

          await req.app.locals.deps.accountingPort.createTransaction(legs, record.store_id);
        } else if (rawOrder) {
          // ── Pre-activation path (AC-08) ───────────────────────────
          // The raw booking hasn't been activated yet. Record the
          // payment against orders_raw and mark the checkout paid.
          // Do NOT post a journal entry: journal posting happens in
          // process_raw_order_atomic when staff activate the booking.
          if (rawOrder.status !== 'unprocessed') {
            logger.error(
              { checkoutId: payload.checkoutId, rawOrderId: rawOrder.id, rawOrderStatus: rawOrder.status },
              '[maya-webhook] raw order not in unprocessed state',
            );
            res.status(200).json({ received: true });
            return;
          }

          await supabase.from('payments').insert({
            id: paymentId,
            store_id: record.store_id,
            order_id: null,
            raw_order_id: rawOrder.id,
            payment_type: 'card_maya',
            amount: record.amount_php,
            payment_method_id: 'Card',
            transaction_date: formatManilaDate(),
            settlement_status: 'pending',
            settlement_ref: payload.checkoutId,
            created_at: new Date().toISOString(),
          });
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
