const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const MANILA_OFFSET_MS = 8 * 60 * MS_PER_MINUTE;
/** Pickup/return slots: 9:15 AM to 4:45 PM every 30 minutes, Manila time (same as the walk-in modal). */
const FIRST_SLOT_MIN = 9 * 60 + 15;
const LAST_SLOT_MIN = 16 * 60 + 45;
const SLOT_STEP_MIN = 30;
export const MAX_COUNTER_DAYS = 30;

function manilaDay(ms: number) {
  const local = ms + MANILA_OFFSET_MS;
  const dayStartMs = Math.floor(local / MS_PER_DAY) * MS_PER_DAY - MANILA_OFFSET_MS;
  return { dayStartMs, minutes: (local - (dayStartMs + MANILA_OFFSET_MS)) / MS_PER_MINUTE };
}

/** The slot closest to `ms` on the same Manila day (clamped to opening hours). */
export function nearestSlot(ms: number): number {
  const { dayStartMs, minutes } = manilaDay(ms);
  const clamped = Math.min(Math.max(minutes, FIRST_SLOT_MIN), LAST_SLOT_MIN);
  const slot = FIRST_SLOT_MIN + Math.round((clamped - FIRST_SLOT_MIN) / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  return dayStartMs + slot * MS_PER_MINUTE;
}

/** The first slot at or after `ms`, rolling to 9:15 the next morning after closing. */
export function nextSlotFrom(ms: number): number {
  const { dayStartMs, minutes } = manilaDay(ms);
  if (minutes <= FIRST_SLOT_MIN) return dayStartMs + FIRST_SLOT_MIN * MS_PER_MINUTE;
  const slot = FIRST_SLOT_MIN + Math.ceil((minutes - FIRST_SLOT_MIN) / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  if (slot > LAST_SLOT_MIN) return dayStartMs + MS_PER_DAY + FIRST_SLOT_MIN * MS_PER_MINUTE;
  return dayStartMs + slot * MS_PER_MINUTE;
}

/** True when `ms` falls exactly on one of the day's pickup slots. */
export function isSlot(ms: number): boolean {
  const { minutes } = manilaDay(ms);
  return minutes >= FIRST_SLOT_MIN && minutes <= LAST_SLOT_MIN && (minutes - FIRST_SLOT_MIN) % SLOT_STEP_MIN === 0;
}

export function windowFrom(pickupMs: number, days: number) {
  return {
    pickupDatetime: new Date(pickupMs).toISOString(),
    dropoffDatetime: new Date(pickupMs + days * MS_PER_DAY).toISOString(),
  };
}

export type CounterWindow = ReturnType<typeof windowFrom>;

/** Walk-ins start at the nearest time slot and return in the same slot whole days later. */
export function counterWindow(days: number, nowMs = Date.now()): CounterWindow {
  return windowFrom(nearestSlot(nowMs), days);
}
