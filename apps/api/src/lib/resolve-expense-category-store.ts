import { COMPANY_STORE_ID } from '@lolas/shared';

/**
 * Expense categories are mapped to shop accounts (e.g. store-lolas), not the
 * `company` chart-of-accounts bucket. Using `company` as the lookup store
 * filters every category out.
 */
export function resolveExpenseCategoryStoreId(
  userStores: string[],
  requestedStoreId?: string,
): string | null {
  const requested = requestedStoreId?.trim() ?? '';
  const operational = userStores.find((id) => id !== COMPANY_STORE_ID);
  return (requested && requested !== COMPANY_STORE_ID ? requested : '')
    || operational
    || requested
    || userStores[0]
    || null;
}

export function canAccessExpenseCategoryStore(userStores: string[], storeId: string): boolean {
  if (userStores.length === 0) return true;
  return userStores.includes(storeId) || userStores.includes(COMPANY_STORE_ID);
}
