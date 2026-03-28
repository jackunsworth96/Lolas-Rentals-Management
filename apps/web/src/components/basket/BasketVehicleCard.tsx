import { useState } from 'react';
import { api } from '../../api/client.js';
import { useBookingStore, type BasketItem } from '../../stores/bookingStore.js';
import { HoldCountdown } from '../booking/HoldCountdown.js';
import hondaBeatImg from '../../assets/Honda Beat Image.png';
import tukTukImg from '../../assets/TukTuk Image.png';

const MODEL_IMAGES: Record<string, string> = {
  'honda-beat': hondaBeatImg,
  'honda beat': hondaBeatImg,
  tuktuk: tukTukImg,
  'tuk-tuk': tukTukImg,
  'tuk tuk': tukTukImg,
};

function resolveImage(modelName: string): string | null {
  const lower = modelName.toLowerCase();
  for (const [key, src] of Object.entries(MODEL_IMAGES)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

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
    <div className="overflow-hidden rounded-[2.5rem] bg-cream-brand shadow-xl shadow-charcoal-brand/5 animate-card-enter">
      <div className="aspect-[16/9] w-full overflow-hidden bg-sand-brand">
        {imgSrc ? (
          <img src={imgSrc} alt={item.modelName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-5xl opacity-30">🏍️</span>
          </div>
        )}
      </div>

      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-headline text-2xl font-black text-teal-brand">{item.modelName}</h3>
            <p className="mt-1 flex items-center text-sm font-bold text-charcoal-brand/60">
              📅 {pickupLabel} → {dropoffLabel}
            </p>
          </div>
          <span className="rounded-full bg-gold-brand px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-charcoal-brand">
            {rentalDays} Day{rentalDays !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-baseline justify-between border-t border-charcoal-brand/5 pt-4">
          <p className="text-sm font-medium text-charcoal-brand/60">
            ₱{item.dailyRate.toLocaleString()}/day
          </p>
          <p className="font-headline text-2xl font-black text-charcoal-brand">
            ₱{subtotal.toLocaleString()}
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
            className="text-xs font-bold text-red-500 transition-opacity duration-200 hover:opacity-70 disabled:opacity-40"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
