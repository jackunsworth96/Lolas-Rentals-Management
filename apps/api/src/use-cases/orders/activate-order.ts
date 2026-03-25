import {
  type OrderRepository,
  type OrderItemRepository,
  type OrderItem,
  type OrderAddonRepository,
  type OrderAddonRecord,
  type FleetRepository,
  type AccountingPort,
  type JournalLeg,
  Money,
  NonRentableVehicleError,
} from '@lolas/domain';

export interface ActivateOrderDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  orderAddonRepo: OrderAddonRepository;
  fleetRepo: FleetRepository;
  accountingPort: AccountingPort;
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
  const { orderRepo, orderItemRepo, orderAddonRepo, fleetRepo, accountingPort } =
    deps;

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

  await orderItemRepo.saveMany(orderItems);

  if (input.addons && input.addons.length > 0) {
    await orderAddonRepo.saveMany(order.id, input.addons, order.storeId);
  }

  for (const a of input.vehicleAssignments) {
    await fleetRepo.updateStatus(a.vehicleId, 'Active');
  }

  order.activate(input.employeeId, input.vehicleAssignments.length);

  const amount = order.finalTotal;
  if (amount.isPositive()) {
    const legs: JournalLeg[] = [
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

    await accountingPort.createTransaction(legs, order.storeId);
  }

  await orderRepo.save(order);
  return order;
}
