import {
  type OrderRepository,
  type JournalLeg,
  Money,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';

export interface RefundOrderDeps {
  orderRepo: OrderRepository;
}

export interface RefundOrderInput {
  orderId: string;
  /** Amount in PHP to refund. Must be positive. */
  amount: number;
  /** Payment method used to return the money (e.g. Cash, GCash). */
  refundMethodId: string;
  /** Asset account (cash/bank) that the refund is paid out from. */
  refundAccountId: string;
  /** A/R or income account to debit — reverses the income previously recognised. */
  receivableAccountId: string;
  /** Optional free-text reason shown in the payments list and journal description. */
  reason?: string | null;
  /** When true, the order is set to 'cancelled' in the same operation. */
  cancelOrder?: boolean;
  transactionDate: string;
}

function serialiseLeg(leg: JournalLeg): Record<string, unknown> {
  return {
    id: leg.entryId,
    account_id: leg.accountId,
    debit: leg.debit.toNumber(),
    credit: leg.credit.toNumber(),
    description: leg.description,
    reference_type: leg.referenceType,
    reference_id: leg.referenceId,
  };
}

export async function refundOrder(
  deps: RefundOrderDeps,
  input: RefundOrderInput,
) {
  const { orderRepo } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const refundAmount = Money.php(input.amount);
  const paymentId = crypto.randomUUID();

  const description = input.reason?.trim()
    ? `Order ${order.id} refund — ${input.reason.trim()}`
    : `Order ${order.id} refund`;

  // Journal for a refund is the mirror-image of a payment collection:
  //   • Debit receivable / income account  → reverses the income we recognised
  //   • Credit cash / bank account         → records the cash going back to customer
  const legs: JournalLeg[] = [
    {
      entryId: crypto.randomUUID(),
      accountId: input.receivableAccountId,
      debit: refundAmount,
      credit: Money.zero(),
      description,
      referenceType: 'refund',
      referenceId: paymentId,
    },
    {
      entryId: crypto.randomUUID(),
      accountId: input.refundAccountId,
      debit: Money.zero(),
      credit: refundAmount,
      description: `${description} — cash out`,
      referenceType: 'refund',
      referenceId: paymentId,
    },
  ];

  const journalTransactionId = crypto.randomUUID();
  const journalDate = input.transactionDate;
  const journalPeriod = journalDate.slice(0, 7);

  const { error: rpcErr } = await supabase.rpc('collect_payment_atomic', {
    p_payment_id: paymentId,
    p_order_id: order.id,
    p_store_id: order.storeId,
    p_amount: refundAmount.toNumber(),
    p_payment_method_id: input.refundMethodId,
    p_account_id: input.refundAccountId,
    p_transaction_date: input.transactionDate,
    p_customer_id: order.customerId,
    p_payment_type: 'refund',
    p_journal_transaction_id: journalTransactionId,
    p_journal_period: journalPeriod,
    p_journal_date: journalDate,
    p_journal_legs: legs.map(serialiseLeg),
    p_notes: input.reason?.trim() ?? null,
  });

  if (rpcErr) throw new Error(`collect_payment_atomic RPC failed: ${rpcErr.message}`);

  if (input.cancelOrder) {
    const { error: cancelErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id);
    if (cancelErr) throw new Error(`Failed to cancel order: ${cancelErr.message}`);
  }

  return {
    paymentId,
    refundAmount: refundAmount.toNumber(),
    cancelled: input.cancelOrder ?? false,
  };
}
