import {
  type FleetRepository,
  type AccountingPort,
  type VehicleProps,
  type JournalLeg,
  Vehicle,
  Money,
} from '@lolas/domain';

export interface RecordSaleDeps {
  fleetRepo: FleetRepository;
  accountingPort: AccountingPort;
}

export interface RecordSaleInput {
  vehicleId: string;
  salePrice: number;
  saleDate: string;
  cashAccountId: string;
  fixedAssetAccountId: string;
  accDepreciationAccountId: string;
  gainLossAccountId: string;
}

export async function recordSale(
  deps: RecordSaleDeps,
  input: RecordSaleInput,
) {
  const { fleetRepo, accountingPort } = deps;

  const vehicle = await fleetRepo.findById(input.vehicleId);
  if (!vehicle) throw new Error(`Vehicle ${input.vehicleId} not found`);

  if (vehicle.isProtected()) {
    throw new Error(
      `Cannot sell protected vehicle ${vehicle.id} (${vehicle.status})`,
    );
  }

  const totalCost = vehicle.totalBikeCost;
  const accDepreciation = vehicle.accumulatedDepreciation;
  const bookValue = vehicle.bookValue;
  const profitLoss = input.salePrice - bookValue;

  const props: VehicleProps = {
    id: vehicle.id,
    storeId: vehicle.storeId,
    name: vehicle.name,
    modelId: vehicle.modelId,
    plateNumber: vehicle.plateNumber,
    gpsId: vehicle.gpsId,
    status: 'Sold',
    currentMileage: vehicle.currentMileage,
    orcrExpiryDate: vehicle.orcrExpiryDate,
    surfRack: vehicle.surfRack,
    owner: vehicle.owner,
    rentableStartDate: vehicle.rentableStartDate,
    registrationDate: vehicle.registrationDate,
    purchasePrice: vehicle.purchasePrice,
    purchaseDate: vehicle.purchaseDate,
    setUpCosts: vehicle.setUpCosts,
    totalBikeCost: totalCost,
    usefulLifeMonths: vehicle.usefulLifeMonths,
    salvageValue: vehicle.salvageValue,
    accumulatedDepreciation: accDepreciation,
    bookValue,
    dateSold: input.saleDate,
    soldPrice: input.salePrice,
    profitLoss,
    createdAt: vehicle.createdAt,
    updatedAt: new Date(),
  };

  const soldVehicle = Vehicle.create(props);
  await fleetRepo.save(soldVehicle);

  const legs: JournalLeg[] = [
    {
      entryId: crypto.randomUUID(),
      accountId: input.cashAccountId,
      debit: Money.php(input.salePrice),
      credit: Money.zero(),
      description: `Vehicle ${vehicle.id} sale proceeds`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    },
    {
      entryId: crypto.randomUUID(),
      accountId: input.accDepreciationAccountId,
      debit: Money.php(accDepreciation),
      credit: Money.zero(),
      description: `Vehicle ${vehicle.id} depreciation removal`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    },
    {
      entryId: crypto.randomUUID(),
      accountId: input.fixedAssetAccountId,
      debit: Money.zero(),
      credit: Money.php(totalCost),
      description: `Vehicle ${vehicle.id} asset disposal`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    },
  ];

  if (profitLoss > 0) {
    legs.push({
      entryId: crypto.randomUUID(),
      accountId: input.gainLossAccountId,
      debit: Money.zero(),
      credit: Money.php(profitLoss),
      description: `Vehicle ${vehicle.id} gain on sale`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    });
  } else if (profitLoss < 0) {
    legs.push({
      entryId: crypto.randomUUID(),
      accountId: input.gainLossAccountId,
      debit: Money.php(Math.abs(profitLoss)),
      credit: Money.zero(),
      description: `Vehicle ${vehicle.id} loss on sale`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    });
  }

  await accountingPort.createTransaction(legs, vehicle.storeId);
  return { vehicle: soldVehicle, profitLoss };
}
