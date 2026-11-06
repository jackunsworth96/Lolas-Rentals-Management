import { formatCurrency } from '../../utils/currency.js';

export const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1] as const;

export type Denoms = Record<number, number>;

export function freshDenoms(): Denoms {
  return Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]));
}

export function denomSum(denoms: Denoms): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * (denoms[d] || 0), 0);
}

export function denomsFromRecord(rec: Record<string, number> | null | undefined): Denoms {
  const out = freshDenoms();
  if (!rec) return out;
  for (const d of DENOMINATIONS) out[d] = Number(rec[String(d)] ?? 0) || 0;
  return out;
}

export function denomsToRecord(denoms: Denoms): Record<string, number> {
  return Object.fromEntries(DENOMINATIONS.map((d) => [String(d), denoms[d] || 0]));
}

export function varianceColor(v: number): string {
  if (v === 0) return 'text-green-600';
  if (Math.abs(v) <= 100) return 'text-amber-600';
  return 'text-red-600';
}

export function varianceBg(v: number): string {
  if (v === 0) return 'bg-green-50 border-green-200';
  if (Math.abs(v) <= 100) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

export function formatVariance(v: number): string {
  if (v === 0) return 'Balanced';
  return `${v > 0 ? 'Over' : 'Short'} ${formatCurrency(Math.abs(v))}`;
}

/** Large touch targets so staff can count on a phone or tablet at the counter. */
export function DenominationGrid({
  denoms,
  onChange,
  disabled = false,
}: {
  denoms: Denoms;
  onChange: (denom: number, count: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="divide-y divide-gray-100">
      {DENOMINATIONS.map((d) => {
        const count = denoms[d] || 0;
        return (
          <div key={d} className="flex items-center gap-2 py-1.5">
            <span className="w-16 shrink-0 text-right text-sm font-semibold text-gray-700">
              ₱{d.toLocaleString()}
            </span>
            <button
              type="button"
              aria-label={`One less ₱${d}`}
              disabled={disabled || count === 0}
              onClick={() => onChange(d, Math.max(0, count - 1))}
              className="h-10 w-10 shrink-0 rounded-lg border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={count || ''}
              onChange={(e) => onChange(d, Math.max(0, parseInt(e.target.value) || 0))}
              disabled={disabled}
              aria-label={`Number of ₱${d}`}
              className="h-10 w-16 shrink-0 rounded-lg border border-gray-300 text-center text-base font-medium disabled:bg-gray-50"
              placeholder="0"
            />
            <button
              type="button"
              aria-label={`One more ₱${d}`}
              disabled={disabled}
              onClick={() => onChange(d, count + 1)}
              className="h-10 w-10 shrink-0 rounded-lg border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              +
            </button>
            <span className="ml-auto text-sm tabular-nums text-gray-500">
              {formatCurrency(d * count)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
