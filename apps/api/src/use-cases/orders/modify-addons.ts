import {
  type OrderRepository,
  type OrderAddonRepository,
  type OrderAddonRecord,
  type PaymentRepository,
  type Payment,
  type AccountingPort,
  type CardSettlementRepository,
  type CardSettlement,
  type JournalLeg,
  Money,
} from '@lolas/domain';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface ModifyAddonsDeps {
  orderRepo: OrderRepository;
  orderAddonRepo: OrderAddonRepository;
  paymentRepo: PaymentRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
}

export interface AddonAddInput {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
}

export interface ModifyAddonsInput {
  orderId: string;
  addons: AddonAddInput[];
  removedAddonIds: string[];
  paymentMethodId?: string | null;
  accountId?: string | null;
  receivableAccountId?: string;
  isCardPayment?: boolean;
  settlementRef?: string | null;
}

export async function modifyAddons(
  deps: ModifyAddonsDeps,
  input: ModifyAddonsInput,
) {
  const { orderRepo, orderAddonRepo, paymentRepo, accountingPort } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const existingAddons = await orderAddonRepo.findByOrderId(order.id);
  let totalDelta = 0;

  // Remove add-ons
  for (const removeId of input.removedAddonIds) {
    const existing = existingAddons.find((a) => a.id === removeId);
    if (existing) {
      totalDelta -= existing.totalAmount;
      await orderAddonRepo.deleteById(removeId);
    }
  }

  // Add new add-ons
  const newRecords: OrderAddonRecord[] = [];
  for (const addon of input.addons) {
    const record: OrderAddonRecord = {
      id: crypto.randomUUID(),
      orderId: order.id,
      addonName: addon.addonName,
      addonPrice: addon.addonPrice,
      addonType: addon.addonType,
      quantity: addon.quantity,
      totalAmount: addon.totalAmount,
      mutualExclusivityGroup: null,
    };
    await orderAddonRepo.save(record, order.storeId);
    newRecords.push(record);
    totalDelta += addon.totalAmount;
  }

  // Adjust order totals
  if (totalDelta !== 0) {
    order.adjustTotal(Money.php(totalDelta));
  }

  // If new add-ons were added and a payment method is provided, collect payment
  const addedTotal = input.addons.reduce((s, a) => s + a.totalAmount, 0);
  if (addedTotal > 0 && input.paymentMethodId && input.receivableAccountId) {
    const paymentAmount = Money.php(addedTotal);
    const payment: Payment = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      rawOrderId: null,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'addon',
      amount: paymentAmount.toNumber(),
      paymentMethodId: input.paymentMethodId,
      transactionDate: formatManilaDate(),
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
          description: `Order ${order.id} addon payment received`,
          referenceType: 'payment',
          referenceId: payment.id,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: input.receivableAccountId,
          debit: Money.zero(),
          credit: paymentAmount,
          description: `Order ${order.id} addon receivable reduced`,
          referenceType: 'payment',
          referenceId: payment.id,
        },
      ];
      await accountingPort.createTransaction(legs, order.storeId);
    }

    if (input.isCardPayment) {
      const settlement: CardSettlement = {
        id: crypto.randomUUID(),
        storeId: order.storeId,
        orderId: order.id,
        customerId: order.customerId,
        paymentId: payment.id,
        name: null,
        amount: paymentAmount.toNumber(),
        refNumber: input.settlementRef ?? null,
        transactionDate: formatManilaDate(),
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

    // Recalculate balance from all payments
    const allPayments = await paymentRepo.findByOrderId(order.id);
    const totalPaid = allPayments.reduce(
      (sum, p) => sum.add(Money.php(p.amount)),
      Money.zero(),
    );
    order.applyPayments(totalPaid);
  }

  await orderRepo.save(order);

  const updatedAddons = await orderAddonRepo.findByOrderId(order.id);
  return {
    addons: updatedAddons,
    finalTotal: order.finalTotal.toNumber(),
    balanceDue: order.balanceDue.toNumber(),
  };
}
