import {
  type OrderItemRepository,
  type FleetRepository,
  NonRentableVehicleError,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';
import { formatManilaDate, formatManilaTime } from '../../utils/manila-date.js';

export interface SwapVehicleDeps {
  orderItemRepo: OrderItemRepository;
  fleetRepo: FleetRepository;
}

export interface SwapVehicleInput {
  orderId: string;
  orderItemId: string;
  newVehicleId: string;
  reason: string;
  employeeId: string;
}

export async function swapVehicle(
  deps: SwapVehicleDeps,
  input: SwapVehicleInput,
) {
  const { orderItemRepo, fleetRepo } = deps;

  const newVehicle = await fleetRepo.findById(input.newVehicleId);
  if (!newVehicle) throw new Error(`Vehicle ${input.newVehicleId} not found`);
  if (!newVehicle.isRentable()) {
    throw new NonRentableVehicleError(newVehicle.id, newVehicle.status);
  }

  const items = await orderItemRepo.findByOrderId(input.orderId);
  const item = items.find((i) => i.id === input.orderItemId);
  if (!item) throw new Error(`Order item ${input.orderItemId} not found`);

  const oldVehicleId = item.vehicleId;
  const oldVehicleName = item.vehicleName;

  const updatedItem = {
    ...item,
    vehicleId: newVehicle.id,
    vehicleName: newVehicle.name,
    opsNotes: item.opsNotes
      ? `${item.opsNotes}\n[Swap ${new Date().toISOString()}] ${oldVehicleName} → ${newVehicle.name}: ${input.reason}`
      : `[Swap ${new Date().toISOString()}] ${oldVehicleName} → ${newVehicle.name}: ${input.reason}`,
  };

  await orderItemRepo.save(updatedItem);

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
    reason: input.reason,
    employee_id: input.employeeId,
  });

  if (error) throw new Error(`Failed to record vehicle swap: ${error.message}`);

  return { updatedItem, oldVehicleId, oldVehicleName, newVehicleId: newVehicle.id, newVehicleName: newVehicle.name };
}
