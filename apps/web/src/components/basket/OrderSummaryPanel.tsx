import type { BasketItem } from '../../stores/bookingStore.js';
import type { Addon, TransferDetails, PaymentMethodOption } from './basket-types.js';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  basket: BasketItem[];
  rentalDays: number;
  selectedAddonIds: Set<number>;
  addons: Addon[];
  transfer: TransferDetails | null;
  transferAddons: Addon[];
  pickupFee: number;
  dropoffFee: number;
  paymentMethodId: string;
  onPaymentChange: (id: string) => void;
  paymentMethods: PaymentMethodOption[];
  surchargePercent: number;
  onPlaceOrder: () => void;
  submitting: boolean;
  priceChanged?: boolean;
}

const PM_ICONS: Record<string, string> = {
  card: '💳',
  gcash: '🏦',
  cash: '💵',
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
  transferAddons,
  pickupFee,
  dropoffFee,
  paymentMethodId,
  onPaymentChange,
  paymentMethods,
  surchargePercent,
  onPlaceOrder,
  submitting,
  priceChanged,
}: Props) {
  const vehicleSubtotal = basket.reduce((sum, b) => sum + b.dailyRate * rentalDays, 0);

  const addonsTotal = addons
    .filter((a) => selectedAddonIds.has(Number(a.id)))
    .reduce((sum, a) => sum + addonCost(a, rentalDays), 0);

  let transferFee = 0;
  if (transfer) {
    const tAddon = transferAddons.find((a) =>
      transfer.transferType === 'shared'
        ? a.name.toLowerCase().includes('shared')
        : a.name.toLowerCase().includes('private') || a.name.toLowerCase().includes('tuk'),
    );
    if (tAddon) {
      transferFee = tAddon.addonType === 'per_day' ? tAddon.pricePerDay : tAddon.priceOneTime;
    }
  }

  const deposit = basket.reduce((sum, b) => sum + (b.securityDeposit ?? 0), 0);
  const subtotalBeforeSurcharge = vehicleSubtotal + addonsTotal + transferFee + pickupFee + dropoffFee;
  const surchargeAmount = surchargePercent > 0
    ? Math.round(subtotalBeforeSurcharge * (surchargePercent / 100) * 100) / 100
    : 0;
  const grandTotal = subtotalBeforeSurcharge + surchargeAmount;

  return (
    <div className="sticky top-24 space-y-8">
      <section className="overflow-hidden rounded-[2.5rem] bg-white shadow-2xl shadow-charcoal-brand/10">
        <div className="p-8">
          <h2 className="mb-8 text-center font-headline text-3xl font-black italic text-teal-brand">
            Booking Summary
          </h2>

          {priceChanged && (
            <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
              Your rental dates changed — we've updated your price
            </div>
          )}

          <div className="mb-4 rounded-2xl bg-sand-brand/60 px-4 py-3 text-center text-sm font-bold text-charcoal-brand/70">
            Rental Duration: <span className="text-teal-brand">{rentalDays} Day{rentalDays !== 1 ? 's' : ''}</span>
          </div>

          <div className="mb-8 space-y-5">
            <Row label={`Vehicle Subtotal (${rentalDays} Day${rentalDays !== 1 ? 's' : ''})`} amount={vehicleSubtotal} />
            {pickupFee > 0 && <Row label="Delivery Fee" amount={pickupFee} />}
            {dropoffFee > 0 && <Row label="Collection Fee" amount={dropoffFee} />}
            {addonsTotal > 0 && <Row label="Add-ons Total" amount={addonsTotal} />}
            {transferFee > 0 && <Row label="Transfer Fee" amount={transferFee} />}
            {surchargeAmount > 0 && (
              <Row label={`Card Surcharge (${surchargePercent}%)`} amount={surchargeAmount} />
            )}
            {deposit > 0 && <Row label="Refundable Deposit" amount={deposit} muted />}
          </div>

          <div className="mb-8 h-px bg-charcoal-brand/5" />

          <div className="mb-8 flex items-center justify-between">
            <span className="font-headline text-xl font-bold text-charcoal-brand">Grand Total</span>
            <span className="font-headline text-4xl font-black text-teal-brand">
              {formatCurrency(grandTotal)}
            </span>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-sand-brand/60 p-4">
            <span className="mt-0.5 text-teal-brand">ℹ️</span>
            <p className="text-xs font-medium leading-relaxed text-charcoal-brand/70">
              Your booking is partially refundable up to 24 hours before pickup. No-shows will be charged the full amount.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[2.5rem] bg-cream-brand p-8 shadow-xl shadow-charcoal-brand/5">
        <h3 className="mb-6 flex items-center gap-2 font-headline text-lg font-black text-teal-brand">
          💳 Payment Method
        </h3>
        <div className="space-y-4">
          {paymentMethods.map((pm) => {
            const selected = paymentMethodId === pm.id;
            return (
              <label
                key={pm.id}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl p-5 transition-all duration-300 ${
                  selected
                    ? 'bg-white shadow-sm ring-4 ring-teal-brand/20'
                    : 'bg-sand-brand/30 hover:bg-white'
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
                <span className="text-xl">{PM_ICONS[pm.id] ?? '💰'}</span>
                <span className={`flex-1 font-headline font-bold ${selected ? 'text-charcoal-brand' : 'text-charcoal-brand/60'}`}>
                  {pm.name}
                  {pm.surchargePercent > 0 && (
                    <span className="ml-2 text-xs font-medium text-charcoal-brand/40">
                      +{pm.surchargePercent}% surcharge
                    </span>
                  )}
                </span>
                <div className={`h-6 w-6 rounded-full border-4 ${
                  selected ? 'border-teal-brand bg-white' : 'border-sand-brand bg-white'
                }`} />
              </label>
            );
          })}
        </div>

        <PrimaryCtaButton
          type="button"
          onClick={onPlaceOrder}
          disabled={submitting}
          className="mt-8 flex w-full items-center justify-center gap-3 py-5 font-headline text-xl font-black"
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
              Processing…
            </span>
          ) : (
            <>🐾 Place Order</>
          )}
        </PrimaryCtaButton>

        <p className="mt-4 text-center text-[10px] font-black uppercase tracking-[0.3em] text-charcoal-brand/40">
          Secure Encrypted Checkout
        </p>
      </section>
    </div>
  );
}

function Row({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-charcoal-brand/80">
      <span className="font-medium">{label}</span>
      <span className={`font-headline font-black ${muted ? 'text-charcoal-brand/50' : ''}`}>
        {formatCurrency(amount)}
      </span>
    </div>
  );
}
