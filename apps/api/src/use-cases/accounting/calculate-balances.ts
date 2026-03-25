import type {
  AccountingPort,
  AccountBalance,
  BalanceSummary,
} from '@lolas/domain';

export interface CalculateBalancesInput {
  storeId: string;
  period: string;
}

export interface CalculateBalancesResult {
  storeId: string;
  period: string;
  accounts: AccountBalance[];
  summary: BalanceSummary[];
}

export async function calculateBalances(
  input: CalculateBalancesInput,
  deps: { accounting: AccountingPort },
): Promise<CalculateBalancesResult> {
  const [accounts, summary] = await Promise.all([
    deps.accounting.calculateAllBalances(input.storeId, input.period),
    deps.accounting.getBalanceSummaryByType(input.storeId, input.period),
  ]);

  return {
    storeId: input.storeId,
    period: input.period,
    accounts,
    summary,
  };
}
