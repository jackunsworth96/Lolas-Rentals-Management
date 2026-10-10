// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { orcrExpiryTone } from '../src/utils/orcr-expiry.js';

/** 10 Oct 2026, noon in Manila. */
const TODAY = new Date('2026-10-10T04:00:00.000Z');

describe('orcrExpiryTone', () => {
  it('warns in amber when the expiry date is missing or unreadable', () => {
    expect(orcrExpiryTone(null, TODAY)).toBe('amber');
    expect(orcrExpiryTone(undefined, TODAY)).toBe('amber');
    expect(orcrExpiryTone('  ', TODAY)).toBe('amber');
    expect(orcrExpiryTone('not-a-date', TODAY)).toBe('amber');
  });

  it('turns amber from 15 days out through exactly 2 calendar months', () => {
    expect(orcrExpiryTone('2026-10-25', TODAY)).toBe('amber');
    expect(orcrExpiryTone('2026-12-10', TODAY)).toBe('amber');
  });

  it('stays uncolored when expiry is more than 2 calendar months away', () => {
    expect(orcrExpiryTone('2026-12-11', TODAY)).toBe(null);
  });

  it('turns red within 14 days, on the expiry day, and when overdue', () => {
    expect(orcrExpiryTone('2026-10-24', TODAY)).toBe('red');
    expect(orcrExpiryTone('2026-10-10', TODAY)).toBe('red');
    expect(orcrExpiryTone('2026-10-09', TODAY)).toBe('red');
  });

  it('uses the Manila calendar date around midnight', () => {
    const justAfterMidnightManila = new Date('2026-10-09T16:00:00.000Z');
    const justBeforeMidnightManila = new Date('2026-10-09T15:59:00.000Z');
    expect(orcrExpiryTone('2026-12-10', justAfterMidnightManila)).toBe('amber');
    expect(orcrExpiryTone('2026-12-10', justBeforeMidnightManila)).toBe(null);
  });

  it('clamps a 2-month window that lands on a shorter month', () => {
    const dec31 = new Date('2026-12-31T04:00:00.000Z');
    expect(orcrExpiryTone('2027-02-28', dec31)).toBe('amber');
    expect(orcrExpiryTone('2027-03-01', dec31)).toBe(null);
  });
});
