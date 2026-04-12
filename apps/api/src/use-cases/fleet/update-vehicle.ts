import { type FleetRepository, type VehicleProps, Vehicle } from '@lolas/domain';

export interface UpdateVehicleDeps {
  fleetRepo: FleetRepository;
}

export interface UpdateVehicleInput {
  vehicleId: string;
  name?: string;
  plateNumber?: string | null;
  engineNumber?: string | null;
  chassisNumber?: string | null;
  gpsId?: string | null;
  status?: string;
  currentMileage?: number;
  orcrExpiryDate?: string | null;
  surfRack?: boolean;
  owner?: string | null;
  storeId?: string;
  modelId?: string | null;
}

export async function updateVehicle(
  deps: UpdateVehicleDeps,
  input: UpdateVehicleInput,
) {
  const { fleetRepo } = deps;

  const vehicle = await fleetRepo.findById(input.vehicleId);
  if (!vehicle) throw new Error(`Vehicle ${input.vehicleId} not found`);

  if (input.status !== undefined && vehicle.isProtected()) {
    throw new Error(
      `Cannot update protected vehicle ${vehicle.id} (${vehicle.status})`,
    );
  }

  const props: VehicleProps = {
    id: vehicle.id,
    storeId: input.storeId ?? vehicle.storeId,
    name: input.name ?? vehicle.name,
    modelId: input.modelId !== undefined ? input.modelId : vehicle.modelId,
    plateNumber:
      input.plateNumber !== undefined ? input.plateNumber : vehicle.plateNumber,
    engineNumber:
      input.engineNumber !== undefined ? input.engineNumber : vehicle.engineNumber,
    chassisNumber:
      input.chassisNumber !== undefined ? input.chassisNumber : vehicle.chassisNumber,
    gpsId: input.gpsId !== undefined ? input.gpsId : vehicle.gpsId,
    status: input.status ?? vehicle.status,
    currentMileage: input.currentMileage ?? vehicle.currentMileage,
    orcrExpiryDate:
      input.orcrExpiryDate !== undefined
        ? input.orcrExpiryDate
        : vehicle.orcrExpiryDate,
    surfRack: input.surfRack ?? vehicle.surfRack,
    owner: input.owner !== undefined ? input.owner : vehicle.owner,
    rentableStartDate: vehicle.rentableStartDate,
    registrationDate: vehicle.registrationDate,
    purchasePrice: vehicle.purchasePrice,
    purchaseDate: vehicle.purchaseDate,
    setUpCosts: vehicle.setUpCosts,
    totalBikeCost: vehicle.totalBikeCost,
    usefulLifeMonths: vehicle.usefulLifeMonths,
    salvageValue: vehicle.salvageValue,
    accumulatedDepreciation: vehicle.accumulatedDepreciation,
    bookValue: vehicle.bookValue,
    dateSold: vehicle.dateSold,
    soldPrice: vehicle.soldPrice,
    profitLoss: vehicle.profitLoss,
    createdAt: vehicle.createdAt,
    updatedAt: new Date(),
  };

  const updated = Vehicle.create(props);
  await fleetRepo.save(updated);
  return updated;
}
