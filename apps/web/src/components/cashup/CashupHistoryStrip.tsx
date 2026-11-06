import { useMemo, useState } from 'react';
import { useCashupHistory, type CashupHistoryDay } from '../../api/cashup.js';
import { formatCurrency } from '../../utils/currency.js';

function dayTone(d: CashupHistoryDay): string {
  if (d.status === 'missing') return 'border-dashed border-gray-300 bg-white text-gray-400';
  if (d.status === 'open') return 'border-blue-300 bg-blue-50 text-blue-800';
  const worst = Math.max(Math.abs(d.tillVariance ?? 0), Math.abs(d.depositVariance ?? 0));
  if (worst === 0) return 'border-green-300 bg-green-50 text-green-800';
  if (worst <= 100) return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-red-300 bg-red-50 text-red-800';
}

function dayTitle(d: CashupHistoryDay): string {
  if (d.status === 'missing') return `${d.date}: not cashed up`;
  if (d.status === 'open') return `${d.date}: open (not locked)`;
  const parts = [
    `${d.date}`,
    `Till ${formatCurrency(d.tillVariance ?? 0)}`,
    `Envelope ${formatCurrency(d.depositVariance ?? 0)}`,
  ];
  if (d.submittedByName) parts.push(`by ${d.submittedByName}`);
  if (d.varianceNote) parts.push(`Note: ${d.varianceNote}`);
  if (d.reopened) parts.push('Reopened');
  return parts.join(' · ');
}

/**
 * Last 14 days at a glance: green balanced, amber small variance, red large
 * variance, blue reopened/open, dashed never cashed up. Click to jump.
 */
export function CashupHistoryStrip({
  storeId,
  selectedDate,
  onSelectDate,
  showStaffSummary,
}: {
  storeId: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  showStaffSummary: boolean;
}) {
  const { data: days14 = [] } = useCashupHistory(storeId, 14);
  const { data: days30 = [] } = useCashupHistory(storeId, 30);
  const [showStaff, setShowStaff] = useState(false);

  const staffRows = useMemo(() => {
    const byStaff = new Map<string, { name: string; days: number; till: number; envelope: number; unexplained: number }>();
    for (const d of days30) {
      if (d.status !== 'locked' || !d.submittedBy) continue;
      const row = byStaff.get(d.submittedBy) ?? {
        name: d.submittedByName || 'Unknown',
        days: 0,
        till: 0,
        envelope: 0,
        unexplained: 0,
      };
      row.days += 1;
      row.till += d.tillVariance ?? 0;
      row.envelope += d.depositVariance ?? 0;
      const worst = Math.max(Math.abs(d.tillVariance ?? 0), Math.abs(d.depositVariance ?? 0));
      if (worst > 100 && !d.varianceNote) row.unexplained += 1;
      byStaff.set(d.submittedBy, row);
    }
    return [...byStaff.values()].sort((a, b) => b.days - a.days);
  }, [days30]);

  if (days14.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Last 14 days</p>
        {showStaffSummary && (
          <button
            type="button"
            onClick={() => setShowStaff((v) => !v)}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            {showStaff ? 'Hide staff variances' : 'Staff variances (30 days)'}
          </button>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days14.map((d) => {
          const dt = new Date(`${d.date}T12:00:00+08:00`);
          return (
            <button
              key={d.date}
              type="button"
              title={dayTitle(d)}
              onClick={() => onSelectDate(d.date)}
              className={`flex min-w-[3.25rem] flex-col items-center rounded-md border px-1.5 py-1 text-[11px] leading-tight ${dayTone(d)} ${
                d.date === selectedDate ? 'ring-2 ring-gray-900 ring-offset-1' : ''
              }`}
            >
              <span className="font-medium">
                {dt.toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })}
              </span>
              <span className="text-sm font-bold">{dt.getDate()}</span>
              <span className="text-[10px]">
                {d.status === 'missing' ? '—' : d.status === 'open' ? 'open' : d.reopened ? 'reopened' : '✓'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-400" />Balanced</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Within ₱100</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-400" />Over ₱100</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400" />Open</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full border border-dashed border-gray-400" />Not cashed up</span>
      </div>

      {showStaff && showStaffSummary && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Closed by</th>
                <th className="py-1 pr-3 text-right font-medium">Days</th>
                <th className="py-1 pr-3 text-right font-medium">Till net</th>
                <th className="py-1 pr-3 text-right font-medium">Envelope net</th>
                <th className="py-1 text-right font-medium">Unexplained &gt; ₱100</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((r) => (
                <tr key={r.name} className="border-t border-gray-100">
                  <td className="py-1 pr-3 font-medium text-gray-800">{r.name}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.days}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${r.till < 0 ? 'text-red-700' : 'text-gray-800'}`}>
                    {formatCurrency(r.till)}
                  </td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${r.envelope < 0 ? 'text-red-700' : 'text-gray-800'}`}>
                    {formatCurrency(r.envelope)}
                  </td>
                  <td className={`py-1 text-right tabular-nums ${r.unexplained > 0 ? 'font-semibold text-red-700' : ''}`}>
                    {r.unexplained}
                  </td>
                </tr>
              ))}
              {staffRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-gray-400">No locked cash-ups in the last 30 days.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
