import { Button } from '../common/Button.js';
import { formatCurrency } from '../../utils/currency.js';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1] as const;

function varianceColor(v: number): string {
  if (v === 0) return 'text-green-600';
  if (Math.abs(v) <= 100) return 'text-amber-600';
  return 'text-red-600';
}

function varianceBg(v: number): string {
  if (v === 0) return 'bg-green-50 border-green-200';
  if (Math.abs(v) <= 100) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function DenominationGrid({
  denoms,
  onChange,
  disabled,
}: {
  denoms: Record<number, number>;
  onChange: (denom: number, count: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      {DENOMINATIONS.map((d) => (
        <div key={d} className="flex items-center gap-3">
          <span className="w-16 text-right text-sm font-medium text-gray-700">
            ₱{d.toLocaleString()}
          </span>
          <span className="text-gray-400">×</span>
          <input
            type="number"
            min={0}
            value={denoms[d] || ''}
            onChange={(e) => onChange(d, parseInt(e.target.value) || 0)}
            disabled={disabled}
            className="w-20 rounded-md border border-gray-300 px-2 py-2 text-center text-sm disabled:bg-gray-50"
            placeholder="0"
          />
          <span className="text-sm text-gray-500">
            = {formatCurrency(d * (denoms[d] || 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface DenominationCounterProps {
  tillDenoms: Record<number, number>;
  depEnvDenoms: Record<number, number>;
  onTillDenomChange: (denom: number, count: number) => void;
  onDepEnvDenomChange: (denom: number, count: number) => void;
  tillTotal: number;
  depEnvTotal: number;
  expectedCashSales: number;
  expectedDepositsHeld: number;
  tillVariance: number;
  depVariance: number;
  isLocked: boolean;
  hasSavedDenoms: boolean;
  onLoadSavedDenoms: () => void;
}

export function DenominationCounter({
  tillDenoms,
  depEnvDenoms,
  onTillDenomChange,
  onDepEnvDenomChange,
  tillTotal,
  depEnvTotal,
  expectedCashSales,
  expectedDepositsHeld,
  tillVariance,
  depVariance,
  isLocked,
  hasSavedDenoms,
  onLoadSavedDenoms,
}: DenominationCounterProps) {
  return (
    <>
      {/* Denomination Counting */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Till denomination grid */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">
              Till Count
            </h3>
            {hasSavedDenoms && !isLocked && (
              <Button size="sm" variant="ghost" className="!py-2" onClick={onLoadSavedDenoms}>
                Load saved
              </Button>
            )}
          </div>
          <DenominationGrid
            denoms={tillDenoms}
            onChange={onTillDenomChange}
            disabled={isLocked}
          />
          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">
                Total Till
              </span>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(tillTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Deposit envelope denomination grid */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Deposit Envelope Count
          </h3>
          <DenominationGrid
            denoms={depEnvDenoms}
            onChange={onDepEnvDenomChange}
            disabled={isLocked}
          />
          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">
                Total Deposits
              </span>
              <span className="text-lg font-bold text-cyan-700">
                {formatCurrency(depEnvTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expected vs Actual — two rows */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`rounded-lg border p-5 ${varianceBg(tillVariance)}`}>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Expected Cash vs Actual Counted
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Expected Cash (sales)</span>
              <span className="font-medium">{formatCurrency(expectedCashSales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Actual Counted (till)</span>
              <span className="font-medium">{formatCurrency(tillTotal)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between">
                <span className="text-sm font-semibold">Variance</span>
                <span className={`text-lg font-bold ${varianceColor(tillVariance)}`}>
                  {tillVariance > 0 ? '+' : ''}
                  {formatCurrency(tillVariance)}
                </span>
              </div>
              {tillVariance !== 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {tillVariance > 0 ? 'Over' : 'Short'} by{' '}
                  {formatCurrency(Math.abs(tillVariance))}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className={`rounded-lg border p-5 ${varianceBg(depVariance)}`}>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Expected Deposits Held vs Envelope
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Expected Deposits (cash)</span>
              <span className="font-medium">{formatCurrency(expectedDepositsHeld)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Deposit Envelope Count</span>
              <span className="font-medium">{formatCurrency(depEnvTotal)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between">
                <span className="text-sm font-semibold">Variance</span>
                <span className={`text-lg font-bold ${varianceColor(depVariance)}`}>
                  {depVariance > 0 ? '+' : ''}
                  {formatCurrency(depVariance)}
                </span>
              </div>
              {depVariance !== 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {depVariance > 0 ? 'Over' : 'Short'} by{' '}
                  {formatCurrency(Math.abs(depVariance))}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
