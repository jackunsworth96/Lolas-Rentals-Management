import { useState, type ReactNode } from 'react';
import type { ExpectedBreakdown, MethodCategory } from '../../api/cashup.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatVariance, varianceBg, varianceColor } from './DenominationCounter.js';

const COLLAPSED_ROWS = 8;

export interface ListRow {
  id: string;
  /** Booking token or other reference shown in bold first. */
  ref?: string | null;
  title: string;
  subtitle?: string | null;
  amount: number;
  /** Display sign; amounts are shown as absolute values. */
  sign?: '+' | '-' | '';
  tone?: 'default' | 'muted' | 'warning';
  badge?: string | null;
}

/**
 * A titled list of transactions. Lists longer than a few rows collapse
 * behind an explicit "Show all (n)" button rather than a hidden inner
 * scroll area, so nothing is silently out of view.
 */
export function RowsSection({
  title,
  subtitle,
  icon,
  rows,
  total,
  totalSign = '',
  accent = 'gray',
  badge,
  emptyText = 'Nothing recorded',
  hideWhenEmpty = false,
  forceExpanded = false,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  rows: ListRow[];
  total: number;
  totalSign?: '+' | '-' | '';
  accent?: 'green' | 'red' | 'blue' | 'cyan' | 'amber' | 'violet' | 'purple' | 'teal' | 'gray' | 'orange';
  badge?: string;
  emptyText?: string;
  hideWhenEmpty?: boolean;
  forceExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (hideWhenEmpty && rows.length === 0) return null;

  const border: Record<string, string> = {
    green: 'border-l-green-500',
    red: 'border-l-red-500',
    blue: 'border-l-blue-500',
    cyan: 'border-l-cyan-500',
    amber: 'border-l-amber-500',
    violet: 'border-l-violet-500',
    purple: 'border-l-purple-500',
    teal: 'border-l-teal-500',
    gray: 'border-l-gray-400',
    orange: 'border-l-orange-500',
  };
  const showAll = expanded || forceExpanded || rows.length <= COLLAPSED_ROWS;
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <div className={`rounded-lg border border-gray-200 border-l-4 bg-white ${border[accent]}`}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span aria-hidden>{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              {title}
              {rows.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">({rows.length})</span>}
            </h3>
            {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
          </div>
          {badge && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{badge}</span>
          )}
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
          {totalSign === '-' && total !== 0 ? '−' : totalSign === '+' && total !== 0 ? '+' : ''}
          {formatCurrency(Math.abs(total))}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-400">{emptyText}</p>
      ) : (
        <ul>
          {visible.map((r) => (
            <li
              key={r.id}
              className={`flex items-center justify-between gap-3 border-b border-gray-50 px-4 py-2 last:border-b-0 ${
                r.tone === 'warning' ? 'bg-amber-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${r.tone === 'muted' ? 'text-gray-500' : 'text-gray-800'}`}>
                  {r.ref && <span className="mr-1.5 font-semibold text-gray-900">{r.ref}</span>}
                  <span className={r.ref ? 'text-gray-600' : 'font-medium'}>{r.title}</span>
                  {r.badge && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      {r.badge}
                    </span>
                  )}
                </p>
                {r.subtitle && <p className="truncate text-xs text-gray-500">{r.subtitle}</p>}
              </div>
              <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-gray-900">
                {r.sign === '-' ? '−' : r.sign === '+' ? '+' : ''}
                {formatCurrency(Math.abs(r.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!showAll && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-gray-100 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          Show all ({rows.length})
        </button>
      )}
    </div>
  );
}

/**
 * Opening + every movement = expected, then (optionally) counted and
 * variance. The same lines are what the server stores at reconcile.
 */
export function ExpectedBreakdownCard({
  title,
  subtitle,
  openingLabel,
  breakdown,
  counted,
  hideExpected = false,
  footer,
}: {
  title: string;
  subtitle?: string;
  openingLabel: string;
  breakdown: ExpectedBreakdown;
  counted?: number | null;
  hideExpected?: boolean;
  footer?: ReactNode;
}) {
  const variance = counted != null ? Math.round((counted - breakdown.total) * 100) / 100 : null;
  return (
    <div
      className={`rounded-xl border p-5 ${
        variance != null && !hideExpected ? varianceBg(variance) : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {hideExpected ? (
        <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
          Expected figures are hidden until you finish counting.
        </p>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-600">{openingLabel}</dt>
            <dd className="tabular-nums font-medium">{formatCurrency(breakdown.opening)}</dd>
          </div>
          {breakdown.lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-3">
              <dt className={l.note === 'carried' ? 'text-amber-700' : 'text-gray-600'}>
                {l.amount < 0 ? '− ' : '+ '}
                {l.label}
                {l.count ? <span className="ml-1 text-xs text-gray-400">({l.count})</span> : null}
              </dt>
              <dd className={`tabular-nums ${l.amount < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(Math.abs(l.amount))}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-gray-200 pt-2">
            <dt className="font-semibold text-gray-900">Expected</dt>
            <dd className="tabular-nums text-lg font-bold text-gray-900">{formatCurrency(breakdown.total)}</dd>
          </div>
          {counted != null && variance != null && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-gray-900">Counted</dt>
                <dd className="tabular-nums text-lg font-bold text-gray-900">{formatCurrency(counted)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-gray-900">Variance</dt>
                <dd className={`tabular-nums text-lg font-bold ${varianceColor(variance)}`}>
                  {formatVariance(variance)}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
      {footer}
    </div>
  );
}

export function Banner({
  tone,
  title,
  children,
  action,
}: {
  tone: 'amber' | 'red' | 'blue' | 'green';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const cls: Record<string, string> = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-green-200 bg-green-50 text-green-900',
  };
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${cls[tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function methodCategory(raw: string | null | undefined): MethodCategory {
  const key = (raw ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (key.includes('gcash') || key.includes('paymaya')) return 'gcash';
  if (key.includes('cash')) return 'cash';
  if (key.includes('card')) return 'card';
  return 'bank';
}

export function shortDate(d: string): string {
  return new Date(`${d}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}
