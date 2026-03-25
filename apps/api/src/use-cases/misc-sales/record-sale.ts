import {
  type MiscSaleRepository,
  type MiscSale,
  type AccountingPort,
  type JournalLeg,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface RecordSaleInput {
  date: string;
  storeId: string;
  description: string;
  category: string | null;
  amount: number;
  receivedInto: string;
  incomeAccountId: string;
  employeeId: string | null;
}

export async function recordSale(
  input: RecordSaleInput,
  deps: { miscSales: MiscSaleRepository; accounting: AccountingPort },
): Promise<{ sale: MiscSale }> {
  if (input.amount <= 0) {
    throw new DomainError('Sale amount must be positive');
  }

  const sale: MiscSale = {
    id: randomUUID(),
    storeId: input.storeId,
    date: input.date,
    description: input.description,
    category: input.category,
    amount: input.amount,
    receivedInto: input.receivedInto,
    incomeAccountId: input.incomeAccountId,
    employeeId: input.employeeId,
    createdAt: new Date(),
  };

  await deps.miscSales.save(sale);

  const amount = Money.php(input.amount);
  const desc = `Misc sale: ${input.description}`;
  const legs: JournalLeg[] = [
    {
      entryId: randomUUID(),
      accountId: input.receivedInto,
      debit: amount,
      credit: Money.zero(),
      description: desc,
      referenceType: 'misc_sale',
      referenceId: sale.id,
    },
    {
      entryId: randomUUID(),
      accountId: input.incomeAccountId,
      debit: Money.zero(),
      credit: amount,
      description: desc,
      referenceType: 'misc_sale',
      referenceId: sale.id,
    },
  ];

  await deps.accounting.createTransaction(legs, input.storeId);

  return { sale };
}
