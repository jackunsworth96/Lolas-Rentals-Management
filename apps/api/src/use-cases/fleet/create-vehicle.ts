import { type FleetRepository, type VehicleProps, Vehicle } from '@lolas/domain';

export interface CreateVehicleDeps {
  fleetRepo: FleetRepository;
}

export interface CreateVehicleInput {
  name: string;
  modelId: string | null;
  plateNumber: string | null;
  storeId: string;
  gpsId: string | null;
  surfRack: boolean;
  rentableStartDate: string | null;
  registrationDate: string | null;
}

export async function createVehicle(
  deps: CreateVehicleDeps,
  input: CreateVehicleInput,
): Promise<Vehicle> {
  const { fleetRepo } = deps;
  const id = crypto.randomUUID();
  const now = new Date();

  const props: VehicleProps = {
    id,
    storeId: input.storeId,
    name: input.name.trim(),
    modelId: input.modelId,
    plateNumber: input.plateNumber?.trim() ?? null,
    gpsId: input.gpsId?.trim() ?? null,
    status: 'Available',
    currentMileage: 0,
    orcrExpiryDate: null,
    surfRack: input.surfRack,
    owner: null,
    rentableStartDate: input.rentableStartDate ?? null,
    registrationDate: input.registrationDate ?? null,
    purchasePrice: null,
    purchaseDate: null,
    setUpCosts: 0,
    totalBikeCost: 0,
    usefulLifeMonths: null,
    salvageValue: 0,
    accumulatedDepreciation: 0,
    bookValue: 0,
    dateSold: null,
    soldPrice: null,
    profitLoss: null,
    createdAt: now,
    updatedAt: now,
  };

  const vehicle = Vehicle.create(props);
  await fleetRepo.save(vehicle);
  return vehicle;
}
