export const COMPANY_STORE_ID = 'company';
export const DEFAULT_STORE_ID = 'store-lolas';

const SOURCE_TO_STORE: Record<string, string> = {
  bass: 'store-bass',
  lolas: 'store-lolas',
};

const STORE_TO_SOURCE: Record<string, string> = {
  'store-bass': 'bass',
  'store-lolas': 'lolas',
};

export function resolveStoreFromSource(source: string): string {
  return SOURCE_TO_STORE[source] ?? DEFAULT_STORE_ID;
}

export function resolveSourceFromStore(storeId: string): string {
  return STORE_TO_SOURCE[storeId] ?? 'lolas';
}
