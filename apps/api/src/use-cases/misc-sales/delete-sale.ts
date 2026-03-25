import { type MiscSaleRepository, type AccountingPort, DomainError } from '@lolas/domain';

export interface DeleteSaleInput {
  saleId: string;
}

export async function deleteSale(
  input: DeleteSaleInput,
  deps: { miscSales: MiscSaleRepository; accounting: AccountingPort },
): Promise<void> {
  if (!input.saleId) throw new DomainError('Sale ID is required');

  const sale = await deps.miscSales.findById(input.saleId);
  if (!sale) throw new DomainError('Misc sale not found');

  await deps.accounting.deleteByReference('misc_sale', sale.id);
  await deps.miscSales.delete(input.saleId);
}
