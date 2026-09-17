import { describe, expect, it } from 'vitest';
import { collectStoreIds } from '../src/middleware/operational-store.js';

describe('operational store targeting', () => {
  it('collects store identifiers from nested mutation payloads', () => {
    const ids = new Set<string>();
    collectStoreIds({ storeId: 'store-lolas', rows: [{ store_id: 'store-bass' }] }, ids);
    expect([...ids].sort()).toEqual(['store-bass', 'store-lolas']);
  });

  it('does not mistake unrelated identifiers for stores', () => {
    const ids = new Set<string>();
    collectStoreIds({ orderId: 'store-bass', customer: { id: 'store-bass' } }, ids);
    expect([...ids]).toEqual([]);
  });
});
