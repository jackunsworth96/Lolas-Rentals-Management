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
import { orderChargeLegs, resolveOrderChargeAccounts } from '../../lib/order-charge-legs.js';

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
  addonType: 'per_day' | 'one_time' | 'percentage';
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

  const addedTotal = input.addons.reduce((s, a) => s + a.totalAmount, 0);
  const accounts = totalDelta !== 0 || addedTotal > 0
    ? await resolveOrderChargeAccounts(order.storeId, input.receivableAccountId)
    : null;
  const legs: JournalLeg[] = accounts
    ? orderChargeLegs(order.id, totalDelta, accounts, `Order ${order.id} add-ons ${totalDelta > 0 ? 'added' : 'removed'}`)
    : [];

  // Record payment for new add-ons (immediate or pending)
  if (addedTotal > 0 && accounts) {
    const paymentAmount = Money.php(addedTotal);
    const isPending = !input.paymentMethodId || input.paymentMethodId === 'pending';
    const payment: Payment = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      rawOrderId: null,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'addon',
      amount: paymentAmount.toNumber(),
      paymentMethodId: isPending ? 'pending' : input.paymentMethodId!,
      transactionDate: formatManilaDate(),
      settlementStatus: (isPending || input.isCardPayment) ? 'pending' : null,
      settlementRef: input.settlementRef ?? null,
      customerId: order.customerId,
      accountId: isPending ? null : (input.isCardPayment ? null : (input.accountId ?? null)),
    };
    await paymentRepo.save(payment);

    if (!isPending && !input.isCardPayment && input.accountId) {
      legs.push(
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
          accountId: accounts.receivableAccountId,
          debit: Money.zero(),
          credit: paymentAmount,
          description: `Order ${order.id} addon receivable reduced`,
          referenceType: 'payment',
          referenceId: payment.id,
        },
      );
    }

    if (!isPending && input.isCardPayment) {
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

    if (!isPending) {
      // Recalculate balance from all payments
      const allPayments = await paymentRepo.findByOrderId(order.id);
      const totalPaid = allPayments.reduce(
        (sum, p) => sum.add(Money.php(p.amount)),
        Money.zero(),
      );
      order.applyPayments(totalPaid);
    }
    // When pending: adjustTotal already increased balanceDue correctly.
    // Do not call applyPayments — balance stays increased.
  }

  if (legs.length > 0) await accountingPort.createTransaction(legs, order.storeId);
  await orderRepo.save(order);

  const updatedAddons = await orderAddonRepo.findByOrderId(order.id);
  return {
    addons: updatedAddons,
    finalTotal: order.finalTotal.toNumber(),
    balanceDue: order.balanceDue.toNumber(),
  };
}
