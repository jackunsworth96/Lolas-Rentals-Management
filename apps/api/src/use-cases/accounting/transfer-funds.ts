import {
  JournalTransaction,
  Money,
  DomainError,
  type JournalLeg,
  type AccountingPort,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface TransferFundsInput {
  storeId: string;
  date: string;
  period: string;
  createdBy: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
}

export async function transferFunds(
  input: TransferFundsInput,
  deps: { accounting: AccountingPort },
): Promise<JournalTransaction> {
  if (input.amount <= 0) {
    throw new DomainError('Transfer amount must be positive');
  }

  if (input.fromAccountId === input.toAccountId) {
    throw new DomainError('Cannot transfer funds to the same account');
  }

  const amount = Money.php(input.amount);

  const legs: JournalLeg[] = [
    {
      entryId: randomUUID(),
      accountId: input.fromAccountId,
      debit: Money.zero(),
      credit: amount,
      description: input.description,
      referenceType: 'fund_transfer',
      referenceId: null,
    },
    {
      entryId: randomUUID(),
      accountId: input.toAccountId,
      debit: amount,
      credit: Money.zero(),
      description: input.description,
      referenceType: 'fund_transfer',
      referenceId: null,
    },
  ];

  const transaction = JournalTransaction.create({
    transactionId: randomUUID(),
    period: input.period,
    date: input.date,
    storeId: input.storeId,
    legs,
    createdBy: input.createdBy,
  });

  return deps.accounting.createTransaction(transaction.legs as JournalLeg[], input.storeId);
}
