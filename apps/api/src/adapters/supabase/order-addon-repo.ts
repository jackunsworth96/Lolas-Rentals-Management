import { getSupabaseClient } from './client.js';
import type { OrderAddonRecord, OrderAddonRepository } from '@lolas/domain';

function toRow(addon: OrderAddonRecord, storeId?: string) {
  return {
    id: addon.id,
    order_id: addon.orderId,
    addon_name: addon.addonName,
    addon_price: addon.addonPrice,
    addon_type: addon.addonType,
    quantity: addon.quantity,
    total_amount: addon.totalAmount,
    ...(storeId ? { store_id: storeId } : {}),
  };
}

function toDomain(row: Record<string, unknown>): OrderAddonRecord {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    addonName: row.addon_name as string,
    addonPrice: row.addon_price as number,
    addonType: row.addon_type as 'per_day' | 'one_time',
    quantity: row.quantity as number,
    totalAmount: row.total_amount as number,
    mutualExclusivityGroup: (row.mutual_exclusivity_group as string | null) ?? null,
  };
}

export function createOrderAddonRepo(): OrderAddonRepository {
  const sb = getSupabaseClient();

  return {
    async findByOrderId(orderId) {
      const { data, error } = await sb
        .from('order_addons')
        .select('*')
        .eq('order_id', orderId);
      if (error) throw new Error(`Failed to fetch order addons: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async saveMany(orderId, addons, storeId?: string) {
      const rows = addons.map((a) => ({ ...toRow(a, storeId), order_id: orderId }));
      const { error } = await sb.from('order_addons').upsert(rows);
      if (error) throw new Error(`Failed to save order addons: ${error.message}`);
    },

    async save(addon: OrderAddonRecord, storeId: string) {
      const row = { ...toRow(addon, storeId), store_id: storeId };
      const { error } = await sb.from('order_addons').upsert(row);
      if (error) throw new Error(`Failed to save order addon: ${error.message}`);
    },

    async deleteById(id: string) {
      const { error } = await sb.from('order_addons').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete order addon: ${error.message}`);
    },

    async deleteByOrderId(orderId) {
      const { error } = await sb
        .from('order_addons')
        .delete()
        .eq('order_id', orderId);
      if (error) throw new Error(`Failed to delete order addons: ${error.message}`);
    },
  };
}
