import type { JournalTransaction, JournalLeg } from '../entities/journal-transaction.js';
import type { Money } from '../value-objects/money.js';

export interface JournalEntry {
  entryId: string;
  transactionId: string;
  period: string;
  date: string;
  storeId: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  referenceType: string;
  referenceId: string | null;
  createdBy: string | null;
}

export interface AccountBalance {
  accountId: string;
  accountName: string;
  accountType: string;
  storeId?: string | null;
  debitTotal: number;
  creditTotal: number;
  balance: number;
  /** Running balance (debit − credit) before the period starts. */
  openingBalance?: number;
  /** Running balance (debit − credit) at the end of the period. */
  closingBalance?: number;
  lastReconciliation?: AccountReconciliationSummary | null;
}

export interface AccountReconciliationSummary {
  asOfDate: string;
  ledgerBalance: number;
  countedBalance: number;
  variance: number;
  notes: string;
  createdAt: string;
}

export interface BalanceSummary {
  type: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  accounts: AccountBalance[];
}

export interface AccountingPort {
  createTransaction(
    legs: JournalLeg[],
    storeId: string,
    date?: string,
    createdBy?: string | null,
  ): Promise<JournalTransaction>;
  findByAccount(accountId: string, period?: string): Promise<JournalEntry[]>;
  findByAccountDateRange(accountId: string, from: string, to: string): Promise<JournalEntry[]>;
  findByReference(referenceType: string, referenceId: string): Promise<JournalEntry[]>;
  findByStore(storeId: string, period: string): Promise<JournalEntry[]>;
  deleteByReference(referenceType: string, referenceId: string): Promise<void>;
  calculateBalance(accountId: string, throughDate?: string): Promise<AccountBalance>;
  calculateAllBalances(storeId: string, period: string): Promise<AccountBalance[]>;
  getBalanceSummaryByType(storeId: string, period: string): Promise<BalanceSummary[]>;
  calculateBalancesByDateRange(storeIds: string[], from: string, to: string): Promise<BalanceSummary[]>;
}
