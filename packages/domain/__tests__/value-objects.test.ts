import { describe, it, expect } from 'vitest';
import { Money } from '../src/value-objects/money.js';
import { StoreId } from '../src/value-objects/store-id.js';
import { DateRange } from '../src/value-objects/date-range.js';
import { Period } from '../src/value-objects/period.js';
import { OrderStatus } from '../src/value-objects/order-status.js';
import { InvalidAmountError } from '../src/errors/domain-error.js';

describe('Money', () => {
  it('creates from a number via php()', () => {
    const m = Money.php(100);
    expect(m.amount).toBe(100);
  });

  it('rounds to two decimal places', () => {
    const m = Money.php(10.999);
    expect(m.amount).toBe(11);
  });

  it('creates zero', () => {
    const z = Money.zero();
    expect(z.amount).toBe(0);
    expect(z.isZero()).toBe(true);
  });

  it('adds two Money values', () => {
    const result = Money.php(10).add(Money.php(20.5));
    expect(result.amount).toBe(30.5);
  });

  it('subtracts two Money values', () => {
    const result = Money.php(50).subtract(Money.php(20));
    expect(result.amount).toBe(30);
  });

  it('multiplies by a factor', () => {
    const result = Money.php(25).multiply(4);
    expect(result.amount).toBe(100);
  });

  it('rejects NaN', () => {
    expect(() => Money.php(NaN)).toThrow(InvalidAmountError);
  });

  it('rejects Infinity', () => {
    expect(() => Money.php(Infinity)).toThrow(InvalidAmountError);
  });

  it('rejects NaN factor in multiply', () => {
    expect(() => Money.php(10).multiply(NaN)).toThrow(InvalidAmountError);
  });

  it('reports positive / negative / zero correctly', () => {
    expect(Money.php(5).isPositive()).toBe(true);
    expect(Money.php(-5).isNegative()).toBe(true);
    expect(Money.zero().isPositive()).toBe(false);
  });

  it('equals another Money with the same amount', () => {
    expect(Money.php(42).equals(Money.php(42))).toBe(true);
    expect(Money.php(42).equals(Money.php(43))).toBe(false);
  });

  it('formats currency with peso sign', () => {
    const formatted = Money.php(1234.5).formatCurrency();
    expect(formatted).toContain('₱');
    expect(formatted).toContain('1,234.50');
  });

  it('formats negative currency with leading minus', () => {
    const formatted = Money.php(-500).formatCurrency();
    expect(formatted).toMatch(/^-₱/);
  });

  it('toNumber returns the raw amount', () => {
    expect(Money.php(99.99).toNumber()).toBe(99.99);
  });

  it('is frozen (immutable)', () => {
    const m = Money.php(10);
    expect(Object.isFrozen(m)).toBe(true);
  });
});

describe('StoreId', () => {
  it('creates from a non-empty string', () => {
    const id = StoreId.from('store-1');
    expect(id.value).toBe('store-1');
  });

  it('trims whitespace', () => {
    const id = StoreId.from('  abc  ');
    expect(id.value).toBe('abc');
  });

  it('rejects empty string', () => {
    expect(() => StoreId.from('')).toThrow('StoreId cannot be empty');
  });

  it('rejects whitespace-only string', () => {
    expect(() => StoreId.from('   ')).toThrow('StoreId cannot be empty');
  });

  it('equals another StoreId with the same value', () => {
    const a = StoreId.from('X');
    const b = StoreId.from('X');
    expect(a.equals(b)).toBe(true);
  });

  it('does not equal a StoreId with a different value', () => {
    expect(StoreId.from('A').equals(StoreId.from('B'))).toBe(false);
  });

  it('toString returns value', () => {
    expect(StoreId.from('hello').toString()).toBe('hello');
  });
});

describe('DateRange', () => {
  const jan1 = new Date('2025-01-01');
  const jan10 = new Date('2025-01-10');
  const jan15 = new Date('2025-01-15');
  const jan20 = new Date('2025-01-20');

  it('creates a valid range', () => {
    const r = DateRange.of(jan1, jan10);
    expect(r.start).toEqual(jan1);
    expect(r.end).toEqual(jan10);
  });

  it('throws when end is before start', () => {
    expect(() => DateRange.of(jan10, jan1)).toThrow('Invalid date range');
  });

  it('allows same-day range', () => {
    expect(() => DateRange.of(jan1, jan1)).not.toThrow();
  });

  it('contains a date within the range', () => {
    const r = DateRange.of(jan1, jan20);
    expect(r.contains(jan10)).toBe(true);
  });

  it('does not contain a date outside the range', () => {
    const r = DateRange.of(jan1, jan10);
    expect(r.contains(jan20)).toBe(false);
  });

  it('contains boundary dates (inclusive)', () => {
    const r = DateRange.of(jan1, jan10);
    expect(r.contains(jan1)).toBe(true);
    expect(r.contains(jan10)).toBe(true);
  });

  it('detects overlapping ranges', () => {
    const a = DateRange.of(jan1, jan15);
    const b = DateRange.of(jan10, jan20);
    expect(a.overlaps(b)).toBe(true);
  });

  it('detects non-overlapping ranges', () => {
    const a = DateRange.of(jan1, new Date('2025-01-05'));
    const b = DateRange.of(jan10, jan20);
    expect(a.overlaps(b)).toBe(false);
  });

  it('calculates duration in days', () => {
    const r = DateRange.of(jan1, jan10);
    expect(r.durationDays()).toBe(9);
  });
});

describe('Period', () => {
  it('firstHalf covers the 1st–15th', () => {
    const p = Period.firstHalf(2025, 3);
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getDate()).toBe(15);
    expect(p.start.getMonth()).toBe(2);
  });

  it('secondHalf covers the 16th–last day', () => {
    const p = Period.secondHalf(2025, 3);
    expect(p.start.getDate()).toBe(16);
    expect(p.end.getDate()).toBe(31);
  });

  it('secondHalf of February ends on 28 (non-leap year)', () => {
    const p = Period.secondHalf(2025, 2);
    expect(p.end.getDate()).toBe(28);
  });

  it('contains a date within the period', () => {
    const p = Period.firstHalf(2025, 6);
    expect(p.contains(new Date(2025, 5, 10))).toBe(true);
  });

  it('does not contain a date outside the period', () => {
    const p = Period.firstHalf(2025, 6);
    expect(p.contains(new Date(2025, 5, 20))).toBe(false);
  });

  it('isEndOfMonth is true for secondHalf', () => {
    const p = Period.secondHalf(2025, 1);
    expect(p.isEndOfMonth).toBe(true);
  });

  it('isEndOfMonth is false for firstHalf', () => {
    const p = Period.firstHalf(2025, 1);
    expect(p.isEndOfMonth).toBe(false);
  });
});

describe('OrderStatus', () => {
  it('creates from a valid string', () => {
    const s = OrderStatus.from('active');
    expect(s.value).toBe('active');
  });

  it('normalizes case and whitespace', () => {
    const s = OrderStatus.from('  Active  ');
    expect(s.value).toBe('active');
  });

  it('rejects invalid status', () => {
    expect(() => OrderStatus.from('invalid')).toThrow('Invalid order status');
  });

  it('unprocessed → active', () => {
    const s = OrderStatus.Unprocessed;
    expect(s.canTransitionTo(OrderStatus.Active)).toBe(true);
    expect(s.transitionTo(OrderStatus.Active).value).toBe('active');
  });

  it('unprocessed → cancelled', () => {
    expect(
      OrderStatus.Unprocessed.canTransitionTo(OrderStatus.Cancelled),
    ).toBe(true);
  });

  it('active → confirmed', () => {
    expect(OrderStatus.Active.canTransitionTo(OrderStatus.Confirmed)).toBe(
      true,
    );
  });

  it('active → completed', () => {
    expect(OrderStatus.Active.canTransitionTo(OrderStatus.Completed)).toBe(
      true,
    );
  });

  it('active → cancelled', () => {
    expect(OrderStatus.Active.canTransitionTo(OrderStatus.Cancelled)).toBe(
      true,
    );
  });

  it('confirmed → completed', () => {
    expect(OrderStatus.Confirmed.canTransitionTo(OrderStatus.Completed)).toBe(
      true,
    );
  });

  it('confirmed → cancelled', () => {
    expect(OrderStatus.Confirmed.canTransitionTo(OrderStatus.Cancelled)).toBe(
      true,
    );
  });

  it('completed is terminal', () => {
    expect(OrderStatus.Completed.canTransitionTo(OrderStatus.Active)).toBe(
      false,
    );
    expect(OrderStatus.Completed.canTransitionTo(OrderStatus.Cancelled)).toBe(
      false,
    );
  });

  it('cancelled is terminal', () => {
    expect(OrderStatus.Cancelled.canTransitionTo(OrderStatus.Active)).toBe(
      false,
    );
  });

  it('transitionTo throws on invalid transition', () => {
    expect(() =>
      OrderStatus.Completed.transitionTo(OrderStatus.Active),
    ).toThrow();
  });

  it('equals checks value identity', () => {
    expect(OrderStatus.Active.equals(OrderStatus.from('active'))).toBe(true);
  });

  it('toString returns the value string', () => {
    expect(OrderStatus.Active.toString()).toBe('active');
  });
});
