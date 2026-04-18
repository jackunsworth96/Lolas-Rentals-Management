import {
  type OrderRepository,
  type OrderItemRepository,
  type PaymentRepository,
  type Payment,
  type FleetRepository,
  type AccountingPort,
  type CardSettlementRepository,
  type CardSettlement,
  type JournalLeg,
  Money,
  calculateRefundableDeposit,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface SettleOrderDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  paymentRepo: PaymentRepository;
  fleetRepo: FleetRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
}

export interface SettleOrderInput {
  orderId: string;
  settlementDate: string;
  depositLiabilityAccountId: string;
  receivableAccountId: string;
  refundAccountId: string;
  finalPaymentMethodId?: string | null;
  finalPaymentAccountId?: string | null;
  finalPaymentAmount?: number;
  isCardPayment?: boolean;
  settlementRef?: string | null;
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

export async function settleOrder(
  deps: SettleOrderDeps,
  input: SettleOrderInput,
) {
  const { orderRepo, orderItemRepo, paymentRepo } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const [payments, orderItems] = await Promise.all([
    paymentRepo.findByOrderId(order.id),
    orderItemRepo.findByOrderId(order.id),
  ]);

  const totalPayments = payments.reduce(
    (sum, p) => sum.add(Money.php(p.amount)),
    Money.zero(),
  );

  const balanceBeforeDeposit = order.calculateBalanceDue(totalPayments);
  const { amountApplied, refund } = calculateRefundableDeposit(
    order.securityDeposit,
    balanceBeforeDeposit,
  );

  const balanceAfterDeposit = balanceBeforeDeposit.subtract(amountApplied);

  // All side effects are collected here and posted by the
  // settle_order_atomic RPC in a single DB transaction.
  const legs: JournalLeg[] = [];
  let finalPayment: Payment | null = null;
  let cardSettlement: CardSettlement | null = null;

  // ── Final payment (optional) ─────────────────────────────
  if (
    balanceAfterDeposit.isPositive() &&
    input.finalPaymentMethodId &&
    input.finalPaymentAmount &&
    input.finalPaymentAmount > 0
  ) {
    const paymentAmount = Money.php(input.finalPaymentAmount);
    finalPayment = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      rawOrderId: null,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'settlement',
      amount: paymentAmount.toNumber(),
      paymentMethodId: input.finalPaymentMethodId,
      transactionDate: input.settlementDate,
      settlementStatus: input.isCardPayment ? 'pending' : null,
      settlementRef: input.settlementRef ?? null,
      customerId: order.customerId,
      accountId: input.isCardPayment ? null : (input.finalPaymentAccountId ?? null),
    };

    if (!input.isCardPayment && input.finalPaymentAccountId) {
      legs.push(
        {
          entryId: crypto.randomUUID(),
          accountId: input.finalPaymentAccountId,
          debit: paymentAmount,
          credit: Money.zero(),
          description: `Order ${order.id} final settlement payment`,
          referenceType: 'payment',
          referenceId: finalPayment.id,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: input.receivableAccountId,
          debit: Money.zero(),
          credit: paymentAmount,
          description: `Order ${order.id} settlement receivable reduced`,
          referenceType: 'payment',
          referenceId: finalPayment.id,
        },
      );
    }

    if (input.isCardPayment) {
      cardSettlement = {
        id: crypto.randomUUID(),
        storeId: order.storeId,
        orderId: order.id,
        customerId: order.customerId,
        paymentId: finalPayment.id,
        name: null,
        amount: paymentAmount.toNumber(),
        refNumber: input.settlementRef ?? null,
        transactionDate: input.settlementDate,
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
    }
  }

  // ── Deposit-applied legs ─────────────────────────────────
  if (amountApplied.isPositive()) {
    legs.push(
      {
        entryId: crypto.randomUUID(),
        accountId: input.depositLiabilityAccountId,
        debit: amountApplied,
        credit: Money.zero(),
        description: `Order ${order.id} deposit applied to balance`,
        referenceType: 'deposit',
        referenceId: order.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: amountApplied,
        description: `Order ${order.id} deposit applied to receivable`,
        referenceType: 'deposit',
        referenceId: order.id,
      },
    );
  }

  // ── Deposit-refund legs ──────────────────────────────────
  if (refund.isPositive()) {
    legs.push(
      {
        entryId: crypto.randomUUID(),
        accountId: input.depositLiabilityAccountId,
        debit: refund,
        credit: Money.zero(),
        description: `Order ${order.id} deposit refund`,
        referenceType: 'refund',
        referenceId: order.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.refundAccountId,
        debit: Money.zero(),
        credit: refund,
        description: `Order ${order.id} deposit refund to customer`,
        referenceType: 'refund',
        referenceId: order.id,
      },
    );
  }

  // Compute the post-settlement balance locally so we can
  // stamp it on orders.balance_due inside the same RPC call.
  const paymentsAfter = finalPayment
    ? totalPayments.add(Money.php(finalPayment.amount))
    : totalPayments;
  const finalBalanceDue = order.finalTotal.subtract(paymentsAfter);

  const fleetReleases = orderItems.map((item) => ({
    vehicle_id: item.vehicleId,
  }));

  const journalTransactionId =
    legs.length > 0 ? crypto.randomUUID() : '';
  const journalDate = formatManilaDate();
  const journalPeriod = journalDate.slice(0, 7);

  const { error: rpcErr } = await supabase.rpc('settle_order_atomic', {
    p_order_id: order.id,
    p_store_id: order.storeId,
    p_settled_at: new Date().toISOString(),
    p_final_balance_due: finalBalanceDue.toNumber(),
    p_final_payment: finalPayment
      ? {
          id: finalPayment.id,
          amount: finalPayment.amount,
          payment_type: finalPayment.paymentType,
          payment_method_id: finalPayment.paymentMethodId,
          transaction_date: finalPayment.transactionDate,
          settlement_status: finalPayment.settlementStatus,
          settlement_ref: finalPayment.settlementRef,
          customer_id: finalPayment.customerId,
          account_id: finalPayment.accountId,
        }
      : null,
    p_card_settlement: cardSettlement
      ? {
          store_id: cardSettlement.storeId,
          customer_id: cardSettlement.customerId,
          name: cardSettlement.name,
          amount: cardSettlement.amount,
          ref_number: cardSettlement.refNumber,
          raw_date: cardSettlement.transactionDate,
          forecasted_date: cardSettlement.forecastedDate,
          is_paid: cardSettlement.isPaid,
          date_settled: cardSettlement.dateSettled,
          settlement_ref: cardSettlement.settlementRef,
          net_amount: cardSettlement.netAmount,
          fee_expense: cardSettlement.feeExpense,
          account_id: cardSettlement.accountId,
          batch_no: cardSettlement.batchNo,
        }
      : null,
    p_fleet_releases: fleetReleases,
    p_journal_transaction_id: journalTransactionId,
    p_journal_period: journalPeriod,
    p_journal_date: journalDate,
    p_journal_legs: legs.map(serialiseLeg),
  });

  if (rpcErr) {
    throw new Error(`settle_order_atomic RPC failed: ${rpcErr.message}`);
  }

  // Reload the order so we return a fresh domain object that
  // reflects the status/balance the RPC just persisted.
  const reloaded = await orderRepo.findById(order.id);
  if (!reloaded) {
    throw new Error(
      `settle_order_atomic succeeded but order ${order.id} could not be reloaded`,
    );
  }

  return {
    order: reloaded,
    balanceBeforeDeposit: balanceBeforeDeposit.toNumber(),
    depositApplied: amountApplied.toNumber(),
    depositRefund: refund.toNumber(),
    balanceAfterDeposit: balanceAfterDeposit.toNumber(),
    finalPaymentCollected: finalPayment?.amount ?? 0,
    finalBalanceDue: finalBalanceDue.toNumber(),
  };
}
