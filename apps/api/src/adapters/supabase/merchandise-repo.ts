import { getSupabaseClient } from './client.js';
import type { MerchandiseItem, MerchandiseRepository } from '@lolas/domain';

function toDomain(row: Record<string, unknown>): MerchandiseItem {
  return {
    sku: row.sku as string,
    itemName: row.item_name as string,
    sizeVariant: (row.size_variant as string) ?? null,
    costPrice: Number(row.cost_price ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    startingStock: Number(row.starting_stock ?? 0),
    soldCount: Number(row.sold_count ?? 0),
    currentStock: Number(row.current_stock ?? 0),
    lowStockThreshold: Number(row.low_stock_threshold ?? 5),
    storeId: (row.store_id as string) ?? null,
    isActive: row.is_active !== false,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function toRow(item: Omit<MerchandiseItem, 'createdAt' | 'updatedAt'>) {
  return {
    sku: item.sku,
    item_name: item.itemName,
    size_variant: item.sizeVariant,
    cost_price: item.costPrice,
    sale_price: item.salePrice,
    starting_stock: item.startingStock,
    sold_count: item.soldCount,
    current_stock: item.currentStock,
    low_stock_threshold: item.lowStockThreshold,
    store_id: item.storeId,
    is_active: item.isActive,
  };
}

export function createMerchandiseRepo(): MerchandiseRepository {
  const sb = getSupabaseClient();

  return {
    async findByStore(storeId) {
      const { data, error } = await sb
        .from('merchandise')
        .select('*')
        .eq('store_id', storeId)
        .order('item_name', { ascending: true });
      if (error) throw new Error(`Failed to fetch merchandise: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findBySku(sku) {
      const { data, error } = await sb
        .from('merchandise')
        .select('*')
        .eq('sku', sku)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch merchandise item: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async save(item) {
      const { error } = await sb
        .from('merchandise')
        .upsert(toRow(item), { onConflict: 'sku' });
      if (error) throw new Error(`Failed to save merchandise item: ${error.message}`);
    },

    async updateStock(sku, delta) {
      const { data: current, error: fetchErr } = await sb
        .from('merchandise')
        .select('*')
        .eq('sku', sku)
        .single();
      if (fetchErr || !current) throw new Error(`Merchandise item not found: ${sku}`);

      const newStock = Number(current.current_stock ?? 0) + delta;
      const newSold = delta < 0
        ? Number(current.sold_count ?? 0) + Math.abs(delta)
        : Number(current.sold_count ?? 0);

      const { data: updated, error: updateErr } = await sb
        .from('merchandise')
        .update({
          current_stock: newStock,
          sold_count: newSold,
          updated_at: new Date().toISOString(),
        })
        .eq('sku', sku)
        .select('*')
        .single();
      if (updateErr) throw new Error(`Failed to update stock: ${updateErr.message}`);
      return toDomain(updated);
    },

    async delete(sku) {
      const { error } = await sb.from('merchandise').delete().eq('sku', sku);
      if (error) throw new Error(`Failed to delete merchandise item: ${error.message}`);
    },
  };
}
