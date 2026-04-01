import {
  type OrderRepository,
  type OrderItemRepository,
  type OrderAddonRepository,
  type OrderAddonRecord,
  type FleetRepository,
  type CustomerRepository,
  type PaymentRepository,
  type Payment,
  type AccountingPort,
  type CardSettlementRepository,
  type CardSettlement,
  type JournalLeg,
  type Customer,
  Order as OrderEntity,
  OrderStatus,
  Money,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';
import { activateOrder, type VehicleAssignment } from './activate-order.js';

function extractWooOrderId(payload: Record<string, unknown>): string | null {
  for (const key of ['number', 'id', 'order_key']) {
    const val = payload[key];
    if (val !== undefined && val !== null && val !== '') return String(val);
  }
  return null;
}

export interface ProcessRawOrderDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  orderAddonRepo: OrderAddonRepository;
  fleetRepo: FleetRepository;
  customerRepo: CustomerRepository;
  paymentRepo: PaymentRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
}

export interface ProcessRawOrderInput {
  rawOrderId: string;
  storeId: string;
  employeeId: string;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  vehicleAssignments: VehicleAssignment[];
  addons: OrderAddonRecord[];
  securityDeposit: number;
  webQuoteRaw: number | null;
  webNotes: string | null;
  receivableAccountId: string;
  incomeAccountId: string;
  paymentMethodId: string | null;
  depositMethodId: string | null;
  cardFeeSurcharge: number;
  paymentAccountId?: string | null;
  depositLiabilityAccountId?: string | null;
  isCardPayment?: boolean;
  settlementRef?: string | null;
}

export async function processRawOrder(
  deps: ProcessRawOrderDeps,
  input: ProcessRawOrderInput,
) {
  const { data: rawOrder, error: rawErr } = await supabase
    .from('orders_raw')
    .select('*')
    .eq('id', input.rawOrderId)
    .single();

  if (rawErr || !rawOrder) {
    throw new Error(`Raw order ${input.rawOrderId} not found`);
  }

  if (rawOrder.status !== 'unprocessed') {
    throw new Error(`Raw order ${input.rawOrderId} is already ${rawOrder.status}`);
  }

  let customer: Customer | null = null;
  if (input.customer.email) {
    customer = await deps.customerRepo.findByEmail(input.customer.email);
  }
  if (!customer && input.customer.phone) {
    customer = await deps.customerRepo.findByMobile(input.customer.phone);
  }

  if (!customer) {
    customer = {
      id: crypto.randomUUID(),
      storeId: input.storeId,
      name: input.customer.name,
      email: input.customer.email,
      mobile: input.customer.phone,
      totalSpent: 0,
      notes: null,
      blacklisted: false,
    };
    await deps.customerRepo.save(customer);
  }

  const wooOrderId = extractWooOrderId((rawOrder.payload ?? {}) as Record<string, unknown>);
  const orderId = crypto.randomUUID();
  const rentalTotal = input.vehicleAssignments.reduce((sum, v) => {
    const days = v.rentalDaysCount || 1;
    return sum + (v.rentalRate * days) + v.pickupFee + v.dropoffFee - v.discount;
  }, 0);
  const addonTotal = input.addons.reduce((sum, a) => sum + a.totalAmount, 0);
  const finalTotal = rentalTotal + addonTotal;

  const order = OrderEntity.create({
    id: orderId,
    storeId: input.storeId,
    wooOrderId,
    customerId: customer.id,
    employeeId: null,
    orderDate: new Date().toISOString().slice(0, 10),
    status: OrderStatus.Unprocessed,
    webNotes: input.webNotes,
    quantity: input.vehicleAssignments.length,
    webQuoteRaw: input.webQuoteRaw,
    securityDeposit: Money.php(input.securityDeposit),
    depositStatus: null,
    cardFeeSurcharge: Money.php(input.cardFeeSurcharge),
    returnCharges: Money.zero(),
    finalTotal: Money.php(finalTotal + input.cardFeeSurcharge),
    balanceDue: Money.php(finalTotal + input.cardFeeSurcharge),
    paymentMethodId: input.paymentMethodId,
    depositMethodId: input.depositMethodId,
    bookingToken: null,
    tips: Money.zero(),
    charityDonation: Money.php(Number(rawOrder.charity_donation ?? 0)),
    addons: input.addons.map((a) => ({
      addonName: a.addonName,
      addonPrice: a.addonPrice,
      addonType: a.addonType,
      quantity: a.quantity,
      totalAmount: a.totalAmount,
      mutualExclusivityGroup: a.mutualExclusivityGroup ?? undefined,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await deps.orderRepo.save(order);

  const assignments: VehicleAssignment[] = input.vehicleAssignments.map((v) => ({
    ...v,
    id: v.id || crypto.randomUUID(),
  }));

  const activated = await activateOrder(
    {
      orderRepo: deps.orderRepo,
      fleetRepo: deps.fleetRepo,
    },
    {
      orderId,
      employeeId: input.employeeId,
      vehicleAssignments: assignments,
      addons: input.addons,
      receivableAccountId: input.receivableAccountId,
      incomeAccountId: input.incomeAccountId,
    },
  );

  await deps.paymentRepo.linkToOrder(input.rawOrderId, orderId);

  const txnDate = new Date().toISOString().slice(0, 10);
  const rentalAmount = finalTotal + input.cardFeeSurcharge;

  if (input.paymentMethodId && input.paymentAccountId && input.receivableAccountId) {
    const rentalPayment: Payment = {
      id: crypto.randomUUID(),
      storeId: input.storeId,
      orderId,
      rawOrderId: input.rawOrderId,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'rental',
      amount: rentalAmount,
      paymentMethodId: input.paymentMethodId,
      transactionDate: txnDate,
      settlementStatus: input.isCardPayment ? 'pending' : null,
      settlementRef: input.settlementRef ?? null,
      customerId: customer.id,
      accountId: input.isCardPayment ? null : input.paymentAccountId,
    };
    await deps.paymentRepo.save(rentalPayment);

    if (input.isCardPayment) {
      const settlement: CardSettlement = {
        id: crypto.randomUUID(),
        storeId: input.storeId,
        orderId,
        customerId: customer.id,
        paymentId: rentalPayment.id,
        name: customer.name,
        amount: rentalAmount,
        refNumber: input.settlementRef ?? null,
        transactionDate: txnDate,
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

    const legs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.paymentAccountId,
        debit: Money.php(rentalAmount),
        credit: Money.zero(),
        description: `Order ${orderId} rental payment received`,
        referenceType: 'payment',
        referenceId: rentalPayment.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: Money.php(rentalAmount),
        description: `Order ${orderId} receivable reduced`,
        referenceType: 'payment',
        referenceId: rentalPayment.id,
      },
    ];
    await deps.accountingPort.createTransaction(legs, input.storeId);
  }

  if (
    input.securityDeposit > 0 &&
    input.depositMethodId &&
    input.paymentAccountId &&
    input.depositLiabilityAccountId
  ) {
    const depositPayment: Payment = {
      id: crypto.randomUUID(),
      storeId: input.storeId,
      orderId,
      rawOrderId: input.rawOrderId,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'deposit',
      amount: input.securityDeposit,
      paymentMethodId: input.depositMethodId,
      transactionDate: txnDate,
      settlementStatus: null,
      settlementRef: null,
      customerId: customer.id,
      accountId: input.paymentAccountId,
    };
    await deps.paymentRepo.save(depositPayment);
    const depositLegs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.paymentAccountId,
        debit: Money.php(input.securityDeposit),
        credit: Money.zero(),
        description: `Order ${orderId} deposit received`,
        referenceType: 'payment',
        referenceId: depositPayment.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.depositLiabilityAccountId,
        debit: Money.zero(),
        credit: Money.php(input.securityDeposit),
        description: `Order ${orderId} deposit liability`,
        referenceType: 'payment',
        referenceId: depositPayment.id,
      },
    ];
    await deps.accountingPort.createTransaction(depositLegs, input.storeId);
  }

  const charityAmount = Number(rawOrder.charity_donation ?? 0);
  if (charityAmount > 0 && input.receivableAccountId) {
    const charityLegs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.php(charityAmount),
        credit: Money.zero(),
        description: `Order ${orderId} charity donation receivable (BePawsitive)`,
        referenceType: 'order_charity',
        referenceId: orderId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: 'CHARITY-PAYABLE',
        debit: Money.zero(),
        credit: Money.php(charityAmount),
        description: `Order ${orderId} charity donation payable (BePawsitive)`,
        referenceType: 'order_charity',
        referenceId: orderId,
      },
    ];
    await deps.accountingPort.createTransaction(charityLegs, input.storeId);
  }

  const allPayments = await deps.paymentRepo.findByOrderId(orderId);
  if (allPayments.length > 0) {
    const totalPaid = allPayments.reduce(
      (sum, p) => sum.add(Money.php(p.amount)),
      Money.zero(),
    );
    activated.applyPayments(totalPaid);
    await deps.orderRepo.save(activated);
  }

  const { error: markErr } = await supabase
    .from('orders_raw')
    .update({ status: 'processed' })
    .eq('id', input.rawOrderId);

  if (markErr) {
    throw new Error(`Failed to mark raw order as processed: ${markErr.message}`);
  }

  return { order: activated, customer };
}
