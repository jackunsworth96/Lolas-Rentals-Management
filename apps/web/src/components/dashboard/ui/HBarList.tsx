import { CHART_COLORS } from './format.js';

export interface HBarRow {
  key?: string;
  label: string;
  value: number;
  /** Optional comparison value drawn as a thin bar underneath (e.g. last month). */
  compare?: number;
  sub?: string;
}

export function HBarList({
  rows,
  formatValue = (v) => String(v),
  color = CHART_COLORS.primary,
  compareColor = CHART_COLORS.accent,
  showShare = false,
  highlightTop = false,
}: {
  rows: HBarRow[];
  formatValue?: (v: number) => string;
  color?: string;
  compareColor?: string;
  showShare?: boolean;
  highlightTop?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.compare ?? 0)));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key ?? r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className={`min-w-0 truncate ${highlightTop && i === 0 ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
              {r.label}
              {r.sub && <span className="ml-1.5 text-xs text-gray-400">{r.sub}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-gray-900">{formatValue(r.value)}</span>
              {showShare && total > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">{Math.round((r.value / total) * 100)}%</span>
              )}
              {r.compare != null && (
                <span className="ml-1.5 text-xs text-gray-400">vs {formatValue(r.compare)}</span>
              )}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          {r.compare != null && (
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-transparent">
              <div
                className="h-full rounded-full"
                style={{ width: `${(r.compare / max) * 100}%`, backgroundColor: compareColor, opacity: 0.8 }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
