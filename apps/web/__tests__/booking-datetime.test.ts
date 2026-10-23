// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bookingDatetimeISO } from '../src/utils/booking-datetime.js';

describe('booking datetime timezone', () => {
  it.each([
    ['', ''],
    ['2026-11-01T09:15', '2026-11-01T09:15:00+08:00'],
    ['2026-11-01T09:15:00', '2026-11-01T09:15:00+08:00'],
    ['2026-11-01T01:15:00Z', '2026-11-01T01:15:00Z'],
    ['2026-11-01T09:15:00+08:00', '2026-11-01T09:15:00+08:00'],
  ])('normalizes %s as Manila shop time', (value, expected) => {
    expect(bookingDatetimeISO(value)).toBe(expected);
  });
});
