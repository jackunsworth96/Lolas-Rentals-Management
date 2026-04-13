import {
  type OrderRepository,
  type OrderItem,
  type OrderAddonRecord,
  type FleetRepository,
  type AccountingPort,
  type JournalLeg,
  Money,
  NonRentableVehicleError,
} from '@lolas/domain';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface ActivateOrderDeps {
  orderRepo: OrderRepository;
  fleetRepo: FleetRepository;
  /** Required when skipCharityPosting is false/absent and order has a charity donation. */
  accountingPort?: AccountingPort;
}

export interface VehicleAssignment {
  id: string;
  vehicleId: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupFee: number;
  dropoffFee: number;
  rentalRate: number;
  helmetNumbers: string | null;
  discount: number;
  opsNotes: string | null;
}

export interface ActivateOrderInput {
  orderId: string;
  employeeId: string;
  vehicleAssignments: VehicleAssignment[];
  addons?: OrderAddonRecord[];
  receivableAccountId: string;
  incomeAccountId: string;
  /**
   * Set to true when the caller (e.g. process-raw-order.ts) will post
   * the charity journal itself after this function returns.
   * Leave unset (or false) for all other activation paths so charity
   * is posted here.
   */
  skipCharityPosting?: boolean;
}

export async function activateOrder(
  deps: ActivateOrderDeps,
  input: ActivateOrderInput,
) {
  const { orderRepo, fleetRepo } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  for (const a of input.vehicleAssignments) {
    const vehicle = await fleetRepo.findById(a.vehicleId);
    if (!vehicle) throw new Error(`Vehicle ${a.vehicleId} not found`);
    if (!vehicle.isRentable()) {
      throw new NonRentableVehicleError(vehicle.id, vehicle.status);
    }
  }

  const orderItems: OrderItem[] = input.vehicleAssignments.map((a) => ({
    id: a.id,
    storeId: order.storeId,
    orderId: order.id,
    vehicleId: a.vehicleId,
    vehicleName: a.vehicleName,
    pickupDatetime: a.pickupDatetime,
    dropoffDatetime: a.dropoffDatetime,
    rentalDaysCount: a.rentalDaysCount,
    pickupLocation: a.pickupLocation,
    dropoffLocation: a.dropoffLocation,
    pickupFee: a.pickupFee,
    dropoffFee: a.dropoffFee,
    rentalRate: a.rentalRate,
    helmetNumbers: a.helmetNumbers,
    discount: a.discount,
    opsNotes: a.opsNotes,
    returnCondition: null,
  }));

  const orderAddons: OrderAddonRecord[] = (input.addons ?? []).map((a) => ({
    ...a,
    orderId: a.orderId ?? order.id,
    id: a.id ?? crypto.randomUUID(),
    mutualExclusivityGroup: a.mutualExclusivityGroup ?? null,
  }));

  const fleetUpdates = input.vehicleAssignments.map((a) => ({
    id: a.vehicleId,
    status: 'Active',
  }));

  order.activate(input.employeeId, input.vehicleAssignments.length);

  const amount = order.finalTotal;
  let journalLegs: JournalLeg[] = [];
  let journalTransactionId = '';
  const journalDate = formatManilaDate();
  const journalPeriod = journalDate.slice(0, 7);

  if (amount.isPositive()) {
    journalTransactionId = crypto.randomUUID();
    journalLegs = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: amount,
        credit: Money.zero(),
        description: `Order ${order.id} activation`,
        referenceType: 'order',
        referenceId: order.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.incomeAccountId,
        debit: Money.zero(),
        credit: amount,
        description: `Order ${order.id} rental income`,
        referenceType: 'order',
        referenceId: order.id,
      },
    ];
  }

  await orderRepo.activateOrderAtomic(
    order,
    orderItems,
    orderAddons,
    fleetUpdates,
    journalLegs,
    journalTransactionId,
    journalPeriod,
    journalDate,
    order.storeId,
  );

  // Post charity journal unless the caller has indicated it will handle it.
  // process-raw-order.ts posts charity itself after calling activateOrder,
  // so it passes skipCharityPosting: true to avoid a double-post.
  const charityAmount = order.charityDonation;
  if (!input.skipCharityPosting && charityAmount && charityAmount.isPositive()) {
    const { accountingPort } = deps;
    if (accountingPort && input.receivableAccountId) {
      const charityLegs: JournalLeg[] = [
        {
          entryId: crypto.randomUUID(),
          accountId: input.receivableAccountId,
          debit: charityAmount,
          credit: Money.zero(),
          description: `Order ${order.id} charity donation receivable (Be Pawsitive)`,
          referenceType: 'order_charity',
          referenceId: order.id,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: 'CHARITY-PAYABLE',
          debit: Money.zero(),
          credit: charityAmount,
          description: `Order ${order.id} charity donation payable (Be Pawsitive)`,
          referenceType: 'order_charity',
          referenceId: order.id,
        },
      ];
      await accountingPort.createTransaction(charityLegs, order.storeId);
    }
  }

  return order;
}
