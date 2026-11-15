import { ApiError } from '../../api/client.js';

export const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-500';
export const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Reasons the server gave for refusing an entry, one per line. */
export function errorReasons(err: unknown): string[] {
  if (err instanceof ApiError) {
    const details = err.details as { reasons?: string[] } | undefined;
    if (details?.reasons?.length) return details.reasons;
    if (err.code === 'VALIDATION_ERROR') return ['Some fields are missing or invalid. Check the form and try again.'];
    return [err.message];
  }
  return [err instanceof Error ? err.message : 'Something went wrong. Try again.'];
}

export function confirmationsOf(err: unknown): Array<{ code: string; message: string }> {
  if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
    return (err.details as { confirmations?: Array<{ code: string; message: string }> } | undefined)?.confirmations ?? [];
  }
  return [];
}

const RECENT_KEY = 'expenses.recentTypes';

/** The types this device logs most, so the picker can put them first. */
export function recentTypeIds(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, number>;
    return Object.entries(raw)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => Number(id));
  } catch {
    return [];
  }
}

export function rememberType(id: number): void {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as Record<string, number>;
    raw[id] = (raw[id] ?? 0) + 1;
    localStorage.setItem(RECENT_KEY, JSON.stringify(raw));
  } catch {
    // Storage can be unavailable (private mode); the picker just won't reorder.
  }
}
