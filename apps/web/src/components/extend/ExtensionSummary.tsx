import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  originalTotal: number;
  extensionCost: number | null;
  extensionDays: number;
  originalDays: number;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExtensionSummary({
  originalTotal,
  extensionCost,
  extensionDays,
  originalDays,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const extCost = extensionCost ?? 0;
  const updatedTotal = originalTotal + extCost;

  return (
    <section className="relative overflow-hidden rounded-4xl bg-cream-brand p-8 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
      <h2 className="mb-8 font-headline text-2xl font-black text-teal-brand">Summary of Charges</h2>

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-charcoal-brand/70">Original Cost ({originalDays} Day{originalDays !== 1 ? 's' : ''})</span>
          <span className="font-black text-charcoal-brand">{formatCurrency(originalTotal)}</span>
        </div>

        <div className="flex items-center justify-between text-teal-brand">
          <span className="font-bold">Extension ({extensionDays} Extra Day{extensionDays !== 1 ? 's' : ''})</span>
          {extensionCost != null ? (
            <span className="font-black">{formatCurrency(extCost)}</span>
          ) : (
            <span className="inline-block h-4 w-16 animate-pulse rounded bg-sand-brand" />
          )}
        </div>

        <div className="border-b-2 border-sand-brand pb-6" />

        <div className="pt-2">
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand">Updated Total</p>
              <p className="text-4xl font-black text-teal-brand">
                {formatCurrency(updatedTotal)}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[11px] font-bold text-charcoal-brand/70">Balance Due</p>
              <p className="text-2xl font-black text-gold-brand">
                {formatCurrency(extCost)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 space-y-4">
        <PrimaryCtaButton
          type="button"
          onClick={onConfirm}
          disabled={loading || extensionCost == null}
          className="flex w-full items-center justify-center gap-2 py-6 text-xl shadow-xl"
        >
          {loading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
          ) : null}
          {loading ? 'Confirming…' : 'Confirm Extension 🐾'}
        </PrimaryCtaButton>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 font-black text-charcoal-brand/60 transition-colors hover:text-charcoal-brand"
        >
          Cancel Changes
        </button>
      </div>

      <div className="mt-8 flex gap-4 rounded-3xl bg-sand-brand p-4">
        <span className="text-lg text-gold-brand">ℹ️</span>
        <p className="text-xs font-bold leading-relaxed text-charcoal-brand/70">
          Extension confirmed? Your new return date will be updated. Please settle the balance due at return.
        </p>
      </div>
    </section>
  );
}
