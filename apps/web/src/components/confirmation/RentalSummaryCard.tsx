import { formatCurrency } from '../../utils/currency.js';

interface Props {
  vehicleModelName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDays: number;
  grandTotal: number;
  depositAmount: number;
  customerEmail: string;
  addonNames: string[];
  transferType?: 'shared' | 'private' | null;
  flightNumber?: string | null;
  transferRoute?: string | null;
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
  depositAmount,
  customerEmail,
  addonNames,
  transferType,
  flightNumber,
  transferRoute,
  charityDonation = 0,
}: Props) {
  return (
    <div className="w-full rounded-[2.5rem] bg-cream-brand p-8 text-left shadow-[0_20px_40px_rgba(0,0,0,0.08)]">
      <div className="mb-8 flex items-center gap-3">
        <span className="text-2xl">🏍️</span>
        <h3 className="font-headline text-2xl font-extrabold text-teal-brand">Rental Summary</h3>
      </div>

      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xl font-extrabold text-charcoal-brand">{vehicleModelName}</p>
          </div>
          <span className="rounded-full bg-gold-brand px-3 py-1 text-[10px] font-black uppercase tracking-widest text-charcoal-brand">
            Confirmed
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-2xl bg-sand-brand/30 p-5">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">
              Pick Up
            </p>
            <p className="text-sm font-bold text-charcoal-brand">{formatDatetime(pickupDatetime)}</p>
          </div>
          <div className="border-l border-charcoal-brand/10 pl-4">
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">
              Drop Off
            </p>
            <p className="text-sm font-bold text-charcoal-brand">{formatDatetime(dropoffDatetime)}</p>
          </div>
        </div>

        {rentalDays > 0 && (
          <p className="text-xs font-bold text-charcoal-brand/50">
            {rentalDays} day{rentalDays !== 1 ? 's' : ''} rental
          </p>
        )}

        {addonNames.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-charcoal-brand/50">Add-ons</p>
            <div className="flex flex-wrap gap-2">
              {addonNames.map((n) => (
                <span key={n} className="rounded-full bg-teal-brand/10 px-3 py-1 text-xs font-bold text-teal-brand">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}

        {transferType && (
          <div className="rounded-2xl border-l-4 border-gold-brand bg-gold-brand/10 p-4 space-y-1">
            <p className="text-xs font-black uppercase tracking-wider text-charcoal-brand/60">
              Transfer — {transferType === 'shared' ? 'Shared Airport' : 'Private TukTuk'}
            </p>
            {flightNumber && (
              <p className="text-sm font-bold text-charcoal-brand">Flight: {flightNumber}</p>
            )}
            {transferRoute && (
              <p className="text-sm font-bold text-charcoal-brand">Route: {transferRoute}</p>
            )}
          </div>
        )}

        {charityDonation > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-teal-brand/5 px-4 py-3">
            <span className="text-sm font-bold text-teal-brand">Donation to BePawsitive 🐾</span>
            <span className="text-sm font-bold text-teal-brand">{formatCurrency(charityDonation)}</span>
          </div>
        )}

        <div className="flex items-end justify-between border-t border-charcoal-brand/10 pt-6">
          <div>
            <p className="mb-1 text-xs font-bold text-charcoal-brand/50">Grand Total</p>
            <p className="font-headline text-3xl font-black text-teal-brand">
              {formatCurrency(grandTotal)}
            </p>
          </div>
          {depositAmount > 0 && (
            <div className="text-right">
              <p className="mb-1 text-xs font-bold text-charcoal-brand/50">Refundable Deposit</p>
              <p className="font-headline text-lg font-black text-charcoal-brand/70">
                {formatCurrency(depositAmount)}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-charcoal-brand/40">
          <span className="text-teal-brand">✅</span>
          <p className="text-[10px] italic">Receipt sent to {customerEmail}</p>
        </div>
      </div>
    </div>
  );
}
