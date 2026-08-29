import { describe, expect, it } from 'vitest';
import {
  canAccessExpenseCategoryStore,
  resolveExpenseCategoryStoreId,
} from '../src/lib/resolve-expense-category-store.js';

describe('resolveExpenseCategoryStoreId', () => {
  it('uses the selected operational store', () => {
    expect(resolveExpenseCategoryStoreId(['company', 'store-lolas'], 'store-lolas')).toBe('store-lolas');
  });

  it('skips company when it is first in the JWT store list (Nitz / Reland)', () => {
    expect(resolveExpenseCategoryStoreId(['company', 'store-lolas'])).toBe('store-lolas');
  });

  it('keeps a single-shop assignment (Jun)', () => {
    expect(resolveExpenseCategoryStoreId(['store-lolas'])).toBe('store-lolas');
  });

  it('does not use company even when it is requested', () => {
    expect(resolveExpenseCategoryStoreId(['company', 'store-lolas'], 'company')).toBe('store-lolas');
  });
});

describe('canAccessExpenseCategoryStore', () => {
  it('allows a company-assigned user to load another store', () => {
    expect(canAccessExpenseCategoryStore(['company', 'store-lolas'], 'store-lolas')).toBe(true);
  });

  it('rejects a store the user is not assigned to', () => {
    expect(canAccessExpenseCategoryStore(['store-lolas'], 'store-bass')).toBe(false);
  });
});
