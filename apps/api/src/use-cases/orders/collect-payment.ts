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
  const { orderRepo, paymentRepo, accountingPort } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const paymentAmount = Money.php(input.amount);

  const payment: Payment = {
    id: crypto.randomUUID(),
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

  await paymentRepo.save(payment);

  if (!input.isCardPayment && input.accountId) {
    const legs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.accountId,
        debit: paymentAmount,
        credit: Money.zero(),
        description: `Order ${order.id} payment received`,
        referenceType: 'payment',
        referenceId: payment.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: paymentAmount,
        description: `Order ${order.id} receivable reduced`,
        referenceType: 'payment',
        referenceId: payment.id,
      },
    ];
    await accountingPort.createTransaction(legs, order.storeId);
  }

  if (input.isCardPayment) {
    const txDate = input.transactionDate;
    const settlement: CardSettlement = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      customerId: order.customerId,
      paymentId: payment.id,
      name: null,
      amount: paymentAmount.toNumber(),
      refNumber: input.settlementRef ?? null,
      transactionDate: txDate,
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
