import {
  type MiscSaleRepository,
  type MiscSale,
  type AccountingPort,
  type JournalLeg,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface UpdateSaleInput {
  saleId: string;
  date?: string;
  description?: string;
  category?: string | null;
  amount?: number;
  receivedInto?: string;
  incomeAccountId?: string;
  employeeId?: string | null;
}

export async function updateSale(
  input: UpdateSaleInput,
  deps: { miscSales: MiscSaleRepository; accounting: AccountingPort },
): Promise<{ sale: MiscSale }> {
  const existing = await deps.miscSales.findById(input.saleId);
  if (!existing) throw new DomainError('Misc sale not found');

  const updated: MiscSale = {
    ...existing,
    date: input.date ?? existing.date,
    description: input.description ?? existing.description,
    category: input.category !== undefined ? input.category : existing.category,
    amount: input.amount ?? existing.amount,
    receivedInto: input.receivedInto ?? existing.receivedInto,
    incomeAccountId: input.incomeAccountId ?? existing.incomeAccountId,
    employeeId: input.employeeId !== undefined ? input.employeeId : existing.employeeId,
  };

  if (updated.amount <= 0) throw new DomainError('Sale amount must be positive');

  await deps.miscSales.save(updated);

  await deps.accounting.deleteByReference('misc_sale', existing.id);

  const receivedInto = updated.receivedInto;
  const incomeAccountId = updated.incomeAccountId;
  if (receivedInto && incomeAccountId) {
    const amount = Money.php(updated.amount);
    const desc = `Misc sale: ${updated.description}`;
    const legs: JournalLeg[] = [
      {
        entryId: randomUUID(),
        accountId: receivedInto,
        debit: amount,
        credit: Money.zero(),
        description: desc,
        referenceType: 'misc_sale',
        referenceId: existing.id,
      },
      {
        entryId: randomUUID(),
        accountId: incomeAccountId,
        debit: Money.zero(),
        credit: amount,
        description: desc,
        referenceType: 'misc_sale',
        referenceId: existing.id,
      },
    ];

    await deps.accounting.createTransaction(legs, existing.storeId);
  }

  return { sale: updated };
}
