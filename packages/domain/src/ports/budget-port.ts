export interface BudgetLine {
  id: string;
  budgetPeriodId: string;
  lineType: string;
  categoryLabel: string;
  coaAccountId: string | null;
  expenseCategoryId: number | null;
  month: number;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLine {
  lineType: string;
  categoryLabel: string;
  coaAccountId?: string | null;
  expenseCategoryId?: number | null;
  month: number;
  amount: number;
}

export interface ExpenseActual {
  expenseCategoryId: number | null;
  categoryLabel: string;
  month: number;
  total: number;
}

export interface JournalActual {
  accountId: string;
  accountName: string;
  lineType: string;
  month: number;
  total: number;
}

export interface RevenueActual {
  lineType: string;
  categoryLabel: string;
  month: number;
  total: number;
}

export interface BudgetPort {
  getBudgetLines(storeId: string | null, year: number): Promise<BudgetLine[]>;

  upsertBudgetLines(
    storeId: string | null,
    year: number,
    createdBy: string,
    lines: UpsertLine[],
  ): Promise<void>;

  getExpenseActuals(
    storeId: string | null,
    year: number,
    month?: number,
  ): Promise<ExpenseActual[]>;

  getJournalActuals(
    storeId: string | null,
    year: number,
    month?: number,
  ): Promise<JournalActual[]>;

  getRevenueActuals(
    storeId: string | null,
    year: number,
    month?: number,
  ): Promise<RevenueActual[]>;

  getLastYearActuals(
    storeId: string | null,
    year: number,
  ): Promise<UpsertLine[]>;
}
