import { Banknote, CreditCard, Gift, Hotel, Landmark, Lock, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BasketItem } from '../../stores/bookingStore.js';
import type { Addon, TransferDetails, PaymentMethodOption } from './basket-types.js';
import type { PublicPartnerBenefit } from '../../api/partners.js';
import type { AppliedPartnerBenefit } from '../../utils/partnerDiscount.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { PesoSign } from '../ui/PesoSign.js';
import { getIncludedItemsForModel } from '../../data/home-included-rental-items.js';

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
  /** Active partner referral benefit, when ?ref= was captured. */
  partnerBenefit?: PublicPartnerBenefit | null;
  partnerBenefitApplied?: AppliedPartnerBenefit | null;
  partnerFreeDeliveryLocationNames?: string[];
}

const PM_ICON_CLASS = 'h-5 w-5 shrink-0 text-charcoal-brand/85';

const CHARITY_DONATION_PRESETS: Array<{ amount: number; label?: ReactNode }> = [
  { amount: 0, label: 'No thanks' },
  { amount: 100 },
  { amount: 500 },
  { amount: 1000 },
  { amount: 5000, label: <><PesoSign />5,000 🐾</> },
];

/** Match API ids/names (DB may use `Card` vs `card`, etc.) */
function PaymentMethodIcon({ id, name }: { id: string; name: string }) {
  const norm = id.toLowerCase().replace(/[\s-]+/g, '_');
  const nameLower = name.toLowerCase();
  const props = {
    className: PM_ICON_CLASS,
    size: 20,
    strokeWidth: 2 as const,
    'aria-hidden': true as const,
  };

  if (norm.includes('gcash') || nameLower.includes('gcash')) {
    return <Wallet {...props} />;
  }
  if (norm.includes('bank') || nameLower.includes('bank')) {
    return <Landmark {...props} />;
  }
  if (norm.includes('card') || nameLower.includes('credit') || nameLower.includes('debit')) {
    return <CreditCard {...props} />;
  }
  if (norm === 'cash' || norm.includes('cash')) {
    return <Banknote {...props} />;
  }

  return <Wallet {...props} />;
}

function addonCost(addon: Addon, days: number): number {
  if (addon.addonType === 'per_day') return addon.pricePerDay * days;
  return addon.priceOneTime;
}

function partnerHasFreeDeliveryOffer(benefit: PublicPartnerBenefit | null) {
  if (!benefit) return false;
  return Boolean(
    benefit.freeDelivery ||
    benefit.dealType === 'free_delivery' ||
    benefit.dealType === 'combined' ||
    benefit.dealType === 'commission_delivery' ||
    benefit.dealType === 'discount_delivery',
  );
}

function formatFreeDeliveryLocations(names: string[]) {
  if (names.length === 0) return 'an eligible delivery or collection location';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
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
  partnerBenefit = null,
  partnerBenefitApplied = null,
  partnerFreeDeliveryLocationNames = [],
}: Props) {
  const vehicleSubtotal = basket.reduce((sum, b) => sum + b.dailyRate * rentalDays, 0);

  const addonsTotal = addons
    .filter((a) => selectedAddonIds.has(Number(a.id)))
    .reduce((sum, a) => sum + addonCost(a, rentalDays), 0) * vehicleCount;

  const transferFee = transfer?.totalPrice ?? 0;

  const deposit = basket.reduce((sum, b) => sum + (b.securityDeposit ?? 0), 0);

  // Apply partner benefit (if eligible) to rental subtotal + delivery fees
  const applied = partnerBenefitApplied?.applied ?? false;
  const rentalDiscount = applied ? (partnerBenefitApplied?.rentalDiscount ?? 0) : 0;
  const freeDelivery = applied && (partnerBenefitApplied?.freeDelivery ?? false);
  const freeDeliveryOffer = partnerHasFreeDeliveryOffer(partnerBenefit);
  const freeDeliveryLocationLabel = formatFreeDeliveryLocations(partnerFreeDeliveryLocationNames);
  const hasRentalDiscount = rentalDiscount > 0;
  const hasVisiblePartnerBenefit = hasRentalDiscount || freeDelivery || (partnerBenefitApplied?.earlyBird ?? false);
  const appliedPartnerTitle = freeDelivery && !hasRentalDiscount
    ? `${partnerBenefit?.name ?? 'Your partner'} has organised free delivery and collection`
    : partnerBenefitApplied?.earlyBird
      ? `Early bird rate applied — ${partnerBenefit?.name ?? 'Partner'}`
      : `Your ${partnerBenefit?.name ?? 'partner'} rate is applied`;
  const appliedPartnerMessage = freeDelivery && !hasRentalDiscount
    ? partnerFreeDeliveryLocationNames.length > 0
      ? `Free delivery and collection have been applied for ${freeDeliveryLocationLabel}.`
      : 'Free delivery and collection have been applied to this booking.'
    : partnerBenefitApplied?.earlyBird
      ? 'You planned way ahead — this is our best thank you for it.'
      : 'Enjoy your exclusive discount — a little thank you for planning ahead.';
  const discountedVehicleSubtotal = Math.max(0, vehicleSubtotal - rentalDiscount);
  const effectivePickupFee = freeDelivery ? 0 : pickupFee;
  const effectiveDropoffFee = freeDelivery ? 0 : dropoffFee;
  const deliveryDiscount = freeDelivery ? pickupFee + dropoffFee : 0;

  const subtotalBeforeSurcharge =
    discountedVehicleSubtotal + addonsTotal + transferFee + effectivePickupFee + effectiveDropoffFee;
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

        {/* ── Partner gift reveal ── */}
        {partnerBenefit && applied && hasVisiblePartnerBenefit && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-teal-200/70 bg-teal-50 px-3 py-3">
            {partnerBenefit.logoUrl ? (
              <img
                src={partnerBenefit.logoUrl}
                alt={partnerBenefit.name}
                className="mt-0.5 h-8 w-auto max-w-[72px] shrink-0 rounded object-contain"
              />
            ) : null}
            <div>
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-teal-800">
                <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {appliedPartnerTitle}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-teal-700/80">
                {appliedPartnerMessage}
              </p>
            </div>
          </div>
        )}
        {partnerBenefit && freeDeliveryOffer && !freeDelivery && !hasRentalDiscount && partnerBenefitApplied?.pendingReason !== 'advance_days' && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-teal-200/70 bg-teal-50 px-3 py-3">
            {partnerBenefit.logoUrl ? (
              <img
                src={partnerBenefit.logoUrl}
                alt={partnerBenefit.name}
                className="mt-0.5 h-8 w-auto max-w-[72px] shrink-0 rounded object-contain"
              />
            ) : null}
            <div>
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-teal-800">
                <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {partnerBenefit.name} has organised free delivery and collection for you
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-teal-700/80">
                Select {freeDeliveryLocationLabel} to claim this benefit.
              </p>
            </div>
          </div>
        )}
        {partnerBenefit && partnerBenefitApplied?.pendingReason === 'advance_days' && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-charcoal-brand/10 bg-sand-brand/40 px-3 py-3">
            {partnerBenefit.logoUrl ? (
              <img
                src={partnerBenefit.logoUrl}
                alt={partnerBenefit.name}
                className="mt-0.5 h-8 w-auto max-w-[72px] shrink-0 rounded object-contain"
              />
            ) : null}
            <div>
              <p className="text-[12px] font-bold text-charcoal-brand">
                You&apos;re booking via {partnerBenefit.name}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-charcoal-brand/60">
                Your exclusive rate applies to bookings made{' '}
                {partnerBenefit.advanceDiscountDays}+ days in advance — this one is at our standard
                rate. We hope to see you again with more notice!
              </p>
            </div>
          </div>
        )}

        {/* Duration pill */}
        <div className="mb-4 inline-flex items-center rounded-full bg-sand-brand px-3 py-1 text-[12px] text-charcoal-brand/70">
          Rental Duration:&nbsp;<span className="font-medium text-charcoal-brand">{rentalDays} Day{rentalDays !== 1 ? 's' : ''}</span>
        </div>

        {/* NGO Donation banner */}
        <div className="mb-4 rounded-lg border border-teal-200/60 bg-teal-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-teal-800">
            {'\u{1F43E}'} Support Local NGOs
          </p>
          <p className="mb-2.5 text-[11px] leading-relaxed text-teal-700/80">
            Add a small donation to fund animal welfare and community programmes on Siargao.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CHARITY_DONATION_PRESETS.map(({ amount, label }) => {
              const selected = charityDonation === amount;
              const isFiveK = amount === 5000;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onCharityChange?.(amount)}
                  className={[
                    'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                    selected
                      ? 'bg-teal-600 text-white'
                      : isFiveK
                        ? 'border border-teal-brand bg-sand-brand text-teal-brand hover:bg-sand-brand/90'
                        : 'border border-teal-200 bg-white text-teal-700 hover:bg-teal-50',
                  ].join(' ')}
                >
                  {label ?? <><PesoSign />{amount.toLocaleString()}</>}
                </button>
              );
            })}
          </div>
          <Link
            to="/book/impact"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-block font-lato text-sm text-teal-brand underline decoration-teal-brand/35 underline-offset-2 transition-colors hover:text-[#00496a]"
          >
            See where your donation goes →
          </Link>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          {basket.map((b) => (
            <Row
              key={b.holdId}
              label={`${b.modelName} × ${rentalDays} day${rentalDays !== 1 ? 's' : ''}`}
              amount={b.dailyRate * rentalDays}
            />
          ))}
          {pickupFee > 0 && (
            <Row
              label={vehicleCount > 1 ? `Pick-up fee (×${vehicleCount})` : 'Pick-up fee'}
              amount={pickupFee}
            />
          )}
          {dropoffFee > 0 && (
            <Row
              label={vehicleCount > 1 ? `Return fee (×${vehicleCount})` : 'Return fee'}
              amount={dropoffFee}
            />
          )}
          {addonsTotal > 0 && <Row label={vehicleCount > 1 ? `Add-ons Total (×${vehicleCount})` : 'Add-ons Total'} amount={addonsTotal} />}
          {transferFee > 0 && <Row label="Transfer Fee" amount={transferFee} />}
          {applied && rentalDiscount > 0 && (
            <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-teal-200 pt-2">
              <span className="min-w-0 text-[13px] font-medium text-teal-700">
                {partnerBenefitApplied?.earlyBird ? 'Early bird rate' : `${partnerBenefit?.name ?? 'Partner'} rate`}
              </span>
              <span className="shrink-0 text-[14px] font-semibold text-teal-700">
                −<PesoSign />{formatPhpNumber(rentalDiscount)}
              </span>
            </div>
          )}
          {applied && deliveryDiscount > 0 && (
            <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-teal-200 pt-2">
              <span className="min-w-0 text-[13px] font-medium text-teal-700">
                Free delivery/collection
              </span>
              <span className="shrink-0 text-[14px] font-semibold text-teal-700">
                −<PesoSign />{formatPhpNumber(deliveryDiscount)}
              </span>
            </div>
          )}
          {surchargeAmount > 0 && (
            <Row label={`Card Surcharge (${surchargePercent}%)`} amount={surchargeAmount} />
          )}
          {charityDonation > 0 && <Row label={'Donation to Local NGOs \u{1F43E}'} amount={charityDonation} />}
        </div>

        {/* Divider + Grand Total */}
        <div className="mt-4 border-t border-charcoal-brand/10 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-medium text-charcoal-brand">Grand Total</span>
            <span className="text-[22px] font-medium text-teal-brand"><PesoSign />{formatPhpNumber(grandTotal)}</span>
          </div>
          {deposit > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-charcoal-brand/40">
              <span>{'\u2139\uFE0F'}</span>
              <span>
                Refundable security deposit of <PesoSign />{formatPhpNumber(deposit)} collected on pickup — returned after your rental.
              </span>
            </p>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-charcoal-brand/45">
            <a
              href="/refund-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-brand underline decoration-teal-brand/35 underline-offset-2 transition-colors hover:text-[#00496a]"
            >
              Refund &amp; cancellation policy
            </a>
            <span className="text-charcoal-brand/40"> (new tab — your cart is kept here)</span>
          </p>
        </div>
      </div>

      {/* ── What's Included ── */}
      {basket.length > 0 && (() => {
        const primaryModel = basket[0].modelName;
        const items = getIncludedItemsForModel(primaryModel);
        return (
          <div className="border-t border-charcoal-brand/10 px-5 py-4 md:px-6">
            <p className="font-lato mb-3 text-center text-[9px] font-black uppercase tracking-wider text-charcoal-brand/50">
              What&apos;s included
            </p>
            <div className="flex flex-wrap justify-around gap-x-2 gap-y-3">
              {items.map(({ icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <img src={icon} alt={label} className="h-7 w-7 object-contain" width={28} height={28} />
                  <span className="font-lato text-center text-[9px] font-semibold leading-tight text-charcoal-brand/70">{label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
                <PaymentMethodIcon id={pm.id} name={pm.name} />
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
        <p className="mt-3 text-[12px] text-charcoal-brand/50 font-lato text-center">
          {'\u{1F4B3}'} Card payments coming soon — we&apos;re still setting things up!
        </p>
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
            'Place Order'
          )}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-charcoal-brand/40">
          <Lock className="h-3.5 w-3.5 shrink-0 text-charcoal-brand/50" strokeWidth={2.25} aria-hidden />
          <span>Secure encrypted checkout</span>
        </p>
      </div>
    </div>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-[13px] text-charcoal-brand/60">{label}</span>
      <span className="shrink-0 text-[14px] font-medium text-charcoal-brand"><PesoSign />{formatPhpNumber(amount)}</span>
    </div>
  );
}

interface RowDiscountableProps {
  label: string;
  originalAmount: number;
  amount: number;
  strike: boolean;
  freeLabel?: string;
}

function RowDiscountable({ label, originalAmount, amount, strike, freeLabel }: RowDiscountableProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-[13px] text-charcoal-brand/60">{label}</span>
      {strike ? (
        <span className="shrink-0 flex items-baseline gap-2">
          <span className="text-[12px] font-medium text-charcoal-brand/40 line-through">
            <PesoSign />{formatPhpNumber(originalAmount)}
          </span>
          <span className="text-[14px] font-semibold text-teal-brand">
            {amount === 0 && freeLabel
              ? freeLabel
              : <><PesoSign />{formatPhpNumber(amount)}</>}
          </span>
        </span>
      ) : (
        <span className="shrink-0 text-[14px] font-medium text-charcoal-brand"><PesoSign />{formatPhpNumber(amount)}</span>
      )}
    </div>
  );
}
