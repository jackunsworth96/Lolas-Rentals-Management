import { describe, it, expect } from 'vitest';
import { UnbalancedTransactionError } from '../src/errors/domain-error.js';
import {
  JournalTransaction,
  InvalidJournalLegError,
  type JournalLeg,
  type JournalTransactionProps,
} from '../src/entities/journal-transaction.js';
import { Money } from '../src/value-objects/money.js';

function makeLeg(overrides: Partial<JournalLeg> = {}): JournalLeg {
  return {
    entryId: 'leg-1',
    accountId: 'acc-1',
    debit: Money.zero(),
    credit: Money.zero(),
    description: null,
    referenceType: 'order',
    referenceId: null,
    ...overrides,
  };
}

function makeBalancedProps(
  overrides: Partial<JournalTransactionProps> = {},
): JournalTransactionProps {
  return {
    transactionId: 'txn-1',
    period: '2025-03-1H',
    date: '2025-03-05',
    storeId: 'store-1',
    legs: [
      makeLeg({
        entryId: 'leg-1',
        accountId: 'cash',
        debit: Money.php(1000),
        credit: Money.zero(),
      }),
      makeLeg({
        entryId: 'leg-2',
        accountId: 'revenue',
        debit: Money.zero(),
        credit: Money.php(1000),
      }),
    ],
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('JournalTransaction', () => {
  it('creates a balanced transaction successfully', () => {
    const txn = JournalTransaction.create(makeBalancedProps());
    expect(txn.transactionId).toBe('txn-1');
    expect(txn.legs).toHaveLength(2);
  });

  it('throws on unbalanced transaction', () => {
    expect(() =>
      JournalTransaction.create(
        makeBalancedProps({
          legs: [
            makeLeg({
              entryId: 'leg-1',
              debit: Money.php(1000),
              credit: Money.zero(),
            }),
            makeLeg({
              entryId: 'leg-2',
              debit: Money.zero(),
              credit: Money.php(500),
            }),
          ],
        }),
      ),
    ).toThrow(UnbalancedTransactionError);
  });

  it('throws on single-leg transaction (only debit)', () => {
    expect(() =>
      JournalTransaction.create(
        makeBalancedProps({
          legs: [
            makeLeg({
              entryId: 'leg-1',
              debit: Money.php(1000),
              credit: Money.zero(),
            }),
          ],
        }),
      ),
    ).toThrow(UnbalancedTransactionError);
  });

  it('throws when a leg has both debit and credit positive', () => {
    expect(() =>
      JournalTransaction.create(
        makeBalancedProps({
          legs: [
            makeLeg({
              entryId: 'bad-leg',
              debit: Money.php(500),
              credit: Money.php(500),
            }),
          ],
        }),
      ),
    ).toThrow(InvalidJournalLegError);
  });

  it('throws when a leg has both debit and credit zero', () => {
    expect(() =>
      JournalTransaction.create(
        makeBalancedProps({
          legs: [
            makeLeg({
              entryId: 'zero-leg',
              debit: Money.zero(),
              credit: Money.zero(),
            }),
            makeLeg({
              entryId: 'leg-2',
              debit: Money.php(100),
              credit: Money.zero(),
            }),
          ],
        }),
      ),
    ).toThrow(InvalidJournalLegError);
  });

  it('isBalanced returns true for a valid transaction', () => {
    const txn = JournalTransaction.create(makeBalancedProps());
    expect(txn.isBalanced()).toBe(true);
  });

  it('exposes readonly legs', () => {
    const txn = JournalTransaction.create(makeBalancedProps());
    expect(Object.isFrozen(txn.legs)).toBe(true);
  });

  it('preserves metadata fields', () => {
    const txn = JournalTransaction.create(makeBalancedProps());
    expect(txn.period).toBe('2025-03-1H');
    expect(txn.date).toBe('2025-03-05');
    expect(txn.storeId).toBe('store-1');
    expect(txn.createdBy).toBe('user-1');
  });

  it('handles multi-leg balanced transactions', () => {
    const txn = JournalTransaction.create(
      makeBalancedProps({
        legs: [
          makeLeg({
            entryId: 'a',
            accountId: 'cash',
            debit: Money.php(500),
            credit: Money.zero(),
          }),
          makeLeg({
            entryId: 'b',
            accountId: 'bank',
            debit: Money.php(500),
            credit: Money.zero(),
          }),
          makeLeg({
            entryId: 'c',
            accountId: 'revenue',
            debit: Money.zero(),
            credit: Money.php(1000),
          }),
        ],
      }),
    );
    expect(txn.isBalanced()).toBe(true);
    expect(txn.legs).toHaveLength(3);
  });
});
