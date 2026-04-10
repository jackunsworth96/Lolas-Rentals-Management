import type { BasketItem } from '../../stores/bookingStore.js';
import type { Addon, TransferDetails, PaymentMethodOption } from './basket-types.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  basket: BasketItem[];
  rentalDays: number;
  selectedAddonIds: Set<number>;
  addons: Addon[];
  transfer: TransferDetails | null;
  pickupFee: number;
  dropoffFee: number;
  paymentMethodId: string;
  onPaymentChange: (id: string) => void;
  paymentMethods: PaymentMethodOption[];
  surchargePercent: number;
  onPlaceOrder: () => void;
  submitting: boolean;
  paymentMethodError?: string;
  /** When false, Place Order is disabled (no valid payment method selected). */
  canPlaceOrder?: boolean;
  priceChanged?: boolean;
  charityDonation?: number;
  onCharityChange?: (amount: number) => void;
  /** When false (mobile), primary button opens review sheet instead of submitting. */
  isMdUp: boolean;
  onOpenMobileReview?: () => void;
  vehicleCount?: number;
}

const PM_ICONS: Record<string, string> = {
  card: '💳',
  gcash: '📱',
  cash: '💵',
  bank_transfer: '🏦',
};

function addonCost(addon: Addon, days: number): number {
  if (addon.addonType === 'per_day') return addon.pricePerDay * days;
  return addon.priceOneTime;
}

export function OrderSummaryPanel({
  basket,
  rentalDays,
  selectedAddonIds,
  addons,
  transfer,
  pickupFee,
  dropoffFee,
  paymentMethodId,
  onPaymentChange,
  paymentMethods,
  surchargePercent,
  onPlaceOrder,
  submitting,
  paymentMethodError = '',
  canPlaceOrder = true,
  priceChanged,
  charityDonation = 0,
  onCharityChange,
  isMdUp,
  onOpenMobileReview,
  vehicleCount = 1,
}: Props) {
  const vehicleSubtotal = basket.reduce((sum, b) => sum + b.dailyRate * rentalDays, 0);

  const addonsTotal = addons
    .filter((a) => selectedAddonIds.has(Number(a.id)))
    .reduce((sum, a) => sum + addonCost(a, rentalDays), 0);

  const transferFee = transfer?.totalPrice ?? 0;

  const deposit = basket.reduce((sum, b) => sum + (b.securityDeposit ?? 0), 0);
  const subtotalBeforeSurcharge = vehicleSubtotal + addonsTotal + transferFee + pickupFee + dropoffFee;
  const surchargeAmount = surchargePercent > 0
    ? Math.round(subtotalBeforeSurcharge * (surchargePercent / 100) * 100) / 100
    : 0;
  const grandTotal = subtotalBeforeSurcharge + surchargeAmount + charityDonation;

  return (
    <div className="sticky top-6 overflow-hidden rounded-xl border border-charcoal-brand/10 bg-white">

      {/* ── Booking Summary ── */}
      <div className="p-5 md:p-6">
        <h2 className="mb-4 text-[15px] font-medium text-charcoal-brand">Booking Summary</h2>

        {priceChanged && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
            Your rental dates changed — prices have been updated.
          </div>
        )}

        {/* Duration pill */}
        <div className="mb-4 inline-flex items-center rounded-full bg-sand-brand px-3 py-1 text-[12px] text-charcoal-brand/70">
          Rental Duration:&nbsp;<span className="font-medium text-charcoal-brand">{rentalDays} Day{rentalDays !== 1 ? 's' : ''}</span>
        </div>

        {/* Be Pawsitive donation banner */}
        <div className="mb-4 rounded-lg border border-teal-200/60 bg-teal-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-teal-800">
            🐾 Support Be Pawsitive
          </p>
          <p className="mb-2.5 text-[11px] leading-relaxed text-teal-700/80">
            Add a small donation to fund spay, neuter &amp; vaccination for Siargao's street animals.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[0, 50, 100, 200].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => onCharityChange?.(amount)}
                className={[
                  'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                  charityDonation === amount
                    ? 'bg-teal-600 text-white'
                    : 'border border-teal-200 bg-white text-teal-700 hover:bg-teal-50',
                ].join(' ')}
              >
                {amount === 0 ? 'No thanks' : `₱${amount}`}
              </button>
            ))}
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <Row label={`Vehicle Subtotal (${rentalDays} Day${rentalDays !== 1 ? 's' : ''})`} amount={vehicleSubtotal} />
          {pickupFee > 0 && (
            <Row label={vehicleCount > 1 ? `Delivery Fee (×${vehicleCount})` : 'Delivery Fee'} amount={pickupFee} />
          )}
          {dropoffFee > 0 && (
            <Row label={vehicleCount > 1 ? `Collection Fee (×${vehicleCount})` : 'Collection Fee'} amount={dropoffFee} />
          )}
          {addonsTotal > 0 && <Row label="Add-ons Total" amount={addonsTotal} />}
          {transferFee > 0 && <Row label="Transfer Fee" amount={transferFee} />}
          {surchargeAmount > 0 && (
            <Row label={`Card Surcharge (${surchargePercent}%)`} amount={surchargeAmount} />
          )}
          {charityDonation > 0 && <Row label="Donation to Be Pawsitive 🐾" amount={charityDonation} />}
        </div>

        {/* Divider + Grand Total */}
        <div className="mt-4 border-t border-charcoal-brand/10 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-medium text-charcoal-brand">Grand Total</span>
            <span className="text-[22px] font-medium text-teal-brand">{formatCurrency(grandTotal)}</span>
          </div>
          {deposit > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-charcoal-brand/40">
              <span>ℹ️</span>
              <span>
                Refundable security deposit of {formatCurrency(deposit)} collected on pickup — returned after your rental.
              </span>
            </p>
          )}
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-charcoal-brand/40">
            <span>ℹ️</span>
            <span>Partially refundable up to 24 hours before pickup. No-shows charged in full.</span>
          </p>
        </div>
      </div>

      {/* ── Payment Method ── */}
      <div className="border-t border-charcoal-brand/10 px-5 py-5 md:px-6">
        <h3 className="mb-3 text-[15px] font-medium text-charcoal-brand">Payment Method</h3>
        <div className="overflow-hidden rounded-lg border border-charcoal-brand/10 divide-y divide-charcoal-brand/[0.08]">
          {paymentMethods.map((pm) => {
            const selected = paymentMethodId === pm.id;
            return (
              <label
                key={pm.id}
                className={`flex cursor-pointer items-center gap-3 border-l-[3px] py-3 pl-[13px] pr-4 transition-colors ${
                  selected
                    ? 'border-l-teal-brand bg-teal-50/60'
                    : 'border-l-transparent hover:bg-sand-brand/30'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={pm.id}
                  checked={selected}
                  onChange={() => onPaymentChange(pm.id)}
                  className="sr-only"
                />
                <span className="text-base">{PM_ICONS[pm.id] ?? '💰'}</span>
                <span className="flex-1 text-[13px] font-medium text-charcoal-brand">
                  {pm.name}
                  {pm.surchargePercent > 0 && (
                    <span className="ml-1.5 rounded-full bg-charcoal-brand/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-charcoal-brand/50">
                      +{pm.surchargePercent}% surcharge
                    </span>
                  )}
                </span>
                {/* Custom radio indicator */}
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  selected ? 'border-teal-brand bg-teal-brand' : 'border-charcoal-brand/20 bg-white'
                }`}>
                  {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
              </label>
            );
          })}
        </div>
        {(paymentMethodError || (paymentMethods.length > 0 && !canPlaceOrder)) && (
          <p
            className={`mt-3 text-[13px] font-medium ${paymentMethodError ? 'text-red-600' : 'text-charcoal-brand/70'}`}
            role={paymentMethodError ? 'alert' : 'status'}
          >
            {paymentMethodError || 'Please select a payment method to continue.'}
          </p>
        )}
      </div>

      {/* ── Place Order ── */}
      <div className="border-t border-charcoal-brand/10 px-5 pb-5 pt-4 md:px-6">
        <button
          type="button"
          onClick={() => {
            if (isMdUp) onPlaceOrder();
            else onOpenMobileReview?.();
          }}
          disabled={submitting || !canPlaceOrder}
          className="w-full rounded-lg bg-teal-brand py-[13px] text-[15px] font-medium text-white transition-colors hover:bg-[#00496a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Processing…
            </span>
          ) : (
            '🐾  Place Order'
          )}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-charcoal-brand/40">
          🔒 Secure encrypted checkout
        </p>
      </div>
    </div>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] text-charcoal-brand/60">{label}</span>
      <span className="text-[14px] font-medium text-charcoal-brand">{formatCurrency(amount)}</span>
    </div>
  );
}
