import { Hotel } from 'lucide-react';
import type { PublicPartnerBenefit } from '../../api/partners.js';

interface Props {
  benefit: PublicPartnerBenefit;
}

/**
 * Warm welcome strip shown at the top of the browse/booking page when a guest
 * arrives via a partner referral link (?ref=<slug>).
 *
 * Intentionally does NOT mention the discount or its value here — the benefit
 * is revealed as a "gift" in the basket once the guest has selected dates.
 * This avoids confusion when the advance-days rule hasn't been met yet.
 */
export function PartnerWelcomeCard({ benefit }: Props) {
  const hasAdvanceDays =
    benefit.advanceDiscountDays != null && benefit.advanceDiscountDays > 0;

  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-charcoal-brand/10 bg-white/90 px-4 py-3.5 shadow-sm backdrop-blur-sm sm:gap-4 sm:px-5">
      {/* Partner logo or hotel icon fallback */}
      {benefit.logoUrl ? (
        <img
          src={benefit.logoUrl}
          alt={benefit.name}
          className="h-10 w-auto max-w-[100px] shrink-0 rounded object-contain"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-brand/70">
          <Hotel className="h-5 w-5 text-charcoal-brand/40" aria-hidden />
        </div>
      )}

      {/* Copy */}
      <div className="min-w-0">
        <p className="font-headline text-[14px] font-bold leading-snug text-charcoal-brand sm:text-[15px]">
          Welcome — you&apos;re staying with{' '}
          <span className="text-teal-brand">{benefit.name}</span>. Great choice!
        </p>
        <p className="font-lato mt-0.5 text-[12px] leading-relaxed text-charcoal-brand/55 sm:text-[13px]">
          {hasAdvanceDays
            ? `Book at least ${benefit.advanceDiscountDays} days ahead and we have something special waiting for you at checkout.`
            : 'Your exclusive rate is ready and waiting — complete your booking to unlock it.'}
        </p>
      </div>
    </div>
  );
}
