/**
 * Pay schedule: work from the 1st–15th is paid on the 16th, and work from the
 * 16th to month end is paid on the 1st of the next month (a day to process).
 */

export type PayHalf = 'first' | 'second';

export function lastDayOfMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function periodFor(yearMonth: string, half: PayHalf): { periodStart: string; periodEnd: string } {
  if (half === 'first') return { periodStart: `${yearMonth}-01`, periodEnd: `${yearMonth}-15` };
  const last = String(lastDayOfMonth(yearMonth)).padStart(2, '0');
  return { periodStart: `${yearMonth}-16`, periodEnd: `${yearMonth}-${last}` };
}

export function payDateFor(yearMonth: string, half: PayHalf): string {
  return half === 'first' ? `${yearMonth}-16` : `${shiftMonth(yearMonth, 1)}-01`;
}

/** The pay period whose payday is today or most recently passed (the one to run next). */
export function duePeriod(today: string): { yearMonth: string; half: PayHalf } {
  const day = Number(today.slice(8, 10));
  const yearMonth = today.slice(0, 7);
  return day >= 16 ? { yearMonth, half: 'first' } : { yearMonth: shiftMonth(yearMonth, -1), half: 'second' };
}
