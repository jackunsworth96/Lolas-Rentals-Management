import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../../api/client.js';
import { useBookingStore, type BasketItem } from '../../stores/bookingStore.js';
import { HoldCountdown } from '../booking/HoldCountdown.js';
import { resolveImage } from '../../utils/vehicle-images.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  item: BasketItem;
  rentalDays: number;
  pickupLabel: string;
  dropoffLabel: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export function BasketVehicleCard({ item, rentalDays, pickupLabel, dropoffLabel, onToast }: Props) {
  const [removing, setRemoving] = useState(false);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const removeFromBasket = useBookingStore((s) => s.removeFromBasket);

  const imgSrc = resolveImage(item.modelName);
  const subtotal = item.dailyRate * rentalDays;

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.delete(`/public/booking/hold/${item.holdId}`, { sessionToken });
    } catch { /* hold may already be expired */ }
    removeFromBasket(item.holdId);
    onToast(`${item.modelName} removed from basket`, 'success');
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-charcoal-brand/10 bg-white animate-card-enter">
      <div className="relative aspect-[16/9] w-full min-h-0 min-w-0 max-h-48 overflow-hidden rounded-lg bg-white md:max-h-none md:rounded-none">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.modelName}
            className="absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-contain object-center"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl opacity-20">🏍️</span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-medium text-charcoal-brand">{item.modelName}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-charcoal-brand/50">
              <CalendarDays
                className="h-3.5 w-3.5 shrink-0 text-teal-brand/70"
                strokeWidth={2}
                aria-hidden
              />
              <span>
                {pickupLabel} → {dropoffLabel}
              </span>
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-sand-brand px-2.5 py-0.5 text-[11px] font-medium text-charcoal-brand/70">
            {rentalDays} Day{rentalDays !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-charcoal-brand/[0.08] pt-3">
          <p className="text-[13px] text-charcoal-brand/50">
            {formatCurrency(item.dailyRate)}/day
          </p>
          <p className="text-[14px] font-medium text-charcoal-brand">
            {formatCurrency(subtotal)}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <HoldCountdown
            expiresAt={item.expiresAt}
            onExpired={() => {
              removeFromBasket(item.holdId);
              onToast(`${item.modelName} hold expired`, 'error');
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="text-[12px] font-medium text-red-400 transition-colors hover:text-red-600 disabled:opacity-40"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
