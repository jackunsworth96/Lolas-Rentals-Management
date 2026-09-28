const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
export interface AllocationReportInput {
  from: string;
  to: string;
  now: number;
  baselines: Array<{ effective_month: string; scheduled_qty: number }>;
  overrides: Array<{ starts_on: string; ends_before: string; qty: number }>;
  reservations: Array<{ id: string; actual_start: string | null; actual_end: string | null; ends_at: string }>;
  segments: Array<{ reservation_id: string; starts_at: string; ends_at: string; pool: string }>;
}
const midnight = (day: string) => Date.parse(`${day}T00:00:00+08:00`);
const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));
export function allocationReport(input: AllocationReportInput) {
  const reservations = new Map(input.reservations.map((r) => [r.id, r]));
  const days: Array<{ date: string; allocatedHours: number; guaranteedHours: number; overflowHours: number; utilization: number | null }> = [];
  for (let start = midnight(input.from); start < midnight(input.to); start += DAY) {
    const date = new Date(start + OFFSET).toISOString().slice(0, 10);
    const end = Math.min(start + DAY, input.now);
    const scheduled = input.baselines.find((b) => b.effective_month.slice(0, 7) === date.slice(0, 7))?.scheduled_qty ?? 0;
    const qty = input.overrides.find((o) => o.starts_on <= date && o.ends_before > date)?.qty ?? scheduled;
    const allocatedHours = qty * Math.max(0, end - start) / 3_600_000;
    let guaranteedHours = 0, overflowHours = 0;
    for (const segment of input.segments) {
      const r = reservations.get(segment.reservation_id);
      if (!r?.actual_start) continue;
      const used = overlap(start, end, Math.max(Date.parse(r.actual_start), Date.parse(segment.starts_at)),
        Math.min(Date.parse(r.actual_end ?? new Date(input.now).toISOString()), Date.parse(r.ends_at) - 30 * 60_000, Date.parse(segment.ends_at))) / 3_600_000;
      if (segment.pool === 'guaranteed') guaranteedHours += used;
      else overflowHours += used;
    }
    days.push({ date, allocatedHours, guaranteedHours, overflowHours, utilization: allocatedHours ? guaranteedHours / allocatedHours : null });
  }
  const today = new Date(input.now + OFFSET).toISOString().slice(0, 10);
  const completed = days.filter((d) => d.date < today).slice(-21);
  const underutilized = completed.length === 21 && completed.every((d) => d.allocatedHours > 0) && [0, 7, 14].every((i) => {
    const week = completed.slice(i, i + 7);
    return week.reduce((n, d) => n + d.guaranteedHours, 0) / week.reduce((n, d) => n + d.allocatedHours, 0) < 0.5;
  });
  const months = Object.values(days.reduce<Record<string, { month: string; allocatedHours: number; guaranteedHours: number; overflowHours: number }>>((result, day) => {
    const month = day.date.slice(0, 7);
    const row = result[month] ??= { month, allocatedHours: 0, guaranteedHours: 0, overflowHours: 0 };
    row.allocatedHours += day.allocatedHours; row.guaranteedHours += day.guaranteedHours; row.overflowHours += day.overflowHours;
    return result;
  }, {})).map((m) => ({ ...m, utilization: m.allocatedHours ? m.guaranteedHours / m.allocatedHours : null }));
  return { days, months, underutilized };
}
