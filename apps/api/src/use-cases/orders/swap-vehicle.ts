import {
  type OrderRepository,
  type OrderItemRepository,
  type FleetRepository,
  NonRentableVehicleError,
  Money,
} from '@lolas/domain';
import type { SwapReasonCategory } from '@lolas/shared';
import { supabase } from '../../adapters/supabase/client.js';
import { formatManilaDate, formatManilaTime } from '../../utils/manila-date.js';

export interface SwapVehicleDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  fleetRepo: FleetRepository;
}

export interface SwapVehicleInput {
  orderId: string;
  orderItemId: string;
  newVehicleId: string;
  reason: string;
  reasonCategory: SwapReasonCategory;
  employeeId: string;
  /**
   * New daily rate for the rental. Omit to keep the current rate (e.g. a free
   * upgrade or a breakdown replacement). When set, the order total is adjusted
   * by (newRate − oldRate) × rental days and any difference is left on the
   * balance for the normal collect-payment / refund flow.
   */
  newRentalRate?: number;
}

type SwapError = Error & { statusCode?: number };

function swapError(message: string): SwapError {
  const err = new Error(message) as SwapError;
  err.statusCode = 409;
  return err;
}

/**
 * Mirrors the database's assert_vehicle_booking_available() check so staff get
 * a readable reason instead of a raw constraint error.
 */
export async function findSwapConflict(
  vehicleId: string,
  vehicleName: string,
  modelId: string | null,
  excludeOrderItemId: string,
  pickupDatetime: string,
  dropoffDatetime: string,
): Promise<string | null> {
  if (!modelId) return `${vehicleName} has no model set, so it can't be rented. Set its model in Fleet first.`;

  const { data: model, error: modelErr } = await supabase
    .from('vehicle_models').select('name, is_active').eq('id', modelId).maybeSingle();
  if (modelErr) throw new Error(`Vehicle model lookup failed: ${modelErr.message}`);
  const modelRow = model as { name: string; is_active: boolean } | null;
  if (!modelRow?.is_active) {
    return `${vehicleName} is a ${modelRow?.name ?? modelId}, which is switched off in Settings, so it can't be rented.`;
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, pickup_datetime, dropoff_datetime, orders!inner(status, booking_customer_name)')
    .eq('vehicle_id', vehicleId)
    .neq('id', excludeOrderItemId)
    .lt('pickup_datetime', dropoffDatetime)
    .gt('dropoff_datetime', pickupDatetime);
  if (itemsErr) throw new Error(`Booking conflict check failed: ${itemsErr.message}`);
  for (const row of (items ?? []) as Array<{ orders: unknown }>) {
    const orders = row.orders as { status: string; booking_customer_name: string | null }
      | Array<{ status: string; booking_customer_name: string | null }> | null;
    const order = Array.isArray(orders) ? orders[0] : orders;
    if (order && order.status !== 'cancelled' && order.status !== 'completed') {
      const who = order.booking_customer_name ? ` (${order.booking_customer_name})` : '';
      return `${vehicleName} is already booked on another rental${who} for these dates.`;
    }
  }

  const { data: holds, error: holdsErr } = await supabase
    .from('orders_raw')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('booking_channel', 'walk_in')
    .eq('status', 'unprocessed')
    .lt('pickup_datetime', dropoffDatetime)
    .gt('dropoff_datetime', pickupDatetime);
  if (holdsErr) throw new Error(`Reservation conflict check failed: ${holdsErr.message}`);
  if ((holds ?? []).length > 0) return `${vehicleName} is reserved for a walk-in booking on these dates.`;

  const { data: ownerUse, error: ownerUseErr } = await supabase
    .from('fleet_unavailability')
    .select('id, ends_at')
    .eq('vehicle_id', vehicleId)
    .is('cancelled_at', null)
    .lt('starts_at', dropoffDatetime);
  if (ownerUseErr) throw new Error(`Owner-use check failed: ${ownerUseErr.message}`);
  const pickupMs = new Date(pickupDatetime).getTime();
  const blocked = ((ownerUse ?? []) as Array<{ ends_at: string | null }>)
    .some((row) => row.ends_at === null || new Date(row.ends_at).getTime() > pickupMs);
  if (blocked) return `${vehicleName} is reserved for owner use during these dates.`;

  return null;
}

export async function swapVehicle(
  deps: SwapVehicleDeps,
  input: SwapVehicleInput,
) {
  const { orderRepo, orderItemRepo, fleetRepo } = deps;

  const newVehicle = await fleetRepo.findById(input.newVehicleId);
  if (!newVehicle) throw new Error(`Vehicle ${input.newVehicleId} not found`);
  if (!newVehicle.isRentable()) {
    throw new NonRentableVehicleError(newVehicle.id, newVehicle.status);
  }

  const items = await orderItemRepo.findByOrderId(input.orderId);
  const item = items.find((i) => i.id === input.orderItemId);
  if (!item) throw new Error(`Order item ${input.orderItemId} not found`);

  const conflict = await findSwapConflict(
    newVehicle.id,
    newVehicle.name,
    newVehicle.modelId,
    item.id,
    item.pickupDatetime,
    item.dropoffDatetime,
  );
  if (conflict) throw swapError(conflict);

  const oldVehicleId = item.vehicleId;
  const oldVehicleName = item.vehicleName;
  const oldRentalRate = item.rentalRate;
  const repricing = input.newRentalRate !== undefined && input.newRentalRate !== oldRentalRate;
  const newRentalRate = repricing ? input.newRentalRate! : oldRentalRate;
  const totalDelta = repricing
    ? Math.round((newRentalRate - oldRentalRate) * item.rentalDaysCount * 100) / 100
    : 0;

  const order = repricing ? await orderRepo.findById(input.orderId) : null;
  if (repricing && !order) throw new Error(`Order ${input.orderId} not found`);

  const swapNote = `[Swap ${new Date().toISOString()}] ${oldVehicleName} → ${newVehicle.name}: ${input.reason}`
    + (repricing ? ` (rate ${oldRentalRate} → ${newRentalRate}/day)` : '');
  const updatedItem = {
    ...item,
    vehicleId: newVehicle.id,
    vehicleName: newVehicle.name,
    rentalRate: newRentalRate,
    opsNotes: item.opsNotes ? `${item.opsNotes}\n${swapNote}` : swapNote,
  };

  await orderItemRepo.save(updatedItem);

  if (order && totalDelta !== 0) {
    order.adjustTotal(Money.php(totalDelta));
    await orderRepo.save(order);
  }

  await Promise.all([
    fleetRepo.updateStatus(oldVehicleId, 'Available'),
    fleetRepo.updateStatus(newVehicle.id, 'Active'),
  ]);

  const now = new Date();
  const { error } = await supabase.from('vehicle_swaps').insert({
    id: crypto.randomUUID(),
    order_id: input.orderId,
    order_item_id: input.orderItemId,
    store_id: item.storeId,
    old_vehicle_id: oldVehicleId,
    old_vehicle_name: oldVehicleName,
    new_vehicle_id: newVehicle.id,
    new_vehicle_name: newVehicle.name,
    swap_date: formatManilaDate(now),
    swap_time: formatManilaTime(now),
    reason: repricing ? `${input.reason} (rate ${oldRentalRate} → ${newRentalRate}/day)` : input.reason,
    reason_category: input.reasonCategory,
    employee_id: input.employeeId,
  });

  if (error) throw new Error(`Failed to record vehicle swap: ${error.message}`);

  return {
    updatedItem,
    oldVehicleId,
    oldVehicleName,
    newVehicleId: newVehicle.id,
    newVehicleName: newVehicle.name,
    oldRentalRate,
    newRentalRate,
    totalDelta,
    finalTotal: order?.finalTotal.toNumber() ?? null,
    balanceDue: order?.balanceDue.toNumber() ?? null,
  };
}
