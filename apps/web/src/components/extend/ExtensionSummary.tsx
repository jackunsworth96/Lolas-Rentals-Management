import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  originalTotal: number;
  extensionCost: number | null;
  extensionDays: number;
  originalDays: number;
  newReturnDisplay: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  ninePmCost?: number;
}

export function ExtensionSummary({
  originalTotal,
  extensionCost,
  extensionDays,
  originalDays,
  newReturnDisplay,
  loading,
  onConfirm,
  onCancel,
  ninePmCost,
}: Props) {
  const extCost = extensionCost ?? 0;
  const ninePm = ninePmCost ?? 0;
  const totalBalance = extCost + ninePm;
  const updatedTotal = originalTotal + totalBalance;

  return (
    <div className="space-y-3">
      {/* ── Summary card ── */}
      <div className="rounded-2xl border border-sand-brand bg-white p-5 shadow-sm">
        <p className="mb-4 font-headline text-base font-black text-charcoal-brand">Summary of Charges</p>

        {/* New return date */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-charcoal-brand/60">New Return</span>
          <span className="text-sm font-black text-teal-brand text-right">{newReturnDisplay}</span>
        </div>

        <div className="my-3 border-t border-sand-brand" />

        {/* Original cost */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-charcoal-brand/60">
            Original Cost ({originalDays} Day{originalDays !== 1 ? 's' : ''})
          </span>
          <span className="text-sm font-black text-charcoal-brand">{formatCurrency(originalTotal)}</span>
        </div>

        {/* Extension cost */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-teal-brand">
            Extension ({extensionDays} Extra Day{extensionDays !== 1 ? 's' : ''})
          </span>
          {extensionCost != null ? (
            <span className="text-sm font-black text-teal-brand">{formatCurrency(extCost)}</span>
          ) : (
            <span className="inline-block h-4 w-16 animate-pulse rounded bg-sand-brand" />
          )}
        </div>

        {/* 9PM addon */}
        {ninePm > 0 && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-charcoal-brand/60">9PM Late Return</span>
            <span className="text-sm font-black text-charcoal-brand">{formatCurrency(ninePm)}</span>
          </div>
        )}

        <div className="my-3 border-t border-sand-brand" />

        {/* Totals row */}
        <div className="flex items-end justify-between gap-4 pt-1">
          {/* Updated total — left */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-brand/40">Updated Total</p>
            <p className="text-3xl font-black leading-tight text-charcoal-brand">{formatCurrency(updatedTotal)}</p>
          </div>

          {/* Balance due — right, gold highlight */}
          <div className="min-w-0 rounded-xl bg-amber-50 px-4 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Balance Due</p>
            <p className="text-2xl font-black leading-tight text-amber-500">{formatCurrency(totalBalance)}</p>
          </div>
        </div>
      </div>

      {/* ── Info notice ── */}
      <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
        <span className="mt-0.5 shrink-0 text-blue-500">ℹ</span>
        <p className="text-xs font-semibold leading-relaxed text-blue-700">
          Your new return date will be updated immediately. Please visit our store to settle the balance within 24 hours during opening hours <strong>9AM – 5PM</strong>.
        </p>
      </div>

      {/* ── CTA ── */}
      <PrimaryCtaButton
        type="button"
        onClick={onConfirm}
        disabled={loading || extensionCost == null}
        className="flex w-full items-center justify-center gap-2 py-4 text-base shadow-lg"
      >
        {loading ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
        ) : null}
        {loading ? 'Confirming…' : 'Confirm Extension 🐾'}
      </PrimaryCtaButton>

      <button
        type="button"
        onClick={onCancel}
        className="w-full py-2 text-sm font-black text-charcoal-brand/50 transition-colors hover:text-charcoal-brand"
      >
        Cancel Changes
      </button>
    </div>
  );
}
