export interface RepairCostLine {
  item: string;
  costPhp: number;
}

export interface RepairsPort {
  listRepairCostsByVehicleType(vehicleType: string): Promise<RepairCostLine[]>;
}
