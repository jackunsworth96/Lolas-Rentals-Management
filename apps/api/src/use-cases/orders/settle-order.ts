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

export async function settleOrder(
  deps: SettleOrderDeps,
  input: SettleOrderInput,
) {
  const { orderRepo, orderItemRepo, paymentRepo, fleetRepo, accountingPort } = deps;

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

  // Collect final payment if there's a remaining balance and payment info provided
  let finalPayment: Payment | null = null;
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
    await paymentRepo.save(finalPayment);

    if (!input.isCardPayment && input.finalPaymentAccountId) {
      const paymentLegs: JournalLeg[] = [
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
      ];
      await accountingPort.createTransaction(paymentLegs, order.storeId);
    }

    if (input.isCardPayment) {
      const settlement: CardSettlement = {
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
      await deps.cardSettlementRepo.save(settlement);
    }
  }

  // Transition order to completed
  order.settle();

  // Deposit journal entries
  const legs: JournalLeg[] = [];

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

  if (legs.length > 0) {
    await accountingPort.createTransaction(legs, order.storeId);
  }

  // Release all vehicles back to available
  await Promise.all(
    orderItems.map((item) =>
      fleetRepo.updateStatus(item.vehicleId, 'Available'),
    ),
  );

  // Recalculate final balance
  const allPayments = await paymentRepo.findByOrderId(order.id);
  const finalTotalPaid = allPayments.reduce(
    (sum, p) => sum.add(Money.php(p.amount)),
    Money.zero(),
  );
  order.applyPayments(finalTotalPaid);
  await orderRepo.save(order);

  return {
    order,
    balanceBeforeDeposit: balanceBeforeDeposit.toNumber(),
    depositApplied: amountApplied.toNumber(),
    depositRefund: refund.toNumber(),
    balanceAfterDeposit: balanceAfterDeposit.toNumber(),
    finalPaymentCollected: finalPayment?.amount ?? 0,
    finalBalanceDue: order.balanceDue.toNumber(),
  };
}
