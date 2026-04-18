import {
  type OrderRepository,
  type PaymentRepository,
  type Payment,
  type AccountingPort,
  type CardSettlementRepository,
  type CardSettlement,
  type JournalLeg,
  Money,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

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

export interface CollectPaymentDeps {
  orderRepo: OrderRepository;
  paymentRepo: PaymentRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
}

export interface CollectPaymentInput {
  orderId: string;
  amount: number;
  paymentMethodId: string;
  accountId?: string | null;
  paymentType: string;
  transactionDate: string;
  receivableAccountId: string;
  isCardPayment?: boolean;
  settlementRef?: string | null;
}

export async function collectPayment(
  deps: CollectPaymentDeps,
  input: CollectPaymentInput,
) {
  const { orderRepo, paymentRepo } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const paymentAmount = Money.php(input.amount);
  const paymentId = crypto.randomUUID();

  const payment: Payment = {
    id: paymentId,
    storeId: order.storeId,
    orderId: order.id,
    rawOrderId: null,
    orderItemId: null,
    orderAddonId: null,
    paymentType: input.paymentType,
    amount: paymentAmount.toNumber(),
    paymentMethodId: input.paymentMethodId,
    transactionDate: input.transactionDate,
    settlementStatus: input.isCardPayment ? 'pending' : null,
    settlementRef: input.settlementRef ?? null,
    customerId: order.customerId,
    accountId: input.isCardPayment ? null : (input.accountId ?? null),
  };

  // Build journal legs before the RPC call.  Only non-card payments
  // with a cash/bank account produce accounting entries; card payments
  // go through the settlements pipeline instead.
  const legs: JournalLeg[] = [];
  if (!input.isCardPayment && input.accountId) {
    legs.push(
      {
        entryId: crypto.randomUUID(),
        accountId: input.accountId,
        debit: paymentAmount,
        credit: Money.zero(),
        description: `Order ${order.id} payment received`,
        referenceType: 'payment',
        referenceId: paymentId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: paymentAmount,
        description: `Order ${order.id} receivable reduced`,
        referenceType: 'payment',
        referenceId: paymentId,
      },
    );
  }

  const journalTransactionId = legs.length > 0 ? crypto.randomUUID() : '';
  const journalDate = input.transactionDate;
  const journalPeriod = journalDate.slice(0, 7);

  // Single atomic RPC: payment row + journal legs in one DB transaction.
  const { error: rpcErr } = await supabase.rpc('collect_payment_atomic', {
    p_payment_id:             paymentId,
    p_order_id:               order.id,
    p_store_id:               order.storeId,
    p_amount:                 paymentAmount.toNumber(),
    p_payment_method_id:      input.paymentMethodId,
    p_account_id:             payment.accountId,
    p_transaction_date:       input.transactionDate,
    p_customer_id:            order.customerId,
    p_payment_type:           input.paymentType,
    p_journal_transaction_id: journalTransactionId,
    p_journal_period:         journalPeriod,
    p_journal_date:           journalDate,
    p_journal_legs:           legs.map(serialiseLeg),
    p_notes:                  null,
  });
  if (rpcErr) throw new Error(`collect_payment_atomic RPC failed: ${rpcErr.message}`);

  if (input.isCardPayment) {
    const settlement: CardSettlement = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      customerId: order.customerId,
      paymentId,
      name: null,
      amount: paymentAmount.toNumber(),
      refNumber: input.settlementRef ?? null,
      transactionDate: input.transactionDate,
      forecastedDate: null,
      isPaid: false,
      dateSettled: null,
      settlementRef: null,
      netAmount: null,
      feeExpense: null,
      accountId: null,
      batchNo: null,
      createdAt: new Date(),
    };
    await deps.cardSettlementRepo.save(settlement);
  }

  const allPayments = await paymentRepo.findByOrderId(order.id);
  const totalPaid = allPayments.reduce(
    (sum, p) => sum.add(Money.php(p.amount)),
    Money.zero(),
  );

  order.applyPayments(totalPaid);
  await orderRepo.save(order);

  return { payment, balanceDue: order.balanceDue };
}
