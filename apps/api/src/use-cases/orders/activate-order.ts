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
import { resolveCharityPayableAccount } from '../../adapters/supabase/maintenance-expense-rpc.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface ActivateOrderDeps {
  orderRepo: OrderRepository;
  fleetRepo: FleetRepository;
  /** Retained for interface compatibility; no longer used by activateOrder directly. */
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
   * Set to true only when the caller guarantees it will post the charity
   * journal itself inside its own atomic RPC call. Leave unset (or false)
   * for all activation paths so charity is always folded into this RPC.
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
  const journalDate = formatManilaDate();
  const journalPeriod = journalDate.slice(0, 7);

  if (amount.isPositive()) {
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

  // Charity legs folded into the same activate_order_atomic RPC call so the
  // posting is atomic and never skipped based on payment method (AC-09).
  // resolveCharityPayableAccount is called here, before the RPC, per contract.
  const charityAmount = order.charityDonation;
  if (!input.skipCharityPosting && charityAmount && charityAmount.isPositive() && input.receivableAccountId) {
    const charityPayableAccountId = await resolveCharityPayableAccount(order.storeId);
    if (charityPayableAccountId) {
      journalLegs.push(
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
          accountId: charityPayableAccountId,
          debit: Money.zero(),
          credit: charityAmount,
          description: `Order ${order.id} charity donation payable (Be Pawsitive)`,
          referenceType: 'order_charity',
          referenceId: order.id,
        },
      );
    }
  }

  const journalTransactionId = journalLegs.length > 0 ? crypto.randomUUID() : '';

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

  return order;
}
