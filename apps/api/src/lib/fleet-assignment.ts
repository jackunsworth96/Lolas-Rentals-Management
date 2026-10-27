/** Half-open period [start, end) in epoch ms. Use ±Infinity for open-ended blocks. */
export interface Period { start: number; end: number }

const MAX_SEARCH_STEPS = 20_000;

const overlaps = (a: Period, b: Period) => a.start < b.end && b.start < a.end;

/**
 * True when every floating booking (model-level, no vehicle yet) can be given
 * its own vehicle for its whole rental, around each vehicle's fixed blocks
 * (assigned rentals, walk-ins, owner use).
 *
 * Counting overlaps is not enough: a vehicle busy for part of a long rental can
 * still take a short one, while two vehicles each free for half a rental cannot
 * share it. Mirrors public.allocation_fit in the database; keep them in step.
 * Gives up (returns false) after a bounded search so it never oversells.
 */
export function canAssignAll(vehicleBlocks: Period[][], floating: Period[]): boolean {
  if (floating.length === 0) return true;
  const n = vehicleBlocks.length;
  const jobs = [...floating].sort((a, b) => a.start - b.start || b.end - a.end);
  // Vehicles with identical fixed blocks are interchangeable; try one of each.
  const group = vehicleBlocks.map((blocks) =>
    blocks.map((b) => `${b.start}:${b.end}`).sort().join(','));
  const nextBlockAfter = (v: number, at: number) =>
    vehicleBlocks[v].reduce((min, b) => (b.start >= at && b.start < min ? b.start : min), Number.POSITIVE_INFINITY);
  // Jobs are placed in start order, so a vehicle only needs its latest assigned end.
  const freeAt = new Array<number>(n).fill(Number.NEGATIVE_INFINITY);
  let steps = 0;

  const place = (i: number): boolean => {
    if (i === jobs.length) return true;
    if (++steps > MAX_SEARCH_STEPS) return false;
    const job = jobs[i];
    const seen = new Set<string>();
    const candidates: Array<{ v: number; next: number }> = [];
    for (let v = 0; v < n; v++) {
      if (freeAt[v] > job.start || seen.has(group[v])) continue;
      if (vehicleBlocks[v].some((b) => overlaps(b, job))) continue;
      seen.add(group[v]);
      candidates.push({ v, next: nextBlockAfter(v, job.end) });
    }
    // Best fit first: the vehicle whose next commitment comes soonest.
    candidates.sort((a, b) => a.next - b.next || a.v - b.v);
    for (const { v } of candidates) {
      const previous = freeAt[v];
      freeAt[v] = job.end;
      if (place(i + 1)) return true;
      freeAt[v] = previous;
      if (steps > MAX_SEARCH_STEPS) return false;
    }
    return false;
  };
  return place(0);
}

/**
 * How many more rentals of `request` fit alongside the floating bookings.
 * Returns 0 when the existing bookings already cannot all be placed.
 */
export function additionalUnitsThatFit(vehicleBlocks: Period[][], floating: Period[], request: Period): number {
  const freeForWholeRental = vehicleBlocks.filter((blocks) => !blocks.some((b) => overlaps(b, request))).length;
  let fitted = 0;
  const jobs = [...floating];
  while (fitted < freeForWholeRental) {
    jobs.push(request);
    if (!canAssignAll(vehicleBlocks, jobs)) break;
    fitted++;
  }
  return fitted;
}
