import { describe, expect, it } from 'vitest';
import { assertBookingLeadTime, hasBookingLeadTime } from '@lolas/shared';

const receivedAt = new Date('2026-10-16T15:42:46+08:00').getTime();

describe('public booking lead time', () => {
  it('rejects the 3:45 slot when the request arrives at 3:42', () => {
    const pickup = '2026-10-16T15:45:00+08:00';
    expect(hasBookingLeadTime(pickup, receivedAt)).toBe(false);
    expect(() => assertBookingLeadTime(pickup, receivedAt)).toThrow(/15 minutes/);
  });

  it('accepts a pickup exactly 15 minutes away', () => {
    const now = new Date('2026-10-16T15:30:00+08:00').getTime();
    expect(hasBookingLeadTime('2026-10-16T15:45:00+08:00', now)).toBe(true);
    expect(() => assertBookingLeadTime('2026-10-16T15:45:00+08:00', now)).not.toThrow();
  });

  it('accepts the next slot once 15 minutes have cleared', () => {
    expect(hasBookingLeadTime('2026-10-16T16:15:00+08:00', receivedAt)).toBe(true);
  });

  it('rejects an invalid pickup datetime', () => {
    expect(() => assertBookingLeadTime('not-a-date', receivedAt)).toThrow(/Invalid pickup datetime/);
  });
});
