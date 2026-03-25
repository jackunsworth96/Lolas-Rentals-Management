import {
  type OrderRepository,
  type OrderItemRepository,
  type OrderAddonRepository,
  type OrderAddonRecord,
  Money,
} from '@lolas/domain';

export interface AdjustDatesDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  orderAddonRepo: OrderAddonRepository;
}

export interface AdjustDatesInput {
  orderId: string;
  orderItemId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
}

function calcDays(pickup: string, dropoff: string): number {
  const ms = new Date(dropoff).getTime() - new Date(pickup).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function itemSubtotal(rate: number, days: number, pickupFee: number, dropoffFee: number, discount: number): number {
  return (rate * days) + pickupFee + dropoffFee - discount;
}

export async function adjustDates(
  deps: AdjustDatesDeps,
  input: AdjustDatesInput,
) {
  const { orderRepo, orderItemRepo, orderAddonRepo } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const items = await orderItemRepo.findByOrderId(order.id);
  const item = items.find((i) => i.id === input.orderItemId);
  if (!item) throw new Error(`Order item ${input.orderItemId} not found`);

  const oldDays = item.rentalDaysCount;
  const newDays = calcDays(input.pickupDatetime, input.dropoffDatetime);

  const oldItemTotal = itemSubtotal(item.rentalRate, oldDays, item.pickupFee, item.dropoffFee, item.discount);
  const newItemTotal = itemSubtotal(item.rentalRate, newDays, item.pickupFee, item.dropoffFee, item.discount);
  let totalDelta = newItemTotal - oldItemTotal;

  // Update the order item
  const updatedItem = {
    ...item,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
    rentalDaysCount: newDays,
  };
  await orderItemRepo.save(updatedItem);

  // Recalculate per-day add-on totals if rental days changed
  if (oldDays !== newDays) {
    const allItems = items.map((i) =>
      i.id === input.orderItemId ? updatedItem : i,
    );
    const maxDays = Math.max(...allItems.map((i) => i.rentalDaysCount));
    const oldMaxDays = Math.max(...items.map((i) => i.rentalDaysCount));

    if (maxDays !== oldMaxDays) {
      const addons = await orderAddonRepo.findByOrderId(order.id);
      for (const addon of addons) {
        if (addon.addonType === 'per_day') {
          const oldAddonTotal = addon.totalAmount;
          const newAddonTotal = addon.addonPrice * addon.quantity * maxDays;
          totalDelta += newAddonTotal - oldAddonTotal;

          const updatedAddon: OrderAddonRecord = {
            ...addon,
            totalAmount: newAddonTotal,
          };
          await orderAddonRepo.save(updatedAddon, order.storeId);
        }
      }
    }
  }

  // Adjust order total
  if (totalDelta !== 0) {
    order.adjustTotal(Money.php(totalDelta));
  }
  await orderRepo.save(order);

  return {
    item: updatedItem,
    oldDays,
    newDays,
    totalDelta,
    finalTotal: order.finalTotal.toNumber(),
    balanceDue: order.balanceDue.toNumber(),
  };
}
