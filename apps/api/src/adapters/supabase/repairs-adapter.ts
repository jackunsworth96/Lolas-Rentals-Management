import type { RepairsPort, RepairCostLine } from '@lolas/domain';
import { getSupabaseClient } from './client.js';

export function createRepairsAdapter(): RepairsPort {
  const sb = getSupabaseClient();

  return {
    async listRepairCostsByVehicleType(vehicleType: string): Promise<RepairCostLine[]> {
      const { data, error } = await sb
        .from('repair_costs')
        .select('item, cost_php')
        .eq('vehicle_type', vehicleType)
        .order('sort_order', { ascending: true });

      if (error) throw new Error(`repair_costs query failed: ${error.message}`);

      return (data ?? []).map((row: { item: string; cost_php: number | string }) => ({
        item: row.item,
        costPhp: Number(row.cost_php),
      }));
    },
  };
}
