import { describe, expect, it } from 'vitest';
import { assertStoreOpenForBooking, storeClosedDayName, storeClosedProblem } from '@lolas/shared';
import { resolveWindow, type CounterContext } from '../src/use-cases/counter/counter-booking.js';

describe('store closed days', () => {
  it('closes Christmas Day and New Year\'s Day every year', () => {
    expect(storeClosedDayName('2026-12-25')).toBe('Christmas Day');
    expect(storeClosedDayName('2027-01-01')).toBe("New Year's Day");
    expect(storeClosedDayName('2030-12-25T10:15:00+08:00')).toBe('Christmas Day');
  });

  it('leaves the days either side open', () => {
    expect(storeClosedDayName('2026-12-24T16:45:00+08:00')).toBeNull();
    expect(storeClosedDayName('2026-12-26T09:15:00+08:00')).toBeNull();
    expect(storeClosedDayName('2026-12-31T16:45:00+08:00')).toBeNull();
  });

  it('uses the Manila calendar date, not UTC', () => {
    // 25 Dec 01:00 Manila is still 24 Dec in UTC.
    expect(storeClosedDayName('2026-12-24T17:00:00Z')).toBe('Christmas Day');
    // 26 Dec 07:00 Manila is 25 Dec in UTC.
    expect(storeClosedDayName('2026-12-25T23:00:00Z')).toBeNull();
  });

  it('allows a rental that runs through a closed day', () => {
    expect(storeClosedProblem('2026-12-23T10:15:00+08:00', '2026-12-27T10:15:00+08:00')).toBeNull();
  });

  it('rejects a pickup or return on a closed day with a clear reason', () => {
    expect(storeClosedProblem('2026-12-25T10:15:00+08:00', '2026-12-27T10:15:00+08:00')).toMatch(/closed on Christmas Day.*collections/);
    expect(storeClosedProblem('2026-12-29T10:15:00+08:00', '2027-01-01T10:15:00+08:00')).toMatch(/closed on New Year's Day.*returns/);
    expect(() => assertStoreOpenForBooking('2026-12-20T10:15:00+08:00', '2026-12-25T10:15:00+08:00'))
      .toThrow(/closed on Christmas Day/);
  });

  it('blocks counter tablet bookings that would start or end on a closed day', () => {
    const ctx = { mode: 'scheduled' } as CounterContext;
    const now = new Date('2026-12-20T08:00:00+08:00').getTime();
    expect(() => resolveWindow(ctx, 2, '2026-12-23T10:15:00+08:00', now)).toThrow(/closed on Christmas Day/);
    expect(() => resolveWindow(ctx, 3, '2026-12-23T10:15:00+08:00', now)).not.toThrow();
  });
});
