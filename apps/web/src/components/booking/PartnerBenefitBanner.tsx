import { Sparkles, Clock } from 'lucide-react';
import type { PublicPartnerBenefit } from '../../api/partners.js';
import type { AppliedPartnerBenefit } from '../../utils/partnerDiscount.js';
import { describeBenefit } from '../../utils/partnerDiscount.js';

interface Props {
  benefit: PublicPartnerBenefit | null;
  applied: AppliedPartnerBenefit | null;
}

/**
 * Sand-coloured promo banner shown at the top of customer booking pages when
 * the user arrives via a partner referral link. Renders either:
 *   - the active benefit (discount + / free delivery), or
 *   - an advance-days hint when the customer's chosen pickup date is too soon.
 */
export function PartnerBenefitBanner({ benefit, applied }: Props) {
  if (!benefit) return null;

  if (applied?.pendingReason === 'advance_days' && benefit.advanceDiscountDays) {
    return (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-900 sm:px-5">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-[13px] leading-relaxed">
            <p className="font-bold">
              Advance booking required for your <span className="text-amber-800">{benefit.name}</span> rate
            </p>
            <p className="mt-0.5">
              Select a pickup date <b>{benefit.advanceDiscountDays}+ days</b> from today to unlock {describeBenefit(benefit).toLowerCase()}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-brand/30 bg-teal-50 px-4 py-3 text-teal-900 sm:px-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-brand" aria-hidden />
        <div className="text-[13px] leading-relaxed">
          <p className="font-bold">
            You&apos;re booking via <span className="text-teal-brand">{benefit.name}</span>
          </p>
          <p className="mt-0.5 font-medium">{describeBenefit(benefit)}</p>
        </div>
      </div>
    </div>
  );
}
