import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCurrency } from '../../utils/currency.js';

export interface OrderReviewItem {
  modelName: string;
  dailyRate: number;
  rentalDays: number;
  pickupDatetime: string;
  dropoffDatetime: string;
}

export interface OrderReviewAddon {
  name: string;
  total: number;
}

export interface OrderReviewTransfer {
  route: string;
  vanType: string;
  total: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  items: OrderReviewItem[];
  addons: OrderReviewAddon[];
  transfer: OrderReviewTransfer | null;
  grandTotal: number;
  paymentMethodLabel: string;
  depositAmount: number;
}

function formatSheetDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function OrderReviewSheet({
  open,
  onClose,
  onConfirm,
  submitting,
  items,
  addons,
  transfer,
  grandTotal,
  paymentMethodLabel,
  depositAmount,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="order-review-backdrop"
            type="button"
            aria-label="Close review"
            className="pointer-events-auto fixed inset-0 z-[100] bg-black/40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !submitting && onClose()}
          />

          <motion.div
            key="order-review-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-review-title"
            className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[101] max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-cream-brand p-6 shadow-[0_-8px_32px_rgba(54,55,55,0.12)] md:hidden"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-charcoal-brand/20" aria-hidden />

            <h2
              id="order-review-title"
              className="font-headline text-xl font-black text-teal-brand md:text-2xl"
            >
              Review your order
            </h2>

            <div className="mt-6 space-y-6 divide-y divide-charcoal-brand/10">
              {/* 1. Vehicles + dates */}
              <section className="pt-0">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-charcoal-brand/50">
                  Vehicle &amp; rental
                </h3>
                <div className="space-y-4">
                  {items.map((it, idx) => (
                    <div key={`${it.modelName}-${idx}`} className="space-y-1.5">
                      <p className="text-[15px] font-semibold text-charcoal-brand">{it.modelName}</p>
                      <p className="text-[13px] text-charcoal-brand/65">
                        {formatCurrency(it.dailyRate)}/day × {it.rentalDays} day{it.rentalDays !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[12px] leading-relaxed text-charcoal-brand/55">
                        <span className="font-medium text-charcoal-brand/70">Pickup:</span>{' '}
                        {formatSheetDate(it.pickupDatetime)}
                      </p>
                      <p className="text-[12px] leading-relaxed text-charcoal-brand/55">
                        <span className="font-medium text-charcoal-brand/70">Return:</span>{' '}
                        {formatSheetDate(it.dropoffDatetime)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Add-ons */}
              {addons.length > 0 && (
                <section className="pt-6">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-charcoal-brand/50">
                    Add-ons
                  </h3>
                  <ul className="space-y-2">
                    {addons.map((a) => (
                      <li key={a.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-charcoal-brand/75">{a.name}</span>
                        <span className="shrink-0 font-medium text-charcoal-brand">{formatCurrency(a.total)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 3. Transfer */}
              {transfer != null && (
                <section className="pt-6">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-charcoal-brand/50">
                    Transfer
                  </h3>
                  <p className="text-[13px] text-charcoal-brand/75">{transfer.route}</p>
                  <p className="mt-1 text-[12px] text-charcoal-brand/55">{transfer.vanType}</p>
                  <p className="mt-2 text-[14px] font-semibold text-charcoal-brand">{formatCurrency(transfer.total)}</p>
                </section>
              )}

              {/* 4. Payment */}
              <section className="pt-6">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-charcoal-brand/50">
                  Payment method
                </h3>
                <p className="text-[14px] font-medium text-charcoal-brand">{paymentMethodLabel}</p>
              </section>

              {/* 5. Total + deposit */}
              <section className="pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-charcoal-brand">Grand total</span>
                  <span className="text-[20px] font-bold text-teal-brand">{formatCurrency(grandTotal)}</span>
                </div>
                {depositAmount > 0 && (
                  <p className="mt-3 text-[12px] leading-relaxed text-charcoal-brand/55">
                    Refundable security deposit {formatCurrency(depositAmount)} collected on pickup.
                  </p>
                )}
              </section>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="w-full rounded-lg border-2 border-charcoal-brand/25 bg-transparent py-3 text-[15px] font-semibold text-charcoal-brand transition-colors hover:bg-charcoal-brand/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={submitting}
                className="w-full rounded-lg border-2 border-charcoal-brand bg-gold-brand py-3 px-6 text-[15px] font-bold text-charcoal-brand transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
                    Processing…
                  </span>
                ) : (
                  'Confirm & Place Order'
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
