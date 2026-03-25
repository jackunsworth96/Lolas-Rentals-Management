import {
  type FleetRepository,
  type AccountingPort,
  type JournalLeg,
  Money,
  calculateMonthlyDepreciation,
} from '@lolas/domain';

export interface BatchDepreciationDeps {
  fleetRepo: FleetRepository;
  accountingPort: AccountingPort;
}

export interface BatchDepreciationInput {
  storeId: string;
  period: string;
  depreciationExpenseAccountId: string;
  accDepreciationAccountId: string;
}

export interface DepreciationEntry {
  vehicleId: string;
  vehicleName: string;
  amount: number;
  newBookValue: number;
  newAccumulatedDepreciation: number;
}

export async function batchDepreciation(
  deps: BatchDepreciationDeps,
  input: BatchDepreciationInput,
) {
  const { fleetRepo, accountingPort } = deps;

  const vehicles = await fleetRepo.findByStore(input.storeId);

  const entries: DepreciationEntry[] = [];
  let totalDepreciation = 0;

  for (const vehicle of vehicles) {
    if (vehicle.isProtected()) continue;
    if (!vehicle.usefulLifeMonths || vehicle.usefulLifeMonths <= 0) continue;
    if (vehicle.bookValue <= vehicle.salvageValue) continue;

    const result = calculateMonthlyDepreciation({
      totalCost: vehicle.totalBikeCost,
      salvageValue: vehicle.salvageValue,
      usefulLifeMonths: vehicle.usefulLifeMonths,
      accumulatedDepreciation: vehicle.accumulatedDepreciation,
      bookValue: vehicle.bookValue,
    });

    if (result.actualDepreciation <= 0) continue;

    vehicle.applyDepreciation(result.actualDepreciation);

    await fleetRepo.updateDepreciation(
      vehicle.id,
      result.newAccumulatedDepreciation,
      result.newBookValue,
    );

    entries.push({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      amount: result.actualDepreciation,
      newBookValue: result.newBookValue,
      newAccumulatedDepreciation: result.newAccumulatedDepreciation,
    });

    totalDepreciation += result.actualDepreciation;
  }

  if (totalDepreciation > 0) {
    const total = Money.php(totalDepreciation);
    const legs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.depreciationExpenseAccountId,
        debit: total,
        credit: Money.zero(),
        description: `Monthly depreciation ${input.period} (${entries.length} vehicles)`,
        referenceType: 'depreciation',
        referenceId: input.period,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.accDepreciationAccountId,
        debit: Money.zero(),
        credit: total,
        description: `Accumulated depreciation ${input.period} (${entries.length} vehicles)`,
        referenceType: 'depreciation',
        referenceId: input.period,
      },
    ];

    await accountingPort.createTransaction(legs, input.storeId);
  }

  return { entries, totalDepreciation, vehicleCount: entries.length };
}
