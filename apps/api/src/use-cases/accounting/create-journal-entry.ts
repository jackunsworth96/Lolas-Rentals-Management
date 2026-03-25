import {
  JournalTransaction,
  Money,
  type JournalLeg,
  type AccountingPort,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface CreateJournalEntryInput {
  storeId: string;
  date: string;
  period: string;
  createdBy: string;
  legs: Array<{
    accountId: string;
    debit: number;
    credit: number;
    description: string | null;
    referenceType: string;
    referenceId: string | null;
  }>;
}

export async function createJournalEntry(
  input: CreateJournalEntryInput,
  deps: { accounting: AccountingPort },
): Promise<JournalTransaction> {
  const journalLegs: JournalLeg[] = input.legs.map((leg) => ({
    entryId: randomUUID(),
    accountId: leg.accountId,
    debit: Money.php(leg.debit),
    credit: Money.php(leg.credit),
    description: leg.description,
    referenceType: leg.referenceType,
    referenceId: leg.referenceId,
  }));

  const transaction = JournalTransaction.create({
    transactionId: randomUUID(),
    period: input.period,
    date: input.date,
    storeId: input.storeId,
    legs: journalLegs,
    createdBy: input.createdBy,
  });

  return deps.accounting.createTransaction(transaction.legs as JournalLeg[], input.storeId);
}
