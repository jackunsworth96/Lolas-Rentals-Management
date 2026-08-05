import { InvalidAmountError } from '../errors/domain-error.js';

export interface DepreciationInput {
  purchasePrice: number;
  salvageValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
}

export interface DepreciationResult {
  monthlyAmount: number;
  actualDepreciation: number;
  newAccumulatedDepreciation: number;
  newBookValue: number;
}

/**
 * Straight-line depreciation: (purchasePrice - salvageValue) / usefulLifeMonths
 * Capped so book value never falls below salvage value.
 * Returns 0 when vehicle is fully depreciated.
 */
export function calculateMonthlyDepreciation(
  input: DepreciationInput,
): DepreciationResult {
  const { purchasePrice, salvageValue, usefulLifeMonths } = input;

  if (usefulLifeMonths <= 0) {
    throw new InvalidAmountError('Useful life must be positive');
  }
  if (purchasePrice < 0 || salvageValue < 0) {
    throw new InvalidAmountError('Costs must be non-negative');
  }

  const depreciableAmount = purchasePrice - salvageValue;
  const monthlyAmount = Math.max(0, depreciableAmount / usefulLifeMonths);

  const maxDepreciation = Math.max(
    0,
    depreciableAmount - input.accumulatedDepreciation,
  );
  const actualDepreciation = Math.min(monthlyAmount, maxDepreciation);

  const rounded = Math.round(actualDepreciation * 100) / 100;
  const newAccumulated =
    Math.round((input.accumulatedDepreciation + rounded) * 100) / 100;
  const newBookValue = Math.round((purchasePrice - newAccumulated) * 100) / 100;

  return {
    monthlyAmount: Math.round(monthlyAmount * 100) / 100,
    actualDepreciation: rounded,
    newAccumulatedDepreciation: newAccumulated,
    newBookValue: Math.max(salvageValue, newBookValue),
  };
}
