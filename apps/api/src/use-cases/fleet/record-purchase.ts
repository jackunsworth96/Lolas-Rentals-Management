import {
  type FleetRepository,
  type AccountingPort,
  type VehicleProps,
  type JournalLeg,
  Vehicle,
  Money,
} from '@lolas/domain';

export interface RecordPurchaseDeps {
  fleetRepo: FleetRepository;
  accountingPort: AccountingPort;
}

export interface RecordPurchaseInput {
  vehicleId: string;
  purchasePrice: number;
  purchaseDate: string;
  setUpCosts: number;
  usefulLifeMonths: number;
  salvageValue: number;
  fixedAssetAccountId: string;
  setupAssetAccountId?: string;
  cashAccountId: string;
}

export async function recordPurchase(
  deps: RecordPurchaseDeps,
  input: RecordPurchaseInput,
) {
  const { fleetRepo, accountingPort } = deps;

  const vehicle = await fleetRepo.findById(input.vehicleId);
  if (!vehicle) throw new Error(`Vehicle ${input.vehicleId} not found`);

  const totalCost = input.purchasePrice + input.setUpCosts;
  const amount = Money.php(totalCost);
  if (input.setUpCosts > 0 && !input.setupAssetAccountId) {
    throw new Error('Setup asset account is required when setup costs are greater than zero');
  }
  if (input.setUpCosts > 0 && input.setupAssetAccountId === input.fixedAssetAccountId) {
    throw new Error('Setup assets must use an account separate from the vehicle fixed asset account');
  }

  const props: VehicleProps = {
    id: vehicle.id,
    storeId: vehicle.storeId,
    name: vehicle.name,
    modelId: vehicle.modelId,
    plateNumber: vehicle.plateNumber,
    gpsId: vehicle.gpsId,
    status: vehicle.status,
    currentMileage: vehicle.currentMileage,
    orcrExpiryDate: vehicle.orcrExpiryDate,
    surfRack: vehicle.surfRack,
    owner: vehicle.owner,
    rentableStartDate: vehicle.rentableStartDate,
    registrationDate: vehicle.registrationDate,
    purchasePrice: input.purchasePrice,
    purchaseDate: input.purchaseDate,
    setUpCosts: input.setUpCosts,
    totalBikeCost: totalCost,
    usefulLifeMonths: input.usefulLifeMonths,
    salvageValue: input.salvageValue,
    accumulatedDepreciation: 0,
    bookValue: input.purchasePrice,
    dateSold: vehicle.dateSold,
    soldPrice: vehicle.soldPrice,
    profitLoss: vehicle.profitLoss,
    createdAt: vehicle.createdAt,
    updatedAt: new Date(),
  };

  const updated = Vehicle.create(props);
  await fleetRepo.save(updated);

  const legs: JournalLeg[] = [
    {
      entryId: crypto.randomUUID(),
      accountId: input.fixedAssetAccountId,
      debit: Money.php(input.purchasePrice),
      credit: Money.zero(),
      description: `Vehicle ${vehicle.id} purchase`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    },
    ...(input.setUpCosts > 0 ? [{
      entryId: crypto.randomUUID(),
      accountId: input.setupAssetAccountId!,
      debit: Money.php(input.setUpCosts),
      credit: Money.zero(),
      description: `Vehicle ${vehicle.id} reusable setup assets`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    }] : []),
    {
      entryId: crypto.randomUUID(),
      accountId: input.cashAccountId,
      debit: Money.zero(),
      credit: amount,
      description: `Vehicle ${vehicle.id} purchase payment`,
      referenceType: 'vehicle',
      referenceId: vehicle.id,
    },
  ];

  await accountingPort.createTransaction(legs, vehicle.storeId);
  return updated;
}
