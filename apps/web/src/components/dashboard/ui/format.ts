const wholePeso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

export function formatPeso(amount: number): string {
  return wholePeso.format(amount);
}

export function formatCompactPeso(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}₱${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}₱${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}₱${Math.round(abs)}`;
}

/** Percent change from `previous` to `current`, or null when there is no baseline to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'short',
  });
}

export function weekdayShort(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
  });
}

export const CHART_COLORS = {
  primary: '#00577C',
  primarySoft: '#7FAABD',
  accent: '#FCBC5A',
  charcoal: '#363737',
  good: '#16a34a',
  bad: '#dc2626',
  grid: '#eef0f2',
};

export const SERIES_COLORS = ['#00577C', '#FCBC5A', '#4F9DB8', '#E8875B', '#7C9A5C', '#9B7BB8', '#C9A227', '#5B6B73'];
