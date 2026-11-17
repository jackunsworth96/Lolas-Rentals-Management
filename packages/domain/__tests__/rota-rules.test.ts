import { describe, it, expect } from 'vitest';
import { evaluateRotaWeek, rotaWeekDates, rotaWeekStart, type RotaKind, type RotaPerson } from '../src/services/rota-rules.js';

const week = rotaWeekDates('2026-11-23');
const person = (employeeId: string, extra: Partial<RotaPerson> = {}): RotaPerson => ({
  employeeId, name: employeeId, mode: 'rostered', countsTowardCover: true, targetDaysPerWeek: 6, ...extra,
});

function run(offDays: Record<string, Record<string, RotaKind>>, people: RotaPerson[], emergency: string[] = []) {
  return evaluateRotaWeek({
    dates: week,
    people,
    cellKind: (id, d) => offDays[id]?.[d] ?? (people.find((p) => p.employeeId === id)?.mode === 'rostered' ? 'working' : null),
    minStaff: 2,
    emergencyMinStaff: 1,
    maxOffPerDay: 1,
    emergencyDates: new Set(emergency),
  });
}

describe('rota week helpers', () => {
  it('finds the Monday of a week', () => {
    expect(rotaWeekStart('2026-11-29')).toBe('2026-11-23');
    expect(rotaWeekStart('2026-11-23')).toBe('2026-11-23');
  });

  it('lists 7 dates from Monday', () => {
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-11-23');
    expect(week[6]).toBe('2026-11-29');
  });
});

describe('evaluateRotaWeek', () => {
  const three = [person('nitz'), person('reland'), person('ronnie')];

  it('is clean when three staff each take a different day off', () => {
    const { cover, issues } = run({
      nitz: { [week[0]]: 'day_off' },
      reland: { [week[1]]: 'day_off' },
      ronnie: { [week[2]]: 'day_off' },
    }, three);
    expect(issues).toEqual([]);
    expect(cover[0]).toMatchObject({ working: 2, off: 1, status: 'ok' });
  });

  it('blocks a day that drops below minimum cover and flags the clash', () => {
    const { cover, issues } = run({
      nitz: { [week[4]]: 'day_off' },
      reland: { [week[4]]: 'day_off' },
      ronnie: { [week[2]]: 'day_off' },
    }, three);
    expect(cover[4].status).toBe('short');
    expect(issues.find((i) => i.code === 'short_cover')?.level).toBe('blocker');
    expect(issues.some((i) => i.code === 'too_many_off' && i.date === week[4])).toBe(true);
  });

  it('allows running on 1 when the day has an emergency override', () => {
    const { cover, issues } = run({
      nitz: { [week[4]]: 'sick' },
      reland: { [week[4]]: 'day_off' },
      ronnie: { [week[2]]: 'day_off' },
    }, three, [week[4]]);
    expect(cover[4].status).toBe('emergency');
    expect(issues.filter((i) => i.level === 'blocker')).toEqual([]);
  });

  it('never allows zero cover, even with an override', () => {
    const { issues } = run({
      nitz: { [week[4]]: 'day_off' },
      reland: { [week[4]]: 'day_off' },
      ronnie: { [week[4]]: 'day_off' },
    }, three, [week[4]]);
    expect(issues.some((i) => i.code === 'no_cover' && i.level === 'blocker')).toBe(true);
  });

  it('warns when someone has no day off', () => {
    const { issues } = run({ reland: { [week[1]]: 'day_off' }, ronnie: { [week[2]]: 'day_off' } }, three);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'no_day_off', employeeId: 'nitz', level: 'warning' }));
  });

  it('counts leave days toward the weekly target', () => {
    const { issues } = run({
      nitz: { [week[0]]: 'day_off', [week[1]]: 'holiday', [week[2]]: 'holiday' },
      reland: { [week[3]]: 'day_off' },
      ronnie: { [week[4]]: 'day_off' },
    }, three);
    expect(issues.some((i) => i.code === 'under_target')).toBe(false);
  });

  it('ignores self-managed staff for cover and weekly targets', () => {
    const geo = person('geo', { mode: 'self_managed', countsTowardCover: false });
    const { cover, issues } = run({
      nitz: { [week[0]]: 'day_off' },
      reland: { [week[1]]: 'day_off' },
      ronnie: { [week[2]]: 'day_off' },
    }, [...three, geo]);
    expect(cover[0].working).toBe(2);
    expect(issues).toEqual([]);
  });
});
