import { getSupabaseClient } from './client.js';
import type { OrderItem, OrderItemRepository } from '@lolas/domain';

function toRow(item: OrderItem) {
  return {
    id: item.id,
    store_id: item.storeId,
    order_id: item.orderId,
    vehicle_id: item.vehicleId,
    vehicle_name: item.vehicleName,
    pickup_datetime: item.pickupDatetime,
    dropoff_datetime: item.dropoffDatetime,
    rental_days_count: item.rentalDaysCount,
    pickup_location: item.pickupLocation,
    dropoff_location: item.dropoffLocation,
    pickup_fee: item.pickupFee,
    dropoff_fee: item.dropoffFee,
    rental_rate: item.rentalRate,
    helmet_numbers: item.helmetNumbers,
    discount: item.discount,
    ops_notes: item.opsNotes,
    return_condition: item.returnCondition,
  };
}

function toDomain(row: Record<string, unknown>): OrderItem {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    orderId: row.order_id as string,
    vehicleId: row.vehicle_id as string,
    vehicleName: row.vehicle_name as string,
    pickupDatetime: row.pickup_datetime as string,
    dropoffDatetime: row.dropoff_datetime as string,
    rentalDaysCount: row.rental_days_count as number,
    pickupLocation: row.pickup_location as string,
    dropoffLocation: row.dropoff_location as string,
    pickupFee: row.pickup_fee as number,
    dropoffFee: row.dropoff_fee as number,
    rentalRate: row.rental_rate as number,
    helmetNumbers: row.helmet_numbers as string | null,
    discount: row.discount as number,
    opsNotes: row.ops_notes as string | null,
    returnCondition: row.return_condition as string | null,
  };
}

export function createOrderItemRepo(): OrderItemRepository {
  const sb = getSupabaseClient();

  return {
    async findByOrderId(orderId) {
      const { data, error } = await sb
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);
      if (error) throw new Error(`Failed to fetch order items: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findActiveByVehicle(vehicleId) {
      const { data, error } = await sb
        .from('order_items')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .gte('dropoff_datetime', new Date().toISOString());
      if (error) throw new Error(`Failed to fetch active items by vehicle: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(item) {
      const { error } = await sb.from('order_items').upsert(toRow(item));
      if (error) throw new Error(`Failed to save order item: ${error.message}`);
    },

    async saveMany(items) {
      const { error } = await sb.from('order_items').upsert(items.map(toRow));
      if (error) throw new Error(`Failed to save order items: ${error.message}`);
    },

    async delete(id) {
      const { error } = await sb.from('order_items').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete order item: ${error.message}`);
    },
  };
}
