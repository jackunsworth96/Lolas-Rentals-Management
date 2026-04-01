import {
  type OrderRepository,
  type OrderItem,
  type OrderAddonRecord,
  type FleetRepository,
  type JournalLeg,
  Money,
  NonRentableVehicleError,
} from '@lolas/domain';

export interface ActivateOrderDeps {
  orderRepo: OrderRepository;
  fleetRepo: FleetRepository;
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
  const now = new Date();
  const journalDate = now.toISOString().slice(0, 10);
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

  return order;
}
