import type { RepairsPort, RepairCostLine } from '@lolas/domain';

export interface ListRepairCostsDeps {
  repairsPort: RepairsPort;
}

export async function listRepairCosts(
  deps: ListRepairCostsDeps,
  vehicleType: string,
): Promise<RepairCostLine[]> {
  return deps.repairsPort.listRepairCostsByVehicleType(vehicleType);
}
