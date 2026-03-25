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
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface BalanceSummary {
  type: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  accounts: AccountBalance[];
}

export interface AccountingPort {
  createTransaction(legs: JournalLeg[], storeId: string): Promise<JournalTransaction>;
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
