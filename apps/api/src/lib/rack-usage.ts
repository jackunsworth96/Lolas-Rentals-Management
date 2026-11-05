export interface RackUsageInterval {
  startMs: number;
  endMs: number;
  quantity: number;
}

/**
 * Highest number of racks out at the same moment inside [rangeStartMs, rangeEndMs).
 * Intervals that only touch end-to-start do not overlap, so one rack can serve both.
 */
export function peakRackUsage(
  intervals: RackUsageInterval[],
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of intervals) {
    const start = Math.max(iv.startMs, rangeStartMs);
    const end = Math.min(iv.endMs, rangeEndMs);
    if (!(end > start) || iv.quantity <= 0) continue;
    events.push({ t: start, delta: iv.quantity }, { t: end, delta: -iv.quantity });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const e of events) {
    current += e.delta;
    if (current > peak) peak = current;
  }
  return peak;
}
