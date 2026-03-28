import type { BasketItem } from '../../stores/bookingStore.js';
import type { Addon, TransferDetails, PaymentMethod } from './basket-types.js';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';

interface Props {
  basket: BasketItem[];
  rentalDays: number;
  selectedAddonIds: Set<number>;
  addons: Addon[];
  transfer: TransferDetails | null;
  transferAddons: Addon[];
  pickupFee: number;
  dropoffFee: number;
  paymentMethod: PaymentMethod;
  onPaymentChange: (m: PaymentMethod) => void;
  onPlaceOrder: () => void;
  submitting: boolean;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'card', label: 'Credit / Debit Card', icon: '💳' },
  { id: 'gcash', label: 'GCash', icon: '🏦' },
  { id: 'cash', label: 'Cash on Arrival', icon: '💵' },
];

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
  paymentMethod,
  onPaymentChange,
  onPlaceOrder,
  submitting,
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
  const grandTotal = vehicleSubtotal + addonsTotal + transferFee + pickupFee + dropoffFee;

  return (
    <div className="sticky top-24 space-y-8">
      <section className="overflow-hidden rounded-[2.5rem] bg-white shadow-2xl shadow-charcoal-brand/10">
        <div className="p-8">
          <h2 className="mb-8 text-center font-headline text-3xl font-black italic text-teal-brand">
            Booking Summary
          </h2>

          <div className="mb-8 space-y-5">
            <Row label={`Vehicle Subtotal (${rentalDays} Day${rentalDays !== 1 ? 's' : ''})`} amount={vehicleSubtotal} />
            {pickupFee > 0 && <Row label="Delivery Fee" amount={pickupFee} />}
            {dropoffFee > 0 && <Row label="Collection Fee" amount={dropoffFee} />}
            {addonsTotal > 0 && <Row label="Add-ons Total" amount={addonsTotal} />}
            {transferFee > 0 && <Row label="Transfer Fee" amount={transferFee} />}
            {deposit > 0 && <Row label="Refundable Deposit" amount={deposit} muted />}
          </div>

          <div className="mb-8 h-px bg-charcoal-brand/5" />

          <div className="mb-8 flex items-center justify-between">
            <span className="font-headline text-xl font-bold text-charcoal-brand">Grand Total</span>
            <span className="font-headline text-4xl font-black text-teal-brand">
              ₱{grandTotal.toLocaleString()}
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
          {PAYMENT_OPTIONS.map((opt) => {
            const selected = paymentMethod === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl p-5 transition-all duration-300 ${
                  selected
                    ? 'bg-white shadow-sm ring-4 ring-teal-brand/20'
                    : 'bg-sand-brand/30 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={opt.id}
                  checked={selected}
                  onChange={() => onPaymentChange(opt.id)}
                  className="hidden"
                />
                <span className="text-xl">{opt.icon}</span>
                <span className={`flex-1 font-headline font-bold ${selected ? 'text-charcoal-brand' : 'text-charcoal-brand/60'}`}>
                  {opt.label}
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
        ₱{amount.toLocaleString()}
      </span>
    </div>
  );
}
