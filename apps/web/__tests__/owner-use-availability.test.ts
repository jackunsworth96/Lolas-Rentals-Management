// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ownerUseOverlapsBooking,
  ownerUsePeriodsFromVehicle,
} from '../src/utils/owner-use-availability.js';

const ownerUse = [{ startsAt: '2026-10-16T00:00:00+08:00', endsAt: '2026-10-23T17:00:00+08:00' }];

describe('ownerUseOverlapsBooking', () => {
  it('hides a vehicle when the booking overlaps its owner-use period', () => {
    expect(ownerUseOverlapsBooking(
      ownerUse,
      '2026-10-22T09:00:00+08:00',
      '2026-11-10T16:00:00+08:00',
    )).toBe(true);
  });

  it('keeps a vehicle when the booking starts after owner use ends', () => {
    expect(ownerUseOverlapsBooking(
      ownerUse,
      '2026-10-23T17:00:00+08:00',
      '2026-10-25T09:00:00+08:00',
    )).toBe(false);
  });

  it('keeps a vehicle on owner use until further notice for every later booking', () => {
    expect(ownerUseOverlapsBooking(
      [{ startsAt: '2026-10-16T00:00:00+08:00', endsAt: null }],
      '2027-01-01T09:00:00+08:00',
      '2027-01-02T09:00:00+08:00',
    )).toBe(true);
  });

  it('keeps a vehicle when the booking ends as owner use starts', () => {
    expect(ownerUseOverlapsBooking(
      ownerUse,
      '2026-10-14T09:00:00+08:00',
      '2026-10-16T00:00:00+08:00',
    )).toBe(false);
  });

  it('does not hide vehicles when the booking window is missing', () => {
    expect(ownerUseOverlapsBooking(ownerUse, '', '2026-10-20T09:00:00+08:00')).toBe(false);
  });
});

describe('ownerUsePeriodsFromVehicle', () => {
  it('reads scheduled periods from the fleet payload', () => {
    expect(ownerUsePeriodsFromVehicle({
      ownerUsePeriods: ownerUse,
      activeOwnerUse: null,
    })).toEqual(ownerUse);
  });

  it('falls back to the active period when the list is absent', () => {
    expect(ownerUsePeriodsFromVehicle({
      activeOwnerUse: ownerUse[0],
    })).toEqual(ownerUse);
  });
});
