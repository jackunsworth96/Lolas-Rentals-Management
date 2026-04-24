import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency.js';
import { RentalIncludedIconsGrid } from '../public/RentalIncludedIconsGrid.js';

interface Props {
  vehicleModelName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDays: number;
  grandTotal: number;
  customerEmail: string;
  addonNames: string[];
  transferType?: 'shared' | 'private' | 'tuktuk' | null;
  flightNumber?: string | null;
  transferRoute?: string | null;
  transferPrice?: number;
  charityDonation?: number;
  calendarUrl?: string | null;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function RentalSummaryCard({
  vehicleModelName,
  pickupDatetime,
  dropoffDatetime,
  rentalDays,
  grandTotal,
  addonNames,
  transferType,
  flightNumber,
  transferRoute,
  transferPrice = 0,
  charityDonation = 0,
  calendarUrl,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col rounded-2xl bg-white p-6 shadow-sm text-left">

      {/* Header label */}
      <p className="mb-4 text-xs font-black uppercase tracking-widest text-charcoal-brand/50 font-lato">
        {t('confirmation.rentalSummary')}
      </p>

      {/* Vehicle name + badge */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-lato text-xl font-extrabold text-charcoal-brand leading-tight">{vehicleModelName}</p>
        <span className="shrink-0 rounded-full bg-gold-brand px-3 py-1 text-[10px] font-black uppercase tracking-widest text-charcoal-brand">
          {t('confirmation.confirmed')}
        </span>
      </div>
      <p className="mb-5 text-sm text-charcoal-brand/50 font-lato">Lola's Rentals Store</p>

      {/* What's included */}
      <div className="mb-5">
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-charcoal-brand/50 font-lato">
          {t('browse.whatsIncluded')}
        </p>
        <div className="rounded-xl border border-charcoal-brand/8 bg-sand-brand/30 px-3 py-4">
          <RentalIncludedIconsGrid variant="card" showOptionals={false} />
        </div>
      </div>

      {/* Pickup / dropoff */}
      <div className="mb-1 grid grid-cols-2 gap-4 border-t border-charcoal-brand/8 pt-5">
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50 font-lato">
            {t('common.pickUp')}
          </p>
          <p className="font-lato text-base font-extrabold text-charcoal-brand leading-tight">{formatDate(pickupDatetime)}</p>
          <p className="font-lato text-sm font-bold text-charcoal-brand/60">{formatTime(pickupDatetime)}</p>
        </div>
        <div className="border-l border-charcoal-brand/8 pl-4">
          <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50 font-lato">
            {t('common.dropOff')}
          </p>
          <p className="font-lato text-base font-extrabold text-charcoal-brand leading-tight">{formatDate(dropoffDatetime)}</p>
          <p className="font-lato text-sm font-bold text-charcoal-brand/60">{formatTime(dropoffDatetime)}</p>
        </div>
      </div>

      {/* Add to Calendar link */}
      {calendarUrl && (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-gold-brand hover:underline font-lato"
        >
          <span>📅</span> + {t('common.addToCalendar')}
        </a>
      )}

      {/* Add-ons */}
      {addonNames.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50 font-lato">{t('common.addOns')}</p>
          <div className="flex flex-wrap gap-2">
            {addonNames.map((n) => (
              <span key={n} className="rounded-full bg-teal-brand/10 px-3 py-1 text-xs font-bold text-teal-brand font-lato">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Transfer */}
      {transferType && (
        <div className="mb-4 rounded-xl border-l-4 border-gold-brand bg-gold-brand/10 p-4 space-y-1">
          <p className="text-xs font-black uppercase tracking-wider text-charcoal-brand/60 font-lato">
            {t('common.transfer')} —{' '}
            {transferType === 'shared' ? t('common.sharedAirportVan') : transferType === 'tuktuk' ? t('common.privateTukTuk') : t('common.privateAirportVan')}
          </p>
          {flightNumber && <p className="text-sm font-bold text-charcoal-brand font-lato">{t('common.flight')}: {flightNumber}</p>}
          {transferRoute && <p className="text-sm font-bold text-charcoal-brand font-lato">{t('common.route')}: {transferRoute}</p>}
          {transferPrice > 0 && (
            <p className="text-sm font-bold text-charcoal-brand font-lato">{t('common.transferTotal')}: {formatCurrency(transferPrice)}</p>
          )}
        </div>
      )}

      {/* Charity */}
      {charityDonation > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-teal-brand/5 px-4 py-3">
          <span className="text-sm font-bold text-teal-brand font-lato">{t('common.donationToBePawsitive')} 🐾</span>
          <span className="text-sm font-bold text-teal-brand font-lato">{formatCurrency(charityDonation)}</span>
        </div>
      )}

      {/* Rental days + Grand Total — pinned to bottom */}
      <div className="mt-auto border-t border-charcoal-brand/8 pt-4">
        {rentalDays > 0 && (
          <p className="mb-3 text-xs font-bold text-charcoal-brand/50 font-lato">
            {t('common.rentalDays', { count: rentalDays })}
          </p>
        )}
        <div className="flex items-end justify-between gap-4">
          <p className="text-xs font-black uppercase tracking-widest text-charcoal-brand/50 font-lato">{t('common.grandTotal')}</p>
          <p className="font-headline text-4xl font-black text-charcoal-brand">
            {formatCurrency(grandTotal)}
          </p>
        </div>
      </div>

    </div>
  );
}
