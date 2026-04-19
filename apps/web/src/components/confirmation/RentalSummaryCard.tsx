import { formatCurrency } from '../../utils/currency.js';
import iconHelmet from '../../assets/Home/Helmet Icon.svg';
import iconFuel from '../../assets/Home/Fuel Icon.svg';
import iconCoat from '../../assets/Home/Coat Icon.svg';
import iconPawCard from '../../assets/Home/Paw Card Icon.svg';
import iconFirstAid from '../../assets/Home/First Aid Icon.svg';
import iconRepairKit from '../../assets/Home/Repair Kit Icon.svg';

const CONFIRMATION_INCLUSIONS: { icon: string; label: string }[] = [
  { icon: iconHelmet, label: 'Helmet' },
  { icon: iconFuel, label: 'Full Tank' },
  { icon: iconCoat, label: 'Rain Coat' },
  { icon: iconPawCard, label: 'Paw Card' },
  { icon: iconFirstAid, label: 'First Aid' },
  { icon: iconRepairKit, label: 'Repair Kit' },
];

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
}

function formatDatetime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ', '
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function RentalSummaryCard({
  vehicleModelName,
  pickupDatetime,
  dropoffDatetime,
  rentalDays,
  grandTotal,
  customerEmail,
  addonNames,
  transferType,
  flightNumber,
  transferRoute,
  transferPrice = 0,
  charityDonation = 0,
}: Props) {
  return (
    <div className="w-full rounded-[2.5rem] bg-cream-brand p-6 text-left shadow-[0_20px_40px_rgba(0,0,0,0.08)]">
      <div className="mb-5 flex items-center gap-3">
        <span className="text-2xl">🏍️</span>
        <h3 className="font-headline text-2xl font-extrabold text-teal-brand">Rental Summary</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-lato text-xl font-extrabold text-charcoal-brand">{vehicleModelName}</p>
          </div>
          <span className="font-lato rounded-full bg-gold-brand px-3 py-1 text-[10px] font-black uppercase tracking-widest text-charcoal-brand">
            Confirmed
          </span>
        </div>

        <div className="rounded-2xl border border-teal-brand/15 bg-sand-brand/50 px-3 py-4">
          <p className="font-lato mb-3 text-center text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">
            What&apos;s included
          </p>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 sm:gap-x-4">
            {CONFIRMATION_INCLUSIONS.map(({ icon, label }) => (
              <div key={label} className="flex w-[4.5rem] flex-col items-center gap-1.5">
                <img src={icon} alt="" className="h-8 w-8 object-contain" width={32} height={32} />
                <span className="font-lato text-center text-[10px] font-semibold leading-tight text-charcoal-brand/85">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-sand-brand/30 p-4">
          <div>
            <p className="font-lato mb-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">
              Pick Up
            </p>
            <p className="font-lato text-sm font-bold text-charcoal-brand">{formatDatetime(pickupDatetime)}</p>
          </div>
          <div className="border-l border-charcoal-brand/10 pl-4">
            <p className="font-lato mb-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">
              Drop Off
            </p>
            <p className="font-lato text-sm font-bold text-charcoal-brand">{formatDatetime(dropoffDatetime)}</p>
          </div>
        </div>

        {rentalDays > 0 && (
          <p className="font-lato text-xs font-bold text-charcoal-brand/50">
            {rentalDays} day{rentalDays !== 1 ? 's' : ''} rental
          </p>
        )}

        {addonNames.length > 0 && (
          <div className="space-y-1">
            <p className="font-lato text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">Add-ons</p>
            <div className="flex flex-wrap gap-2">
              {addonNames.map((n) => (
                <span key={n} className="font-lato rounded-full bg-teal-brand/10 px-3 py-1 text-xs font-bold text-teal-brand">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}

        {transferType && (
          <div className="rounded-2xl border-l-4 border-gold-brand bg-gold-brand/10 p-4 space-y-1">
            <p className="font-lato text-xs font-black uppercase tracking-wider text-charcoal-brand/60">
              Transfer —{' '}
              {transferType === 'shared'
                ? 'Shared Airport Van'
                : transferType === 'tuktuk'
                  ? 'Private TukTuk'
                  : 'Private Airport Van'}
            </p>
            {flightNumber && (
              <p className="font-lato text-sm font-bold text-charcoal-brand">Flight: {flightNumber}</p>
            )}
            {transferRoute && (
              <p className="font-lato text-sm font-bold text-charcoal-brand">Route: {transferRoute}</p>
            )}
            {transferPrice > 0 && (
              <p className="font-lato text-sm font-bold text-charcoal-brand">
                Transfer Total: {formatCurrency(transferPrice)}
              </p>
            )}
          </div>
        )}

        {charityDonation > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-teal-brand/5 px-4 py-3">
            <span className="font-lato text-sm font-bold text-teal-brand">Donation to Be Pawsitive 🐾</span>
            <span className="font-lato text-sm font-bold text-teal-brand">{formatCurrency(charityDonation)}</span>
          </div>
        )}

        <div className="border-t border-charcoal-brand/10 pt-4">
          <p className="font-lato mb-1 text-xs font-bold text-charcoal-brand/50">Grand Total</p>
          <p className="font-headline text-3xl font-black text-teal-brand">
            {formatCurrency(grandTotal)}
          </p>
        </div>

        <div className="flex items-center gap-2 text-charcoal-brand/40">
          <span className="text-teal-brand">✅</span>
          <p className="font-lato text-[10px] italic">Receipt sent to {customerEmail}</p>
        </div>
      </div>
    </div>
  );
}
