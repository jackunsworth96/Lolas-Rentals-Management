import { describe, expect, it } from 'vitest';
import {
  DAY_MS, HANDOVER_MS, heldForUnassigned, searchRacks, searchUnits, snapToSlot, vehicleTimeline,
  type FixedBlock, type FinderVehicle,
} from '../src/lib/availability-finder.js';
import {
  assignProtectionLabels, blockingPartners, bookableUnits, partnerAllowances, type ProtectionData,
} from '../src/lib/partner-protection.js';

const at = (s: string) => Date.parse(`${s}+08:00`);
const NOW = at('2026-11-05T10:00:00');
const HOUR = 60 * 60 * 1000;

function rental(pickup: number, dropoff: number, extra: Partial<FixedBlock> = {}): FixedBlock {
  return {
    start: pickup, end: dropoff + HANDOVER_MS, kind: 'order', reference: 'LR-1', customerName: null,
    orderId: 'o1', rawOrderId: null, pickedUp: pickup <= NOW, overdue: false, ...extra,
  };
}
const vehicle = (id: string): FinderVehicle => ({ id, name: id, modelId: 'beat', status: 'Available', surfRack: false });

describe('snapToSlot', () => {
  it('keeps times inside business hours and moves the rest to 09:15', () => {
    expect(snapToSlot(at('2026-11-05T10:00:00'))).toBe(at('2026-11-05T10:00:00'));
    expect(snapToSlot(at('2026-11-05T07:00:00'))).toBe(at('2026-11-05T09:15:00'));
    expect(snapToSlot(at('2026-11-05T20:44:00'))).toBe(at('2026-11-06T09:15:00'));
  });
});

describe('vehicleTimeline', () => {
  it('says how long a free vehicle is free for', () => {
    const t = vehicleTimeline([rental(at('2026-11-08T09:00:00'), at('2026-11-10T09:00:00'))], NOW);
    expect(t.state).toBe('free');
    expect(t.nextFreeAt).toBe(NOW);
    expect(t.freeUntil).toBe(at('2026-11-08T09:00:00'));
  });

  it('reports no upcoming bookings instead of a blank', () => {
    const t = vehicleTimeline([], NOW);
    expect(t.state).toBe('free');
    expect(t.freeUntil).toBeNull();
  });

  it('is next free after the return plus handover', () => {
    const t = vehicleTimeline([rental(at('2026-11-03T09:00:00'), at('2026-11-05T14:00:00'))], NOW);
    expect(t.state).toBe('on_rent');
    expect(t.nextFreeAt).toBe(at('2026-11-05T14:30:00'));
    expect(t.freeUntil).toBeNull();
  });

  it('rolls a late return to the next morning', () => {
    const t = vehicleTimeline([rental(at('2026-11-03T09:00:00'), at('2026-11-05T17:00:00'))], NOW);
    expect(t.nextFreeAt).toBe(at('2026-11-06T09:15:00'));
  });

  it('skips a gap that closes before it can be used', () => {
    const t = vehicleTimeline([
      rental(at('2026-11-03T09:00:00'), at('2026-11-05T17:00:00')),
      rental(at('2026-11-06T09:00:00'), at('2026-11-07T12:00:00'), { pickedUp: false }),
    ], NOW);
    expect(t.nextFreeAt).toBe(at('2026-11-07T12:30:00'));
  });

  it('never frees up while owner use has no end date', () => {
    const t = vehicleTimeline([{ ...rental(at('2026-11-01T09:00:00'), 0), kind: 'owner_use', end: Number.POSITIVE_INFINITY }], NOW);
    expect(t.state).toBe('owner_use');
    expect(t.nextFreeAt).toBeNull();
  });
});

describe('searchUnits', () => {
  const base = { floating: [], fromMs: NOW, lengthMs: DAY_MS, horizonMs: 60 * DAY_MS };

  it('gives one now and the second after a return', () => {
    const blocks = new Map([['B', [rental(at('2026-11-03T09:00:00'), at('2026-11-05T14:00:00'))]]]);
    const answers = searchUnits({ ...base, vehicles: [vehicle('A'), vehicle('B')], blocks, quantity: 2 });
    expect(answers.map((a) => [a.startsAt, a.vehicleId])).toEqual([[NOW, 'A'], [at('2026-11-05T14:30:00'), 'B']]);
  });

  it('skips a vehicle whose free gap is shorter than the rental', () => {
    const blocks = new Map([['A', [rental(at('2026-11-06T09:00:00'), at('2026-11-06T12:00:00'), { pickedUp: false })]]]);
    const answers = searchUnits({ ...base, vehicles: [vehicle('A')], blocks, quantity: 1, lengthMs: 3 * DAY_MS });
    expect(answers[0].startsAt).toBe(at('2026-11-06T12:30:00'));
  });

  it('holds a free vehicle back for an unassigned booking', () => {
    const floating = [{ start: NOW + HOUR, end: NOW + 2 * DAY_MS }];
    const answers = searchUnits({ ...base, vehicles: [vehicle('A'), vehicle('B')], blocks: new Map(), floating, quantity: 2 });
    expect(answers[0].startsAt).toBe(NOW);
    expect(answers[1].startsAt).toBeGreaterThanOrEqual(NOW + 2 * DAY_MS);
  });

  it('respects the allocation cap', () => {
    const answers = searchUnits({
      ...base, vehicles: [vehicle('A'), vehicle('B')], blocks: new Map(), quantity: 2,
      extraCandidates: [at('2026-11-07T09:15:00')],
      capacity: (start) => (start < at('2026-11-07T09:15:00') ? 1 : 2),
    });
    expect(answers.map((a) => a.startsAt)).toEqual([NOW, at('2026-11-07T09:15:00')]);
  });

  it('never answers the k-th unit before the (k-1)-th', () => {
    const blocks = new Map([
      ['A', [rental(at('2026-11-04T09:00:00'), at('2026-11-06T10:00:00'))]],
      ['B', [rental(at('2026-11-04T09:00:00'), at('2026-11-05T15:00:00'))]],
      ['C', [rental(at('2026-11-04T09:00:00'), at('2026-11-08T11:00:00'))]],
    ]);
    const answers = searchUnits({ ...base, vehicles: ['A', 'B', 'C'].map(vehicle), blocks, quantity: 3 });
    expect(answers).toHaveLength(3);
    for (let i = 1; i < answers.length; i++) expect(answers[i].startsAt).toBeGreaterThanOrEqual(answers[i - 1].startsAt);
  });
});

describe('heldForUnassigned', () => {
  it('flags the only vehicle an unassigned booking can use', () => {
    const blocks = new Map([['B', [rental(at('2026-11-03T09:00:00'), at('2026-11-09T09:00:00'))]]]);
    const held = heldForUnassigned(['A', 'B'], (id) => blocks.get(id) ?? [], [{ start: NOW + HOUR, end: NOW + DAY_MS }], { start: NOW, end: NOW + DAY_MS });
    expect([...held]).toEqual(['A']);
  });

  it('holds one of two interchangeable bikes for one unassigned booking', () => {
    const held = heldForUnassigned(['A', 'B'], () => [], [{ start: NOW + HOUR, end: NOW + DAY_MS }], { start: NOW, end: NOW + DAY_MS });
    expect(held.size).toBe(1);
  });
});

describe('partner protection', () => {
  const BRAVO = 'bravo';
  const protection = (extra: Partial<ProtectionData> = {}): ProtectionData => ({
    enabled: true,
    partnerNames: new Map([[BRAVO, 'Bravo Beach Resort']]),
    baselines: [
      { partnerId: BRAVO, vehicleType: 'bike', month: '2026-11-01', qty: 1 },
      { partnerId: BRAVO, vehicleType: 'bike', month: '2026-12-01', qty: 1 },
    ],
    overrides: [],
    units: ['A', 'B', 'C'].map((vehicleId) => ({ vehicleId, vehicleType: 'bike' })),
    unavailable: [],
    commitments: [],
    ...extra,
  });
  const window = [NOW, NOW + DAY_MS] as const;

  it('keeps one bike back from walk-ins but not from Bravo', () => {
    const d = protection();
    expect(bookableUnits(d, 'bike', null, ...window)).toBe(2);
    expect(bookableUnits(d, 'bike', BRAVO, ...window)).toBe(3);
  });

  it('blocks a walk-in when the only free bike is Bravo\'s', () => {
    const d = protection({
      commitments: [
        { partnerId: null, vehicleType: 'bike', pool: 'shared', start: NOW - DAY_MS, end: NOW + 3 * DAY_MS },
        { partnerId: null, vehicleType: 'bike', pool: 'shared', start: NOW - DAY_MS, end: NOW + 3 * DAY_MS },
      ],
    });
    expect(bookableUnits(d, 'bike', null, ...window)).toBe(0);
    expect(bookableUnits(d, 'bike', BRAVO, ...window)).toBe(1);
    expect(blockingPartners(d, 'bike', null, ...window).map((p) => p.partnerName)).toEqual(['Bravo Beach Resort']);
  });

  it('labels nothing while Bravo already has its bike out', () => {
    const d = protection({ commitments: [{ partnerId: BRAVO, vehicleType: 'bike', pool: 'guaranteed', start: NOW - DAY_MS, end: NOW + DAY_MS }] });
    const allowances = partnerAllowances(d, 'bike', NOW);
    expect(allowances[0]).toMatchObject({ allowance: 1, inUse: 1, unused: 0 });
    expect(assignProtectionLabels([{ id: 'B' }, { id: 'C' }], allowances).size).toBe(0);
    expect(bookableUnits(d, 'bike', null, ...window)).toBe(2);
  });

  it('moves the label to another free bike when the first goes into maintenance', () => {
    const d = protection({ unavailable: [{ vehicleId: 'A', start: NOW - HOUR, end: Number.POSITIVE_INFINITY }] });
    const labels = assignProtectionLabels([{ id: 'B' }, { id: 'C' }], partnerAllowances(d, 'bike', NOW));
    expect([...labels.keys()]).toEqual(['B']);
    expect(labels.get('B')?.partnerName).toBe('Bravo Beach Resort');
    expect(bookableUnits(d, 'bike', null, ...window)).toBe(1);
  });

  it('applies the tightest moment of the rental, including a change of month', () => {
    const d = protection({
      baselines: [
        { partnerId: BRAVO, vehicleType: 'bike', month: '2026-11-01', qty: 0 },
        { partnerId: BRAVO, vehicleType: 'bike', month: '2026-12-01', qty: 2 },
      ],
    });
    expect(bookableUnits(d, 'bike', null, at('2026-11-29T10:00:00'), at('2026-12-02T10:00:00'))).toBe(1);
  });

  it('protects nothing when allocations are switched off', () => {
    expect(bookableUnits(protection({ enabled: false }), 'bike', null, ...window)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('searchRacks', () => {
  it('finds the next rack once one comes back', () => {
    const intervals = [
      { startMs: NOW - DAY_MS, endMs: at('2026-11-06T11:00:00'), quantity: 1 },
      { startMs: NOW - DAY_MS, endMs: at('2026-11-08T11:00:00'), quantity: 1 },
    ];
    const answers = searchRacks({ intervals, total: 2, fromMs: NOW, lengthMs: DAY_MS, quantity: 2, horizonMs: 60 * DAY_MS, rackBikesFree: () => 5 });
    expect(answers.map((a) => a.startsAt)).toEqual([at('2026-11-06T11:00:00'), at('2026-11-08T11:00:00')]);
  });

  it('is capped by free rack-fitted bikes', () => {
    const answers = searchRacks({ intervals: [], total: 4, fromMs: NOW, lengthMs: DAY_MS, quantity: 2, horizonMs: DAY_MS, rackBikesFree: () => 1 });
    expect(answers).toHaveLength(1);
  });
});
